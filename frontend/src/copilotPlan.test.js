import test from 'node:test';
import assert from 'node:assert/strict';

import {
  copilotPlanNeedsConfirmation,
  getCopilotPlanLayout,
  normalizeCopilotPlan,
} from './copilotPlan.js';

test('normalizes a connected canvas plan', () => {
  const plan = normalizeCopilotPlan({
    summary: '创建内容链路',
    nodes: [
      { ref: 'copy', node_type: 'generateText', label: '文案', content: '正文' },
      { ref: 'image', node_type: 'generateImage', label: '配图', upstream_refs: ['copy'] },
    ],
  });

  assert.equal(plan.nodes.length, 2);
  assert.deepEqual(plan.nodes[1].upstreamRefs, ['copy']);
  assert.equal(getCopilotPlanLayout(plan).get('image').column, 1);
});

test('normalizing an already-normalized plan is idempotent', () => {
  const first = normalizeCopilotPlan({
    summary: '图片节点',
    nodes: [{
      ref: 'image',
      node_type: 'generateImage',
      label: '布偶猫图片',
      image_prompt: '写实摄影风格的布偶猫',
      upstream_refs: [],
      run: true,
    }],
  });

  assert.deepEqual(normalizeCopilotPlan(first), first);
});

test('rejects unsupported node types and duplicate refs', () => {
  assert.throws(() => normalizeCopilotPlan({
    nodes: [{ ref: 'x', node_type: 'unknown', label: '未知' }],
  }), /不支持/);
  assert.throws(() => normalizeCopilotPlan({
    nodes: [
      { ref: 'x', node_type: 'generateText', label: '一' },
      { ref: 'x', node_type: 'generateText', label: '二' },
    ],
  }), /重复/);
});

test('requires confirmation for running or large plans', () => {
  const running = normalizeCopilotPlan({
    nodes: [{ ref: 'x', node_type: 'generateText', label: '文案', run: true }],
  });
  assert.equal(copilotPlanNeedsConfirmation(running), true);

  const small = normalizeCopilotPlan({
    nodes: [{ ref: 'x', node_type: 'generateText', label: '文案' }],
  });
  assert.equal(copilotPlanNeedsConfirmation(small), false);
  assert.equal(copilotPlanNeedsConfirmation(small, true), true);
});

test('rejects cyclic upstream relationships before changing the canvas', () => {
  const cyclic = normalizeCopilotPlan({
    nodes: [
      { ref: 'a', node_type: 'generateText', label: 'A', upstream_refs: ['b'] },
      { ref: 'b', node_type: 'generateText', label: 'B', upstream_refs: ['a'] },
    ],
  });

  assert.throws(() => getCopilotPlanLayout(cyclic), /循环连接/);
});
