"""OpenAI-compatible 语音合成节点。"""

import base64
import json
import os
import struct
import time
import uuid
import requests


class TTSNode:
    """调用兼容 chat/completions 音频响应的服务商生成语音。"""

    def execute(self, api_base_url: str, api_key: str, model: str, text: str, voice: str = "冰糖",
                style: str = "", output_dir: str = "./output") -> dict:
        base_url = (api_base_url or "").strip().rstrip("/")
        if not base_url:
            return {"success": False, "error": "Base URL 不能为空"}
        model_name = (model or "").strip()
        if not model_name:
            return {"success": False, "error": "模型名称不能为空"}

        headers = {
            "Content-Type": "application/json",
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        messages = []
        if style and style.strip():
            messages.append({"role": "user", "content": style.strip()})
        messages.append({"role": "assistant", "content": text})

        payload = {
            "model": model_name,
            "messages": messages,
            "audio": {"format": "wav", "voice": voice},
        }

        try:
            resp = requests.post(
                f"{base_url}/chat/completions",
                headers=headers, json=payload, timeout=60
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError:
            return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        except Exception as e:
            return {"success": False, "error": f"请求失败: {e}"}

        try:
            audio_b64 = data["choices"][0]["message"]["audio"]["data"]
            audio_bytes = base64.b64decode(audio_b64)
        except (KeyError, IndexError) as e:
            return {"success": False, "error": f"解析音频失败: {e}"}

        # 保存文件
        os.makedirs(output_dir, exist_ok=True)
        timestamp = int(time.time())
        filename = f"tts_{timestamp}_{uuid.uuid4().hex}.wav"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(audio_bytes)

        # 计算时长
        duration = self._get_wav_duration(audio_bytes)

        return {
            "success": True,
            "audio_path": filepath,
            "filename": filename,
            "duration": duration,
        }

    def _get_wav_duration(self, audio_bytes: bytes) -> float:
        try:
            if audio_bytes[:4] != b'RIFF':
                return 0.0
            byte_rate = struct.unpack_from('<I', audio_bytes, 28)[0]
            if byte_rate > 0:
                data_size = len(audio_bytes) - 44
                return round(data_size / byte_rate, 2)
        except Exception:
            pass
        return 0.0


NODE_META = {
    "type": "TTS",
    "display_name": "语音合成",
    "category": "AI/TTS",
    "inputs": {
        "api_base_url": {"type": "string", "default": "", "label": "API 地址"},
        "api_key": {"type": "string", "default": "", "label": "API Key"},
        "model": {"type": "string", "default": "", "label": "模型名称"},
        "text": {"type": "string", "default": "", "label": "文本", "multiline": True},
        "voice": {"type": "select", "options": ["冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"], "default": "冰糖", "label": "音色"},
        "style": {"type": "string", "default": "", "label": "风格（如：开心、磁性）"},
    },
    "outputs": {
        "audio_path": {"type": "string", "label": "音频文件路径"},
        "duration": {"type": "float", "label": "时长(秒)"},
        "filename": {"type": "string", "label": "文件名"},
    },
}
