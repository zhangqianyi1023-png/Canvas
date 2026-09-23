import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSelectedGridCells,
  clampGridCut,
  createGridSplitState,
  getGridCellCrop,
} from './imageGridSplit.js';

test('creates even grid crops from normalized coordinates', () => {
  const grid = createGridSplitState(3, 3);
  assert.deepEqual(getGridCellCrop(grid, 1, 1), {
    x: 1 / 3,
    y: 1 / 3,
    width: 1 / 3,
    height: 1 / 3,
  });
});

test('builds selected cells in row order', () => {
  const grid = createGridSplitState(2, 2);
  const cells = buildSelectedGridCells(grid, new Set(['0:1', '1:0']));
  assert.deepEqual(cells.map(cell => cell.label), ['1-2', '2-1']);
});

test('keeps dragged grid lines inside neighbor limits', () => {
  const next = clampGridCut([0.3, 0.6], 0, 0.59);
  assert.equal(next[1], 0.6);
  assert.ok(Math.abs(next[0] - 0.56) < 0.000001);
});
