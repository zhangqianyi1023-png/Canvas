import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatImageDimensions,
  mergeImageDimensions,
  normalizeImageDimensions,
} from './imageDimensions.js';

test('normalizes and formats intrinsic media dimensions', () => {
  assert.deepEqual(normalizeImageDimensions({ width: 1023.6, height: '768' }), {
    width: 1024,
    height: 768,
  });
  assert.equal(formatImageDimensions({ width: 1920, height: 1080 }), '1920×1080');
  assert.equal(formatImageDimensions({ width: 0, height: 1080 }), '');
});

test('keeps dimensions associated with each media url', () => {
  const dimensions = mergeImageDimensions(
    { '/first.png': { width: 1024, height: 1024 } },
    '/second.png',
    { width: 1536, height: 2048 },
  );

  assert.deepEqual(dimensions, {
    '/first.png': { width: 1024, height: 1024 },
    '/second.png': { width: 1536, height: 2048 },
  });
});
