import unittest
from unittest.mock import Mock, patch

from nodes.video import VideoNode


class VideoNodeTest(unittest.TestCase):
    @patch("nodes.video.get_provider_adapter")
    def test_video_node_uses_seedance_capability_table(self, get_adapter):
        adapter = Mock()
        adapter.submit_video.return_value.status = "running"
        adapter.submit_video.return_value.upstream_task_id = "task_123"
        get_adapter.return_value = adapter

        result = VideoNode().submit(
            api_base_url="https://api.apimart.test/v1",
            api_key="secret",
            prompt="city walk",
            model="dreamina-seedance-2-5-260628",
            duration=30,
            aspect_ratio="9:16",
            resolution="1080p",
            image_urls=["https://cdn.test/reference.png"],
            video_urls=["https://cdn.test/reference.mp4"],
            api_protocol="apimart",
        )

        self.assertTrue(result["success"])
        payload = adapter.submit_video.call_args.kwargs["payload"]
        self.assertEqual(payload["duration"], 30)
        self.assertEqual(payload["size"], "9:16")
        self.assertEqual(payload["resolution"], "1080p")
        self.assertEqual(payload["video_urls"], ["https://cdn.test/reference.mp4"])
        self.assertEqual(payload["reference_video_urls"], ["https://cdn.test/reference.mp4"])

    @patch("nodes.video.get_provider_adapter")
    def test_video_node_submits_first_last_frame_roles(self, get_adapter):
        adapter = Mock()
        adapter.submit_video.return_value.status = "running"
        adapter.submit_video.return_value.upstream_task_id = "task_456"
        get_adapter.return_value = adapter

        result = VideoNode().submit(
            prompt="从首帧自然过渡到尾帧",
            model="dreamina-seedance-2-0-260128",
            duration=5,
            aspect_ratio="16:9",
            resolution="720p",
            generation_mode="first_last_frame",
            image_with_roles=[
                {"url": "https://cdn.test/first.png", "role": "first_frame", "name": "首帧"},
                {"url": "https://cdn.test/last.png", "role": "last_frame", "name": "尾帧"},
            ],
            image_urls=["https://cdn.test/ignored.png"],
            video_urls=["https://cdn.test/ignored.mp4"],
            api_protocol="apimart",
        )

        self.assertTrue(result["success"])
        payload = adapter.submit_video.call_args.kwargs["payload"]
        references = adapter.submit_video.call_args.kwargs["references"]
        self.assertEqual(payload["generation_mode"], "first_last_frame")
        self.assertEqual(
            payload["image_with_roles"],
            [
                {"url": "https://cdn.test/first.png", "role": "first_frame", "name": "首帧"},
                {"url": "https://cdn.test/last.png", "role": "last_frame", "name": "尾帧"},
            ],
        )
        self.assertNotIn("video_urls", payload)
        self.assertEqual(references, [])

    def test_video_node_rejects_incomplete_first_last_frame(self):
        result = VideoNode().submit(
            prompt="从首帧自然过渡到尾帧",
            model="dreamina-seedance-2-0-260128",
            duration=5,
            aspect_ratio="16:9",
            resolution="720p",
            generation_mode="first_last_frame",
            image_with_roles=[
                {"url": "https://cdn.test/first.png", "role": "first_frame"},
            ],
        )

        self.assertFalse(result["success"])
        self.assertIn("首尾帧模式", result["error"])

    @patch("nodes.video.get_provider_adapter")
    def test_video_node_accepts_minimax_h3_capabilities(self, get_adapter):
        adapter = Mock()
        adapter.submit_video.return_value.status = "running"
        adapter.submit_video.return_value.upstream_task_id = "task_h3"
        get_adapter.return_value = adapter

        result = VideoNode().submit(
            prompt="参考图生成产品视频",
            model="MiniMax-H3",
            duration=15,
            aspect_ratio="21:9",
            resolution="2K",
            image_urls=["https://cdn.test/reference.png"],
            generation_mode="omni_reference",
            api_protocol="minimax",
        )

        self.assertTrue(result["success"])
        payload = adapter.submit_video.call_args.kwargs["payload"]
        self.assertEqual(payload["duration"], 15)
        self.assertEqual(payload["size"], "21:9")
        self.assertEqual(payload["resolution"], "2K")
        self.assertEqual(payload["generation_mode"], "omni_reference")

    def test_video_node_rejects_seedance_2_fast_invalid_duration(self):
        result = VideoNode().submit(
            prompt="city walk",
            model="dreamina-seedance-2-0-fast-260128",
            duration=30,
            aspect_ratio="16:9",
            resolution="720p",
        )

        self.assertFalse(result["success"])
        self.assertIn("4 到 15 秒", result["error"])


if __name__ == "__main__":
    unittest.main()
