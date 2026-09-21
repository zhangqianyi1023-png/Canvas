import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCopilotChoices } from './copilotChoices.js';

test('normalizes structured Copilot choice cards', () => {
  const choices = normalizeCopilotChoices({
    question: '选择一种风格',
    options: [
      { id: 'photo', label: '写实摄影', description: '真实毛发', submit_text: '请按写实摄影继续创建图片' },
      { id: 'art', label: '可爱插画', description: '绘本质感', submit_text: '请按可爱插画继续创建图片' },
    ],
  });

  assert.equal(choices.options[0].submitText, '请按写实摄影继续创建图片');
  assert.equal(choices.options.length, 2);
});

test('rejects malformed or duplicate Copilot choices', () => {
  assert.throws(() => normalizeCopilotChoices({ question: '选一个', options: [{ id: 'a' }] }), /2 到 6/);
  assert.throws(() => normalizeCopilotChoices({
    question: '选一个',
    options: [
      { id: 'a', label: 'A', submit_text: 'A' },
      { id: 'a', label: 'B', submit_text: 'B' },
    ],
  }), /重复/);
});
