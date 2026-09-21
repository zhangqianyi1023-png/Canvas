import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterLibraryItems,
  getLibraryProjectName,
  mergeMaterialSources,
  normalizeLocalAssetMaterial,
} from './materialLibrary.js';

test('filters library items across configured fields', () => {
  const items = [{ name: '风扇', brand: '清凉', description: '桌面电器' }];

  assert.deepEqual(
    filterLibraryItems(items, '电器', ['name', 'brand', 'description']),
    items,
  );
  assert.deepEqual(
    filterLibraryItems(items, '食品', ['name', 'brand', 'description']),
    [],
  );
});

test('returns all items for an empty library query', () => {
  const items = [{ name: '风扇' }];

  assert.equal(filterLibraryItems(items, '  ', ['name']), items);
});

test('creates stable project names for every library item kind', () => {
  assert.equal(getLibraryProjectName('template', { name: '电商首图' }), '电商首图');
  assert.equal(getLibraryProjectName('product', {}), '未命名商品');
  assert.equal(getLibraryProjectName('template', {}), '未命名模板');
  assert.equal(getLibraryProjectName('material', {}), '未命名素材');
});

test('normalizes local upload assets for the material library', () => {
  assert.deepEqual(
    normalizeLocalAssetMaterial({
      id: 'asset-1',
      mediaType: 'video',
      filename: 'demo.mp4',
      url: '/uploads/demo.mp4',
      byteSize: 100,
      createdAt: '2026-06-30T01:00:00Z',
    }),
    {
      id: 'asset_asset-1',
      name: 'demo.mp4',
      imageUrl: '/uploads/demo.mp4',
      prompt: '',
      type: 'video',
      source: 'local-asset',
      sourceId: 'asset-1',
      byteSize: 100,
      createdAt: '2026-06-30T01:00:00Z',
      updatedAt: '2026-06-30T01:00:00Z',
    },
  );
});

test('ignores local audio assets until the material library supports audio', () => {
  assert.equal(
    normalizeLocalAssetMaterial({
      id: 'asset-audio',
      mediaType: 'audio',
      filename: 'voice.mp3',
      url: '/uploads/voice.mp3',
    }),
    null,
  );
});

test('merges saved materials with local assets without duplicate urls', () => {
  const saved = [{
    id: 'material-1',
    name: '收藏图',
    imageUrl: '/uploads/a.png',
    createdAt: '2026-06-30T02:00:00Z',
  }];
  const localAssets = [
    { id: 'asset-a', filename: 'a.png', url: '/uploads/a.png', createdAt: '2026-06-30T03:00:00Z' },
    { id: 'asset-b', filename: 'b.png', url: '/uploads/b.png', createdAt: '2026-06-30T01:00:00Z' },
  ];

  const merged = mergeMaterialSources(saved, localAssets);

  assert.deepEqual(merged.map(item => item.imageUrl), ['/uploads/a.png', '/uploads/b.png']);
  assert.equal(merged[0].id, 'material-1');
  assert.equal(merged[1].source, 'local-asset');
});
