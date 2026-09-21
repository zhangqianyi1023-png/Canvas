import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUICK_PROMPTS,
  composeQuickPromptText,
  createDefaultQuickPromptState,
  normalizeQuickPromptState,
} from './quickPrompts.js';

test('seeds the complete built-in quick prompt set', () => {
  const state = createDefaultQuickPromptState();
  assert.equal(state.prompts.length, 10);
  assert.deepEqual(state.prompts.map(prompt => prompt.title), [
    '多机位九宫格',
    '多机位九宫格4K',
    '剧情推演四宫格',
    '角色脸部三视图',
    '产品三视图',
    '25宫格连贯分镜',
    '电影级光影校正',
    '角色设定参考表',
    '6种基础表情胸像',
    '360全景图',
  ]);
});

test('keeps built-in edits and custom prompts while restoring missing defaults', () => {
  const state = normalizeQuickPromptState({
    categories: [{ id: 'custom', name: '我的提示词', system: true }],
    prompts: [
      {
        ...DEFAULT_QUICK_PROMPTS[0],
        title: '我的九宫格',
        content: '修改后的提示词',
      },
      {
        id: 'quick_prompt_custom',
        title: '自定义提示词',
        content: '自定义内容',
        categoryId: 'custom',
        source: 'custom',
      },
    ],
  });

  assert.equal(state.prompts.length, 11);
  assert.equal(state.prompts.find(prompt => prompt.id === DEFAULT_QUICK_PROMPTS[0].id)?.title, '我的九宫格');
  assert.equal(state.prompts.find(prompt => prompt.id === 'quick_prompt_custom')?.content, '自定义内容');
});

test('composes the resolved quick prompt without exposing its tag token', () => {
  assert.equal(
    composeQuickPromptText('上游提示词', '快捷提示词完整内容', '用户补充要求'),
    '上游提示词\n\n快捷提示词完整内容\n\n用户补充要求',
  );
});
