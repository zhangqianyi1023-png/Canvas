import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCanvasServerUrls,
  getTaskMediaAddresses,
  getTaskRenderableUrls,
  getTaskSourceToServerEntries,
  preferCanvasServerUrls,
  toDisplayMediaUrl,
} from './taskMedia.js';

test('canvas accepts only server-local upload URLs', () => {
  assert.deepEqual(
    getCanvasServerUrls([
      'https://ts.apib.ai/f/image/result.png',
      '/uploads/local.png',
      'http://localhost:5173/uploads/server.png',
    ]),
    ['/uploads/local.png', 'http://localhost:5173/uploads/server.png'],
  );
});

test('task center keeps source and server addresses separate', () => {
  assert.deepEqual(
    getTaskMediaAddresses({
      source_urls: ['https://ts.apib.ai/f/image/result.png'],
      server_urls: ['/uploads/local.png'],
    }),
    {
      sourceUrls: ['https://ts.apib.ai/f/image/result.png'],
      serverUrls: ['/uploads/local.png'],
    },
  );
});

test('canvas can render task source media when server save failed', () => {
  assert.deepEqual(
    getTaskRenderableUrls({
      status: 'save_failed',
      source_urls: ['https://ts.apib.ai/f/image/result.png'],
      server_urls: [],
    }),
    ['https://ts.apib.ai/f/image/result.png'],
  );
});

test('canvas prefers server media once available', () => {
  assert.deepEqual(
    getTaskRenderableUrls({
      source_urls: ['https://ts.apib.ai/f/image/result.png'],
      server_urls: ['/uploads/local.png'],
    }),
    ['/uploads/local.png'],
  );
});

test('display image lists hide source media when server media exists', () => {
  assert.deepEqual(
    preferCanvasServerUrls([
      'https://ts.apib.ai/f/image/result-1.png',
      '/uploads/result-1.png',
      'https://ts.apib.ai/f/image/result-2.png',
      '/uploads/result-2.png',
    ]),
    ['/uploads/result-1.png', '/uploads/result-2.png'],
  );
});

test('task media maps source urls to server urls without media records', () => {
  assert.deepEqual(
    getTaskSourceToServerEntries({
      source_urls: [
        'https://ts.apib.ai/f/image/result-1.png',
        'https://ts.apib.ai/f/image/result-2.png',
      ],
      server_urls: [
        '/uploads/result-1.png',
        '/uploads/result-2.png',
      ],
    }),
    [
      ['https://ts.apib.ai/f/image/result-1.png', '/uploads/result-1.png'],
      ['https://ts.apib.ai/f/image/result-2.png', '/uploads/result-2.png'],
    ],
  );
});

test('task center displays relative server media as a full same-origin URL when possible', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
  try {
    assert.equal(
      toDisplayMediaUrl('/uploads/local.png'),
      'http://localhost:5173/uploads/local.png',
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test('task center display URLs include the Vite base path when deployed under a subpath', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: 'http://118.25.16.178', pathname: '/canvas-v2/' } };
  try {
    assert.equal(
      toDisplayMediaUrl('/uploads/local.png'),
      'http://118.25.16.178/canvas-v2/uploads/local.png',
    );
  } finally {
    globalThis.window = previousWindow;
  }
});
