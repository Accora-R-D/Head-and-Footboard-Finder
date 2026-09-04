"""Searching Arena for released standard inventory items.

This is the standard item path from CLAUDE.md 4.2: dropdown selections in,
released items out. The rules it enforces:

  * Only released items are returned by default (4.5).
  * Matching is on structured attributes, never on parsing item names or
    descriptions (4.5).
  * No results is a valid outcome and returns an empty list; a failure raises
    (4.5).
  * Units are explicit and never converted silently (Units).
"""

from __future__ import annotations

from typing import Any

from .client import ArenaClient
from .config import ArenaConfig, AttributeSpec
from .errors import (
    ArenaNotFoundError,
    ItemNotReleasedError,
    UnitMismatchError,
    UnknownParameterError,
)
from .models import Dimension, Item, SearchResult


class ItemService:
    def __init__(self, client: ArenaClient) -> None:
        self.client = client
        self.config: ArenaConfig = client.config

    # -- search ----------------------------------------------------------

    def search_released(
        self,
        selections: dict[str, Any],
        *,
        include_unreleased: bool = False,
    ) -> SearchResult:
        """Find released items matching a set of dropdown selections.

        `selections` maps parameter names to values. Dimensional values must be
        `Dimension` instances; a bare number is rejected.

        Partial selections are valid: selecting only product_family and
        product_type returns everything released in that group (CLAUDE.md 4.4).

        `include_unreleased` exists for the role-gated historical view in
        CLAUDE.md 4.5. It is never the default, and the caller is responsible
        for checking the user's role before setting it.
        """
        query = self._build_query(selections)
        payload = self.client.get_json("item_search", params=query)
        items = [self._to_item(entry) for entry in _result_entries(payload)]

        if not include_unreleased:
            items = [item for item in items if self.config.is_released(item.lifecycle_state)]

        return SearchResult(items=items, selections=dict(selections))

    def get_by_number(self, item_number: str) -> Item:
        """Fetch a single item by its Arena item number.

        Raises ArenaNotFoundError when nothing matches, so a caller can tell a
        missing item from an item that exists but is unreleased.
        """
        payload = self.client.get_json("item_search", params={"number": item_number})
        entries = _result_entries(payload)
        for entry in entries:
            item = self._to_item(entry)
            if item.number == item_number:
                return item
        raise ArenaNotFoundError(f"Arena has no item numbered {item_number!r}.")

    def get_released_by_number(self, item_number: str) -> Item:
        """Fetch an item and confirm it is released."""
        item = self.get_by_number(item_number)
        if not self.config.is_released(item.lifecycle_state):
            raise ItemNotReleasedError(item.number, item.lifecycle_state)
        return item

    # -- dropdown support ------------------------------------------------

    def options_for(
        self,
        parameter: str,
        selections: dict[str, Any] | None = None,
    ) -> list[Any]:
        """Distinct values available for one dropdown, given the selections so far.

        This is what makes the dropdowns a progressive filter over real released
        data (CLAUDE.md 4.4): options come from Arena, and a combination with no
        released item simply never appears in the list.
        """
        selections = dict(selections or {})
        selections.pop(parameter, None)
        spec = self.config.attribute(parameter)

        result = self.search_released(selections)
        values: list[Any] = []
        seen: set[str] = set()
        for item in result.items:
            value = item.attributes.get(parameter)
            if value is None:
                continue
            key = str(value)
            if key not in seen:
                seen.add(key)
                values.append(value)

        return sorted(values, key=_sort_key) if not spec.is_dimensional else sorted(
            values, key=lambda v: v.value if isinstance(v, Dimension) else 0.0
        )

    # -- internals -------------------------------------------------------

    def _build_query(self, selections: dict[str, Any]) -> dict[str, Any]:
        """Translate parameter selections into Arena attribute query terms."""
        query: dict[str, Any] = {}
        for parameter, value in selections.items():
            if value is None or value == "":
                continue
            if parameter not in self.config.attributes:
                raise UnknownParameterError(
                    f"Parameter {parameter!r} has no configured Arena attribute, "
                    f"so it cannot be searched on. Configured parameters: "
                    f"{', '.join(sorted(self.config.attributes)) or 'none'}."
                )
            spec = self.config.attributes[parameter]
            query[spec.arena_name] = self._query_value(spec, value)
        return query

    @staticmethod
    def _query_value(spec: AttributeSpec, value: Any) -> Any:
        if not spec.is_dimensional:
            return value

        if not isinstance(value, Dimension):
            raise UnitMismatchError(
                parameter=spec.parameter,
                given="no unit",
                expected=spec.unit,
            )
        if value.unit != spec.unit:
            raise UnitMismatchError(
                parameter=spec.parameter,
                given=value.unit,
                expected=spec.unit,
            )
        return value.value

    def _to_item(self, entry: dict[str, Any]) -> Item:
        """Build an Item, translating Arena attribute names into parameter names."""
        attributes: dict[str, Any] = {}
        for parameter, spec in self.config.attributes.items():
            raw_value = _read_attribute(entry, spec.arena_name)
            if raw_value is None:
                continue
            if spec.is_dimensional:
                try:
                    attributes[parameter] = Dimension(float(raw_value), spec.unit)
                except (TypeError, ValueError):
                    continue
            else:
                attributes[parameter] = raw_value

        return Item(
            guid=str(entry.get("guid") or entry.get("id") or ""),
            number=str(entry.get("number") or ""),
            name=str(entry.get("name") or ""),
            revision=str(entry.get("revisionNumber") or entry.get("revision") or ""),
            lifecycle_state=str(
                entry.get("lifecyclePhase", {}).get("name")
                if isinstance(entry.get("lifecyclePhase"), dict)
                else entry.get("lifecyclePhase") or entry.get("lifecycleState") or ""
            ),
            description=str(entry.get("description") or ""),
            attributes=attributes,
            raw=entry,
        )


def _result_entries(payload: Any) -> list[dict[str, Any]]:
    """Pull the list of items out of a search response.

    Arena's exact envelope is unconfirmed, so this accepts a bare list or a
    dict with a `results` or `items` key, and reports anything else rather than
    quietly returning nothing.
    """
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("results", "items", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return []
    raise TypeError(
        f"Unexpected Arena search response of type {type(payload).__name__}; "
        f"expected a list or an object containing one."
    )


def _read_attribute(entry: dict[str, Any], arena_name: str) -> Any:
    """Read one attribute from an item payload.

    Handles both a flat field and Arena's list-of-attributes shape, without
    falling back to matching on the item's name or description.
    """
    if arena_name in entry:
        return entry[arena_name]

    additional = entry.get("additionalAttributes") or entry.get("attributes")
    if isinstance(additional, dict):
        return additional.get(arena_name)
    if isinstance(additional, list):
        for attribute in additional:
            if not isinstance(attribute, dict):
                continue
            if attribute.get("name") == arena_name or attribute.get("guid") == arena_name:
                return attribute.get("value")
    return None


def _sort_key(value: Any) -> tuple[int, Any]:
    """Sort numbers before strings without comparing the two."""
    if isinstance(value, (int, float)):
        return (0, value)
    return (1, str(value))
