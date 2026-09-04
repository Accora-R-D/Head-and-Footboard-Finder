import tempfile
import unittest
from pathlib import Path

from services.arena import (
    AmbiguousPdfError,
    AttachmentService,
    ItemNotReleasedError,
    ItemService,
    NoReleasedPdfError,
    ReleasedDocument,
    Response,
)
from tests.fixtures import build_client, item_payload

PDF_BYTES = b"%PDF-1.7\n%fake released drawing\n%%EOF\n"


def file_entry(guid: str, name: str, mime: str = "application/pdf", category: str = "") -> dict:
    return {"guid": guid, "name": name, "mimeType": mime, "category": category}


class TestReleasedPdfRetrieval(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _setup(self, files: list[dict], state: str = "Released", content: bytes = PDF_BYTES):
        client, transport = build_client(self.tmpdir)
        transport.add(
            "GET /items", Response.from_json({"results": [item_payload("HB-001", state=state)]})
        )
        transport.add("GET /files", Response.from_json({"results": files}))
        transport.add(
            "GET /content",
            Response(
                status_code=200,
                content=content,
                headers={"Content-Type": "application/pdf"},
            ),
        )
        item = ItemService(client).search_released({}, include_unreleased=True).items[0]
        return AttachmentService(client), item

    def test_released_pdf_is_returned_unaltered(self) -> None:
        service, item = self._setup([file_entry("f1", "HB-001_RevA.pdf")])
        document = service.get_released_pdf(item)

        self.assertIsInstance(document, ReleasedDocument)
        self.assertEqual(document.content, PDF_BYTES)  # byte for byte
        self.assertEqual(document.revision, "A")
        self.assertEqual(document.lifecycle_state, "Released")
        self.assertEqual(document.item_number, "HB-001")

    def test_unreleased_item_is_refused(self) -> None:
        """CLAUDE.md 4.8: never serve an in-work document through this route."""
        service, item = self._setup([file_entry("f1", "draft.pdf")], state="In Work")
        with self.assertRaises(ItemNotReleasedError) as ctx:
            service.get_released_pdf(item)
        self.assertIn("In Work", str(ctx.exception))

    def test_released_item_with_no_pdf_is_a_reported_fault(self) -> None:
        service, item = self._setup(
            [file_entry("f1", "model.step", mime="application/step")]
        )
        with self.assertRaises(NoReleasedPdfError) as ctx:
            service.get_released_pdf(item)
        self.assertIn("HB-001", str(ctx.exception))

    def test_empty_file_is_a_reported_fault(self) -> None:
        service, item = self._setup([file_entry("f1", "HB-001.pdf")], content=b"")
        with self.assertRaises(NoReleasedPdfError):
            service.get_released_pdf(item)

    def test_several_pdfs_without_a_rule_is_ambiguous_not_a_guess(self) -> None:
        service, item = self._setup(
            [file_entry("f1", "drawing.pdf"), file_entry("f2", "instructions.pdf")]
        )
        with self.assertRaises(AmbiguousPdfError) as ctx:
            service.get_released_pdf(item)
        message = str(ctx.exception)
        self.assertIn("drawing.pdf", message)
        self.assertIn("instructions.pdf", message)
        self.assertIn("drawing_category", message)


class TestFilenameLabelling(unittest.TestCase):
    def _document(self, is_current: bool) -> ReleasedDocument:
        return ReleasedDocument(
            item_number="HB-001",
            revision="A",
            lifecycle_state="Released" if is_current else "Superseded",
            file_name="HB-001_drawing.pdf",
            mime_type="application/pdf",
            content=PDF_BYTES,
            is_current_revision=is_current,
        )

    def test_current_revision_keeps_its_filename(self) -> None:
        self.assertEqual(self._document(True).suggested_filename(), "HB-001_drawing.pdf")

    def test_superseded_revision_is_labelled_in_the_filename(self) -> None:
        name = self._document(False).suggested_filename()
        self.assertIn("SUPERSEDED", name)
        self.assertIn("REV_A", name)


if __name__ == "__main__":
    unittest.main()
