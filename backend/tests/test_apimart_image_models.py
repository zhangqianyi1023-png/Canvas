import unittest

from apimart_image_models import (
    SPECS,
    apimart_image_generation_endpoint,
    get_apimart_image_model_support,
    prepare_apimart_image_payload,
    validate_apimart_image_request,
)


class APIMartImageModelRulesTest(unittest.TestCase):
    def test_catalog_recognizes_supported_model_families(self):
        models = [
            "gemini-3-pro-image-preview",
            "nano-banana-2-ext",
            "imagen-4.0-apimart",
            "gpt-image-1.5-official",
            "gpt-image-2",
            "gpt-image-2.5-flare",
            "gpt-image-2.5-sunburst",
            "gpt-image-2.5-ext",
            "gpt-image-2.5-ext-flare",
            "gpt-image-2.5-ext-sunburst",
            "seedream-4.5",
            "seedream-5-0-pro",
            "flux-kontext-max",
            "flux-2-flex",
            "qwen-image-2.0-pro",
            "qwen-image-3.0",
            "z-image-turbo",
            "grok-imagine-1.5-ext",
            "grok-imagine-2.0-ext",
            "grok-imagine-image-quality",
            "grok-imagine-image-2.0",
            "wan2.7-image-pro",
            "midjourney",
        ]

        for model in models:
            with self.subTest(model=model):
                self.assertTrue(get_apimart_image_model_support(model)["adapted"])

    def test_unknown_model_is_reported_as_unadapted(self):
        support = get_apimart_image_model_support("future-image-model")

        self.assertFalse(support["adapted"])
        self.assertEqual(support["status"], "unadapted")

    def test_every_catalog_family_can_prepare_its_default_request(self):
        for spec in SPECS:
            with self.subTest(family=spec.key):
                payload, resolved = prepare_apimart_image_payload({
                    "model": spec.aliases[0],
                    "prompt": "test image",
                    "size": spec.default_ratio,
                    "resolution": spec.default_resolution,
                    "quality": spec.quality_options[0] if spec.quality_options else "auto",
                    "n": 1,
                })

                self.assertEqual(resolved.key, spec.key)
                self.assertTrue(payload.get("prompt"))

    def test_gemini_keeps_ratio_and_separate_resolution(self):
        payload, _ = prepare_apimart_image_payload({
            "model": "gemini-3-pro-image-preview",
            "prompt": "cat",
            "size": "3:4",
            "resolution": "1k",
            "quality": "high",
            "n": 1,
        })

        self.assertEqual(payload["size"], "3:4")
        self.assertEqual(payload["resolution"], "1K")
        self.assertNotIn("quality", payload)

    def test_gpt_image_2_keeps_apimart_ratio_contract(self):
        payload, _ = prepare_apimart_image_payload({
            "model": "gpt-image-2",
            "prompt": "cat",
            "size": "3:4",
            "resolution": "2K",
            "quality": "high",
            "background": "transparent",
            "output_format": "png",
            "n": 1,
        })

        self.assertEqual(payload["size"], "3:4")
        self.assertEqual(payload["resolution"], "2k")
        self.assertEqual(payload["quality"], "high")
        self.assertEqual(payload["background"], "transparent")
        self.assertEqual(payload["output_format"], "png")

    def test_gpt_image_2_reports_quality_and_background_capabilities(self):
        support = get_apimart_image_model_support("gpt-image-2-official")

        capabilities = support["capabilities"]
        self.assertEqual(capabilities["qualityOptions"], ["auto", "low", "medium", "high"])
        self.assertEqual(capabilities["backgroundOptions"], ["auto", "opaque", "transparent"])
        self.assertEqual(capabilities["outputFormats"], ["png"])

    def test_gpt_image_25_supports_new_quality_and_output_formats(self):
        support = get_apimart_image_model_support("gpt-image-2.5-sunburst")

        capabilities = support["capabilities"]
        self.assertTrue(support["adapted"])
        self.assertEqual(support["family"], "gpt-image-2.5")
        self.assertEqual(capabilities["maxReferenceImages"], 16)
        self.assertEqual(capabilities["maxApiOutputCount"], 4)
        self.assertEqual(capabilities["qualityOptions"], ["auto", "low", "medium", "high", "xhigh", "max"])
        self.assertEqual(capabilities["backgroundOptions"], ["auto", "opaque", "transparent"])
        self.assertEqual(capabilities["outputFormats"], ["png", "jpeg", "webp"])

    def test_gpt_image_25_keeps_generation_contract(self):
        payload, _ = prepare_apimart_image_payload({
            "model": "gpt-image-2.5-flare",
            "prompt": "cat",
            "size": "21:9",
            "resolution": "4K",
            "quality": "xhigh",
            "background": "transparent",
            "output_format": "webp",
            "n": 4,
        })

        self.assertEqual(payload["size"], "21:9")
        self.assertEqual(payload["resolution"], "4k")
        self.assertEqual(payload["quality"], "xhigh")
        self.assertEqual(payload["background"], "transparent")
        self.assertEqual(payload["output_format"], "webp")
        self.assertEqual(payload["n"], 4)

    def test_gpt_image_2_rejects_gpt_image_25_quality_levels(self):
        with self.assertRaisesRegex(ValueError, "不支持质量选项 xhigh"):
            prepare_apimart_image_payload({
                "model": "gpt-image-2",
                "prompt": "cat",
                "size": "1:1",
                "resolution": "1k",
                "quality": "xhigh",
                "n": 1,
            })

    def test_transparent_background_rejects_jpeg_output(self):
        with self.assertRaisesRegex(ValueError, "输出格式必须选择 png 或 webp"):
            prepare_apimart_image_payload({
                "model": "gpt-image-2.5-flare",
                "prompt": "cat",
                "size": "1:1",
                "resolution": "1k",
                "background": "transparent",
                "output_format": "jpeg",
                "n": 1,
            })

    def test_gpt_image_25_ext_uses_apimart_ext_contract(self):
        payload, support = prepare_apimart_image_payload({
            "model": "gpt-image-2.5-ext",
            "prompt": "cat",
            "size": "auto",
            "resolution": "4k",
            "quality": "max",
            "output_format": "webp",
            "n": 4,
        })

        self.assertEqual(support.key, "gpt-image-2.5-ext")
        self.assertEqual(payload["model"], "gpt-image-2.5-ext")
        self.assertEqual(payload["version"], "flare")
        self.assertEqual(payload["size"], "auto")
        self.assertEqual(payload["resolution"], "4K")
        self.assertNotIn("quality", payload)
        self.assertNotIn("output_format", payload)
        self.assertEqual(payload["n"], 4)

    def test_gpt_image_25_ext_sunburst_alias_sets_version(self):
        payload, support = prepare_apimart_image_payload({
            "model": "gpt-image-2.5-ext-sunburst",
            "prompt": "cat",
            "size": "16:9",
            "resolution": "2k",
            "background": "transparent",
            "output_format": "webp",
            "n": 1,
        })

        self.assertEqual(support.key, "gpt-image-2.5-ext")
        self.assertEqual(payload["model"], "gpt-image-2.5-ext")
        self.assertEqual(payload["version"], "sunburst")
        self.assertEqual(payload["size"], "16:9")
        self.assertEqual(payload["resolution"], "2K")
        self.assertNotIn("background", payload)
        self.assertNotIn("output_format", payload)

    def test_gpt_image_25_ext_reports_documented_ratio_scope(self):
        support = get_apimart_image_model_support("gpt-image-2.5-ext-flare")

        self.assertEqual(support["family"], "gpt-image-2.5-ext")
        self.assertEqual(
            support["capabilities"]["ratios"],
            ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"],
        )
        self.assertEqual(support["capabilities"]["resolutions"], ["1K", "2K", "4K"])
        self.assertEqual(support["capabilities"]["qualityOptions"], [])
        self.assertEqual(support["capabilities"]["backgroundOptions"], [])
        self.assertEqual(support["capabilities"]["outputFormats"], [])

    def test_grok_official_uses_aspect_ratio_field(self):
        payload, _ = prepare_apimart_image_payload({
            "model": "grok-imagine-image",
            "prompt": "cat",
            "size": "16:9",
            "resolution": "2k",
            "n": 1,
        })

        self.assertEqual(payload["aspect_ratio"], "16:9")
        self.assertNotIn("size", payload)

    def test_text_only_model_rejects_reference_images(self):
        with self.assertRaisesRegex(ValueError, "仅支持文生图"):
            validate_apimart_image_request(
                "imagen-4.0-apimart",
                references=["https://cdn.test/reference.png"],
            )

    def test_midjourney_uses_its_own_endpoint_and_prompt_ratio(self):
        payload, _ = prepare_apimart_image_payload({
            "model": "midjourney",
            "prompt": "cat portrait",
            "size": "3:4",
            "resolution": "2k",
            "n": 1,
        })

        self.assertEqual(apimart_image_generation_endpoint("midjourney"), "/midjourney/generations")
        self.assertEqual(payload["prompt"], "cat portrait --ar 3:4")
        self.assertNotIn("size", payload)
        self.assertNotIn("resolution", payload)


if __name__ == "__main__":
    unittest.main()
