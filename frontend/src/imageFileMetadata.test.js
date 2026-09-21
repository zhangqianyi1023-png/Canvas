import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUploadedImageAssetMetadata } from './imageFileMetadata.js';

test('buildUploadedImageAssetMetadata stores the original upload ratio', () => {
  assert.deepEqual(
    buildUploadedImageAssetMetadata({}, { width: 800, height: 600 }),
    {
      width: 800,
      height: 600,
      imageSize: '4:3',
      mediaAspectRatio: 4 / 3,
    },
  );
});

test('buildUploadedImageAssetMetadata preserves non-preset portrait ratios', () => {
  assert.deepEqual(
    buildUploadedImageAssetMetadata({ width: 800, height: 1064 }, null),
    {
      width: 800,
      height: 1064,
      imageSize: '100:133',
      mediaAspectRatio: 800 / 1064,
    },
  );
});

test('buildUploadedImageAssetMetadata returns empty metadata without dimensions', () => {
  assert.deepEqual(buildUploadedImageAssetMetadata({}, null), {});
});
