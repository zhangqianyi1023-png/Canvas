import test from 'node:test';
import assert from 'node:assert/strict';

import { buildImageInpaintPrompt } from './imageInpaintPrompt.js';

test('builds image inpaint prompt with mask semantics and dimensions', () => {
  const prompt = buildImageInpaintPrompt({
    instruction: '把中间改成一颗蓝色星星',
    imageSize: { width: 800, height: 1064 },
  });

  assert.match(prompt, /参考原图/);
  assert.match(prompt, /系统会提供与原图尺寸一致的遮罩/);
  assert.match(prompt, /遮罩透明区域允许重绘/);
  assert.match(prompt, /其余区域必须保持原图不变/);
  assert.match(prompt, /800x1064/);
  assert.match(prompt, /蓝色星星/);
});

test('omits mask dimensions when image size is unknown', () => {
  const prompt = buildImageInpaintPrompt({ instruction: '补一朵花' });

  assert.doesNotMatch(prompt, /遮罩尺寸/);
  assert.match(prompt, /补一朵花/);
});
