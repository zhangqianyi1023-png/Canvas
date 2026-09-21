import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FLOW_TARGET_SELECTOR = [
  '.canvas-toolbar-btn',
  '.canvas-toolbar-toggle',
  '.canvas-toolbar-rail-btn',
  '.canvas-toolbar-panel-item',
  '.canvas-toolbar-add-option',
  '.canvas-page .back-button',
  '.icon-button',
  '.canvas-top-actions button',
  '.canvas-material-toggle',
  '.canvas-zoom-btn',
  '.canvas-zoom-pct',
  '.canvas-zoom-menu-item',
  '.node-hover-toolbar-btn',
  '.node-hover-toolbar-menu button',
  '.image-action-toolbar button',
  '.result-image-portal-toolbar button',
  '.selection-floating-toolbar button',
  '.text-format-toolbar button',
  '.image-crop-toolbar button',
  '.image-crop-ratio-menu button',
  '.image-rotation-toolbar button',
  '.inline-annotation-toolbar button',
  '.inline-annotation-size',
  '.inline-annotation-color-panel button',
  '.inline-inpaint-toolbar button',
  '.inline-inpaint-size',
  '.canvas-flow-hover-target',
  '.inline-inpaint-popover-trigger',
  '.inline-inpaint-popover > button',
  '.inline-inpaint-option-grid button',
  '.inline-inpaint-option-row button',
  '.inline-inpaint-run-btn',
  '.context-menu-item',
  '.processor-model-menu button',
  '.prompt-style-popover button',
  '.storyboard-generator-ratio-menu-item',
  '.video-frame-capture-menu button',
  '.video-quick-trim-decision',
  '.character-voice-toolbar button',
  '.character-voice-popover button',
  '.image-preview-toolbar button',
  '.canvas-template-menu-trigger',
  '.canvas-template-menu button',
  '.video-editor-timeline-toolbar button',
  '.video-editor-export-popover button',
  '.video-editor-canvas-settings-popover button',
  '.video-editor-context-menu button',
].join(',');

const OUTSET = 5;

const getExpandedRadius = (value) => {
  const radius = Number.parseFloat(value);
  return Number.isFinite(radius) ? `${radius + OUTSET}px` : value;
};

function CanvasFlowHoverBorder() {
  const borderRef = useRef(null);

  useEffect(() => {
    const border = borderRef.current;
    if (!border || window.matchMedia?.('(pointer: coarse)').matches) return undefined;

    let activeTarget = null;
    let frameId = 0;

    const hide = () => {
      activeTarget = null;
      border.classList.remove('is-visible');
    };

    const updatePosition = () => {
      frameId = 0;
      if (!activeTarget?.isConnected) {
        hide();
        return;
      }

      const rect = activeTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        hide();
        return;
      }

      const style = window.getComputedStyle(activeTarget);
      border.style.left = `${rect.left - OUTSET}px`;
      border.style.top = `${rect.top - OUTSET}px`;
      border.style.width = `${rect.width + OUTSET * 2}px`;
      border.style.height = `${rect.height + OUTSET * 2}px`;
      border.style.borderTopLeftRadius = getExpandedRadius(style.borderTopLeftRadius);
      border.style.borderTopRightRadius = getExpandedRadius(style.borderTopRightRadius);
      border.style.borderBottomRightRadius = getExpandedRadius(style.borderBottomRightRadius);
      border.style.borderBottomLeftRadius = getExpandedRadius(style.borderBottomLeftRadius);
      border.classList.add('is-visible');
    };

    const schedulePositionUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updatePosition);
    };

    const resolveTarget = (event) => {
      const origin = event.target;
      if (!(origin instanceof Element)) return null;
      const target = origin.closest(FLOW_TARGET_SELECTOR);
      if (!target) return null;
      if (target.closest('.inline-annotation-toolbar, .inline-inpaint-toolbar')) return null;
      if (
        target.matches(':disabled, [aria-disabled="true"]')
        || target.classList.contains('disabled')
        || target.closest('[inert]')
      ) return null;
      return target;
    };

    const handlePointerMove = (event) => {
      const nextTarget = resolveTarget(event);
      if (!nextTarget) {
        hide();
        return;
      }
      if (nextTarget !== activeTarget) activeTarget = nextTarget;
      schedulePositionUpdate();
    };

    const handlePointerDown = () => {
      hide();
    };

    const handlePointerOut = (event) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <span ref={borderRef} className="canvas-flow-hover-border" aria-hidden="true">
      <span className="canvas-flow-hover-field field-a" />
      <span className="canvas-flow-hover-field field-b" />
    </span>,
    document.body,
  );
}

export default CanvasFlowHoverBorder;
