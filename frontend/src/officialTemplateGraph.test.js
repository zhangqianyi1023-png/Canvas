import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOfficialTemplateSnapshot,
  findOpenCanvasPosition,
  instantiateOfficialTemplate,
} from './officialTemplateGraph.js';

const sourceNodes = [
  {
    id: 'result_1',
    type: 'result',
    position: { x: 100, y: 80 },
    style: { width: 260, height: 200 },
    data: {
      resultType: 'generateImage',
      imageUrls: ['/uploads/result.png'],
      pairedGeneratorId: 'generator_1',
      onDeleteNode() {},
    },
  },
  {
    id: 'generator_1',
    type: 'generator',
    hidden: true,
    position: { x: 100, y: 320 },
    data: {
      pairedResultId: 'result_1',
      promptDraft: '商品主图',
      apiConfigs: [{ secret: true }],
    },
  },
  {
    id: 'text_1',
    type: 'result',
    position: { x: 460, y: 100 },
    style: { width: 260, height: 180 },
    data: { resultType: 'text', text: '示例文案' },
  },
];

const sourceEdges = [{
  id: 'edge_1',
  source: 'result_1',
  target: 'text_1',
  selected: true,
}];

const tokenFactory = (tokens) => () => tokens.shift() || `extra_${tokens.length}`;

test('official template project copy rewrites ids without adding a group', () => {
  const snapshot = createOfficialTemplateSnapshot({
    templateId: 'template_1',
    versionId: 'version_1',
    nodes: sourceNodes,
    edges: sourceEdges,
    viewport: { x: 10, y: 20, zoom: 0.8 },
    pairMap: { result_1: 'generator_1' },
  });
  const project = instantiateOfficialTemplate(snapshot, {
    mode: 'project',
    tokenFactory: tokenFactory(['pair', 'text', 'edge']),
    sourceTemplateId: 'template_1',
    sourceTemplateVersion: 'version_1',
  });

  assert.equal(project.group, null);
  assert.equal(project.nodes.some(node => node.type === 'group'), false);
  assert.notEqual(project.nodes[0].id, sourceNodes[0].id);
  assert.deepEqual(project.viewport, snapshot.viewport);
  assert.equal(project.sourceTemplateId, 'template_1');
  assert.equal(project.sourceTemplateVersion, 'version_1');
  assert.equal(snapshot.nodes[0].id, 'result_1');
});

test('official template canvas insertion wraps copied nodes in a selected group', () => {
  const snapshot = createOfficialTemplateSnapshot({
    templateId: 'template_1',
    nodes: sourceNodes,
    edges: sourceEdges,
    pairMap: { result_1: 'generator_1' },
  });
  const inserted = instantiateOfficialTemplate(snapshot, {
    mode: 'group',
    position: { x: 800, y: 500 },
    tokenFactory: tokenFactory(['group', 'pair', 'text', 'edge']),
  });

  assert.equal(inserted.group.id, 'group_group');
  assert.equal(inserted.group.selected, true);
  assert.ok(inserted.nodes
    .filter(node => node.type !== 'generator')
    .every(node => node.parentNode === inserted.group.id));
  assert.ok(inserted.edges.every(edge => edge.id !== 'edge_1'));
});

test('official template copy rewrites result-generator pairs together', () => {
  const snapshot = createOfficialTemplateSnapshot({
    nodes: sourceNodes,
    edges: sourceEdges,
    pairMap: { result_1: 'generator_1' },
  });
  const instance = instantiateOfficialTemplate(snapshot, {
    mode: 'project',
    tokenFactory: tokenFactory(['pair', 'text', 'edge']),
  });

  const result = instance.nodes.find(node => node.type === 'result' && node.data?.resultType === 'generateImage');
  const generator = instance.nodes.find(node => node.type === 'generator');
  assert.equal(result.data.pairedGeneratorId, generator.id);
  assert.equal(generator.data.pairedResultId, result.id);
  assert.equal(instance.pairMap[result.id], generator.id);
});

test('official snapshot strips runtime callbacks and collects durable media', () => {
  const snapshot = createOfficialTemplateSnapshot({
    nodes: sourceNodes,
    edges: sourceEdges,
    pairMap: { result_1: 'generator_1' },
  });

  assert.equal(snapshot.nodes[0].data.onDeleteNode, undefined);
  assert.equal(snapshot.nodes[1].data.apiConfigs, undefined);
  assert.deepEqual(snapshot.mediaUrls, ['/uploads/result.png']);
});

test('findOpenCanvasPosition keeps a free preferred position and shifts away from collisions', () => {
  const preferred = { x: 500, y: 400 };
  assert.deepEqual(findOpenCanvasPosition({
    nodes: [],
    preferred,
    width: 300,
    height: 200,
  }), preferred);

  const shifted = findOpenCanvasPosition({
    nodes: [{
      id: 'existing',
      type: 'result',
      position: { x: 350, y: 300 },
      style: { width: 300, height: 200 },
    }],
    preferred,
    width: 300,
    height: 200,
    gap: 80,
  });
  assert.notDeepEqual(shifted, preferred);
});
