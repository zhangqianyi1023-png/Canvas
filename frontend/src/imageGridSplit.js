export const GRID_SPLIT_PRESETS = Object.freeze([
  { id: '2x2', label: '4宫格 2x2', rows: 2, cols: 2 },
  { id: '3x3', label: '9宫格 3x3', rows: 3, cols: 3 },
  { id: '4x4', label: '16宫格 4x4', rows: 4, cols: 4 },
  { id: '5x5', label: '25宫格 5x5', rows: 5, cols: 5 },
]);

export const GRID_SPLIT_MIN_CELL = 0.04;
export const GRID_SPLIT_MIN_COUNT = 2;
export const GRID_SPLIT_MAX_COUNT = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const normalizeGridCount = value => (
  clamp(Math.round(Number(value) || GRID_SPLIT_MIN_COUNT), GRID_SPLIT_MIN_COUNT, GRID_SPLIT_MAX_COUNT)
);

export const createEvenGridCuts = count => (
  Array.from({ length: Math.max(0, normalizeGridCount(count) - 1) }, (_, index) => (
    (index + 1) / normalizeGridCount(count)
  ))
);

export const createGridSplitState = (rows, cols) => {
  const safeRows = normalizeGridCount(rows);
  const safeCols = normalizeGridCount(cols);
  return {
    rows: safeRows,
    cols: safeCols,
    xCuts: createEvenGridCuts(safeCols),
    yCuts: createEvenGridCuts(safeRows),
  };
};

export const clampGridCut = (cuts, index, value) => {
  const next = [...cuts];
  const lower = index === 0 ? 0 : next[index - 1];
  const upper = index === next.length - 1 ? 1 : next[index + 1];
  next[index] = clamp(value, lower + GRID_SPLIT_MIN_CELL, upper - GRID_SPLIT_MIN_CELL);
  return next;
};

export const getGridLineStops = cuts => [0, ...cuts, 1];

export const getGridCellCrop = (grid, row, col) => {
  const xStops = getGridLineStops(grid.xCuts);
  const yStops = getGridLineStops(grid.yCuts);
  const x = xStops[col] || 0;
  const y = yStops[row] || 0;
  const width = (xStops[col + 1] || 1) - x;
  const height = (yStops[row + 1] || 1) - y;
  return { x, y, width, height };
};

export const getGridCellKey = (row, col) => `${row}:${col}`;

export const buildSelectedGridCells = (grid, selectedKeys) => {
  const keys = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
  const cells = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const key = getGridCellKey(row, col);
      if (!keys.has(key)) continue;
      cells.push({
        key,
        row,
        col,
        label: `${row + 1}-${col + 1}`,
        crop: getGridCellCrop(grid, row, col),
      });
    }
  }
  return cells;
};
