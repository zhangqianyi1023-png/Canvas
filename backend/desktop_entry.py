"""Entry point for the packaged desktop backend."""

from __future__ import annotations

import os

import uvicorn

from deploy_static_app import app


def resolve_port() -> int:
    value = os.environ.get("INUX_BACKEND_PORT", "").strip()
    try:
        port = int(value)
    except ValueError as exc:
        raise RuntimeError("INUX_BACKEND_PORT 必须是有效端口") from exc
    if not 1 <= port <= 65535:
        raise RuntimeError("INUX_BACKEND_PORT 超出有效范围")
    return port


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=resolve_port(),
        log_level=os.environ.get("INUX_BACKEND_LOG_LEVEL", "info"),
    )
