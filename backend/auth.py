"""Small cookie-based auth layer for the deployed web app."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel


SESSION_COOKIE_NAME = "inux_session"
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
DEFAULT_DEV_USER = "inux"
DEFAULT_DEV_PASSWORD = "inux"


class LoginRequest(BaseModel):
    username: str = ""
    password: str = ""


@dataclass(frozen=True)
class AuthConfig:
    username: str
    password_hash: str
    session_secret: str
    cookie_secure: bool
    configured: bool


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _urlsafe_b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def create_password_hash(password: str, salt: Optional[str] = None, iterations: int = 260000) -> str:
    if iterations < 1000:
        raise ValueError("iterations must be at least 1000")
    resolved_salt = salt or _urlsafe_b64encode(secrets.token_bytes(16))
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        resolved_salt.encode("utf-8"),
        iterations,
    )
    return f"{PASSWORD_HASH_ALGORITHM}${iterations}${resolved_salt}${_urlsafe_b64encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt, expected_digest = password_hash.split("$", 3)
        iterations = int(iterations_text)
    except (AttributeError, ValueError):
        return False
    if algorithm != PASSWORD_HASH_ALGORITHM:
        return False
    actual_hash = create_password_hash(password, salt=salt, iterations=iterations)
    return hmac.compare_digest(actual_hash, password_hash)


def _is_development_environment() -> bool:
    env = os.environ.get("INUX_ENV", "").strip().lower()
    return env in {"", "dev", "development", "local", "test"}


def load_auth_config() -> AuthConfig:
    username = os.environ.get("INUX_AUTH_USER", "").strip()
    password_hash = os.environ.get("INUX_AUTH_PASSWORD_HASH", "").strip()
    session_secret = os.environ.get("INUX_AUTH_SESSION_SECRET", "").strip()
    cookie_secure = os.environ.get("INUX_AUTH_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}
    configured = bool(username and password_hash and session_secret)

    if not configured and _is_development_environment():
        username = username or DEFAULT_DEV_USER
        password_hash = password_hash or create_password_hash(DEFAULT_DEV_PASSWORD, salt="inux-dev", iterations=1000)
        session_secret = session_secret or "inux-dev-session-secret"
        configured = True

    return AuthConfig(
        username=username,
        password_hash=password_hash,
        session_secret=session_secret,
        cookie_secure=cookie_secure,
        configured=configured,
    )


def should_require_api_auth(path: str, method: str = "GET") -> bool:
    if method.upper() == "OPTIONS":
        return False
    if not path.startswith("/api/"):
        return False
    if path.startswith("/api/auth/") or path == "/api/health":
        return False
    return not _is_development_environment()


def get_authenticated_username_from_request(request: Request) -> Optional[str]:
    config = load_auth_config()
    if not config.configured:
        return None
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    username = read_session_token(token, config.session_secret) if token else None
    return username if username == config.username else None


def api_auth_error_response() -> JSONResponse:
    config = load_auth_config()
    if not config.configured:
        return JSONResponse({"detail": "登录凭据未配置"}, status_code=503)
    return JSONResponse({"detail": "请先登录"}, status_code=401)


def _sign(value: str, secret: str) -> str:
    signature = hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return _urlsafe_b64encode(signature)


def create_session_token(username: str, secret: str, ttl_seconds: int = DEFAULT_SESSION_TTL_SECONDS) -> str:
    payload = {
        "u": username,
        "exp": int(time.time()) + ttl_seconds,
    }
    encoded_payload = _urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{encoded_payload}.{_sign(encoded_payload, secret)}"


def read_session_token(token: str, secret: str) -> Optional[str]:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError:
        return None
    expected_signature = _sign(encoded_payload, secret)
    if not hmac.compare_digest(signature, expected_signature):
        return None
    try:
        payload = json.loads(_urlsafe_b64decode(encoded_payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp") or 0) < int(time.time()):
        return None
    username = payload.get("u")
    return username if isinstance(username, str) and username else None


def create_auth_router() -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["auth"])

    @router.post("/login")
    def login(req: LoginRequest, response: Response):
        config = load_auth_config()
        if not config.configured:
            raise HTTPException(status_code=503, detail="登录凭据未配置")

        username = req.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="请输入用户名")
        if not req.password:
            raise HTTPException(status_code=400, detail="请输入密码")

        valid = (
            hmac.compare_digest(username, config.username)
            and verify_password(req.password, config.password_hash)
        )
        if not valid:
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        response.set_cookie(
            SESSION_COOKIE_NAME,
            create_session_token(config.username, config.session_secret),
            max_age=DEFAULT_SESSION_TTL_SECONDS,
            httponly=True,
            secure=config.cookie_secure,
            samesite="lax",
            path="/",
        )
        return {"ok": True, "username": config.username}

    @router.get("/me")
    def me(request: Request):
        config = load_auth_config()
        if not config.configured:
            return {"authenticated": False}
        token = request.cookies.get(SESSION_COOKIE_NAME, "")
        username = read_session_token(token, config.session_secret) if token else None
        if username != config.username:
            return {"authenticated": False}
        return {"authenticated": True, "username": username}

    @router.post("/logout")
    def logout(response: Response):
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        return {"ok": True}

    return router
