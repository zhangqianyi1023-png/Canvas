import base64
import json
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = BACKEND_DIR / "copilot-runtime"
BRIDGE_SCRIPT = RUNTIME_DIR / "bridge.mjs"
SDK_PACKAGE = RUNTIME_DIR / "node_modules" / "@deepseek-ai" / "dsh-sdk-client" / "package.json"


def _sse_chunk(model, delta, finish_reason=None):
    return {
        "id": "chatcmpl-copilot-test",
        "object": "chat.completion.chunk",
        "created": 1,
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }


class _MockChatHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format, *_args):
        return

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        self.server.received_payloads.append(payload)
        messages = payload.get("messages") or []
        model = payload.get("model") or "mock-model"
        has_tool_result = any(message.get("role") == "tool" for message in messages)
        tool_result_text = "\n".join(
            str(message.get("content") or "")
            for message in messages
            if message.get("role") == "tool"
        )
        user_text = "\n".join(
            str(message.get("content") or "")
            for message in messages
            if message.get("role") == "user"
        )

        if "给我几个风格选项" in user_text and not has_tool_result:
            arguments = json.dumps({
                "question": "请选择布偶猫的图片风格",
                "options": [
                    {
                        "id": "realistic",
                        "label": "写实摄影",
                        "description": "自然光和真实毛发细节",
                        "submit_text": "请继续创建布偶猫图片，我选择写实摄影风格",
                    },
                    {
                        "id": "illustration",
                        "label": "可爱插画",
                        "description": "柔和配色和绘本质感",
                        "submit_text": "请继续创建布偶猫图片，我选择可爱插画风格",
                    },
                ],
            }, ensure_ascii=False)
            chunks = [
                _sse_chunk(model, {
                    "role": "assistant",
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_present_choices",
                        "type": "function",
                        "function": {"name": "present_choices", "arguments": arguments},
                    }],
                }),
                _sse_chunk(model, {}, "tool_calls"),
            ]
        elif "把这个文本改短" in user_text and not has_tool_result:
            arguments = json.dumps({
                "summary": "缩短问候文案",
                "edits": [{
                    "node_id": "result_text",
                    "operation": "replace_text",
                    "value": "你好。",
                }],
            }, ensure_ascii=False)
            chunks = [
                _sse_chunk(model, {
                    "role": "assistant",
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_canvas_edits",
                        "type": "function",
                        "function": {"name": "apply_canvas_edits", "arguments": arguments},
                    }],
                }),
                _sse_chunk(model, {}, "tool_calls"),
            ]
        elif "创建一个文本节点" in user_text and not has_tool_result:
            arguments = json.dumps({
                "summary": "创建一个问候文本节点",
                "nodes": [{
                    "ref": "hello_copy",
                    "node_type": "generateText",
                    "label": "问候文案",
                    "content": "你好，欢迎来到画布。",
                    "upstream_refs": [],
                    "run": False,
                }],
            }, ensure_ascii=False)
            chunks = [
                _sse_chunk(model, {
                    "role": "assistant",
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_canvas_plan",
                        "type": "function",
                        "function": {"name": "apply_canvas_plan", "arguments": arguments},
                    }],
                }),
                _sse_chunk(model, {}, "tool_calls"),
            ]
        elif has_tool_result and "Choice cards prepared" in tool_result_text:
            chunks = [
                _sse_chunk(model, {"role": "assistant", "content": "请选择一种风格。"}),
                _sse_chunk(model, {}, "stop"),
            ]
        elif has_tool_result:
            chunks = [
                _sse_chunk(model, {"role": "assistant", "content": "我准备好了这个画布方案。"}),
                _sse_chunk(model, {}, "stop"),
            ]
        else:
            chunks = [
                _sse_chunk(model, {"role": "assistant", "content": "你好！今天想聊些什么？"}),
                _sse_chunk(model, {}, "stop"),
            ]

        body = "".join(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n" for chunk in chunks)
        body += "data: [DONE]\n\n"
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
        self.wfile.flush()


@unittest.skipUnless(SDK_PACKAGE.exists(), "DeepSeek Harness Node SDK is not installed")
class CopilotRuntimeBridgeTests(unittest.TestCase):
    def test_chat_and_canvas_tool_paths_are_separate(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _MockChatHandler)
        server.received_payloads = []
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="inux-copilot-test-") as dsh_home:
                image_bytes = (BACKEND_DIR.parent / "frontend" / "public" / "sidebar-logo.png").read_bytes()
                image_data_url = f"data:image/png;base64,{base64.b64encode(image_bytes).decode('ascii')}"
                config = {
                    "baseUrl": f"http://127.0.0.1:{server.server_port}/v1",
                    "apiKey": "test-key",
                    "model": "mock-model",
                    "maxTokens": 1024,
                    "dshHome": dsh_home,
                }
                requests = [
                    {
                        "id": "chat",
                        "type": "turn",
                        "sessionId": "chat_session",
                        "message": "你好",
                        "canvas": {"nodes": [], "edges": [], "selectedNodeIds": []},
                        "actionAllowed": False,
                        "config": config,
                    },
                    {
                        "id": "action",
                        "type": "turn",
                        "sessionId": "action_session",
                        "message": "创建一个文本节点",
                        "canvas": {"nodes": [], "edges": [], "selectedNodeIds": []},
                        "actionAllowed": True,
                        "config": config,
                    },
                    {
                        "id": "attachments",
                        "type": "turn",
                        "sessionId": "attachment_session",
                        "message": "请总结附件",
                        "canvas": {"nodes": [], "edges": [], "selectedNodeIds": []},
                        "attachments": [
                            {
                                "name": "notes.txt",
                                "mime_type": "text/plain",
                                "kind": "text",
                                "text_content": "附件里的测试文字",
                                "data_url": "",
                                "size": 27,
                            },
                            {
                                "name": "pixel.png",
                                "mime_type": "image/png",
                                "kind": "image",
                                "text_content": "",
                                "data_url": image_data_url,
                                "size": len(image_bytes),
                            },
                        ],
                        "actionAllowed": False,
                        "config": config,
                    },
                    {
                        "id": "edit",
                        "type": "turn",
                        "sessionId": "edit_session",
                        "message": "把这个文本改短",
                        "canvas": {
                            "nodes": [{"id": "result_text", "type": "result", "resultType": "generateText"}],
                            "edges": [],
                            "selectedNodeIds": ["result_text"],
                        },
                        "targetNodes": [{
                            "id": "result_text",
                            "node_type": "result",
                            "result_type": "generateText",
                            "label": "问候文案",
                            "kind": "text",
                            "content": "你好，欢迎来到画布。",
                            "prompt": "写一句问候语",
                            "can_edit_content": True,
                            "can_edit_prompt": True,
                            "can_rename": True,
                        }],
                        "actionAllowed": True,
                        "config": config,
                    },
                    {
                        "id": "target_image",
                        "type": "turn",
                        "sessionId": "target_image_session",
                        "message": "请描述这张画布图片（图像节点测试）",
                        "canvas": {
                            "nodes": [{"id": "result_image", "type": "result", "resultType": "generateImage"}],
                            "edges": [],
                            "selectedNodeIds": ["result_image"],
                        },
                        "targetNodes": [{
                            "id": "result_image",
                            "node_type": "result",
                            "result_type": "generateImage",
                            "label": "测试图片",
                            "kind": "image",
                            "thumbnail_url": "/uploads/pixel.png",
                            "image_attached": True,
                            "image_data": base64.b64encode(image_bytes).decode("ascii"),
                            "image_mime_type": "image/png",
                            "image_byte_size": len(image_bytes),
                        }],
                        "actionAllowed": False,
                        "config": config,
                    },
                    {
                        "id": "choices",
                        "type": "turn",
                        "sessionId": "choice_session",
                        "message": "给我几个风格选项",
                        "canvas": {"nodes": [], "edges": [], "selectedNodeIds": []},
                        "actionAllowed": False,
                        "config": config,
                    },
                    {"id": "shutdown", "type": "shutdown"},
                ]
                wire_input = "\n".join(json.dumps(item, ensure_ascii=False) for item in requests) + "\n"
                process = subprocess.run(
                    ["node", str(BRIDGE_SCRIPT)],
                    cwd=RUNTIME_DIR,
                    input=wire_input,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    check=False,
                )

            self.assertEqual(process.returncode, 0, process.stderr)
            responses = {
                item["id"]: item
                for item in (json.loads(line) for line in process.stdout.splitlines() if line.strip())
            }
            self.assertTrue(responses["chat"]["ok"], responses["chat"])
            self.assertEqual(responses["chat"]["result"]["message"], "你好！今天想聊些什么？")
            self.assertIsNone(responses["chat"]["result"]["plan"])

            self.assertTrue(responses["action"]["ok"], responses["action"])
            plan = responses["action"]["result"]["plan"]
            self.assertEqual(plan["nodes"][0]["node_type"], "generateText")
            self.assertEqual(plan["nodes"][0]["content"], "你好，欢迎来到画布。")

            self.assertTrue(responses["edit"]["ok"], responses["edit"])
            edit_plan = responses["edit"]["result"]["editPlan"]
            self.assertEqual(edit_plan["edits"][0]["node_id"], "result_text")
            self.assertEqual(edit_plan["edits"][0]["value"], "你好。")

            self.assertTrue(responses["target_image"]["ok"], responses["target_image"])
            target_image_payload = next(
                payload for payload in server.received_payloads
                if "图像节点测试" in json.dumps(payload, ensure_ascii=False)
            )
            target_image_text = json.dumps(target_image_payload, ensure_ascii=False)
            self.assertIn("节点 ID：result_image", target_image_text)
            self.assertIn('"type": "image_url"', target_image_text)

            self.assertTrue(responses["attachments"]["ok"], responses["attachments"])
            requests_text = json.dumps(server.received_payloads, ensure_ascii=False)
            self.assertIn("附件里的测试文字", requests_text)
            self.assertIn('"type": "image_url"', requests_text)
            self.assertIn("data:image/jpeg;base64", requests_text)

            self.assertTrue(responses["choices"]["ok"], responses["choices"])
            choice_set = responses["choices"]["result"]["choices"]
            self.assertEqual(choice_set["question"], "请选择布偶猫的图片风格")
            self.assertEqual(choice_set["options"][0]["id"], "realistic")
            self.assertIn("继续创建布偶猫图片", choice_set["options"][0]["submit_text"])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
