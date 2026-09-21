import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendImageResultImages,
  migrateLegacyImageGraph,
  normalizeImageResultData,
  replaceImageResultCover,
  restoreImageNodePairs,
} from './imageNodeModel.js';

test('normalizes legacy and multi-image result data', () => {
  assert.deepEqual(
    normalizeImageResultData({ imageUrl: '/old.png' }),
    {
      imageUrl: '/old.png',
      imageUrls: ['/old.png'],
      coverIndex: 0,
    },
  );

  assert.deepEqual(
    normalizeImageResultData({
      imageUrl: '/stale.png',
      imageUrls: ['', '/a.png', null, '/b.png'],
      coverIndex: 1,
    }),
    {
      imageUrl: '/b.png',
      imageUrls: ['/a.png', '/b.png'],
      coverIndex: 1,
    },
  );

  assert.deepEqual(
    normalizeImageResultData({
      imageUrls: ['/a.png'],
      coverIndex: 5,
    }),
    {
      imageUrl: '/a.png',
      imageUrls: ['/a.png'],
      coverIndex: 0,
    },
  );
});

test('upload creates the first image for an empty result', () => {
  assert.deepEqual(
    replaceImageResultCover({}, '/upload.png'),
    {
      imageUrl: '/upload.png',
      imageUrls: ['/upload.png'],
      coverIndex: 0,
    },
  );
});

test('upload replaces the only image without mutating the original array', () => {
  const imageUrls = ['/old.png'];
  const original = {
    imageUrl: '/old.png',
    imageUrls,
    coverIndex: 0,
  };

  assert.deepEqual(
    replaceImageResultCover(original, '/upload.png'),
    {
      imageUrl: '/upload.png',
      imageUrls: ['/upload.png'],
      coverIndex: 0,
    },
  );
  assert.strictEqual(original.imageUrls, imageUrls);
  assert.deepEqual(original.imageUrls, ['/old.png']);
});

test('upload replaces only the current cover in a multi-image result', () => {
  const imageUrls = ['/a.png', '/b.png', '/c.png'];
  const original = {
    imageUrl: '/b.png',
    imageUrls,
    coverIndex: 1,
  };

  const replaced = replaceImageResultCover(original, '/upload.png');

  assert.deepEqual(replaced, {
    imageUrl: '/upload.png',
    imageUrls: ['/a.png', '/upload.png', '/c.png'],
    coverIndex: 1,
  });
  assert.notStrictEqual(replaced.imageUrls, imageUrls);
  assert.strictEqual(original.imageUrls, imageUrls);
  assert.deepEqual(original.imageUrls, ['/a.png', '/b.png', '/c.png']);
});

test('generation appends the first image to an empty result', () => {
  assert.deepEqual(
    appendImageResultImages({}, ['/generated-1.png']),
    {
      imageUrl: '/generated-1.png',
      imageUrls: ['/generated-1.png'],
      coverIndex: 0,
    },
  );
});

test('generation appends new images instead of replacing existing images', () => {
  assert.deepEqual(
    appendImageResultImages({
      imageUrl: '/old.png',
      imageUrls: ['/old.png'],
      coverIndex: 0,
    }, ['/generated-1.png']),
    {
      imageUrl: '/generated-1.png',
      imageUrls: ['/old.png', '/generated-1.png'],
      coverIndex: 1,
    },
  );

  assert.deepEqual(
    appendImageResultImages({
      imageUrl: '/old.png',
      imageUrls: ['/old.png'],
      coverIndex: 0,
    }, ['/generated-1.png', '/generated-2.png']),
    {
      imageUrl: '/generated-1.png',
      imageUrls: ['/old.png', '/generated-1.png', '/generated-2.png'],
      coverIndex: 1,
    },
  );
});

test('generation appends to multi-image results without duplicating progressive callbacks', () => {
  assert.deepEqual(
    appendImageResultImages({
      imageUrl: '/generated-1.png',
      imageUrls: ['/old-a.png', '/old-b.png', '/generated-1.png'],
      coverIndex: 2,
    }, ['/generated-1.png', '/generated-2.png']),
    {
      imageUrl: '/generated-1.png',
      imageUrls: ['/old-a.png', '/old-b.png', '/generated-1.png', '/generated-2.png'],
      coverIndex: 2,
    },
  );
});

test('generation can preserve a manually selected cover while appending images', () => {
  assert.deepEqual(
    appendImageResultImages({
      imageUrl: '/first.png',
      imageUrls: ['/first.png', '/second.png'],
      coverIndex: 0,
    }, ['/second.png'], { preserveCover: true }),
    {
      imageUrl: '/first.png',
      imageUrls: ['/first.png', '/second.png'],
      coverIndex: 0,
    },
  );

  assert.deepEqual(
    appendImageResultImages({
      imageUrl: '/first.png',
      imageUrls: ['/first.png'],
      coverIndex: 0,
    }, ['/second.png'], { preserveCover: true }),
    {
      imageUrl: '/first.png',
      imageUrls: ['/first.png', '/second.png'],
      coverIndex: 0,
    },
  );
});

test('legacy image input keeps graph identity, metadata, and edges', () => {
  const position = { x: 40, y: 60 };
  const style = { width: 260, height: 195, opacity: 0.8 };
  const legacy = {
    id: 'image_1',
    type: 'imageInput',
    parentNode: 'group_1',
    extent: 'parent',
    position,
    style,
    selected: true,
    zIndex: 4,
    data: {
      label: '图片素材',
      imageUrl: '/material.png',
      materialId: 'material_1',
      materialName: '商品主图',
      materialPrompt: '白色背景',
      materialSource: 'library',
    },
  };
  const edge = {
    id: 'edge_1',
    source: 'image_1',
    target: 'result_2',
    sourceHandle: 'image',
  };
  const edges = [edge];

  const migrated = migrateLegacyImageGraph([legacy], edges);
  const result = migrated.nodes.find(node => node.id === 'image_1');
  const generator = migrated.nodes.find(
    node => node.id === result.data.pairedGeneratorId,
  );

  assert.equal(migrated.nodes.some(node => node.type === 'imageInput'), false);
  assert.equal(result.type, 'result');
  assert.strictEqual(result.position, position);
  assert.strictEqual(result.style, style);
  assert.equal(result.parentNode, 'group_1');
  assert.equal(result.extent, 'parent');
  assert.equal(result.selected, true);
  assert.equal(result.zIndex, 4);
  assert.equal(result.data.label, '图片');
  assert.equal(result.data.resultType, 'generateImage');
  assert.equal(result.data.imageUrl, '/material.png');
  assert.deepEqual(result.data.imageUrls, ['/material.png']);
  assert.equal(result.data.coverIndex, 0);
  assert.equal(result.data.materialId, 'material_1');
  assert.equal(result.data.materialName, '商品主图');
  assert.equal(result.data.materialPrompt, '白色背景');
  assert.equal(result.data.materialSource, 'library');

  assert.equal(generator.type, 'generator');
  assert.equal(generator.hidden, true);
  assert.equal(generator.data.generatorType, 'generateImage');
  assert.equal(generator.data.pairedResultId, 'image_1');
  assert.equal(generator.data.promptDraft, '白色背景');
  assert.equal(generator.data.image_prompt, '白色背景');
  assert.equal(generator.data.connectedPrompt, '');
  assert.deepEqual(generator.data.connectedTextReferences, []);
  assert.deepEqual(generator.data.uploadedReferenceImages, []);
  assert.deepEqual(generator.data.connectedImages, []);
  assert.deepEqual(generator.data.connectedVideos, []);
  assert.deepEqual(generator.position, { x: -130, y: 271 });
  assert.equal(result.data.pairedGeneratorId, generator.id);

  assert.strictEqual(migrated.edges, edges);
  assert.deepEqual(migrated.edges, [edge]);
  assert.strictEqual(migrated.edges[0], edge);
});

test('legacy migration creates collision-free generator ids and uses default size', () => {
  const occupiedGenerator = {
    id: 'generator_image_1',
    type: 'generator',
    position: { x: 0, y: 0 },
    data: {},
  };
  const legacy = {
    id: 'image_1',
    type: 'imageInput',
    position: { x: 100, y: 200 },
    data: { imageUrls: ['/one.png', '/two.png'], coverIndex: 1 },
  };

  const migrated = migrateLegacyImageGraph(
    [occupiedGenerator, legacy],
    [],
  );
  const result = migrated.nodes.find(node => node.id === 'image_1');
  const generator = migrated.nodes.find(
    node => node.id === result.data.pairedGeneratorId,
  );

  assert.equal(result.data.pairedGeneratorId, 'generator_image_1_1');
  assert.equal(generator.data.pairedResultId, 'image_1');
  assert.deepEqual(generator.position, { x: -60, y: 589 });
  assert.equal(migrated.nodes[0], occupiedGenerator);
});

test('legacy migration parses numeric position and size strings', () => {
  const migrated = migrateLegacyImageGraph([{
    id: 'image_string_dimensions',
    type: 'imageInput',
    position: { x: '40', y: '60px' },
    style: { width: '260px', height: '195' },
    data: {},
  }], []);
  const result = migrated.nodes.find(
    node => node.id === 'image_string_dimensions',
  );
  const generator = migrated.nodes.find(
    node => node.id === result.data.pairedGeneratorId,
  );

  assert.deepEqual(generator.position, { x: -130, y: 271 });
});

test('legacy image migration is idempotent and no-op preserves references', () => {
  const first = migrateLegacyImageGraph([
    {
      id: 'image_1',
      type: 'imageInput',
      position: { x: 0, y: 0 },
      data: { imageUrls: ['/one.png'] },
    },
  ], []);
  const second = migrateLegacyImageGraph(first.nodes, first.edges);

  assert.strictEqual(second.nodes, first.nodes);
  assert.strictEqual(second.edges, first.edges);

  const modernNodes = [{
    id: 'result_1',
    type: 'result',
    data: { resultType: 'generateImage' },
  }];
  const modernEdges = [{
    id: 'edge_1',
    source: 'result_1',
    target: 'result_2',
  }];
  const unchanged = migrateLegacyImageGraph(modernNodes, modernEdges);

  assert.strictEqual(unchanged.nodes, modernNodes);
  assert.strictEqual(unchanged.edges, modernEdges);
});

test('restores all result pairs with explicit ids before legacy ids', () => {
  const nodes = [
    {
      id: 'image_1',
      type: 'result',
      data: {
        resultType: 'generateImage',
        pairedGeneratorId: 'custom_generator',
      },
    },
    {
      id: 'custom_generator',
      type: 'generator',
      data: { pairedResultId: 'image_1' },
    },
    {
      id: 'other_generator',
      type: 'generator',
      data: { pairedResultId: 'image_1' },
    },
    {
      id: 'image_2',
      type: 'result',
      data: { resultType: 'generateImage' },
    },
    {
      id: 'generator_explicit',
      type: 'generator',
      data: { pairedResultId: 'image_2' },
    },
    {
      id: 'result_3',
      type: 'result',
      data: { resultType: 'generateImage' },
    },
    {
      id: 'generator_3',
      type: 'generator',
      data: {},
    },
    {
      id: 'result_text',
      type: 'result',
      data: {
        resultType: 'generateText',
        pairedGeneratorId: 'text_generator',
      },
    },
    {
      id: 'text_generator',
      type: 'generator',
      data: { pairedResultId: 'result_text' },
    },
    {
      id: 'result_video',
      type: 'result',
      data: { resultType: 'generateVideo' },
    },
    {
      id: 'generator_video',
      type: 'generator',
      data: {},
    },
  ];

  assert.deepEqual(restoreImageNodePairs(nodes), {
    image_1: 'custom_generator',
    image_2: 'generator_explicit',
    result_3: 'generator_3',
    result_text: 'text_generator',
    result_video: 'generator_video',
  });
});
