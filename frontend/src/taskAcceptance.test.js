import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTaskCenterGroupAcceptedForNode,
  isTaskMediaAcceptedForNode,
  isTaskResultAcceptedForNode,
} from './taskAcceptance.js';

test('task result acceptance requires the current run id', () => {
  const node = { id: 'result_1', data: { currentRunId: 'run_current' } };

  assert.equal(
    isTaskResultAcceptedForNode({ node_id: 'result_1', run_id: 'run_current' }, node),
    true,
  );
  assert.equal(
    isTaskResultAcceptedForNode({ node_id: 'result_1', run_id: 'run_old' }, node),
    false,
  );
  assert.equal(
    isTaskResultAcceptedForNode({ node_id: 'result_1', run_id: 'run_current' }, {
      id: 'result_1',
      data: {},
    }),
    false,
  );
});

test('task media sync rejects stale runs before mutating canvas nodes', () => {
  const node = {
    id: 'result_1',
    data: {
      resultType: 'generateImage',
      currentRunId: 'run_new',
      taskIds: ['task_new'],
      imageUrls: ['/uploads/new.png'],
    },
  };

  assert.equal(
    isTaskMediaAcceptedForNode({
      task_id: 'task_old',
      node_id: 'result_1',
      run_id: 'run_old',
    }, node),
    false,
  );
});

test('task media sync allows current task and empty-node recovery', () => {
  assert.equal(
    isTaskMediaAcceptedForNode({
      task_id: 'task_new',
      node_id: 'result_1',
      run_id: 'run_new',
    }, {
      id: 'result_1',
      data: { currentRunId: 'run_new', taskIds: ['task_new'] },
    }),
    true,
  );

  assert.equal(
    isTaskMediaAcceptedForNode({
      task_id: 'task_recovered',
      node_id: 'result_1',
      run_id: 'run_recovered',
    }, {
      id: 'result_1',
      data: { resultType: 'generateImage' },
    }),
    true,
  );
});

test('task center group keeps accepting every task in the current batch', () => {
  const tasks = [
    { task_id: 'task_1', node_id: 'result_1', run_id: 'run_batch' },
    { task_id: 'task_2', node_id: 'result_1', run_id: 'run_batch' },
  ];

  assert.equal(
    isTaskCenterGroupAcceptedForNode(tasks, {
      id: 'result_1',
      data: {
        currentRunId: 'run_batch',
        taskIds: ['task_1', 'task_2'],
        imageUrls: ['/uploads/partial.png'],
      },
    }),
    true,
  );
});

test('task center group accepts known terminal run but rejects unrelated history', () => {
  const tasks = [
    { task_id: 'task_done', node_id: 'result_1', run_id: 'run_done' },
  ];

  assert.equal(
    isTaskCenterGroupAcceptedForNode(tasks, {
      id: 'result_1',
      data: {
        generationTask: { id: 'task_done', status: 'completed', runId: 'run_done' },
        imageUrls: ['/uploads/done.png'],
      },
    }),
    true,
  );
  assert.equal(
    isTaskCenterGroupAcceptedForNode(tasks, {
      id: 'result_1',
      data: { imageUrls: ['/uploads/manual.png'] },
    }),
    false,
  );
});
