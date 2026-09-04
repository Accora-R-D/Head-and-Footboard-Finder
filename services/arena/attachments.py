"""Retrieval of the released drawing PDF from Arena.

CLAUDE.md 4.8 governs this module:

  * Retrieve the PDF from Arena; never regenerate it from Onshape.
  * Never serve an unreleased or in-work document through the standard path.
  * Never modify, re-render, re-stamp, or watermark a released PDF.
  * If an item is released but no PDF is available, report the fault rather
    than substituting a drawing from anywhere else.
"""

from __future__ import annotations

from typing import Any

from .client import ArenaClient
from .errors import (
    AmbiguousPdfError,
    ItemNotReleasedError,
    NoReleasedPdfError,
)
from .models import Attachment, Item, ReleasedDocument


class AttachmentService:
    def __init__(self, client: ArenaClient) -> None:
        self.client = client
        self.config = client.config

    def list_attachments(self, item: Item) -> list[Attachment]:
        payload = self.client.get_json("item_files", item_guid=item.guid)
        return [_to_attachment(entry) for entry in _file_entries(payload)]

    def get_released_pdf(
        self,
        item: Item,
        *,
        allow_unreleased: bool = False,
    ) -> ReleasedDocument:
        """Fetch the released drawing PDF for an item.

        `allow_unreleased` exists only for the role-gated historical view. It is
        never the default and must not be reachable from the standard item route.
        """
        if not allow_unreleased and not self.config.is_released(item.lifecycle_state):
            raise ItemNotReleasedError(item.number, item.lifecycle_state)

        attachment = self._select_pdf(item)
        content, content_type = self.client.get_bytes(
            "file_content", file_guid=attachment.file_id
        )

        if not content:
            raise NoReleasedPdfError(
                f"Arena returned an empty file for {attachment.name} on item "
                f"{item.number}. Report this as a data fault; do not substitute "
                f"another drawing."
            )

        return ReleasedDocument(
            item_number=item.number,
            revision=item.revision,
            lifecycle_state=item.lifecycle_state,
            file_name=attachment.name,
            mime_type=content_type or attachment.mime_type,
            content=content,  # passed through byte for byte
            is_current_revision=self.config.is_released(item.lifecycle_state),
        )

    def _select_pdf(self, item: Item) -> Attachment:
        """Choose the drawing PDF among an item's attachments.

        Where an item carries several PDFs and no drawing_category is
        configured, this raises rather than guessing. CLAUDE.md leaves the
        choice as an open decision, and picking one silently is exactly the
        failure mode the instructions warn about.
        """
        attachments = self.list_attachments(item)
        pdfs = [
            a
            for a in attachments
            if a.mime_type.lower() in {m.lower() for m in self.config.pdf_mime_types}
        ]

        if not pdfs:
            raise NoReleasedPdfError(
                f"Item {item.number} is released at revision {item.revision} but "
                f"carries no PDF attachment "
                f"({len(attachments)} file(s) found). Report this as a data fault."
            )

        if len(pdfs) == 1:
            return pdfs[0]

        category = self.config.drawing_category
        if category:
            matching = [a for a in pdfs if a.category == category]
            if len(matching) == 1:
                return matching[0]
            if not matching:
                raise NoReleasedPdfError(
                    f"Item {item.number} has {len(pdfs)} PDFs, none in the "
                    f"configured drawing category {category!r}."
                )

        raise AmbiguousPdfError(item.number, [a.name for a in pdfs])


def _file_entries(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("results", "files", "items", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def _to_attachment(entry: dict[str, Any]) -> Attachment:
    return Attachment(
        file_id=str(entry.get("guid") or entry.get("id") or ""),
        name=str(entry.get("name") or entry.get("title") or ""),
        mime_type=str(entry.get("mimeType") or entry.get("contentType") or ""),
        category=str(
            entry.get("category", {}).get("name")
            if isinstance(entry.get("category"), dict)
            else entry.get("category") or ""
        ),
        size_bytes=entry.get("size"),
    )
