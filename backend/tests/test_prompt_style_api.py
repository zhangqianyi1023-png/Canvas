import tempfile
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.prompt_style_api import create_prompt_style_router
from backend.prompt_style_store import PromptStyleStore


class PromptStyleApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PromptStyleStore(f"{self.temp_dir.name}/prompt-styles.sqlite3")
        app = FastAPI()
        app.include_router(create_prompt_style_router(self.store))
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.store.close()
        self.temp_dir.cleanup()

    def test_admin_can_create_update_and_public_can_read_enabled_style(self):
        created = self.client.post(
            "/api/admin/prompt-styles",
            json={
                "name": "小红书清透感",
                "category": "小红书",
                "prompt": "清透自然光，生活方式种草风。",
                "coverUrl": "/uploads/style.png",
            },
        )
        self.assertEqual(created.status_code, 200)
        style_id = created.json()["id"]

        updated = self.client.put(
            f"/api/admin/prompt-styles/{style_id}",
            json={"sortOrder": 8},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["sortOrder"], 8)

        public = self.client.get("/api/prompt-styles").json()
        self.assertEqual(public["styles"][0]["name"], "小红书清透感")
        self.assertEqual(public["styles"][0]["prompt"], "清透自然光，生活方式种草风。")

    def test_disabled_style_is_hidden_from_public_api(self):
        created = self.client.post(
            "/api/admin/prompt-styles",
            json={
                "name": "停用风格",
                "category": "抖音",
                "prompt": "不会展示。",
                "enabled": False,
            },
        )
        self.assertEqual(created.status_code, 200)

        public = self.client.get("/api/prompt-styles").json()

        self.assertEqual(public["styles"], [])

    def test_delete_removes_style_from_admin_list(self):
        created = self.client.post(
            "/api/admin/prompt-styles",
            json={
                "name": "公众号风格",
                "category": "公众号",
                "prompt": "清晰标题，封面构图。",
            },
        ).json()

        response = self.client.delete(f"/api/admin/prompt-styles/{created['id']}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/admin/prompt-styles").json()["styles"], [])


if __name__ == "__main__":
    unittest.main()
