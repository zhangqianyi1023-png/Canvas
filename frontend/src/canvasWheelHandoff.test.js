import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCenteredZoomViewport,
  getPannedViewport,
  getZoomedViewport,
  handOffWheelToCanvas,
  isBrowserZoomKeyboardEvent,
  normalizeWheelDelta,
  shouldKeepWheelInside,
  zoomCanvasFromKeyboardEvent,
  zoomCanvasFromWheelEvent,
} from './canvasWheelHandoff.js';

const withFakeDom = (testFn) => {
  const previousElement = global.Element;
  const previousWindow = global.window;

  class FakeElement {
    constructor({
      parentElement = null,
      overflowX = 'visible',
      overflowY = 'visible',
      scrollLeft = 0,
      scrollTop = 0,
      scrollWidth = 100,
      scrollHeight = 100,
      clientWidth = 100,
      clientHeight = 100,
    } = {}) {
      this.parentElement = parentElement;
      this.scrollLeft = scrollLeft;
      this.scrollTop = scrollTop;
      this.scrollWidth = scrollWidth;
      this.scrollHeight = scrollHeight;
      this.clientWidth = clientWidth;
      this.clientHeight = clientHeight;
      this.style = { overflowX, overflowY };
    }

    contains(target) {
      let element = target;
      while (element) {
        if (element === this) return true;
        element = element.parentElement;
      }
      return false;
    }
  }

  global.Element = FakeElement;
  global.window = {
    innerHeight: 800,
    getComputedStyle: (element) => element.style,
  };

  try {
    testFn(FakeElement);
  } finally {
    global.Element = previousElement;
    global.window = previousWindow;
  }
};

test('normalizes pixel wheel deltas without scaling', () => {
  const delta = normalizeWheelDelta({
    deltaMode: 0,
    deltaX: 12,
    deltaY: -24,
  });

  assert.deepEqual(delta, { x: 12, y: -24 });
});

test('pans viewport in the opposite direction of wheel deltas', () => {
  const viewport = getPannedViewport(
    { x: 100, y: 200, zoom: 1 },
    { x: 12, y: -24 },
  );

  assert.deepEqual(viewport, { x: 88, y: 224, zoom: 1 });
});

test('zooms around the pointer and respects max zoom', () => {
  const viewport = getZoomedViewport({
    viewport: { x: 0, y: 0, zoom: 1 },
    pointer: { x: 100, y: 50 },
    deltaY: -120,
    minZoom: 0.05,
    maxZoom: 1.1,
  });

  assert.equal(viewport.zoom, 1.1);
  assert.equal(Math.round(viewport.x), -10);
  assert.equal(Math.round(viewport.y), -5);
});

test('zooms around the viewport center', () => {
  const viewport = getCenteredZoomViewport({
    viewport: { x: -100, y: -50, zoom: 1 },
    width: 400,
    height: 200,
    nextZoom: 2,
    minZoom: 0.05,
    maxZoom: 4,
  });

  assert.deepEqual(viewport, { x: -400, y: -200, zoom: 2 });
});

test('keeps wheel inside a hovered scrollable input before handing off to canvas', () => {
  withFakeDom((FakeElement) => {
    const boundary = new FakeElement();
    const input = new FakeElement({
      parentElement: boundary,
      overflowY: 'auto',
      scrollTop: 24,
      scrollHeight: 240,
      clientHeight: 80,
    });

    assert.equal(shouldKeepWheelInside({ target: input, deltaX: 0, deltaY: 32 }, boundary), true);
  });
});

test('hands wheel to canvas when the hovered input has no scroll range', () => {
  withFakeDom((FakeElement) => {
    const boundary = new FakeElement();
    const input = new FakeElement({
      parentElement: boundary,
      overflowY: 'auto',
      scrollTop: 0,
      scrollHeight: 80,
      clientHeight: 80,
    });

    assert.equal(shouldKeepWheelInside({ target: input, deltaX: 0, deltaY: 32 }, boundary), false);
  });
});

test('hands wheel to canvas when the hovered input is already at the scroll edge', () => {
  withFakeDom((FakeElement) => {
    const boundary = new FakeElement();
    const input = new FakeElement({
      parentElement: boundary,
      overflowY: 'auto',
      scrollTop: 160,
      scrollHeight: 240,
      clientHeight: 80,
    });

    assert.equal(shouldKeepWheelInside({ target: input, deltaX: 0, deltaY: 32 }, boundary), false);
  });
});

test('traps non-modifier wheel at a processor scroll boundary when boundary handoff is disabled', () => {
  withFakeDom((FakeElement) => {
    const boundary = new FakeElement();
    const input = new FakeElement({
      parentElement: boundary,
      overflowY: 'auto',
      scrollTop: 160,
      scrollHeight: 240,
      clientHeight: 80,
    });
    const calls = [];
    const event = {
      target: input,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 32,
      metaKey: false,
      ctrlKey: false,
      preventDefault: () => calls.push('prevent'),
      stopPropagation: () => calls.push('stop'),
    };
    let viewportUpdated = false;

    const handled = handOffWheelToCanvas(event, {
      boundary,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: () => { viewportUpdated = true; },
      allowScrollBoundaryHandoff: false,
    });

    assert.equal(handled, true);
    assert.deepEqual(calls, ['prevent', 'stop']);
    assert.equal(viewportUpdated, false);
  });
});

test('still hands command wheel to canvas at a trapped processor boundary', () => {
  withFakeDom((FakeElement) => {
    const boundary = new FakeElement();
    const input = new FakeElement({
      parentElement: boundary,
      overflowY: 'auto',
      scrollTop: 160,
      scrollHeight: 240,
      clientHeight: 80,
    });
    const calls = [];
    const event = {
      target: input,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 32,
      clientX: 120,
      clientY: 80,
      metaKey: true,
      ctrlKey: false,
      preventDefault: () => calls.push('prevent'),
      stopPropagation: () => calls.push('stop'),
    };
    let nextViewport = null;

    const handled = handOffWheelToCanvas(event, {
      boundary,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: (viewport) => { nextViewport = viewport; },
      container: {
        getBoundingClientRect: () => ({ left: 20, top: 30 }),
      },
      allowScrollBoundaryHandoff: false,
    });

    assert.equal(handled, true);
    assert.deepEqual(calls, ['prevent', 'stop']);
    assert.equal(nextViewport.zoom < 1, true);
  });
});

test('ignores canvas zoom wheel events without command modifiers', () => {
  let prevented = false;
  let stopped = false;
  const handled = zoomCanvasFromWheelEvent({
    ctrlKey: false,
    metaKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -120,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  }, {
    container: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: () => {},
  });

  assert.equal(handled, false);
  assert.equal(prevented, false);
  assert.equal(stopped, false);
});

test('zooms canvas from command wheel events and prevents browser zoom', () => {
  let viewport = null;
  let prevented = false;
  let stopped = false;

  const handled = zoomCanvasFromWheelEvent({
    ctrlKey: true,
    metaKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -120,
    clientX: 100,
    clientY: 50,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  }, {
    container: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: nextViewport => { viewport = nextViewport; },
    minZoom: 0.05,
    maxZoom: 4,
  });

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.ok(viewport.zoom > 1);
  assert.equal(Math.round(viewport.x), -39);
  assert.equal(Math.round(viewport.y), -13);
});

test('ignores keyboard zoom shortcuts without command modifiers', () => {
  let prevented = false;
  let stopped = false;
  const handled = zoomCanvasFromKeyboardEvent({
    code: 'Equal',
    key: '=',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  }, {
    container: { clientWidth: 400, clientHeight: 200 },
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: () => {},
  });

  assert.equal(handled, false);
  assert.equal(prevented, false);
  assert.equal(stopped, false);
});

test('zooms canvas in from command plus keyboard shortcuts and prevents browser zoom', () => {
  let viewport = null;
  let prevented = false;
  let stopped = false;

  const handled = zoomCanvasFromKeyboardEvent({
    code: 'Equal',
    key: '=',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  }, {
    container: { clientWidth: 400, clientHeight: 200 },
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: nextViewport => { viewport = nextViewport; },
    minZoom: 0.05,
    maxZoom: 4,
  });

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(viewport.zoom, 1.2);
  assert.equal(Math.round(viewport.x), -40);
  assert.equal(Math.round(viewport.y), -20);
});

test('recognizes browser zoom reset keyboard shortcuts', () => {
  assert.equal(isBrowserZoomKeyboardEvent({
    code: 'Digit0',
    key: '0',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
  }), true);
  assert.equal(isBrowserZoomKeyboardEvent({
    code: 'Digit0',
    key: '0',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  }), false);
});

test('resets canvas zoom to 100 percent from command zero and preserves center', () => {
  let viewport = null;
  let prevented = false;
  let stopped = false;

  const handled = zoomCanvasFromKeyboardEvent({
    code: 'Digit0',
    key: '0',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  }, {
    container: { clientWidth: 400, clientHeight: 200 },
    getViewport: () => ({ x: 20, y: 40, zoom: 0.5 }),
    setViewport: nextViewport => { viewport = nextViewport; },
    minZoom: 0.05,
    maxZoom: 4,
  });

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(viewport.zoom, 1);
  assert.equal(viewport.x, -160);
  assert.equal(viewport.y, -20);
});

test('zooms canvas out from command minus keyboard shortcuts and preserves center', () => {
  let viewport = null;

  const handled = zoomCanvasFromKeyboardEvent({
    code: 'Minus',
    key: '-',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  }, {
    container: { clientWidth: 400, clientHeight: 200 },
    getViewport: () => ({ x: -40, y: -20, zoom: 1.2 }),
    setViewport: nextViewport => { viewport = nextViewport; },
    minZoom: 0.05,
    maxZoom: 4,
  });

  assert.equal(handled, true);
  assert.equal(viewport.zoom, 1);
  assert.equal(Math.round(viewport.x), 0);
  assert.equal(Math.round(viewport.y), 0);
});
