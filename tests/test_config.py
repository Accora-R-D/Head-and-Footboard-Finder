import tempfile
import unittest
from pathlib import Path

from services.arena import ArenaConfigError, load_config
from tests.fixtures import EXAMPLE_CONFIG, write_config

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestConfigLoading(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_shipped_example_config_is_rejected(self) -> None:
        """The example config must not load. It is a form, not a working config."""
        with self.assertRaises(ArenaConfigError) as ctx:
            load_config(REPO_ROOT / "config" / "arena.example.yaml")

        message = str(ctx.exception)
        self.assertIn("api.base_url is blank", message)
        self.assertIn("lifecycle.released_states is empty", message)
        self.assertIn("arena_name is blank", message)

    def test_missing_file_names_the_path_and_the_remedy(self) -> None:
        with self.assertRaises(ArenaConfigError) as ctx:
            load_config(self.tmpdir / "nope.yaml")
        self.assertIn("arena.example.yaml", str(ctx.exception))

    def test_valid_config_loads(self) -> None:
        config = load_config(write_config(self.tmpdir))
        self.assertEqual(config.base_url, "https://arena.example.invalid/api/v1")
        self.assertTrue(config.is_released("Released"))
        self.assertFalse(config.is_released("In Work"))
        self.assertEqual(config.attribute("width").unit, "mm")

    def test_dimensional_attribute_without_unit_is_rejected(self) -> None:
        body = EXAMPLE_CONFIG.replace('    unit: "mm"\n', "", 1)
        with self.assertRaises(ArenaConfigError) as ctx:
            load_config(write_config(self.tmpdir, body))
        self.assertIn("has no unit", str(ctx.exception))

    def test_all_problems_reported_in_one_pass(self) -> None:
        body = EXAMPLE_CONFIG.replace(
            'base_url: "https://arena.example.invalid/api/v1"', 'base_url: ""'
        ).replace('released_states: ["Released", "Production"]', "released_states: []")
        with self.assertRaises(ArenaConfigError) as ctx:
            load_config(write_config(self.tmpdir, body))
        message = str(ctx.exception)
        self.assertIn("api.base_url", message)
        self.assertIn("lifecycle.released_states", message)

    def test_url_building(self) -> None:
        config = load_config(write_config(self.tmpdir))
        self.assertEqual(
            config.url_for("item", item_guid="abc"),
            "https://arena.example.invalid/api/v1/items/abc",
        )

    def test_url_building_reports_a_missing_placeholder(self) -> None:
        config = load_config(write_config(self.tmpdir))
        with self.assertRaises(ArenaConfigError) as ctx:
            config.url_for("item")
        self.assertIn("item_guid", str(ctx.exception))

    def test_unknown_parameter_lists_what_is_configured(self) -> None:
        config = load_config(write_config(self.tmpdir))
        with self.assertRaises(ArenaConfigError) as ctx:
            config.attribute("mounting_type")
        self.assertIn("product_family", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
