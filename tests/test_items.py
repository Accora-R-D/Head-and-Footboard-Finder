import tempfile
import unittest
from pathlib import Path

from services.arena import (
    ArenaTransportError,
    Dimension,
    ItemService,
    Response,
    UnitMismatchError,
    UnknownParameterError,
)
from tests.fixtures import build_client, item_payload


class TestReleasedSearch(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _service(self, results: list[dict]) -> tuple[ItemService, object]:
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response.from_json({"results": results}))
        return ItemService(client), transport

    def test_only_released_items_are_returned(self) -> None:
        service, _ = self._service(
            [
                item_payload("HB-001", state="Released"),
                item_payload("HB-002", state="In Work"),
                item_payload("HB-003", state="Superseded"),
                item_payload("HB-004", state="Production"),
            ]
        )
        result = service.search_released({"product_family": "Inventory"})
        self.assertEqual([i.number for i in result.items], ["HB-001", "HB-004"])

    def test_no_match_is_an_empty_result_not_an_error(self) -> None:
        service, _ = self._service([])
        result = service.search_released({"product_family": "Inventory"})
        self.assertTrue(result.is_empty)
        self.assertEqual(result.items, [])

    def test_arena_failure_raises_rather_than_returning_empty(self) -> None:
        """CLAUDE.md 4.5: an Arena error is not an empty result."""
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response(status_code=503))
        service = ItemService(client)
        with self.assertRaises(ArenaTransportError):
            service.search_released({"product_family": "Inventory"})

    def test_several_matches_are_all_returned(self) -> None:
        service, _ = self._service(
            [item_payload("HB-001"), item_payload("HB-002", width=1000.0)]
        )
        result = service.search_released({"product_family": "Inventory"})
        self.assertTrue(result.is_ambiguous)
        self.assertEqual(len(result.items), 2)

    def test_partial_selection_is_valid(self) -> None:
        service, transport = self._service([item_payload("HB-001")])
        service.search_released({"product_family": "Inventory"})
        query = transport.calls[-1]["params"]
        self.assertEqual(query, {"TEST_FAMILY": "Inventory"})

    def test_selections_map_to_arena_attribute_names(self) -> None:
        service, transport = self._service([item_payload("HB-001")])
        service.search_released(
            {
                "product_family": "Inventory",
                "product_type": "Headboard",
                "width": Dimension(900, "mm"),
            }
        )
        self.assertEqual(
            transport.calls[-1]["params"],
            {"TEST_FAMILY": "Inventory", "TEST_TYPE": "Headboard", "TEST_WIDTH": 900.0},
        )

    def test_blank_selections_are_ignored(self) -> None:
        service, transport = self._service([item_payload("HB-001")])
        service.search_released({"product_family": "Inventory", "style": "", "material": None})
        self.assertEqual(transport.calls[-1]["params"], {"TEST_FAMILY": "Inventory"})

    def test_attributes_are_translated_back_into_parameter_names(self) -> None:
        service, _ = self._service([item_payload("HB-001", width=900.0, style="Curved")])
        item = service.search_released({}).items[0]
        self.assertEqual(item.attributes["style"], "Curved")
        self.assertEqual(item.attributes["width"], Dimension(900.0, "mm"))
        self.assertEqual(item.revision, "A")
        self.assertEqual(item.lifecycle_state, "Released")


class TestUnitsAndParameters(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _service(self) -> ItemService:
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response.from_json({"results": []}))
        return ItemService(client)

    def test_bare_number_for_a_dimension_is_rejected(self) -> None:
        """Units are never inferred, even when the number looks obvious."""
        with self.assertRaises(UnitMismatchError) as ctx:
            self._service().search_released({"width": 900})
        self.assertIn("no unit", str(ctx.exception))

    def test_wrong_unit_is_rejected_not_converted(self) -> None:
        with self.assertRaises(UnitMismatchError) as ctx:
            self._service().search_released({"width": Dimension(90, "cm")})
        message = str(ctx.exception)
        self.assertIn("does not convert units", message)
        self.assertIn("mm", message)

    def test_parameter_without_a_configured_attribute_cannot_be_searched(self) -> None:
        with self.assertRaises(UnknownParameterError):
            self._service().search_released({"mounting_type": "Wall"})

    def test_dimension_requires_a_unit_at_construction(self) -> None:
        with self.assertRaises(ValueError):
            Dimension(900, "")


class TestDropdownOptions(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_options_come_from_released_items_only(self) -> None:
        client, transport = build_client(self.tmpdir)
        transport.add(
            "GET /items",
            Response.from_json(
                {
                    "results": [
                        item_payload("HB-001", style="Standard"),
                        item_payload("HB-002", style="Curved"),
                        item_payload("HB-003", style="Prototype", state="In Work"),
                        item_payload("HB-004", style="Standard"),
                    ]
                }
            ),
        )
        options = ItemService(client).options_for("style", {"product_family": "Inventory"})
        self.assertEqual(options, ["Curved", "Standard"])

    def test_dimensional_options_sort_numerically(self) -> None:
        client, transport = build_client(self.tmpdir)
        transport.add(
            "GET /items",
            Response.from_json(
                {
                    "results": [
                        item_payload("HB-001", width=1000.0),
                        item_payload("HB-002", width=900.0),
                        item_payload("HB-003", width=1200.0),
                    ]
                }
            ),
        )
        options = ItemService(client).options_for("width")
        self.assertEqual([o.value for o in options], [900.0, 1000.0, 1200.0])
        self.assertTrue(all(o.unit == "mm" for o in options))


if __name__ == "__main__":
    unittest.main()
