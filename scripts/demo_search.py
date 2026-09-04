#!/usr/bin/env python3
"""Exercise the Arena standard item search.

Two modes:

    python3 scripts/demo_search.py --demo
        Runs against a built-in fake Arena with invented sample items. Needs no
        credentials and no config. Use it to see the dropdown narrowing and the
        retrieval rules working.

    python3 scripts/demo_search.py --family Inventory --type Headboard
        Runs against the real Arena, using config/arena.yaml and the ARENA_*
        environment variables. Fails with a clear message until both exist.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from services.arena import (  # noqa: E402
    ArenaClient,
    ArenaError,
    AttachmentService,
    Credentials,
    Dimension,
    ItemService,
    load_config,
)

DEMO_CONFIG = REPO_ROOT / "tests" / "_demo_arena.yaml"


def build_demo_service() -> tuple[ItemService, AttachmentService]:
    """A client wired to a fake Arena holding a handful of invented items."""
    from tests.fixtures import EXAMPLE_CONFIG, build_client, item_payload
    from services.arena import Response

    import tempfile

    tmpdir = Path(tempfile.mkdtemp())
    client, transport = build_client(tmpdir, config_body=EXAMPLE_CONFIG)

    catalogue = [
        item_payload("HB-1001", width=900, height=1100, style="Standard", material="Beech"),
        item_payload("HB-1002", width=1000, height=1100, style="Standard", material="Beech"),
        item_payload("HB-1003", width=900, height=1200, style="Curved", material="Oak"),
        item_payload("FB-2001", product_type="Footboard", width=900, height=600,
                     style="Standard", material="Beech"),
        item_payload("HB-9999", width=900, height=1100, style="Prototype",
                     material="Ply", state="In Work"),
    ]

    def same(stored, wanted) -> bool:
        """Compare numerically where both sides are numbers, else as text."""
        try:
            return float(stored) == float(wanted)
        except (TypeError, ValueError):
            return str(stored) == str(wanted)

    def search(**call):
        params = call.get("params") or {}
        matches = []
        for entry in catalogue:
            values = {a["name"]: a["value"] for a in entry["additionalAttributes"]}
            if all(same(values.get(k), v) for k, v in params.items()):
                matches.append(entry)
        return Response.from_json({"results": matches})

    transport.add("GET /items", search)
    transport.add(
        "GET /files",
        Response.from_json({"results": [
            {"guid": "file-1", "name": "drawing.pdf", "mimeType": "application/pdf"}
        ]}),
    )
    transport.add(
        "GET /content",
        Response(
            status_code=200,
            content=b"%PDF-1.7\n%demo released drawing\n%%EOF\n",
            headers={"Content-Type": "application/pdf"},
        ),
    )
    return ItemService(client), AttachmentService(client)


def build_real_service(config_path: Path) -> tuple[ItemService, AttachmentService]:
    config = load_config(config_path)
    client = ArenaClient(config=config, credentials=Credentials.from_env())
    client.login()
    return ItemService(client), AttachmentService(client)


def run_demo() -> int:
    items, attachments = build_demo_service()

    print("Dropdown narrowing over released items only\n" + "-" * 44)
    selections: dict = {}
    for parameter in ("product_family", "product_type", "style"):
        options = items.options_for(parameter, selections)
        print(f"{parameter:<16} options: {[str(o) for o in options]}")
        if options:
            selections[parameter] = options[0]
            print(f"{'':<16} selected: {selections[parameter]}")

    widths = items.options_for("width", selections)
    print(f"{'width':<16} options: {[str(w) for w in widths]}")
    if widths:
        selections["width"] = widths[0]

    print(f"\nSelections: { {k: str(v) for k, v in selections.items()} }")

    result = items.search_released(selections)
    print(f"\n{len(result.items)} released item(s) matched:")
    for item in result.items:
        print(f"  {item.describe()}")

    if result.is_empty:
        print("\nNo released item matches. Offer the custom configuration route.")
        return 0

    if result.is_ambiguous:
        print("\nSeveral matches: show them all rather than picking one.")

    document = attachments.get_released_pdf(result.items[0])
    print(
        f"\nRetrieved {document.suggested_filename()} "
        f"({document.size_bytes} bytes) "
        f"at revision {document.revision} [{document.lifecycle_state}]"
    )

    print("\nRules demonstrated:")
    print("  - HB-9999 is 'In Work' and never appears in any option list or result.")
    print("  - Widths carry their unit; a bare number would be rejected.")
    print("  - The PDF is returned as the exact bytes Arena served.")
    return 0


def run_real(args: argparse.Namespace) -> int:
    items, attachments = build_real_service(Path(args.config))

    selections: dict = {}
    if args.family:
        selections["product_family"] = args.family
    if args.type:
        selections["product_type"] = args.type
    if args.width is not None:
        selections["width"] = Dimension(args.width, args.unit)

    result = items.search_released(selections)
    if result.is_empty:
        print("No released item matches that selection.")
        return 0

    for item in result.items:
        print(item.describe())

    if args.download:
        document = attachments.get_released_pdf(result.items[0])
        out = Path(document.suggested_filename())
        out.write_bytes(document.content)
        print(f"Wrote {out} at revision {document.revision}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="run against a fake Arena")
    parser.add_argument("--config", default=str(REPO_ROOT / "config" / "arena.yaml"))
    parser.add_argument("--family")
    parser.add_argument("--type", dest="type")
    parser.add_argument("--width", type=float)
    parser.add_argument("--unit", default="mm", help="unit for --width")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()

    try:
        return run_demo() if args.demo else run_real(args)
    except ArenaError as exc:
        print(f"\n{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
