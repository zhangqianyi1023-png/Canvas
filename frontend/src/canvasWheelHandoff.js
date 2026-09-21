import { useCallback, useLayoutEffect } from 'react';
import { useReactFlow } from 'reactflow';

const WHEEL_SCROLL_EPSILON = 1;
const DEFAULT_MIN_ZOOM = 0.05;
const DEFAULT_MAX_ZOOM = 4;
const WHEEL_ZOOM_FACTOR = 1.003;
const KEYBOARD_ZOOM_FACTOR = 1.2;

export const CANVAS_WHEEL_LISTENER_OPTIONS = { passive: false, capture: true };

const isScrollableOverflow = (value) => ['auto', 'scroll', 'overlay'].includes(value);

export const normalizeWheelDelta = (event) => {
  const lineHeight = 16;
  const pageHeight = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const domDeltaLine = typeof WheelEvent !== 'undefined' ? WheelEvent.DOM_DELTA_LINE : 1;
  const domDeltaPage = typeof WheelEvent !== 'undefined' ? WheelEvent.DOM_DELTA_PAGE : 2;
  const multiplier = event.deltaMode === domDeltaLine
    ? lineHeight
    : event.deltaMode === domDeltaPage
      ? pageHeight
      : 1;

  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
};

const canScrollElementOnAxis = (element, axis, delta) => {
  if (!element || !delta || typeof window === 'undefined') return false;
  const style = window.getComputedStyle(element);

  if (axis === 'y') {
    if (!isScrollableOverflow(style.overflowY)) return false;
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= WHEEL_SCROLL_EPSILON) return false;
    if (delta < 0) return element.scrollTop > WHEEL_SCROLL_EPSILON;
    return element.scrollTop < maxScrollTop - WHEEL_SCROLL_EPSILON;
  }

  if (!isScrollableOverflow(style.overflowX)) return false;
  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  if (maxScrollLeft <= WHEEL_SCROLL_EPSILON) return false;
  if (delta < 0) return element.scrollLeft > WHEEL_SCROLL_EPSILON;
  return element.scrollLeft < maxScrollLeft - WHEEL_SCROLL_EPSILON;
};

export const shouldKeepWheelInside = (event, boundary) => {
  const target = typeof Element !== 'undefined' && event.target instanceof Element ? event.target : null;
  if (!target || !boundary?.contains(target)) return false;

  let element = target;
  while (element && element !== boundary.parentElement) {
    if (
      canScrollElementOnAxis(element, 'y', event.deltaY)
      || canScrollElementOnAxis(element, 'x', event.deltaX)
    ) {
      return true;
    }
    if (element === boundary) break;
    element = element.parentElement;
  }

  return false;
};

export const getPannedViewport = (viewport, delta) => ({
  ...viewport,
  x: viewport.x - delta.x,
  y: viewport.y - delta.y,
});

export const getZoomedViewport = ({
  viewport,
  pointer,
  deltaY,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
}) => {
  const nextZoom = Math.min(
    maxZoom,
    Math.max(minZoom, viewport.zoom * Math.pow(WHEEL_ZOOM_FACTOR, -deltaY)),
  );

  if (Math.abs(nextZoom - viewport.zoom) < 0.0001) {
    return viewport;
  }

  const flowPoint = {
    x: (pointer.x - viewport.x) / viewport.zoom,
    y: (pointer.y - viewport.y) / viewport.zoom,
  };

  return {
    x: pointer.x - flowPoint.x * nextZoom,
    y: pointer.y - flowPoint.y * nextZoom,
    zoom: nextZoom,
  };
};

export const getCenteredZoomViewport = ({
  viewport,
  width,
  height,
  nextZoom,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
}) => {
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
  if (Math.abs(clampedZoom - viewport.zoom) < 0.0001) {
    return viewport;
  }

  const center = {
    x: width / 2,
    y: height / 2,
  };
  const flowPoint = {
    x: (center.x - viewport.x) / viewport.zoom,
    y: (center.y - viewport.y) / viewport.zoom,
  };

  return {
    x: center.x - flowPoint.x * clampedZoom,
    y: center.y - flowPoint.y * clampedZoom,
    zoom: clampedZoom,
  };
};

const getKeyboardZoomDirection = (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return 0;
  if (event.code === 'Equal' || event.code === 'NumpadAdd' || event.key === '+' || event.key === '=') {
    return 1;
  }
  if (event.code === 'Minus' || event.code === 'NumpadSubtract' || event.key === '-') {
    return -1;
  }
  return 0;
};

const isKeyboardZoomReset = (event) => (
  (event.metaKey || event.ctrlKey)
  && !event.altKey
  && (event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0')
);

export const isBrowserZoomKeyboardEvent = (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (getKeyboardZoomDirection(event)) return true;
  return isKeyboardZoomReset(event);
};

export function handOffWheelToCanvas(event, {
  boundary,
  getViewport,
  setViewport,
  container,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  allowScrollBoundaryHandoff = true,
} = {}) {
  if (shouldKeepWheelInside(event, boundary)) return false;

  const delta = normalizeWheelDelta(event);
  if (!delta.x && !delta.y) return false;

  if (!allowScrollBoundaryHandoff && !(event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  event.preventDefault();
  event.stopPropagation();

  const viewport = getViewport();
  if ((event.metaKey || event.ctrlKey) && container && delta.y) {
    const rect = container.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setViewport(getZoomedViewport({ viewport, pointer, deltaY: delta.y, minZoom, maxZoom }));
    return true;
  }

  setViewport(getPannedViewport(viewport, delta));
  return true;
}

export function zoomCanvasFromWheelEvent(event, {
  getViewport,
  setViewport,
  container,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
} = {}) {
  if (!(event.metaKey || event.ctrlKey) || !container) return false;

  const delta = normalizeWheelDelta(event);
  if (!delta.y) return false;

  event.preventDefault();
  event.stopPropagation();

  const rect = container.getBoundingClientRect();
  const pointer = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  setViewport(getZoomedViewport({
    viewport: getViewport(),
    pointer,
    deltaY: delta.y,
    minZoom,
    maxZoom,
  }));
  return true;
}

export function zoomCanvasFromKeyboardEvent(event, {
  getViewport,
  setViewport,
  container,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  zoomFactor = KEYBOARD_ZOOM_FACTOR,
} = {}) {
  const direction = getKeyboardZoomDirection(event);
  const shouldReset = isKeyboardZoomReset(event);
  if ((!direction && !shouldReset) || !container) return false;

  event.preventDefault();
  event.stopPropagation();

  const viewport = getViewport();
  const width = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const height = container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const nextZoom = shouldReset
    ? 1
    : direction > 0
      ? viewport.zoom * zoomFactor
      : viewport.zoom / zoomFactor;

  setViewport(getCenteredZoomViewport({
    viewport,
    width,
    height,
    nextZoom,
    minZoom,
    maxZoom,
  }));
  return true;
}

export function useCanvasWheelHandoff(boundaryRef, options = {}) {
  const { getViewport, setViewport } = useReactFlow();
  const {
    enabled = true,
    container,
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    allowScrollBoundaryHandoff,
  } = options;

  const handleWheel = useCallback((event) => {
    handOffWheelToCanvas(event, {
      boundary: boundaryRef.current,
      getViewport,
      setViewport,
      container: container?.current || container || document.querySelector('.canvas-flow-shell'),
      minZoom,
      maxZoom,
      allowScrollBoundaryHandoff,
    });
  }, [allowScrollBoundaryHandoff, boundaryRef, container, getViewport, maxZoom, minZoom, setViewport]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const element = boundaryRef.current;
    if (!element) return undefined;
    element.addEventListener('wheel', handleWheel, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => element.removeEventListener('wheel', handleWheel, CANVAS_WHEEL_LISTENER_OPTIONS);
  }, [boundaryRef, enabled, handleWheel]);
}
