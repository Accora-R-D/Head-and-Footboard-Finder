"""HTTP transport for the Arena client.

The client talks to a Transport rather than to `requests` directly, so the whole
service can be exercised without Arena credentials. `FakeTransport` is what makes
the code testable today, before the API details are confirmed.
"""

from __future__ import annotations

import json as jsonlib
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

from .errors import ArenaTransportError


@dataclass(frozen=True)
class Response:
    status_code: int
    content: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> Any:
        if not self.content:
            return None
        try:
            return jsonlib.loads(self.content)
        except ValueError as exc:
            raise ArenaTransportError(
                f"Arena returned a {self.status_code} response that is not "
                f"valid JSON: {exc}"
            ) from exc

    @classmethod
    def from_json(cls, payload: Any, status_code: int = 200) -> "Response":
        return cls(
            status_code=status_code,
            content=jsonlib.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )


class Transport(Protocol):
    """Anything that can perform an HTTP request for the client."""

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        timeout: int = 30,
    ) -> Response: ...


class RequestsTransport:
    """Real HTTP transport, used once Arena credentials are available."""

    def __init__(self) -> None:
        import requests  # imported lazily so tests need no network stack

        self._session = requests.Session()
        self._requests = requests

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        timeout: int = 30,
    ) -> Response:
        try:
            resp = self._session.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json,
                timeout=timeout,
            )
        except self._requests.RequestException as exc:
            raise ArenaTransportError(f"Request to {url} failed: {exc}") from exc

        return Response(
            status_code=resp.status_code,
            content=resp.content,
            headers=dict(resp.headers),
        )


Route = Response | Callable[..., Response]


class FakeTransport:
    """Scripted transport for tests and for running without Arena access.

    Routes are keyed by "METHOD url-fragment". A route whose fragment the URL
    path *ends with* wins over one that merely appears somewhere in it, so
    "/items" and "/items/{guid}/files" stay distinguishable regardless of the
    order they were registered. A request matching no route raises, so a test
    can never silently pass against an endpoint nobody stubbed.
    """

    def __init__(self, routes: dict[str, Route] | None = None) -> None:
        self.routes: dict[str, Route] = routes or {}
        self.calls: list[dict[str, Any]] = []

    def add(self, key: str, route: Route) -> "FakeTransport":
        self.routes[key] = route
        return self

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        timeout: int = 30,
    ) -> Response:
        call = {
            "method": method.upper(),
            "url": url,
            "headers": headers or {},
            "params": params or {},
            "json": json,
        }
        self.calls.append(call)

        path = url.split("?", 1)[0].rstrip("/")
        exact: Route | None = None
        partial: Route | None = None

        for key, route in self.routes.items():
            route_method, _, fragment = key.partition(" ")
            if route_method.upper() != method.upper():
                continue
            if not fragment:
                partial = partial or route
                continue
            if path.endswith(fragment.rstrip("/")):
                exact = exact or route
            elif fragment in url:
                partial = partial or route

        route = exact or partial
        if route is not None:
            return route(**call) if callable(route) else route

        raise ArenaTransportError(
            f"FakeTransport has no route for {method.upper()} {url}. "
            f"Known routes: {', '.join(self.routes) or 'none'}."
        )
