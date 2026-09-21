import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSmartSplitterDirectionLaunches,
  getSmartSplitterPhaseLabel,
  isSmartSplitterBusy,
  normalizeSmartSplitterPhase,
} from './smartSplitterLifecycle.js';

test('smart splitter exposes only analysis and node-creation phases', () => {
  assert.equal(getSmartSplitterPhaseLabel('analyzing'), '分析提示词');
  assert.equal(getSmartSplitterPhaseLabel('creating'), '产生下游节点');

  for (const status of ['', 'idle', 'generating', 'success', 'partial_error', 'error']) {
    assert.equal(getSmartSplitterPhaseLabel(status), '');
    assert.equal(normalizeSmartSplitterPhase(status), '');
    assert.equal(isSmartSplitterBusy(status), false);
  }

  assert.equal(isSmartSplitterBusy('analyzing'), true);
  assert.equal(isSmartSplitterBusy('creating'), true);
});

test('every downstream direction receives an independent generator launch', () => {
  const launches = buildSmartSplitterDirectionLaunches({
    directionPrompts: ['方向一', '方向二'],
    generatorIds: ['generator_1', 'generator_2'],
    provider: {
      id: 'provider_1',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
    },
    model: 'image-model',
    imageSize: '3:4',
    imageResolution: '2k',
    imagesPerDirection: 2,
    referenceImages: ['/uploads/reference.png'],
    splitterId: 'splitter_1',
    batchId: 'batch_1',
  });

  assert.deepEqual(launches.map(item => item.generatorId), ['generator_1', 'generator_2']);
  assert.notStrictEqual(launches[0].payload, launches[1].payload);
  assert.deepEqual(launches[0].payload.image_urls, ['/uploads/reference.png']);
  assert.notStrictEqual(launches[0].payload.image_urls, launches[1].payload.image_urls);
  assert.equal(launches[0].generationConfig.splitter_direction_index, 0);
  assert.equal(launches[1].generationConfig.splitter_direction_index, 1);
  assert.equal('onProgress' in launches[0], false);
  assert.equal('onComplete' in launches[0], false);
});
