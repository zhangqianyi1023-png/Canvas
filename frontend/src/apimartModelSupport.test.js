import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCapabilityOptions,
  buildImageRatioOptions,
  filterSelectableModels,
  getCapabilityLabel,
  isPulledModelSelectable,
  selectCapabilities,
  resolveCapabilityValue,
} from './apimartModelSupport.js';

const pickerData = {
  enforceImageAdaptation: true,
  imageSupport: {
    supported: {
      adapted: true,
      capabilityLabels: ['文生图', '参考图'],
    },
    unknown: {
      adapted: false,
      reason: '暂未适配',
    },
  },
};

test('APIMart image picker only allows adapted models', () => {
  assert.equal(isPulledModelSelectable(pickerData, 'image', 'supported'), true);
  assert.equal(isPulledModelSelectable(pickerData, 'image', 'unknown'), false);
  assert.deepEqual(
    filterSelectableModels(pickerData, 'image', ['supported', 'unknown']),
    ['supported'],
  );
});

test('model gating does not affect text or non-APIMart providers', () => {
  assert.equal(isPulledModelSelectable(pickerData, 'text', 'unknown'), true);
  assert.equal(isPulledModelSelectable({ enforceImageAdaptation: false }, 'image', 'unknown'), true);
});

test('selected capability snapshot only keeps adapted models', () => {
  assert.deepEqual(Object.keys(selectCapabilities(pickerData.imageSupport, ['supported', 'unknown'])), ['supported']);
  assert.equal(getCapabilityLabel(pickerData.imageSupport.supported), '文生图 · 参考图');
});

test('image controls are derived from the selected model capability', () => {
  const ratios = buildImageRatioOptions({ ratios: ['auto', '3:4'] }, [
    { id: 'image-3-4', label: '3:4', value: '3:4', shape: 'portrait' },
  ]);
  const resolutions = buildCapabilityOptions(['1K', '2K']);

  assert.deepEqual(ratios.map(option => option.value), ['auto', '3:4']);
  assert.equal(ratios[1].id, 'image-3-4');
  assert.deepEqual(resolutions.map(option => option.value), ['1K', '2K']);
  assert.equal(resolveCapabilityValue('1k', resolutions, '2K'), '1K');
  assert.equal(resolveCapabilityValue('4k', resolutions, '2K'), '2K');
});
