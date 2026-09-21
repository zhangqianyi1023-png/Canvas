import tempfile
import unittest

from backend.workflow_template_store import WorkflowTemplateStore


def sample_graph(node_id="node_a"):
    return {
        "schemaVersion": 1,
        "nodes": [{"id": node_id, "type": "result", "data": {"resultType": "text"}}],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "pairs": [],
    }


class WorkflowTemplateStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = WorkflowTemplateStore(f"{self.temp_dir.name}/templates.sqlite3")

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def create_template(self, name="电商详情页"):
        category = self.store.create_category({"name": "电商工作流", "sortOrder": 10})
        template = self.store.create_template({
            "name": name,
            "description": "生成商品详情页",
            "categoryId": category["id"],
            "coverUrl": "/uploads/cover.png",
            "sortOrder": 10,
        })
        return category, template

    def test_draft_changes_do_not_replace_published_version(self):
        _category, template = self.create_template()
        self.store.save_draft(template["id"], sample_graph("node_a"))
        published = self.store.publish(template["id"])
        self.store.save_draft(template["id"], sample_graph("node_b"))

        public = self.store.get_public_template(template["id"])
        draft = self.store.get_draft(template["id"])

        self.assertEqual(public["versionId"], published["id"])
        self.assertEqual(public["workflowData"]["nodes"][0]["id"], "node_a")
        self.assertEqual(draft["workflowData"]["nodes"][0]["id"], "node_b")

    def test_unpublished_and_deleted_templates_are_not_public(self):
        _category, template = self.create_template("海报模板")
        self.store.save_draft(template["id"], sample_graph())

        self.assertEqual(self.store.list_public_templates(), [])
        self.store.publish(template["id"])
        self.assertEqual(len(self.store.list_public_templates()), 1)

        self.store.unpublish(template["id"])
        self.assertEqual(self.store.list_public_templates(), [])

        self.store.publish(template["id"])
        self.store.soft_delete_template(template["id"])
        self.assertEqual(self.store.list_public_templates(), [])

    def test_publish_creates_incrementing_immutable_versions(self):
        _category, template = self.create_template()
        self.store.save_draft(template["id"], sample_graph("node_1"))
        first = self.store.publish(template["id"])
        self.store.save_draft(template["id"], sample_graph("node_2"))
        second = self.store.publish(template["id"])

        versions = self.store.list_versions(template["id"])
        self.assertEqual([item["versionNumber"] for item in versions], [2, 1])
        self.assertEqual(first["versionNumber"], 1)
        self.assertEqual(second["versionNumber"], 2)
        self.assertEqual(versions[1]["workflowData"]["nodes"][0]["id"], "node_1")

    def test_non_empty_category_cannot_be_deleted(self):
        category, _template = self.create_template()
        with self.assertRaisesRegex(ValueError, "分组下仍有模板"):
            self.store.delete_category(category["id"])

    def test_category_soft_delete_preserves_deleted_template_history(self):
        category = self.store.create_category({"name": "历史分组"})
        template = self.store.create_template({
            "name": "历史模板",
            "categoryId": category["id"],
        })
        self.store.soft_delete_template(template["id"])

        self.store.delete_category(category["id"])

        self.assertEqual(self.store.list_categories(), [])
        template_rows = self.store.connection.execute(
            "SELECT category_id FROM workflow_templates WHERE id = ?",
            (template["id"],),
        ).fetchall()
        self.assertEqual(template_rows[0]["category_id"], category["id"])

    def test_disabled_category_hides_published_templates(self):
        category, template = self.create_template()
        self.store.save_draft(template["id"], sample_graph())
        self.store.publish(template["id"])
        self.store.update_category(category["id"], {"enabled": False})

        self.assertEqual(self.store.list_public_categories(), [])
        self.assertEqual(self.store.list_public_templates(), [])


if __name__ == "__main__":
    unittest.main()
