import unittest

from video_model_capabilities import (
    build_video_model_capability_map,
    get_video_model_support,
    normalize_video_request,
)


class VideoModelCapabilityRulesTest(unittest.TestCase):
    def test_seedance_families_are_recognized(self):
        expected = {
            "dreamina-seedance-2-0-260128": "seedance-2.0",
            "dreamina-seedance-2-0-mini-260615": "seedance-2.0-mini",
            "dreamina-seedance-2-0-fast-260128": "seedance-2.0-fast",
            "dreamina-seedance-2-5-260628": "seedance-2.5",
        }

        for model, family in expected.items():
            with self.subTest(model=model):
                support = get_video_model_support(model)
                self.assertTrue(support["adapted"])
                self.assertEqual(support["family"], family)
                self.assertEqual(
                    support["capabilities"]["generationModes"],
                    ["omni_reference", "first_last_frame"],
                )
                self.assertTrue(support["capabilities"]["supportsOmniReference"])
                self.assertTrue(support["capabilities"]["supportsFirstLastFrame"])

    def test_seedance_2_0_default_ratio_is_landscape_but_keeps_adaptive(self):
        support = get_video_model_support("seedance-2.0")

        self.assertEqual(support["capabilities"]["defaultRatio"], "16:9")
        self.assertEqual(
            support["capabilities"]["ratios"],
            ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
        )

    def test_minimax_h3_is_recognized(self):
        support = get_video_model_support("MiniMax-H3")

        self.assertTrue(support["adapted"])
        self.assertEqual(support["family"], "minimax-h3")
        self.assertEqual(support["capabilities"]["ratios"], ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"])
        self.assertEqual(support["capabilities"]["resolutions"], ["768P", "2K"])
        self.assertEqual(support["capabilities"]["minDuration"], 4)
        self.assertEqual(support["capabilities"]["maxDuration"], 15)
        self.assertEqual(support["capabilities"]["generationModes"], ["omni_reference", "first_last_frame"])

    def test_additional_video_models_are_recognized(self):
        expected = {
            "kling-v3": "kling-v3",
            "sora-2": "sora-2",
            "wan3.0-video": "wan3.0-video",
            "happyhorse": "happyhorse",
            "gemini-omni": "gemini-omni",
            "grok-imagine-1.5-video": "grok-imagine-1.5-video",
        }

        for model, family in expected.items():
            with self.subTest(model=model):
                support = get_video_model_support(model)
                self.assertTrue(support["adapted"])
                self.assertEqual(support["family"], family)
                self.assertTrue(support["capabilities"]["textToVideo"])
                self.assertIn(
                    support["capabilities"]["defaultRatio"],
                    support["capabilities"]["ratios"],
                )

    def test_multimodal_video_models_expose_reference_modes(self):
        expected_modes = {
            "kling-v3": ["first_last_frame"],
            "wan3.0-video": ["omni_reference", "first_last_frame"],
            "gemini-omni": [],
        }

        for model, modes in expected_modes.items():
            with self.subTest(model=model):
                support = get_video_model_support(model)
                self.assertEqual(support["capabilities"]["generationModes"], modes)
                self.assertEqual(
                    support["capabilities"]["supportsOmniReference"],
                    "omni_reference" in modes,
                )
                self.assertEqual(
                    support["capabilities"]["supportsFirstLastFrame"],
                    "first_last_frame" in modes,
                )

    def test_additional_video_model_capabilities_normalize_request(self):
        request = normalize_video_request(
            model="wan-3.0-video",
            duration=30,
            aspect_ratio="21:9",
            resolution="1080p",
            image_count=2,
            video_count=1,
            audio_count=1,
        )

        self.assertEqual(request["duration"], 30)
        self.assertEqual(request["aspect_ratio"], "21:9")
        self.assertEqual(request["resolution"], "1080p")

    def test_gemini_omni_uses_official_video_bounds(self):
        support = get_video_model_support("gemini-omni")

        self.assertEqual(support["capabilities"]["ratios"], ["16:9", "9:16"])
        self.assertEqual(support["capabilities"]["resolutions"], ["720p"])
        self.assertEqual(support["capabilities"]["maxDuration"], 10)
        self.assertFalse(support["capabilities"]["imageToVideo"])
        self.assertEqual(support["capabilities"]["generationModes"], [])

    def test_grok_imagine_15_video_falls_back_from_1080p(self):
        request = normalize_video_request(
            model="grok-imagine-1.5-video",
            duration=6,
            aspect_ratio="3:2",
            resolution="1080p",
        )

        self.assertEqual(request["aspect_ratio"], "3:2")
        self.assertEqual(request["resolution"], "720p")

    def test_sora_2_rejects_unsupported_ratio(self):
        with self.assertRaisesRegex(ValueError, "不支持比例 1:1"):
            normalize_video_request(
                model="sora-2",
                duration=8,
                aspect_ratio="1:1",
                resolution="720p",
            )

    def test_seedance_2_5_allows_30_seconds_and_1080p(self):
        request = normalize_video_request(
            model="dreamina-seedance-2-5-260628",
            duration=30,
            aspect_ratio="9:16",
            resolution="1080p",
            image_count=2,
        )

        self.assertEqual(request["duration"], 30)
        self.assertEqual(request["aspect_ratio"], "9:16")
        self.assertEqual(request["resolution"], "1080p")

    def test_seedance_2_mini_falls_back_to_default_resolution(self):
        request = normalize_video_request(
            model="dreamina-seedance-2-0-mini-260615",
            duration=5,
            aspect_ratio="16:9",
            resolution="1080p",
        )

        self.assertEqual(request["resolution"], "720p")

    def test_seedance_2_0_rejects_duration_past_15_seconds(self):
        with self.assertRaisesRegex(ValueError, "4 到 15 秒"):
            normalize_video_request(
                model="dreamina-seedance-2-0-260128",
                duration=30,
                aspect_ratio="16:9",
                resolution="720p",
            )

    def test_capability_map_preserves_existing_overrides(self):
        support = build_video_model_capability_map(
            ["dreamina-seedance-2-5-260628"],
            {"dreamina-seedance-2-5-260628": {"note": "relay override"}},
        )

        self.assertTrue(support["dreamina-seedance-2-5-260628"]["adapted"])
        self.assertEqual(support["dreamina-seedance-2-5-260628"]["note"], "relay override")


if __name__ == "__main__":
    unittest.main()
