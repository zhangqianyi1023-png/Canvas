import test from 'node:test';
import assert from 'node:assert/strict';

import { getShortcutModifierLabel } from './platformShortcut.js';


test('uses Command for Apple platforms', () => {
  assert.equal(getShortcutModifierLabel({ userAgentData: { platform: 'macOS' } }), '⌘');
  assert.equal(getShortcutModifierLabel({ platform: 'MacIntel' }), '⌘');
  assert.equal(getShortcutModifierLabel({ platform: 'iPhone' }), '⌘');
});

test('uses Ctrl for Windows, Linux, and unknown platforms', () => {
  assert.equal(getShortcutModifierLabel({ userAgentData: { platform: 'Windows' } }), 'Ctrl');
  assert.equal(getShortcutModifierLabel({ platform: 'Linux x86_64' }), 'Ctrl');
  assert.equal(getShortcutModifierLabel(), 'Ctrl');
});

test('prefers userAgentData platform over legacy platform', () => {
  assert.equal(getShortcutModifierLabel({
    userAgentData: { platform: 'Windows' },
    platform: 'MacIntel',
  }), 'Ctrl');
});
