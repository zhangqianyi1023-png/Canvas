"""Serve the built frontend from the FastAPI app for packaged desktop use."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from main import app


def resolve_frontend_dist() -> Path:
    configured = os.environ.get("INUX_FRONTEND_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "frontend" / "dist"
    return Path(__file__).resolve().parents[1] / "frontend" / "dist"


FRONTEND_DIST = resolve_frontend_dist()
if not (FRONTEND_DIST / "index.html").is_file():
    raise RuntimeError(f"未找到桌面前端构建产物: {FRONTEND_DIST}")

app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
