import tempfile
import unittest
from pathlib import Path

from services.arena import (
    ArenaAuthError,
    ArenaClient,
    ArenaNotFoundError,
    ArenaTransportError,
    Credentials,
    FakeTransport,
    Response,
    load_config,
)
from tests.fixtures import build_client, write_config


class TestCredentials(unittest.TestCase):
    def test_repr_does_not_leak_the_password(self) -> None:
        creds = Credentials(email="a@b.invalid", password="hunter2")
        self.assertNotIn("hunter2", repr(creds))
        self.assertIn("a@b.invalid", repr(creds))

    def test_missing_environment_names_the_variables(self) -> None:
        with self.assertRaises(ArenaAuthError) as ctx:
            Credentials.from_env(prefix="NOT_SET_ARENA")
        message = str(ctx.exception)
        self.assertIn("NOT_SET_ARENA_EMAIL", message)
        self.assertIn("NOT_SET_ARENA_PASSWORD", message)


class TestClientBehaviour(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_login_sends_the_session_header_on_later_calls(self) -> None:
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response.from_json({"results": []}))
        client.get_json("item_search")
        self.assertEqual(transport.calls[-1]["headers"]["X-Test-Session"], "test-session")

    def test_login_without_a_recognisable_token_fails_loudly(self) -> None:
        config = load_config(write_config(self.tmpdir))
        transport = FakeTransport({"POST /login": Response.from_json({"unexpected": "shape"})})
        client = ArenaClient(
            config=config,
            credentials=Credentials(email="a@b.invalid", password="x"),
            transport=transport,
            sleep=lambda _s: None,
        )
        with self.assertRaises(ArenaAuthError) as ctx:
            client.login()
        self.assertIn("unexpected", str(ctx.exception))

    def test_bad_credentials_are_reported_as_auth_failure(self) -> None:
        config = load_config(write_config(self.tmpdir))
        transport = FakeTransport({"POST /login": Response(status_code=401)})
        client = ArenaClient(
            config=config,
            credentials=Credentials(email="a@b.invalid", password="wrong"),
            transport=transport,
            sleep=lambda _s: None,
        )
        with self.assertRaises(ArenaAuthError):
            client.login()

    def test_transient_failure_is_retried_then_succeeds(self) -> None:
        client, transport = build_client(self.tmpdir)
        attempts = {"n": 0}

        def flaky(**_call):
            attempts["n"] += 1
            if attempts["n"] == 1:
                return Response(status_code=503)
            return Response.from_json({"results": []})

        transport.add("GET /items", flaky)
        client.get_json("item_search")
        self.assertEqual(attempts["n"], 2)

    def test_persistent_failure_raises_transport_error(self) -> None:
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response(status_code=500))
        with self.assertRaises(ArenaTransportError) as ctx:
            client.get_json("item_search")
        self.assertIn("not an empty result", str(ctx.exception))

    def test_missing_object_is_a_not_found_error(self) -> None:
        client, transport = build_client(self.tmpdir)
        transport.add("GET /items", Response(status_code=404))
        with self.assertRaises(ArenaNotFoundError):
            client.get_json("item_search")

    def test_unroutable_request_fails_rather_than_passing_silently(self) -> None:
        client, _ = build_client(self.tmpdir)
        with self.assertRaises(ArenaTransportError) as ctx:
            client.get_json("item_files", item_guid="abc")
        self.assertIn("no route", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
