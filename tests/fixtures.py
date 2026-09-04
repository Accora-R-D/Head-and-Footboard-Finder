"""Test fixtures: a complete but entirely fictional Arena setup.

The endpoint paths and attribute names here are placeholders chosen to be
obviously fake. They exist so the service can be exercised without Arena
credentials, and they must not be copied into config/arena.yaml.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

from services.arena import ArenaClient, Credentials, FakeTransport, Response, load_config

EXAMPLE_CONFIG = textwrap.dedent(
    """
    api:
      base_url: "https://arena.example.invalid/api/v1"
      endpoints:
        login: "/login"
        logout: "/logout"
        item_search: "/items"
        item: "/items/{item_guid}"
        item_files: "/items/{item_guid}/files"
        file_content: "/files/{file_guid}/content"
      session_header: "X-Test-Session"
      workspace_header: "X-Test-Workspace"
      timeout_seconds: 5
      max_retries: 2

    lifecycle:
      released_states: ["Released", "Production"]
      superseded_states: ["Superseded"]
      obsolete_states: ["Obsolete"]

    attributes:
      product_family:
        arena_name: "TEST_FAMILY"
        type: string
      product_type:
        arena_name: "TEST_TYPE"
        type: string
      width:
        arena_name: "TEST_WIDTH"
        type: dimension
        unit: "mm"
      height:
        arena_name: "TEST_HEIGHT"
        type: dimension
        unit: "mm"
      style:
        arena_name: "TEST_STYLE"
        type: string
      material:
        arena_name: "TEST_MATERIAL"
        type: string

    files:
      pdf_mime_types:
        - application/pdf
      drawing_category: ""
    """
)


def write_config(tmpdir: Path, body: str = EXAMPLE_CONFIG) -> Path:
    path = Path(tmpdir) / "arena.yaml"
    path.write_text(body)
    return path


def item_payload(
    number: str,
    *,
    family: str = "Inventory",
    product_type: str = "Headboard",
    width: float = 900.0,
    height: float = 1100.0,
    style: str = "Standard",
    material: str = "Beech",
    revision: str = "A",
    state: str = "Released",
    guid: str | None = None,
) -> dict:
    return {
        "guid": guid or f"guid-{number}",
        "number": number,
        "name": f"{family} {product_type} {width:g}x{height:g}",
        "revisionNumber": revision,
        "lifecyclePhase": {"name": state},
        "description": f"{style} {material}",
        "additionalAttributes": [
            {"name": "TEST_FAMILY", "value": family},
            {"name": "TEST_TYPE", "value": product_type},
            {"name": "TEST_WIDTH", "value": width},
            {"name": "TEST_HEIGHT", "value": height},
            {"name": "TEST_STYLE", "value": style},
            {"name": "TEST_MATERIAL", "value": material},
        ],
    }


def build_client(
    tmpdir: Path,
    routes: dict | None = None,
    config_body: str = EXAMPLE_CONFIG,
) -> tuple[ArenaClient, FakeTransport]:
    """An authenticated client wired to a FakeTransport."""
    config = load_config(write_config(tmpdir, config_body))
    transport = FakeTransport(routes or {})
    transport.add("POST /login", Response.from_json({"arenaSessionId": "test-session"}))
    transport.add("POST /logout", Response.from_json({}))
    client = ArenaClient(
        config=config,
        credentials=Credentials(email="test@example.invalid", password="secret"),
        transport=transport,
        sleep=lambda _seconds: None,
    )
    return client, transport
