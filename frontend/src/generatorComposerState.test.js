import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGeneratorComposerData } from './generatorComposerState.js';

test('current generator draft wins over stale result generation config', () => {
  const merged = mergeGeneratorComposerData(
    {
      user_prompt: '第二轮关键词',
      promptDraft: '第二轮关键词',
      temperature: 0.7,
    },
    {
      user_prompt: '',
      temperature: 1,
      max_tokens: 4096,
    },
  );

  assert.equal(merged.user_prompt, '第二轮关键词');
  assert.equal(merged.promptDraft, '第二轮关键词');
  assert.equal(merged.temperature, 0.7);
  assert.equal(merged.max_tokens, 4096);
});
