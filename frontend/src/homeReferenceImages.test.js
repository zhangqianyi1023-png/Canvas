import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_MAX_REFERENCE_IMAGES,
  appendHomeReferenceImages,
  buildHomeCreationRequest,
  buildHomeGeneratorOptions,
  normalizeHomeReferenceImages,
} from './homeReferenceImages.js';

test('normalizes unique image URLs and caps the list at nine', () => {
  const urls = Array.from({ length: 12 }, (_, index) => `/image-${index}.png`);

  assert.deepEqual(
    normalizeHomeReferenceImages([...urls, urls[0]]),
    urls.slice(0, HOME_MAX_REFERENCE_IMAGES),
  );
  assert.equal(HOME_MAX_REFERENCE_IMAGES, 9);
});

test('appends new URLs without duplicates and preserves existing order', () => {
  assert.deepEqual(
    appendHomeReferenceImages(['/a.png', '/b.png'], ['/b.png', '/c.png']),
    ['/a.png', '/b.png', '/c.png'],
  );
});

test('normalizes the homepage creation request with reference images', () => {
  const urls = Array.from({ length: 11 }, (_, index) => `/reference-${index}.png`);

  assert.deepEqual(
    buildHomeCreationRequest({
      prompt: '  做一张海报  ',
      type: 'generateVideo',
      apiId: 'provider-1',
      model: 'video-model',
      uploadedReferenceImages: urls,
    }),
    {
      prompt: '做一张海报',
      type: 'generateVideo',
      apiId: 'provider-1',
      model: 'video-model',
      uploadedReferenceImages: urls.slice(0, HOME_MAX_REFERENCE_IMAGES),
    },
  );
});

test('uses safe defaults for malformed homepage creation requests', () => {
  assert.deepEqual(buildHomeCreationRequest(null), {
    prompt: '',
    type: 'generateImage',
    apiId: '',
    model: '',
    uploadedReferenceImages: [],
  });
});

test('builds image generator options with uploaded references', () => {
  assert.deepEqual(
    buildHomeGeneratorOptions({
      prompt: '商品海报',
      type: 'generateImage',
      apiId: 'image-provider',
      model: 'image-model',
      uploadedReferenceImages: ['/a.png', '/b.png'],
    }),
    {
      promptDraft: '商品海报',
      imageModel: 'image-model',
      imageApiId: 'image-provider',
      videoModel: '',
      videoApiId: '',
      uploadedReferenceImages: ['/a.png', '/b.png'],
    },
  );
});

test('builds video generator options with uploaded references', () => {
  assert.deepEqual(
    buildHomeGeneratorOptions({
      prompt: '产品视频',
      type: 'generateVideo',
      apiId: 'video-provider',
      model: 'video-model',
      uploadedReferenceImages: ['/a.png'],
    }),
    {
      promptDraft: '产品视频',
      imageModel: '',
      imageApiId: '',
      videoModel: 'video-model',
      videoApiId: 'video-provider',
      uploadedReferenceImages: ['/a.png'],
    },
  );
});
