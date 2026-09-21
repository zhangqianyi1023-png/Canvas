import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectTemplateMediaUrls,
  createWorkflowTemplateSnapshot,
  instantiateWorkflowTemplate,
  removeTransientProviderFrames,
  replaceTemplateMediaUrls,
} from './workflowTemplates.js';

const graph = {
  nodes: [
    {
      id: 'group_old',
      type: 'group',
      position: { x: 100, y: 80 },
      style: { width: 600, height: 400 },
      data: { label: '商品工作流', childIds: ['image_1', 'result_7'], onUngroup() {} },
    },
    {
      id: 'image_1',
      type: 'imageInput',
      parentNode: 'group_old',
      position: { x: 30, y: 50 },
      data: { imageUrls: ['https://cdn.example.com/source.png'], onImagesChange() {} },
    },
    {
      id: 'result_7',
      type: 'result',
      parentNode: 'group_old',
      position: { x: 240, y: 50 },
      data: {
        resultType: 'generateImage',
        imageUrls: ['https://cdn.example.com/out.png'],
        pairedGeneratorId: 'generator_7',
        generating: true,
      },
    },
    {
      id: 'generator_7',
      type: 'generator',
      position: { x: 340, y: 500 },
      data: {
        promptDraft: '做一张商品图',
        pairedResultId: 'result_7',
        generationTask: { status: 'running' },
        apiConfigs: [{}],
      },
    },
    { id: 'outside', type: 'imageInput', position: { x: 0, y: 0 }, data: { imageUrls: [] } },
  ],
  edges: [
    { id: 'inside', source: 'image_1', target: 'result_7' },
    { id: 'outside-edge', source: 'outside', target: 'result_7' },
  ],
};

test('snapshot preserves group children, internal edges, and hidden generator pairs', () => {
  const template = createWorkflowTemplateSnapshot({
    ...graph,
    groupId: 'group_old',
    pairMap: { result_7: 'generator_7' },
    name: '模板',
    id: 'template_1',
    now: '2026-06-13T00:00:00.000Z',
  });

  assert.deepEqual(template.nodes.map(node => node.id), ['image_1', 'result_7', 'generator_7']);
  assert.deepEqual(template.edges.map(edge => edge.id), ['inside']);
  assert.deepEqual(template.pairs, [{ resultId: 'result_7', generatorId: 'generator_7' }]);
  assert.equal(template.nodes.find(node => node.id === 'result_7').data.generating, false);
  assert.equal(template.nodes.find(node => node.id === 'result_7').data.pairedGeneratorId, 'generator_7');
  assert.equal(template.nodes.find(node => node.id === 'generator_7').data.generationTask, undefined);
  assert.equal(template.nodes.find(node => node.id === 'generator_7').data.apiConfigs, undefined);
  assert.equal(template.nodes.find(node => node.id === 'generator_7').data.pairedResultId, 'result_7');
});

test('template media collection and replacement cover nested image data', () => {
  const value = {
    imageUrl: 'https://cdn.example.com/a.png',
    nested: { uploaded_reference_images: ['https://cdn.example.com/b.png'] },
    prompt: 'keep https://example.com inside prompt',
  };
  assert.deepEqual([...collectTemplateMediaUrls(value)].sort(), [
    'https://cdn.example.com/a.png',
    'https://cdn.example.com/b.png',
  ]);
  const replaced = replaceTemplateMediaUrls(value, {
    'https://cdn.example.com/a.png': { url: '/uploads/a.png' },
    'https://cdn.example.com/b.png': { url: '/uploads/b.png' },
  });
  assert.equal(replaced.imageUrl, '/uploads/a.png');
  assert.equal(replaced.nested.uploaded_reference_images[0], '/uploads/b.png');
  assert.equal(replaced.prompt, value.prompt);
});

test('template snapshots discard expired APIMart video frame placeholders', () => {
  const staleFrame = 'https://upload.apib.ai/f/video/example-video_task_123_0.png';
  const cleaned = removeTransientProviderFrames({
    coverUrl: staleFrame,
    imageHistory: [staleFrame, 'https://cdn.example.com/real.png'],
  });
  assert.equal(cleaned.coverUrl, '');
  assert.deepEqual(cleaned.imageHistory, ['https://cdn.example.com/real.png']);
  assert.deepEqual([...collectTemplateMediaUrls(cleaned)], ['https://cdn.example.com/real.png']);
});

test('instantiation rewrites every graph id and keeps result-generator naming paired', () => {
  const template = createWorkflowTemplateSnapshot({
    ...graph,
    groupId: 'group_old',
    pairMap: { result_7: 'generator_7' },
    name: '模板',
  });
  const tokens = ['g', 'pair', 'image', 'edge'];
  const instance = instantiateWorkflowTemplate(template, {
    position: { x: 800, y: 600 },
    tokenFactory: () => tokens.shift() || 'extra',
  });

  assert.equal(instance.group.id, 'group_g');
  const result = instance.nodes.find(node => node.data?.imageUrls?.includes('https://cdn.example.com/out.png'));
  const image = instance.nodes.find(node => node.data?.imageUrls?.includes('https://cdn.example.com/source.png'));
  assert.equal(result.id, 'result_pair');
  assert.equal(result.data.pairedGeneratorId, 'generator_pair');
  assert.equal(image.id, 'result_image');
  assert.equal(image.parentNode, instance.group.id);
  assert.equal(image.data.pairedGeneratorId, 'generator_image');
  assert.deepEqual(instance.pairs, [
    { resultId: result.id, generatorId: 'generator_pair' },
    { resultId: image.id, generatorId: 'generator_image' },
  ]);
  assert.equal(instance.edges[0].source, image.id);
  assert.equal(instance.edges[0].target, result.id);
});

test('instantiation migrates a legacy image input into an explicitly paired image result', () => {
  const template = {
    id: 'legacy_image_template',
    name: '旧图片模板',
    group: {
      id: 'group_legacy',
      type: 'group',
      position: { x: 100, y: 80 },
      style: { width: 420, height: 320 },
      data: { label: '旧图片组合', childIds: ['image_legacy'] },
    },
    nodes: [{
      id: 'image_legacy',
      type: 'imageInput',
      parentNode: 'group_legacy',
      position: { x: 30, y: 50 },
      style: { width: 260, height: 195 },
      data: {
        imageUrl: 'https://cdn.example.com/legacy.png',
        materialId: 'material_legacy',
        materialPrompt: '保留商品颜色',
      },
    }],
    edges: [],
    pairs: [],
  };
  const tokens = ['group', 'pair'];
  const instance = instantiateWorkflowTemplate(template, {
    tokenFactory: () => tokens.shift() || 'extra',
  });

  assert.equal(instance.nodes.some(node => node.type === 'imageInput'), false);
  const result = instance.nodes.find(node => node.type === 'result');
  const generator = instance.nodes.find(node => node.type === 'generator');
  assert.equal(result.id, 'result_pair');
  assert.equal(result.data.resultType, 'generateImage');
  assert.deepEqual(result.data.imageUrls, ['https://cdn.example.com/legacy.png']);
  assert.equal(result.data.materialId, 'material_legacy');
  assert.equal(result.data.pairedGeneratorId, generator.id);
  assert.equal(generator.id, 'generator_pair');
  assert.equal(generator.hidden, true);
  assert.equal(generator.data.pairedResultId, result.id);
  assert.equal(generator.data.promptDraft, '保留商品颜色');
  assert.deepEqual(instance.pairs, [{
    resultId: result.id,
    generatorId: generator.id,
  }]);
});
