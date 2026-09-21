import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCanvasOperationResult,
  createCanvasOperationRequest,
} from './canvasOperationRunner.js';

test('creates queued operation requests without provider coupling', () => {
  const request = createCanvasOperationRequest({
    operation: 'outpaint',
    sourceNodeIds: ['image-1'],
    outputType: 'image',
    input: { ratio: '16:9' },
  });

  assert.equal(request.status, 'queued');
  assert.equal(request.operation, 'outpaint');
  assert.deepEqual(request.sourceNodeIds, ['image-1']);
});

test('adds a result node and source edges while preserving sources', () => {
  const source = { id: 'image-1', type: 'result', data: { result: 'source' } };
  const result = applyCanvasOperationResult({
    nodes: [source],
    edges: [],
    resultNode: { id: 'image-2', type: 'result', data: { result: 'new' } },
    operation: { operation: 'inpaint', input: { prompt: 'fix label' } },
    sourceNodeIds: ['image-1'],
    taskId: 'task-1',
  });

  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0], source);
  assert.equal(result.nodes[1].data.canvas.operation, 'inpaint');
  assert.equal(result.nodes[1].data.canvas.status, 'completed');
  assert.deepEqual(result.nodes[1].data.canvas.sourceNodeIds, ['image-1']);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].source, 'image-1');
  assert.equal(result.edges[0].target, 'image-2');
});

test('does not duplicate an existing source edge', () => {
  const result = applyCanvasOperationResult({
    nodes: [{ id: 'a' }],
    edges: [{ id: 'existing', source: 'a', target: 'b' }],
    resultNode: { id: 'b', data: {} },
    sourceNodeIds: ['a'],
  });

  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].id, 'existing');
});

