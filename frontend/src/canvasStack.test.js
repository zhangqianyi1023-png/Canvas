import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addNodeToCanvasStack,
  createCanvasStackGraph,
  removeNodeFromCanvasStack,
  unstackCanvasNodes,
} from './canvasStack.js';

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

test('adds an eligible canvas node into an existing stack', () => {
  const nodes = [
    { id: 'stack-1', type: 'stack', data: { childIds: ['a', 'b'], count: 2 } },
    { id: 'a', hidden: true },
    { id: 'b', hidden: true },
    { id: 'c', type: 'result', position: { x: 40, y: 60 }, selected: true },
  ];
  const next = addNodeToCanvasStack(nodes, 'stack-1', 'c');
  const stack = next.find(node => node.id === 'stack-1');
  assert.deepEqual(stack.data.childIds, ['a', 'b', 'c']);
  assert.equal(stack.data.count, 3);
  assert.equal(stack.data.coverNodeId, 'c');
  assert.equal(next.find(node => node.id === 'c').hidden, true);
});

test('removes a child from a stack and keeps the stack when enough children remain', () => {
  const nodes = [
    { id: 'stack-1', type: 'stack', data: { childIds: ['a', 'b', 'c'], count: 3 } },
    { id: 'a', hidden: true },
    { id: 'b', hidden: true },
    { id: 'c', hidden: true },
  ];
  const next = removeNodeFromCanvasStack(nodes, 'stack-1', 'c', { x: 100, y: 120 });
  const stack = next.find(node => node.id === 'stack-1');
  const restored = next.find(node => node.id === 'c');
  assert.deepEqual(stack.data.childIds, ['a', 'b']);
  assert.equal(stack.data.count, 2);
  assert.equal(restored.hidden, false);
  assert.deepEqual(restored.position, { x: 100, y: 120 });
});

test('dissolves a stack when removing a child leaves fewer than two children', () => {
  const nodes = [
    { id: 'stack-1', type: 'stack', data: { childIds: ['a', 'b'], count: 2 } },
    { id: 'a', hidden: true },
    { id: 'b', hidden: true },
  ];
  const next = removeNodeFromCanvasStack(nodes, 'stack-1', 'b', { x: 200, y: 240 });
  assert.equal(next.some(node => node.id === 'stack-1'), false);
  assert.equal(next.find(node => node.id === 'a').hidden, false);
  assert.equal(next.find(node => node.id === 'b').hidden, false);
  assert.deepEqual(next.find(node => node.id === 'b').position, { x: 200, y: 240 });
});
