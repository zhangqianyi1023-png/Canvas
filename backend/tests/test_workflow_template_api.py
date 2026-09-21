import tempfile
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.assets import AssetStore
from backend.workflow_template_api import create_workflow_template_router
from backend.workflow_template_store import WorkflowTemplateStore


def valid_graph():
    return {
        "schemaVersion": 1,
        "nodes": [{
            "id": "text_1",
            "type": "result",
            "position": {"x": 0, "y": 0},
            "data": {"resultType": "text", "text": "示例"},
        }],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "pairs": [],
    }


class WorkflowTemplateApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = WorkflowTemplateStore(f"{self.temp_dir.name}/templates.sqlite3")
        self.assets = AssetStore(f"{self.temp_dir.name}/uploads")
        app = FastAPI()
        app.include_router(create_workflow_template_router(self.store, self.assets))
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.store.close()
        self.temp_dir.cleanup()

    def create_template(self, cover_url="/uploads/cover.png"):
        category = self.client.post(
            "/api/admin/template-categories",
            json={"name": "电商工作流"},
        ).json()
        template = self.client.post(
            "/api/admin/workflow-templates",
            json={
                "name": "电商详情页",
                "description": "一键生成详情页",
                "categoryId": category["id"],
                "coverUrl": cover_url,
            },
        ).json()
        return category, template

    def test_publish_exposes_template_to_public_api(self):
        _category, template = self.create_template()
        self.client.put(
            f"/api/admin/workflow-templates/{template['id']}/draft",
            json={"workflowData": valid_graph()},
        )
        response = self.client.post(
            f"/api/admin/workflow-templates/{template['id']}/publish"
        )
        self.assertEqual(response.status_code, 200)

        public = self.client.get("/api/workflow-templates").json()
        self.assertEqual(public["templates"][0]["name"], "电商详情页")
        detail = self.client.get(f"/api/workflow-templates/{template['id']}").json()
        self.assertEqual(detail["workflowData"]["nodes"][0]["id"], "text_1")

    def test_publish_rejects_empty_workflow(self):
        _category, template = self.create_template()
        self.client.put(
            f"/api/admin/workflow-templates/{template['id']}/draft",
            json={
                "workflowData": {
                    "schemaVersion": 1,
                    "nodes": [],
                    "edges": [],
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                    "pairs": [],
                }
            },
        )
        response = self.client.post(
            f"/api/admin/workflow-templates/{template['id']}/publish"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("至少包含一个有效节点", response.json()["detail"])

    def test_publish_rejects_missing_cover(self):
        _category, template = self.create_template(cover_url="")
        self.client.put(
            f"/api/admin/workflow-templates/{template['id']}/draft",
            json={"workflowData": valid_graph()},
        )
        response = self.client.post(
            f"/api/admin/workflow-templates/{template['id']}/publish"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("封面", response.json()["detail"])

    def test_unpublish_hides_template_but_preserves_versions(self):
        _category, template = self.create_template()
        self.client.put(
            f"/api/admin/workflow-templates/{template['id']}/draft",
            json={"workflowData": valid_graph()},
        )
        self.client.post(f"/api/admin/workflow-templates/{template['id']}/publish")
        self.client.post(f"/api/admin/workflow-templates/{template['id']}/unpublish")

        self.assertEqual(self.client.get("/api/workflow-templates").json()["templates"], [])
        versions = self.client.get(
            f"/api/admin/workflow-templates/{template['id']}/versions"
        ).json()
        self.assertEqual(len(versions["versions"]), 1)


if __name__ == "__main__":
    unittest.main()
