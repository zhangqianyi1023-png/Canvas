import unittest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from providers.base import ProviderError, UnsupportedProviderError, parse_submission, parse_task_result
from providers.apimart import APIMartAdapter
from providers.minimax import MiniMaxAdapter
from providers.openai_compatible import OpenAICompatibleAdapter
from providers.rightcode import RightCodeAdapter
from providers.registry import get_provider_adapter


class ProviderResponseParsingTest(unittest.TestCase):
    def test_parse_image_submission_accepts_url_and_base64(self):
        result = parse_submission({
            "data": [
                {"url": "https://cdn.test/a.png"},
                {"b64_json": "YWJj"},
            ],
        }, "image")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.result["images"][0]["url"], ["https://cdn.test/a.png"])
        self.assertEqual(result.result["images"][1]["url"], ["data:image/png;base64,YWJj"])

    def test_parse_async_submission_extracts_nested_task_id(self):
        result = parse_submission({"data": [{"task_id": "upstream-1"}]}, "image")

        self.assertEqual(result.status, "running")
        self.assertEqual(result.upstream_task_id, "upstream-1")

    def test_parse_video_submission_accepts_synchronous_url(self):
        result = parse_submission({"data": [{"url": "https://cdn.test/a.mp4"}]}, "video")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.result, {"video_url": "https://cdn.test/a.mp4"})

    def test_parse_task_result_normalizes_completed_result(self):
        result = parse_task_result({
            "data": {
                "status": "succeeded",
                "result": {"images": [{"url": "https://cdn.test/a.png"}]},
            },
        }, "image")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.result["images"][0]["url"], ["https://cdn.test/a.png"])

    def test_invalid_submission_reports_structure_without_body(self):
        with self.assertRaisesRegex(ProviderError, "对象字段: created, data"):
            parse_submission({"created": 1, "data": []}, "image")


class ProviderAdapterTest(unittest.TestCase):
    @patch("providers.openai_compatible.requests.post")
    def test_openai_adapter_accepts_sync_image_response(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        result = OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={"model": "image-model", "prompt": "cat"},
            references=[],
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.result, {"images": [{"url": ["https://cdn.test/a.png"]}]})
        self.assertEqual(post.call_args.args[0], "https://api.test/v1/images/generations")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer secret")

    @patch("providers.openai_compatible.requests.post")
    def test_openai_image_payload_removes_apimart_extensions(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={
                "model": "image-model",
                "prompt": "cat",
                "size": "16:9",
                "resolution": "2k",
            },
            references=[],
        )

        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["size"], "2048x1152")
        self.assertNotIn("resolution", request_payload)

    @patch("providers.openai_compatible.requests.post")
    def test_openai_image_payload_converts_ratio_and_keeps_quality(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={
                "model": "gpt-image-2",
                "prompt": "cat",
                "size": "3:4",
                "resolution": "1k",
                "quality": "high",
            },
            references=[],
        )

        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["size"], "768x1024")
        self.assertEqual(request_payload["quality"], "high")
        self.assertNotIn("resolution", request_payload)

    @patch("providers.openai_compatible.requests.post")
    def test_openai_image_payload_keeps_ratio_for_gemini_family(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={
                "model": "gemini-3-pro-image-preview",
                "prompt": "cat",
                "size": "3:4",
                "resolution": "1k",
            },
            references=[],
        )

        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["size"], "3:4")
        self.assertNotIn("resolution", request_payload)

    @patch("providers.openai_compatible.requests.post")
    def test_openai_image_reference_uses_multipart_edit_endpoint(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"b64_json": "YWJj"}]}
        post.return_value = response

        result = OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={"model": "image-model", "prompt": "keep the subject", "size": "16:9", "n": 1},
            references=["data:image/png;base64,aW1hZ2UtYnl0ZXM="],
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(post.call_args.args[0], "https://api.test/v1/images/edits")
        self.assertEqual(post.call_args.kwargs["data"]["model"], "image-model")
        self.assertEqual(post.call_args.kwargs["data"]["size"], "1536x864")
        self.assertNotIn("Content-Type", post.call_args.kwargs["headers"])
        self.assertEqual(post.call_args.kwargs["files"][0][0], "image")
        filename, content, mime = post.call_args.kwargs["files"][0][1]
        self.assertEqual(filename, "reference_1.png")
        self.assertEqual(content, b"image-bytes")
        self.assertEqual(mime, "image/png")

    @patch("providers.openai_compatible.requests.post")
    def test_openai_inpaint_sends_source_and_mask_as_distinct_files(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test/v1",
            api_key="secret",
            payload={
                "model": "image-model",
                "prompt": "replace the bag",
                "size": "1:1",
                "operation": "inpaint",
                "mask_url": "data:image/png;base64,bWFzay1ieXRlcw==",
            },
            references=["data:image/png;base64,aW1hZ2UtYnl0ZXM="],
        )

        self.assertEqual(post.call_args.args[0], "https://api.test/v1/images/edits")
        self.assertNotIn("operation", post.call_args.kwargs["data"])
        self.assertNotIn("mask_url", post.call_args.kwargs["data"])
        self.assertEqual([item[0] for item in post.call_args.kwargs["files"]], ["image", "mask"])
        self.assertEqual(post.call_args.kwargs["files"][0][1][1], b"image-bytes")
        self.assertEqual(post.call_args.kwargs["files"][1][1][1], b"mask-bytes")

    def test_apimart_inpaint_rejects_unsupported_models(self):
        with self.assertRaisesRegex(ProviderError, "不支持局部修改"):
            APIMartAdapter().submit_image(
                base_url="https://api.apimart.test/v1",
                api_key="secret",
                payload={
                    "model": "gemini-3-pro-image-preview",
                    "prompt": "replace the bag",
                    "operation": "inpaint",
                    "mask_url": "data:image/png;base64,bWFzay1ieXRlcw==",
                },
                references=["data:image/png;base64,aW1hZ2UtYnl0ZXM="],
            )

    @patch("providers.apimart.upload_reference_image", side_effect=[
        "https://cdn.test/reference.png",
        "https://cdn.test/mask.png",
    ])
    @patch("providers.openai_compatible.requests.post")
    def test_apimart_gpt_image_inpaint_uses_generation_json(self, post, upload_reference):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        result = APIMartAdapter().submit_image(
            base_url="https://api.apimart.test/v1",
            api_key="secret",
            payload={
                "model": "gpt-image-2-official",
                "prompt": "replace the bag",
                "operation": "inpaint",
                "mask_url": "data:image/png;base64,bWFzay1ieXRlcw==",
            },
            references=["data:image/png;base64,aW1hZ2UtYnl0ZXM="],
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(post.call_args.args[0], "https://api.apimart.test/v1/images/generations")
        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["image_url"], "https://cdn.test/reference.png")
        self.assertEqual(request_payload["image_urls"], ["https://cdn.test/reference.png"])
        self.assertEqual(request_payload["mask_url"], "https://cdn.test/mask.png")
        self.assertNotIn("operation", request_payload)
        self.assertEqual(upload_reference.call_count, 2)

    @patch("providers.apimart.upload_reference_image", return_value="https://cdn.test/reference.png")
    @patch("providers.openai_compatible.requests.post")
    def test_apimart_keeps_generation_reference_protocol(self, post, upload_reference):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        APIMartAdapter().submit_image(
            base_url="https://api.apimart.test/v1",
            api_key="secret",
            payload={"model": "gemini-3-pro-image-preview", "prompt": "keep the subject"},
            references=["/uploads/reference.png"],
        )

        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(post.call_args.args[0], "https://api.apimart.test/v1/images/generations")
        self.assertEqual(request_payload["image_url"], "https://cdn.test/reference.png")
        self.assertEqual(request_payload["image_urls"], ["https://cdn.test/reference.png"])
        upload_reference.assert_called_once_with(
            "secret",
            "/uploads/reference.png",
            "https://api.apimart.test/v1",
        )

    def test_registry_does_not_fall_back_to_apimart(self):
        with self.assertRaisesRegex(UnsupportedProviderError, "Gemini|gemini"):
            get_provider_adapter("gemini")

    def test_empty_base_url_is_rejected(self):
        with self.assertRaisesRegex(ProviderError, "Base URL"):
            OpenAICompatibleAdapter().submit_image(
                base_url="",
                api_key="secret",
                payload={"model": "image-model", "prompt": "cat"},
                references=[],
            )

    @patch("providers.openai_compatible.requests.post")
    def test_openai_base_url_adds_v1_once(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": [{"url": "https://cdn.test/a.png"}]}
        post.return_value = response

        OpenAICompatibleAdapter().submit_image(
            base_url="https://api.test",
            api_key="secret",
            payload={"model": "image-model", "prompt": "cat"},
            references=[],
        )

        self.assertEqual(post.call_args.args[0], "https://api.test/v1/images/generations")

    def test_openai_local_reference_is_encoded_for_remote_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "reference.png"
            image_path.write_bytes(b"image-bytes")
            with patch("providers.openai_compatible.UPLOAD_ROOT", temp_dir):
                prepared = OpenAICompatibleAdapter().prepare_references(
                    ["/uploads/reference.png"],
                    "https://api.test/v1",
                    "secret",
                )

        self.assertEqual(prepared, ["data:image/png;base64,aW1hZ2UtYnl0ZXM="])

    @patch("providers.rightcode.requests.post")
    def test_rightcode_image_generation_uses_draw_async_endpoint(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"task_id": "task_1", "status": "processing"}
        post.return_value = response

        result = RightCodeAdapter().submit_image(
            base_url="https://www.rightapi.ai",
            api_key="secret",
            payload={
                "model": "nano-banana-fast",
                "prompt": "cat",
                "size": "16:9",
                "resolution": "2k",
                "quality": "high",
                "background": "transparent",
                "output_format": "png",
            },
            references=[],
        )

        self.assertEqual(result.status, "running")
        self.assertEqual(result.upstream_task_id, "task_1")
        self.assertEqual(post.call_args.args[0], "https://www.rightapi.ai/draw/v1/images/generations")
        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["imageSize"], "2K")
        self.assertTrue(request_payload["async"])
        self.assertNotIn("resolution", request_payload)
        self.assertNotIn("quality", request_payload)
        self.assertNotIn("background", request_payload)
        self.assertNotIn("output_format", request_payload)

    @patch("providers.rightcode.requests.post")
    def test_rightcode_reference_images_use_image_array(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"task_id": "task_2"}
        post.return_value = response

        RightCodeAdapter().submit_image(
            base_url="https://www.rightapi.ai/draw/v1",
            api_key="secret",
            payload={"model": "nano-banana-fast", "prompt": "keep the subject", "size": "1:1"},
            references=["data:image/png;base64,aW1hZ2U="],
        )

        self.assertEqual(post.call_args.args[0], "https://www.rightapi.ai/draw/v1/images/generations")
        self.assertEqual(post.call_args.kwargs["json"]["image"], ["data:image/png;base64,aW1hZ2U="])
        self.assertNotIn("image_url", post.call_args.kwargs["json"])
        self.assertNotIn("image_urls", post.call_args.kwargs["json"])

    @patch("providers.rightcode.requests.get")
    def test_rightcode_task_query_accepts_completed_images_shape(self, get):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "created": 1782800000,
            "data": [{"url": "https://cdn.test/result.png"}],
        }
        get.return_value = response

        result = RightCodeAdapter().query_task(
            task_id="task_3",
            base_url="https://www.rightapi.ai",
            api_key="secret",
            media_type="image",
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.result, {"images": [{"url": ["https://cdn.test/result.png"]}]})
        self.assertEqual(get.call_args.args[0], "https://www.rightapi.ai/v1/tasks/task_3")

    @patch("providers.minimax.requests.post")
    def test_minimax_h3_first_last_frame_uses_content_roles(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"task_id": "mini_task_1"}
        post.return_value = response

        result = MiniMaxAdapter().submit_video(
            base_url="https://api.minimax.io",
            api_key="secret",
            payload={
                "model": "MiniMax-H3",
                "prompt": "从首帧过渡到尾帧",
                "duration": 5,
                "resolution": "768P",
                "size": "16:9",
                "generation_mode": "first_last_frame",
                "image_with_roles": [
                    {"url": "https://cdn.test/first.png", "role": "first_frame"},
                    {"url": "https://cdn.test/last.png", "role": "last_frame"},
                ],
            },
            references=[],
        )

        self.assertEqual(result.status, "running")
        self.assertEqual(result.upstream_task_id, "mini_task_1")
        self.assertEqual(post.call_args.args[0], "https://api.minimax.io/v2/video_generation")
        request_payload = post.call_args.kwargs["json"]
        self.assertEqual(request_payload["ratio"], "16:9")
        self.assertEqual(request_payload["content"][0], {"type": "text", "text": "从首帧过渡到尾帧"})
        self.assertEqual(request_payload["content"][1]["role"], "first_frame")
        self.assertEqual(request_payload["content"][2]["role"], "last_frame")

    @patch("providers.minimax.requests.post")
    def test_minimax_h3_omni_reference_uses_reference_roles(self, post):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"task_id": "mini_task_2"}
        post.return_value = response

        MiniMaxAdapter().submit_video(
            base_url="https://api.minimax.io/v2",
            api_key="secret",
            payload={
                "model": "minimax-h3",
                "prompt": "参考素材生成视频",
                "duration": 8,
                "resolution": "2K",
                "size": "9:16",
                "generation_mode": "omni_reference",
                "video_urls": ["https://cdn.test/ref.mp4"],
                "audio_urls": ["https://cdn.test/ref.mp3"],
            },
            references=["https://cdn.test/ref.png"],
        )

        self.assertEqual(post.call_args.args[0], "https://api.minimax.io/v2/video_generation")
        content = post.call_args.kwargs["json"]["content"]
        self.assertEqual([item["type"] for item in content], ["text", "image_url", "video_url", "audio_url"])
        self.assertEqual([item["role"] for item in content[1:]], ["reference_image", "reference_video", "reference_audio"])


if __name__ == "__main__":
    unittest.main()
