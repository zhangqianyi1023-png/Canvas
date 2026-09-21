import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveResultNodeLabel } from './resultNodeLabels.js';

test('text result nodes preserve a custom title', () => {
  assert.equal(resolveResultNodeLabel('generateText', '产品卖点文案'), '产品卖点文案');
});

test('result nodes still receive their type-specific default title', () => {
  assert.equal(resolveResultNodeLabel('generateText', ''), '文本');
  assert.equal(resolveResultNodeLabel('generateImage', ''), '图片');
  assert.equal(resolveResultNodeLabel('generateVideo', ''), '视频');
  assert.equal(resolveResultNodeLabel('generateAudio', ''), '音频');
});

test('image result nodes continue to preserve a custom title', () => {
  assert.equal(resolveResultNodeLabel('generateImage', '商品主图'), '商品主图');
});
