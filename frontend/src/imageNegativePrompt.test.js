import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_IMAGE_NEGATIVE_PROMPT,
  composeImageGenerationPrompt,
  mergeDefaultImageNegativePrompt,
  resolveImageNegativePrompt,
} from './imageNegativePrompt.js';

test('image negative prompt resolves missing values to the global default', () => {
  assert.equal(resolveImageNegativePrompt(undefined), DEFAULT_IMAGE_NEGATIVE_PROMPT);
  assert.equal(resolveImageNegativePrompt(null), DEFAULT_IMAGE_NEGATIVE_PROMPT);
});

test('image negative prompt preserves explicit node edits including empty override', () => {
  assert.equal(resolveImageNegativePrompt('不要人物'), '不要人物');
  assert.equal(resolveImageNegativePrompt(''), '');
});

test('image prompt composition appends negative prompt into one prompt payload', () => {
  assert.equal(
    composeImageGenerationPrompt('商品海报，清透自然光', '不要文字错误'),
    '商品海报，清透自然光\n\n负面提示词：\n不要文字错误',
  );
});

test('storyboard negative prompt merges global default with card-specific prompt', () => {
  assert.equal(
    mergeDefaultImageNegativePrompt('避免低质纹理'),
    `${DEFAULT_IMAGE_NEGATIVE_PROMPT}\n避免低质纹理`,
  );
  assert.equal(mergeDefaultImageNegativePrompt(''), DEFAULT_IMAGE_NEGATIVE_PROMPT);
});
