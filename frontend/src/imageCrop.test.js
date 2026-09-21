import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CROP,
  createInitialCrop,
  fitCropToRatio,
  formatRatio,
  getFreeRotatedSize,
  getCroppedNodeStyle,
  getRotatedSize,
  normalizeFreeRotation,
  moveCrop,
  normalizeRotation,
  resolveCropImageFetchUrl,
  resolveCropRatio,
  resolveFreeRotationDraw,
  resolvePixelCrop,
  resolveRotationDraw,
  resizeCrop,
} from './imageCrop.js';

const approx = (actual, expected, tolerance = 0.0001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('normalizes rotation to four right-angle states', () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(450), 90);
});

test('normalizes free rotation to signed degrees', () => {
  assert.equal(normalizeFreeRotation(0), 0);
  assert.equal(normalizeFreeRotation(180), 180);
  assert.equal(normalizeFreeRotation(181), -179);
  assert.equal(normalizeFreeRotation(-181), 179);
  assert.equal(normalizeFreeRotation('bad'), 0);
});

test('swaps rotated dimensions for quarter turns', () => {
  assert.deepEqual(getRotatedSize(1200, 800, 0), { width: 1200, height: 800 });
  assert.deepEqual(getRotatedSize(1200, 800, 90), { width: 800, height: 1200 });
  assert.deepEqual(getRotatedSize(1200, 800, 270), { width: 800, height: 1200 });
});

test('resolves original and fixed ratios after rotation', () => {
  approx(resolveCropRatio('original', 1200, 800, 0), 1.5);
  approx(resolveCropRatio('original', 1200, 800, 90), 2 / 3);
  approx(resolveCropRatio('3:4', 1200, 800, 90), 0.75);
  assert.equal(resolveCropRatio('free', 1200, 800, 0), null);
});

test('fits a locked pixel ratio around the current center', () => {
  const crop = fitCropToRatio(DEFAULT_CROP, 1, { width: 1200, height: 800 });
  approx((crop.width * 1200) / (crop.height * 800), 1);
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.width <= 1);
  assert.ok(crop.y + crop.height <= 1);
});

test('move clamps the crop inside the image', () => {
  assert.deepEqual(
    moveCrop({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, 1, -1),
    { x: 0.6, y: 0, width: 0.4, height: 0.4 },
  );
});

test('locked resize preserves the requested pixel ratio', () => {
  const crop = resizeCrop({
    crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 },
    dx: 0.15,
    dy: 0.02,
    handle: 'se',
    pixelRatio: 16 / 9,
    imageSize: { width: 1200, height: 800 },
  });
  approx((crop.width * 1200) / (crop.height * 800), 16 / 9);
  assert.ok(crop.x + crop.width <= 1);
  assert.ok(crop.y + crop.height <= 1);
});

test('pixel crop rounds safely and stays within bounds', () => {
  assert.deepEqual(
    resolvePixelCrop(
      { x: 0.25, y: 0.1, width: 0.5, height: 0.75 },
      { width: 1000, height: 800 },
    ),
    { x: 250, y: 80, width: 500, height: 600 },
  );
});

test('creates centered initial crops for locked presets', () => {
  const crop = createInitialCrop('9:16', 1200, 800, 0);
  approx((crop.width * 1200) / (crop.height * 800), 9 / 16);
  approx(crop.x + crop.width / 2, 0.5);
  approx(crop.y + crop.height / 2, 0.5);
});

test('resolves canvas transforms for every right-angle rotation', () => {
  assert.deepEqual(resolveRotationDraw(1200, 800, 0), {
    canvasWidth: 1200,
    canvasHeight: 800,
    translateX: 0,
    translateY: 0,
    radians: 0,
  });
  assert.deepEqual(resolveRotationDraw(1200, 800, 90), {
    canvasWidth: 800,
    canvasHeight: 1200,
    translateX: 800,
    translateY: 0,
    radians: Math.PI / 2,
  });
  assert.deepEqual(resolveRotationDraw(1200, 800, 180), {
    canvasWidth: 1200,
    canvasHeight: 800,
    translateX: 1200,
    translateY: 800,
    radians: Math.PI,
  });
  assert.deepEqual(resolveRotationDraw(1200, 800, 270), {
    canvasWidth: 800,
    canvasHeight: 1200,
    translateX: 0,
    translateY: 1200,
    radians: Math.PI * 1.5,
  });
});

test('resolves free-angle rotation canvas bounds', () => {
  assert.deepEqual(getFreeRotatedSize(100, 50, 0), { width: 100, height: 50 });
  assert.deepEqual(getFreeRotatedSize(100, 50, 90), { width: 50, height: 100 });

  const draw = resolveFreeRotationDraw(100, 50, 45);
  assert.equal(draw.canvasWidth, 107);
  assert.equal(draw.canvasHeight, 107);
  approx(draw.translateX, 53.5);
  approx(draw.translateY, 53.5);
  approx(draw.radians, Math.PI / 4);
  assert.equal(draw.rotation, 45);
});

test('formats output ratios and sizes image nodes', () => {
  assert.equal(formatRatio(1600, 900), '16:9');
  assert.deepEqual(getCroppedNodeStyle(1600, 900), { width: 320, height: 180 });
  assert.deepEqual(getCroppedNodeStyle(800, 1064), { width: 280, height: 372 });
  assert.deepEqual(getCroppedNodeStyle(900, 1600), { width: 240, height: 427 });
  assert.deepEqual(getCroppedNodeStyle(1200, 1200), { width: 280, height: 280 });
});

test('keeps uploaded crop images fetchable from the local app origin', () => {
  assert.equal(
    resolveCropImageFetchUrl('/uploads/example.png'),
    '/uploads/example.png',
  );
});
