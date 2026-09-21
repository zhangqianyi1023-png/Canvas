import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
import requests


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from nodes.image import ImageNode
from providers.apimart import _upload_image_bytes


class ImageUploadTest(unittest.TestCase):
    @patch("providers.openai_compatible.requests.get")
    def test_query_task_rejects_payload_without_status(self, get):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"error": {"message": "task lookup failed"}}
        get.return_value = response

        result = ImageNode().query_task(
            task_id="task_123",
            api_base_url="https://api.example.com/v1",
            api_key="secret",
        )

        self.assertFalse(result["success"])
        self.assertIn("task lookup failed", result["error"])

    @patch("providers.apimart.httpx.Client")
    def test_reference_upload_uses_http2_and_file_field(self, client_class):
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"url": "https://cdn.example.com/reference.png"}

        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response

        result = _upload_image_bytes(
            "secret",
            "reference.png",
            b"image-bytes",
            "image/png",
            "https://api.example.com/v1",
        )

        self.assertEqual(result, "https://cdn.example.com/reference.png")
        client_class.assert_called_once_with(http2=True, timeout=30)
        _, kwargs = client.post.call_args
        self.assertEqual(set(kwargs["files"]), {"file"})
        self.assertEqual(
            kwargs["files"]["file"],
            ("reference.png", b"image-bytes", "image/png"),
        )

    @patch("providers.apimart.requests.post")
    @patch("providers.apimart.httpx.Client")
    def test_reference_upload_falls_back_after_httpx_disconnect(self, client_class, requests_post):
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"url": "https://cdn.example.com/reference.png"}

        http2_client = Mock()
        http2_client.post.side_effect = httpx.RemoteProtocolError("Server disconnected")
        http1_client = Mock()
        http1_client.post.return_value = response
        client_class.return_value.__enter__.side_effect = [http2_client, http1_client]

        result = _upload_image_bytes(
            "secret",
            "reference.png",
            b"image-bytes",
            "image/png",
            "https://api.example.com/v1",
        )

        self.assertEqual(result, "https://cdn.example.com/reference.png")
        self.assertEqual(client_class.call_count, 2)
        client_class.assert_any_call(http2=True, timeout=30)
        client_class.assert_any_call(http2=False, timeout=30)
        requests_post.assert_not_called()

    @patch("nodes.image.default_asset_store.localize_url")
    @patch("nodes.image.time.sleep")
    @patch("providers.openai_compatible.requests.get")
    @patch("providers.openai_compatible.requests.post")
    def test_completed_generation_does_not_return_remote_url_when_local_save_fails(
        self,
        post,
        get,
        sleep,
        localize_url,
    ):
        node = ImageNode()
        submit_response = Mock()
        submit_response.raise_for_status.return_value = None
        submit_response.json.return_value = {"data": [{"task_id": "task_123"}]}
        post.return_value = submit_response

        poll_response = Mock()
        poll_response.json.return_value = {
            "data": {
                "status": "completed",
                "result": {
                    "images": [{"url": "https://cdn.example.com/generated.png"}],
                },
            },
        }
        get.return_value = poll_response
        localize_url.side_effect = requests.exceptions.ChunkedEncodingError("incomplete response")

        result = node.execute(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            prompt="cat",
            poll_interval=0,
            timeout=1,
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["image_url"], "")
        self.assertEqual(result["image_urls"], [])
        self.assertEqual(result["source_image_urls"], ["https://cdn.example.com/generated.png"])
        self.assertEqual(result["image_assets"], [])
        self.assertEqual(result["persistence_status"], "save_failed")
        self.assertIn("保存到本地失败", result["save_warnings"][0])


if __name__ == "__main__":
    unittest.main()
