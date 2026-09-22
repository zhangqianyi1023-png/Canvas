import { API_BASE } from './apiBase.js';

const uniqueUrls = (values = []) => [...new Set((values || []).filter(Boolean))];

function getApiOrigin() {
  const base = String(API_BASE || '').trim();
  if (base) {
    try {
      return new URL(base).origin;
    } catch {
      // Relative API_BASE means same-origin.
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

function getBasePath() {
  const base = String(import.meta.env?.BASE_URL || '').trim();
  if (base && base !== '/') return `/${base.replace(/^\/+|\/+$/g, '')}`;
  const pathname = typeof window !== 'undefined' ? String(window.location?.pathname || '') : '';
  const segment = pathname.split('/').filter(Boolean)[0] || '';
  return segment ? `/${segment}` : '';
}

export function isCanvasServerUrl(value) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (url.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/uploads/')) return false;
    if (typeof window === 'undefined' || !window.location?.origin) return true;
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function getCanvasServerUrls(values = []) {
  return uniqueUrls(values).filter(isCanvasServerUrl);
}

export function preferCanvasServerUrls(values = []) {
  const urls = uniqueUrls(values);
  const serverUrls = getCanvasServerUrls(urls);
  return serverUrls.length > 0 ? serverUrls : urls;
}

export function getTaskMediaAddresses(task = {}) {
  return {
    sourceUrls: uniqueUrls(task.source_urls || []),
    serverUrls: getCanvasServerUrls(task.server_urls || []),
  };
}

export function getTaskSourceToServerEntries(task = {}) {
  const { sourceUrls, serverUrls } = getTaskMediaAddresses(task);
  const entries = [];

  (task.media_records || []).forEach((record) => {
    const sourceUrl = record?.source_url;
    const serverUrl = record?.server_url;
    if (sourceUrl && isCanvasServerUrl(serverUrl)) entries.push([sourceUrl, serverUrl]);
  });

  sourceUrls.forEach((sourceUrl, index) => {
    const serverUrl = serverUrls[index];
    if (sourceUrl && serverUrl) entries.push([sourceUrl, serverUrl]);
  });

  const seen = new Set();
  return entries.filter(([sourceUrl, serverUrl]) => {
    const key = `${sourceUrl}\n${serverUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getTaskRenderableUrls(task = {}) {
  const { sourceUrls, serverUrls } = getTaskMediaAddresses(task);
  return serverUrls.length > 0 ? serverUrls : sourceUrls;
}

export function toDisplayMediaUrl(value) {
  if (!value) return '';
  if (!value.startsWith('/')) return value;
  const origin = getApiOrigin();
  const path = value.startsWith('/uploads/') ? `${getBasePath()}${value}` : value;
  return origin ? `${origin}${path}` : path;
}
