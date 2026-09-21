import tempfile
import unittest

from backend.prompt_style_store import PromptStyleStore


class PromptStyleStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PromptStyleStore(f"{self.temp_dir.name}/prompt-styles.sqlite3")

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def test_public_styles_only_include_enabled_items(self):
        enabled = self.store.create_style({
            "name": "小红书清透感",
            "category": "小红书",
            "prompt": "清透自然光，生活方式种草风。",
            "sortOrder": 2,
        })
        self.store.create_style({
            "name": "停用风格",
            "category": "小红书",
            "prompt": "不会展示。",
            "enabled": False,
            "sortOrder": 1,
        })

        public = self.store.list_public_styles()

        self.assertEqual([item["id"] for item in public], [enabled["id"]])

    def test_update_style_preserves_existing_fields(self):
        style = self.store.create_style({
            "name": "公众号质感",
            "category": "公众号",
            "prompt": "杂志封面质感。",
            "coverUrl": "/uploads/cover.png",
        })

        updated = self.store.update_style(style["id"], {"name": "公众号高级质感"})

        self.assertEqual(updated["name"], "公众号高级质感")
        self.assertEqual(updated["category"], "公众号")
        self.assertEqual(updated["prompt"], "杂志封面质感。")
        self.assertEqual(updated["coverUrl"], "/uploads/cover.png")

    def test_deleted_style_is_hidden_from_admin_and_public_lists(self):
        style = self.store.create_style({
            "name": "抖音强钩子",
            "category": "抖音",
            "prompt": "高对比，强视觉钩子。",
        })

        self.store.delete_style(style["id"])

        self.assertEqual(self.store.list_styles(), [])
        self.assertEqual(self.store.list_public_styles(), [])

    def test_create_requires_name_and_prompt(self):
        with self.assertRaisesRegex(ValueError, "风格名称不能为空"):
            self.store.create_style({"name": "", "prompt": "内容"})
        with self.assertRaisesRegex(ValueError, "提示词内容不能为空"):
            self.store.create_style({"name": "风格", "prompt": ""})


if __name__ == "__main__":
    unittest.main()
