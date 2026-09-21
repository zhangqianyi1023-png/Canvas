import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCopilotModelOptions, formatCopilotModelName } from './copilotModels.js';

test('formats configured model ids for the compact selector', () => {
  assert.equal(formatCopilotModelName('gpt-5.6-luna'), 'GPT 5.6 Luna');
  assert.equal(formatCopilotModelName('deepseek-r1-250528'), 'DeepSeek R1 250528');
});

test('lists enabled models first and keeps disabled models visible as unavailable', () => {
  const options = buildCopilotModelOptions({
    activeProviderId: 'disabled-provider',
    providers: [
      {
        id: 'disabled-provider',
        name: 'DeepSeek 服务',
        enabled: false,
        baseUrl: 'https://deepseek.example/v1',
        apiKey: 'key',
        defaultTextModel: 'deepseek-chat',
        textModels: ['deepseek-chat'],
      },
      {
        id: 'enabled-provider',
        name: '可用服务',
        enabled: true,
        baseUrl: 'https://example.test/v1',
        apiKey: 'key',
        defaultTextModel: 'gpt-5.6-luna',
        textModels: ['gpt-5.6-luna', 'gpt-5.6-sol'],
      },
    ],
  });

  assert.deepEqual(options.map(item => item.modelName), [
    'gpt-5.6-luna',
    'gpt-5.6-sol',
    'deepseek-chat',
  ]);
  assert.equal(options[0].available, true);
  assert.equal(options[2].available, false);
});
