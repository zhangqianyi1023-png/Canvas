import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCopilotEditsToNodes,
  copilotEditPlanNeedsConfirmation,
  normalizeCopilotEditPlan,
} from './copilotEdits.js';

const nodes = [
  {
    id: 'result_1',
    type: 'result',
    data: {
      label: '原名称',
      resultType: 'generateText',
      result: '原正文',
      promptDraft: '原提示词',
      pairedGeneratorId: 'generator_1',
    },
  },
  {
    id: 'generator_1',
    type: 'generator',
    hidden: true,
    data: { generatorType: 'generateText', promptDraft: '原提示词', user_prompt: '原提示词' },
  },
];

test('normalizes and applies controlled Copilot edits to visible and hidden paired nodes', () => {
  const plan = normalizeCopilotEditPlan({
    summary: '精简文案',
    edits: [
      { node_id: 'result_1', operation: 'replace_text', value: '新正文' },
      { node_id: 'result_1', operation: 'update_prompt', value: '新提示词' },
    ],
  });
  const applied = applyCopilotEditsToNodes(nodes, plan, { result_1: 'generator_1' });

  assert.equal(applied.nodes[0].data.result, '新正文');
  assert.equal(applied.nodes[0].data.promptDraft, '新提示词');
  assert.equal(applied.nodes[1].data.user_prompt, '新提示词');
  assert.equal(applied.inversePlan.edits.length, 2);
  assert.equal(copilotEditPlanNeedsConfirmation(plan), true);
});

test('a single reversible edit does not require confirmation', () => {
  const plan = normalizeCopilotEditPlan({
    edits: [{ nodeId: 'result_1', operation: 'rename', value: '新名称' }],
  });
  assert.equal(copilotEditPlanNeedsConfirmation(plan), false);
});

test('rejects unsupported target mutations', () => {
  assert.throws(() => applyCopilotEditsToNodes(nodes, {
    edits: [{ node_id: 'result_1', operation: 'unknown', value: 'x' }],
  }, { result_1: 'generator_1' }), /不支持/);

  assert.throws(() => applyCopilotEditsToNodes([
    { id: 'result_image', type: 'result', data: { label: '图片', resultType: 'generateImage' } },
  ], {
    edits: [{ node_id: 'result_image', operation: 'replace_text', value: 'x' }],
  }), /不是可直接改写/);
});

