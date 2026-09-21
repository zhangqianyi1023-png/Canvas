export const ACTIVE_TASK_STATUSES = new Set(['running', 'saving']);
export const TERMINAL_TASK_STATUSES = new Set([
  'completed',
  'success',
  'partial_error',
  'failed',
  'error',
  'query_failed',
  'save_failed',
  'cancelled',
  'canceled',
]);

export function normalizeTimingStatus(status = '') {
  return String(status || '').toLowerCase();
}

export function isTaskActive(status = '') {
  return ACTIVE_TASK_STATUSES.has(normalizeTimingStatus(status));
}

export function isTaskTerminal(status = '') {
  return TERMINAL_TASK_STATUSES.has(normalizeTimingStatus(status));
}

const toFiniteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function getTaskDurationSeconds(task = {}, nowMs = Date.now()) {
  if (!task || typeof task !== 'object') return null;
  const status = normalizeTimingStatus(task.status);
  const frozenDuration = toFiniteNumber(task.duration_seconds ?? task.durationSeconds);
  if (isTaskTerminal(status) && frozenDuration !== null) {
    return Math.max(0, Math.round(frozenDuration));
  }

  const createdAt = toFiniteNumber(task.created_at ?? task.createdAt);
  if (createdAt === null) return null;

  const finishedAt = toFiniteNumber(task.finished_at ?? task.finishedAt);
  if (isTaskTerminal(status)) {
    if (finishedAt === null) return null;
    return Math.max(0, Math.round(finishedAt - createdAt));
  }

  if (isTaskActive(status)) {
    return Math.max(0, Math.floor((nowMs - createdAt * 1000) / 1000));
  }

  return null;
}

export function formatTaskDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}秒`;
  return `${minutes}分${String(remainingSeconds).padStart(2, '0')}秒`;
}

export function getTaskDurationLabel(task = {}, nowMs = Date.now()) {
  const seconds = getTaskDurationSeconds(task, nowMs);
  if (seconds === null) return '';
  return `${isTaskActive(task.status) ? '已运行' : '已处理'} ${formatTaskDuration(seconds)}`;
}

export function buildGenerationTaskTiming(tasks = []) {
  const normalizedTasks = (Array.isArray(tasks) ? tasks : [])
    .filter(task => task && typeof task === 'object');
  if (normalizedTasks.length === 0) return {};

  const createdAtValues = normalizedTasks
    .map(task => toFiniteNumber(task.created_at ?? task.createdAt))
    .filter(value => value !== null);
  const finishedAtValues = normalizedTasks
    .map(task => toFiniteNumber(task.finished_at ?? task.finishedAt))
    .filter(value => value !== null);
  const durationValues = normalizedTasks
    .map(task => toFiniteNumber(task.duration_seconds ?? task.durationSeconds))
    .filter(value => value !== null);
  const activeTasks = normalizedTasks.filter(task => isTaskActive(task.status));

  const timing = {};
  if (createdAtValues.length > 0) {
    timing.created_at = Math.min(...createdAtValues);
  }
  if (activeTasks.length === 0 && finishedAtValues.length > 0) {
    timing.finished_at = Math.max(...finishedAtValues);
  }
  if (activeTasks.length === 0 && timing.created_at !== undefined && timing.finished_at !== undefined) {
    timing.duration_seconds = Math.max(0, Math.round(timing.finished_at - timing.created_at));
  } else if (activeTasks.length === 0 && durationValues.length > 0) {
    timing.duration_seconds = Math.max(...durationValues);
  }
  return timing;
}
