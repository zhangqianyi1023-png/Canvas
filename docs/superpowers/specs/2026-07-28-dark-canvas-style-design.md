# Dark Canvas Style Design

## Goal

Improve the dark-mode canvas so it feels closer to the provided reference: calm, layered, highly legible, and tool-focused. The intent is not to copy the product layout, but to borrow its visual hierarchy: near-black background layers, restrained borders, clear text gray levels, and quiet floating controls.

## Approved Direction

Use direction B, "reference-image quality":

- Four dark surface levels: app base, canvas base, floating chrome, and node/input surfaces.
- Three text levels: primary bright text, secondary readable gray, and tertiary muted gray.
- Low-contrast dividers and borders that separate regions without glowing or shouting.
- Existing blue accent remains, but hover and selected states should feel softer and less saturated.
- Canvas content should become the focus; top actions, toolbar, minimap, drawers, and nodes should recede slightly.

## Scope

Update only the dark-mode visual layer for the canvas workspace:

- Dark theme tokens in `frontend/src/index.css`.
- Canvas shell, React Flow background, floating toolbar/topbar/top actions, minimap, and canvas drawer surfaces.
- Node, input, result, and group-node dark-mode surfaces where they inherit from the shared tokens.
- Hover, selected, and focus visual states affected by those tokens.

Do not change:

- Canvas layout structure or interaction behavior.
- Node data, generation flows, provider settings, or storage logic.
- Light mode styling, except if a shared rule needs a narrow guard to avoid regression.

## Visual System

Dark mode should use a neutral near-black stack:

- App background: deepest black, used behind the whole canvas workspace.
- Canvas background: slightly lifted black, enough to distinguish the working area.
- Floating chrome: panel dark with translucent border and restrained shadow.
- Node/input surfaces: one level above canvas, with subtle borders and no heavy shadows by default.

Text hierarchy:

- Primary: near-white for labels, active titles, and important controls.
- Secondary: warm/cool neutral gray for normal helper text and metadata.
- Tertiary: lower-contrast gray for placeholders, timestamps, disabled or background information.
- Muted text must remain readable on dark fields and not drop below practical contrast.

## Interaction States

Hover states should brighten surfaces slightly and reveal borders, not create large colorful glows. Selected states can use the blue accent, but as a fine border or soft outline rather than a strong halo. Error states keep their existing red affordance.

## Testing

After implementation:

- Run `npm --prefix frontend run build`.
- Inspect the canvas in dark mode at `http://127.0.0.1:5173/`.
- Verify topbar, toolbar, task center toggle, minimap, nodes, text fields, and selected/hovered nodes remain readable and visually separated.

## Risks

The existing stylesheet has many later overrides, so token changes may not reach every component. If a component has hard-coded dark colors, adjust it only when it affects the canvas dark-mode hierarchy and keep the selector narrowly scoped.
