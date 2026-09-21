# Image Node Annotation Design

## Goal

Bring the image-node annotation flow closer to the AIXTV reference: a user can click an image node's "mark" action, annotate directly on top of the image from a compact floating toolbar, then click Done to automatically create and connect the next image-generation node.

## Confirmed Direction

Use option A:

- Done creates a downstream image-generation pair.
- The source image is passed as `connectedImages`.
- The composited annotated image is passed as `uploadedReferenceImages`.
- The new generator prompt explains that the annotation image is guidance for what to modify.

The feature is a visual annotation workflow, not a replacement for the existing full-screen mask editor/inpaint workflow.

## User Experience

1. Hovering an image still shows the existing image action toolbar.
2. Clicking `标记` enters annotation mode on that image.
3. The normal image action toolbar is replaced by an annotation toolbar positioned above the image node, similar to the AIXTV reference.
4. The user can annotate directly over the displayed image.
5. Pointer events inside annotation mode draw annotations and do not pan or drag the canvas.
6. Clicking `取消` exits annotation mode and discards unsaved marks.
7. Clicking `完成` exits annotation mode and creates the connected downstream image generator.

## Annotation Tools

The initial toolset should cover common mark operations:

- Pen/freehand
- Rectangle
- Circle
- Text
- Color swatches
- Stroke width control
- Undo
- Redo
- Eraser
- Cancel
- Done

The UI should use the app's existing dark canvas styling: compact controls, subdued borders, elevated dark background, and clear active states.

## Data Flow

1. `ImageActionOverlay` owns annotation mode for the active image.
2. A new inline annotation component renders a canvas overlay aligned with the image's displayed dimensions.
3. The component keeps annotation history locally for undo/redo.
4. On Done, the component composites the original image and annotation layer into a PNG data URL.
5. `ImageActionOverlay` emits `annotationSubmit` with:
   - `imageUrl`
   - `nodeId`
   - `sourceType`
   - `annotatedImageDataUrl`
   - `annotationMode: 'visual-markup'`
6. `App.jsx` handles visual markup submissions by calling `createGeneratePair('generateImage', ...)` with:
   - `connectedImages: [imageUrl]`
   - `uploadedReferenceImages: [annotatedImageDataUrl]`
   - a default prompt explaining the annotation intent

Existing mask submissions can keep using `maskDataUrl` and the local-edit prompt.

## Component Boundaries

### `ImageActionOverlay`

Coordinates image actions, annotation-mode state, and communication back to `App.jsx`.

### Inline Annotation Component

Responsible for:

- Tool selection
- Drawing and shape gestures
- Text annotation entry
- Canvas sizing relative to the image
- Undo/redo stacks
- Composited PNG export

It should not know about React Flow nodes or generator creation.

### `App.jsx`

Responsible for interpreting `annotationSubmit` payloads and creating the downstream node pair.

## Edge Cases

- If the image is not loaded, annotation mode should show a disabled or loading state.
- If the user clicks Done with no marks, still allow creating the next node only if the annotation canvas can export; the prompt should remain useful.
- Cross-origin images can taint canvas export. The image element should use `crossOrigin="anonymous"` where possible, and export should fail gracefully with a clear alert if the browser blocks compositing.
- Text annotations should commit on Enter or blur; Escape should cancel the active text input.
- Annotation controls must remain usable when the result image toolbar is rendered through a portal.

## Verification

- Build succeeds with `npm run build` in `frontend`.
- Existing frontend tests still pass with `npm test` in `frontend`.
- Manual browser check:
  - Image node shows `标记`.
  - Clicking `标记` opens the inline toolbar above the image.
  - Pen, rectangle, circle, text, color, width, undo, redo, and eraser work.
  - Cancel discards annotations.
  - Done creates a connected downstream image-generation node.
  - The downstream node contains the original image and annotated image as references.
