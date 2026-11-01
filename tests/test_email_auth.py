import hashlib
import unittest
from datetime import UTC, datetime, timedelta
from unittest import mock

import email_auth
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state

from server import make_app


class EmailAuthTestCase(AioHTTPTestCase):
    async def get_application(self):
        email_auth._attempts.clear()
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def signup(self, username="Queen_1", email="Queen@Example.com", password="secret123"):
        return await self.client.post(
            "/api/auth/signup", json={"username": username, "email": email, "password": password}
        )

    def test_password_hash_roundtrip(self):
        stored = email_auth.hash_password("correct horse")
        self.assertTrue(stored.startswith("scrypt$"))
        self.assertTrue(email_auth.check_password("correct horse", stored))
        self.assertFalse(email_auth.check_password("wrong", stored))
        self.assertFalse(email_auth.check_password("x", None))
        self.assertFalse(email_auth.check_password("x", "garbage"))

    async def test_page_is_served(self):
        resp = await self.client.get("/login/email")
        self.assertEqual(resp.status, 200)
        self.assertIn("Twin Queens", await resp.text())

    async def test_signup_and_login(self):
        resp = await self.signup()
        self.assertEqual(resp.status, 200, await resp.text())
        self.assertTrue((await resp.json())["success"])

        app_state = get_app_state(self.app)
        user = await app_state.db.user.find_one({"_id": "Queen_1"})
        self.assertEqual(user["oauth_provider"], "email")
        self.assertEqual(user["oauth_id"], "queen@example.com")
        self.assertFalse(user["emailVerified"])
        self.assertNotIn("secret123", user["passwordHash"])

        # duplicates
        self.assertEqual((await (await self.signup()).json())["error"], "username_taken")
        dup_email = await self.signup(username="Other")
        self.assertEqual((await dup_email.json())["error"], "email_taken")

        # login by username (any case) and by email
        for login in ("queen_1", "QUEEN@example.com"):
            resp = await self.client.post(
                "/api/auth/login", json={"login": login, "password": "secret123"}
            )
            self.assertEqual(resp.status, 200, login)
        resp = await self.client.post(
            "/api/auth/login", json={"login": "Queen_1", "password": "nope-nope"}
        )
        self.assertEqual(resp.status, 401)
        self.assertEqual((await resp.json())["error"], "bad_credentials")

    async def test_signup_validation(self):
        cases = [
            ({"username": "ab"}, "bad_username"),
            ({"username": "bad name"}, "bad_username"),
            ({"email": "not-an-email"}, "bad_email"),
            ({"password": "short"}, "weak_password"),
        ]
        for override, code in cases:
            body = {"username": "Valid_1", "email": "v@example.com", "password": "secret123"}
            body.update(override)
            resp = await self.client.post("/api/auth/signup", json=body)
            self.assertEqual((await resp.json())["error"], code, override)

    async def test_closed_account_cannot_login(self):
        await self.signup()
        app_state = get_app_state(self.app)
        await app_state.db.user.update_one({"_id": "Queen_1"}, {"$set": {"enabled": False}})
        app_state.users.data.pop("Queen_1", None)
        self.client.session.cookie_jar.clear()  # the page retries without the stale cookie
        resp = await self.client.post(
            "/api/auth/login", json={"login": "Queen_1", "password": "secret123"}
        )
        self.assertEqual((await resp.json())["error"], "closed")

    async def test_forgot_without_mail_and_reset_flow(self):
        await self.signup()
        resp = await self.client.post("/api/auth/forgot", json={"email": "queen@example.com"})
        self.assertEqual((await resp.json())["error"], "mail_unavailable")

        sent = []

        async def fake_send(to, subject, text):
            sent.append((to, text))
            return True

        with (
            mock.patch.object(email_auth, "mail_configured", return_value=True),
            mock.patch.object(email_auth, "send_mail", fake_send),
        ):
            resp = await self.client.post("/api/auth/forgot", json={"email": "QUEEN@example.com"})
            self.assertTrue((await resp.json())["success"])
            # unknown address gets the same answer and no mail
            resp = await self.client.post("/api/auth/forgot", json={"email": "nobody@example.com"})
            self.assertTrue((await resp.json())["success"])
        self.assertEqual(len(sent), 1)
        raw = sent[0][1].split("#reset=")[1].split()[0]

        resp = await self.client.post(
            "/api/auth/reset", json={"token": raw, "password": "brand-new-pass"}
        )
        self.assertEqual(resp.status, 200, await resp.text())
        # token is single-use
        resp = await self.client.post(
            "/api/auth/reset", json={"token": raw, "password": "another-pass"}
        )
        self.assertEqual((await resp.json())["error"], "bad_token")

        resp = await self.client.post(
            "/api/auth/login", json={"login": "Queen_1", "password": "brand-new-pass"}
        )
        self.assertEqual(resp.status, 200)
        app_state = get_app_state(self.app)
        user = await app_state.db.user.find_one({"_id": "Queen_1"})
        self.assertEqual(user["security"]["sessionVersion"], 1)

    async def test_verify_email(self):
        await self.signup()
        app_state = get_app_state(self.app)
        raw = "test-token"
        await app_state.db.email_token.insert_one(
            {
                "_id": hashlib.sha256(raw.encode()).hexdigest(),
                "kind": "verify",
                "username": "Queen_1",
                "email": "Queen@Example.com",
                "createdAt": datetime.now(UTC),
                "expiresAt": datetime.now(UTC) + timedelta(days=1),
            }
        )
        resp = await self.client.get("/auth/verify?token=" + raw, allow_redirects=False)
        self.assertEqual(resp.headers["Location"], "/login/email#verified")
        user = await app_state.db.user.find_one({"_id": "Queen_1"})
        self.assertTrue(user["emailVerified"])
        resp = await self.client.get("/auth/verify?token=" + raw, allow_redirects=False)
        self.assertEqual(resp.headers["Location"], "/login/email#verify-failed")

    async def test_login_rate_limit(self):
        for _ in range(10):
            await self.client.post("/api/auth/login", json={"login": "x", "password": "y"})
        resp = await self.client.post("/api/auth/login", json={"login": "x", "password": "y"})
        self.assertEqual(resp.status, 429)


if __name__ == "__main__":
    unittest.main()
