# Remove Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Electron, PyInstaller, and desktop update/distribution support so the project only keeps the Web frontend plus FastAPI backend.

**Architecture:** Keep the product runtime as a browser-based frontend served by the existing backend during development. Delete the separate desktop shell, update bridge, packaging scripts, and CI workflow. Keep backend path resolution and upload storage logic because the Web app still needs local development storage.

**Tech Stack:** React, Vite, FastAPI, Python unittest, GitHub Actions

---

### Task 1: Delete desktop distribution code

**Files:**
- Delete: `desktop/backend-runtime.cjs`
- Delete: `desktop/backend-runtime.test.cjs`
- Delete: `desktop/main.cjs`
- Delete: `desktop/preload.cjs`
- Delete: `desktop/update-service.cjs`
- Delete: `desktop/update-service.test.cjs`
- Delete: `desktop/scripts/build-backend.sh`
- Delete: `desktop/scripts/build-mac.sh`
- Delete: `desktop/scripts/build-win.ps1`
- Delete: `desktop/package.json`
- Delete: `desktop/package-lock.json`
- Delete: `desktop/build/icon.icns`
- Delete: `desktop/build/icon-master.png`

- [ ] **Step 1: Remove the files above**

- [ ] **Step 2: Verify the desktop directory is no longer tracked**

Run: `git ls-files desktop`
Expected: no output

### Task 2: Remove desktop-specific backend entrypoints and tests

**Files:**
- Delete: `backend/deploy_static_app.py`
- Delete: `backend/desktop_entry.py`
- Delete: `backend/desktop_backend.spec`
- Delete: `backend/tests/test_desktop_entry.py`

- [ ] **Step 1: Remove the files above**

- [ ] **Step 2: Run backend tests that still matter**

Run: `PYTHONPATH=backend:. python3 -m unittest discover -s backend/tests -v`
Expected: pass

### Task 3: Remove desktop update UI and references

**Files:**
- Delete: `frontend/src/components/DesktopUpdateControl.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Remove the desktop update import and render path from `App.jsx`**

- [ ] **Step 2: Remove the desktop update styles from `index.css`**

- [ ] **Step 3: Run frontend tests**

Run: `npm --prefix frontend test -- --run`
Expected: pass

### Task 4: Remove release and desktop packaging docs/config

**Files:**
- Delete: `.github/workflows/windows-desktop.yml`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `backend/app_paths.py`

- [ ] **Step 1: Remove desktop packaging and update-flow sections from `README.md`**

- [ ] **Step 2: Remove desktop packaging-specific ignore entries from `.gitignore`**

- [ ] **Step 3: Reduce `backend/app_paths.py` docstring to generic Web/dev storage wording**

- [ ] **Step 4: Run a repo-wide search for desktop packaging remnants**

Run: `rg -n -i "desktop|electron|pyinstaller|build:mac|build:win|dist:mac|dist:win|check-for-updates|open-release-page|inuxDesktop" README.md backend frontend desktop .github .gitignore`
Expected: only generic occurrences in comments/docs that do not imply a desktop product, or no output

### Task 5: Final verification

**Files:**
- None

- [ ] **Step 1: Run the relevant test suites**

Run:
`PYTHONPATH=backend:. python3 -m unittest discover -s backend/tests -v`
`npm --prefix frontend test -- --run`
Expected: pass

- [ ] **Step 2: Confirm the worktree only contains the intended cleanup**

Run: `git status --short`
Expected: only the planned deletions and doc updates
