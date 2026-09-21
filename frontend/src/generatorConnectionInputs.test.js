import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getConnectedImagesForNewGenerator,
  getResultCoverImageReference,
} from './generatorConnectionInputs.js';

const imageResult = {
  id: 'result_image',
  type: 'result',
  data: {
    resultType: 'generateImage',
    imageUrl: '/cover.png',
    imageUrls: ['/first.png', '/second.png'],
    coverIndex: 1,
  },
};

test('image result passes only its cover image to a new text generator by default', () => {
  assert.deepEqual(
    getConnectedImagesForNewGenerator({
      generatorType: 'generateText',
      sourceNode: imageResult,
    }),
    ['/second.png'],
  );
});

test('dragging from a specific image handle keeps only that image', () => {
  assert.deepEqual(
    getConnectedImagesForNewGenerator({
      generatorType: 'generateText',
      sourceNode: imageResult,
      sourceHandle: 'img-1',
    }),
    ['/second.png'],
  );
});

test('all multimodal generator types accept upstream images', () => {
  for (const generatorType of [
    'generateText',
    'generateImage',
    'generateVideo',
    'generateStoryboardScript',
  ]) {
    assert.deepEqual(
      getConnectedImagesForNewGenerator({ generatorType, sourceNode: imageResult }),
      ['/second.png'],
    );
  }
});

test('image references prefer persisted server images before taking the cover', () => {
  const result = {
    id: 'result_saved',
    type: 'result',
    data: {
      resultType: 'generateImage',
      imageUrls: [
        'https://relay.example/a.png',
        'https://relay.example/b.png',
        '/uploads/a.png',
        '/uploads/b.png',
      ],
      coverIndex: 1,
    },
  };

  assert.equal(getResultCoverImageReference(result), '/uploads/b.png');
  assert.deepEqual(
    getConnectedImagesForNewGenerator({
      generatorType: 'generateImage',
      sourceNode: result,
    }),
    ['/uploads/b.png'],
  );
});
