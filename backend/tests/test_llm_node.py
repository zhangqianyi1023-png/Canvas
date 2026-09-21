import json
import unittest
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import requests

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from nodes.llm import (
    LLMIncompleteOutputError,
    LLMNode,
    build_llm_payload,
    choose_text_api_mode,
    normalize_llm_url,
    parse_chat_completion_response,
    parse_responses_response,
)


class LLMNodeTest(unittest.TestCase):
    def test_auto_mode_uses_responses_for_images(self):
        self.assertEqual(choose_text_api_mode("auto", has_images=True), "responses")
        self.assertEqual(choose_text_api_mode("auto", has_images=False), "chat_completions")
        self.assertEqual(choose_text_api_mode("chat_completions", has_images=True), "chat_completions")

    def test_normalize_llm_url_supports_both_api_modes(self):
        self.assertEqual(
            normalize_llm_url("https://api.example.com/v1", "chat_completions"),
            "https://api.example.com/v1/chat/completions",
        )
        self.assertEqual(
            normalize_llm_url("https://api.example.com/v1", "responses"),
            "https://api.example.com/v1/responses",
        )

    def test_build_responses_payload_uses_input_content_types(self):
        payload = build_llm_payload(
            api_mode="responses",
            model_name="demo-model",
            system_prompt="system",
            user_prompt="user",
            temperature=0.4,
            max_tokens=1024,
            image_urls=["data:image/png;base64,abc"],
        )

        self.assertNotIn("messages", payload)
        self.assertEqual(payload["max_output_tokens"], 1024)
        self.assertEqual(payload["input"][0]["role"], "system")
        self.assertEqual(payload["input"][1]["content"][0], {"type": "input_text", "text": "user"})
        self.assertEqual(
            payload["input"][1]["content"][1],
            {"type": "input_image", "image_url": "data:image/png;base64,abc"},
        )

    def test_build_chat_payload_uses_chat_content_types(self):
        payload = build_llm_payload(
            api_mode="chat_completions",
            model_name="demo-model",
            system_prompt="system",
            user_prompt="user",
            temperature=0.4,
            max_tokens=1024,
            image_urls=["data:image/png;base64,abc"],
        )

        self.assertNotIn("input", payload)
        self.assertEqual(payload["max_tokens"], 1024)
        self.assertEqual(payload["messages"][1]["content"][0], {"type": "text", "text": "user"})
        self.assertEqual(
            payload["messages"][1]["content"][1],
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
        )

    def test_parse_responses_response_ignores_reasoning_and_returns_output_text(self):
        result = parse_responses_response(
            json.dumps({
                "status": "completed",
                "output": [
                    {"type": "reasoning", "summary": []},
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": "O"},
                            {"type": "output_text", "text": "K"},
                        ],
                    },
                ],
            })
        )

        self.assertEqual(result, "OK")

    def test_empty_chat_response_explains_output_token_exhaustion(self):
        with self.assertRaisesRegex(ValueError, "输出额度"):
            parse_chat_completion_response(
                json.dumps({
                    "choices": [{
                        "finish_reason": "length",
                        "message": {"role": "assistant", "content": ""},
                    }],
                    "usage": {
                        "completion_tokens": 16,
                        "completion_tokens_details": {"reasoning_tokens": 16},
                    },
                })
            )

    def test_partial_chat_response_reports_incomplete_output(self):
        with self.assertRaises(LLMIncompleteOutputError) as context:
            parse_chat_completion_response(
                json.dumps({
                    "choices": [{
                        "finish_reason": "length",
                        "message": {"role": "assistant", "content": "只生成了一半"},
                    }],
                    "usage": {"completion_tokens": 8192},
                })
            )

        self.assertEqual(context.exception.partial_response, "只生成了一半")

    def test_partial_responses_output_reports_incomplete_output(self):
        with self.assertRaises(LLMIncompleteOutputError) as context:
            parse_responses_response(
                json.dumps({
                    "status": "incomplete",
                    "incomplete_details": {"reason": "max_output_tokens"},
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "只生成了一半"}],
                    }],
                })
            )

        self.assertEqual(context.exception.partial_response, "只生成了一半")

    def test_execute_returns_partial_response_without_marking_success(self):
        node = LLMNode()
        response = Mock()
        response.status_code = 200
        response.text = json.dumps({
            "choices": [{
                "finish_reason": "length",
                "message": {"role": "assistant", "content": "只生成了一半"},
            }],
        })
        response.raise_for_status.return_value = None
        session = Mock()
        session.post.return_value = response
        node._session = session

        result = node.execute(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            model_name="demo-model",
            system_prompt="system",
            user_prompt="user",
            text_api_mode="chat_completions",
        )

        self.assertEqual(result["success"], False)
        self.assertEqual(result["incomplete"], True)
        self.assertEqual(result["partial_response"], "只生成了一半")

    @patch("nodes.llm.time.sleep")
    def test_connection_errors_return_failure_after_retries(self, sleep):
        node = LLMNode()
        session = Mock()
        session.post.side_effect = requests.exceptions.ConnectionError("upstream closed")
        node._session = session

        with patch.object(node, "_create_session", return_value=session):
            result = node.execute(
                api_base_url="https://api.example.com/v1",
                api_key="secret",
                model_name="demo-model",
                system_prompt="system",
                user_prompt="user",
            )

        self.assertEqual(result["success"], False)
        self.assertIn("无法连接上游", result["error"])
        self.assertEqual(session.post.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    @patch("nodes.llm.time.sleep")
    def test_connection_error_recreates_session_without_cross_protocol_fallback(self, sleep):
        node = LLMNode()
        first_session = Mock()
        second_session = Mock()
        third_session = Mock()
        first_session.post.side_effect = requests.exceptions.ConnectionError("closed 1")
        second_session.post.side_effect = requests.exceptions.ConnectionError("closed 2")
        third_session.post.side_effect = requests.exceptions.ConnectionError("closed 3")

        with patch.object(node, "_create_session", side_effect=[first_session, second_session, third_session]):
            result = node.execute(
                api_base_url="https://api.example.com/v1",
                api_key="secret",
                model_name="demo-model",
                system_prompt="system",
                user_prompt="user",
                image_urls=["data:image/png;base64,abc"],
                text_api_mode="auto",
            )

        self.assertEqual(result["success"], False)
        self.assertEqual(first_session.post.call_args.args[0], "https://api.example.com/v1/responses")
        self.assertEqual(second_session.post.call_args.args[0], "https://api.example.com/v1/responses")
        self.assertEqual(third_session.post.call_args.args[0], "https://api.example.com/v1/responses")

    def test_auto_mode_falls_back_on_explicit_schema_error(self):
        node = LLMNode()
        response_error = Mock()
        response_error.status_code = 404
        response_error.text = '{"error":{"message":"unknown endpoint /responses"}}'
        response_error.raise_for_status.side_effect = requests.exceptions.HTTPError(response=response_error)
        response_success = Mock()
        response_success.status_code = 200
        response_success.text = json.dumps({
            "choices": [{
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": "OK"},
            }]
        })
        response_success.raise_for_status.return_value = None
        session = Mock()
        session.post.side_effect = [response_error, response_success]
        node._session = session

        result = node.execute(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            model_name="demo-model",
            system_prompt="system",
            user_prompt="user",
            image_urls=["data:image/png;base64,abc"],
            text_api_mode="auto",
        )

        self.assertEqual(result["success"], True)
        self.assertEqual(result["response"], "OK")
        self.assertEqual(result["api_mode"], "chat_completions")
        self.assertEqual(session.post.call_args_list[0].args[0], "https://api.example.com/v1/responses")
        self.assertEqual(session.post.call_args_list[1].args[0], "https://api.example.com/v1/chat/completions")

    def test_auto_mode_does_not_fallback_on_regular_validation_error(self):
        node = LLMNode()
        response_error = Mock()
        response_error.status_code = 400
        response_error.text = '{"error":{"message":"input exceeds context length"}}'
        response_error.raise_for_status.side_effect = requests.exceptions.HTTPError(response=response_error)
        session = Mock()
        session.post.return_value = response_error
        node._session = session

        result = node.execute(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            model_name="demo-model",
            system_prompt="system",
            user_prompt="user",
            image_urls=["data:image/png;base64,abc"],
            text_api_mode="auto",
        )

        self.assertEqual(result["success"], False)
        self.assertEqual(result["api_mode"], "responses")
        self.assertEqual(session.post.call_count, 1)


if __name__ == "__main__":
    unittest.main()
