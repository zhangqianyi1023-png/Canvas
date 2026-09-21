# Homepage Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a themed single-page homepage with a real login modal that gates entry to the existing InUx Canvas app.

**Architecture:** Add server-side cookie session auth to FastAPI, then gate the React app at the top level. Keep the existing canvas, project, material, template, and settings flows unchanged once the user is authenticated. Homepage and login UI use existing theme variables and focused new components.

**Tech Stack:** FastAPI, Python stdlib HMAC/PBKDF2, React 19, Vite, Node test runner, existing CSS theme variables.

---

## File Structure

- Create `backend/auth.py`: credential hashing, session token signing, cookie helpers, and FastAPI router.
- Modify `backend/main.py`: include the auth router.
- Create `backend/tests/test_auth.py`: direct tests for configured credentials, invalid login, session lookup, and logout.
- Create `frontend/src/Homepage.jsx`: single-page homepage and canvas-style capability preview.
- Create `frontend/src/LoginDialog.jsx`: modal form, field validation, loading, success, and error behavior.
- Create `frontend/src/LoginDialog.test.js`: tests for validation, success, and failure.
- Modify `frontend/src/App.jsx`: auth state, `/api/auth/me` startup check, homepage gate, login/logout handlers, and shared theme controls.
- Modify `frontend/src/index.css`: homepage and login modal styling using existing CSS variables.

## Task 1: Backend Auth Router

**Files:**
- Create: `backend/auth.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Write backend auth tests**

```python
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from auth import create_password_hash
from main import app


class AuthApiTest(unittest.TestCase):
    def setUp(self):
        self.password_hash = create_password_hash("secret-pass", salt="fixed-salt", iterations=1000)
        self.env = patch.dict(os.environ, {
            "INUX_ENV": "production",
            "INUX_AUTH_USER": "demo",
            "INUX_AUTH_PASSWORD_HASH": self.password_hash,
            "INUX_AUTH_SESSION_SECRET": "unit-test-secret",
        }, clear=False)
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.env.stop()

    def test_login_sets_authenticated_session(self):
        response = self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "secret-pass",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "username": "demo"})
        self.assertIn("inux_session", response.cookies)

        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json(), {"authenticated": True, "username": "demo"})

    def test_login_rejects_bad_credentials(self):
        response = self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "wrong-pass",
        })
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "用户名或密码错误")

    def test_me_reports_signed_out_without_session(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"authenticated": False})

    def test_logout_clears_session(self):
        self.client.post("/api/auth/login", json={
            "username": "demo",
            "password": "secret-pass",
        })
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.assertEqual(self.client.get("/api/auth/me").json(), {"authenticated": False})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run backend auth tests and verify they fail**

Run: `PYTHONPATH=backend:. python3 -m unittest backend.tests.test_auth -v`

Expected: fail because `auth` does not exist.

- [ ] **Step 3: Implement `backend/auth.py` and include router in `backend/main.py`**

```python
app.include_router(create_auth_router())
```

The auth module should expose `create_password_hash(password, salt=None, iterations=260000)`, verify `pbkdf2_sha256$iterations$salt$digest`, sign sessions with HMAC SHA-256, set an HTTP-only `inux_session` cookie, and fail closed in non-development environments without configured credentials.

- [ ] **Step 4: Run backend auth tests**

Run: `PYTHONPATH=backend:. python3 -m unittest backend.tests.test_auth -v`

Expected: all auth tests pass.

## Task 2: Frontend Login Dialog

**Files:**
- Create: `frontend/src/LoginDialog.jsx`
- Create: `frontend/src/LoginDialog.test.js`

- [ ] **Step 1: Write dialog tests**

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLoginPayload,
  getLoginValidationError,
  getLoginErrorMessage,
} from './LoginDialog.jsx';

test('buildLoginPayload trims username but preserves password', () => {
  assert.deepEqual(buildLoginPayload(' demo ', ' secret '), {
    username: 'demo',
    password: ' secret ',
  });
});

test('getLoginValidationError requires username and password', () => {
  assert.equal(getLoginValidationError('', 'secret'), '请输入用户名');
  assert.equal(getLoginValidationError('demo', ''), '请输入密码');
  assert.equal(getLoginValidationError('demo', 'secret'), '');
});

test('getLoginErrorMessage prefers server detail', () => {
  assert.equal(getLoginErrorMessage({ detail: '用户名或密码错误' }), '用户名或密码错误');
  assert.equal(getLoginErrorMessage({}), '登录失败，请稍后重试');
});
```

- [ ] **Step 2: Run dialog tests and verify they fail**

Run: `npm --prefix frontend test -- --run LoginDialog.test.js`

Expected: fail because `LoginDialog.jsx` does not exist.

- [ ] **Step 3: Implement dialog helpers and component**

`LoginDialog` should export pure helpers for tests and a default React component with username/password fields, loading state, inline errors, Enter submit, Escape close, and disabled controls while submitting.

- [ ] **Step 4: Run dialog tests**

Run: `npm --prefix frontend test -- --run LoginDialog.test.js`

Expected: dialog helper tests pass.

## Task 3: Homepage Gate

**Files:**
- Create: `frontend/src/Homepage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add homepage component**

Create `Homepage` with props `onLoginClick`, `themePreference`, `effectiveTheme`, `onThemePreferenceChange`, and `ThemeControl`. Render a compact nav, brand, theme control, login button, capability preview, and capability grid.

- [ ] **Step 2: Gate `App` by auth state**

Add `authState`, `loginDialogOpen`, `checkAuth`, `handleLogin`, and `handleLogout`. On startup, call `/api/auth/me`. If unauthenticated, render `Homepage` plus `LoginDialog`. If authenticated, render the existing app shell. Protect the `adminTemplateId` path with the same gate.

- [ ] **Step 3: Add homepage styles**

Add styles using existing variables. Keep card radii at 8px or below where they are simple cards, use glass shells sparingly, and support mobile layout without overlapping text.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm --prefix frontend test -- --run`

Expected: all frontend tests pass.

Run: `npm --prefix frontend run build`

Expected: production build passes.

## Task 4: Full Verification And Deployment

**Files:**
- No source files unless verification finds an issue.

- [ ] **Step 1: Run backend suite**

Run: `PYTHONPATH=backend:. python3 -m unittest discover -s backend/tests -v`

Expected: all backend tests pass.

- [ ] **Step 2: Build deployment artifact**

Run a tarball that includes backend runtime files, frontend `dist`, prompt style DB, and workflow template DB, while excluding local runtime settings, uploads, `.venv`, and `node_modules`.

- [ ] **Step 3: Configure server credentials**

Generate a PBKDF2 password hash for the chosen web password and set systemd environment variables:

```ini
Environment=INUX_ENV=production
Environment=INUX_AUTH_USER=inux
Environment=INUX_AUTH_PASSWORD_HASH=<generated-hash>
Environment=INUX_AUTH_SESSION_SECRET=<generated-secret>
```

- [ ] **Step 4: Remove Nginx Basic Auth after app login works**

Remove `auth_basic` and `auth_basic_user_file` from the Nginx site so users see only the application login modal.

- [ ] **Step 5: Verify public URL**

Verify `http://118.25.16.178/` shows the homepage, invalid login fails, valid login enters the canvas, `/api/auth/me` reports authenticated after login, and refresh keeps the session.
