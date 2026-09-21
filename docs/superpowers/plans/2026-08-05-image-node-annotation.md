# Image Node Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AIXTV-like inline annotation mode to image nodes, then create and connect a downstream image-generation node when the user clicks Done.

**Architecture:** Keep annotation drawing in a focused `InlineImageAnnotationEditor` component owned by `ImageActionOverlay`. Route completion through the existing `annotationSubmit` action, and let `App.jsx` create the downstream generator using the original image plus the composited annotated image.

**Tech Stack:** React 19, Vite, React Flow, Canvas 2D API, Node test runner.

---

### Task 1: Prompt/Payload Helper

**Files:**
- Create: `frontend/src/imageAnnotationPrompt.js`
- Test: `frontend/src/imageAnnotationPrompt.test.js`

- [ ] Add `buildVisualAnnotationPrompt(instruction)` that returns the default Chinese prompt for visual markup and appends optional user text.
- [ ] Add `buildVisualAnnotationReferences(imageUrl, annotatedImageDataUrl)` that returns `{ connectedImages, uploadedReferenceImages }` with falsey values removed.
- [ ] Test that the helper keeps the source image in `connectedImages`, the annotated image in `uploadedReferenceImages`, and includes annotation guidance text.

### Task 2: Inline Annotation Editor

**Files:**
- Create: `frontend/src/components/InlineImageAnnotationEditor.jsx`
- Modify: `frontend/src/components/Icon.jsx`
- Modify: `frontend/src/index.css`

- [ ] Render an annotation canvas over the image area and a compact floating toolbar above the image.
- [ ] Support pen, rectangle, circle, text, color swatches, stroke width, undo, redo, eraser, cancel, and done.
- [ ] Stop pointer propagation inside annotation mode so canvas panning and node dragging do not interfere.
- [ ] Export a composited PNG data URL on Done by drawing the original image and the annotation layer into one canvas.
- [ ] Show a clear alert if compositing fails, most likely because the browser blocked cross-origin canvas export.

### Task 3: Image Toolbar Integration

**Files:**
- Modify: `frontend/src/nodes/ImageActionOverlay.jsx`

- [ ] Change the image action `标记` to enter inline annotation mode instead of opening the full-screen mask editor.
- [ ] Keep `ImageMaskEditor` support available for existing preview-overlay usage.
- [ ] Emit `annotationSubmit` with `annotationMode: 'visual-markup'`, `annotatedImageDataUrl`, source image metadata, and optional instruction text.
- [ ] Hide the normal image action toolbar while annotation mode is active.

### Task 4: Downstream Node Creation

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] Import the visual annotation helper.
- [ ] In `handleImageAction`, branch visual-markup submissions before the existing mask branch.
- [ ] Create a downstream `generateImage` pair at `getNodeDownstreamPosition(nodeId)`.
- [ ] Pass `connectedImages: [imageUrl]`, `uploadedReferenceImages: [annotatedImageDataUrl]`, and the default visual annotation prompt.
- [ ] Preserve existing `maskDataUrl` behavior for local-edit/inpaint submissions.

### Task 5: Verification

**Files:**
- Modify only if verification exposes defects.

- [ ] Run `npm test` in `frontend`; expected: all Node test files pass.
- [ ] Run `npm run build` in `frontend`; expected: Vite build completes.
- [ ] Start the local frontend/backend if needed.
- [ ] In the browser, verify an image node enters annotation mode, the tools draw marks, Cancel discards marks, and Done creates a connected downstream image generator with original and annotated references.

### Self-Review

- Spec coverage: Tasks 2-4 cover inline toolbar, common mark operations, Done creating a connected downstream image-generation node, and preserving the old mask path.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: visual markup payload uses `annotationMode`, `annotatedImageDataUrl`, `imageUrl`, `nodeId`, `sourceType`, and `instruction` consistently across component, overlay, and app handler.
