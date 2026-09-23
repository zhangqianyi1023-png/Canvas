import { CANVAS_OPERATIONS } from './canvasNodeContract.js';

const ACTIONS = [
  { id: 'annotate', operation: 'agent', label: '标注', nodeTypes: ['image'], implemented: true },
  { id: 'crop', operation: 'crop', label: '裁剪', nodeTypes: ['image'], implemented: true },
  { id: 'perspective', operation: 'perspective', label: '角度控制', nodeTypes: ['image'], implemented: true },
  { id: 'inpaint', operation: 'inpaint', label: '局部修改', nodeTypes: ['image'], implemented: true },
  { id: 'lighting', operation: 'enhance', label: '打光', nodeTypes: ['image'], implemented: true },
  { id: 'outpaint', operation: 'outpaint', label: '扩图', nodeTypes: ['image'], implemented: true },
  { id: 'enhance', operation: 'enhance', label: '增强', nodeTypes: ['image'], implemented: true },
  { id: 'resize', operation: 'crop', label: '调整像素', nodeTypes: ['image'], implemented: true },
  { id: 'cutout', operation: 'cutout', label: '抠图', nodeTypes: ['image'], implemented: true },
  { id: 'gridSplit', operation: 'crop', label: '宫格拆分', nodeTypes: ['image'], implemented: true },
  { id: 'seedanceCompliance', operation: 'agent', label: 'Seedance2.0 合规认证', nodeTypes: ['image'], implemented: true },
  { id: 'rotate', operation: 'crop', label: '旋转', nodeTypes: ['image'], implemented: true },
  { id: 'erase', operation: 'erase', label: '擦除', nodeTypes: ['image'], implemented: true },
  { id: 'split', operation: 'split', label: '快速切分', nodeTypes: ['image'], implemented: true },
  { id: 'trim', operation: 'trim', label: '裁剪片段', nodeTypes: ['video'], implemented: true },
  { id: 'capture-frame', operation: 'capture-frame', label: '截取画面', nodeTypes: ['video'], implemented: true },
  { id: 'playlist', operation: 'playlist', label: '创建播放列表', nodeTypes: ['video'], implemented: false },
  { id: 'download', operation: 'create', label: '下载', nodeTypes: ['image', 'video', 'audio'], implemented: true },
  { id: 'save-to-library', operation: 'create', label: '保存到素材库', nodeTypes: ['image', 'video', 'audio', 'text'], implemented: true },
];

const ACTION_BY_ID = new Map(ACTIONS.map(action => [action.id, action]));
const OPERATION_SET = new Set(CANVAS_OPERATIONS);

export const getCanvasToolbarAction = (id) => ACTION_BY_ID.get(id) || null;

export const listCanvasToolbarActions = ({
  nodeType,
  implementedOnly = false,
  availableOperations = CANVAS_OPERATIONS,
} = {}) => {
  const allowedOperations = new Set(availableOperations.filter(operation => OPERATION_SET.has(operation)));
  return ACTIONS.filter(action => (
    (!nodeType || action.nodeTypes.includes(nodeType))
    && (!implementedOnly || action.implemented)
    && allowedOperations.has(action.operation)
  ));
};

export const isCanvasToolbarActionImplemented = (id) => Boolean(
  getCanvasToolbarAction(id)?.implemented,
);
