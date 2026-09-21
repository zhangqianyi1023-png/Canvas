import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from auth import create_password_hash
from main import app


class AuthApiTest(unittest.TestCase):
    def setUp(self):
        self.password_hash = create_password_hash("secret-pass", salt="fixed-salt", iterations=1000)
        self.env = patch.dict(os.environ, {
            "INUX_ENV": "production",
            "INUX_AUTH_USER": "demo",
            "INUX_AUTH_PASSWORD_HASH": self.password_hash,
            "INUX_AUTH_SESSION_SECRET": "unit-test-secret",
        }, clear=False)
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.env.stop()

    def test_login_sets_authenticated_session(self):
        response = self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "secret-pass",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "username": "demo"})
        self.assertIn("inux_session", response.cookies)

        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json(), {"authenticated": True, "username": "demo"})

    def test_login_rejects_bad_credentials(self):
        response = self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "wrong-pass",
        })
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "用户名或密码错误")

    def test_me_reports_signed_out_without_session(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"authenticated": False})

    def test_logout_clears_session(self):
        self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "secret-pass",
        })
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.assertEqual(self.client.get("/api/auth/me").json(), {"authenticated": False})

    def test_production_api_requires_session(self):
        response = self.client.get("/api/models")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "请先登录")

        self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "secret-pass",
        })
        authenticated_response = self.client.get("/api/models")
        self.assertEqual(authenticated_response.status_code, 200)
        self.assertIn("nodes", authenticated_response.json())

    def test_missing_production_credentials_fail_closed(self):
        with patch.dict(os.environ, {
            "INUX_ENV": "production",
            "INUX_AUTH_USER": "",
            "INUX_AUTH_PASSWORD_HASH": "",
            "INUX_AUTH_SESSION_SECRET": "unit-test-secret",
        }, clear=False):
            response = self.client.post("/api/auth/login", json={
                "username": "demo",
                "password": "secret-pass",
            })
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "登录凭据未配置")


if __name__ == "__main__":
    unittest.main()
