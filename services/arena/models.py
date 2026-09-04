"""Value types returned by the Arena service.

These are deliberately plain. They carry what CLAUDE.md requires a user to see
alongside any document — part number, revision, lifecycle state — and they keep
units attached to every dimensional value.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Dimension:
    """A dimensional value with its unit.

    CLAUDE.md Units: a bare number is never acceptable, and a unit is never
    inferred from what most models happen to use.
    """

    value: float
    unit: str

    def __post_init__(self) -> None:
        if not self.unit:
            raise ValueError("A Dimension must carry an explicit unit")

    def __str__(self) -> str:
        return f"{self.value:g} {self.unit}"


@dataclass(frozen=True)
class Attachment:
    """A file held against an Arena item."""

    file_id: str
    name: str
    mime_type: str
    category: str = ""
    size_bytes: int | None = None

    @property
    def is_pdf(self) -> bool:
        return self.mime_type.lower() == "application/pdf"


@dataclass(frozen=True)
class ReleasedDocument:
    """A released PDF retrieved from Arena, passed through unaltered.

    `content` is exactly the bytes Arena returned. Nothing in this codebase
    re-renders, re-stamps, or watermarks a controlled document (CLAUDE.md 4.8).
    """

    item_number: str
    revision: str
    lifecycle_state: str
    file_name: str
    mime_type: str
    content: bytes
    is_current_revision: bool = True

    @property
    def size_bytes(self) -> int:
        return len(self.content)

    def suggested_filename(self) -> str:
        """File name for delivery, marking a historical revision as such.

        CLAUDE.md 4.8 asks that a superseded revision be labelled where
        practical in the delivered file name.
        """
        stem, _, ext = self.file_name.rpartition(".")
        if not stem:
            stem, ext = self.file_name, "pdf"
        if self.is_current_revision:
            return f"{stem}.{ext}"
        return f"{stem}_REV_{self.revision}_SUPERSEDED.{ext}"


@dataclass(frozen=True)
class Item:
    """An Arena item.

    `attributes` holds the searchable parameter values already translated out of
    Arena's own attribute names into the parameter names the UI uses, so that
    nothing downstream depends on Arena's internal naming.
    """

    guid: str
    number: str
    name: str
    revision: str
    lifecycle_state: str
    description: str = ""
    attributes: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    def describe(self) -> str:
        """One-line summary for a result list or a log entry."""
        return (
            f"{self.number} rev {self.revision} "
            f"[{self.lifecycle_state}] {self.name}"
        )


@dataclass(frozen=True)
class SearchResult:
    """The outcome of a released-item search.

    An empty `items` list means Arena answered and nothing matched. A failure to
    reach Arena raises instead of returning an empty result (CLAUDE.md 4.5).
    """

    items: list[Item]
    selections: dict[str, Any]

    @property
    def is_empty(self) -> bool:
        return not self.items

    @property
    def is_ambiguous(self) -> bool:
        """Several released items match. Show them all rather than choosing."""
        return len(self.items) > 1
