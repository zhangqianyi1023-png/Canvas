import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_PERSPECTIVE_PRESETS,
  buildImagePerspectivePrompt,
  getImagePerspectiveDistanceLabel,
  getImagePerspectivePreset,
} from './imagePerspectivePrompt.js';

test('defines the image angle control preset set', () => {
  assert.deepEqual(
    IMAGE_PERSPECTIVE_PRESETS.map(preset => preset.label),
    ['自定义', '正侧面', '近侧面75°', '斜侧面45°', '近正侧15°', '正面俯拍', '正面仰拍', '侧面俯拍', '侧面仰拍'],
  );
  assert.equal(getImagePerspectivePreset('side45').horizontalAngle, 45);
  assert.equal(getImagePerspectivePreset('frontLeft15').horizontalAngle, -15);
  assert.equal(getImagePerspectivePreset('sideHigh').pitchAngle, -30);
  assert.equal(getImagePerspectivePreset('missing').id, 'custom');
});

test('builds a reference-image perspective prompt with identity constraints', () => {
  const prompt = buildImagePerspectivePrompt({
    presetId: 'side90',
    imageSize: { width: 800, height: 1064 },
    instruction: '保持白色背景',
  });

  assert.match(prompt, /参考图/);
  assert.match(prompt, /同一主体/);
  assert.match(prompt, /正侧面/);
  assert.match(prompt, /相机绕主体向右移动到约 90 度位置/);
  assert.match(prompt, /主体自身不要旋转/);
  assert.match(prompt, /中景/);
  assert.match(prompt, /800x1064/);
  assert.match(prompt, /保持白色背景/);
  assert.match(prompt, /不要新增无关主体/);
});

test('builds the near-front left 15 degree preset prompt', () => {
  const prompt = buildImagePerspectivePrompt({ presetId: 'frontLeft15' });

  assert.match(prompt, /近正侧15°/);
  assert.match(prompt, /相机绕主体向左移动到约 15 度位置/);
  assert.match(prompt, /保持平视/);
  assert.match(prompt, /中景/);
});

test('uses manual angle values when provided', () => {
  const prompt = buildImagePerspectivePrompt({
    presetId: 'custom',
    horizontalAngle: -30,
    pitchAngle: 18,
    distance: 2,
  });

  assert.match(prompt, /相机绕主体向左移动到约 30 度位置/);
  assert.match(prompt, /仰视约 18 度/);
  assert.match(prompt, /特写/);
  assert.match(prompt, /距离控制值 2\.0/);
});

test('maps camera distance to framing labels', () => {
  assert.equal(getImagePerspectiveDistanceLabel(1), '特写');
  assert.equal(getImagePerspectiveDistanceLabel(4), '中景');
  assert.equal(getImagePerspectiveDistanceLabel(8), '远景');
});
