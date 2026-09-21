import unittest
from types import SimpleNamespace
from unittest.mock import patch

import main
from main import ChatMessage, ChatRequest, LLMRequest, RuntimeProvider, RuntimeSettings, normalize_max_text_tokens


class RuntimeSettingsTest(unittest.TestCase):
    def test_runtime_settings_default_to_eight_k_text_tokens(self):
        self.assertEqual(RuntimeSettings().maxTextTokens, 8192)

    def test_text_token_limit_is_clamped_to_supported_range(self):
        self.assertEqual(normalize_max_text_tokens(None), 8192)
        self.assertEqual(normalize_max_text_tokens(100), 1024)
        self.assertEqual(normalize_max_text_tokens(16384), 16384)
        self.assertEqual(normalize_max_text_tokens(99999), 32768)

    @patch("main.os.path.exists", return_value=True)
    @patch("builtins.open")
    def test_loading_runtime_settings_clamps_text_token_limit(self, open_file, _exists):
        open_file.return_value.__enter__.return_value.read.return_value = '{"maxTextTokens": 99999}'

        settings = main.load_runtime_settings()

        self.assertEqual(settings.maxTextTokens, 32768)

    @patch("main.os.path.exists", return_value=True)
    @patch("builtins.open")
    def test_loading_runtime_settings_migrates_global_limit_to_provider(self, open_file, _exists):
        open_file.return_value.__enter__.return_value.read.return_value = """
        {
          "maxTextTokens": 16384,
          "providers": [{
            "id": "provider-1",
            "baseUrl": "https://api.example.com/v1",
            "apiKey": "secret",
            "textModels": ["gpt-5"]
          }]
        }
        """

        settings = main.load_runtime_settings()

        self.assertEqual(settings.providers[0].maxTextTokens, 16384)

    @patch("main.llm_node.execute")
    @patch("main.load_runtime_settings")
    def test_llm_endpoint_uses_provider_limit_instead_of_client_value(
        self,
        load_runtime_settings,
        execute,
    ):
        load_runtime_settings.return_value = RuntimeSettings(
            maxTextTokens=8192,
            providers=[
                RuntimeProvider(
                    id="provider-1",
                    baseUrl="https://api.example.com/v1",
                    apiKey="secret",
                    textModels=["gpt-5"],
                    maxTextTokens=16384,
                )
            ],
        )
        execute.return_value = {"success": True, "response": "OK"}

        result = main.run_llm(LLMRequest(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            model_name="gpt-5",
            user_prompt="test",
            max_tokens=1024,
        ))

        self.assertEqual(result["success"], True)
        self.assertEqual(execute.call_args.kwargs["max_tokens"], 16384)

    @patch("main.requests.post")
    @patch("main.load_runtime_settings")
    def test_chat_endpoint_uses_provider_limit_instead_of_client_value(
        self,
        load_runtime_settings,
        post,
    ):
        load_runtime_settings.return_value = RuntimeSettings(
            maxTextTokens=8192,
            providers=[
                RuntimeProvider(
                    id="provider-1",
                    baseUrl="https://api.example.com/v1",
                    apiKey="secret",
                    textModels=["gpt-5"],
                    maxTextTokens=32768,
                )
            ],
        )
        post.return_value.raise_for_status.return_value = None
        post.return_value.json.return_value = {
            "choices": [{"message": {"content": "OK"}}],
        }

        result = main.run_chat(ChatRequest(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            model_name="gpt-5",
            messages=[ChatMessage(role="user", content="test")],
            max_tokens=1024,
        ))

        self.assertEqual(result["success"], True)
        self.assertEqual(post.call_args.kwargs["json"]["max_tokens"], 32768)


if __name__ == "__main__":
    unittest.main()
