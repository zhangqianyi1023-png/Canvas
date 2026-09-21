import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const getFocusableElements = root => Array.from(root?.querySelectorAll?.(FOCUSABLE) || [])
  .filter(element => !element.hidden && element.getAttribute?.('aria-hidden') !== 'true');

export function createModalLayerStack() {
  const layers = [];
  return {
    push(layer) {
      const existingIndex = layers.indexOf(layer);
      if (existingIndex >= 0) layers.splice(existingIndex, 1);
      layers.push(layer);
    },
    remove(layer) {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
    },
    top() {
      return layers[layers.length - 1] || null;
    },
    get size() {
      return layers.length;
    },
  };
}

export function handleModalStackKeyDown(event, stack, activeElement) {
  const layer = stack?.top?.();
  if (!layer || layer.suspended?.()) return false;

  if (event.key === 'Escape') {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    if (!layer.closeDisabled?.()) layer.onClose?.();
    return true;
  }

  if (event.key !== 'Tab') return false;
  const dialog = layer.getDialog?.();
  const elements = getFocusableElements(dialog);
  if (!elements.length) {
    event.preventDefault?.();
    dialog?.focus?.();
    return true;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  const current = activeElement ?? dialog?.ownerDocument?.activeElement ?? null;
  if (!dialog?.contains?.(current)) {
    event.preventDefault?.();
    (event.shiftKey ? last : first).focus?.();
    return true;
  }
  if (event.shiftKey && current === first) {
    event.preventDefault?.();
    last.focus?.();
    return true;
  }
  if (!event.shiftKey && current === last) {
    event.preventDefault?.();
    first.focus?.();
    return true;
  }
  return false;
}

const globalModalStack = createModalLayerStack();
let listenerDocument = null;

const handleGlobalModalKeyDown = event => handleModalStackKeyDown(
  event,
  globalModalStack,
  listenerDocument?.activeElement,
);

function ensureGlobalModalListener(ownerDocument) {
  if (!ownerDocument || listenerDocument === ownerDocument) return;
  listenerDocument?.removeEventListener?.('keydown', handleGlobalModalKeyDown, true);
  listenerDocument = ownerDocument;
  listenerDocument.addEventListener('keydown', handleGlobalModalKeyDown, true);
}

function removeGlobalModalListenerIfIdle() {
  if (globalModalStack.size > 0 || !listenerDocument) return;
  listenerDocument.removeEventListener('keydown', handleGlobalModalKeyDown, true);
  listenerDocument = null;
}

export function restoreModalFocus(stack, previous) {
  const topLayer = stack?.top?.();
  if (!topLayer) {
    if (previous?.isConnected) previous.focus?.();
    return;
  }
  const topDialog = topLayer.getDialog?.();
  if (previous?.isConnected && topDialog?.contains?.(previous)) {
    previous.focus?.();
    return;
  }
  (getFocusableElements(topDialog)[0] || topDialog)?.focus?.();
}

export function useModalFocus(open, onClose, { closeDisabled = false, suspended = false } = {}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const suspendedRef = useRef(suspended);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
    suspendedRef.current = suspended;
  }, [closeDisabled, onClose, suspended]);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const ownerDocument = dialog?.ownerDocument || document;
    const ownerWindow = ownerDocument.defaultView || window;
    const previousFocus = ownerDocument.activeElement;
    const layer = {
      getDialog: () => dialogRef.current,
      onClose: () => onCloseRef.current?.(),
      closeDisabled: () => closeDisabledRef.current,
      suspended: () => suspendedRef.current,
    };
    globalModalStack.push(layer);
    ensureGlobalModalListener(ownerDocument);
    const focusFrame = ownerWindow.requestAnimationFrame(() => {
      if (globalModalStack.top() !== layer) return;
      const currentDialog = dialogRef.current;
      (getFocusableElements(currentDialog)[0] || currentDialog)?.focus?.();
    });

    return () => {
      const wasTopLayer = globalModalStack.top() === layer;
      ownerWindow.cancelAnimationFrame(focusFrame);
      globalModalStack.remove(layer);
      removeGlobalModalListenerIfIdle();
      if (wasTopLayer) {
        ownerWindow.requestAnimationFrame(() => restoreModalFocus(globalModalStack, previousFocus));
      }
    };
  }, [open]);
  return dialogRef;
}
