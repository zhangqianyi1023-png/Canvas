export const COPILOT_MAX_ATTACHMENTS = 6;
export const COPILOT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const COPILOT_MAX_TEXT_BYTES = 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
]);

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'html', 'htm', 'css',
  'js', 'jsx', 'ts', 'tsx', 'py', 'yaml', 'yml', 'xml', 'log',
]);

const extensionOf = name => String(name || '').split('.').pop()?.toLowerCase() || '';

export function getCopilotAttachmentKind(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/')) return 'text';
  return TEXT_EXTENSIONS.has(extensionOf(file?.name)) ? 'text' : '';
}

export function getCopilotFileValidationError(file, currentCount = 0) {
  if (currentCount >= COPILOT_MAX_ATTACHMENTS) return `最多添加 ${COPILOT_MAX_ATTACHMENTS} 个文件`;
  const kind = getCopilotAttachmentKind(file);
  if (!kind) return '暂时支持图片和文本文件';
  const size = Number(file?.size) || 0;
  if (kind === 'image' && size > COPILOT_MAX_IMAGE_BYTES) return '单张图片不能超过 8MB';
  if (kind === 'text' && size > COPILOT_MAX_TEXT_BYTES) return '单个文本文件不能超过 1MB';
  return '';
}

export function formatCopilotAttachmentSize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
