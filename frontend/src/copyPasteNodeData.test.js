import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPastedGeneratorDraft } from './copyPasteNodeData.js';

test('pasted text generator keeps user prompt but drops connected reference prompts', () => {
  const draft = buildPastedGeneratorDraft({
    resultType: 'generateText',
    promptDraft: '旧占位',
    generator: {
      connectedPrompt: '来自上游文本节点的参考提示词',
      connectedTextReferences: ['参考提示词 A', '参考提示词 B'],
      connectedImages: ['/connected-image.png'],
      connectedVideos: ['/connected-video.mp4'],
      uploadedReferenceImages: ['/manual-reference.png'],
      user_prompt: '用户上次在生成器里输入的提示词',
      promptDraft: '用户上次在生成器里输入的提示词',
      text_api_id: 'text-provider-1',
    },
  });

  assert.equal(draft.user_prompt, '用户上次在生成器里输入的提示词');
  assert.equal(draft.promptDraft, '用户上次在生成器里输入的提示词');
  assert.equal(draft.connectedPrompt, '');
  assert.deepEqual(draft.connectedTextReferences, []);
  assert.deepEqual(draft.connectedImages, []);
  assert.deepEqual(draft.connectedVideos, []);
  assert.deepEqual(draft.uploadedReferenceImages, ['/manual-reference.png']);
  assert.equal(draft.text_api_id, 'text-provider-1');
});

test('pasted text generator can recover prompt from stored generation config', () => {
  const draft = buildPastedGeneratorDraft({
    resultType: 'generateText',
    generationConfig: {
      user_prompt: '最近一次运行时保存的用户输入提示词',
    },
    generator: {
      connectedPrompt: '不要继承的参考提示词',
    },
  });

  assert.equal(draft.user_prompt, '最近一次运行时保存的用户输入提示词');
  assert.equal(draft.connectedPrompt, '');
});
