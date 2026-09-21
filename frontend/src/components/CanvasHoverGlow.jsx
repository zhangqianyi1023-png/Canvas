import { useEffect } from 'react';

const GLOW_TARGET_SELECTOR = [
  '.custom-node',
  '.canvas-group-node',
  '.result-image-wrap',
  '.result-video-wrap',
  '.result-skeleton',
  '.result-video-placeholder',
  '.result-text-output',
  '.result-empty',
  '.result-text-skeleton',
  '.image-upload-zone',
  '.image-thumb',
  '.video-thumb',
  '.canvas-toolbar-bar',
  '.canvas-toolbar-btn',
  '.canvas-top-actions',
  '.canvas-page:not(.official-template-editor) > .canvas-topbar .back-button',
  '.canvas-material-toggle',
  '.canvas-zoom-btn',
  '.canvas-zoom-pct',
  '.canvas-zoom-menu',
  '.canvas-zoom-menu-item',
  '.node-hover-toolbar',
  '.node-hover-toolbar-portal',
  '.node-hover-toolbar-btn',
  '.image-action-toolbar',
  '.image-action-toolbar button',
  '.result-image-portal-toolbar',
  '.result-image-portal-toolbar button',
  '.selection-floating-toolbar',
].join(',');

function setGlowPosition(element, event) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  element.style.setProperty('--hover-glow-x', `${Math.max(0, Math.min(100, x))}%`);
  element.style.setProperty('--hover-glow-y', `${Math.max(0, Math.min(100, y))}%`);
}

export default function CanvasHoverGlow({ rootRef }) {
  useEffect(() => {
    const root = rootRef?.current;
    if (!root || window.matchMedia?.('(pointer: coarse)').matches) return undefined;

    let activeElement = null;

    const clearActiveElement = () => {
      if (!activeElement) return;
      activeElement.classList.remove('hover-glow-active');
      activeElement = null;
    };

    const handlePointerMove = (event) => {
      const target = event.target?.closest?.(GLOW_TARGET_SELECTOR);
      const isTopbarBackButton = target?.matches?.('.canvas-page:not(.official-template-editor) > .canvas-topbar .back-button');
      if (!target || (!root.contains(target) && !isTopbarBackButton)) {
        clearActiveElement();
        return;
      }

      if (activeElement !== target) {
        clearActiveElement();
        activeElement = target;
        activeElement.classList.add('hover-glow-active');
      }
      setGlowPosition(activeElement, event);
    };

    const handlePointerDown = () => {
      clearActiveElement();
    };

    root.addEventListener('pointermove', handlePointerMove, { passive: true });
    root.addEventListener('pointerleave', clearActiveElement);
    root.addEventListener('pointercancel', clearActiveElement);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      clearActiveElement();
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', clearActiveElement);
      root.removeEventListener('pointercancel', clearActiveElement);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [rootRef]);

  return null;
}
