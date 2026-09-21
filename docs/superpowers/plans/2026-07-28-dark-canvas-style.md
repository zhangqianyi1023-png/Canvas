# Dark Canvas Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the dark-mode canvas so its background, text, borders, floating controls, and nodes match the approved reference-image hierarchy.

**Architecture:** Keep the implementation CSS-only and token-driven. Update dark theme variables first, then add narrowly scoped canvas dark-mode overrides only where existing later CSS rules prevent the tokens from producing the intended result.

**Tech Stack:** React, Vite, React Flow, CSS custom properties in `frontend/src/index.css`, Playwright/browser visual inspection.

---

### Task 1: Update Dark Canvas Visual Tokens

**Files:**
- Modify: `frontend/src/index.css`

- [x] **Step 1: Replace the dark theme token stack**

In `[data-theme='dark']`, change the near-black surface, text, border, React Flow, floating chrome, node, and group variables to a neutral four-level hierarchy:

```css
--bg-app:        #070707;
--bg-surface:    #0d0d0e;
--bg-elevated:   #171718;
--bg-hover:      #242426;
--bg-selected:   rgba(255, 255, 255, 0.075);
--bg-group:      rgba(255, 255, 255, 0.035);
--fg-primary:    #f4f4f5;
--fg-secondary:  #b7b7bc;
--fg-tertiary:   #77787f;
--fg-muted:      #5f6067;
--border-subtle:  rgba(255, 255, 255, 0.055);
--border-default: rgba(255, 255, 255, 0.095);
--border-strong:  rgba(255, 255, 255, 0.18);
--rf-bg:         #0b0b0c;
--rf-dots:       rgba(255, 255, 255, 0.155);
--canvas-floating-bg: rgba(24, 24, 25, 0.94);
--canvas-panel-bg: #141415;
--canvas-inner-bg: #111112;
--canvas-field-bg: #0f0f10;
```

- [x] **Step 2: Tune interaction tokens**

Use softer accent shadows and selected outlines:

```css
--node-hover-border: rgba(255, 255, 255, 0.16);
--node-hover-outline: rgba(255, 255, 255, 0.04);
--node-hover-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
--node-selected-shadow: 0 0 0 1px rgba(42, 130, 255, 0.34), 0 18px 38px rgba(0, 0, 0, 0.30);
--group-border: rgba(255, 255, 255, 0.08);
--group-border-active: rgba(255, 255, 255, 0.18);
```

### Task 2: Add Scoped Canvas Dark-Mode Polish

**Files:**
- Modify: `frontend/src/index.css`

- [x] **Step 1: Add canvas shell depth**

Make the canvas page and React Flow shell show the approved base/canvas split:

```css
[data-theme='dark'] .canvas-page {
  background: #070707;
}

[data-theme='dark'] .canvas-flow-shell {
  background: var(--rf-bg);
}

[data-theme='dark'] .react-flow__background {
  background: var(--rf-bg);
}
```

- [x] **Step 2: Refine floating chrome**

Apply restrained borders, inset highlights, and less colorful hover states to topbar, top actions, toolbar, drawers, theme menu, zoom menu, and minimap:

```css
[data-theme='dark'] .canvas-page:not(.official-template-editor) > .canvas-topbar,
[data-theme='dark'] .canvas-top-actions,
[data-theme='dark'] .canvas-toolbar-bar,
[data-theme='dark'] .canvas-toolbar-add-menu,
[data-theme='dark'] .canvas-material-drawer,
[data-theme='dark'] .canvas-template-runner-drawer,
[data-theme='dark'] .canvas-zoom-menu,
[data-theme='dark'] .theme-mode-popover,
[data-theme='dark'] .canvas-minimap {
  border-color: var(--glass-border);
  background: var(--canvas-floating-bg);
  box-shadow: var(--canvas-floating-shadow);
}
```

- [x] **Step 3: Refine node and field surfaces**

Ensure dark nodes and inner content read as one clear level above the canvas:

```css
[data-theme='dark'] .custom-node,
[data-theme='dark'] .result-storyboard-node {
  background: var(--canvas-panel-bg);
}

[data-theme='dark'] .node-field input,
[data-theme='dark'] .node-field textarea,
[data-theme='dark'] .node-field select,
[data-theme='dark'] .node-output {
  background: var(--canvas-field-bg);
}
```

### Task 3: Verify

**Files:**
- No source changes beyond `frontend/src/index.css`

- [x] **Step 1: Build frontend**

Run:

```bash
npm --prefix frontend run build
```

Expected: Vite build completes successfully.

- [x] **Step 2: Inspect in browser**

Open `http://127.0.0.1:5173/`, force dark mode if needed, and verify:

```text
The canvas background is near black but not flat.
Floating controls are readable and quiet.
Nodes, groups, text fields, and result surfaces remain separated.
Hover and selected states are visible without heavy glow.
Light mode remains visually unchanged.
```
