import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCopilotNodeTarget,
  buildCopilotNodeTargets,
  getCopilotSelectedNodeIds,
} from './copilotNodeTargets.js';

test('builds an editable text target from a visible result and its hidden generator', () => {
  const result = {
    id: 'result_1',
    type: 'result',
    data: { label: '产品文案', resultType: 'generateText', result: '原始正文', pairedGeneratorId: 'generator_1' },
  };
  const generator = {
    id: 'generator_1',
    type: 'generator',
    data: { generatorType: 'generateText', user_prompt: '原始提示词' },
  };

  const target = buildCopilotNodeTarget(result, generator);

  assert.equal(target.kind, 'text');
  assert.equal(target.content, '原始正文');
  assert.equal(target.prompt, '原始提示词');
  assert.equal(target.canEditContent, true);
  assert.equal(target.canEditPrompt, true);
  assert.ok(target.revision);
});

test('builds image thumbnails and ignores hidden generator targets', () => {
  const result = {
    id: 'result_image',
    type: 'result',
    data: {
      label: '主视觉',
      resultType: 'generateImage',
      imageUrls: ['/one.png', '/two.png'],
      coverIndex: 1,
      pairedGeneratorId: 'generator_image',
    },
  };
  const generator = {
    id: 'generator_image',
    type: 'generator',
    data: { generatorType: 'generateImage', image_prompt: '产品摄影' },
  };

  const targets = buildCopilotNodeTargets(
    [result, generator],
    ['generator_image', 'result_image'],
    { result_image: 'generator_image' },
  );

  assert.equal(targets.length, 1);
  assert.equal(targets[0].thumbnailUrl, '/two.png');
  assert.equal(targets[0].prompt, '产品摄影');
  assert.equal(targets[0].canEditContent, false);
});

test('Copilot references mirror the current canvas selection', () => {
  const selectionA = [
    { id: 'a', type: 'result', selected: true },
    { id: 'b', type: 'result', selected: false },
  ];
  const selectionB = [
    { id: 'a', type: 'result', selected: false },
    { id: 'b', type: 'result', selected: true },
  ];

  assert.deepEqual(getCopilotSelectedNodeIds(selectionA), ['a']);
  assert.deepEqual(getCopilotSelectedNodeIds(selectionB), ['b']);
  assert.deepEqual(getCopilotSelectedNodeIds([{ id: 'hidden', type: 'generator', selected: true }]), []);
});
