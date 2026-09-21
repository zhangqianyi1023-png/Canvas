import tempfile
import unittest
import base64
from pathlib import Path
from unittest.mock import Mock, patch

import requests

from backend.assets import AssetStore


class AssetStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = AssetStore(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_bytes_deduplicates_by_content(self):
        first = self.store.save_bytes(b"same-image", "image/png")
        second = self.store.save_bytes(b"same-image", "image/png")

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["url"], second["url"])
        self.assertEqual(
            len([path for path in Path(self.temp_dir.name).iterdir() if path.name != "asset-index.json"]),
            1,
        )

    def test_register_local_url_preserves_a_durable_copy(self):
        source = Path(self.temp_dir.name) / "legacy.png"
        source.write_bytes(b"legacy-image")

        asset = self.store.register_local_url("/uploads/legacy.png")

        self.assertTrue(asset["url"].startswith("/uploads/"))
        self.assertTrue((Path(self.temp_dir.name) / asset["filename"]).is_file())

    @patch("backend.assets.requests.get")
    def test_localize_remote_url(self, get):
        response = Mock()
        response.content = b"remote-image"
        response.headers = {"Content-Type": "image/webp"}
        response.iter_content.return_value = [response.content]
        response.raise_for_status.return_value = None
        get.return_value = response

        asset = self.store.localize_url("https://cdn.example.com/result.webp")

        self.assertEqual(asset["sourceUrl"], "https://cdn.example.com/result.webp")
        self.assertEqual(asset["mimeType"], "image/webp")
        self.assertTrue((Path(self.temp_dir.name) / asset["filename"]).is_file())

    def test_localize_base64_data_url(self):
        encoded = base64.b64encode(b"inline-image").decode("ascii")

        asset = self.store.localize_url(f"data:image/png;base64,{encoded}")

        self.assertEqual(asset["mimeType"], "image/png")
        self.assertEqual(asset["byteSize"], len(b"inline-image"))
        self.assertTrue((Path(self.temp_dir.name) / asset["filename"]).is_file())

    @patch("backend.assets.time.sleep")
    @patch("backend.assets.requests.get")
    def test_localize_remote_url_retries_incomplete_download(self, get, sleep):
        response = Mock()
        response.content = b"complete-image"
        response.headers = {
            "Content-Type": "image/png",
            "Content-Length": str(len(response.content)),
        }
        response.iter_content.return_value = [response.content]
        response.raise_for_status.return_value = None
        get.side_effect = [
            requests.exceptions.ChunkedEncodingError("incomplete response"),
            response,
        ]

        asset = self.store.localize_url("https://cdn.example.com/result.png")

        self.assertEqual(get.call_count, 2)
        sleep.assert_called_once()
        self.assertEqual(asset["byteSize"], len(b"complete-image"))

    @patch("backend.assets.time.sleep")
    @patch("backend.assets.requests.get")
    def test_localize_remote_url_retries_content_length_mismatch(self, get, sleep):
        truncated = Mock()
        truncated.content = b"partial"
        truncated.headers = {
            "Content-Type": "image/png",
            "Content-Length": "100",
        }
        truncated.iter_content.return_value = [truncated.content]
        truncated.raise_for_status.return_value = None

        complete = Mock()
        complete.content = b"complete-image"
        complete.headers = {
            "Content-Type": "image/png",
            "Content-Length": str(len(complete.content)),
        }
        complete.iter_content.return_value = [complete.content]
        complete.raise_for_status.return_value = None
        get.side_effect = [truncated, complete]

        asset = self.store.localize_url("https://cdn.example.com/result.png")

        self.assertEqual(get.call_count, 2)
        sleep.assert_called_once()
        self.assertEqual(asset["byteSize"], len(b"complete-image"))

    def test_rejects_unsupported_media(self):
        with self.assertRaisesRegex(ValueError, "不支持的媒体格式"):
            self.store.save_bytes(b"plain-text", "text/plain")

    def test_save_bytes_supports_audio_assets(self):
        asset = self.store.save_bytes(b"audio-bytes", "audio/mpeg")

        self.assertEqual(asset["mediaType"], "audio")
        self.assertEqual(asset["mimeType"], "audio/mpeg")
        self.assertTrue(asset["filename"].endswith(".mp3"))

    def test_list_assets_returns_existing_assets_newest_first(self):
        first = self.store.save_bytes(b"first-image", "image/png")
        second = self.store.save_bytes(b"second-image", "image/png")

        assets = self.store.list_assets()

        self.assertEqual([item["id"] for item in assets], [second["id"], first["id"]])
        self.assertEqual(assets[0]["mediaType"], "image")


if __name__ == "__main__":
    unittest.main()
