import base64
import tempfile
import unittest
from pathlib import Path

from copilot_target_images import (
    CopilotTargetImageError,
    attach_copilot_target_images,
    resolve_copilot_target_image,
)


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class CopilotTargetImageTests(unittest.TestCase):
    def test_resolves_a_local_upload_into_a_harness_image_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = Path(directory) / "pixel.png"
            image_path.write_bytes(PNG_BYTES)

            result = resolve_copilot_target_image("/uploads/pixel.png", directory)

        self.assertEqual(result["image_mime_type"], "image/png")
        self.assertEqual(base64.b64decode(result["image_data"]), PNG_BYTES)
        self.assertEqual(result["image_byte_size"], len(PNG_BYTES))

    def test_allows_only_loopback_absolute_upload_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "pixel.png").write_bytes(PNG_BYTES)
            result = resolve_copilot_target_image(
                "http://127.0.0.1:5173/uploads/pixel.png?preview=1",
                directory,
            )
            self.assertEqual(result["image_mime_type"], "image/png")

            with self.assertRaisesRegex(CopilotTargetImageError, "本地图片"):
                resolve_copilot_target_image("https://example.com/pixel.png", directory)

    def test_rejects_path_traversal_and_oversized_images(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "large.png").write_bytes(PNG_BYTES)
            with self.assertRaises(CopilotTargetImageError):
                resolve_copilot_target_image("/uploads/../secret.png", directory)
            with self.assertRaisesRegex(CopilotTargetImageError, "8MB"):
                resolve_copilot_target_image("/uploads/large.png", directory, max_bytes=4)

    def test_marks_unavailable_target_images_without_fetching_remote_urls(self):
        targets = attach_copilot_target_images([
            {"id": "image", "kind": "image", "thumbnail_url": "https://example.com/image.png"},
            {"id": "text", "kind": "text", "content": "hello"},
        ], "/tmp")

        self.assertFalse(targets[0]["image_attached"])
        self.assertIn("本地图片", targets[0]["image_error"])
        self.assertNotIn("image_data", targets[0])
        self.assertNotIn("image_attached", targets[1])


if __name__ == "__main__":
    unittest.main()
