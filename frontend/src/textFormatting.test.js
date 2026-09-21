import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTextFormat, getTextFormatState } from './textFormatting.js';

test('text block formatting applies and clears markdown heading prefixes', () => {
  const h2 = applyTextFormat('标题', 0, 2, 'h2');
  assert.equal(h2.value, '## 标题');

  const p = applyTextFormat(h2.value, 3, 5, 'p');
  assert.equal(p.value, '标题');
});

test('inline formatting wraps selected text', () => {
  const bold = applyTextFormat('hello world', 6, 11, 'bold');
  assert.equal(bold.value, 'hello **world**');
  assert.equal(bold.selectionStart, 8);
  assert.equal(bold.selectionEnd, 13);

  const italic = applyTextFormat('hello', 0, 5, 'italic');
  assert.equal(italic.value, '*hello*');
});

test('list formatting toggles selected lines', () => {
  const listed = applyTextFormat('one\ntwo', 0, 7, 'ul');
  assert.equal(listed.value, '- one\n- two');

  const cleared = applyTextFormat(listed.value, 0, listed.value.length, 'ul');
  assert.equal(cleared.value, 'one\ntwo');
});

test('insert commands preserve plain text storage', () => {
  const rule = applyTextFormat('a\nb', 2, 2, 'rule');
  assert.equal(rule.value, 'a\n---\nb');
});

test('format state reflects current block and list', () => {
  assert.equal(getTextFormatState('### 标题', 4).block, 'h3');
  assert.equal(getTextFormatState('- item', 2).list, 'ul');
  assert.equal(getTextFormatState('1. item', 2).list, 'ol');
});
