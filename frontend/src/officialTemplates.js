import { API_BASE } from './apiBase.js';

const readField = (value, camel, snake, fallback) => (
  value?.[camel] ?? value?.[snake] ?? fallback
);

export const normalizeOfficialTemplate = (template) => {
  if (!template) return null;
  return {
    ...template,
    categoryId: readField(template, 'categoryId', 'category_id', ''),
    categoryName: readField(template, 'categoryName', 'category_name', ''),
    coverUrl: readField(template, 'coverUrl', 'cover_url', ''),
    sortOrder: readField(template, 'sortOrder', 'sort_order', 0),
    currentPublishedVersionId: readField(
      template,
      'currentPublishedVersionId',
      'current_version_id',
      null,
    ),
    currentVersionNumber: readField(
      template,
      'currentVersionNumber',
      'current_version_number',
      null,
    ),
    versionId: readField(template, 'versionId', 'version_id', template.versionId),
    versionNumber: readField(template, 'versionNumber', 'version_number', template.versionNumber),
    workflowData: template.workflowData || template.workflow_data || null,
  };
};

export const normalizeTemplateCategory = category => ({
  ...category,
  sortOrder: readField(category, 'sortOrder', 'sort_order', 0),
  enabled: category?.enabled !== false,
});

async function requestJson(path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

export async function listPublicTemplateCategories({ fetchImpl = fetch } = {}) {
  const payload = await requestJson('/api/template-categories', {}, fetchImpl);
  return (payload.categories || []).map(normalizeTemplateCategory);
}

export async function listPublicTemplates({
  categoryId = '',
  fetchImpl = fetch,
} = {}) {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  const payload = await requestJson(`/api/workflow-templates${query}`, {}, fetchImpl);
  return (payload.templates || []).map(normalizeOfficialTemplate);
}

export async function getPublicTemplate(templateId, { fetchImpl = fetch } = {}) {
  return normalizeOfficialTemplate(await requestJson(
    `/api/workflow-templates/${encodeURIComponent(templateId)}`,
    {},
    fetchImpl,
  ));
}

export async function listAdminTemplateCategories({ fetchImpl = fetch } = {}) {
  const payload = await requestJson('/api/admin/template-categories', {}, fetchImpl);
  return (payload.categories || []).map(normalizeTemplateCategory);
}

export async function createAdminTemplateCategory(data, { fetchImpl = fetch } = {}) {
  return normalizeTemplateCategory(await requestJson(
    '/api/admin/template-categories',
    { method: 'POST', body: JSON.stringify(data) },
    fetchImpl,
  ));
}

export async function updateAdminTemplateCategory(categoryId, data, { fetchImpl = fetch } = {}) {
  return normalizeTemplateCategory(await requestJson(
    `/api/admin/template-categories/${encodeURIComponent(categoryId)}`,
    { method: 'PUT', body: JSON.stringify(data) },
    fetchImpl,
  ));
}

export async function deleteAdminTemplateCategory(categoryId, { fetchImpl = fetch } = {}) {
  return requestJson(
    `/api/admin/template-categories/${encodeURIComponent(categoryId)}`,
    { method: 'DELETE' },
    fetchImpl,
  );
}

export async function listAdminTemplates({
  categoryId = '',
  status = '',
  fetchImpl = fetch,
} = {}) {
  const params = new URLSearchParams();
  if (categoryId) params.set('categoryId', categoryId);
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params}` : '';
  const payload = await requestJson(`/api/admin/workflow-templates${query}`, {}, fetchImpl);
  return (payload.templates || []).map(normalizeOfficialTemplate);
}

export async function getAdminTemplate(templateId, { fetchImpl = fetch } = {}) {
  const payload = await requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}`,
    {},
    fetchImpl,
  );
  return {
    ...normalizeOfficialTemplate(payload),
    draft: payload.draft,
    versions: payload.versions || [],
  };
}

export async function createAdminTemplate(data, { fetchImpl = fetch } = {}) {
  return normalizeOfficialTemplate(await requestJson(
    '/api/admin/workflow-templates',
    { method: 'POST', body: JSON.stringify(data) },
    fetchImpl,
  ));
}

export async function updateAdminTemplate(templateId, data, { fetchImpl = fetch } = {}) {
  return normalizeOfficialTemplate(await requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}`,
    { method: 'PUT', body: JSON.stringify(data) },
    fetchImpl,
  ));
}

export async function deleteAdminTemplate(templateId, { fetchImpl = fetch } = {}) {
  return requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
    fetchImpl,
  );
}

export async function getAdminTemplateDraft(templateId, { fetchImpl = fetch } = {}) {
  return requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}/draft`,
    {},
    fetchImpl,
  );
}

export async function saveAdminTemplateDraft(
  templateId,
  workflowData,
  { fetchImpl = fetch } = {},
) {
  return requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}/draft`,
    { method: 'PUT', body: JSON.stringify({ workflowData }) },
    fetchImpl,
  );
}

export async function listAdminTemplateVersions(templateId, { fetchImpl = fetch } = {}) {
  const payload = await requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}/versions`,
    {},
    fetchImpl,
  );
  return payload.versions || [];
}

export async function publishAdminTemplate(templateId, { fetchImpl = fetch } = {}) {
  return requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}/publish`,
    { method: 'POST' },
    fetchImpl,
  );
}

export async function unpublishAdminTemplate(templateId, { fetchImpl = fetch } = {}) {
  return requestJson(
    `/api/admin/workflow-templates/${encodeURIComponent(templateId)}/unpublish`,
    { method: 'POST' },
    fetchImpl,
  );
}
