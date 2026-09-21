import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAdminTemplate,
  listPublicTemplates,
  normalizeOfficialTemplate,
  publishAdminTemplate,
  saveAdminTemplateDraft,
} from './officialTemplates.js';

const jsonResponse = (payload, ok = true, status = 200) => ({
  ok,
  status,
  async json() { return payload; },
});

test('normalizes public template payloads', () => {
  const normalized = normalizeOfficialTemplate({
    id: 'template_1',
    name: '详情页',
    category_id: 'category_1',
    cover_url: '/uploads/cover.png',
    workflowData: { nodes: [], edges: [] },
  });
  assert.equal(normalized.categoryId, 'category_1');
  assert.equal(normalized.coverUrl, '/uploads/cover.png');
  assert.deepEqual(normalized.workflowData.nodes, []);
});

test('public template list uses the public endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ templates: [{ id: 'template_1', name: '模板' }] });
  };
  const result = await listPublicTemplates({ fetchImpl });
  assert.equal(calls[0].url.endsWith('/api/workflow-templates'), true);
  assert.equal(result[0].id, 'template_1');
});

test('admin template mutations send expected methods and bodies', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/publish')) {
      return jsonResponse({ success: true, version: { versionNumber: 1 } });
    }
    return jsonResponse({ id: 'template_1', ...JSON.parse(options.body || '{}') });
  };

  await createAdminTemplate({ name: '模板', categoryId: 'category_1' }, { fetchImpl });
  await saveAdminTemplateDraft('template_1', { nodes: [], edges: [] }, { fetchImpl });
  await publishAdminTemplate('template_1', { fetchImpl });

  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[2].url.endsWith('/api/admin/workflow-templates/template_1/publish'), true);
});
