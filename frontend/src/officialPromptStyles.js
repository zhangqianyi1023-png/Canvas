import { API_BASE } from './apiBase.js';

const readField = (value, camel, snake, fallback) => (
  value?.[camel] ?? value?.[snake] ?? fallback
);

export const normalizePromptStyle = (style) => {
  if (!style) return null;
  return {
    ...style,
    category: readField(style, 'category', 'category', ''),
    coverUrl: readField(style, 'coverUrl', 'cover_url', ''),
    sortOrder: readField(style, 'sortOrder', 'sort_order', 0),
    enabled: style.enabled !== false,
    prompt: style.prompt || '',
  };
};

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

export async function listPublicPromptStyles({ category = '', fetchImpl = fetch } = {}) {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const payload = await requestJson(`/api/prompt-styles${query}`, {}, fetchImpl);
  return (payload.styles || []).map(normalizePromptStyle).filter(Boolean);
}

export function appendPromptStyleToText(text, style) {
  const current = String(text || '').trim();
  const stylePrompt = String(style?.prompt || '').trim();
  if (!stylePrompt) return current;
  const block = `风格参考：\n${stylePrompt}`;
  if (!current) return block;
  if (current.includes(stylePrompt)) return current;
  return `${current}\n\n${block}`;
}
