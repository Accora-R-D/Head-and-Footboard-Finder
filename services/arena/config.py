"""Loading and validation of the Arena configuration.

Every Arena endpoint path and attribute name lives in config/arena.yaml and
nowhere else. The loader treats a blank required value as a hard error, so an
unverified configuration stops the application at startup with a message naming
the missing field, rather than letting a guess reach Arena.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .errors import ArenaConfigError

REQUIRED_ENDPOINTS = (
    "login",
    "logout",
    "item_search",
    "item",
    "item_files",
    "file_content",
)

VALID_ATTRIBUTE_TYPES = ("string", "number", "dimension")


@dataclass(frozen=True)
class AttributeSpec:
    """One searchable parameter and the Arena attribute holding it."""

    parameter: str
    arena_name: str
    type: str
    unit: str = ""
    families: tuple[str, ...] = ()

    @property
    def is_dimensional(self) -> bool:
        return self.type == "dimension"

    def applies_to(self, product_family: str | None) -> bool:
        """Whether this parameter is offered for the given product family.

        A parameter that does not apply is hidden rather than shown empty
        (CLAUDE.md 4.4).
        """
        if not self.families or product_family is None:
            return True
        return product_family in self.families


@dataclass(frozen=True)
class ArenaConfig:
    base_url: str
    endpoints: dict[str, str]
    session_header: str
    workspace_header: str
    timeout_seconds: int
    max_retries: int
    released_states: frozenset[str]
    superseded_states: frozenset[str]
    obsolete_states: frozenset[str]
    attributes: dict[str, AttributeSpec] = field(default_factory=dict)
    pdf_mime_types: tuple[str, ...] = ("application/pdf",)
    drawing_category: str = ""

    def url_for(self, endpoint: str, **params: str) -> str:
        """Build a full URL for a configured endpoint."""
        try:
            template = self.endpoints[endpoint]
        except KeyError:
            raise ArenaConfigError(
                f"No endpoint configured for {endpoint!r}. Add it under "
                f"api.endpoints in the Arena config."
            ) from None
        try:
            path = template.format(**params)
        except KeyError as exc:
            raise ArenaConfigError(
                f"Endpoint {endpoint!r} needs placeholder {exc} which was not "
                f"supplied. Template is {template!r}."
            ) from None
        return f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

    def attribute(self, parameter: str) -> AttributeSpec:
        try:
            return self.attributes[parameter]
        except KeyError:
            known = ", ".join(sorted(self.attributes)) or "none configured"
            raise ArenaConfigError(
                f"Parameter {parameter!r} has no configured Arena attribute. "
                f"Configured parameters: {known}."
            ) from None

    def is_released(self, lifecycle_state: str) -> bool:
        return lifecycle_state in self.released_states

    def parameters_for_family(self, product_family: str | None) -> list[str]:
        """Parameter names offered as dropdowns for a product family."""
        return sorted(
            name
            for name, spec in self.attributes.items()
            if spec.applies_to(product_family)
        )


def load_config(path: str | Path) -> ArenaConfig:
    """Load and validate config/arena.yaml.

    Raises ArenaConfigError listing every problem found, so a half-completed
    config is reported in one pass rather than one field at a time.
    """
    path = Path(path)
    if not path.exists():
        raise ArenaConfigError(
            f"Arena config not found at {path}. Copy "
            f"config/arena.example.yaml to {path} and complete it from the "
            f"Arena API documentation and your Arena workspace."
        )

    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as exc:
        raise ArenaConfigError(f"Arena config at {path} is not valid YAML: {exc}") from exc

    problems: list[str] = []
    api = raw.get("api") or {}
    lifecycle = raw.get("lifecycle") or {}
    files = raw.get("files") or {}

    base_url = (api.get("base_url") or "").strip()
    if not base_url:
        problems.append(
            "api.base_url is blank. Take it from the Arena REST API documentation."
        )

    endpoints_raw = api.get("endpoints") or {}
    endpoints: dict[str, str] = {}
    for name in REQUIRED_ENDPOINTS:
        value = (endpoints_raw.get(name) or "").strip()
        if not value:
            problems.append(
                f"api.endpoints.{name} is blank. Take the path from the Arena "
                f"REST API documentation; do not guess it."
            )
        endpoints[name] = value

    session_header = (api.get("session_header") or "").strip()
    if not session_header:
        problems.append(
            "api.session_header is blank. Set the header name Arena expects "
            "the session token in."
        )

    released_states = [s for s in (lifecycle.get("released_states") or []) if s]
    if not released_states:
        problems.append(
            "lifecycle.released_states is empty. Until it lists the Arena "
            "lifecycle states that count as released, no item can be treated "
            "as findable."
        )

    attributes, attribute_problems = _load_attributes(raw.get("attributes") or {})
    problems.extend(attribute_problems)

    pdf_mime_types = tuple(files.get("pdf_mime_types") or ("application/pdf",))

    if problems:
        raise ArenaConfigError(
            f"Arena config at {path} is incomplete or unverified:\n  - "
            + "\n  - ".join(problems)
        )

    return ArenaConfig(
        base_url=base_url,
        endpoints=endpoints,
        session_header=session_header,
        workspace_header=(api.get("workspace_header") or "").strip(),
        timeout_seconds=int(api.get("timeout_seconds") or 30),
        max_retries=int(api.get("max_retries") or 3),
        released_states=frozenset(released_states),
        superseded_states=frozenset(lifecycle.get("superseded_states") or []),
        obsolete_states=frozenset(lifecycle.get("obsolete_states") or []),
        attributes=attributes,
        pdf_mime_types=pdf_mime_types,
        drawing_category=(files.get("drawing_category") or "").strip(),
    )


def _load_attributes(
    raw: dict[str, Any],
) -> tuple[dict[str, AttributeSpec], list[str]]:
    """Validate the parameter-to-Arena-attribute mapping.

    A parameter with a blank arena_name is dropped rather than guessed at, and
    reported, because a parameter Arena cannot search on must not become a
    dropdown (CLAUDE.md 4.3).
    """
    specs: dict[str, AttributeSpec] = {}
    problems: list[str] = []

    if not raw:
        problems.append(
            "attributes is empty. At least one parameter must map to a "
            "confirmed Arena attribute before any search can run."
        )

    for parameter, entry in raw.items():
        entry = entry or {}
        arena_name = (entry.get("arena_name") or "").strip()
        attr_type = (entry.get("type") or "").strip()
        unit = (entry.get("unit") or "").strip()

        if not arena_name:
            problems.append(
                f"attributes.{parameter}.arena_name is blank. Confirm the "
                f"attribute in Arena, or remove the parameter so it is not "
                f"offered as a dropdown."
            )
            continue

        if attr_type not in VALID_ATTRIBUTE_TYPES:
            problems.append(
                f"attributes.{parameter}.type is {attr_type!r}; expected one "
                f"of {', '.join(VALID_ATTRIBUTE_TYPES)}."
            )
            continue

        if attr_type == "dimension" and not unit:
            problems.append(
                f"attributes.{parameter} is dimensional but has no unit. "
                f"Units are never assumed."
            )
            continue

        specs[parameter] = AttributeSpec(
            parameter=parameter,
            arena_name=arena_name,
            type=attr_type,
            unit=unit,
            families=tuple(entry.get("families") or ()),
        )

    return specs, problems
