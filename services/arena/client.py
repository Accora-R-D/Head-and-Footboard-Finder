"""Arena API client: session handling, retries, and error mapping.

All Arena access in this codebase goes through this client (CLAUDE.md
Integration Boundaries). Nothing else builds an Arena URL or reads an Arena
credential.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Callable

from .config import ArenaConfig
from .errors import (
    ArenaAuthError,
    ArenaError,
    ArenaNotFoundError,
    ArenaTransportError,
)
from .transport import RequestsTransport, Response, Transport

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


@dataclass(frozen=True)
class Credentials:
    """Arena login credentials.

    Read from the environment, never from the repository. `workspace_id` is
    optional and only sent when the config names a workspace header.
    """

    email: str
    password: str
    workspace_id: str = ""

    @classmethod
    def from_env(cls, prefix: str = "ARENA") -> "Credentials":
        email = os.environ.get(f"{prefix}_EMAIL", "")
        password = os.environ.get(f"{prefix}_PASSWORD", "")
        missing = [
            name
            for name, value in ((f"{prefix}_EMAIL", email), (f"{prefix}_PASSWORD", password))
            if not value
        ]
        if missing:
            raise ArenaAuthError(
                f"Missing Arena credentials in the environment: {', '.join(missing)}. "
                f"Copy .env.example to .env and fill it in."
            )
        return cls(
            email=email,
            password=password,
            workspace_id=os.environ.get(f"{prefix}_WORKSPACE_ID", ""),
        )

    def __repr__(self) -> str:  # keep the password out of logs and tracebacks
        return f"Credentials(email={self.email!r}, password='***')"


class ArenaClient:
    """Authenticated access to the Arena REST API."""

    def __init__(
        self,
        config: ArenaConfig,
        credentials: Credentials,
        transport: Transport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config = config
        self.credentials = credentials
        self.transport = transport or RequestsTransport()
        self._sleep = sleep
        self._session_token: str | None = None

    # -- session ---------------------------------------------------------

    @property
    def is_authenticated(self) -> bool:
        return self._session_token is not None

    def login(self) -> None:
        """Establish a session.

        The response field holding the token is not fixed here; the client
        accepts any of the common shapes and reports clearly if it finds none,
        rather than assuming a field name that has not been verified.
        """
        url = self.config.url_for("login")
        payload: dict[str, Any] = {
            "email": self.credentials.email,
            "password": self.credentials.password,
        }
        if self.credentials.workspace_id:
            payload["workspaceId"] = self.credentials.workspace_id

        response = self._send("POST", url, json=payload, authenticated=False)
        if response.status_code in (401, 403):
            raise ArenaAuthError(
                "Arena rejected the supplied credentials "
                f"(HTTP {response.status_code})."
            )
        if not response.ok:
            raise ArenaAuthError(
                f"Arena login failed with HTTP {response.status_code}."
            )

        body = response.json() or {}
        token = _first_present(body, ("arenaSessionId", "sessionId", "token", "access_token"))
        if not token:
            raise ArenaAuthError(
                "Arena login succeeded but no session token was found in the "
                f"response. Fields returned: {', '.join(sorted(body)) or 'none'}. "
                "Confirm the token field name in the Arena API documentation."
            )
        self._session_token = str(token)

    def logout(self) -> None:
        if not self._session_token:
            return
        try:
            self._send("POST", self.config.url_for("logout"))
        except ArenaError:  # a failed logout must not mask the caller's own error
            pass
        finally:
            self._session_token = None

    def __enter__(self) -> "ArenaClient":
        self.login()
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.logout()

    # -- requests --------------------------------------------------------

    def get_json(
        self,
        endpoint: str,
        *,
        params: dict[str, Any] | None = None,
        **path_params: str,
    ) -> Any:
        url = self.config.url_for(endpoint, **path_params)
        response = self._send("GET", url, params=params)
        self._raise_for_status(response, url)
        return response.json()

    def get_bytes(self, endpoint: str, **path_params: str) -> tuple[bytes, str]:
        """Fetch raw file content and its declared content type."""
        url = self.config.url_for(endpoint, **path_params)
        response = self._send("GET", url)
        self._raise_for_status(response, url)
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
        return response.content, content_type

    # -- internals -------------------------------------------------------

    def _headers(self, authenticated: bool) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if authenticated and self._session_token:
            headers[self.config.session_header] = self._session_token
        if self.config.workspace_header and self.credentials.workspace_id:
            headers[self.config.workspace_header] = self.credentials.workspace_id
        return headers

    def _send(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        authenticated: bool = True,
    ) -> Response:
        """Send a request, retrying transient failures with backoff."""
        if authenticated and not self._session_token:
            self.login()

        last_error: Exception | None = None
        for attempt in range(1, self.config.max_retries + 1):
            try:
                response = self.transport.request(
                    method,
                    url,
                    headers=self._headers(authenticated),
                    params=params,
                    json=json,
                    timeout=self.config.timeout_seconds,
                )
            except ArenaTransportError as exc:
                last_error = exc
                if attempt == self.config.max_retries:
                    raise
                self._sleep(2 ** (attempt - 1))
                continue

            if response.status_code in RETRYABLE_STATUS and attempt < self.config.max_retries:
                self._sleep(2 ** (attempt - 1))
                continue

            return response

        raise ArenaTransportError(  # pragma: no cover - unreachable in practice
            f"Request to {url} failed after {self.config.max_retries} attempts: {last_error}"
        )

    @staticmethod
    def _raise_for_status(response: Response, url: str) -> None:
        if response.ok:
            return
        if response.status_code == 404:
            raise ArenaNotFoundError(f"Arena has no object at {url}.")
        if response.status_code in (401, 403):
            raise ArenaAuthError(
                f"Arena refused access to {url} (HTTP {response.status_code})."
            )
        raise ArenaTransportError(
            f"Arena returned HTTP {response.status_code} for {url}. "
            f"This is a failure, not an empty result."
        )


def _first_present(body: dict[str, Any], keys: tuple[str, ...]) -> Any | None:
    for key in keys:
        if body.get(key):
            return body[key]
    return None
