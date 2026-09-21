import unittest
from unittest.mock import Mock

from task_media import (
    extract_task_source_urls,
    normalize_task_media_fields,
    persist_task_source_urls,
)


class TaskMediaTest(unittest.TestCase):
    def test_extracts_image_source_urls_from_provider_result(self):
        result = {
            "images": [
                {"url": ["https://ts.example.com/a.png", "https://ts.example.com/b.png"]},
            ],
        }

        self.assertEqual(
            extract_task_source_urls("image", result),
            ["https://ts.example.com/a.png", "https://ts.example.com/b.png"],
        )

    def test_extracts_image_data_url_from_provider_result(self):
        data_url = "data:image/png;base64,YWJj"

        self.assertEqual(
            extract_task_source_urls("image", {"images": [{"url": [data_url]}]}),
            [data_url],
        )

    def test_persistence_keeps_source_url_when_server_save_fails(self):
        store = Mock()
        store.localize_url.side_effect = RuntimeError("download failed")

        persisted = persist_task_source_urls(
            "image",
            ["https://ts.example.com/a.png"],
            store,
        )

        self.assertFalse(persisted["ok"])
        self.assertEqual(persisted["source_urls"], ["https://ts.example.com/a.png"])
        self.assertEqual(persisted["server_urls"], [])
        self.assertEqual(persisted["media_records"][0]["source_url"], "https://ts.example.com/a.png")
        self.assertEqual(persisted["media_records"][0]["server_url"], "")
        self.assertIn("download failed", persisted["save_error"])

    def test_persistence_builds_local_canvas_result(self):
        store = Mock()
        store.localize_url.return_value = {
            "id": "asset-1",
            "url": "/uploads/a.png",
        }

        persisted = persist_task_source_urls(
            "image",
            ["https://ts.example.com/a.png"],
            store,
        )

        self.assertTrue(persisted["ok"])
        self.assertEqual(persisted["server_urls"], ["/uploads/a.png"])
        self.assertEqual(
            persisted["result"],
            {"images": [{"url": ["/uploads/a.png"]}]},
        )

    def test_legacy_remote_only_completed_task_is_exposed_as_save_failed(self):
        normalized = normalize_task_media_fields({
            "status": "completed",
            "type": "image",
            "result": {
                "images": [{"url": ["https://ts.example.com/a.png"]}],
            },
        })

        self.assertEqual(normalized["status"], "save_failed")
        self.assertEqual(normalized["source_urls"], ["https://ts.example.com/a.png"])
        self.assertEqual(normalized["server_urls"], [])


if __name__ == "__main__":
    unittest.main()
