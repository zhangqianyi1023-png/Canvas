export const TEXT_FORMAT_COLORS = [
  '#f4f4f5',
  '#b7b7bc',
  '#77787f',
  '#A78BFA',
  '#22c55e',
  '#fcbb00',
  '#f87171',
  '#c07eff',
];

export const DEFAULT_TEXT_FORMAT_STATE = {
  block: 'p',
  bold: false,
  italic: false,
  list: null,
  color: TEXT_FORMAT_COLORS[0],
};

const HEADING_RE = /^(#{1,6})\s+/;
const UL_RE = /^(\s*)[-*+]\s+/;
const OL_RE = /^(\s*)\d+[.)]\s+/;
const COLOR_OPEN_RE = /\{color=(#[0-9a-fA-F]{3,8})\}/g;

const clampSelection = (value, selectionStart, selectionEnd) => {
  const length = value.length;
  const start = Math.max(0, Math.min(Number(selectionStart) || 0, length));
  const end = Math.max(start, Math.min(Number(selectionEnd) || start, length));
  return { start, end };
};

const replaceRange = (value, start, end, replacement, selectStart, selectEnd) => ({
  value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
  selectionStart: start + selectStart,
  selectionEnd: start + selectEnd,
});

const getSelectedLineRange = (value, selectionStart, selectionEnd) => {
  const { start, end } = clampSelection(value, selectionStart, selectionEnd);
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;
  return { start, end, lineStart, lineEnd };
};

const stripBlockPrefix = (line) => (
  line
    .replace(HEADING_RE, '')
    .replace(UL_RE, '$1')
    .replace(OL_RE, '$1')
);

const applyBlock = (value, selectionStart, selectionEnd, block) => {
  const { start, end, lineStart, lineEnd } = getSelectedLineRange(value, selectionStart, selectionEnd);
  const prefix = block === 'p' ? '' : `${'#'.repeat(Number(block.slice(1)))} `;
  const selectedLines = value.slice(lineStart, lineEnd).split('\n');
  const replacement = selectedLines
    .map(line => {
      const stripped = stripBlockPrefix(line);
      return stripped.trim() ? `${prefix}${stripped}` : prefix.trimEnd();
    })
    .join('\n');
  const deltaStart = lineStart <= start ? prefix.length : 0;
  return replaceRange(
    value,
    lineStart,
    lineEnd,
    replacement,
    Math.max(0, start - lineStart + deltaStart),
    Math.max(0, end - lineStart + deltaStart),
  );
};

const applyList = (value, selectionStart, selectionEnd, listType) => {
  const { start, end, lineStart, lineEnd } = getSelectedLineRange(value, selectionStart, selectionEnd);
  const selectedLines = value.slice(lineStart, lineEnd).split('\n');
  const targetRe = listType === 'ul' ? UL_RE : OL_RE;
  const allTargetList = selectedLines.every(line => !line.trim() || targetRe.test(line));
  const replacement = selectedLines
    .map((line, index) => {
      if (!line.trim()) return line;
      const indent = line.match(/^(\s*)/)?.[1] || '';
      const stripped = stripBlockPrefix(line).trimStart();
      if (allTargetList) return `${indent}${stripped}`;
      return listType === 'ul' ? `${indent}- ${stripped}` : `${indent}${index + 1}. ${stripped}`;
    })
    .join('\n');
  return replaceRange(value, lineStart, lineEnd, replacement, start - lineStart, end - lineStart);
};

const applyWrap = (value, selectionStart, selectionEnd, marker, fallback) => {
  const { start, end } = clampSelection(value, selectionStart, selectionEnd);
  const selected = value.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const replacement = selected.slice(marker.length, selected.length - marker.length);
    return replaceRange(value, start, end, replacement, 0, replacement.length);
  }
  const content = selected || fallback;
  const replacement = `${marker}${content}${marker}`;
  const innerStart = marker.length;
  const innerEnd = marker.length + content.length;
  return replaceRange(value, start, end, replacement, innerStart, innerEnd);
};

const applyRule = (value, selectionStart, selectionEnd) => {
  const { start, end } = clampSelection(value, selectionStart, selectionEnd);
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const after = end < value.length ? '\n' : '';
  const replacement = `${before}---${after}`;
  return replaceRange(value, start, end, replacement, replacement.length, replacement.length);
};

const applyColor = (value, selectionStart, selectionEnd, color) => {
  const { start, end } = clampSelection(value, selectionStart, selectionEnd);
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : TEXT_FORMAT_COLORS[0];
  const selected = value.slice(start, end) || '彩色文本';
  const open = `{color=${safeColor}}`;
  const close = '{/color}';
  const replacement = `${open}${selected}${close}`;
  return replaceRange(value, start, end, replacement, open.length, open.length + selected.length);
};

export const getTextFormatState = (value, selectionStart = 0, selectionEnd = selectionStart) => {
  const { start, end, lineStart, lineEnd } = getSelectedLineRange(value || '', selectionStart, selectionEnd);
  const line = (value || '').slice(lineStart, lineEnd);
  const heading = line.match(HEADING_RE);
  const colorMatches = [...(value || '').slice(0, Math.max(start, end)).matchAll(COLOR_OPEN_RE)];
  return {
    ...DEFAULT_TEXT_FORMAT_STATE,
    block: heading ? `h${Math.min(3, heading[1].length)}` : 'p',
    list: UL_RE.test(line) ? 'ul' : OL_RE.test(line) ? 'ol' : null,
    bold: /\*\*[^*]+/.test(line.slice(0, Math.max(0, start - lineStart))) || /\*\*[^*]+\*\*/.test(line),
    italic: /(^|[^*])\*[^*]+/.test(line.slice(0, Math.max(0, start - lineStart))) || /(^|[^*])\*[^*]+\*/.test(line),
    color: colorMatches.at(-1)?.[1] || DEFAULT_TEXT_FORMAT_STATE.color,
  };
};

export function applyTextFormat(value, selectionStart, selectionEnd, action, payload = {}) {
  const text = String(value || '');
  if (action === 'h1' || action === 'h2' || action === 'h3' || action === 'p') {
    return applyBlock(text, selectionStart, selectionEnd, action);
  }
  if (action === 'bold') return applyWrap(text, selectionStart, selectionEnd, '**', '加粗文本');
  if (action === 'italic') return applyWrap(text, selectionStart, selectionEnd, '*', '斜体文本');
  if (action === 'ul' || action === 'ol') return applyList(text, selectionStart, selectionEnd, action);
  if (action === 'rule') return applyRule(text, selectionStart, selectionEnd);
  if (action === 'color') return applyColor(text, selectionStart, selectionEnd, payload.color);
  return {
    value: text,
    selectionStart: selectionStart || 0,
    selectionEnd: selectionEnd || selectionStart || 0,
  };
}
