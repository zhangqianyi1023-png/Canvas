import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateLegacyPromptGraph,
  migrateLegacyPromptProject,
  migrateLegacyPromptTemplate,
} from './textNodeMigration.js';

const legacyPrompt = {
  id: 'prompt_1',
  type: 'prompt',
  parentNode: 'group_1',
  position: { x: 24, y: 60 },
  style: { width: 240, height: 170 },
  selected: true,
  data: { label: '文本素材', defaultText: '保留这段提示词' },
};

test('legacy prompt becomes an editable generate-text result and paired generator', () => {
  const migrated = migrateLegacyPromptGraph(
    [
      {
        id: 'group_1',
        type: 'group',
        data: { childIds: ['prompt_1', 'image_1'] },
      },
      legacyPrompt,
      { id: 'image_1', type: 'imageInput', position: { x: 300, y: 60 }, data: {} },
    ],
    [{ id: 'edge_1', source: 'prompt_1', target: 'image_1' }],
  );

  const result = migrated.nodes.find(node => node.id === 'result_prompt_1');
  const generator = migrated.nodes.find(node => node.id === 'generator_prompt_1');
  const group = migrated.nodes.find(node => node.id === 'group_1');

  assert.equal(migrated.nodes.some(node => node.type === 'prompt'), false);
  assert.equal(result.type, 'result');
  assert.equal(result.data.resultType, 'generateText');
  assert.equal(result.data.textSource, 'manual');
  assert.equal(result.data.label, '文本');
  assert.equal(result.data.result, '保留这段提示词');
  assert.equal(result.parentNode, 'group_1');
  assert.equal(result.selected, true);
  assert.equal(generator.type, 'generator');
  assert.equal(generator.hidden, true);
  assert.deepEqual(group.data.childIds, ['result_prompt_1', 'image_1']);
  assert.equal(migrated.edges[0].source, result.id);
  assert.deepEqual(migrated.pairs, [{
    resultId: result.id,
    generatorId: generator.id,
  }]);
});

test('project migration preserves unrelated data and is idempotent', () => {
  const project = {
    id: 'project_1',
    name: '历史项目',
    nodes: [legacyPrompt],
    edges: [],
  };
  const migrated = migrateLegacyPromptProject(project);
  const migratedAgain = migrateLegacyPromptProject(migrated);

  assert.equal(migrated.name, project.name);
  assert.equal(migrated.nodes.length, 2);
  assert.strictEqual(migratedAgain, migrated);
});

test('existing generate-text results preserve their custom title', () => {
  const project = {
    id: 'project_2',
    nodes: [{
      id: 'result_2',
      type: 'result',
      position: { x: 0, y: 0 },
      data: { label: '生成文本', resultType: 'generateText', result: '内容' },
    }],
    edges: [],
  };
  const migrated = migrateLegacyPromptProject(project);

  assert.equal(migrated.nodes[0].data.label, '生成文本');
  assert.equal(migrated.nodes[0].data.result, '内容');
  assert.strictEqual(migrated, project);
});

test('template migration updates group children, edges, and result-generator pairs', () => {
  const template = {
    id: 'template_1',
    group: {
      id: 'group_1',
      type: 'group',
      data: { childIds: ['prompt_1'] },
    },
    nodes: [legacyPrompt],
    edges: [{ id: 'edge_1', source: 'prompt_1', target: 'prompt_1' }],
    pairs: [],
  };
  const migrated = migrateLegacyPromptTemplate(template);

  assert.deepEqual(migrated.group.data.childIds, ['result_prompt_1']);
  assert.equal(migrated.nodes.some(node => node.type === 'prompt'), false);
  assert.equal(migrated.edges[0].source, 'result_prompt_1');
  assert.equal(migrated.edges[0].target, 'result_prompt_1');
  assert.deepEqual(migrated.pairs, [{
    resultId: 'result_prompt_1',
    generatorId: 'generator_prompt_1',
  }]);
});
