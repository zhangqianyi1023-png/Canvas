import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginPayload,
  getLoginErrorMessage,
  getLoginValidationError,
} from './loginDialogModel.js';

test('buildLoginPayload trims username but preserves password', () => {
  assert.deepEqual(buildLoginPayload(' demo ', ' secret '), {
    username: 'demo',
    password: ' secret ',
  });
});

test('getLoginValidationError requires username and password', () => {
  assert.equal(getLoginValidationError('', 'secret'), '请输入用户名');
  assert.equal(getLoginValidationError('demo', ''), '请输入密码');
  assert.equal(getLoginValidationError('demo', 'secret'), '');
});

test('getLoginErrorMessage prefers server detail', () => {
  assert.equal(getLoginErrorMessage({ detail: '用户名或密码错误' }), '用户名或密码错误');
  assert.equal(getLoginErrorMessage({}), '登录失败，请稍后重试');
});
