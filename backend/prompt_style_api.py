"""FastAPI routes for official prompt style management."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from prompt_style_store import PromptStyleStore
except ImportError:
    from backend.prompt_style_store import PromptStyleStore


class PromptStyleCreate(BaseModel):
    name: str
    category: str = ""
    prompt: str
    coverUrl: str = ""
    sortOrder: int = 0
    enabled: bool = True


class PromptStyleUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    prompt: Optional[str] = None
    coverUrl: Optional[str] = None
    sortOrder: Optional[int] = None
    enabled: Optional[bool] = None


def _model_patch(model: BaseModel) -> dict:
    return model.model_dump(exclude_unset=True)


def _raise_store_error(error: Exception):
    if isinstance(error, KeyError):
        detail = error.args[0] if error.args else "数据不存在"
        raise HTTPException(status_code=404, detail=detail) from error
    raise HTTPException(status_code=400, detail=str(error)) from error


def create_prompt_style_router(store: PromptStyleStore) -> APIRouter:
    router = APIRouter()

    @router.get("/api/prompt-styles")
    def list_public_styles(category: Optional[str] = Query(default=None)):
        return {"styles": store.list_public_styles(category)}

    @router.get("/api/admin/prompt-styles")
    def list_admin_styles(category: Optional[str] = Query(default=None)):
        return {"styles": store.list_styles(category)}

    @router.post("/api/admin/prompt-styles")
    def create_style(payload: PromptStyleCreate):
        try:
            return store.create_style(payload.model_dump())
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.put("/api/admin/prompt-styles/{style_id}")
    def update_style(style_id: str, payload: PromptStyleUpdate):
        try:
            return store.update_style(style_id, _model_patch(payload))
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.delete("/api/admin/prompt-styles/{style_id}")
    def delete_style(style_id: str):
        try:
            store.delete_style(style_id)
            return {"success": True}
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    return router
