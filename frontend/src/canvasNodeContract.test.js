import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_NODE_CONTRACT_VERSION,
  createCanvasOperation,
  getCanvasContract,
  withCanvasContract,
} from './canvasNodeContract.js';

test('normalizes Canvas contract metadata and removes duplicate references', () => {
  const node = withCanvasContract({
    id: 'result-1',
    data: { operation: 'unknown', status: 'unknown' },
  }, {
    operation: 'inpaint',
    status: 'running',
    sourceNodeIds: ['source-1', 'source-1', ''],
    references: ['front', 'front'],
    taskId: ' task-1 ',
  });

  assert.deepEqual(getCanvasContract(node), {
    version: CANVAS_NODE_CONTRACT_VERSION,
    sourceNodeIds: ['source-1'],
    operation: 'inpaint',
    status: 'running',
    taskId: 'task-1',
    parentVersion: '',
    references: ['front'],
    createdAt: null,
  });
});

test('creates a serializable operation request', () => {
  const operation = createCanvasOperation({
    operation: 'generate',
    sourceNodeIds: ['a', 'b', 'a'],
    outputType: 'image',
    input: { prompt: 'hello' },
  });

  assert.equal(operation.operation, 'generate');
  assert.deepEqual(operation.sourceNodeIds, ['a', 'b']);
  assert.equal(operation.outputType, 'image');
  assert.deepEqual(operation.input, { prompt: 'hello' });
});

