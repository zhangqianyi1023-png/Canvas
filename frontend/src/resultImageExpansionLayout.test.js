import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateExpandedImageLayout, getExpandedImageGridClass } from './resultImageExpansionLayout.js';

test('four portrait images fit the expanded grid without internal scrolling', () => {
  const layout = calculateExpandedImageLayout({
    imageCount: 4,
    aspectRatio: 3 / 4,
    nodeWidth: 320,
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  const gridHeight = layout.rows * (layout.cardWidth / (3 / 4)) + (layout.rows - 1) * 12 + 28;

  assert.equal(layout.gridClass, 'is-grid-four');
  assert.equal(layout.shouldScroll, false);
  assert.ok(gridHeight <= layout.maxHeight);
});

test('larger image sets keep the scrollable expanded grid fallback', () => {
  const layout = calculateExpandedImageLayout({
    imageCount: 6,
    aspectRatio: 1,
    nodeWidth: 320,
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  assert.equal(layout.gridClass, 'is-grid-many');
  assert.equal(layout.shouldScroll, true);
});

test('expanded grid classes split small and large image sets', () => {
  assert.equal(getExpandedImageGridClass(2), 'is-grid-two');
  assert.equal(getExpandedImageGridClass(4), 'is-grid-four');
  assert.equal(getExpandedImageGridClass(5), 'is-grid-many');
});
