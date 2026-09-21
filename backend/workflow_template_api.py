"""FastAPI routes for official workflow template management."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

try:
    from workflow_template_store import WorkflowTemplateStore
except ImportError:
    from backend.workflow_template_store import WorkflowTemplateStore


class CategoryCreate(BaseModel):
    name: str
    sortOrder: int = 0
    enabled: bool = True


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sortOrder: Optional[int] = None
    enabled: Optional[bool] = None


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    categoryId: str
    coverUrl: str = ""
    sortOrder: int = 0


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    categoryId: Optional[str] = None
    coverUrl: Optional[str] = None
    sortOrder: Optional[int] = None


class DraftPayload(BaseModel):
    workflowData: dict = Field(default_factory=dict)


def _model_patch(model: BaseModel) -> dict:
    return model.model_dump(exclude_unset=True)


def _raise_store_error(error: Exception):
    if isinstance(error, KeyError):
        detail = error.args[0] if error.args else "数据不存在"
        raise HTTPException(status_code=404, detail=detail) from error
    raise HTTPException(status_code=400, detail=str(error)) from error


def _validate_publishable(template: dict, draft: dict):
    if not template.get("name", "").strip():
        raise HTTPException(status_code=400, detail="模板名称不能为空")
    if not template.get("categoryId"):
        raise HTTPException(status_code=400, detail="模板必须选择类型分组")
    if not template.get("coverUrl", "").strip():
        raise HTTPException(status_code=400, detail="模板封面不能为空")
    workflow = draft.get("workflowData") or {}
    visible_nodes = [
        node for node in workflow.get("nodes", [])
        if node.get("type") != "generator"
    ]
    if not visible_nodes:
        raise HTTPException(status_code=400, detail="模板画布至少包含一个有效节点")
    if not isinstance(workflow.get("edges", []), list):
        raise HTTPException(status_code=400, detail="模板连线数据无效")
    if not isinstance(workflow.get("viewport", {}), dict):
        raise HTTPException(status_code=400, detail="模板视口数据无效")


def create_workflow_template_router(
    store: WorkflowTemplateStore,
    asset_store=None,
) -> APIRouter:
    del asset_store  # Assets are localized before draft persistence.
    router = APIRouter()

    @router.get("/api/template-categories")
    def list_public_categories():
        return {"categories": store.list_public_categories()}

    @router.get("/api/workflow-templates")
    def list_public_templates(categoryId: Optional[str] = Query(default=None)):
        return {"templates": store.list_public_templates(categoryId)}

    @router.get("/api/workflow-templates/{template_id}")
    def get_public_template(template_id: str):
        try:
            return store.get_public_template(template_id)
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.get("/api/admin/template-categories")
    def list_admin_categories():
        return {"categories": store.list_categories()}

    @router.post("/api/admin/template-categories")
    def create_category(payload: CategoryCreate):
        try:
            return store.create_category(payload.model_dump())
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.put("/api/admin/template-categories/{category_id}")
    def update_category(category_id: str, payload: CategoryUpdate):
        try:
            return store.update_category(category_id, _model_patch(payload))
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.delete("/api/admin/template-categories/{category_id}")
    def delete_category(category_id: str):
        try:
            store.delete_category(category_id)
            return {"success": True}
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.get("/api/admin/workflow-templates")
    def list_admin_templates(
        categoryId: Optional[str] = Query(default=None),
        status: Optional[str] = Query(default=None),
    ):
        return {"templates": store.list_templates(categoryId, status)}

    @router.post("/api/admin/workflow-templates")
    def create_template(payload: TemplateCreate):
        try:
            return store.create_template(payload.model_dump())
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.get("/api/admin/workflow-templates/{template_id}")
    def get_admin_template(template_id: str):
        try:
            template = store.get_template(template_id)
            template["draft"] = store.get_draft(template_id)
            template["versions"] = store.list_versions(template_id)
            return template
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.put("/api/admin/workflow-templates/{template_id}")
    def update_template(template_id: str, payload: TemplateUpdate):
        try:
            return store.update_template(template_id, _model_patch(payload))
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.delete("/api/admin/workflow-templates/{template_id}")
    def delete_template(template_id: str):
        try:
            store.soft_delete_template(template_id)
            return {"success": True}
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.get("/api/admin/workflow-templates/{template_id}/draft")
    def get_draft(template_id: str):
        try:
            return store.get_draft(template_id)
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.put("/api/admin/workflow-templates/{template_id}/draft")
    def save_draft(template_id: str, payload: DraftPayload):
        try:
            return store.save_draft(template_id, payload.workflowData)
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.get("/api/admin/workflow-templates/{template_id}/versions")
    def list_versions(template_id: str):
        try:
            return {"versions": store.list_versions(template_id)}
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    @router.post("/api/admin/workflow-templates/{template_id}/publish")
    def publish_template(template_id: str):
        try:
            template = store.get_template(template_id)
            draft = store.get_draft(template_id)
            _validate_publishable(template, draft)
            version = store.publish(template_id)
            return {
                "success": True,
                "template": store.get_template(template_id),
                "version": version,
            }
        except HTTPException:
            raise
        except (KeyError, ValueError, TypeError) as error:
            _raise_store_error(error)

    @router.post("/api/admin/workflow-templates/{template_id}/unpublish")
    def unpublish_template(template_id: str):
        try:
            return {"success": True, "template": store.unpublish(template_id)}
        except (KeyError, ValueError) as error:
            _raise_store_error(error)

    return router
