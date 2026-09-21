import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveImageActionPortalPosition } from './imageActionOverlayPosition.js';

test('hides the image toolbar when its node is outside the viewport', () => {
  assert.equal(
    resolveImageActionPortalPosition({ left: 20, right: 220, top: -240, bottom: -20, width: 200, height: 220 }),
    null,
  );
  assert.equal(
    resolveImageActionPortalPosition({ left: 20, right: 220, top: 820, bottom: 1040, width: 200, height: 220 }, { width: 1280, height: 800 }),
    null,
  );
});

test('moves the toolbar below a node near the top edge', () => {
  const position = resolveImageActionPortalPosition(
    { left: 500, right: 700, top: 0, bottom: 320, width: 200, height: 320 },
    { width: 1280, height: 800 },
  );

  assert.deepEqual(position, { left: 600, top: 370 });
});

test('keeps the toolbar centered above a node in the viewport', () => {
  const position = resolveImageActionPortalPosition(
    { left: 420, right: 780, top: 260, bottom: 620, width: 360, height: 360 },
    { width: 1280, height: 800 },
  );

  assert.deepEqual(position, { left: 600, top: 254 });
});
