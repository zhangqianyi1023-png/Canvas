import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from './apiResponse.js';

const response = (body, options = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  async text() {
    return body;
  },
});

test('parseJsonResponse returns JSON payloads', async () => {
  assert.deepEqual(
    await parseJsonResponse(response('{"success":true,"task_id":"task_1"}')),
    { success: true, task_id: 'task_1' },
  );
});

test('parseJsonResponse turns plain text errors into readable messages', async () => {
  await assert.rejects(
    () => parseJsonResponse(response('Internal Server Error', { ok: false, status: 500 }), '图片生成提交失败'),
    /图片生成提交失败（HTTP 500）：Internal Server Error/,
  );
});

test('parseJsonResponse uses JSON error details when available', async () => {
  await assert.rejects(
    () => parseJsonResponse(response('{"error":"API key 无效"}', { ok: false, status: 401 }), '图片生成提交失败'),
    /API key 无效/,
  );
});
