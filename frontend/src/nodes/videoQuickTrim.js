import {
  MIN_VIDEO_EDITOR_CLIP_DURATION,
  createClipFromSource,
} from '../videoEditorModel.js';

export const QUICK_TRIM_DEFAULT_DURATION = 5.85;
export const QUICK_TRIM_FILMSTRIP_COUNT = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFiniteNumber = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

export function normalizeQuickTrimRange(range, sourceDuration) {
  const duration = Math.max(0, Number(sourceDuration) || 0);
  if (duration <= 0) return { start: 0, end: 0, duration: 0 };

  const minimum = Math.min(MIN_VIDEO_EDITOR_CLIP_DURATION, duration);
  const fallbackEnd = Math.min(duration, QUICK_TRIM_DEFAULT_DURATION);
  const requestedStart = Number(range?.sourceStart ?? range?.trimStart ?? range?.start);
  const requestedEnd = Number(range?.sourceEnd ?? range?.trimEnd ?? range?.end);
  const start = clamp(Number.isFinite(requestedStart) ? requestedStart : 0, 0, Math.max(0, duration - minimum));
  const end = clamp(Number.isFinite(requestedEnd) ? requestedEnd : fallbackEnd, start + minimum, duration);

  return {
    start,
    end,
    duration: Math.max(0, end - start),
  };
}

export function resolveQuickTrimPointerRange({
  mode,
  clientX,
  originX,
  trackWidth,
  initialRange,
  sourceDuration,
}) {
  const duration = Math.max(0, Number(sourceDuration) || 0);
  const width = Math.max(1, Number(trackWidth) || 1);
  const initial = normalizeQuickTrimRange(initialRange, duration);
  const minimum = Math.min(MIN_VIDEO_EDITOR_CLIP_DURATION, duration);
  const delta = ((Number(clientX) - Number(originX)) / width) * duration;

  if (mode === 'start') {
    return normalizeQuickTrimRange({
      start: clamp(initial.start + delta, 0, Math.max(0, initial.end - minimum)),
      end: initial.end,
    }, duration);
  }

  if (mode === 'end') {
    return normalizeQuickTrimRange({
      start: initial.start,
      end: clamp(initial.end + delta, initial.start + minimum, duration),
    }, duration);
  }

  const selectionDuration = initial.duration;
  const start = clamp(initial.start + delta, 0, Math.max(0, duration - selectionDuration));
  return normalizeQuickTrimRange({ start, end: start + selectionDuration }, duration);
}

export function resolveQuickTrimKeyboardRange({
  mode,
  key,
  shiftKey = false,
  initialRange,
  sourceDuration,
}) {
  const duration = Math.max(0, Number(sourceDuration) || 0);
  const initial = normalizeQuickTrimRange(initialRange, duration);
  const minimum = Math.min(MIN_VIDEO_EDITOR_CLIP_DURATION, duration);

  if (key === 'Home') {
    if (mode === 'end') {
      return normalizeQuickTrimRange({ start: initial.start, end: initial.start + minimum }, duration);
    }
    if (mode === 'start') {
      return normalizeQuickTrimRange({ start: 0, end: initial.end }, duration);
    }
    return normalizeQuickTrimRange({ start: 0, end: initial.duration }, duration);
  }

  if (key === 'End') {
    if (mode === 'start') {
      return normalizeQuickTrimRange({ start: initial.end - minimum, end: initial.end }, duration);
    }
    if (mode === 'end') {
      return normalizeQuickTrimRange({ start: initial.start, end: duration }, duration);
    }
    return normalizeQuickTrimRange({ start: duration - initial.duration, end: duration }, duration);
  }

  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return initial;
  const direction = key === 'ArrowLeft' ? -1 : 1;
  const step = shiftKey ? 1 : 0.1;
  return resolveQuickTrimPointerRange({
    mode,
    clientX: direction * step,
    originX: 0,
    trackWidth: Math.max(duration, 1),
    initialRange: initial,
    sourceDuration: duration,
  });
}

export function createQuickTrimClip({
  sourceNodeId,
  sourceUrl,
  sourceDuration,
  aspectRatio,
  range,
}) {
  const normalizedRange = normalizeQuickTrimRange(range, sourceDuration);
  const sourceClip = createClipFromSource({
    id: sourceNodeId,
    url: sourceUrl,
    type: 'video',
    name: '快速裁剪片段',
    sourceDuration,
    aspectRatio,
  });
  const trimmedClip = {
    ...sourceClip,
    start: 0,
    inPoint: normalizedRange.start,
    duration: normalizedRange.duration,
  };

  return {
    ...trimmedClip,
    start: 0,
    sourceStart: normalizedRange.start,
    sourceEnd: normalizedRange.end,
    trimStart: normalizedRange.start,
    trimEnd: normalizedRange.end,
    quickTrim: true,
  };
}

export function createQuickTrimContract({
  sourceNodeId,
  sourceUrl,
  sourceDuration,
  aspectRatio,
  range,
  clip,
}) {
  const resolvedDuration = Math.max(0, toFiniteNumber(
    sourceDuration ?? clip?.sourceDuration ?? range?.sourceDuration,
    0,
  ));
  const normalizedRange = normalizeQuickTrimRange(range, resolvedDuration);
  const resolvedClip = clip || createQuickTrimClip({
    sourceNodeId,
    sourceUrl,
    sourceDuration: resolvedDuration,
    aspectRatio,
    range: normalizedRange,
  });

  return {
    sourceUrl: String(sourceUrl || resolvedClip?.sourceUrl || ''),
    sourceDuration: resolvedDuration,
    sourceStart: normalizedRange.start,
    sourceEnd: normalizedRange.end,
    trimStart: normalizedRange.start,
    trimEnd: normalizedRange.end,
    start: normalizedRange.start,
    end: normalizedRange.end,
    duration: normalizedRange.duration,
    quickTrim: true,
    clip: {
      ...resolvedClip,
      sourceDuration: resolvedDuration,
      sourceStart: normalizedRange.start,
      sourceEnd: normalizedRange.end,
      trimStart: normalizedRange.start,
      trimEnd: normalizedRange.end,
      inPoint: normalizedRange.start,
      duration: normalizedRange.duration,
      quickTrim: true,
    },
  };
}

export function normalizeQuickTrimContract(value, sourceUrl = '') {
  if (!value || typeof value !== 'object') return null;
  const sourceDuration = Math.max(0, toFiniteNumber(value.sourceDuration ?? value.clip?.sourceDuration, 0));
  if (sourceDuration <= 0) return null;
  return createQuickTrimContract({
    sourceNodeId: value.clip?.sourceId || '',
    sourceUrl: sourceUrl || value.sourceUrl || value.clip?.sourceUrl || '',
    sourceDuration,
    aspectRatio: value.clip?.aspectRatio,
    range: value,
    clip: value.clip,
  });
}

export function buildVideoQuickTrimContracts(videoUrls = [], quickTrims = {}) {
  return (Array.isArray(videoUrls) ? videoUrls : [])
    .map((sourceUrl) => {
      const contract = normalizeQuickTrimContract(quickTrims?.[sourceUrl], sourceUrl);
      return contract ? {
        sourceUrl: contract.sourceUrl,
        sourceDuration: contract.sourceDuration,
        sourceStart: contract.sourceStart,
        sourceEnd: contract.sourceEnd,
        trimStart: contract.trimStart,
        trimEnd: contract.trimEnd,
        duration: contract.duration,
        quickTrim: true,
      } : null;
    })
    .filter(Boolean);
}

export function applyQuickTrimToEditorSource(source = {}, quickTrim) {
  const contract = normalizeQuickTrimContract(quickTrim, source.url || source.sourceUrl || '');
  if (!contract) return source;
  return {
    ...source,
    sourceDuration: contract.sourceDuration,
    sourceStart: contract.sourceStart,
    sourceEnd: contract.sourceEnd,
    trimStart: contract.trimStart,
    trimEnd: contract.trimEnd,
    inPoint: contract.sourceStart,
    duration: contract.duration,
    quickTrim: true,
  };
}

const QUICK_TRIM_COMPARE_FIELDS = [
  'sourceUrl',
  'sourceDuration',
  'sourceStart',
  'sourceEnd',
  'trimStart',
  'trimEnd',
  'start',
  'end',
  'duration',
  'quickTrim',
];

function areQuickTrimValuesEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (!QUICK_TRIM_COMPARE_FIELDS.every(field => left[field] === right[field])) return false;
  const leftClip = left.clip;
  const rightClip = right.clip;
  if (leftClip === rightClip) return true;
  if (!leftClip || !rightClip) return false;
  return ['sourceId', 'sourceUrl', 'sourceDuration', 'sourceStart', 'sourceEnd', 'trimStart', 'trimEnd', 'inPoint', 'duration', 'quickTrim']
    .every(field => leftClip[field] === rightClip[field]);
}

export function areQuickTrimMapsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => Object.hasOwn(right, key) && areQuickTrimValuesEqual(left[key], right[key]));
}

export function buildQuickTrimFrameTimes(sourceDuration, count = QUICK_TRIM_FILMSTRIP_COUNT) {
  const duration = Math.max(0, Number(sourceDuration) || 0);
  const total = Math.max(1, Math.floor(Number(count) || 1));
  if (duration <= 0) return Array.from({ length: total }, () => 0);
  if (total === 1) return [Math.min(duration / 2, Math.max(0, duration - 0.01))];
  const lastFrameTime = Math.max(0, duration - Math.min(0.05, duration / 100));
  return Array.from({ length: total }, (_, index) => (
    (lastFrameTime * index) / (total - 1)
  ));
}

export function formatQuickTrimDuration(value) {
  const duration = Math.max(0, Number(value) || 0);
  return `${duration.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}s`;
}
