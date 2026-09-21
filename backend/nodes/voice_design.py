"""MiniMax 音色设计客户端。"""

import os
import uuid

import requests


MINIMAX_VOICE_DESIGN_ENDPOINT = "https://api.minimaxi.com/v1/voice_design"


class VoiceDesignNode:
    """根据声音描述生成并保存 MiniMax 试听音频。"""

    def execute(
        self,
        api_key: str,
        prompt: str,
        preview_text: str,
        output_dir: str = "./output",
    ) -> dict:
        api_key_value = (api_key or "").strip()
        prompt_value = (prompt or "").strip()
        preview_text_value = (preview_text or "").strip()

        if not api_key_value:
            return {"success": False, "error": "请先在管理后台配置 MiniMax 音色设计 API Key"}
        if not prompt_value:
            return {"success": False, "error": "请输入声音描述"}
        if not preview_text_value:
            return {"success": False, "error": "请输入试听文本"}
        if len(preview_text_value) > 500:
            return {"success": False, "error": "试听文本不能超过 500 个字符"}

        try:
            response = requests.post(
                MINIMAX_VOICE_DESIGN_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key_value}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt_value,
                    "preview_text": preview_text_value,
                },
                timeout=60,
            )
        except requests.RequestException as error:
            return {"success": False, "error": f"MiniMax 请求失败: {error}"}

        trace_id = response.headers.get("Trace-Id") or response.headers.get("trace-id") or ""
        if response.status_code >= 400:
            return {
                "success": False,
                "error": self._format_http_error(response, trace_id),
            }

        try:
            data = response.json()
        except (TypeError, ValueError):
            return {
                "success": False,
                "error": self._with_trace("MiniMax 返回了无法解析的响应", trace_id),
            }

        base_resp = data.get("base_resp") or {}
        status_code = base_resp.get("status_code")
        if status_code != 0:
            status_msg = base_resp.get("status_msg") or "未知错误"
            return {
                "success": False,
                "error": self._with_trace(
                    f"MiniMax 音色设计失败 ({status_code}): {status_msg}",
                    trace_id,
                ),
            }

        trial_audio = data.get("trial_audio")
        if not isinstance(trial_audio, str) or not trial_audio.strip():
            return {"success": False, "error": "MiniMax 未返回试听音频"}

        compact_hex = "".join(trial_audio.split())
        if len(compact_hex) % 2 != 0:
            return {"success": False, "error": "MiniMax 返回的试听音频 HEX 长度无效"}
        try:
            audio_bytes = bytes.fromhex(compact_hex)
        except ValueError:
            return {"success": False, "error": "MiniMax 返回的试听音频不是合法 HEX"}
        if not audio_bytes:
            return {"success": False, "error": "MiniMax 返回的试听音频为空"}
        if not self._looks_like_mp3(audio_bytes):
            return {"success": False, "error": "MiniMax 返回的试听音频不是有效 MP3"}

        os.makedirs(output_dir, exist_ok=True)
        filename = f"voice_design_{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(output_dir, filename)
        try:
            with open(filepath, "wb") as audio_file:
                audio_file.write(audio_bytes)
        except OSError as error:
            return {"success": False, "error": f"保存试听音频失败: {error}"}

        return {
            "success": True,
            "audio_path": filepath,
            "filename": filename,
        }

    @staticmethod
    def _looks_like_mp3(audio_bytes: bytes) -> bool:
        if audio_bytes.startswith(b"ID3"):
            return True
        return len(audio_bytes) >= 2 and audio_bytes[0] == 0xFF and (audio_bytes[1] & 0xE0) == 0xE0

    @staticmethod
    def _with_trace(message: str, trace_id: str) -> str:
        return f"{message} (Trace-Id: {trace_id})" if trace_id else message

    def _format_http_error(self, response, trace_id: str) -> str:
        message = ""
        try:
            data = response.json()
            base_resp = data.get("base_resp") or {}
            message = (
                base_resp.get("status_msg")
                or (data.get("error") or {}).get("message")
                or data.get("message")
                or ""
            )
        except (TypeError, ValueError):
            message = ""
        if not message:
            message = (getattr(response, "text", "") or "")[:300] or "请求失败"
        return self._with_trace(f"MiniMax HTTP {response.status_code}: {message}", trace_id)
