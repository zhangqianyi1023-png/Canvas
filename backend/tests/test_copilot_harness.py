import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import copilot_harness
from copilot_harness import (
    edit_plan_requires_confirmation,
    friendly_copilot_error,
    has_explicit_canvas_action,
    plan_requires_confirmation,
    resolve_copilot_provider,
    run_copilot_turn,
)


class CopilotIntentTests(unittest.TestCase):
    def test_normal_conversation_never_authorizes_canvas_writes(self):
        for message in (
            "你好",
            "你是谁？",
            "帮我分析一下怎么创建节点",
            "聊聊小红书内容怎么做",
            "节点怎么连接？",
            "请问可以创建节点吗？",
            "请不要创建节点，只聊聊方案",
            "请阅读并总结这些附件",
        ):
            self.assertFalse(has_explicit_canvas_action(message), message)

    def test_explicit_canvas_requests_are_authorized(self):
        for message in (
            "创建一个文本节点",
            "帮我添加两张配图",
            "把它连接到当前节点",
            "直接运行这些节点",
            "不要运行，只创建两个文本节点",
            "把这个节点改得更简洁",
            "润色当前文案",
        ):
            self.assertTrue(has_explicit_canvas_action(message), message)

    def test_short_edit_followups_need_an_explicit_target(self):
        self.assertFalse(has_explicit_canvas_action("再短一点"))
        self.assertTrue(has_explicit_canvas_action("再短一点", has_targets=True))
        self.assertFalse(has_explicit_canvas_action("这个节点怎么样？", has_targets=True))

    def test_running_and_large_plans_require_confirmation(self):
        self.assertTrue(plan_requires_confirmation({"nodes": [{"run": True}]}))
        self.assertTrue(plan_requires_confirmation({"nodes": [{}, {}, {}, {}, {}]}))
        self.assertFalse(plan_requires_confirmation({"nodes": [{}, {}]}))
        self.assertTrue(edit_plan_requires_confirmation({"edits": [{}, {}]}))
        self.assertFalse(edit_plan_requires_confirmation({"edits": [{}]}))

    def test_host_discards_a_plan_for_normal_conversation(self):
        unsafe_result = {
            "message": "你好",
            "plan": {"summary": "不应执行", "nodes": [{"run": False}]},
            "runtime": "deepseek-harness",
        }
        with patch.object(copilot_harness._bridge, "request", return_value=unsafe_result):
            result = run_copilot_turn(
                session_id="guard_test",
                message="你好",
                canvas={},
                provider={
                    "baseUrl": "https://example.test/v1",
                    "apiKey": "secret",
                    "model": "test-model",
                    "maxTokens": 1024,
                    "providerName": "Test",
                },
                dsh_home=Path("/tmp/unused-copilot-home"),
            )

        self.assertIsNone(result["plan"])
        self.assertTrue(result["guarded"])

    def test_host_rejects_edits_outside_explicit_targets(self):
        unsafe_result = {
            "message": "已准备修改",
            "editPlan": {
                "summary": "修改另一个节点",
                "edits": [{"node_id": "other", "operation": "replace_text", "value": "不应执行"}],
            },
            "runtime": "deepseek-harness",
        }
        with patch.object(copilot_harness._bridge, "request", return_value=unsafe_result):
            result = run_copilot_turn(
                session_id="edit_guard_test",
                message="改写这个节点",
                canvas={},
                target_nodes=[{"id": "target", "can_edit_content": True}],
                provider={
                    "baseUrl": "https://example.test/v1",
                    "apiKey": "secret",
                    "model": "test-model",
                    "maxTokens": 1024,
                    "providerName": "Test",
                },
                dsh_home=Path("/tmp/unused-copilot-home"),
            )

        self.assertIsNone(result["editPlan"])
        self.assertTrue(result["guarded"])

    def test_transport_errors_are_presented_in_plain_language(self):
        self.assertEqual(
            friendly_copilot_error("Stream ended without finish_reason"),
            "当前文本模型服务暂时不可用，请稍后重试或在设置中切换文本模型。",
        )


class CopilotProviderTests(unittest.TestCase):
    def test_prefers_configured_deepseek_model(self):
        settings = SimpleNamespace(
            activeProviderId="other",
            providers=[
                SimpleNamespace(
                    id="other", name="Other", enabled=True, baseUrl="https://other.example/v1",
                    apiKey="other-key", textModels=["other-model"], defaultTextModel="other-model",
                    maxTextTokens=4096,
                ),
                SimpleNamespace(
                    id="deepseek", name="DeepSeek", enabled=True, baseUrl="https://deepseek.example/v1/",
                    apiKey="deepseek-key", textModels=["deepseek-chat"], defaultTextModel="deepseek-chat",
                    maxTextTokens=8192,
                ),
            ],
        )

        provider = resolve_copilot_provider(settings)

        self.assertEqual(provider["providerId"], "deepseek")
        self.assertEqual(provider["baseUrl"], "https://deepseek.example/v1")
        self.assertEqual(provider["model"], "deepseek-chat")

    def test_uses_the_model_explicitly_selected_in_copilot(self):
        settings = SimpleNamespace(
            activeProviderId="provider",
            providers=[SimpleNamespace(
                id="provider", name="Models", enabled=True, baseUrl="https://example.test/v1",
                apiKey="key", textModels=["model-fast", "model-smart"], defaultTextModel="model-fast",
                maxTextTokens=4096,
            )],
        )

        provider = resolve_copilot_provider(settings, "provider", "model-smart")

        self.assertEqual(provider["providerId"], "provider")
        self.assertEqual(provider["model"], "model-smart")

    def test_rejects_a_model_from_a_disabled_provider(self):
        settings = SimpleNamespace(
            activeProviderId="provider",
            providers=[SimpleNamespace(
                id="provider", name="Disabled", enabled=False, baseUrl="https://example.test/v1",
                apiKey="key", textModels=["model"], defaultTextModel="model", maxTextTokens=4096,
            )],
        )

        with self.assertRaisesRegex(Exception, "尚未启用"):
            resolve_copilot_provider(settings, "provider", "model")


if __name__ == "__main__":
    unittest.main()
