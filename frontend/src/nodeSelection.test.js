import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeShiftNodeSelection,
  getSelectableSelectedNodeIds,
  isSelectableCanvasNode,
  resolveOptionDragSelectedNodeIds,
  shouldOpenResultComposer,
  shouldSuppressNodeSelectionTarget,
} from './nodeSelection.js';

const nodes = [
  { id: 'product-1', type: 'product', selected: true },
  { id: 'result-1', type: 'result', selected: false },
  { id: 'generator-1', type: 'generator', selected: true },
  { id: 'group-1', type: 'group', selected: true },
];

test('canvas selectable nodes exclude generator backing nodes', () => {
  assert.equal(isSelectableCanvasNode(nodes[0]), true);
  assert.equal(isSelectableCanvasNode(nodes[2]), false);
  assert.equal(isSelectableCanvasNode(null), false);
});

test('selected id collection keeps only selectable canvas nodes', () => {
  assert.deepEqual(
    Array.from(getSelectableSelectedNodeIds(nodes)).sort(),
    ['group-1', 'product-1'],
  );
});

test('shift click adds an unselected selectable node to the pre-click selection', () => {
  const selected = computeShiftNodeSelection({
    nodes,
    clickedNodeId: 'result-1',
    selectedIdsBeforeClick: new Set(['product-1']),
  });

  assert.deepEqual(Array.from(selected).sort(), ['product-1', 'result-1']);
});

test('shift click removes an already selected selectable node', () => {
  const selected = computeShiftNodeSelection({
    nodes,
    clickedNodeId: 'product-1',
    selectedIdsBeforeClick: new Set(['product-1', 'group-1']),
  });

  assert.deepEqual(Array.from(selected).sort(), ['group-1']);
});

test('shift click never selects generator nodes and drops stale ids', () => {
  const selected = computeShiftNodeSelection({
    nodes,
    clickedNodeId: 'generator-1',
    selectedIdsBeforeClick: new Set(['product-1', 'generator-1', 'missing-node']),
  });

  assert.deepEqual(Array.from(selected).sort(), ['product-1']);
});

test('option drag preserves the pointer-down multi-selection snapshot', () => {
  const currentNodes = nodes.map(node => ({
    ...node,
    selected: node.id === 'product-1',
  }));

  const selected = resolveOptionDragSelectedNodeIds({
    nodes: currentNodes,
    draggedNodeId: 'product-1',
    selectedIdsBeforeDrag: new Set(['product-1', 'result-1', 'group-1', 'generator-1']),
  });

  assert.deepEqual(
    Array.from(selected).sort(),
    ['group-1', 'product-1', 'result-1'],
  );
});

test('option drag falls back to current selection or the dragged node', () => {
  assert.deepEqual(
    Array.from(resolveOptionDragSelectedNodeIds({
      nodes,
      draggedNodeId: 'product-1',
    })).sort(),
    ['group-1', 'product-1'],
  );

  assert.deepEqual(
    Array.from(resolveOptionDragSelectedNodeIds({
      nodes,
      draggedNodeId: 'result-1',
    })),
    ['result-1'],
  );
});

test('expanded multi-image cards suppress canvas node click behavior', () => {
  const expandedCardTarget = {
    closest(selector) {
      return selector.includes('.result-image-expanded-card') ? {} : null;
    },
  };
  const plainNodeTarget = {
    closest() {
      return null;
    },
  };

  assert.equal(shouldSuppressNodeSelectionTarget(expandedCardTarget), true);
  assert.equal(shouldSuppressNodeSelectionTarget(plainNodeTarget), false);
});

test('node hover toolbar suppresses canvas node click behavior', () => {
  const toolbarTarget = {
    closest(selector) {
      return selector.includes('.node-hover-toolbar-portal') ? {} : null;
    },
  };
  const toolbarAnchorTarget = {
    closest(selector) {
      return selector.includes('.node-hover-toolbar-anchor') ? {} : null;
    },
  };

  assert.equal(shouldSuppressNodeSelectionTarget(toolbarTarget), true);
  assert.equal(shouldSuppressNodeSelectionTarget(toolbarAnchorTarget), true);
});

test('editable node titles suppress canvas node selection', () => {
  const titleTarget = {
    closest(selector) {
      return selector.includes('.editable-node-title') ? {} : null;
    },
  };

  assert.equal(shouldSuppressNodeSelectionTarget(titleTarget), true);
});

test('manual result nodes do not open their generator composer on selection', () => {
  assert.equal(
    shouldOpenResultComposer({ id: 'manual-text', type: 'result', data: { resultType: 'generateText', textSource: 'manual' } }),
    false,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'uploaded-image', type: 'result', data: { resultType: 'generateImage', imageSource: 'upload' } }),
    false,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'annotated-image', type: 'result', data: { resultType: 'generateImage', imageSource: 'annotation' } }),
    false,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'generated-text', type: 'result', data: { resultType: 'generateText', textSource: 'generated' } }),
    true,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'generated-image', type: 'result', data: { resultType: 'generateImage' } }),
    true,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'uploaded-audio', type: 'result', data: { resultType: 'generateAudio', audioSource: 'upload', audioUrl: '/demo.mp3' } }),
    false,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'empty-audio', type: 'result', data: { resultType: 'generateAudio' } }),
    true,
  );
  assert.equal(
    shouldOpenResultComposer({ id: 'generated-audio', type: 'result', data: { resultType: 'generateAudio', audioSource: 'generate', audioUrl: '/demo.mp3' } }),
    true,
  );
});
