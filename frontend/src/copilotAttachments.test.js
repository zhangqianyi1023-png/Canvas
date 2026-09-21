import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COPILOT_MAX_ATTACHMENTS,
  formatCopilotAttachmentSize,
  getCopilotAttachmentKind,
  getCopilotFileValidationError,
} from './copilotAttachments.js';

test('recognizes supported image and text attachments', () => {
  assert.equal(getCopilotAttachmentKind({ name: 'photo.png', type: 'image/png' }), 'image');
  assert.equal(getCopilotAttachmentKind({ name: 'notes.md', type: '' }), 'text');
  assert.equal(getCopilotAttachmentKind({ name: 'table.csv', type: 'text/csv' }), 'text');
  assert.equal(getCopilotAttachmentKind({ name: 'movie.mp4', type: 'video/mp4' }), '');
});

test('enforces attachment count and size limits', () => {
  assert.match(getCopilotFileValidationError({ name: 'x.txt', size: 1 }, COPILOT_MAX_ATTACHMENTS), /最多/);
  assert.match(getCopilotFileValidationError({ name: 'large.png', type: 'image/png', size: 9 * 1024 * 1024 }), /8MB/);
  assert.match(getCopilotFileValidationError({ name: 'large.txt', type: 'text/plain', size: 2 * 1024 * 1024 }), /1MB/);
});

test('formats compact attachment sizes', () => {
  assert.equal(formatCopilotAttachmentSize(2048), '2 KB');
  assert.equal(formatCopilotAttachmentSize(1572864), '1.5 MB');
});
