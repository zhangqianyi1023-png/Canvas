import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_GENERATION_RATIO_PRESETS,
  IMAGE_RATIO_PRESETS,
  getDefaultImageRatioPresetId,
  getImageRatioSummary,
  ratioToCssAspectRatio,
} from './imageRatioPresets.js';

test('image generation presets include the complete API ratio set', () => {
  assert.deepEqual(
    IMAGE_GENERATION_RATIO_PRESETS.map(option => option.value),
    ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '21:9', '9:21'],
  );
});

test('image generation ratio summaries use the raw ratio label', () => {
  assert.equal(getImageRatioSummary('3:2', 'image-3-2'), '3:2');
});

test('image ratio presets include one merged Douyin option', () => {
  const douyinOptions = IMAGE_RATIO_PRESETS.filter(option => option.channel === '抖音');
  assert.equal(douyinOptions.length, 1);
  assert.deepEqual(douyinOptions[0], {
    id: 'douyin',
    channel: '抖音',
    value: '9:16',
    shape: 'portrait',
  });
});

test('image ratio presets keep duplicated ratios as different channel options', () => {
  const squareOptions = IMAGE_RATIO_PRESETS.filter(option => option.value === '1:1');
  assert.deepEqual(squareOptions.map(option => option.id), [
    'xiaohongshu-square',
    'wechat-square',
  ]);
});

test('image ratio presets exclude decimal ratios unsupported by generation APIs', () => {
  assert.equal(
    IMAGE_RATIO_PRESETS.every(option => option.value === 'auto' || /^\d+:\d+$/.test(option.value)),
    true,
  );
});

test('ratio summaries prefer the selected channel preset when available', () => {
  assert.equal(getImageRatioSummary('1:1', 'wechat-square'), '公众号 1:1');
  assert.equal(getImageRatioSummary('3:4', 'wechat-portrait'), '公众号配图 3:4');
  assert.equal(getImageRatioSummary('auto', 'auto'), '智能比例');
});

test('ratio helpers preserve legacy unknown ratios without mislabeling them', () => {
  assert.equal(getDefaultImageRatioPresetId('4:3'), 'auto');
  assert.equal(getImageRatioSummary('4:3', 'auto'), '4:3');
  assert.equal(ratioToCssAspectRatio('2.35:1'), '2.35 / 1');
});
