import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldCloseExpandedImagesOnKeyDown } from './resultImageExpansionInteraction.js';

test('Escape closes an expanded image collection', () => {
  assert.equal(shouldCloseExpandedImagesOnKeyDown({
    key: 'Escape',
    target: { tagName: 'DIV' },
  }), true);
});

test('expanded image collection ignores Escape while the full-screen preview is open', () => {
  assert.equal(shouldCloseExpandedImagesOnKeyDown({
    key: 'Escape',
    target: { tagName: 'DIV' },
    previewOpen: true,
  }), false);
});

test('expanded image collection keeps keyboard editing uninterrupted', () => {
  assert.equal(shouldCloseExpandedImagesOnKeyDown({
    key: 'Escape',
    target: { tagName: 'TEXTAREA' },
  }), false);
  assert.equal(shouldCloseExpandedImagesOnKeyDown({
    key: 'Escape',
    target: { tagName: 'DIV', isContentEditable: true },
  }), false);
});
