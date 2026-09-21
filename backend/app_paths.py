"""Resolve writable backend paths for web deployments and local development."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union


BACKEND_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class AppPaths:
    data_root: Path
    upload_dir: Path
    admin_data_dir: Path


def resolve_app_paths(
    data_dir: Optional[str] = None,
    backend_dir: Union[str, Path] = BACKEND_DIR,
) -> AppPaths:
    backend_root = Path(backend_dir).expanduser().resolve()
    configured = os.environ.get("INUX_DATA_DIR", "") if data_dir is None else data_dir
    data_root = Path(configured).expanduser().resolve() if configured else backend_root
    return AppPaths(
        data_root=data_root,
        upload_dir=data_root / "uploads",
        admin_data_dir=data_root / "data",
    )


APP_PATHS = resolve_app_paths()
UPLOAD_DIR = APP_PATHS.upload_dir
ADMIN_DATA_DIR = APP_PATHS.admin_data_dir
