import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGenerationTaskTiming,
  formatTaskDuration,
  getTaskDurationLabel,
  getTaskDurationSeconds,
  isTaskActive,
  isTaskTerminal,
} from './taskTiming.js';

test('task timing status helpers classify active and terminal states', () => {
  assert.equal(isTaskActive('running'), true);
  assert.equal(isTaskActive('saving'), true);
  assert.equal(isTaskActive('completed'), false);
  assert.equal(isTaskTerminal('completed'), true);
  assert.equal(isTaskTerminal('save_failed'), true);
  assert.equal(isTaskTerminal('running'), false);
});

test('task duration label uses live elapsed time for active tasks', () => {
  const task = { status: 'running', created_at: 100 };
  assert.equal(getTaskDurationSeconds(task, 112_400), 12);
  assert.equal(getTaskDurationLabel(task, 112_400), '已运行 12秒');
});

test('task duration label prefers frozen duration for terminal tasks', () => {
  const task = {
    status: 'completed',
    created_at: 100,
    finished_at: 140,
    duration_seconds: 33,
  };
  assert.equal(getTaskDurationSeconds(task, 999_000), 33);
  assert.equal(getTaskDurationLabel(task, 999_000), '已处理 33秒');
});

test('terminal task can derive duration from finished time', () => {
  const task = { status: 'failed', created_at: 10, finished_at: 75 };
  assert.equal(getTaskDurationSeconds(task, 999_000), 65);
  assert.equal(getTaskDurationLabel(task, 999_000), '已处理 1分05秒');
});

test('duration formatting keeps seconds compact and pads minute seconds', () => {
  assert.equal(formatTaskDuration(8), '8秒');
  assert.equal(formatTaskDuration(64), '1分04秒');
  assert.equal(formatTaskDuration(125), '2分05秒');
});

test('missing timing data returns an empty label', () => {
  assert.equal(getTaskDurationSeconds({ status: 'completed' }, 999_000), null);
  assert.equal(getTaskDurationLabel({ status: 'completed' }, 999_000), '');
});

test('generation task timing aggregates a multi-task run', () => {
  assert.deepEqual(
    buildGenerationTaskTiming([
      { status: 'completed', created_at: 20, finished_at: 70, duration_seconds: 50 },
      { status: 'completed', created_at: 10, finished_at: 120, duration_seconds: 80 },
    ]),
    {
      created_at: 10,
      finished_at: 120,
      duration_seconds: 110,
    },
  );

  assert.deepEqual(
    buildGenerationTaskTiming([
      { status: 'completed', created_at: 20, finished_at: 70, duration_seconds: 50 },
      { status: 'running', created_at: 10 },
    ]),
    {
      created_at: 10,
    },
  );
});
