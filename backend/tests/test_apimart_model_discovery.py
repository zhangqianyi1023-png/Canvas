import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException

import main


class APIMartModelDiscoveryTest(unittest.TestCase):
    @patch("main.requests.get")
    def test_fetch_models_marks_adapted_and_unadapted_images(self, get):
        response = Mock()
        response.status_code = 200
        response.url = "https://api.test/v1/models?expand=parameters"
        response.json.return_value = {
            "data": [
                {"id": "gemini-3-pro-image-preview", "category": "image"},
                {"id": "future-image-model", "category": "image"},
                {"id": "gpt-5.6-luna", "category": "chat"},
            ]
        }
        get.return_value = response

        result = main.fetch_provider_models(main.ProviderProbeRequest(
            base_url="https://api.test/v1",
            api_key="secret",
            protocol="apimart",
        ))

        self.assertTrue(result["ok"])
        self.assertTrue(result["enforce_image_adaptation"])
        self.assertEqual(result["image_models"], ["gemini-3-pro-image-preview", "future-image-model"])
        self.assertTrue(result["image_model_support"]["gemini-3-pro-image-preview"]["adapted"])
        self.assertFalse(result["image_model_support"]["future-image-model"]["adapted"])
        self.assertEqual(get.call_args.kwargs["params"], {"expand": "category"})

    @patch("main.requests.get")
    def test_fetch_models_expands_gpt_image_25_ext_versions(self, get):
        response = Mock()
        response.status_code = 200
        response.url = "https://api.test/v1/models?expand=parameters"
        response.json.return_value = {
            "data": [
                {"id": "gpt-image-2.5-ext", "category": "image"},
            ]
        }
        get.return_value = response

        result = main.fetch_provider_models(main.ProviderProbeRequest(
            base_url="https://api.test/v1",
            api_key="secret",
            protocol="apimart",
        ))

        self.assertEqual(result["image_models"], ["gpt-image-2.5-ext-flare", "gpt-image-2.5-ext-sunburst"])
        self.assertTrue(result["image_model_support"]["gpt-image-2.5-ext-flare"]["adapted"])
        self.assertTrue(result["image_model_support"]["gpt-image-2.5-ext-sunburst"]["adapted"])

    @patch("main.requests.get")
    def test_fetch_models_exposes_image_capabilities_for_non_apimart_protocol(self, get):
        response = Mock()
        response.status_code = 200
        response.url = "https://relay.test/v1/models"
        response.json.return_value = {
            "data": [
                {"id": "gpt-image-2", "category": "image"},
                {"id": "dreamina-seedance-2-5-260628", "category": "video"},
                {"id": "future-image-model", "category": "image"},
            ]
        }
        get.return_value = response

        result = main.fetch_provider_models(main.ProviderProbeRequest(
            base_url="https://relay.test/v1",
            api_key="secret",
            protocol="openai",
        ))

        self.assertTrue(result["ok"])
        self.assertFalse(result["enforce_image_adaptation"])
        self.assertTrue(result["image_model_support"]["gpt-image-2"]["adapted"])
        self.assertFalse(result["image_model_support"]["future-image-model"]["adapted"])
        self.assertTrue(result["video_model_support"]["dreamina-seedance-2-5-260628"]["adapted"])
        self.assertEqual(
            result["video_model_support"]["dreamina-seedance-2-5-260628"]["capabilities"]["maxDuration"],
            30,
        )

    def test_invalid_provider_model_ids_are_not_shown(self):
        result = main.categorize_model_ids([
            "gpt-image-2",
            '["doubao-seedance-4-0"',
            '"doubao-seedance-4-5"]',
        ], protocol="apimart")

        self.assertEqual(result["all_models"], ["gpt-image-2"])

    def test_minimax_h3_is_categorized_as_video(self):
        result = main.categorize_model_ids([
            "MiniMax-H3",
            "deepseek-v3",
        ], protocol="minimax")

        self.assertEqual(result["video_models"], ["MiniMax-H3"])
        self.assertEqual(result["text_models"], ["deepseek-v3"])

    def test_new_video_models_are_categorized_as_video(self):
        models = [
            "kling-v3",
            "sora-2",
            "wan3.0-video",
            "happyhorse",
            "gemini-omni",
            "grok-imagine-1.5-video",
            "deepseek-v3",
        ]

        result = main.categorize_model_ids(models, protocol="openai")

        self.assertEqual(result["video_models"], models[:-1])
        self.assertEqual(result["text_models"], ["deepseek-v3"])

    def test_save_settings_rejects_unadapted_apimart_image_model(self):
        settings = main.RuntimeSettings(providers=[main.RuntimeProvider(
            id="apimart",
            protocol="apimart",
            imageModels=["future-image-model"],
        )])

        with self.assertRaises(HTTPException) as caught:
            main.save_runtime_settings(settings)

        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn("尚未适配", caught.exception.detail)

    def test_save_settings_persists_capabilities_for_adapted_models(self):
        settings = main.RuntimeSettings(providers=[main.RuntimeProvider(
            id="apimart",
            protocol="apimart",
            imageModels=["gpt-image-2"],
            defaultImageModel="gpt-image-2",
        )])

        with tempfile.TemporaryDirectory() as temporary:
            settings_path = Path(temporary) / "runtime-settings.json"
            with patch.object(main, "ADMIN_DATA_DIR", temporary), patch.object(
                main,
                "RUNTIME_SETTINGS_FILE",
                str(settings_path),
            ):
                saved = main.save_runtime_settings(settings)

        capability = saved.providers[0].imageModelCapabilities["gpt-image-2"]
        self.assertTrue(capability["adapted"])
        self.assertIn("文生图", capability["capabilityLabels"])

    def test_save_settings_expands_gpt_image_25_ext_versions(self):
        settings = main.RuntimeSettings(providers=[main.RuntimeProvider(
            id="apimart",
            protocol="apimart",
            imageModels=["gpt-image-2.5-ext"],
            defaultImageModel="gpt-image-2.5-ext",
        )])

        with tempfile.TemporaryDirectory() as temporary:
            settings_path = Path(temporary) / "runtime-settings.json"
            with patch.object(main, "ADMIN_DATA_DIR", temporary), patch.object(
                main,
                "RUNTIME_SETTINGS_FILE",
                str(settings_path),
            ):
                saved = main.save_runtime_settings(settings)

        self.assertEqual(saved.providers[0].imageModels, ["gpt-image-2.5-ext-flare", "gpt-image-2.5-ext-sunburst"])
        self.assertEqual(saved.providers[0].defaultImageModel, "gpt-image-2.5-ext-flare")
        self.assertTrue(saved.providers[0].imageModelCapabilities["gpt-image-2.5-ext-flare"]["adapted"])
        self.assertTrue(saved.providers[0].imageModelCapabilities["gpt-image-2.5-ext-sunburst"]["adapted"])

    def test_save_settings_merges_capabilities_for_non_apimart_provider(self):
        settings = main.RuntimeSettings(providers=[main.RuntimeProvider(
            id="relay",
            protocol="openai",
            imageModels=["gpt-image-2"],
            imageModelCapabilities={
                "gpt-image-2": {"note": "custom override"},
            },
            defaultImageModel="gpt-image-2",
        )])

        with tempfile.TemporaryDirectory() as temporary:
            settings_path = Path(temporary) / "runtime-settings.json"
            with patch.object(main, "ADMIN_DATA_DIR", temporary), patch.object(
                main,
                "RUNTIME_SETTINGS_FILE",
                str(settings_path),
            ):
                saved = main.save_runtime_settings(settings)

        capability = saved.providers[0].imageModelCapabilities["gpt-image-2"]
        self.assertTrue(capability["adapted"])
        self.assertEqual(capability["note"], "custom override")


if __name__ == "__main__":
    unittest.main()
