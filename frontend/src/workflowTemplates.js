import { migrateLegacyPromptTemplate } from './textNodeMigration.js';
import { migrateLegacyImageGraph } from './imageNodeModel.js';

const RUNNING_STATUSES = new Set([
  'analyzing',
  'creating',
  'generating',
  'running',
  'waiting',
  'failed',
  'error',
  'canceled',
  'partial_error',
]);

const MEDIA_KEY_RE = /(image|video|media|cover|thumbnail)/i;
const MEDIA_URL_RE = /^(?:https?:\/\/|\/uploads\/|data:(?:image\/(?:png|jpe?g|webp|gif|avif)|video\/(?:mp4|quicktime|webm)))/i;
const TRANSIENT_PROVIDER_FRAME_RE = /^https?:\/\/upload\.apib\.ai\/f\/video\/.*\.(?:png|jpe?g|webp)(?:[?#].*)?$/i;

const makeTokenFactory = () => {
  let counter = 0;
  return () => `${Date.now()}_${counter++}_${Math.random().toString(16).slice(2)}`;
};

const migrateLegacyImageTemplate = (template) => {
  if (!template?.group || !Array.isArray(template.nodes)) return template;
  const legacyImageIds = new Set(
    template.nodes
      .filter(node => node?.type === 'imageInput')
      .map(node => node.id),
  );
  if (legacyImageIds.size === 0) return template;

  const migrated = migrateLegacyImageGraph(
    [template.group, ...template.nodes],
    template.edges || [],
  );

  const group = migrated.nodes.find(node => node.id === template.group.id) || template.group;
  const generatorIds = new Set(
    migrated.nodes
      .filter(node => node?.type === 'generator')
      .map(node => node.id),
  );
  const explicitPairs = migrated.nodes
    .filter(node => (
      node?.type === 'result'
      && legacyImageIds.has(node.id)
      && typeof node.data?.pairedGeneratorId === 'string'
      && generatorIds.has(node.data.pairedGeneratorId)
    ))
    .map(node => ({
      resultId: node.id,
      generatorId: node.data.pairedGeneratorId,
    }));
  const pairKeys = new Set();
  const pairs = [...(template.pairs || []), ...explicitPairs].filter(pair => {
    const key = `${pair.resultId}:${pair.generatorId}`;
    if (pairKeys.has(key)) return false;
    pairKeys.add(key);
    return true;
  });

  return {
    ...template,
    group,
    nodes: migrated.nodes.filter(node => node.id !== group.id),
    edges: migrated.edges,
    pairs,
  };
};

export const stripRuntimeNodeData = (node) => {
  const {
    onImagesChange,
    onVideosChange,
    onImageAction,
    onDeleteNode,
    onGenerate,
    setGenerating,
    onGeneratorDataChange,
    onRunTextGeneration,
    onRunImageGeneration,
    onRunVideoGeneration,
    onCancelGeneration,
    onPromptDraftChange,
    onResultTextChange,
    onInteractiveDragCreate,
    onStoryboardCardUpdate,
    onStoryboardPromptUpdate,
    onResultCardUpdate,
    onResultDataChange,
    onResultExpandStateChange,
    onStoryboardCardClickPlaceholder,
    onCardPlaceholderClick,
    onUngroup,
    onSaveTemplate,
    onNodeResize,
    onImageAspectChange,
    onVideoAspectChange,
    onImageEditorStateChange,
    onResultMediaAspectChange,
    onOpenVideoEditor,
    onCreateVideoFromShot,
    onCreateVideoEditorFromAssembler,
    onCreateImageNodes,
    onRun,
    onDataChange,
    onGroupResize,
    onGroupNameChange,
    apiConfigs,
    apiProviders,
    generationTask,
    lastGenerationError,
    ...data
  } = node.data || {};

  void onImagesChange;
  void onVideosChange;
  void onImageAction;
  void onDeleteNode;
  void onGenerate;
  void setGenerating;
  void onGeneratorDataChange;
  void onRunTextGeneration;
  void onRunImageGeneration;
  void onRunVideoGeneration;
  void onCancelGeneration;
  void onPromptDraftChange;
  void onResultTextChange;
  void onInteractiveDragCreate;
  void onStoryboardCardUpdate;
  void onStoryboardPromptUpdate;
  void onResultCardUpdate;
  void onResultDataChange;
  void onResultExpandStateChange;
  void onStoryboardCardClickPlaceholder;
  void onCardPlaceholderClick;
  void onUngroup;
  void onSaveTemplate;
  void onNodeResize;
  void onImageAspectChange;
  void onVideoAspectChange;
  void onImageEditorStateChange;
  void onResultMediaAspectChange;
  void onOpenVideoEditor;
  void onCreateVideoFromShot;
  void onCreateVideoEditorFromAssembler;
  void onCreateImageNodes;
  void onRun;
  void onDataChange;
  void onGroupResize;
  void onGroupNameChange;
  void apiConfigs;
  void apiProviders;
  void generationTask;
  void lastGenerationError;

  const nextData = {
    ...data,
    generating: false,
    smartSplitStatus: '',
    errorMessage: '',
  };
  if (RUNNING_STATUSES.has(nextData.status)) {
    nextData.status = 'idle';
    nextData.statusLabel = '未运行';
  }

  return {
    ...node,
    selected: false,
    dragging: false,
    data: nextData,
  };
};

export const collectTemplateMediaUrls = (value, key = '', output = new Set(), seen = new WeakSet()) => {
  if (typeof value === 'string') {
    if (MEDIA_KEY_RE.test(key) && MEDIA_URL_RE.test(value)) output.add(value);
    return output;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectTemplateMediaUrls(item, key, output, seen));
    return output;
  }
  Object.entries(value).forEach(([childKey, child]) => {
    collectTemplateMediaUrls(child, childKey, output, seen);
  });
  return output;
};

export const replaceTemplateMediaUrls = (value, replacements, seen = new WeakMap()) => {
  if (typeof value === 'string') return replacements[value]?.url || replacements[value] || value;
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result = value.map(item => replaceTemplateMediaUrls(item, replacements, seen));
    seen.set(value, result);
    return result;
  }
  const result = {};
  seen.set(value, result);
  Object.entries(value).forEach(([key, child]) => {
    result[key] = replaceTemplateMediaUrls(child, replacements, seen);
  });
  return result;
};

export const removeTransientProviderFrames = (value, seen = new WeakMap()) => {
  if (typeof value === 'string') {
    return TRANSIENT_PROVIDER_FRAME_RE.test(value) ? '' : value;
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result = value
      .map(item => removeTransientProviderFrames(item, seen))
      .filter(item => item !== '');
    seen.set(value, result);
    return result;
  }
  const result = {};
  seen.set(value, result);
  Object.entries(value).forEach(([key, child]) => {
    result[key] = removeTransientProviderFrames(child, seen);
  });
  return result;
};

export function createWorkflowTemplateSnapshot({
  groupId,
  nodes,
  edges,
  pairMap = {},
  name,
  description = '',
  id,
  now = new Date().toISOString(),
}) {
  const group = nodes.find(node => node.id === groupId && node.type === 'group');
  if (!group) throw new Error('找不到要保存的组合');

  const children = nodes.filter(node => node.parentNode === groupId && node.type !== 'generator');
  if (children.length === 0) throw new Error('空组合不能保存为模板');

  const childIds = new Set(children.map(node => node.id));
  const pairs = [];
  const generatorIds = new Set();
  children.forEach(node => {
    if (node.type !== 'result') return;
    const generatorId = pairMap[node.id] || node.id.replace('result_', 'generator_');
    const generator = nodes.find(item => item.id === generatorId && item.type === 'generator');
    if (!generator) return;
    generatorIds.add(generator.id);
    pairs.push({ resultId: node.id, generatorId: generator.id });
  });

  const serialNodes = [...children, ...nodes.filter(node => generatorIds.has(node.id))]
    .map(node => removeTransientProviderFrames(stripRuntimeNodeData(node)));
  const serialGroup = removeTransientProviderFrames(stripRuntimeNodeData({
    ...group,
    data: {
      ...group.data,
      childIds: children.map(node => node.id),
    },
  }));
  const internalEdges = edges
    .filter(edge => childIds.has(edge.source) && childIds.has(edge.target))
    .map(edge => ({ ...edge, selected: false }));
  const snapshot = {
    id: id || `workflow_template_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: (name || group.data?.label || '未命名模板').trim(),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    group: serialGroup,
    nodes: serialNodes,
    edges: internalEdges,
    pairs,
    assetIds: [],
  };
  snapshot.mediaUrls = [...collectTemplateMediaUrls(snapshot)];
  return snapshot;
}

export function instantiateWorkflowTemplate(template, {
  position,
  tokenFactory = makeTokenFactory(),
} = {}) {
  template = normalizeWorkflowTemplate(template);
  if (!template?.group || !Array.isArray(template.nodes)) {
    throw new Error('模板数据不完整');
  }

  const idMap = new Map();
  const pairByResult = new Map((template.pairs || []).map(pair => [pair.resultId, pair]));
  const pairByGenerator = new Map((template.pairs || []).map(pair => [pair.generatorId, pair]));
  const pairedGeneratorIds = new Set((template.pairs || []).map(pair => pair.generatorId));

  idMap.set(template.group.id, `group_${tokenFactory()}`);
  (template.pairs || []).forEach(pair => {
    const token = tokenFactory();
    idMap.set(pair.resultId, `result_${token}`);
    idMap.set(pair.generatorId, `generator_${token}`);
  });
  template.nodes.forEach(node => {
    if (idMap.has(node.id) || pairedGeneratorIds.has(node.id)) return;
    if (pairByResult.has(node.id)) return;
    idMap.set(node.id, `${node.type || 'node'}_${tokenFactory()}`);
  });
  pairedGeneratorIds.forEach(generatorId => {
    if (!idMap.has(generatorId)) idMap.set(generatorId, `generator_${tokenFactory()}`);
  });

  const originalGroupPosition = template.group.position || { x: 0, y: 0 };
  const groupWidth = Number.parseFloat(template.group.style?.width) || 260;
  const groupHeight = Number.parseFloat(template.group.style?.height) || 180;
  const groupPosition = position
    ? { x: position.x - groupWidth / 2, y: position.y - groupHeight / 2 }
    : { ...originalGroupPosition };
  const offset = {
    x: groupPosition.x - originalGroupPosition.x,
    y: groupPosition.y - originalGroupPosition.y,
  };

  const groupId = idMap.get(template.group.id);
  const group = {
    ...stripRuntimeNodeData(template.group),
    id: groupId,
    position: groupPosition,
    selected: true,
    data: {
      ...stripRuntimeNodeData(template.group).data,
      childIds: (template.group.data?.childIds || []).map(id => idMap.get(id)).filter(Boolean),
    },
  };
  const nodes = template.nodes.map(node => {
    const cloned = stripRuntimeNodeData(node);
    const isChild = node.parentNode === template.group.id;
    const resultPair = pairByResult.get(node.id);
    const generatorPair = pairByGenerator.get(node.id);
    const data = {
      ...cloned.data,
      ...(resultPair || typeof cloned.data?.pairedGeneratorId === 'string'
        ? {
            pairedGeneratorId: idMap.get(
              resultPair?.generatorId || cloned.data.pairedGeneratorId,
            ) || cloned.data.pairedGeneratorId,
          }
        : {}),
      ...(generatorPair || typeof cloned.data?.pairedResultId === 'string'
        ? {
            pairedResultId: idMap.get(
              generatorPair?.resultId || cloned.data.pairedResultId,
            ) || cloned.data.pairedResultId,
          }
        : {}),
    };
    return {
      ...cloned,
      id: idMap.get(node.id),
      parentNode: isChild ? groupId : undefined,
      position: isChild
        ? { ...node.position }
        : {
            x: (node.position?.x || 0) + offset.x,
            y: (node.position?.y || 0) + offset.y,
          },
      data,
      selected: false,
    };
  });
  const edges = (template.edges || []).map(edge => ({
    ...edge,
    id: `edge_${tokenFactory()}`,
    source: idMap.get(edge.source),
    target: idMap.get(edge.target),
    selected: false,
  })).filter(edge => edge.source && edge.target);
  const pairs = (template.pairs || []).map(pair => ({
    resultId: idMap.get(pair.resultId),
    generatorId: idMap.get(pair.generatorId),
  })).filter(pair => pair.resultId && pair.generatorId);

  return { group, nodes, edges, pairs, idMap: Object.fromEntries(idMap) };
}

export function normalizeWorkflowTemplate(template) {
  return migrateLegacyImageTemplate(migrateLegacyPromptTemplate(template));
}
