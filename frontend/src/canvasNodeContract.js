/**
 * Stable, serializable metadata shared by every Canvas node.
 *
 * UI callbacks and provider-specific fields stay outside this contract. This
 * keeps the graph reusable for History, Stack, Templates, and Agent plans.
 */
export const CANVAS_NODE_CONTRACT_VERSION = 1;

export const CANVAS_OPERATIONS = Object.freeze([
  'create',
  'generate',
  'crop',
  'inpaint',
  'outpaint',
  'erase',
  'cutout',
  'enhance',
  'perspective',
  'split',
  'trim',
  'continue',
  'capture-frame',
  'playlist',
  'agent',
]);

export const CANVAS_NODE_STATUSES = Object.freeze([
  'idle',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const OPERATION_SET = new Set(CANVAS_OPERATIONS);
const STATUS_SET = new Set(CANVAS_NODE_STATUSES);

const uniqueStrings = (values = []) => [...new Set(
  values
    .map(value => String(value || '').trim())
    .filter(Boolean),
)];

const normalizeOperation = (operation, fallback = 'create') => {
  const value = String(operation || '').trim();
  return OPERATION_SET.has(value) ? value : fallback;
};

const normalizeStatus = (status, fallback = 'idle') => {
  const value = String(status || '').trim();
  return STATUS_SET.has(value) ? value : fallback;
};

export const getCanvasContract = (node) => {
  const contract = node?.data?.canvas;
  return {
    version: CANVAS_NODE_CONTRACT_VERSION,
    sourceNodeIds: uniqueStrings(contract?.sourceNodeIds || node?.data?.sourceNodeIds),
    operation: normalizeOperation(contract?.operation || node?.data?.operation),
    status: normalizeStatus(contract?.status || node?.data?.status),
    taskId: String(contract?.taskId || node?.data?.taskId || '').trim(),
    parentVersion: String(contract?.parentVersion || node?.data?.parentVersion || '').trim(),
    references: uniqueStrings(contract?.references || node?.data?.references),
    createdAt: contract?.createdAt || node?.data?.createdAt || null,
  };
};

export const withCanvasContract = (node, patch = {}) => {
  const current = getCanvasContract(node);
  const next = {
    ...current,
    ...patch,
    version: CANVAS_NODE_CONTRACT_VERSION,
    sourceNodeIds: uniqueStrings(patch.sourceNodeIds ?? current.sourceNodeIds),
    references: uniqueStrings(patch.references ?? current.references),
    operation: normalizeOperation(patch.operation ?? current.operation),
    status: normalizeStatus(patch.status ?? current.status),
    taskId: String(patch.taskId ?? current.taskId ?? '').trim(),
    parentVersion: String(patch.parentVersion ?? current.parentVersion ?? '').trim(),
  };

  return {
    ...node,
    data: {
      ...(node?.data || {}),
      canvas: next,
    },
  };
};

export const createCanvasOperation = ({
  operation = 'create',
  sourceNodeIds = [],
  references = [],
  input = {},
  outputType = '',
  taskId = '',
  parentVersion = '',
  createdAt = new Date().toISOString(),
} = {}) => ({
  version: CANVAS_NODE_CONTRACT_VERSION,
  operation: normalizeOperation(operation),
  sourceNodeIds: uniqueStrings(sourceNodeIds),
  references: uniqueStrings(references),
  input,
  outputType: String(outputType || '').trim(),
  taskId: String(taskId || '').trim(),
  parentVersion: String(parentVersion || '').trim(),
  createdAt,
});

