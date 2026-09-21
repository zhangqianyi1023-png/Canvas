# InUx Canvas Homepage And Login Design

## Goal

Add a single-page official homepage in front of the existing canvas app. The page should feel like the current canvas product, support light and dark themes, explain the canvas capabilities, and provide a login button that opens a modal. After a valid login, the user enters the existing canvas experience.

The homepage is an application gateway, not a marketing site with separate routing. The existing projects, materials, templates, settings, and canvas flows should remain unchanged after authentication.

## User Experience

When the app loads and the user is not authenticated, show a full-screen homepage.

The homepage includes:

- A compact top navigation with the InUx Canvas brand, theme toggle, and login button.
- A first-viewport product statement focused on AI canvas creation.
- A canvas-style capability preview using node cards, connector lines, panels, and glass surfaces that match the existing app.
- Capability sections for prompt orchestration, reference media, image generation, video generation, material reuse, workflow templates, and task tracking.
- A login modal opened from the login button.

The login modal includes:

- Username and password fields.
- Submit, cancel, loading, and error states.
- Keyboard submission with Enter.
- Escape/outside-click close when not submitting.

After login succeeds:

- The homepage is replaced by the current app shell.
- Existing local projects and settings continue loading as they do now.
- Refreshing the page keeps the user authenticated until logout or session expiry.

## Theme Behavior

The homepage uses the existing `useThemeMode()` state and the existing `document.documentElement.dataset.theme` mechanism.

The theme toggle should be available before and after login. The user's existing theme preference in local storage remains the source of truth.

No separate homepage color system should be introduced. New homepage styles should use the existing CSS variables such as `--bg-app`, `--bg-elevated`, `--glass-bg`, `--fg-primary`, `--fg-secondary`, `--border-default`, `--accent`, and `--accent-soft`.

## Authentication

Authentication should be real server-side validation.

Backend endpoints:

- `POST /api/auth/login`: accepts `{ username, password }`, validates credentials, sets an HTTP-only session cookie, and returns `{ ok: true }`.
- `GET /api/auth/me`: returns `{ authenticated: true, username }` when the session is valid, otherwise `{ authenticated: false }`.
- `POST /api/auth/logout`: clears the session cookie.

Credentials should not be hard-coded in frontend code. Server-side credentials are read from environment variables:

- `INUX_AUTH_USER`
- `INUX_AUTH_PASSWORD_HASH`
- optional `INUX_AUTH_SESSION_SECRET`

If no credentials are configured, development should remain usable only when the app is running in an explicit development environment. Non-development runs without credentials should fail closed and return a configuration error from login.

Session cookies should be HTTP-only and same-site lax. Secure cookies can be enabled when HTTPS is configured.

## Application Flow

`App` remains the top-level owner of theme state and existing app state.

New state should be added near the top level:

- authentication load state
- authenticated user
- login modal open state

Startup flow:

1. Apply the effective theme as today.
2. Load authentication state from `/api/auth/me`.
3. If unauthenticated, render the homepage.
4. If authenticated, render the existing app shell or active canvas route.

The special `adminTemplateId` editor path should use the same auth gate before rendering, because it exposes administrative editing behavior.

## Components

Add focused frontend components instead of expanding `App.jsx` further where practical:

- `Homepage`: renders the single-page homepage and capability preview.
- `LoginDialog`: renders the login modal and owns form field state.

Use the existing `Icon` and `ThemeModeButton` patterns where possible. If `ThemeModeButton` is currently local to `App.jsx`, it can remain there for this change unless extraction is needed for clarity.

## Error Handling

Homepage:

- If `/api/auth/me` fails, show the homepage in signed-out mode and allow login.

Login:

- Invalid credentials show a concise inline error.
- Network or server errors show a retryable inline error.
- While submitting, disable form controls and keep the modal open.

Backend:

- Reject malformed login payloads with 400.
- Reject invalid credentials with 401.
- Do not return password hashes or secrets.

## Deployment Notes

The current deployed server uses Nginx Basic Auth. After application login is implemented and deployed, Basic Auth should be removed or kept only temporarily during verification. Keeping both would create two login prompts and a poor user experience.

For production, configure the service with explicit `INUX_AUTH_USER`, `INUX_AUTH_PASSWORD_HASH`, and `INUX_AUTH_SESSION_SECRET` values.

## Tests

Backend tests:

- Login succeeds with configured credentials.
- Login fails with bad credentials.
- `/api/auth/me` reflects authenticated and unauthenticated states.
- Logout clears the session.

Frontend tests:

- Login dialog validates required fields.
- Successful login calls the success handler.
- Failed login shows an error.

Manual verification:

- Homepage renders in light and dark themes.
- Login opens a modal and enters the existing canvas app after success.
- Refresh keeps the signed-in state.
- Existing project creation and canvas entry still work.
