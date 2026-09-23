import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedAudioFile } from './audioFormats.js';

test('detects supported audio files by mime or extension', () => {
  assert.equal(isSupportedAudioFile({ type: 'audio/mpeg', name: 'voice.bin' }), true);
  assert.equal(isSupportedAudioFile({ type: '', name: 'voice.m4a' }), true);
  assert.equal(isSupportedAudioFile({ type: 'application/octet-stream', name: 'voice.wav' }), true);
  assert.equal(isSupportedAudioFile({ type: 'audio/mp4', name: 'voice.m4a' }), true);
  assert.equal(isSupportedAudioFile({ type: 'text/plain', name: 'voice.txt' }), false);
  assert.equal(isSupportedAudioFile({ type: 'video/mp4', name: 'voice.mp4' }), false);
  assert.equal(isSupportedAudioFile({ type: 'audio/mp4', name: 'voice.mp4' }), false);
  assert.equal(isSupportedAudioFile({ type: 'video/webm', name: 'voice.webm' }), false);
});
