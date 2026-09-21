import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasStackGraph, unstackCanvasNodes } from './canvasStack.js';

test('stacks eligible selected nodes and hides the source nodes', () => {
  const graph = createCanvasStackGraph({
    nodes: [
      { id: 'a', type: 'result', position: { x: 10, y: 20 }, style: { width: 200, height: 100 } },
      { id: 'b', type: 'videoInput', position: { x: 260, y: 20 }, style: { width: 180, height: 120 } },
      { id: 'generator', type: 'generator', position: { x: 10, y: 200 } },
    ],
    selectedIds: ['a', 'b', 'generator'],
    stackId: 'stack-1',
  });

  assert.equal(graph.stack.type, 'stack');
  assert.deepEqual(graph.childIds, ['a', 'b']);
  assert.equal(graph.stack.data.count, 2);
  assert.equal(graph.nodes.find(node => node.id === 'a').hidden, true);
  assert.equal(graph.nodes.find(node => node.id === 'generator').hidden, undefined);
});

test('does not create a stack with fewer than two eligible nodes', () => {
  assert.equal(createCanvasStackGraph({ nodes: [{ id: 'a', type: 'result' }], selectedIds: ['a'] }), null);
});

test('unstack restores children and removes only the stack container', () => {
  const nodes = [
    { id: 'stack-1', type: 'stack', data: { childIds: ['a', 'b'] }, selected: true },
    { id: 'a', hidden: true },
    { id: 'b', hidden: true },
    { id: 'c', selected: true },
  ];
  const restored = unstackCanvasNodes(nodes, 'stack-1');
  assert.deepEqual(restored.map(node => node.id), ['a', 'b', 'c']);
  assert.equal(restored[0].hidden, false);
  assert.equal(restored[0].selected, true);
  assert.equal(restored[2].selected, false);
});

