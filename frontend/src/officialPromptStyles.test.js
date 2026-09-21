import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendPromptStyleToText,
  listPublicPromptStyles,
  normalizePromptStyle,
} from './officialPromptStyles.js';

test('normalizePromptStyle maps snake fields used by backend', () => {
  const normalized = normalizePromptStyle({
    id: 'style_1',
    name: '小红书清透',
    category: '小红书',
    cover_url: '/uploads/style.png',
    sort_order: 5,
    prompt: '自然光',
  });

  assert.equal(normalized.coverUrl, '/uploads/style.png');
  assert.equal(normalized.sortOrder, 5);
  assert.equal(normalized.enabled, true);
});

test('appendPromptStyleToText appends style prompt without replacing user text', () => {
  const result = appendPromptStyleToText('保留商品主体', {
    prompt: '小红书清透自然光，生活方式种草。',
  });

  assert.equal(result, '保留商品主体\n\n风格参考：\n小红书清透自然光，生活方式种草。');
});

test('appendPromptStyleToText avoids duplicating the same style prompt', () => {
  const text = '保留商品主体\n\n风格参考：\n小红书清透自然光，生活方式种草。';

  assert.equal(
    appendPromptStyleToText(text, { prompt: '小红书清透自然光，生活方式种草。' }),
    text,
  );
});

test('listPublicPromptStyles calls public API and normalizes styles', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({
        styles: [{ id: 'style_1', name: '公众号', prompt: '杂志封面', cover_url: '/cover.png' }],
      }),
    };
  };

  const result = await listPublicPromptStyles({ category: '公众号', fetchImpl });

  assert.equal(calls[0].endsWith('/api/prompt-styles?category=%E5%85%AC%E4%BC%97%E5%8F%B7'), true);
  assert.equal(result[0].coverUrl, '/cover.png');
});
