import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWorkflowTemplateRunInputs,
  getWorkflowTemplateRunInputs,
} from './workflowTemplateRunner.js';
import { instantiateWorkflowTemplate } from './workflowTemplates.js';

const template = {
  id: 'template_runner_demo',
  name: '演示模板',
  group: {
    id: 'group_1',
    type: 'group',
    position: { x: 0, y: 0 },
    style: { width: 720, height: 420 },
    data: { label: '演示模板', childIds: ['result_text', 'result_image', 'result_output'] },
  },
  nodes: [
    {
      id: 'result_text',
      type: 'result',
      parentNode: 'group_1',
      position: { x: 20, y: 40 },
      data: {
        label: '文案',
        resultType: 'generateText',
        pairedGeneratorId: 'generator_text',
      },
    },
    {
      id: 'generator_text',
      type: 'generator',
      data: {
        generatorType: 'generateText',
        pairedResultId: 'result_text',
        user_prompt: '默认文案',
      },
    },
    {
      id: 'result_image',
      type: 'result',
      parentNode: 'group_1',
      position: { x: 20, y: 210 },
      data: {
        label: '商品图',
        resultType: 'generateImage',
        pairedGeneratorId: 'generator_image',
        imageSource: 'upload',
      },
    },
    {
      id: 'generator_image',
      type: 'generator',
      data: {
        generatorType: 'generateImage',
        pairedResultId: 'result_image',
      },
    },
    {
      id: 'result_output',
      type: 'result',
      parentNode: 'group_1',
      position: { x: 360, y: 120 },
      data: {
        label: '输出图',
        resultType: 'generateImage',
        pairedGeneratorId: 'generator_output',
      },
    },
    {
      id: 'generator_output',
      type: 'generator',
      data: {
        generatorType: 'generateImage',
        pairedResultId: 'result_output',
        image_prompt: '生成成品图',
      },
    },
  ],
  edges: [
    { id: 'edge_text_output', source: 'result_text', target: 'result_output' },
    { id: 'edge_image_output', source: 'result_image', target: 'result_output' },
  ],
  pairs: [
    { resultId: 'result_text', generatorId: 'generator_text' },
    { resultId: 'result_image', generatorId: 'generator_image' },
    { resultId: 'result_output', generatorId: 'generator_output' },
  ],
};

test('collects root manual text and image inputs from a workflow template', () => {
  const inputs = getWorkflowTemplateRunInputs(template);

  assert.deepEqual(inputs.map(input => [input.id, input.type, input.label]), [
    ['result_text', 'text', '文案'],
    ['result_image', 'image', '商品图'],
  ]);
  assert.equal(inputs[0].defaultValue, '默认文案');
});

test('applies run inputs to instantiated nodes and reports input node ids', () => {
  const inputs = getWorkflowTemplateRunInputs(template);
  const tokens = ['group', 'text', 'image', 'output', 'edge1', 'edge2'];
  const instance = instantiateWorkflowTemplate(template, {
    tokenFactory: () => tokens.shift() || 'extra',
  });
  const patched = applyWorkflowTemplateRunInputs(instance, inputs, {
    result_text: { text: '新的商品卖点' },
    result_image: { imageUrls: ['/uploads/product.png'] },
  });

  const textResult = patched.nodes.find(node => node.id === 'result_text');
  const textGenerator = patched.nodes.find(node => node.id === 'generator_text');
  const imageResult = patched.nodes.find(node => node.id === 'result_image');

  assert.equal(textResult.data.result, '新的商品卖点');
  assert.equal(textResult.data.resultText, '新的商品卖点');
  assert.equal(textGenerator.data.user_prompt, '新的商品卖点');
  assert.deepEqual(imageResult.data.imageUrls, ['/uploads/product.png']);
  assert.equal(imageResult.data.imageSource, 'upload');
  assert.deepEqual([...patched.inputNodeIds].sort(), ['result_image', 'result_text']);
  assert.deepEqual([...patched.inputGeneratorIds].sort(), ['generator_image', 'generator_text']);
});

test('extracts only root manual inputs from a branching workflow app graph', () => {
  const branchingTemplate = {
    ...template,
    id: 'branching_app_template',
    name: '分支应用',
    group: {
      ...template.group,
      data: {
        ...template.group.data,
        childIds: ['result_a', 'result_b', 'result_d', 'result_e', 'result_f'],
      },
    },
    nodes: [
      {
        id: 'result_a',
        type: 'result',
        parentNode: 'group_1',
        position: { x: 20, y: 40 },
        data: {
          label: 'A 文本',
          resultType: 'generateText',
          pairedGeneratorId: 'generator_a',
        },
      },
      {
        id: 'generator_a',
        type: 'generator',
        data: {
          generatorType: 'generateText',
          pairedResultId: 'result_a',
          user_prompt: '默认 A',
        },
      },
      {
        id: 'result_b',
        type: 'result',
        parentNode: 'group_1',
        position: { x: 220, y: 40 },
        data: {
          label: 'B 生成',
          resultType: 'generateText',
          pairedGeneratorId: 'generator_b',
        },
      },
      {
        id: 'generator_b',
        type: 'generator',
        data: {
          generatorType: 'generateText',
          pairedResultId: 'result_b',
          user_prompt: '基于 A 生成 B',
        },
      },
      {
        id: 'result_d',
        type: 'result',
        parentNode: 'group_1',
        position: { x: 20, y: 220 },
        data: {
          label: 'D 图片',
          resultType: 'generateImage',
          pairedGeneratorId: 'generator_d',
          imageSource: 'upload',
        },
      },
      {
        id: 'generator_d',
        type: 'generator',
        data: {
          generatorType: 'generateImage',
          pairedResultId: 'result_d',
        },
      },
      {
        id: 'result_e',
        type: 'result',
        parentNode: 'group_1',
        position: { x: 420, y: 120 },
        data: {
          label: 'E 汇总',
          resultType: 'generateImage',
          pairedGeneratorId: 'generator_e',
        },
      },
      {
        id: 'generator_e',
        type: 'generator',
        data: {
          generatorType: 'generateImage',
          pairedResultId: 'result_e',
        },
      },
      {
        id: 'result_f',
        type: 'result',
        parentNode: 'group_1',
        position: { x: 620, y: 120 },
        data: {
          label: 'F 输出',
          resultType: 'generateText',
          pairedGeneratorId: 'generator_f',
        },
      },
      {
        id: 'generator_f',
        type: 'generator',
        data: {
          generatorType: 'generateText',
          pairedResultId: 'result_f',
        },
      },
    ],
    edges: [
      { id: 'edge_a_b', source: 'result_a', target: 'result_b' },
      { id: 'edge_b_e', source: 'result_b', target: 'result_e' },
      { id: 'edge_d_e', source: 'result_d', target: 'result_e' },
      { id: 'edge_e_f', source: 'result_e', target: 'result_f' },
    ],
    pairs: [
      { resultId: 'result_a', generatorId: 'generator_a' },
      { resultId: 'result_b', generatorId: 'generator_b' },
      { resultId: 'result_d', generatorId: 'generator_d' },
      { resultId: 'result_e', generatorId: 'generator_e' },
      { resultId: 'result_f', generatorId: 'generator_f' },
    ],
  };

  const inputs = getWorkflowTemplateRunInputs(branchingTemplate);

  assert.deepEqual(inputs.map(input => [input.nodeId, input.type, input.label]), [
    ['result_a', 'text', 'A 文本'],
    ['result_d', 'image', 'D 图片'],
  ]);

  const tokens = ['group', 'a', 'b', 'd', 'e', 'f', 'edge1', 'edge2', 'edge3', 'edge4'];
  const instance = instantiateWorkflowTemplate(branchingTemplate, {
    tokenFactory: () => tokens.shift() || 'extra',
  });
  const patched = applyWorkflowTemplateRunInputs(instance, inputs, {
    result_a: { text: '用户填写 A' },
    result_d: { imageUrls: ['/uploads/d.png'] },
  });

  assert.deepEqual([...patched.inputNodeIds].sort(), ['result_a', 'result_d']);
  assert.deepEqual([...patched.inputGeneratorIds].sort(), ['generator_a', 'generator_d']);
  assert.equal(patched.nodes.find(node => node.id === 'result_a').data.resultText, '用户填写 A');
  assert.deepEqual(patched.nodes.find(node => node.id === 'result_d').data.imageUrls, ['/uploads/d.png']);
  assert.equal(patched.nodes.find(node => node.id === 'result_b').data.templateInputSource, undefined);
  assert.equal(patched.nodes.find(node => node.id === 'result_e').data.templateInputSource, undefined);
  assert.equal(patched.nodes.find(node => node.id === 'result_f').data.templateInputSource, undefined);
});
