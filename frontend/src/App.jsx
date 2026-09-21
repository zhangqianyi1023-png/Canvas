import { Fragment, useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as storage from './storage';
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStore,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';
import dagre from 'dagre';
import StoryboardImageGenerator from './components/StoryboardImageGenerator';
import CanvasMaterialDrawer from './components/CanvasMaterialDrawer';
import TaskCenterDrawer from './components/TaskCenterDrawer';
import CanvasBottomToolbar from './components/CanvasBottomToolbar';
import NodeSearchDialog from './components/NodeSearchDialog';
import CanvasHoverGlow from './components/CanvasHoverGlow';
import CanvasFlowHoverBorder from './components/CanvasFlowHoverBorder';
import CanvasDotGrid from './components/CanvasDotGrid';
import CanvasTemplateRunnerDrawer from './components/CanvasTemplateRunnerDrawer';
import CanvasZoomControls from './components/CanvasZoomControls';
import SelectionBoundsOverlay from './components/SelectionBoundsOverlay';
import SelectionToolbar from './components/SelectionToolbar';
import SaveWorkflowTemplateDialog from './components/SaveWorkflowTemplateDialog';
import OfficialTemplateEditor from './components/OfficialTemplateEditor';
import VideoEditorDialog from './components/VideoEditorDialog';
import VideoWorkbenchDialog from './components/VideoWorkbenchDialog';
import SettingsView from './components/SettingsView';

import VideoInputNode from './nodes/VideoInputNode';
import VideoEditorNode from './nodes/VideoEditorNode';
import RemovedNode from './nodes/RemovedNode';
import CharacterNode from './nodes/CharacterNode';
import ResultNode from './nodes/ResultNode';
import GeneratorNode from './nodes/GeneratorNode';
import SmartSplitterNode from './nodes/SmartSplitterNode';
import SmartSplitterProcessor from './nodes/SmartSplitterProcessor';
import StoryboardCardNode from './nodes/StoryboardCardNode';
import GroupNode from './nodes/GroupNode';
import StackNode from './nodes/StackNode';
import PlaylistNode from './nodes/PlaylistNode';
import ThreeDNode from './nodes/ThreeDNode';
import DeletableEdge from './nodes/DeletableEdge';
import { setEdgeDeleteHandler } from './edgeRegistry';
import ChatView from './ChatView';
import MaterialsView from './MaterialsView';
import Icon from './components/Icon';
import { publicAsset } from './publicAsset';
import {
  isSupportedImageFile,
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_LABEL,
} from './imageFormats';
import { uploadImageFile } from './uploadImage';
import {
  buildUploadedImageAssetMetadata,
  readLocalImageFileSize,
} from './imageFileMetadata';
import {
  isSupportedVideoFile,
  SUPPORTED_VIDEO_LABEL,
  SUPPORTED_VIDEO_ACCEPT,
} from './videoFormats';
import { uploadVideoFile } from './uploadVideo';
import { uploadAudioFile } from './uploadAudio';
import {
  isSupportedAudioFile,
  SUPPORTED_AUDIO_LABEL,
  SUPPORTED_AUDIO_ACCEPT,
} from './audioFormats';
import {
  buildHomeCreationRequest,
  buildHomeGeneratorOptions,
} from './homeReferenceImages';
import { parseJsonResponse } from './apiResponse';
import {
  isTaskCenterGroupAcceptedForNode,
  isTaskResultAcceptedForNode,
} from './taskAcceptance';
import { buildGenerationTaskTiming } from './taskTiming';
import {
  getCroppedNodeStyle,
  loadCropImage,
  normalizeFreeRotation,
  renderImageCrop,
  renderImageRotation,
} from './imageCrop';
import {
  formatStoryboardCardForPrompt,
  formatStoryboardResourcePackageForPrompt,
} from './storyboardUtils';
import { API_BASE } from './apiBase';
import {
  copilotPlanNeedsConfirmation,
  createCopilotSessionId,
  getCopilotPlanLayout,
  normalizeCopilotPlan,
} from './copilotPlan';
import {
  applyCopilotEditsToNodes,
  copilotEditPlanNeedsConfirmation,
  normalizeCopilotEditPlan,
} from './copilotEdits';
import {
  buildCopilotNodeTargets,
  getCopilotSelectedNodeIds,
} from './copilotNodeTargets';
import { buildCopilotModelOptions } from './copilotModels';
import { normalizeCopilotChoices } from './copilotChoices';
import CopilotComposer from './components/CopilotComposer';
import CopilotNodeReferences from './components/CopilotNodeReferences';
import { buildPromptWithImageMentions } from './imagePromptReferences';
import { buildImageInpaintPrompt } from './imageInpaintPrompt';
import { buildImagePerspectivePrompt } from './imagePerspectivePrompt';
import { mergeImageDimensions, normalizeImageDimensions } from './imageDimensions';
import { normalizeImageModelCapabilities } from './apimartModelSupport';
import { downloadMedia } from './imageDownload';
import { getLibraryProjectName } from './materialLibrary';
import {
  createWorkflowTemplateSnapshot,
  instantiateWorkflowTemplate,
  replaceTemplateMediaUrls,
  stripRuntimeNodeData,
} from './workflowTemplates';
import { createCanvasOperation } from './canvasNodeContract.js';
import { createCanvasStackGraph, unstackCanvasNodes } from './canvasStack.js';
import {
  applyWorkflowTemplateRunInputs,
  getWorkflowTemplateRunInputs,
} from './workflowTemplateRunner';
import {
  findOpenCanvasPosition,
  instantiateOfficialTemplate,
} from './officialTemplateGraph';
import {
  getPublicTemplate,
  listPublicTemplates,
} from './officialTemplates';
import {
  computeShiftNodeSelection,
  getSelectableSelectedNodeIds,
  isSelectableCanvasNode,
  resolveOptionDragSelectedNodeIds,
  shouldOpenResultComposer,
  shouldSuppressNodeSelectionTarget,
} from './nodeSelection';
import { listPublicPromptStyles } from './officialPromptStyles';
import {
  mergeSplitterInputs,
  normalizeImageList,
  normalizeModelList as normalizeSmartSplitterModelList,
  requestSplitDirections,
  getDefaultProviderModel,
  getEnabledProvidersWithModels,
  enforceImageRatioInPrompt,
  summarizePrompt,
} from './smartSplitter';
import {
  appendSmartSplitterBatch,
  getNextSmartSplitterBatchIndex,
} from './smartSplitterState';
import {
  buildSmartSplitterDirectionLaunches,
  normalizeSmartSplitterPhase,
} from './smartSplitterLifecycle';
import {
  migrateLegacyPromptGraph,
  migrateLegacyPromptProject,
  migrateLegacyPromptTemplate,
} from './textNodeMigration';
import { collectNodeRemovalIds } from './nodeRemoval';
import {
  appendImageResultImages,
  migrateLegacyImageGraph,
  normalizeImageResultData,
  replaceImageResultCover,
  restoreImageNodePairs,
} from './imageNodeModel';
import { mergeGeneratorComposerData } from './generatorComposerState';
import { buildPastedGeneratorDraft } from './copyPasteNodeData';
import {
  getConnectedImagesForNewGenerator,
  getResultCoverImageReference,
} from './generatorConnectionInputs';
import { resolveResultNodeLabel } from './resultNodeLabels';
import { PANE_CONTEXT_MENU } from './paneContextMenu';
import {
  getTaskMediaAddresses,
  getTaskRenderableUrls,
  getTaskSourceToServerEntries,
} from './taskMedia';
import {
  compactTimelineClips,
  createClipFromSource,
  createEmptyVideoEditorTimeline,
  createVideoEditorCanvasFromAspectRatio,
} from './videoEditorModel';
import {
  composeImageGenerationPrompt,
  mergeDefaultImageNegativePrompt,
  resolveImageNegativePrompt,
} from './imageNegativePrompt';
import { getDefaultImageRatioPresetId } from './imageRatioPresets';
import {
  CANVAS_WHEEL_LISTENER_OPTIONS,
  getCenteredZoomViewport,
  handOffWheelToCanvas,
  isBrowserZoomKeyboardEvent,
  zoomCanvasFromKeyboardEvent,
  zoomCanvasFromWheelEvent,
} from './canvasWheelHandoff';
import {
  areCharacterPayloadsEqual,
  buildCharacterPrompt,
  buildCharacterPayloadFromData,
} from './characterPayloadSync';
import {
  buildAvatarCertificationSubmitAssets,
  buildTalentPackageFromCharacterPayload,
  getCertifiedAvatarAssetsFromMaterial,
  getTalentPackageKey,
  getTalentPackageCertifiedAssetUrlsByType,
  getVideoRoleAssetsFromTalentPackage,
} from './talentPackage';

const imageRenderNodeCache = new WeakMap();
const genericRenderNodeCache = new WeakMap();

const getCachedRenderNode = (sourceNode, deps, buildRenderNode) => {
  const cached = genericRenderNodeCache.get(sourceNode);
  if (
    cached
    && cached.deps.length === deps.length
    && cached.deps.every((dep, index) => dep === deps[index])
  ) {
    return cached.renderNode;
  }
  const renderNode = buildRenderNode();
  genericRenderNodeCache.set(sourceNode, { deps, renderNode });
  return renderNode;
};

const DEFAULT_MAX_TEXT_TOKENS = 8192;

const normalizeMaxTextTokens = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TEXT_TOKENS;
  return Math.max(1024, Math.min(parsed, 32768));
};

const getProviderMaxTextTokens = (provider, fallback = DEFAULT_MAX_TEXT_TOKENS) => (
  normalizeMaxTextTokens(provider?.maxTextTokens ?? fallback)
);

const nodeTypes = {
  videoInput: VideoInputNode,
  videoEditor: VideoEditorNode,
  character: CharacterNode,
  product: RemovedNode,
  ecommerceVideoPlanner: RemovedNode,
  competitorVideo: RemovedNode,
  shotDirector: RemovedNode,
  videoAssembler: RemovedNode,
  result: ResultNode,
  generator: GeneratorNode,
  smartSplitter: SmartSplitterNode,
  storyboardCard: StoryboardCardNode,
  group: GroupNode,
  stack: StackNode,
  playlist: PlaylistNode,
  threeD: ThreeDNode,
};

const REMOVED_NODE_TYPES = new Set([
  'product',
  'ecommerceVideoPlanner',
  'competitorVideo',
  'shotDirector',
  'videoAssembler',
]);

const edgeTypes = {
  default: DeletableEdge,
};

const PROCESSOR_GAP_Y = 16;
const RESULT_FALLBACK_HEIGHT = 115;
const PROCESSOR_WIDTH = 600;
const GROUP_PADDING = 28;
const GROUP_LABEL_SPACE = 34;
const GROUP_FALLBACK_WIDTH = 260;
const CANVAS_HISTORY_LIMIT = 20;

const resolveUploadedImageNodeStyle = (imageSize, asset = {}) => {
  const width = imageSize?.width || asset.width;
  const height = imageSize?.height || asset.height;
  return width > 0 && height > 0
    ? getCroppedNodeStyle(width, height)
    : { width: 260, height: 195 };
};
const CANVAS_HISTORY_DEBOUNCE_MS = 220;
const CANVAS_MIN_ZOOM = 0.05;
const CANVAS_MAX_ZOOM = 8;
const CANVAS_MINIMAP_MIN_VIEWPORT_WIDTH = 1001;
const SELECTION_RUN_MAX_REFERENCE_IMAGES = 10;
const OPTION_DRAG_PREVIEW_REMOVE_SELECTOR = [
  '.image-action-toolbar',
  '.image-action-layer',
  '.node-hover-toolbar',
  '.node-hover-toolbar-anchor',
  '.node-hover-toolbar-portal',
  '.result-node-toolbar-layer',
  '.result-image-upload-input',
  '.canvas-node-resize-handle',
  '.canvas-node-resize-line',
  '.react-flow__handle',
  '.node-interactive-handle',
].join(', ');

const getCanvasNodeElement = (nodeId) => {
  if (!nodeId || typeof document === 'undefined') return null;
  return Array.from(document.querySelectorAll('.react-flow__node'))
    .find(element => element.getAttribute('data-id') === nodeId) || null;
};

const syncFormValuesForPreviewClone = (clone, original) => {
  const cloneFields = clone.querySelectorAll('input, textarea, select');
  const originalFields = original.querySelectorAll('input, textarea, select');
  cloneFields.forEach((field, index) => {
    const source = originalFields[index];
    if (!source) return;
    const tag = field.tagName?.toLowerCase();
    if (tag === 'textarea') {
      field.textContent = source.value || '';
      return;
    }
    if (tag === 'select') {
      Array.from(field.options || []).forEach((option) => {
        option.toggleAttribute('selected', option.value === source.value);
      });
      return;
    }
    if (source.type === 'checkbox' || source.type === 'radio') {
      field.toggleAttribute('checked', source.checked);
      return;
    }
    field.setAttribute('value', source.value || '');
  });
};

const createNodePreviewMarkup = (nodeElement) => {
  const clone = nodeElement.cloneNode(true);
  syncFormValuesForPreviewClone(clone, nodeElement);
  clone.querySelectorAll(OPTION_DRAG_PREVIEW_REMOVE_SELECTOR)
    .forEach(element => element.remove());
  clone.querySelectorAll('[contenteditable]')
    .forEach(element => element.removeAttribute('contenteditable'));
  clone.querySelectorAll('button, input, textarea, select')
    .forEach((element) => {
      element.setAttribute('disabled', '');
      element.setAttribute('tabindex', '-1');
    });
  clone.querySelectorAll('video')
    .forEach((video) => {
      video.removeAttribute('controls');
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
    });
  return clone.innerHTML;
};

const isEditableKeyTarget = (target) => {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .ProseMirror'));
};

const shouldSuppressNodeSelectionEvent = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  return shouldSuppressNodeSelectionTarget(target);
};

const getNodeIdFromSelectionEvent = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const nodeElement = target?.closest('.react-flow__node[data-id]');
  return nodeElement?.getAttribute('data-id') || null;
};

const getNodeHeight = (node) => (
  node?.measured?.height ||
  node?.style?.height ||
  node?.height ||
  node?.dimensions?.height ||
  RESULT_FALLBACK_HEIGHT
);

const getNodeWidth = (node) => (
  node?.measured?.width ||
  node?.style?.width ||
  node?.width ||
  node?.dimensions?.width ||
  GROUP_FALLBACK_WIDTH
);

const getRatioValue = (ratio) => {
  if (!ratio || ratio === 'auto' || !String(ratio).includes(':')) return null;
  const [w, h] = String(ratio).split(':').map(n => Number.parseFloat(n));
  if (!w || !h) return null;
  return w / h;
};

const getClosestRatioLabel = (ratio) => {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  const candidates = ['1:1', '3:4', '4:3', '9:16', '16:9', '2.35:1', '21:9'];
  return candidates.reduce((closest, label) => {
    const distance = Math.abs(getRatioValue(label) - ratio);
    return distance < closest.distance ? { label, distance } : closest;
  }, { label: '', distance: Number.POSITIVE_INFINITY }).label;
};

const getResultNodeOutput = (node) => {
  const resultType = node?.data?.resultType;
  if (resultType === 'generateImage') {
    return {
      texts: [],
      images: normalizeImageList([getResultCoverImageReference(node)]),
    };
  }

  if (resultType === 'generateVideo') {
    return {
      texts: [],
      images: [],
      videos: node.data?.videoUrl ? [node.data.videoUrl] : [],
    };
  }

  if (resultType === 'generateAudio') {
    return {
      texts: [],
      images: [],
      videos: [],
      audios: node.data?.audioUrl ? [node.data.audioUrl] : [],
    };
  }

  if (resultType === 'generateScript' || resultType === 'generateStoryboard' || resultType === 'generateStoryboardScript') {
    const cards = Array.isArray(node?.data?.storyboardCards) ? node.data.storyboardCards : [];
    const cardTexts = cards.map(formatStoryboardCardForPrompt);
    const resourcePackageText = formatStoryboardResourcePackageForPrompt(node?.data?.storyboardResourcePackage);
    return {
      texts: [resourcePackageText, node?.data?.storyboardVoiceoverScript ? `整条口播：\n${node.data.storyboardVoiceoverScript}` : '', node?.data?.result || '', ...cardTexts].filter(Boolean),
      images: cards.map(card => card.imageUrl).filter(Boolean),
      videos: [],
    };
  }

  return {
    texts: [node?.data?.result || ''].filter(Boolean),
    images: [],
    videos: [],
    audios: [],
  };
};

const getNodeOutputVideos = (node) => {
  if (!node) return [];
  if (node.type === 'videoInput') {
    return uniqueValues([
      ...(Array.isArray(node.data?.videoUrls) ? node.data.videoUrls : []),
      node.data?.videoUrl,
    ]);
  }
  if (node.type === 'videoEditor') {
    // 视频编辑器节点只输出合成后的成品视频，不向下游透传上游原始素材。
    return node.data?.videoUrl ? [node.data.videoUrl] : [];
  }
  if (node.type === 'result') {
    return getResultNodeOutput(node).videos || [];
  }
  return [];
};

const RUNNING_TASK_STATUSES = new Set(['running', 'pending', 'processing', 'queued', 'created', 'submitted', 'in_progress']);

const normalizeTaskStatus = (status = '') => {
  const value = String(status || '').toLowerCase();
  if (RUNNING_TASK_STATUSES.has(value)) return 'running';
  return value;
};

const waitForTaskPoll = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

async function fetchTaskStatus(taskId, apiBaseUrl, apiKey, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const externalSignal = options.signal;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs);
  const abortFromExternal = () => controller.abort('cancelled');
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const resp = await fetch(
      `${API_BASE}/api/task/${encodeURIComponent(taskId)}?api_base_url=${encodeURIComponent(apiBaseUrl)}&api_key=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal }
    );
    const body = await parseJsonResponse(resp, '状态查询失败');
    if (!body.success) {
      throw new Error(body.error || '状态查询失败');
    }
    return body.data || {};
  } catch (error) {
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      throw new Error('状态查询超时');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

async function pollImageTask(taskId, apiBaseUrl, apiKey, options = {}) {
  const config = typeof options === 'number' ? { maxDuration: options } : options;
  const maxDuration = Number.isFinite(config.maxDuration) ? config.maxDuration : null;
  const pollInterval = config.pollInterval || 5000;
  const signal = config.signal;
  const startedAt = Date.now();
  while (!signal?.aborted) {
    if (maxDuration !== null && Date.now() - startedAt >= maxDuration * 1000) {
      return { success: false, pending: true, status: 'running', error: '任务仍在生成中', task_id: taskId };
    }
    await waitForTaskPoll(pollInterval, signal);
    try {
      const task = await fetchTaskStatus(taskId, apiBaseUrl, apiKey, { signal });
      const status = normalizeTaskStatus(task.status);
      const renderableImages = getTaskRenderableUrls(task);
      const { serverUrls } = getTaskMediaAddresses(task);
      const canUseRenderableImages = status !== 'saving' || serverUrls.length > 0;
      if ((status === 'completed' || status === 'saving' || status === 'save_failed') && canUseRenderableImages && renderableImages.length > 0) {
        return {
          success: true,
          image_urls: renderableImages,
          task_id: taskId,
          task,
          ...(status === 'save_failed' ? {
            save_failed: true,
            warning: task.save_error || '结果已生成，但保存到服务器失败',
          } : {}),
        };
      }
      if (status === 'completed') {
        return {
          success: false,
          save_failed: true,
          error: '结果已生成，但尚未保存到服务器',
          task_id: taskId,
          task,
        };
      }
      if (status === 'save_failed') {
        return {
          success: false,
          save_failed: true,
          error: task.save_error || '结果已生成，但保存到服务器失败',
          task_id: taskId,
          task,
        };
      }
      if (status === 'failed') {
        return { success: false, error: task.error?.message || '任务失败', task_id: taskId, task };
      }
      if (status === 'query_failed') {
        return {
          success: false,
          query_failed: true,
          error: task.query_error || '状态查询失败',
          task_id: taskId,
          task,
        };
      }
      if (status === 'cancelled' || status === 'canceled') {
        return { success: false, cancelled: true, error: '任务已放弃', task_id: taskId, task };
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { success: false, cancelled: true, error: '任务已放弃', task_id: taskId };
      }
    }
  }
  return { success: false, cancelled: true, error: '任务已放弃', task_id: taskId };
}

const createGenerationRunId = (prefix = 'run') => (
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
);

const FEEDBACK_FORM_URL = 'https://my.feishu.cn/share/base/form/shrcnyGHeKx6oT8uiZyVxzjk7Bd?from=navigation';

function openFeedbackForm() {
  window.open(FEEDBACK_FORM_URL, '_blank', 'noopener,noreferrer');
}

const uniqueTaskIds = (values = []) => [...new Set((values || []).filter(Boolean))];

const TASK_CENTER_RUNNING_STATUSES = new Set(['running', 'saving']);
const TASK_CENTER_FAILURE_STATUSES = new Set(['failed', 'query_failed', 'error']);
const TASK_CENTER_CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const GENERATION_RUNNING_STATUSES = new Set(['running', 'saving']);

const getGenerationConfigStatus = (config = {}) => (
  String(config?.generationTask?.status || '').toLowerCase()
);

const getTaskErrorMessage = (task = {}) => {
  if (typeof task?.error === 'string' && task.error) return task.error;
  if (task?.error?.message) return task.error.message;
  if (task?.query_error) return task.query_error;
  if (task?.save_error) return task.save_error;
  if (task?.status === 'query_failed') return '状态查询失败';
  if (task?.status === 'save_failed') return '结果已生成，但保存到服务器失败';
  return '生成失败';
};

const reportTaskFailureToTaskCenter = (taskIds = [], {
  message = '生成失败',
  nodeId = '',
  projectId = '',
  runId = '',
  source = 'canvas',
} = {}) => {
  uniqueTaskIds(taskIds).forEach(taskId => {
    fetch(`${API_BASE}/api/task/${encodeURIComponent(taskId)}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: message,
        node_id: nodeId,
        project_id: projectId || '',
        run_id: runId || '',
        source,
      }),
    }).catch(error => {
      console.warn('[task-center-sync] 标记任务失败失败', taskId, error);
    });
  });
};

const isRunningGenerationNode = (node) => (
  Boolean(node?.data?.generating)
  || TASK_CENTER_RUNNING_STATUSES.has(node?.data?.generationTask?.status)
);

const MANUAL_COVER_PATCH_KEYS = new Set([
  'coverIndex',
  'imageUrl',
  'manualCoverRunId',
  'manualCoverUpdatedAt',
]);

const isManualCoverPatch = (patch) => (
  patch
  && Number.isInteger(patch.coverIndex)
  && Object.keys(patch).every(key => MANUAL_COVER_PATCH_KEYS.has(key))
);

const replaceImageResultAtIndex = (data = {}, nextUrl, imageIndex = 0) => {
  const normalized = normalizeImageResultData(data);
  const imageUrls = normalized.imageUrls.length > 0
    ? [...normalized.imageUrls]
    : [nextUrl];
  const safeIndex = Number.isInteger(imageIndex)
    && imageIndex >= 0
    && imageIndex < imageUrls.length
    ? imageIndex
    : normalized.coverIndex;
  imageUrls[safeIndex] = nextUrl;
  const coverIndex = normalized.coverIndex >= 0 && normalized.coverIndex < imageUrls.length
    ? normalized.coverIndex
    : 0;

  return {
    imageUrl: imageUrls[coverIndex] || nextUrl,
    imageUrls,
    coverIndex,
    replacedIndex: safeIndex,
  };
};

const getNodeGenerationRunId = (data = {}) => (
  data.currentRunId || data.generationTask?.runId || ''
);

const shouldPreserveManualCoverForRun = (data = {}, runId = '') => (
  Boolean(data.manualCoverRunId && runId && data.manualCoverRunId === runId)
);

const getProjectCoverImages = (project) => {
  const images = [];
  const addImages = (values) => {
    (values || []).forEach(value => {
      if (value && !images.includes(value)) images.push(value);
    });
  };

  const migratedGraph = migrateLegacyImageGraph(project?.nodes || [], project?.edges || []);
  migratedGraph.nodes.forEach(node => {
    if (node.type === 'result') {
      addImages(getResultNodeOutput(node).images);
    }
    if (node.type === 'storyboardCard') {
      addImages([node.data?.imageUrl]);
    }
  });

  return images.slice(0, 4);
};

const appendPrompt = (...values) => values
  .map(value => (value || '').trim())
  .filter(Boolean)
  .join('\n\n');

const uniqueValues = (values = []) => [...new Set((values || []).filter(Boolean))];
const VIDEO_GENERATION_MODE_OMNI = 'omni_reference';
const VIDEO_GENERATION_MODE_FIRST_LAST = 'first_last_frame';

function buildSeedanceMediaPrompt(prompt, { imageUrls = [], imageWithRoles = [], videoUrls = [] } = {}) {
  const orderedImages = uniqueValues([
    ...imageUrls,
    ...imageWithRoles.map(item => item?.url).filter(Boolean),
  ]);
  const orderedVideos = uniqueValues(videoUrls);
  if (orderedImages.length === 0 && orderedVideos.length === 0) return prompt;
  return [
    '参考素材编号（编号顺序与本次提交的媒体素材严格一致）：',
    ...orderedImages.map((_, index) => `- 图片${index + 1}：第${index + 1}张参考图片`),
    ...orderedVideos.map((_, index) => `- 视频${index + 1}：第${index + 1}段参考视频`),
    '请只使用“图片1”“视频1”这类编号引用素材，不要在提示词中复述素材地址。',
    prompt ? `用户提示词：\n${prompt}` : '',
  ].filter(Boolean).join('\n');
}

const getProviderModelsForType = (provider, type) => {
  if (type === 'text') return normalizeSmartSplitterModelList(provider?.textModels);
  if (type === 'image') return normalizeSmartSplitterModelList(provider?.imageModels);
  if (type === 'video') return normalizeSmartSplitterModelList(provider?.videoModels);
  return [];
};

const getGeneratorConnectedTextReferences = (data = {}) => {
  if (Array.isArray(data.connectedTextReferences)) {
    return data.connectedTextReferences.filter(Boolean);
  }
  return data.connectedPrompt ? [data.connectedPrompt] : [];
};

const getGeneratorReferenceImages = (data = {}) => {
  const connectedImages = uniqueValues(data.connectedImages || []);
  const uploadedImages = uniqueValues(data.uploadedReferenceImages || []);
  const visibleUploadedImages = uploadedImages.filter(src => src && !connectedImages.includes(src));
  return uniqueValues([...connectedImages, ...visibleUploadedImages]).slice(0, SELECTION_RUN_MAX_REFERENCE_IMAGES);
};

const getGeneratorReferenceVideos = (data = {}) => (
  uniqueValues(data.connectedVideos || [])
);

const WORKFLOW_TEXT_NODE_TYPES = new Set();
const getWorkflowNodeText = () => '';
const getWorkflowNodeImages = () => [];
const getWorkflowNodeVideos = () => [];

const getCharacterPayloadForNode = (node) => (
  node?.type === 'character' ? buildCharacterPayloadFromData(node.data || {}) : null
);

const getCharacterNodeText = (node) => (
  getCharacterPayloadForNode(node)?.characterPrompt || ''
);

const getCharacterNodeImages = (node) => {
  const payload = getCharacterPayloadForNode(node);
  if (!payload) return [];
  return normalizeImageList([
    payload.mainVisualImageUrl,
    payload.threeViewImageUrl,
    ...(Array.isArray(payload.images) ? payload.images : []),
    payload.imageUrl,
  ]);
};

const CHARACTER_NODE_WORKBENCH_WIDTH = 1240;

const buildCharacterImagePrompt = ({
  characterName = '',
  description = '',
  voiceDescription = '',
} = {}) => appendPrompt(
  characterName ? `角色名称：${characterName}` : '',
  description ? `角色描述：${description}` : '',
  voiceDescription ? `声音气质参考：${voiceDescription}` : '',
  [
    '生成一张可作为角色长期出镜基准的主视觉图。',
    '单人主体，五官清晰，发型、服装、年龄感和气质稳定。',
    '人物居中，正面或三分之二视角，背景干净，不要出现商品包装、品牌 Logo、字幕或多人物。',
  ].join('\n')
);

const buildCharacterThreeViewPrompt = ({
  characterName = '',
  description = '',
  mainVisualPrompt = '',
} = {}) => appendPrompt(
  characterName ? `角色名称：${characterName}` : '',
  description ? `角色描述：${description}` : '',
  mainVisualPrompt ? `主视觉提示词：${mainVisualPrompt}` : '',
  [
    '基于角色主图生成角色概念图板。',
    '画面必须是一张 16:9 横向角色概念图板。',
    '概念图板必须包含人物肖像的三视图：正面肖像、侧面肖像、背面肖像。',
    '概念图板必须包含整体人物的三视图：正面全身、侧面全身、背面全身，人物从头到脚完整可见。',
    '概念图板必须包含角色不同表情图，包括但不限于：常规、微笑、开心、难过、苦恼、哭泣；每个表情都保持同一张脸、同一发型和同一角色身份。',
    '如果角色有首饰或佩戴物，需要加入佩戴物特写镜头，包括但不限于项链、耳环、手表、手链、戒指、发饰、眼镜、包饰等。',
    '需要加入着装特写，包括上装、下装、鞋履、面料纹理、领口、袖口、腰带、图案或其他明显服装细节。',
    '所有视图和特写必须保持同一个角色的五官、发型、服装、体型、年龄感、气质和配饰一致。',
    '保持干净浅色背景和专业角色设定排版，可使用小标签区分“肖像三视图”“整体三视图”“佩戴物特写”“着装特写”；不要生成额外无关人物、不要裁切全身、不要商品包装、品牌 Logo、字幕或水印。',
  ].join('\n')
);

const isLikelyThreeViewCharacterPrompt = (prompt = '') => {
  const text = String(prompt || '');
  if (!text.trim()) return false;
  const hasConceptIntent = text.includes('角色概念图') || text.includes('概念图板');
  const hasThreeViewIntent = text.includes('三视图')
    || text.toLowerCase().includes('turnaround')
    || text.toLowerCase().includes('three-view');
  const hasRequiredViews = text.includes('正面') && text.includes('侧面') && text.includes('背面');
  const hasDetailRequirements = text.includes('特写')
    && (text.includes('佩戴') || text.includes('首饰') || text.includes('着装'));
  const hasExpressionRequirements = text.includes('表情')
    && (text.includes('微笑') || text.includes('开心') || text.includes('难过') || text.includes('哭'));
  const hasSinglePortraitIntent = text.includes('单人主体')
    || text.includes('正面或三分之二视角')
    || text.includes('虚拟人像认证')
    || text.includes('角色设定图。');
  return hasConceptIntent
    && hasThreeViewIntent
    && hasRequiredViews
    && hasDetailRequirements
    && hasExpressionRequirements
    && !hasSinglePortraitIntent;
};

const CHARACTER_PROFILE_SYSTEM_PROMPT = [
  '你是专业的虚拟角色设定策划。',
  '请根据用户需求和上游素材，生成一个可用于图片、声音和视频生产的角色设定。',
  '只输出 JSON，不要输出 Markdown，不要解释。',
  'JSON 字段必须包含：characterName、description、voiceDescription、mainVisualPrompt、threeViewPrompt。',
  'characterName 必须是具体姓名或艺名，不要输出任何角色泛称。',
  'description 描述角色身份、外貌、气质、服装、表情和行为特点。',
  'voiceDescription 描述音色、语速、情绪、口音和说话方式。',
  'mainVisualPrompt 用于生成角色身份基准图，必须结合该角色的具体年龄、五官、发型、肤色、体型、服装和气质特征。',
  'mainVisualPrompt 必须明确要求：单人全身、人物居中、正面面向镜头、目光看向镜头、自然站立、双臂自然放松、双手和双脚完整可见、面部带自然克制的微笑。',
  'mainVisualPrompt 必须使用纯白色无缝背景和专业影棚均匀柔光，保证面部清晰、五官准确、肤色自然、服装纹理清楚、人物轮廓干净。',
  'mainVisualPrompt 必须明确排除：多人、复杂动作、夸张姿势、文字、Logo、水印、边框、拼贴、分屏、装饰元素、背景物体、强烈阴影和戏剧化光效。',
  'threeViewPrompt 用于生成同一角色三视图，要求包含正面、侧面、背面全身和表情参考，并保持同一张脸、同一发型、同一服装。',
].join('\n');

const DEFAULT_CHARACTER_PROFILE_PROMPT = '请生成一个适合短视频内容生产的虚拟角色，要求形象鲜明、可认证、可持续出镜。';

const parseCharacterProfileResponse = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const candidate = fenced?.[1]?.trim()
    || (jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : '');
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawCharacterName = String(parsed.characterName || parsed.name || '').trim();
    return {
      characterName: ['角色', '虚拟角色', '达人', '虚拟达人', '未命名角色'].includes(rawCharacterName) ? '' : rawCharacterName,
      description: String(parsed.description || parsed.profile || '').trim(),
      voiceDescription: String(parsed.voiceDescription || parsed.voice || '').trim(),
      mainVisualPrompt: String(parsed.mainVisualPrompt || parsed.imagePrompt || '').trim(),
      threeViewPrompt: String(parsed.threeViewPrompt || parsed.threeViewImagePrompt || '').trim(),
    };
  } catch {
    return null;
  }
};

const getCharacterProfileGeneratorId = (nodeId) => `character_profile_generator_${nodeId}`;

const getCharacterNodeIdFromProfileGenerator = (generatorId = '') => (
  String(generatorId || '').startsWith('character_profile_generator_')
    ? String(generatorId).slice('character_profile_generator_'.length)
    : ''
);

const normalizeAvatarCertification = (value = null) => {
  const usableAssets = Array.isArray(value?.usableAssets)
    ? value.usableAssets
    : Array.isArray(value?.usable_assets)
      ? value.usable_assets
      : [];
  const failedAssets = Array.isArray(value?.failedAssets)
    ? value.failedAssets
    : Array.isArray(value?.failed_assets)
      ? value.failed_assets
      : [];
  const submittedAssets = Array.isArray(value?.submittedAssets)
    ? value.submittedAssets
    : Array.isArray(value?.submitted_assets)
      ? value.submitted_assets
      : [];
  const status = ['processing', 'verified', 'failed'].includes(value?.status)
    ? value.status
    : usableAssets.length > 0
      ? 'verified'
      : failedAssets.length > 0
        ? 'failed'
        : 'unverified';
  return {
    status,
    taskId: value?.taskId || value?.task_id || '',
    groupId: value?.groupId || value?.group_id || '',
    groupName: value?.groupName || value?.group_name || '',
    usableAssets,
    failedAssets,
    submittedAssets,
    processingAssets: Array.isArray(value?.processingAssets)
      ? value.processingAssets
      : Array.isArray(value?.processing_assets)
        ? value.processing_assets
        : [],
    errorMessage: value?.errorMessage || value?.error_message || '',
    submittedAt: value?.submittedAt || value?.submitted_at || '',
    updatedAt: value?.updatedAt || value?.updated_at || '',
  };
};

const getCharacterImageTargetConfigKey = (target = 'mainVisual') => (
  target === 'threeView' ? 'characterThreeViewGeneratorConfig' : 'characterMainVisualGeneratorConfig'
);

const getCharacterImageGeneratorId = (nodeId, target = 'mainVisual') => (
  `character_image_generator_${target === 'threeView' ? 'threeView' : 'mainVisual'}_${nodeId}`
);

const parseCharacterImageGeneratorId = (generatorId = '') => {
  const prefix = 'character_image_generator_';
  if (!generatorId.startsWith(prefix)) return null;
  const rest = generatorId.slice(prefix.length);
  const targetPrefix = rest.startsWith('threeView_') ? 'threeView_' : rest.startsWith('mainVisual_') ? 'mainVisual_' : '';
  if (!targetPrefix) return null;
  return {
    target: targetPrefix.slice(0, -1),
    nodeId: rest.slice(targetPrefix.length),
  };
};

const buildCharacterDataPatch = (data = {}, patch = {}) => {
  const currentPayload = buildCharacterPayloadFromData(data || {});
  const nextPayload = {
    ...currentPayload,
    ...patch,
  };
  nextPayload.images = uniqueValues([
    nextPayload.mainVisualImageUrl,
    nextPayload.threeViewImageUrl,
    ...(Array.isArray(currentPayload.images) ? currentPayload.images : []),
    ...(Array.isArray(patch.images) ? patch.images : []),
  ]);
  nextPayload.imageUrl = nextPayload.mainVisualImageUrl || nextPayload.images[0] || '';
  nextPayload.characterPrompt = buildCharacterPrompt(nextPayload);
  return {
    ...patch,
    ...nextPayload,
    characterPayload: nextPayload,
  };
};

const getGeneratorCommonGenerationConfig = (data = {}) => {
  const connectedTextReferences = getGeneratorConnectedTextReferences(data);
  const connectedPrompt = appendPrompt(...connectedTextReferences);
  const connectedImages = uniqueValues(data.connectedImages || []);
  const connectedVideos = uniqueValues(data.connectedVideos || []);
  const uploadedReferenceImages = uniqueValues(data.uploadedReferenceImages || [])
    .filter(src => src && !connectedImages.includes(src));
  return {
    connectedPrompt: data.connectedPrompt || connectedPrompt,
    connectedTextReferences,
    connectedImages,
    connectedVideos,
    uploadedReferenceImages,
  };
};

const pickGeneratorProviderModel = (data = {}, type, providers = []) => {
  const enabledProviders = getEnabledProvidersWithModels(providers, type);
  const apiIdKey = type === 'text' ? 'text_api_id' : type === 'image' ? 'image_api_id' : 'video_api_id';
  const modelKey = type === 'text' ? 'model_name' : type === 'image' ? 'image_model' : 'video_model';
  const fallbackModel = type === 'text' ? '' : type === 'image' ? 'gpt-image-2' : 'sora-2';
  const provider = enabledProviders.find(item => item.id === data[apiIdKey])
    || enabledProviders.find(item => item.id === data.activeProviderId)
    || enabledProviders[0]
    || null;
  const modelOptions = getProviderModelsForType(provider, type);
  const configuredModel = data[modelKey] || (type === 'video' ? data.model : '') || '';
  const defaultModel = getDefaultProviderModel(provider, type);
  const model = configuredModel && modelOptions.includes(configuredModel)
    ? configuredModel
    : defaultModel || configuredModel || fallbackModel;
  return { provider, model };
};

const isDependencyRunCandidateNode = (node) => (
  node?.type === 'result'
  || node?.type === 'smartSplitter'
);

const buildSelectionRunBatches = (nodeIds = [], edges = []) => {
  const selectedIds = new Set(nodeIds);
  const indegree = new Map(nodeIds.map(id => [id, 0]));
  const outgoing = new Map(nodeIds.map(id => [id, []]));

  edges.forEach(edge => {
    if (!selectedIds.has(edge.source) || !selectedIds.has(edge.target)) return;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  });

  const batches = [];
  let ready = nodeIds.filter(id => (indegree.get(id) || 0) === 0);
  const visited = new Set();

  while (ready.length > 0) {
    const batch = ready.filter(id => !visited.has(id));
    if (batch.length === 0) break;
    batches.push(batch);
    batch.forEach(id => visited.add(id));

    const nextReady = [];
    batch.forEach(id => {
      (outgoing.get(id) || []).forEach(targetId => {
        const nextDegree = (indegree.get(targetId) || 0) - 1;
        indegree.set(targetId, nextDegree);
        if (nextDegree === 0 && !visited.has(targetId)) {
          nextReady.push(targetId);
        }
      });
    });
    ready = nextReady;
  }

  const remaining = nodeIds.filter(id => !visited.has(id));
  if (remaining.length > 0) batches.push(remaining);
  return batches;
};

const getResultNodeText = (node) => {
  if (!node || node.type !== 'result') return '';
  if (node.data?.resultType === 'generateText') return node.data?.result || '';
  if (node.data?.resultType === 'generateStoryboardScript' && Array.isArray(node.data?.storyboardCards)) {
    return node.data.storyboardCards.map(formatStoryboardCardForPrompt).join('\n\n');
  }
  return '';
};

const getNodeOutputImages = (node) => {
  if (!node) return [];
  if (node.type === 'character') return getCharacterNodeImages(node);
  if (node.type === 'result') return getResultNodeOutput(node).images || [];
  return [];
};

const buildVideoEditorSources = (nodeId, nodes = [], edges = []) => {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set();
  const sources = [];
  const getSourceAspectRatio = (sourceNode, type) => {
    if (!sourceNode?.data) return undefined;
    if (type === 'video') {
      return sourceNode.data.videoAspectRatio || sourceNode.data.mediaAspectRatio;
    }
    return sourceNode.data.mediaAspectRatio || sourceNode.data.imageAspectRatio || sourceNode.data.videoAspectRatio;
  };
  const addSource = (url, type, sourceNode, index) => {
    if (!url || seen.has(`${type}:${url}`)) return;
    seen.add(`${type}:${url}`);
    const aspectRatio = getSourceAspectRatio(sourceNode, type);
    sources.push({
      id: `${sourceNode?.id || 'source'}_${type}_${index}`,
      nodeId: sourceNode?.id || '',
      url,
      type,
      name: `${sourceNode?.data?.label || getDefaultNodeLabel(sourceNode)} ${index + 1}`,
      aspectRatio,
    });
  };

  edges
    .filter(edge => edge.target === nodeId)
    .forEach(edge => {
      const sourceNode = nodesById.get(edge.source);
      if (!sourceNode) return;
      if (sourceNode.type === 'videoInput') {
        const videos = sourceNode.data?.videoUrls || (sourceNode.data?.videoUrl ? [sourceNode.data.videoUrl] : []);
        videos.forEach((url, index) => addSource(url, 'video', sourceNode, index));
        return;
      }
      if (sourceNode.type === 'videoEditor' && sourceNode.data?.videoUrl) {
        addSource(sourceNode.data.videoUrl, 'video', sourceNode, 0);
        return;
      }
      if (sourceNode.type === 'result') {
        const output = getResultNodeOutput(sourceNode);
        (output.images || []).forEach((url, index) => addSource(url, 'image', sourceNode, index));
        (output.videos || []).forEach((url, index) => addSource(url, 'video', sourceNode, index));
        return;
      }
      if (sourceNode.type === 'storyboardCard') {
        addSource(sourceNode.data?.card?.imageUrl || sourceNode.data?.imageUrl, 'image', sourceNode, 0);
        return;
      }
      if (sourceNode.type === 'character') {
        getCharacterNodeImages(sourceNode).forEach((url, index) => addSource(url, 'image', sourceNode, index));
        return;
      }
    });

  return sources;
};

const getNodeDownloadImages = (node) => {
  if (!node) return [];
  if (node.type === 'result') return normalizeImageList([
    ...(Array.isArray(node.data?.imageUrls) ? node.data.imageUrls : []),
    node.data?.imageUrl,
  ]);
  if (node.type === 'storyboardCard') return normalizeImageList([node.data?.card?.imageUrl]);
  if (node.type === 'character') return getCharacterNodeImages(node);
  return [];
};

const getNodeDownloadVideos = (node) => {
  if (!node) return [];
  if (node.type === 'videoInput') return uniqueValues([
    ...(Array.isArray(node.data?.videoUrls) ? node.data.videoUrls : []),
    node.data?.videoUrl,
  ]);
  if (node.type === 'videoEditor') return uniqueValues([node.data?.videoUrl]);
  if (node.type === 'result') return getResultNodeOutput(node).videos || [];
  return [];
};

const getDownloadMediaItemsForNode = (node) => {
  const label = safeDownloadNamePart(String(node?.data?.label || getDefaultNodeLabel(node)).trim() || 'node');
  const nodeSuffix = node?.id ? node.id.slice(0, 8) : 'node';
  const images = getNodeDownloadImages(node);
  const videos = getNodeDownloadVideos(node);
  return [
    ...images.map((url, index) => ({
      url,
      filename: `${label}-${nodeSuffix}${images.length > 1 ? `-image-${index + 1}` : ''}`,
      type: 'image',
    })),
    ...videos.map((url, index) => ({
      url,
      filename: `${label}-${nodeSuffix}${videos.length > 1 ? `-video-${index + 1}` : ''}`,
      type: 'video',
    })),
  ];
};

const safeDownloadNamePart = (value) => (
  String(value || 'node').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'node'
);

const getDefaultNodeLabel = (node) => {
  if (!node) return '节点';
  if (node.type === 'videoInput') return '视频';
  if (node.type === 'videoEditor') return '视频编辑器';
  if (node.type === 'character') return '角色';
  if (node.type === 'product') return '已移除商品素材';
  if (node.type === 'ecommerceVideoPlanner') return '已移除电商视频企划';
  if (node.type === 'competitorVideo') return '已移除竞品视频复刻';
  if (node.type === 'shotDirector') return '已移除镜头导演';
  if (node.type === 'videoAssembler') return '已移除成片编排';
  if (node.type === 'smartSplitter') return '智能拆分器';
  if (node.type === 'playlist') return 'Playlist';
  if (node.type === 'threeD') return '3D Viewfinder';
  if (node.type === 'result') {
    if (node.data?.resultType === 'generateImage') return '图片';
    if (node.data?.resultType === 'generateVideo') return '视频';
    if (node.data?.resultType === 'generateAudio') return '音频';
    if (node.data?.resultType === 'generateStoryboardScript') return '分镜工作台';
    if (node.data?.resultType === 'generateText') return '文本';
  }
  return node.data?.label || '节点';
};

const CONTEXT_MENU = [
  {
    label: '生成',
    icon: 'spark',
    children: PANE_CONTEXT_MENU,
  },
];

const NODE_CREATE_MENU = PANE_CONTEXT_MENU.filter(item => item.action !== 'upload-media');

// 右侧把手拖拽到空白处的菜单
const OUTPUT_DRAG_CREATE_MENU = NODE_CREATE_MENU;

// 左侧把手拖拽到空白处的菜单
const INPUT_DRAG_CREATE_MENU = NODE_CREATE_MENU;

const INPUT_NODE_DEFAULT_SIZES = {
  generateImage: { width: 280, height: 373 },
  generateVideo: { width: 320, height: 180 },
  generateAudio: { width: 300, height: 150 },
  videoEditor: { width: 300, height: 210 },
  playlist: { width: 360, height: 220 },
  threeD: { width: 360, height: 330 },
  character: { width: 320, height: 560 },
};

const centerNodeAtPosition = (nodeType, position) => {
  const size = INPUT_NODE_DEFAULT_SIZES[nodeType];
  if (!size) return position;
  return {
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
  };
};

function CanvasComposerOverlay({
  resultId,
  generatorNode,
  resultAnchor = null,
  containerRef,
  overlayBoundaryRef,
  viewportRevision,
  nodesRevision,
  anchorSelector = '',
  promptStyles = [],
  hidden = false,
  onExpand,
}) {
  const [position, setPosition] = useState(null);
  const overlayRef = useRef(null);
  const { getViewport, setViewport } = useReactFlow();

  const handleWheelHandoff = useCallback((event) => {
    handOffWheelToCanvas(event, {
      boundary: overlayRef.current,
      getViewport,
      setViewport,
      container: containerRef.current,
      minZoom: CANVAS_MIN_ZOOM,
      maxZoom: CANVAS_MAX_ZOOM,
      allowScrollBoundaryHandoff: false,
    });
  }, [containerRef, getViewport, setViewport]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !resultId) return undefined;
    let frameId = 0;
    let observer = null;

    const measure = () => {
      const resultElement = container.querySelector(`.react-flow__node[data-id="${resultId}"]`);
      const anchorElement = anchorSelector
        ? resultElement?.querySelector(anchorSelector)
        : null;
      const width = Math.min(PROCESSOR_WIDTH, window.innerWidth - 32);
      let nextPosition = null;

      if (resultElement && (!anchorSelector || anchorElement)) {
        const anchorRect = (anchorElement || resultElement).getBoundingClientRect();
        if (anchorSelector) {
          nextPosition = {
            left: Math.max(16, Math.min(window.innerWidth - width - 16, anchorRect.left + anchorRect.width / 2 - width / 2)),
            top: Math.min(window.innerHeight - 120, anchorRect.bottom + PROCESSOR_GAP_Y),
            width,
          };
        } else {
          const containerRect = container.getBoundingClientRect();
          nextPosition = {
            left: anchorRect.left - containerRect.left + anchorRect.width / 2 - width / 2,
            top: anchorRect.bottom - containerRect.top + PROCESSOR_GAP_Y,
            width,
          };
        }
      } else if (!anchorSelector && resultAnchor) {
        const [viewportX = 0, viewportY = 0, zoom = 1] = viewportRevision || [];
        const nodeWidth = Number(resultAnchor.width) || GROUP_FALLBACK_WIDTH;
        const nodeHeight = Number(resultAnchor.height) || RESULT_FALLBACK_HEIGHT;
        nextPosition = {
          left: viewportX + (Number(resultAnchor.position?.x) || 0) * zoom
            + (nodeWidth * zoom) / 2 - width / 2,
          top: viewportY + (Number(resultAnchor.position?.y) || 0) * zoom
            + nodeHeight * zoom + PROCESSOR_GAP_Y,
          width,
        };
      }

      if (!nextPosition) {
        setPosition(null);
        frameId = window.requestAnimationFrame(measure);
        return;
      }

      setPosition(previous => (
        previous
        && Math.abs(previous.left - nextPosition.left) < 0.25
        && Math.abs(previous.top - nextPosition.top) < 0.25
        && Math.abs(previous.width - nextPosition.width) < 0.25
          ? previous
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(measure);
    };

    measure();
    const resultElement = container.querySelector(`.react-flow__node[data-id="${resultId}"]`);
    if (resultElement && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(resultElement);
      const anchorElement = anchorSelector
        ? resultElement.querySelector(anchorSelector)
        : null;
      if (anchorElement) observer.observe(anchorElement);
      observer.observe(container);
    }
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [anchorSelector, containerRef, nodesRevision, resultAnchor, resultId, viewportRevision]);

  // 用原生事件绑定绕过 Chrome passive wheel 限制
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handler = (e) => handleWheelHandoff(e);
    el.addEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => el.removeEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
  }, [handleWheelHandoff]);

  useLayoutEffect(() => {
    if (!overlayBoundaryRef) return undefined;
    if (hidden) {
      overlayBoundaryRef.current = null;
      return undefined;
    }
    overlayBoundaryRef.current = overlayRef.current;
    return () => {
      if (overlayBoundaryRef.current === overlayRef.current) {
        overlayBoundaryRef.current = null;
      }
    };
  }, [hidden, overlayBoundaryRef]);

  if (!resultId || !generatorNode || hidden || !position) return null;

  return (
    <div
      ref={overlayRef}
      className={`canvas-composer-overlay canvas-composer-dock ${anchorSelector ? 'canvas-composer-anchored' : 'canvas-composer-following'}`}
      data-result-id={resultId}
      style={anchorSelector
        ? { left: position.left, top: position.top, width: position.width }
        : {
            left: 0,
            top: 0,
            width: position.width,
            transform: `translate3d(${position.left}px, ${position.top}px, 0)`,
          }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="canvas-overlay-expand-btn"
        onClick={onExpand}
        title="放大编辑"
        aria-label="放大编辑"
      >
        <Icon name="expandDiagonal" size={15} />
      </button>
      <GeneratorNode
        key={generatorNode.id}
        id={generatorNode.id}
        data={{ ...generatorNode.data, overlayMode: true, promptStyles }}
      />
    </div>
  );
}

function CanvasSmartSplitterOverlay({
  splitterNode,
  containerRef,
  overlayBoundaryRef,
  promptStyles = [],
  hidden = false,
  onExpand,
}) {
  const overlayRef = useRef(null);
  const { getViewport, setViewport } = useReactFlow();
  const splitterId = splitterNode?.id;

  const handleWheelHandoff = useCallback((event) => {
    handOffWheelToCanvas(event, {
      boundary: overlayRef.current,
      getViewport,
      setViewport,
      container: containerRef.current,
      minZoom: CANVAS_MIN_ZOOM,
      maxZoom: CANVAS_MAX_ZOOM,
      allowScrollBoundaryHandoff: false,
    });
  }, [containerRef, getViewport, setViewport]);

  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handler = (e) => handleWheelHandoff(e);
    el.addEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => el.removeEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
  }, [handleWheelHandoff]);

  useLayoutEffect(() => {
    if (!overlayBoundaryRef) return undefined;
    if (hidden) {
      overlayBoundaryRef.current = null;
      return undefined;
    }
    overlayBoundaryRef.current = overlayRef.current;
    return () => {
      if (overlayBoundaryRef.current === overlayRef.current) {
        overlayBoundaryRef.current = null;
      }
    };
  }, [hidden, overlayBoundaryRef]);

  if (!splitterNode || hidden) return null;

  return (
    <div
      ref={overlayRef}
      className="canvas-composer-overlay canvas-composer-dock smart-splitter-processor-overlay"
      data-splitter-id={splitterId}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="canvas-overlay-expand-btn"
        onClick={onExpand}
        title="放大编辑"
        aria-label="放大编辑"
      >
        <Icon name="expandDiagonal" size={15} />
      </button>
      <SmartSplitterProcessor
        key={splitterNode.id}
        id={splitterNode.id}
        data={{ ...splitterNode.data, overlayMode: true, promptStyles }}
      />
    </div>
  );
}

function CanvasProcessorExpandedDialog({
  open,
  type,
  composer,
  splitterNode,
  promptStyles = [],
  overlayBoundaryRef,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const isSmartSplitter = type === 'smartSplitter';
  const title = isSmartSplitter ? '智能拆分器' : '生成器';

  return (
    <div
      className="canvas-processor-expanded-backdrop nodrag nopan"
      ref={overlayBoundaryRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      onClick={event => event.stopPropagation()}
    >
      <section className="canvas-processor-expanded-dialog">
        <header className="canvas-processor-expanded-header">
          <button
            type="button"
            className="canvas-processor-expanded-close"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="canvas-processor-expanded-body">
          {isSmartSplitter ? (
            splitterNode && (
              <SmartSplitterProcessor
                key={splitterNode.id}
                id={splitterNode.id}
                data={{
                  ...splitterNode.data,
                  overlayMode: true,
                  expandedOverlayMode: true,
                  promptStyles,
                }}
              />
            )
          ) : (
            composer?.generatorNode && (
              <GeneratorNode
                key={composer.generatorNode.id}
                id={composer.generatorNode.id}
                data={{
                  ...composer.generatorNode.data,
                  overlayMode: true,
                  expandedOverlayMode: true,
                  promptStyles,
                }}
              />
            )
          )}
        </div>
      </section>
    </div>
  );
}

const SNAP_ENABLED_STORAGE_KEY = 'ai-canvas.snap-enabled';
let runtimeNodeSequence = 0;

const createRuntimeNodeToken = () => {
  runtimeNodeSequence += 1;
  return `${Date.now()}_${runtimeNodeSequence}_${Math.random().toString(16).slice(2)}`;
};

function getInitialSnapEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(SNAP_ENABLED_STORAGE_KEY);
    return saved == null ? false : saved === 'true';
  } catch {
    return false;
  }
}

export function CanvasFlow({
  projectId,
  initialNodes = [], initialEdges = [],
  initialViewport,
  onCanvasChange, apiConfigs = [], apiProviders = [],
  materials, setMaterials, materialGroups,
  workflowTemplates, setWorkflowTemplates,
  officialTemplates = [],
  officialPromptStyles = [],
  pendingInjectRef,
  runtimeSettings,
  canvasStateRef,
  crossProjectClipboardRef,
  refreshLocalAssets = () => {},
}) {
  const initialGraph = useMemo(() => {
    const promptGraph = migrateLegacyPromptGraph(initialNodes, initialEdges);
    return migrateLegacyImageGraph(promptGraph.nodes, promptGraph.edges);
  }, [initialEdges, initialNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const nodeFailureFlashTimersRef = useRef(new Map());

  const markNodeGenerationFailed = useCallback((nodeId, options = {}) => {
    if (!nodeId) return;
    const flashId = `failure_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const message = options.message || '生成失败';
    const backendTaskIds = uniqueTaskIds(options.taskIds || options.backendTaskIds || []);
    const taskId = backendTaskIds[0] || options.taskId || '';
    const runId = options.runId || '';
    const status = options.status || 'error';
    const generatorId = options.generatorId || '';

    if (backendTaskIds.length > 0) {
      reportTaskFailureToTaskCenter(backendTaskIds, {
        message,
        nodeId,
        projectId,
        runId,
        source: options.source || 'canvas',
      });
    }

    const previousTimer = nodeFailureFlashTimersRef.current.get(nodeId);
    if (previousTimer) window.clearTimeout(previousTimer);

    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            generating: false,
            generationTask: { id: taskId, status, runId },
            smartSplitStatus: '',
            lastGenerationError: message,
            taskIds: [],
            currentRunId: '',
            generationFailureFlashId: flashId,
          },
        };
      }
      if (generatorId && node.id === generatorId) {
        return {
          ...node,
          data: {
            ...node.data,
            generationTask: { id: taskId, status, runId },
            lastGenerationError: message,
          },
        };
      }
      return node;
    }));

    const timer = window.setTimeout(() => {
      setNodes(nds => nds.map(node => (
        node.id === nodeId && node.data?.generationFailureFlashId === flashId
          ? {
              ...node,
              data: {
                ...node.data,
                generationFailureFlashId: '',
              },
            }
          : node
      )));
      nodeFailureFlashTimersRef.current.delete(nodeId);
    }, 3000);
    nodeFailureFlashTimersRef.current.set(nodeId, timer);
  }, [projectId, setNodes]);

  // 挂载时从跨项目剪贴板恢复本地剪贴板
  useEffect(() => {
    if (!clipboardRef.current && crossProjectClipboardRef?.current) {
      clipboardRef.current = crossProjectClipboardRef.current;
    }
  }, [crossProjectClipboardRef]);

  const [menu, setMenu] = useState(null);
  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const [characterDrawerOpen, setCharacterDrawerOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPickingNode, setCopilotPickingNode] = useState(false);
  const [templateRunnerOpen, setTemplateRunnerOpen] = useState(false);
  const [expandedProcessorOverlay, setExpandedProcessorOverlay] = useState(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [miniMapAvailable, setMiniMapAvailable] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth >= CANVAS_MINIMAP_MIN_VIEWPORT_WIDTH
  ));
  const [snapEnabled, setSnapEnabled] = useState(getInitialSnapEnabled);
  const [alignmentGuides, setAlignmentGuides] = useState(null); // { guides: [], snappedPos: null }
  const [optionDragGhost, setOptionDragGhost] = useState(null);
  const menuRef = useRef(null);
  const hydratedRef = useRef(false);
  const canvasContainerRef = useRef(null);
  const activeComposerOverlayRef = useRef(null);
  const activeSmartSplitterOverlayRef = useRef(null);
  const expandedProcessorOverlayRef = useRef(null);
  const copilotLastCreatedIdsRef = useRef([]);
  const copilotLastEditUndoRef = useRef(null);
  const stableNodeTypesRef = useRef(nodeTypes);
  const stableEdgeTypesRef = useRef(edgeTypes);
  const canvasChangeTimerRef = useRef(null);
  const pendingCanvasSnapshotRef = useRef({ nodes: initialGraph.nodes, edges: initialGraph.edges });
  const { getViewport, screenToFlowPosition, setViewport, fitView } = useReactFlow();
  const viewportTransform = useStore(state => state.transform);
  const [saveMaterialDraft, setSaveMaterialDraft] = useState(null);
  const [saveTemplateGroupId, setSaveTemplateGroupId] = useState(null);
  const [saveTemplatePending, setSaveTemplatePending] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState('');
  const [activeVideoEditorNodeId, setActiveVideoEditorNodeId] = useState(null);
const CLIPBOARD_PASTE_OFFSET = 40;
const ALIGN_SNAP_THRESHOLD = 5;

  const toggleSnapEnabled = useCallback(() => {
    setSnapEnabled(current => {
      const next = !current;
      try {
        window.localStorage.setItem(SNAP_ENABLED_STORAGE_KEY, String(next));
      } catch {
        // Keep the in-memory toggle usable when storage is unavailable.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const syncMiniMapAvailability = () => {
      const available = window.innerWidth >= CANVAS_MINIMAP_MIN_VIEWPORT_WIDTH;
      setMiniMapAvailable(current => (current === available ? current : available));
      if (!available) setMiniMapOpen(false);
    };
    syncMiniMapAvailability();
    window.addEventListener('resize', syncMiniMapAvailability, { passive: true });
    return () => window.removeEventListener('resize', syncMiniMapAvailability);
  }, []);

  const toggleMiniMap = useCallback(() => {
    if (!miniMapAvailable) {
      setMiniMapOpen(false);
      return;
    }
    setMiniMapOpen(current => !current);
  }, [miniMapAvailable]);

  useEffect(() => {
    if (!canvasStateRef) return undefined;
    canvasStateRef.current = () => ({
      nodes: pendingCanvasSnapshotRef.current.nodes,
      edges: pendingCanvasSnapshotRef.current.edges,
      viewport: getViewport(),
      pairMap: { ...pairMap.current },
    });
    return () => {
      canvasStateRef.current = null;
    };
  }, [canvasStateRef, getViewport]);

// 分镜卡片 → 弹出生图对话框的临时目标
  // { resultId, cardIndex, card, referenceImages, cardNodeId? }
  const [storyboardGeneratorTarget, setStoryboardGeneratorTarget] = useState(null);
  const [videoWorkbenchNodeId, setVideoWorkbenchNodeId] = useState(null);
  const openVideoWorkbench = useCallback((nodeId) => {
    setVideoWorkbenchNodeId(nodeId);
  }, []);
  const videoWorkbenchNode = useMemo(
    () => nodes.find(node => node.id === videoWorkbenchNodeId) || null,
    [nodes, videoWorkbenchNodeId],
  );

  const handleCanvasWheelCapture = useCallback((event) => {
    const target = event.target instanceof Element ? event.target : null;
    const container = canvasContainerRef.current;
    const wheelBoundaries = [
      activeComposerOverlayRef.current,
      activeSmartSplitterOverlayRef.current,
      expandedProcessorOverlayRef.current,
    ].filter(Boolean);

    if (target && container && wheelBoundaries.length > 0) {
      for (const boundary of wheelBoundaries) {
        if (!boundary?.contains(target)) continue;
        const handled = handOffWheelToCanvas(event, {
          boundary,
          getViewport,
          setViewport,
          container,
          minZoom: CANVAS_MIN_ZOOM,
          maxZoom: CANVAS_MAX_ZOOM,
          allowScrollBoundaryHandoff: false,
        });
        if (handled) return;
        return;
      }
    }

    zoomCanvasFromWheelEvent(event, {
      getViewport,
      setViewport,
      container,
      minZoom: CANVAS_MIN_ZOOM,
      maxZoom: CANVAS_MAX_ZOOM,
    });
  }, [getViewport, setViewport]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      setIsSpacePanning(true);
    };

    const handleKeyUp = (event) => {
      if (event.code !== 'Space') return;
      setIsSpacePanning(false);
    };

    const handleBlur = () => setIsSpacePanning(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const preventBrowserZoom = (event) => {
      if (!isBrowserZoomKeyboardEvent(event)) return;

      if (canvasContainerRef.current && zoomCanvasFromKeyboardEvent(event, {
        getViewport,
        setViewport,
        container: canvasContainerRef.current,
        minZoom: CANVAS_MIN_ZOOM,
        maxZoom: CANVAS_MAX_ZOOM,
      })) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', preventBrowserZoom, { capture: true });
    return () => window.removeEventListener('keydown', preventBrowserZoom, { capture: true });
  }, [getViewport, setViewport]);

  useEffect(() => {
    const handleGlobalWheelZoom = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const container = canvasContainerRef.current;
      if (container && zoomCanvasFromWheelEvent(event, {
        getViewport,
        setViewport,
        container,
        minZoom: CANVAS_MIN_ZOOM,
        maxZoom: CANVAS_MAX_ZOOM,
      })) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const preventBrowserGestureZoom = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('wheel', handleGlobalWheelZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    window.addEventListener('gesturestart', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    window.addEventListener('gesturechange', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    window.addEventListener('gestureend', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);

    return () => {
      window.removeEventListener('wheel', handleGlobalWheelZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
      window.removeEventListener('gesturestart', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
      window.removeEventListener('gesturechange', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
      window.removeEventListener('gestureend', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    };
  }, [getViewport, setViewport]);

  // 默认素材分组
  const defaultMaterialGroup = useMemo(
    () => materialGroups?.find(g => g.name === '默认分组') || materialGroups?.[0] || null,
    [materialGroups]
  );

  const certifiedAvatarAssets = useMemo(() => {
    const byKey = new Map();
    (Array.isArray(materials) ? materials : []).forEach(material => {
      getCertifiedAvatarAssetsFromMaterial(material).forEach(asset => {
        const key = asset.assetUrl || asset.assetId || `${material.id}_${asset.name || ''}`;
        if (!key || byKey.has(key)) return;
        byKey.set(key, {
          ...asset,
          materialId: material.id || asset.materialId || '',
          name: asset.name || material.name || '认证角色',
          imageUrl: asset.imageUrl || material.imageUrl || '',
          talentPackage: asset.talentPackage || material.talentPackage || material.characterPayload?.talentPackage || null,
        });
      });
    });
    return Array.from(byKey.values());
  }, [materials]);

  const certifiedAvatarPackages = useMemo(() => {
    const byKey = new Map();
    const addPackage = ({ talentPackage, fallback = {}, sourceId = '' }) => {
      if (!talentPackage) return;
      const roleAssets = getVideoRoleAssetsFromTalentPackage(talentPackage);
      if (roleAssets.length === 0) return;
      const key = getTalentPackageKey(talentPackage) || sourceId || fallback.id || roleAssets[0]?.url;
      if (!key || byKey.has(key)) return;
      byKey.set(key, {
        packageKey: key,
        talentPackageKey: key,
        talentPackage,
        groupId: talentPackage.providerGroupId || talentPackage.groupId || '',
        groupName: talentPackage.groupName || fallback.groupName || fallback.name || '',
        name: talentPackage.name || fallback.name || fallback.characterName || '认证角色',
        description: talentPackage.description || fallback.description || fallback.prompt || '',
        imageUrl: fallback.imageUrl || fallback.previewUrl || '',
        assetUrl: roleAssets[0]?.url || '',
        imageAssetCount: roleAssets.length,
        videoAssetCount: getTalentPackageCertifiedAssetUrlsByType(talentPackage, 'video').length,
        audioReferenceCount: getTalentPackageCertifiedAssetUrlsByType(talentPackage, 'audio').length,
      });
    };

    (Array.isArray(materials) ? materials : []).forEach(material => {
      const talentPackage = material.talentPackage || material.characterPayload?.talentPackage || material.talentPayload?.talentPackage;
      addPackage({ talentPackage, fallback: material, sourceId: material.id });
    });

    certifiedAvatarAssets.forEach(asset => {
      addPackage({ talentPackage: asset.talentPackage, fallback: asset, sourceId: asset.materialId || asset.nodeId || '' });
    });

    return Array.from(byKey.values());
  }, [certifiedAvatarAssets, materials]);

  const openSaveMaterialModal = useCallback(({ type, url, resultId, sourceId }) => {
    if (!defaultMaterialGroup) return;
    setSaveMaterialDraft({
      type,
      url,
      resultId: resultId || sourceId,
      name: `素材 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}`,
      prompt: '',
      groupId: defaultMaterialGroup.id,
    });
  }, [defaultMaterialGroup]);

  const confirmSaveMaterial = useCallback(() => {
    if (!saveMaterialDraft || !setMaterials) return;
    const material = {
      id: `material_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: saveMaterialDraft.name || '未命名素材',
      imageUrl: saveMaterialDraft.url,
      prompt: saveMaterialDraft.prompt || '',
      type: saveMaterialDraft.type,
      source: 'canvas',
      sourceId: saveMaterialDraft.resultId,
      groupId: saveMaterialDraft.groupId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMaterials(prev => [material, ...prev]);
    setSaveMaterialDraft(null);
  }, [saveMaterialDraft, setMaterials]);

  const downloadNodeVideos = useCallback(async (nodeId) => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    const videos = getNodeDownloadVideos(node);
    if (videos.length === 0) {
      window.alert('当前节点没有可下载的视频');
      return;
    }
    const label = safeDownloadNamePart(String(node?.data?.label || getDefaultNodeLabel(node)).trim() || 'video');
    const items = videos.map((url, index) => ({
      url,
      filename: `${label}-${nodeId.slice(0, 8)}${videos.length > 1 ? `-${index + 1}` : ''}`,
      type: 'video',
    }));
    try {
      const result = await downloadMedia(items, 'selected-video', {
        zip: videos.length > 1,
        zipFilename: `${label}-videos-${new Date().toISOString().slice(0, 10)}`,
      });
      if (result.downloaded === 0) {
        window.alert('视频下载失败，请稍后重试');
      }
    } catch (error) {
      console.warn('[downloadVideo] 下载失败', error);
      window.alert('视频下载失败，请稍后重试');
    }
  }, []);

  // 记录拖拽连线的源节点
  const connectStartRef = useRef(null);
  // 标记：刚刚拖拽连线结束，阻止 paneClick 立即关闭菜单
  const justConnectedRef = useRef(false);
  // 当前活跃的 result 节点 ID（控制 generator 显隐）
  const activeResultRef = useRef(null);
  const [activeResultId, setActiveResultId] = useState(() => (
    initialGraph.nodes.find(node => node.selected && shouldOpenResultComposer(node))?.id || null
  ));
  const [expandedResultId, setExpandedResultId] = useState(null);
  const [isSelectionBoxActive, setIsSelectionBoxActive] = useState(false);
  const [activeSmartSplitterId, setActiveSmartSplitterId] = useState(() => (
    initialGraph.nodes.find(node => node.type === 'smartSplitter' && node.selected)?.id || null
  ));
  const [activeCharacterImageNodeId, setActiveCharacterImageNodeId] = useState(() => (
    initialGraph.nodes.find(node => node.type === 'character' && node.selected)?.id || null
  ));
  const [activeCharacterImageTarget, setActiveCharacterImageTarget] = useState('mainVisual');
  const [activeCharacterProfileNodeId, setActiveCharacterProfileNodeId] = useState(null);
  // resultId → generatorId
  const pairMap = useRef({});
  // videoId → video urls
  const videoInputs = useRef({});
  const storyboardImageTasksRef = useRef({});
// 剪贴板：存储复制的节点数据
  const clipboardRef = useRef(null);
  const paneUploadInputRef = useRef(null);
  const pendingPaneUploadPositionRef = useRef(null);
  const ignoreNextPasteRef = useRef(false); // 节点粘贴后跳过 paste 事件
  const optionDragCopyRef = useRef(null);
  const optionDragSelectionSnapshotRef = useRef(null);
  const pasteNodesRef = useRef(null);
  const copySelectedNodesRef = useRef(null);
  const runSmartSplitterRef = useRef(null);
  const smartSplitterAbortRef = useRef(new Map());
  const syncGeneratorDataForEdgesRef = useRef(null);
  const createVideoEnhancementPrototypeRef = useRef(null);
  const callCreateVideoEnhancementPrototype = useCallback((...args) => (
    createVideoEnhancementPrototypeRef.current?.(...args)
  ), []);
  const createVideoSubjectReplacementPrototypeRef = useRef(null);
  const callCreateVideoSubjectReplacementPrototype = useCallback((...args) => (
    createVideoSubjectReplacementPrototypeRef.current?.(...args)
  ), []);
  const createVideoSubjectRemovalPrototypeRef = useRef(null);
  const callCreateVideoSubjectRemovalPrototype = useCallback((...args) => (
    createVideoSubjectRemovalPrototypeRef.current?.(...args)
  ), []);
  const getCanvasImageChoices = useCallback((excludeNodeId) => (
    nodesRef.current
      .filter(node => node.type === 'result' && node.id !== excludeNodeId && node.data?.resultType === 'generateImage')
      .flatMap(node => {
        const urls = Array.isArray(node.data?.imageUrls) && node.data.imageUrls.length > 0
          ? node.data.imageUrls
          : node.data?.imageUrl
            ? [node.data.imageUrl]
            : [];
        return urls.filter(Boolean).map((url, index) => ({
          id: `${node.id}-${index}`,
          nodeId: node.id,
          url,
          label: node.data?.label || `图片节点 ${index + 1}`,
        }));
      })
      .slice(0, 8)
  ), []);
// generatorId → running generation task
  const generationTasksRef = useRef({});
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const shiftNodeSelectionSnapshotRef = useRef(null);
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const historySnapshotRef = useRef(null);
  const historyTimerRef = useRef(null);
  const applyingHistoryRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => () => {
    smartSplitterAbortRef.current.forEach(controller => controller.abort());
    smartSplitterAbortRef.current.clear();
    Object.values(generationTasksRef.current).forEach(task => {
      if (task?.status === 'running') {
        task.status = 'canceled';
        task.controller?.abort();
      }
    });
    Object.values(storyboardImageTasksRef.current).forEach(task => {
      if (task?.status === 'running') {
        task.status = 'canceled';
        task.controller?.abort();
      }
    });
    nodeFailureFlashTimersRef.current.forEach(timer => window.clearTimeout(timer));
    nodeFailureFlashTimersRef.current.clear();
  }, []);

  useEffect(() => {
    pairMap.current = restoreImageNodePairs(nodes);
  }, [nodes]);

  const copilotTargetNodes = useMemo(() => {
    const selectedNodeIds = getCopilotSelectedNodeIds(nodes);
    const resultToGenerator = Object.fromEntries(nodes
      .filter(node => node.type === 'generator' && node.data?.pairedResultId)
      .map(node => [node.data.pairedResultId, node.id]));
    return buildCopilotNodeTargets(nodes, selectedNodeIds, resultToGenerator);
  }, [nodes]);

  const removeCopilotTargetNode = useCallback((nodeId) => {
    setNodes(current => current.map(node => (
      node.id === nodeId ? { ...node, selected: false } : node
    )));
  }, [setNodes]);

  const toggleCopilotNodePicker = useCallback(() => {
    setCopilotPickingNode(current => !current);
  }, []);

  useEffect(() => {
    if (!copilotPickingNode) return undefined;
    const cancelPicker = (event) => {
      if (event.key === 'Escape') setCopilotPickingNode(false);
    };
    window.addEventListener('keydown', cancelPicker);
    return () => window.removeEventListener('keydown', cancelPicker);
  }, [copilotPickingNode]);

  useEffect(() => {
    if (!activeResultId) return;
    const resultExists = nodes.some(node => node.id === activeResultId && node.type === 'result');
    if (resultExists) return;
    activeResultRef.current = null;
    setActiveResultId(null);
  }, [activeResultId, nodes]);

  useEffect(() => {
    if (!activeResultId) return;
    const activeResult = nodes.find(node => node.id === activeResultId && node.type === 'result');
    if (activeResult?.selected) return;
    activeResultRef.current = null;
    setActiveResultId(null);
  }, [activeResultId, nodes]);

  useEffect(() => {
    if (!activeSmartSplitterId) return;
    const splitterExists = nodes.some(node => node.id === activeSmartSplitterId && node.type === 'smartSplitter');
    if (splitterExists) return;
    setActiveSmartSplitterId(null);
  }, [activeSmartSplitterId, nodes]);

  useEffect(() => {
    if (!activeCharacterImageNodeId) return;
    const characterNode = nodes.find(node => node.id === activeCharacterImageNodeId && node.type === 'character');
    if (characterNode?.selected) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setActiveCharacterImageNodeId(current => (
        current === activeCharacterImageNodeId ? null : current
      ));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeCharacterImageNodeId, nodes]);

  useEffect(() => {
    if (!activeCharacterProfileNodeId) return;
    const characterNode = nodes.find(node => node.id === activeCharacterProfileNodeId && node.type === 'character');
    if (characterNode?.selected) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setActiveCharacterProfileNodeId(current => (
        current === activeCharacterProfileNodeId ? null : current
      ));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeCharacterProfileNodeId, nodes]);

  useEffect(() => {
    if (!activeSmartSplitterId) return;
    const activeSplitter = nodes.find(node => node.id === activeSmartSplitterId && node.type === 'smartSplitter');
    if (activeSplitter?.selected) return;
    setActiveSmartSplitterId(null);
  }, [activeSmartSplitterId, nodes]);

  const createCanvasHistorySnapshot = useCallback((snapshotNodes = nodesRef.current, snapshotEdges = edgesRef.current) => ({
    nodes: snapshotNodes,
    edges: snapshotEdges,
    signature: JSON.stringify({
      nodes: snapshotNodes.map(stripRuntimeNodeData),
      edges: snapshotEdges,
    }),
  }), []);

  const restoreCanvasHistorySnapshot = useCallback((snapshot) => {
    applyingHistoryRef.current = true;
    historySnapshotRef.current = snapshot;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setEdges, setNodes]);

  const commitCanvasHistorySnapshot = useCallback(() => {
    const latest = createCanvasHistorySnapshot();

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      historySnapshotRef.current = latest;
      return;
    }

    const previous = historySnapshotRef.current;
    if (!previous) {
      historySnapshotRef.current = latest;
      return;
    }

    if (latest.signature === previous.signature) return;

    historyPastRef.current = [...historyPastRef.current, previous].slice(-CANVAS_HISTORY_LIMIT);
    historyFutureRef.current = [];
    historySnapshotRef.current = latest;
  }, [createCanvasHistorySnapshot]);

  useEffect(() => {
    window.clearTimeout(historyTimerRef.current);
    historyTimerRef.current = window.setTimeout(
      commitCanvasHistorySnapshot,
      CANVAS_HISTORY_DEBOUNCE_MS
    );

    return () => window.clearTimeout(historyTimerRef.current);
  }, [nodes, edges, commitCanvasHistorySnapshot]);

  // 把 setEdges 注入 edgeRegistry，供 DeletableEdge 在 X 按钮点击时调用。
  // 删除走 setEdges → 走 ReactFlow 同样的状态路径，220ms debounce 会自动把
  // "删除前"快照压入 historyPastRef，用户按 Cmd/Ctrl+Z 即可恢复。
  useEffect(() => {
    setEdgeDeleteHandler((edgeId) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    });
    return () => setEdgeDeleteHandler(null);
  }, [setEdges]);

  const undoCanvas = useCallback(() => {
    window.clearTimeout(historyTimerRef.current);
    const current = createCanvasHistorySnapshot();
    const checkpoint = historySnapshotRef.current;

    if (checkpoint && current.signature !== checkpoint.signature) {
      historyFutureRef.current = [current, ...historyFutureRef.current].slice(0, CANVAS_HISTORY_LIMIT);
      restoreCanvasHistorySnapshot(checkpoint);
      return;
    }

    const previous = historyPastRef.current.at(-1);
    if (!previous) return;

    historyPastRef.current = historyPastRef.current.slice(0, -1);
    historyFutureRef.current = [current, ...historyFutureRef.current].slice(0, CANVAS_HISTORY_LIMIT);
    restoreCanvasHistorySnapshot(previous);
  }, [createCanvasHistorySnapshot, restoreCanvasHistorySnapshot]);

  const redoCanvas = useCallback(() => {
    window.clearTimeout(historyTimerRef.current);
    const next = historyFutureRef.current[0];
    if (!next) return;

    const current = createCanvasHistorySnapshot();
    historyFutureRef.current = historyFutureRef.current.slice(1);
    historyPastRef.current = [...historyPastRef.current, current].slice(-CANVAS_HISTORY_LIMIT);
    restoreCanvasHistorySnapshot(next);
  }, [createCanvasHistorySnapshot, restoreCanvasHistorySnapshot]);

  const getAbsoluteNodePosition = useCallback((node, nodeSnapshot = nodesRef.current) => {
    if (node?.positionAbsolute) {
      return {
        x: node.positionAbsolute.x || 0,
        y: node.positionAbsolute.y || 0,
      };
    }
    let x = node.position?.x || 0;
    let y = node.position?.y || 0;
    let parentId = node.parentNode;

    while (parentId) {
      const parentNode = nodeSnapshot.find(item => item.id === parentId);
      if (!parentNode) break;
      x += parentNode.position?.x || 0;
      y += parentNode.position?.y || 0;
      parentId = parentNode.parentNode;
    }

    return { x, y };
  }, []);

  const cancelBackendTaskIds = useCallback((taskIds = []) => {
    uniqueTaskIds(taskIds).forEach(tid => {
      fetch(`${API_BASE}/api/task/${encodeURIComponent(tid)}/cancel`, { method: 'POST' }).catch(() => {});
    });
  }, []);

  const cancelRunningTasksForRemovedNodes = useCallback((nodeIds = []) => {
    const ids = new Set(nodeIds.filter(Boolean));

    nodesRef.current.forEach(node => {
      if (!ids.has(node.id)) return;
      if (!isRunningGenerationNode(node)) return;
      cancelBackendTaskIds(node.data?.taskIds || []);
      const generatorId = node.type === 'result'
        ? pairMap.current[node.id]
        : node.type === 'generator'
          ? node.id
          : null;
      if (generatorId && generationTasksRef.current[generatorId]?.status === 'running') {
        generationTasksRef.current[generatorId].status = 'canceled';
        generationTasksRef.current[generatorId].controller?.abort();
      }
    });
    setNodes(nds => nds.map(node => {
      if (!ids.has(node.id) || !isRunningGenerationNode(node)) return node;
      return {
        ...node,
        data: {
          ...node.data,
          generating: false,
          generationTask: null,
          taskIds: [],
          currentRunId: '',
          smartSplitStatus: '',
        },
      };
    }));
  }, [cancelBackendTaskIds, setNodes]);

  const handleNodesChange = useCallback((changes) => {
    if (changes.some(change => change.type === 'select' && change.selected)) {
      const selectionElement = canvasContainerRef.current?.querySelector?.('.react-flow__selection');
      if (selectionElement) {
        setIsSelectionBoxActive(true);
      }
    }
    let nextChanges = changes;
    const optionCopy = optionDragCopyRef.current;
    if (optionCopy?.sourceIds?.size > 0) {
      nextChanges = changes.filter(change => (
        change.type !== 'position' || !optionCopy.sourceIds.has(change.id)
      ));
      if (nextChanges.length === 0) return;
    }

    // 删除节点时，连带删除组内节点以及配对的处理器/结果节点
    const requestedRemoveIds = new Set(
      nextChanges.filter(c => c.type === 'remove').map(c => c.id)
    );
    if (requestedRemoveIds.size > 0) {
      const removeIds = collectNodeRemovalIds(
        nodesRef.current,
        pairMap.current,
        requestedRemoveIds
      );

      for (const id of removeIds) {
        if (pairMap.current[id]) delete pairMap.current[id];
        Object.entries(pairMap.current).forEach(([resultId, generatorId]) => {
          if (generatorId === id || removeIds.has(resultId)) {
            delete pairMap.current[resultId];
          }
        });
        // 清理 refs
        delete videoInputs.current[id];
      }

      cancelRunningTasksForRemovedNodes([...removeIds]);
      setEdges(eds => eds.filter(edge => !removeIds.has(edge.source) && !removeIds.has(edge.target)));
      const nonRemoveChanges = nextChanges.filter(change => change.type !== 'remove');
      onNodesChange([
        ...nonRemoveChanges,
        ...[...removeIds].map(id => ({ id, type: 'remove' })),
      ]);
      return;
    }

    onNodesChange(nextChanges);
  }, [cancelRunningTasksForRemovedNodes, onNodesChange, setEdges]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || typeof MutationObserver === 'undefined') return undefined;

    const syncSelectionBoxState = () => {
      setIsSelectionBoxActive(Boolean(container.querySelector('.react-flow__selection')));
    };
    const observer = new MutationObserver(syncSelectionBoxState);
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    syncSelectionBoxState();

    const syncAfterPointerUp = () => {
      window.requestAnimationFrame(syncSelectionBoxState);
    };
    window.addEventListener('pointerup', syncAfterPointerUp);
    window.addEventListener('blur', syncSelectionBoxState);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointerup', syncAfterPointerUp);
      window.removeEventListener('blur', syncSelectionBoxState);
    };
  }, []);

  const deleteCanvasNode = useCallback((nodeId) => {
    if (!nodeId) return;
    handleNodesChange([{ id: nodeId, type: 'remove' }]);
  }, [handleNodesChange]);

  useEffect(() => {
    pendingCanvasSnapshotRef.current = { nodes, edges };
    if (!onCanvasChange) return undefined;
    if (canvasChangeTimerRef.current) {
      window.clearTimeout(canvasChangeTimerRef.current);
    }
    canvasChangeTimerRef.current = window.setTimeout(() => {
      canvasChangeTimerRef.current = null;
      const snapshot = pendingCanvasSnapshotRef.current;
      onCanvasChange(snapshot.nodes, snapshot.edges, {
        viewport: getViewport(),
        pairMap: { ...pairMap.current },
      });
    }, 240);

    return undefined;
  }, [nodes, edges, getViewport, onCanvasChange]);

  useEffect(() => () => {
    if (canvasChangeTimerRef.current) {
      window.clearTimeout(canvasChangeTimerRef.current);
      canvasChangeTimerRef.current = null;
    }
    const snapshot = pendingCanvasSnapshotRef.current;
    onCanvasChange?.(snapshot.nodes, snapshot.edges, {
      viewport: getViewport(),
      pairMap: { ...pairMap.current },
    });
  }, [getViewport, onCanvasChange]);

  // 连线
  const onConnect = useCallback(
    (params) => {
      setEdges(eds => {
        const nextEdges = addEdge({
          ...params,
          style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
          animated: false,
        }, eds);
        edgesRef.current = nextEdges;
        queueMicrotask(() => syncGeneratorDataForEdgesRef.current?.(nextEdges));
        return nextEdges;
      });
    },
    [setEdges]
  );

  // 连线拖拽开始
  const onConnectStart = useCallback((event, { nodeId, handleType }) => {
    connectStartRef.current = { nodeId, handleType };
  }, []);

  // 连线拖拽结束（松手时）
  const onConnectEnd = useCallback((event) => {
    const source = connectStartRef.current;
    if (!source) return;

    connectStartRef.current = null;

    // 判断是否拖到了空白处
    const target = event.target;
    const isOnNode = target?.closest?.('.react-flow__node');
    if (isOnNode) return;

    const sourceNode = nodes.find(n => n.id === source.nodeId);
    if (!sourceNode) return;

    const clientX = event.clientX ?? event.pageX ?? 0;
    const clientY = event.clientY ?? event.pageY ?? 0;
    if (clientX === 0 && clientY === 0) return;

    // 标记：阻止 paneClick 立即关闭菜单
    justConnectedRef.current = true;
    setTimeout(() => { justConnectedRef.current = false; }, 300);

    const isInputDrag = source.handleType === 'target';
    setMenu({
      x: clientX,
      y: clientY,
      items: isInputDrag ? INPUT_DRAG_CREATE_MENU : OUTPUT_DRAG_CREATE_MENU,
      parentLabel: isInputDrag ? '添加输入节点' : '选择生成类型',
      dragSourceId: source.nodeId,
      dragSourceType: sourceNode.type,
      dragSide: isInputDrag ? 'left' : 'right',
      submenu: null,
    });
  }, [nodes]);

  const findDropTargetNodeId = useCallback((clientX, clientY, sourceNodeId, excludedNodeIds = null) => {
    const excludedIds = excludedNodeIds instanceof Set
      ? excludedNodeIds
      : new Set([sourceNodeId].filter(Boolean));
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    const nodeAtPoint = elementAtPoint?.closest?.('.react-flow__node');
    const directNodeId = nodeAtPoint?.getAttribute?.('data-id');
    if (directNodeId && !excludedIds.has(directNodeId)) return directNodeId;

    const nodesAtPoint = Array.from(document.querySelectorAll('.react-flow__node[data-id]'));
    const matchedNode = nodesAtPoint.find((nodeElement) => {
      const nodeId = nodeElement.getAttribute('data-id');
      if (!nodeId || excludedIds.has(nodeId)) return false;
      const rect = nodeElement.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    });

    return matchedNode?.getAttribute('data-id') || null;
  }, []);

  const syncGeneratorDataForEdges = useCallback((edgeSnapshot = edgesRef.current) => {
    setNodes(nds => {
      const nodesById = new Map(nds.map(node => [node.id, node]));
      const textReferencesByResult = {};
      const imagesByResult = {};
      const imageReferencesByResult = {};
      const videosByResult = {};
      const textReferencesBySplitter = {};
      const imagesBySplitter = {};
      const textReferencesByWorkflow = {};
      const imagesByWorkflow = {};
      const videosByWorkflow = {};

      for (const edge of edgeSnapshot) {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const addToTextBucket = (bucket, key, text) => {
          const trimmed = (text || '').trim();
          if (!trimmed) return;
          bucket[key] = [
            ...(bucket[key] || []),
            trimmed,
          ];
        };

        const addToImageBucket = (bucket, key, images) => {
          const validImages = normalizeImageList(images);
          if (validImages.length === 0) return;
          bucket[key] = [...new Set([
            ...(bucket[key] || []),
            ...validImages,
          ])];
        };

        const resultId = targetNode.id;
        const addTextReference = (text) => addToTextBucket(textReferencesByResult, resultId, text);
        const addImages = (images) => {
          const validImages = normalizeImageList(images);
          addToImageBucket(imagesByResult, resultId, validImages);
          if (targetNode.type === 'result' && validImages.length > 0) {
            imageReferencesByResult[resultId] = [
              ...(imageReferencesByResult[resultId] || []),
              ...validImages.map(value => ({ kind: 'image', value, edgeId: edge.id })),
            ];
          }
        };
        const addVideos = (videos) => {
          const validVideos = (videos || []).filter(Boolean);
          if (validVideos.length === 0) return;
          videosByResult[resultId] = [
            ...(videosByResult[resultId] || []),
            ...validVideos,
          ];
        };

        if (WORKFLOW_TEXT_NODE_TYPES.has(targetNode.type)) {
          const workflowId = targetNode.id;
          const addWorkflowText = (text) => addToTextBucket(textReferencesByWorkflow, workflowId, text);
          const addWorkflowImages = (images) => addToImageBucket(imagesByWorkflow, workflowId, images);
          const addWorkflowVideos = (videos) => {
            const validVideos = (videos || []).filter(Boolean);
            if (validVideos.length === 0) return;
            videosByWorkflow[workflowId] = [
              ...(videosByWorkflow[workflowId] || []),
              ...validVideos,
            ];
          };

          if (sourceNode.type === 'result') {
            const output = getResultNodeOutput(sourceNode);
            output.texts.forEach(addWorkflowText);
            addWorkflowImages(output.images);
            addWorkflowVideos(output.videos);
          }
          if (sourceNode.type === 'videoInput' || sourceNode.type === 'videoEditor') {
            addWorkflowVideos(getNodeOutputVideos({
              ...sourceNode,
              data: {
                ...sourceNode.data,
                videoUrls: sourceNode.type === 'videoInput'
                  ? videoInputs.current[sourceNode.id] || sourceNode.data?.videoUrls
                  : sourceNode.data?.videoUrls,
              },
            }));
          }
          if (sourceNode.type === 'storyboardCard') {
            const card = sourceNode.data?.card;
            if (card) {
              addWorkflowText(formatStoryboardCardForPrompt(card));
              if (card.imageUrl) addWorkflowImages([card.imageUrl]);
            }
          }
          if (WORKFLOW_TEXT_NODE_TYPES.has(sourceNode.type)) {
            addWorkflowText(getWorkflowNodeText(sourceNode));
            addWorkflowImages(getWorkflowNodeImages(sourceNode));
            addWorkflowVideos(getWorkflowNodeVideos(sourceNode));
          }
          continue;
        }

        if (targetNode.type === 'smartSplitter') {
          const splitterId = targetNode.id;
          const addSplitterText = (text) => addToTextBucket(textReferencesBySplitter, splitterId, text);
          const addSplitterImages = (images) => addToImageBucket(imagesBySplitter, splitterId, images);

          if (sourceNode.type === 'result') {
            const output = getResultNodeOutput(sourceNode);
            output.texts.forEach(addSplitterText);
            addSplitterImages(output.images);
          }
          if (sourceNode.type === 'storyboardCard') {
            const card = sourceNode.data?.card;
            if (card) {
              addSplitterText(formatStoryboardCardForPrompt(card));
              if (card.imageUrl) addSplitterImages([card.imageUrl]);
            }
          }
          if (sourceNode.type === 'character') {
            addSplitterText(getCharacterNodeText(sourceNode));
            addSplitterImages(getCharacterNodeImages(sourceNode));
          }
          continue;
        }

        if (targetNode.type !== 'result') continue;

        if (sourceNode.type === 'smartSplitter') {
          addImages([
            ...(imagesBySplitter[sourceNode.id] || []),
            ...(sourceNode.data?.connected_images || []),
            ...(sourceNode.data?.uploaded_reference_images || []),
          ]);
          continue;
        }

        if (WORKFLOW_TEXT_NODE_TYPES.has(sourceNode.type)) {
          addTextReference(getWorkflowNodeText(sourceNode));
          addImages(getWorkflowNodeImages(sourceNode));
          addVideos(getWorkflowNodeVideos(sourceNode));
        }

        if (sourceNode.type === 'result') {
          // 如果这条边带 sourceHandle = `card-N` / `img-N`，只取对应的卡片或图片喂给下游
          const handleId = edge.sourceHandle;
          if (handleId && /^card-(\d+)$/.test(handleId)) {
            const idx = parseInt(RegExp.$1, 10);
            const cards = Array.isArray(sourceNode.data?.storyboardCards) ? sourceNode.data.storyboardCards : [];
            const card = cards[idx];
            if (card) {
              addTextReference(formatStoryboardCardForPrompt(card));
              if (card.imageUrl) addImages([card.imageUrl]);
            }
          } else if (handleId && /^img-(\d+)$/.test(handleId)) {
            addImages(getConnectedImagesForNewGenerator({
              generatorType: targetNode.data?.resultType,
              sourceNode,
              sourceHandle: handleId,
            }));
          } else {
            const output = getResultNodeOutput(sourceNode);
            output.texts.forEach(addTextReference);
            addImages(output.images);
            addVideos(output.videos);
          }
        }

        if (sourceNode.type === 'videoInput' || sourceNode.type === 'videoEditor') {
          addVideos(getNodeOutputVideos({
            ...sourceNode,
            data: {
              ...sourceNode.data,
              videoUrls: sourceNode.type === 'videoInput'
                ? videoInputs.current[sourceNode.id] || sourceNode.data?.videoUrls
                : sourceNode.data?.videoUrls,
            },
          }));
        }

        if (sourceNode.type === 'storyboardCard') {
          const card = sourceNode.data?.card;
          if (card) {
            addTextReference(formatStoryboardCardForPrompt(card));
            if (card.imageUrl) addImages([card.imageUrl]);
          }
        }

        if (sourceNode.type === 'character') {
          addTextReference(getCharacterNodeText(sourceNode));
          addImages(getCharacterNodeImages(sourceNode));
        }

      }

      return nds.map(n => {
        if (WORKFLOW_TEXT_NODE_TYPES.has(n.type)) {
          const connectedTextReferences = textReferencesByWorkflow[n.id] || [];
          const connectedImages = [...new Set(normalizeImageList(imagesByWorkflow[n.id] || []))];
          const connectedVideos = [...new Set(videosByWorkflow[n.id] || [])];
          return {
            ...n,
            data: {
              ...n.data,
              connectedTextReferences,
              connectedPrompt: appendPrompt(...connectedTextReferences),
              referenceImages: connectedImages,
              referenceVideos: connectedVideos,
              connectedVideos,
            },
          };
        }

        if (n.type === 'smartSplitter') {
          const connectedTextReferences = textReferencesBySplitter[n.id] || [];
          const connectedImages = [...new Set(normalizeImageList(imagesBySplitter[n.id] || []))];
          return {
            ...n,
            data: {
              ...n.data,
              connectedPrompt: appendPrompt(...connectedTextReferences),
              connectedTextReferences,
              connected_images: connectedImages,
              referenceImageCount: [...new Set([
                ...connectedImages,
                ...normalizeImageList(n.data?.uploaded_reference_images || []),
              ])].length,
            },
          };
        }

        if (n.type !== 'generator') return n;
        const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === n.id)?.[0];
        if (!resultId) return n;

        const connectedTextReferences = textReferencesByResult[resultId] || [];
        const connectedImages = [...new Set(normalizeImageList(imagesByResult[resultId] || []))];
        const connectedVideos = videosByResult[resultId] || [];
        const connectedReferences = (imageReferencesByResult[resultId] || [])
          .filter(reference => connectedImages.includes(reference.value))
          .filter((reference, index, references) => (
            references.findIndex(item => (
              item.kind === reference.kind
              && item.value === reference.value
              && item.edgeId === reference.edgeId
            )) === index
          ));
        return {
          ...n,
          data: {
            ...n.data,
            connectedTextReferences,
            connectedPrompt: appendPrompt(...connectedTextReferences),
            connectedImages,
            connectedVideos,
            connectedReferences,
          },
        };
      });
    });
  }, [getAbsoluteNodePosition, setNodes]);

  syncGeneratorDataForEdgesRef.current = syncGeneratorDataForEdges;

  const deleteCanvasEdge = useCallback((edgeId) => {
    if (!edgeId) return;
    setEdges(currentEdges => {
      const nextEdges = currentEdges.filter(edge => edge.id !== edgeId);
      if (nextEdges.length === currentEdges.length) return currentEdges;
      edgesRef.current = nextEdges;
      queueMicrotask(() => syncGeneratorDataForEdges(nextEdges));
      return nextEdges;
    });
  }, [setEdges, syncGeneratorDataForEdges]);

  const connectCanvasNodes = useCallback((sourceId, targetId, sourceHandle = null) => {
    setEdges(eds => {
      const hasSameEdge = eds.some(edge => (
        edge.source === sourceId &&
        edge.target === targetId &&
        (edge.sourceHandle || null) === sourceHandle
      ));
      if (hasSameEdge) return eds;

      const edgeId = `e_${sourceId}${sourceHandle ? `--${sourceHandle}` : ''}_${targetId}`;
      const nextEdges = addEdge({
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceHandle: sourceHandle || undefined,
        zIndex: 1,
        style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
        animated: false,
      }, eds);
      edgesRef.current = nextEdges;
      queueMicrotask(() => syncGeneratorDataForEdges(nextEdges));
      return nextEdges;
    });
  }, [setEdges, syncGeneratorDataForEdges]);

  const connectMultipleCanvasNodes = useCallback((sourceIds, targetId) => {
    const uniqueSourceIds = [...new Set((sourceIds || []).filter(Boolean))]
      .filter(sourceId => sourceId !== targetId);
    if (uniqueSourceIds.length === 0 || !targetId) return;

    setEdges(eds => {
      let nextEdges = eds;
      let changed = false;

      uniqueSourceIds.forEach(sourceId => {
        const hasSameEdge = nextEdges.some(edge => (
          edge.source === sourceId &&
          edge.target === targetId &&
          !edge.sourceHandle
        ));
        if (hasSameEdge) return;

        const edgeId = `e_${sourceId}_${targetId}`;
        nextEdges = addEdge({
          id: edgeId,
          source: sourceId,
          target: targetId,
          zIndex: 1,
          style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
          animated: false,
        }, nextEdges);
        changed = true;
      });

      if (!changed) return eds;
      edgesRef.current = nextEdges;
      queueMicrotask(() => syncGeneratorDataForEdges(nextEdges));
      return nextEdges;
    });
  }, [setEdges, syncGeneratorDataForEdges]);

  // 交互圆点拖拽结束：落到节点则连线，落到空白处则弹出创建菜单
  // extra: { kind: 'storyboardCard', cardIndex } — 从分镜卡片连出时携带，用于标记 sourceHandle
  const onInteractiveDragCreate = useCallback((nodeId, side, clientX, clientY, extra, connectionStart) => {
    const latestNodes = nodesRef.current;
    const sourceNode = latestNodes.find(n => n.id === nodeId);
    if (!sourceNode) return;

    // 构造 sourceHandle：
    // - 分镜卡片 → card-{index}
    // - 多图结果节点的某张图 → img-{index}
    let sourceHandle = null;
    if (extra && extra.kind === 'storyboardCard' && Number.isInteger(extra.cardIndex)) {
      sourceHandle = `card-${extra.cardIndex}`;
    } else if (extra && extra.kind === 'resultImage' && Number.isInteger(extra.imageIndex)) {
      sourceHandle = `img-${extra.imageIndex}`;
    }

    const targetNodeId = findDropTargetNodeId(clientX, clientY, nodeId);

    if (targetNodeId) {
      const edgeSource = side === 'left' ? targetNodeId : nodeId;
      const edgeTarget = side === 'left' ? nodeId : targetNodeId;
      // 已有节点连线：sourceHandle 只在 source 是 nodeId（圆点所在节点）时使用
      const finalSourceHandle = (edgeSource === nodeId) ? sourceHandle : null;
      connectCanvasNodes(edgeSource, edgeTarget, finalSourceHandle);
      setMenu(null);
      return;
    }

    justConnectedRef.current = true;
    setTimeout(() => { justConnectedRef.current = false; }, 300);
    const isInputDrag = side === 'left';
    let parentLabel = isInputDrag ? '添加输入节点' : '选择生成类型';
    if (!isInputDrag && sourceHandle && sourceHandle.startsWith('card-')) {
      parentLabel = `分镜卡片 ${sourceHandle} → 选择生成类型`;
    } else if (!isInputDrag && sourceHandle && sourceHandle.startsWith('img-')) {
      const idx = Number(sourceHandle.replace('img-', '')) + 1;
      parentLabel = `图 ${idx} → 选择生成类型`;
    }
    setMenu({
      x: clientX,
      y: clientY,
      items: isInputDrag ? INPUT_DRAG_CREATE_MENU : OUTPUT_DRAG_CREATE_MENU,
      parentLabel,
      dragSourceId: nodeId,
      dragSourceType: sourceNode.type,
      dragSourceHandle: sourceHandle,
      dragSide: side,
      connectionStart: Number.isFinite(connectionStart?.x) && Number.isFinite(connectionStart?.y)
        ? connectionStart
        : null,
      submenu: null,
    });
  }, [connectCanvasNodes, findDropTargetNodeId]);

  const onSelectionDragCreate = useCallback((sourceIds, side, clientX, clientY) => {
    const validSourceIds = [...new Set((sourceIds || []).filter(Boolean))]
      .filter(sourceId => nodesRef.current.some(node => node.id === sourceId && node.type !== 'generator'));
    if (side !== 'right' || validSourceIds.length < 2) return;

    const targetNodeId = findDropTargetNodeId(clientX, clientY, null, new Set(validSourceIds));
    if (targetNodeId) {
      connectMultipleCanvasNodes(validSourceIds, targetNodeId);
      setMenu(null);
      return;
    }

    justConnectedRef.current = true;
    setTimeout(() => { justConnectedRef.current = false; }, 300);
    setMenu({
      x: clientX,
      y: clientY,
      items: OUTPUT_DRAG_CREATE_MENU,
      parentLabel: `${validSourceIds.length} 个节点 → 选择生成类型`,
      dragSourceIds: validSourceIds,
      dragSide: 'right',
      submenu: null,
    });
  }, [connectMultipleCanvasNodes, findDropTargetNodeId]);

  // 更新 generator 显隐状态
  const updateGeneratorVisibility = useCallback((nextResultId) => {
    activeResultRef.current = nextResultId;
    setActiveResultId(nextResultId);
  }, []);

  const focusCopilotTargetNode = useCallback((nodeId) => {
    if (!nodesRef.current.some(node => node.id === nodeId && isSelectableCanvasNode(node))) return;
    setNodes(current => current.map(node => ({
      ...node,
      selected: node.id === nodeId,
    })));
    updateGeneratorVisibility(null);
    fitView({
      nodes: [{ id: nodeId }],
      duration: 420,
      padding: 0.28,
      minZoom: CANVAS_MIN_ZOOM,
      maxZoom: 1.2,
    });
  }, [fitView, setNodes, updateGeneratorVisibility]);

  // 查找节点的所有上下游边
  const findConnectedEdgeIds = useCallback((nodeId) => {
    const visited = new Set();
    const edgeIds = new Set();
    // 下游：从 nodeId 出发，沿着 source → target 方向
    const walkDown = (nid) => {
      for (const edge of edgesRef.current) {
        if (edge.source === nid && !visited.has(edge.id)) {
          visited.add(edge.id);
          edgeIds.add(edge.id);
          walkDown(edge.target);
        }
      }
    };
    // 上游：从 nodeId 出发，沿着 target → source 方向
    const walkUp = (nid) => {
      for (const edge of edgesRef.current) {
        if (edge.target === nid && !visited.has(edge.id)) {
          visited.add(edge.id);
          edgeIds.add(edge.id);
          walkUp(edge.source);
        }
      }
    };
    walkDown(nodeId);
    walkUp(nodeId);
    return edgeIds;
  }, []);

  // 高亮选中节点的上下游连线
  const highlightEdges = useCallback((nodeId) => {
    const connectedIds = findConnectedEdgeIds(nodeId);
    setEdges(eds => eds.map(edge =>
      connectedIds.has(edge.id)
        ? { ...edge, style: { stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 4' }, animated: true }
        : { ...edge, style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 }, animated: false }
    ));
  }, [findConnectedEdgeIds, setEdges]);

  // 重置所有连线为默认样式
  const resetEdgeStyles = useCallback(() => {
    setEdges(eds => eds.map(edge => ({
      ...edge,
      style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
      animated: false,
    })));
  }, [setEdges]);


  const getGroupMinimumSize = useCallback((groupNode, nodeSnapshot = nodesRef.current) => {
    const children = nodeSnapshot.filter(node => node.parentNode === groupNode.id);
    if (children.length === 0) {
      return { width: 220, height: 140 };
    }

    const maxRight = Math.max(...children.map(node => (node.position?.x || 0) + getNodeWidth(node)));
    const maxBottom = Math.max(...children.map(node => (node.position?.y || 0) + getNodeHeight(node)));
    return {
      width: Math.max(220, maxRight + GROUP_PADDING),
      height: Math.max(140, maxBottom + GROUP_PADDING),
    };
  }, []);

  const onGroupNameChange = useCallback((groupId, label) => {
    setNodes(nds => nds.map(node => (
      node.id === groupId ? { ...node, data: { ...node.data, label } } : node
    )));
  }, [setNodes]);

  const openSaveTemplateDialog = useCallback((groupId) => {
    const group = nodesRef.current.find(node => node.id === groupId && node.type === 'group');
    if (!group) return;
    setSaveTemplateError('');
    setSaveTemplateGroupId(groupId);
  }, []);

  const saveTemplateSummary = useMemo(() => {
    if (!saveTemplateGroupId) return { name: '', nodeCount: 0, edgeCount: 0 };
    const group = nodes.find(node => node.id === saveTemplateGroupId);
    const childIds = new Set(nodes.filter(node => node.parentNode === saveTemplateGroupId).map(node => node.id));
    return {
      name: group?.data?.label || '未命名模板',
      nodeCount: childIds.size,
      edgeCount: edges.filter(edge => childIds.has(edge.source) && childIds.has(edge.target)).length,
    };
  }, [edges, nodes, saveTemplateGroupId]);

  const confirmSaveWorkflowTemplate = useCallback(async ({ name, description }) => {
    if (!saveTemplateGroupId || !setWorkflowTemplates) return;
    setSaveTemplatePending(true);
    setSaveTemplateError('');
    try {
      const snapshot = createWorkflowTemplateSnapshot({
        groupId: saveTemplateGroupId,
        nodes: nodesRef.current,
        edges: edgesRef.current,
        pairMap: pairMap.current,
        name,
        description,
      });
      const replacements = {};
      const assetIds = [];
      const remoteOrLocalUrls = [];

      for (const url of snapshot.mediaUrls || []) {
        if (url.startsWith('data:image/')) {
          const blob = await (await fetch(url)).blob();
          const extension = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const asset = await uploadImageFile(new File([blob], `template.${extension}`, { type: blob.type }));
          replacements[url] = asset;
          if (asset?.id) assetIds.push(asset.id);
        } else {
          remoteOrLocalUrls.push(url);
        }
      }

      if (remoteOrLocalUrls.length > 0) {
        const response = await fetch(`${API_BASE}/api/assets/localize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: remoteOrLocalUrls }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.error || '资源本地化失败');
        }
        Object.assign(replacements, payload.mapping || {});
        (payload.assets || []).forEach(asset => {
          if (asset?.id) assetIds.push(asset.id);
        });
      }

      const localized = replaceTemplateMediaUrls(snapshot, replacements);
      delete localized.mediaUrls;
      localized.assetIds = [...new Set(assetIds)];
      setWorkflowTemplates(current => [localized, ...current]);
      setSaveTemplateGroupId(null);
    } catch (error) {
      setSaveTemplateError(error?.message || '模板保存失败');
    } finally {
      setSaveTemplatePending(false);
    }
  }, [saveTemplateGroupId, setWorkflowTemplates]);

  const onGroupResize = useCallback((groupId, size) => {
    setNodes(nds => {
      const groupNode = nds.find(node => node.id === groupId);
      if (!groupNode) return nds;
      const minSize = getGroupMinimumSize(groupNode, nds);
      return nds.map(node => (
        node.id === groupId
          ? {
            ...node,
            style: {
              ...node.style,
              width: Math.max(Math.round(size.width), minSize.width),
              height: Math.max(Math.round(size.height), minSize.height),
            },
          }
          : node
      ));
    });
  }, [getGroupMinimumSize, setNodes]);

  const ungroupNodes = useCallback((groupId) => {
    setNodes(nds => {
      const groupNode = nds.find(node => node.id === groupId);
      if (!groupNode) return nds;
      const groupPosition = groupNode.position || { x: 0, y: 0 };
      return nds
        .filter(node => node.id !== groupId)
        .map(node => {
          if (node.parentNode !== groupId) return node;
          return {
            ...node,
            parentNode: undefined,
            extent: undefined,
            position: {
              x: groupPosition.x + (node.position?.x || 0),
              y: groupPosition.y + (node.position?.y || 0),
            },
            selected: true,
          };
        });
    });
  }, [setNodes]);

  const unstackNodes = useCallback((stackId) => {
    setNodes(nds => unstackCanvasNodes(nds, stackId));
  }, [setNodes]);

  const createStackFromNodeIds = useCallback((nodeIds) => {
    const graph = createCanvasStackGraph({
      nodes: nodesRef.current,
      selectedIds: nodeIds,
      stackId: `stack_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    });
    if (!graph) return;
    setNodes(nds => [
      graph.stack,
      ...graph.nodes.map(node => node.type === 'stack'
        ? { ...node, selected: false }
        : node),
    ].map(node => node.id === graph.stack.id
      ? { ...node, data: { ...node.data, onUnstack: unstackNodes } }
      : node));
  }, [setNodes, unstackNodes]);

  const createGroupFromNodeIds = useCallback((nodeIds) => {
    const uniqueIds = [...new Set(nodeIds)].filter(Boolean);
    if (uniqueIds.length < 2) return;

    setNodes(nds => {
      const selectedNodes = nds.filter(node => (
        uniqueIds.includes(node.id) &&
        node.type !== 'group' &&
        node.type !== 'generator' &&
        !node.parentNode
      ));
      if (selectedNodes.length < 2) return nds;

      const boxes = selectedNodes.map(node => {
        const position = getAbsoluteNodePosition(node, nds);
        return {
          node,
          x: position.x,
          y: position.y,
          width: getNodeWidth(node),
          height: getNodeHeight(node),
        };
      });
      const minX = Math.min(...boxes.map(box => box.x));
      const minY = Math.min(...boxes.map(box => box.y));
      const maxX = Math.max(...boxes.map(box => box.x + box.width));
      const maxY = Math.max(...boxes.map(box => box.y + box.height));
      const groupId = `group_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const nextGroupIndex = nds.filter(node => node.type === 'group').length + 1;
      const groupPosition = {
        x: minX - GROUP_PADDING,
        y: minY - GROUP_PADDING - GROUP_LABEL_SPACE,
      };
      const groupNode = {
        id: groupId,
        type: 'group',
        position: groupPosition,
        data: { label: `组合 ${nextGroupIndex}`, childIds: selectedNodes.map(node => node.id), onDeleteNode: deleteCanvasNode, onUngroup: ungroupNodes, onSaveTemplate: openSaveTemplateDialog, onGroupResize, onGroupNameChange },
        style: {
          width: maxX - minX + GROUP_PADDING * 2,
          height: maxY - minY + GROUP_PADDING * 2 + GROUP_LABEL_SPACE,
        },
        selected: true,
        zIndex: 0,
      };

      const selectedSet = new Set(selectedNodes.map(node => node.id));
      return [
        groupNode,
        ...nds.map(node => {
          if (!selectedSet.has(node.id)) return { ...node, selected: false };
          const absolute = getAbsoluteNodePosition(node, nds);
          return {
            ...node,
            parentNode: groupId,
            position: {
              x: absolute.x - groupPosition.x,
              y: absolute.y - groupPosition.y,
            },
            selected: false,
            zIndex: 1,
          };
        }),
      ];
    });
  }, [deleteCanvasNode, getAbsoluteNodePosition, onGroupNameChange, onGroupResize, openSaveTemplateDialog, setNodes, ungroupNodes]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isEditableKeyTarget(event.target)) return;
      const isCommand = event.metaKey || event.ctrlKey;
      if (!isCommand) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoCanvas();
        return;
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoCanvas();
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        const selectedIds = nodesRef.current
          .filter(node => node.selected)
          .map(node => node.id);
        createGroupFromNodeIds(selectedIds);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createGroupFromNodeIds, redoCanvas, undoCanvas]);

  // 置顶节点
  const bringToFront = useCallback((nodeId) => {
    setNodes(nds => {
      const target = nds.find(n => n.id === nodeId);
      if (!target) return nds;
      const genId = target.type === 'result' ? pairMap.current[nodeId] : null;
      const others = nds.filter(n => n.id !== nodeId && n.id !== genId);
      const top = [target];
      if (genId) {
        const gen = nds.find(n => n.id === genId);
        if (gen) top.push(gen);
      }
      return [...others, ...top];
    });
  }, [setNodes]);

  const applySelectedNodeIds = useCallback((selectedIds) => {
    setNodes(nds => nds.map(n => (
      n.type === 'generator'
        ? { ...n, selected: false }
        : { ...n, selected: selectedIds.has(n.id) }
    )));
  }, [setNodes]);

  const handleCanvasPointerDownCapture = useCallback((event) => {
    shiftNodeSelectionSnapshotRef.current = null;
    optionDragSelectionSnapshotRef.current = null;
    if (isSpacePanning || event.button !== 0 || shouldSuppressNodeSelectionEvent(event)) {
      return;
    }

    const nodeId = getNodeIdFromSelectionEvent(event);
    const clickedNode = nodeId ? nodesRef.current.find(n => n.id === nodeId) : null;
    if (!isSelectableCanvasNode(clickedNode)) {
      return;
    }

    const isOptionDrag = Boolean(event.altKey || event.nativeEvent?.altKey);
    if (isOptionDrag && clickedNode.selected) {
      const selectedIds = getSelectableSelectedNodeIds(nodesRef.current);
      if (selectedIds.has(nodeId) && selectedIds.size > 1) {
        optionDragSelectionSnapshotRef.current = {
          nodeId,
          selectedIds,
        };
      }
    }

    if (!event.shiftKey) return;
    shiftNodeSelectionSnapshotRef.current = {
      nodeId,
      selectedIds: getSelectableSelectedNodeIds(nodesRef.current),
    };
  }, [isSpacePanning]);

  const handleCanvasClickCapture = useCallback((event) => {
    if (isSpacePanning || !event.shiftKey || shouldSuppressNodeSelectionEvent(event)) {
      shiftNodeSelectionSnapshotRef.current = null;
      return;
    }

    const nodeId = getNodeIdFromSelectionEvent(event);
    const clickedNode = nodeId ? nodesRef.current.find(n => n.id === nodeId) : null;
    if (!isSelectableCanvasNode(clickedNode)) {
      shiftNodeSelectionSnapshotRef.current = null;
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    setMenu(null);

    const clickSnapshot = shiftNodeSelectionSnapshotRef.current;
    const selectedIdsBeforeClick = clickSnapshot?.nodeId === nodeId
      ? clickSnapshot.selectedIds
      : getSelectableSelectedNodeIds(nodesRef.current);
    const nextSelectedIds = computeShiftNodeSelection({
      nodes: nodesRef.current,
      clickedNodeId: nodeId,
      selectedIdsBeforeClick,
    });

    shiftNodeSelectionSnapshotRef.current = null;
    updateGeneratorVisibility(null);
    applySelectedNodeIds(nextSelectedIds);
    requestAnimationFrame(() => applySelectedNodeIds(nextSelectedIds));
    highlightEdges(nodeId);
    bringToFront(nodeId);
  }, [applySelectedNodeIds, bringToFront, highlightEdges, isSpacePanning, updateGeneratorVisibility]);

  // 点击 result 节点 → 显示对应 generator
  const onNodeClick = useCallback((event, node) => {
    if (isSpacePanning) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    setMenu(null);
    if (shouldSuppressNodeSelectionEvent(event)) {
      return;
    }
    if (copilotOpen && copilotPickingNode) {
      event.stopPropagation();
      event.preventDefault();
      if (!isSelectableCanvasNode(node)) return;
      setCopilotPickingNode(false);
      setNodes(nds => nds.map(item => ({
        ...item,
        selected: item.id === node.id,
      })));
      updateGeneratorVisibility(null);
      highlightEdges(node.id);
      bringToFront(node.id);
      return;
    }
    if (event.shiftKey) {
      event.stopPropagation();
      event.preventDefault();
      const clickSnapshot = shiftNodeSelectionSnapshotRef.current;
      const selectedIdsBeforeClick = clickSnapshot?.nodeId === node.id
        ? clickSnapshot.selectedIds
        : getSelectableSelectedNodeIds(nodesRef.current);
      const nextSelectedIds = computeShiftNodeSelection({
        nodes: nodesRef.current,
        clickedNodeId: node.id,
        selectedIdsBeforeClick,
      });
      shiftNodeSelectionSnapshotRef.current = null;
      updateGeneratorVisibility(null);
      applySelectedNodeIds(nextSelectedIds);
      requestAnimationFrame(() => applySelectedNodeIds(nextSelectedIds));
      highlightEdges(node.id);
      bringToFront(node.id);
      return;
    } else {
      setNodes(nds => nds.map(n => (
        n.id === node.id ? { ...n, selected: true } : { ...n, selected: false }
      )));
    }
    updateGeneratorVisibility(
      shouldOpenResultComposer(node)
        ? node.id
        : null
    );
    setActiveSmartSplitterId(node.type === 'smartSplitter' ? node.id : null);
    highlightEdges(node.id);
    bringToFront(node.id);
  }, [applySelectedNodeIds, bringToFront, copilotOpen, copilotPickingNode, highlightEdges, isSpacePanning, setNodes, updateGeneratorVisibility]);

  /* ---- 对齐辅助线 ---- */
  const nodeEdges = useCallback((node) => {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    const w = getNodeWidth(node);
    const h = getNodeHeight(node);
    return {
      left: x, centerX: x + w / 2, right: x + w,
      top: y, centerY: y + h / 2, bottom: y + h,
    };
  }, []);

  const computeAlignmentGuides = useCallback((draggedNode, nodes, viewport) => {
    if (draggedNode.type === 'generator') return null;
    const dragEdges = nodeEdges(draggedNode);
    const threshold = ALIGN_SNAP_THRESHOLD / (viewport[2] || 1);
    const guides = [];
    let snapX = null, snapY = null;

    const others = nodes.filter(n =>
      n.id !== draggedNode.id &&
      n.type !== 'generator' &&
      !n.parentNode &&
      (n.style?.display !== 'none')
    );

    for (const other of others) {
      const oe = nodeEdges(other);

      // 纵向对齐：左 / 中 / 右
      for (const [key, val] of [['left', dragEdges.left], ['centerX', dragEdges.centerX], ['right', dragEdges.right]]) {
        for (const [okey, oval] of [['left', oe.left], ['centerX', oe.centerX], ['right', oe.right]]) {
          if (Math.abs(val - oval) < threshold) {
            if (key === 'left') snapX = oval;
            else if (key === 'centerX') snapX = oval - getNodeWidth(draggedNode) / 2;
            else snapX = oval - getNodeWidth(draggedNode);

            const top = Math.min(dragEdges.top, oe.top);
            const bottom = Math.max(dragEdges.bottom, oe.bottom);
            guides.push({
              type: 'v',
              x1: oval, y1: top, x2: oval, y2: bottom,
              key: `v-${oval.toFixed(1)}-${top.toFixed(0)}-${bottom.toFixed(0)}`,
            });
          }
        }
      }

      // 横向对齐：上 / 中 / 下
      for (const [key, val] of [['top', dragEdges.top], ['centerY', dragEdges.centerY], ['bottom', dragEdges.bottom]]) {
        for (const [okey, oval] of [['top', oe.top], ['centerY', oe.centerY], ['bottom', oe.bottom]]) {
          if (Math.abs(val - oval) < threshold) {
            if (key === 'top') snapY = oval;
            else if (key === 'centerY') snapY = oval - getNodeHeight(draggedNode) / 2;
            else snapY = oval - getNodeHeight(draggedNode);

            const left = Math.min(dragEdges.left, oe.left);
            const right = Math.max(dragEdges.right, oe.right);
            guides.push({
              type: 'h',
              x1: left, y1: oval, x2: right, y2: oval,
              key: `h-${oval.toFixed(1)}-${left.toFixed(0)}-${right.toFixed(0)}`,
            });
          }
        }
      }
    }

    // 去重
    const seen = new Set();
    const unique = guides.filter(g => {
      if (seen.has(g.key)) return false;
      seen.add(g.key);
      return true;
    });

    return { guides: unique, snapX, snapY };
  }, [nodeEdges]);

  const getDragClientPoint = useCallback((event) => {
    const nativeEvent = event?.nativeEvent || event;
    if (Number.isFinite(nativeEvent?.clientX) && Number.isFinite(nativeEvent?.clientY)) {
      return { x: nativeEvent.clientX, y: nativeEvent.clientY };
    }
    const touch = nativeEvent?.touches?.[0] || nativeEvent?.changedTouches?.[0];
    if (Number.isFinite(touch?.clientX) && Number.isFinite(touch?.clientY)) {
      return { x: touch.clientX, y: touch.clientY };
    }
    return null;
  }, []);

  const onNodeDragStart = useCallback((event, draggedNode) => {
    optionDragCopyRef.current = null;
    setOptionDragGhost(null);
    const selectionSnapshot = optionDragSelectionSnapshotRef.current;
    optionDragSelectionSnapshotRef.current = null;
    const isOptionDrag = Boolean(event?.altKey || event?.nativeEvent?.altKey);
    if (!isOptionDrag || !draggedNode || draggedNode.type === 'generator') return;
    const startClientPoint = getDragClientPoint(event);
    if (!startClientPoint) return;

    const nodeSnapshot = nodesRef.current;
    const liveDraggedNode = nodeSnapshot.find(node => node.id === draggedNode.id) || draggedNode;
    const directlySelectedIds = resolveOptionDragSelectedNodeIds({
      nodes: nodeSnapshot,
      draggedNodeId: liveDraggedNode.id,
      selectedIdsBeforeDrag: selectionSnapshot?.nodeId === liveDraggedNode.id
        ? selectionSnapshot.selectedIds
        : null,
    });
    const directlySelected = nodeSnapshot.filter(node => directlySelectedIds.has(node.id));

    const clipboardSnapshot = copySelectedNodesRef.current?.({
      directlySelected,
      stripSingleSelectedGroup: false,
      storeClipboard: false,
    });
    if (!clipboardSnapshot || !Array.isArray(clipboardSnapshot.entries) || clipboardSnapshot.entries.length === 0) {
      return;
    }

    const sourceIds = new Set(clipboardSnapshot.entries.map(entry => entry._oldId).filter(Boolean));
    const sourceCount = sourceIds.size;
    const restoreNodes = nodeSnapshot
      .filter(node => sourceIds.has(node.id))
      .map(node => ({
        id: node.id,
        position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
        parentNode: node.parentNode,
        extent: node.extent,
        zIndex: node.zIndex,
      }));

    optionDragCopyRef.current = {
      draggedNodeId: liveDraggedNode.id,
      sourceIds,
      startPointerFlow: screenToFlowPosition(startClientPoint),
      currentPointerFlow: screenToFlowPosition(startClientPoint),
      clipboardSnapshot,
      restoreNodes,
    };
    const ghostItems = restoreNodes
      .map((node) => {
        const element = getCanvasNodeElement(node.id);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
        return {
          id: node.id,
          className: element.className || '',
          html: createNodePreviewMarkup(element),
          width: rect.width,
          height: rect.height,
          offsetX: rect.left - startClientPoint.x,
          offsetY: rect.top - startClientPoint.y,
        };
      })
      .filter(Boolean);
    setOptionDragGhost({
      x: startClientPoint.x,
      y: startClientPoint.y,
      count: sourceCount,
      items: ghostItems,
    });
  }, [getDragClientPoint, screenToFlowPosition]);

  const onNodeDrag = useCallback((event, draggedNode) => {
    const optionCopy = optionDragCopyRef.current;
    if (optionCopy?.sourceIds?.has(draggedNode?.id)) {
      const point = getDragClientPoint(event);
      if (point) {
        optionCopy.currentPointerFlow = screenToFlowPosition(point);
        setOptionDragGhost(prev => {
          const next = {
            ...(prev || {}),
            x: point.x,
            y: point.y,
            count: optionCopy.sourceIds?.size || prev?.count || 1,
          };
          return prev && prev.x === next.x && prev.y === next.y && prev.count === next.count
            ? prev
            : next;
        });
      }
      setAlignmentGuides(null);
      return;
    }

    const result = computeAlignmentGuides(draggedNode, nodesRef.current, viewportTransform);
    if (!result || result.guides.length === 0) {
      setAlignmentGuides(null);
      return;
    }
    // only update state if guides changed (avoid thrashing)
    setAlignmentGuides(prev => {
      const newKeys = result.guides.map(g => g.key).sort().join(',');
      const prevKeys = prev?.guides?.map(g => g.key).sort().join(',') || '';
      if (newKeys === prevKeys && prev?.snapX === result.snapX && prev?.snapY === result.snapY) {
        return prev;
      }
      return result;
    });

    // snap position
    if (result.snapX != null || result.snapY != null) {
      setNodes(nds => nds.map(n => {
        if (n.id !== draggedNode.id) return n;
        const pos = { ...n.position };
        if (result.snapX != null) pos.x = result.snapX;
        if (result.snapY != null) pos.y = result.snapY;
        return { ...n, position: pos };
      }));
    }
  }, [getDragClientPoint, screenToFlowPosition, computeAlignmentGuides, viewportTransform, setNodes]);

  const onNodeDragStop = useCallback((event, draggedNode) => {
    setAlignmentGuides(null);
    const optionCopy = optionDragCopyRef.current;
    if (optionCopy?.sourceIds?.has(draggedNode?.id)) {
      optionDragCopyRef.current = null;
      const endClientPoint = getDragClientPoint(event);
      const endPointerFlow = endClientPoint
        ? screenToFlowPosition(endClientPoint)
        : optionCopy.currentPointerFlow;
      const dx = (endPointerFlow?.x ?? optionCopy.startPointerFlow.x) - optionCopy.startPointerFlow.x;
      const dy = (endPointerFlow?.y ?? optionCopy.startPointerFlow.y) - optionCopy.startPointerFlow.y;
      const restoreById = new Map(optionCopy.restoreNodes.map(node => [node.id, node]));
      setOptionDragGhost(null);

      setNodes(nds => nds.map(node => {
        const restore = restoreById.get(node.id);
        if (!restore) return node;
        return {
          ...node,
          position: { ...restore.position },
          parentNode: restore.parentNode,
          extent: restore.extent,
          zIndex: restore.zIndex,
          selected: false,
        };
      }));

      pasteNodesRef.current?.({
        clip: optionCopy.clipboardSnapshot,
        offset: { dx, dy },
        incrementPasteCount: false,
        selectNewNodes: true,
      });
      return;
    }

    if (draggedNode.type === 'group' || draggedNode.type === 'generator') {
      return;
    }

    // 节点已在组内 → 检测是否拖出了组
    if (draggedNode.parentNode) {
      setNodes(nds => {
        const parent = nds.find(n => n.id === draggedNode.parentNode);
        if (!parent || parent.type !== 'group') return nds;
        const parentPos = getAbsoluteNodePosition(parent, nds);
        const pWidth = getNodeWidth(parent);
        const pHeight = getNodeHeight(parent);
        const absX = (draggedNode.position?.x ?? 0) + parentPos.x;
        const absY = (draggedNode.position?.y ?? 0) + parentPos.y;
        const centerX = absX + getNodeWidth(draggedNode) / 2;
        const centerY = absY + getNodeHeight(draggedNode) / 2;
        const isOutside = (
          centerX < parentPos.x ||
          centerX > parentPos.x + pWidth ||
          centerY < parentPos.y ||
          centerY > parentPos.y + pHeight
        );

        if (isOutside) {
          return nds.map(node => {
            if (node.id === parent.id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  childIds: (node.data?.childIds || []).filter(childId => childId !== draggedNode.id),
                },
              };
            }
            if (node.id !== draggedNode.id) return node;
            return {
              ...node,
              parentNode: undefined,
              extent: undefined,
              position: { x: absX, y: absY },
            };
          });
        }
        return nds;
      });
      return;
    }

    const draggedPosition = getAbsoluteNodePosition(draggedNode);
    const draggedWidth = getNodeWidth(draggedNode);
    const draggedHeight = getNodeHeight(draggedNode);
    const center = {
      x: draggedPosition.x + draggedWidth / 2,
      y: draggedPosition.y + draggedHeight / 2,
    };

    setNodes(nds => {
      const groups = nds
        .filter(node => node.type === 'group')
        .map(group => {
          const position = getAbsoluteNodePosition(group, nds);
          const width = getNodeWidth(group);
          const height = getNodeHeight(group);
          return { group, position, width, height, area: width * height };
        })
        .filter(({ position, width, height }) => (
          center.x >= position.x &&
          center.x <= position.x + width &&
          center.y >= position.y &&
          center.y <= position.y + height
        ))
        .sort((a, b) => a.area - b.area);

      const target = groups[0];
      if (!target) return nds;

      const nextRelativePosition = {
        x: Math.max(GROUP_PADDING, draggedPosition.x - target.position.x),
        y: Math.max(GROUP_PADDING + GROUP_LABEL_SPACE, draggedPosition.y - target.position.y),
      };
      const requiredGroupWidth = nextRelativePosition.x + draggedWidth + GROUP_PADDING;
      const requiredGroupHeight = nextRelativePosition.y + draggedHeight + GROUP_PADDING;

      return nds.map(node => {
        if (node.id === draggedNode.id) {
          return {
            ...node,
            parentNode: target.group.id,
            position: nextRelativePosition,
            selected: true,
            zIndex: 1,
          };
        }
        if (node.id === target.group.id) {
          const childIds = new Set(node.data?.childIds || []);
          childIds.add(draggedNode.id);
          return {
            ...node,
            data: { ...node.data, childIds: [...childIds] },
            style: {
              ...node.style,
              width: Math.max(getNodeWidth(node), requiredGroupWidth),
              height: Math.max(getNodeHeight(node), requiredGroupHeight),
            },
          };
        }
        return node;
      });
    });
  }, [getDragClientPoint, screenToFlowPosition, setNodes]);

  // 同步上游节点 → 对应处理器
  const syncPromptToGenerators = useCallback(() => {
    syncGeneratorDataForEdges(edgesRef.current);
  }, [syncGeneratorDataForEdges]);

  // edges 变化时同步
  useEffect(() => { syncPromptToGenerators(); }, [edges, syncPromptToGenerators]);

  const onGeneratorPromptChange = useCallback((generatorId, promptDraft) => {
    const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === generatorId)?.[0];
    if (!resultId) return;
    setNodes(nds => {
      let changed = false;
      const nextNodes = nds.map(n => {
        if (n.id === generatorId) {
          if (n.data?.promptDraft === promptDraft) return n;
          changed = true;
          return { ...n, data: { ...n.data, promptDraft } };
        }

        if (n.id === resultId) {
          if (n.data?.promptDraft === promptDraft) return n;
          changed = true;
          return { ...n, data: { ...n.data, promptDraft } };
        }

        return n;
      });
      return changed ? nextNodes : nds;
    });
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, syncPromptToGenerators]);

  const onNodeResize = useCallback((nodeId, size) => {
    if (!size?.width) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const nextStyle = { ...n.style, width: Math.round(size.width) };
      if (size.height !== undefined) {
        nextStyle.height = Math.round(size.height);
      } else {
        // height 不传 → 删除 style.height，让内容自适应
        delete nextStyle.height;
      }
      return { ...n, style: nextStyle };
    }));
  }, [setNodes]);

  const onResultNodeDragByScreenDelta = useCallback((nodeId, delta) => {
    if (!delta?.x && !delta?.y) return;
    const zoom = viewportTransform?.[2] || 1;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        position: {
          x: (n.position?.x || 0) + delta.x / zoom,
          y: (n.position?.y || 0) + delta.y / zoom,
        },
      };
    }));
  }, [setNodes, viewportTransform]);

  const onVideoAspectChange = useCallback((nodeId, aspectRatio) => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const currentAspectRatio = n.data?.videoAspectRatio;
      if (currentAspectRatio && Math.abs(currentAspectRatio - aspectRatio) < 0.01) {
        return n;
      }
      const width = n.style?.width || getNodeWidth(n);
      return {
        ...n,
        data: { ...n.data, videoAspectRatio: aspectRatio },
        style: { ...n.style, width, height: Math.round(width / aspectRatio) },
      };
    }));
  }, [setNodes]);

  const onResultMediaAspectChange = useCallback((nodeId, aspectRatio) => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const currentAspectRatio = n.data?.mediaAspectRatio;
      if (currentAspectRatio && Math.abs(currentAspectRatio - aspectRatio) < 0.01) {
        return n;
      }
      const width = Number(n.style?.width || getNodeWidth(n));
      return {
        ...n,
        data: { ...n.data, mediaAspectRatio: aspectRatio },
        style: { ...n.style, width, height: Math.round(width / aspectRatio) },
      };
    }));
  }, [setNodes]);

  const onResultImageDimensionsChange = useCallback((nodeId, imageUrl, dimensions) => {
    const normalized = normalizeImageDimensions(dimensions);
    if (!imageUrl || !normalized) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId || n.type !== 'result' || n.data?.resultType !== 'generateImage') {
        return n;
      }
      const currentMap = n.data?.imageDimensionsByUrl || {};
      const current = currentMap[imageUrl];
      if (
        current?.width === normalized.width
        && current?.height === normalized.height
        && n.data?.imageDimensions?.width === normalized.width
        && n.data?.imageDimensions?.height === normalized.height
      ) {
        return n;
      }
      return {
        ...n,
        data: {
          ...n.data,
          imageDimensions: normalized,
          imageDimensionsByUrl: mergeImageDimensions(currentMap, imageUrl, normalized),
        },
      };
    }));
  }, [setNodes]);

  const onResultVideoDimensionsChange = useCallback((nodeId, videoUrl, dimensions) => {
    const normalized = normalizeImageDimensions(dimensions);
    if (!videoUrl || !normalized) return;
    setNodes(nds => nds.map(node => {
      if (
        node.id !== nodeId
        || node.type !== 'result'
        || node.data?.resultType !== 'generateVideo'
        || (node.data?.videoUrl && node.data.videoUrl !== videoUrl)
      ) {
        return node;
      }
      const current = node.data?.videoDimensions;
      if (current?.width === normalized.width && current?.height === normalized.height) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          videoDimensions: normalized,
        },
      };
    }));
  }, [setNodes]);

  const onVideoQuickTrimChange = useCallback((nodeId, contract) => {
    if (!nodeId || !contract?.sourceUrl) return;
    setNodes(nds => nds.map(node => (
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              videoQuickTrims: {
                ...(node.data?.videoQuickTrims || {}),
                [contract.sourceUrl]: contract,
              },
            },
          }
        : node
    )));
  }, [setNodes]);

  const onOpenVideoEditor = useCallback((nodeId) => {
    setActiveVideoEditorNodeId(nodeId);
  }, []);

  const onVideoEditorTimelineSave = useCallback((nodeId, timeline) => {
    setNodes(nds => nds.map(n => (
      n.id === nodeId
        ? { ...n, data: { ...n.data, videoEditorTimeline: timeline } }
        : n
    )));
  }, [setNodes]);

  const onVideoEditorRendered = useCallback((nodeId, videoUrl, timeline) => {
    setNodes(nds => nds.map(n => (
      n.id === nodeId
        ? {
            ...n,
            data: {
              ...n.data,
              videoUrl,
              videoEditorTimeline: timeline || n.data?.videoEditorTimeline,
            },
          }
        : n
    )));
  }, [setNodes]);

  const onVideoInputChange = useCallback((nodeId, videoUrls) => {
    videoInputs.current[nodeId] = videoUrls;
    setNodes(nds => nds.map(n => (
      n.id === nodeId ? { ...n, data: { ...n.data, videoUrls } } : n
    )));
    syncPromptToGenerators();
  }, [setNodes, syncPromptToGenerators]);

  const onStoryboardCardUpdate = useCallback((nodeId, patch) => {
    setNodes(nds => {
      const sourceCardNode = nds.find(n => n.id === nodeId);
      const sourceResultId = sourceCardNode?.data?.sourceResultId;
      const sourceSceneId = sourceCardNode?.data?.card?.sourceSceneId;
      const sourceOrder = sourceCardNode?.data?.card?.order;

      return nds.map(n => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              card: {
                ...(n.data?.card || {}),
                ...patch,
              },
            },
          };
        }

        if (sourceResultId && n.id === sourceResultId && Array.isArray(n.data?.storyboardCards)) {
          return {
            ...n,
            data: {
              ...n.data,
              storyboardCards: n.data.storyboardCards.map(card => {
                const sameScene = sourceSceneId && card.sourceSceneId === sourceSceneId;
                const sameOrder = !sourceSceneId && sourceOrder && card.order === sourceOrder;
                return sameScene || sameOrder ? { ...card, ...patch } : card;
              }),
            },
          };
        }

        return n;
      });
    });
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, syncPromptToGenerators]);

  // ResultNode 内联分镜卡片更新（通过索引）
  const onResultCardUpdate = useCallback((resultNodeId, cardIndex, patch) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== resultNodeId || !Array.isArray(n.data?.storyboardCards)) return n;
      return {
        ...n,
        data: {
          ...n.data,
          storyboardCards: n.data.storyboardCards.map((card, i) =>
            i === cardIndex ? { ...card, ...patch } : card
          ),
        },
      };
    }));
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, syncPromptToGenerators]);

  const patchStoryboardFrameGeneration = useCallback((target, patch) => {
    if (!target?.resultId) return;
    const cardIndex = Number(target.cardIndex);
    setNodes(nds => nds.map(n => {
      if (n.id === target.resultId && Array.isArray(n.data?.storyboardCards)) {
        return {
          ...n,
          data: {
            ...n.data,
            storyboardCards: n.data.storyboardCards.map((card, index) => (
              index === cardIndex ? { ...card, ...patch } : card
            )),
          },
        };
      }
      if (target.cardNodeId && n.id === target.cardNodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            card: {
              ...(n.data?.card || {}),
              ...patch,
            },
          },
        };
      }
      return n;
    }));
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, syncPromptToGenerators]);

  // 第二轮 LLM 完成单张分镜绘图 prompt 时调用：单独更新第 idx 张卡的 prompt 字段
  // （区别于 onResultCardUpdate 的语义：这里只更新绘图 prompt 字段，不动其他）
  const onStoryboardPromptUpdate = useCallback((generatorId, cardIndex, promptPatch) => {
    const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === generatorId)?.[0];
    if (!resultId) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== resultId || !Array.isArray(n.data?.storyboardCards)) return n;
      return {
        ...n,
        data: {
          ...n.data,
          storyboardCards: n.data.storyboardCards.map((card, i) =>
            i === cardIndex ? { ...card, ...promptPatch } : card
          ),
        },
      };
    }));
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, syncPromptToGenerators]);

  // 计算给定 result 节点配对 generator 的上游参考图列表（用于弹窗预填）
  const getReferenceImagesForResult = useCallback((resultId) => {
    const generatorId = pairMap.current[resultId];
    if (!generatorId) return [];
    const generatorNode = nodesRef.current.find(n => n.id === generatorId);
    return Array.isArray(generatorNode?.data?.connectedImages)
      ? generatorNode.data.connectedImages.filter(Boolean)
      : [];
  }, []);

  // ResultNode 内的分镜卡片占位图点击 → 弹出生图浮层
  // 签名: (resultId, cardIndex, card)
  const onStoryboardCardClickPlaceholder = useCallback((resultId, cardIndex, card) => {
    if (!resultId) return;
    setStoryboardGeneratorTarget({
      resultId,
      cardIndex,
      card: card || {},
      referenceImages: getReferenceImagesForResult(resultId),
      cardNodeId: null,
    });
  }, [getReferenceImagesForResult]);

  // 独立 storyboardCard 节点的占位图点击 → 弹出生图浮层
  const onCardPlaceholderClick = useCallback((cardNodeId, card) => {
    const cardNode = nodesRef.current.find(n => n.id === cardNodeId);
    const sourceResultId = cardNode?.data?.sourceResultId;
    if (!sourceResultId) return;
    const sourceResult = nodesRef.current.find(n => n.id === sourceResultId);
    if (!sourceResult) return;
    const cards = Array.isArray(sourceResult.data?.storyboardCards) ? sourceResult.data.storyboardCards : [];
    const cardIndex = cards.findIndex(c =>
      c === card || (c && card && c.shotNo === card.shotNo)
    );
    setStoryboardGeneratorTarget({
      resultId: sourceResultId,
      cardIndex: cardIndex >= 0 ? cardIndex : 0,
      card: card || {},
      referenceImages: getReferenceImagesForResult(sourceResultId),
      cardNodeId,
    });
  }, [getReferenceImagesForResult]);

  const submitStoryboardFrameImageGeneration = useCallback(async ({
    target,
    payload,
    generationConfig,
    runId: providedRunId = '',
    batchId = '',
  }) => {
    if (!target?.resultId) return { ok: false, reason: '未找到对应分镜' };

    const taskKey = target.cardNodeId || `${target.resultId}:${target.cardIndex}`;
    const previousTask = storyboardImageTasksRef.current[taskKey];
    if (previousTask?.status === 'running') {
      return { ok: false, skipped: true, reason: '该分镜正在生成中' };
    }

    const runId = providedRunId || createGenerationRunId('storyboard_image_run');
    const controller = new AbortController();
    const task = {
      id: `storyboardImage_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      runId,
      taskKey,
      status: 'running',
      controller,
    };
    storyboardImageTasksRef.current[taskKey] = task;

    const nodeIdForTaskCenter = target.cardNodeId || target.resultId;
    const runningPatch = {
      imageGenerationTask: { id: task.id, status: 'running', runId },
      imageGenerationError: '',
      imageTaskIds: [],
    };
    patchStoryboardFrameGeneration(target, runningPatch);

    try {
      const response = await fetch(`${API_BASE}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...payload,
          n: 1,
          async_mode: true,
          node_id: nodeIdForTaskCenter,
          project_id: projectId || '',
          run_id: runId,
          parent_id: target.resultId,
          batch_id: batchId,
        }),
      });
      const body = await parseJsonResponse(response, '分镜图片生成提交失败');
      if (storyboardImageTasksRef.current[taskKey]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      if (!body.success || !body.task_id) {
        const message = body.error || '分镜图片生成提交失败';
        task.status = 'error';
        patchStoryboardFrameGeneration(target, {
          imageGenerationTask: { id: body.task_id || task.id, status: 'error', runId },
          imageGenerationError: message,
          imageTaskIds: body.task_id ? [body.task_id] : [],
        });
        return { ok: false, reason: message };
      }

      const taskId = body.task_id;
      patchStoryboardFrameGeneration(target, {
        imageGenerationTask: { id: taskId, status: 'running', runId },
        imageGenerationError: '',
        imageTaskIds: [taskId],
        imageGenerationConfig: generationConfig || {},
      });

      pollImageTask(
        taskId,
        payload.api_base_url || '',
        payload.api_key || '',
        { signal: controller.signal },
      ).then((pollResult) => {
        if (storyboardImageTasksRef.current[taskKey]?.id !== task.id || task.status !== 'running') return;
        if (!pollResult.success) {
          const status = pollResult.cancelled
            ? 'cancelled'
            : pollResult.query_failed
              ? 'query_failed'
              : pollResult.save_failed
                ? 'save_failed'
                : 'error';
          task.status = status;
          patchStoryboardFrameGeneration(target, {
            imageGenerationTask: { id: taskId, status, runId },
            imageGenerationError: pollResult.error || '分镜图片生成失败',
            imageTaskIds: [],
          });
          return;
        }
        const imageUrl = (pollResult.image_urls || []).find(Boolean) || '';
        if (!imageUrl) {
          task.status = 'save_failed';
          patchStoryboardFrameGeneration(target, {
            imageGenerationTask: { id: taskId, status: 'save_failed', runId },
            imageGenerationError: '任务完成但未返回图片地址',
            imageTaskIds: [],
          });
          return;
        }
        task.status = pollResult.save_failed ? 'save_failed' : 'success';
        patchStoryboardFrameGeneration(target, {
          imageUrl,
          imageGenerationTask: { id: taskId, status: task.status, runId },
          imageGenerationError: pollResult.warning || '',
          imageTaskIds: [],
        });
      }).catch((error) => {
        if (error?.name === 'AbortError') return;
        if (storyboardImageTasksRef.current[taskKey]?.id !== task.id || task.status !== 'running') return;
        task.status = 'error';
        patchStoryboardFrameGeneration(target, {
          imageGenerationTask: { id: taskId, status: 'error', runId },
          imageGenerationError: error?.message || '分镜图片生成失败',
          imageTaskIds: [],
        });
      });

      return { ok: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
      task.status = 'error';
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '分镜图片生成提交失败';
      patchStoryboardFrameGeneration(target, {
        imageGenerationTask: { id: task.id, status: 'error', runId },
        imageGenerationError: message,
        imageTaskIds: [],
      });
      return { ok: false, reason: message };
    }
  }, [patchStoryboardFrameGeneration, projectId]);

  const runStoryboardFrameImageGeneration = useCallback(async ({ payload, generationConfig }) => (
    submitStoryboardFrameImageGeneration({
      target: storyboardGeneratorTarget,
      payload,
      generationConfig,
    })
  ), [storyboardGeneratorTarget, submitStoryboardFrameImageGeneration]);

  const getDefaultStoryboardImageProvider = useCallback(() => {
    const enabledProviders = Array.isArray(runtimeSettings.providers)
      ? runtimeSettings.providers.filter(provider => provider?.enabled !== false)
      : [];
    const activeProvider = enabledProviders.find(provider => provider.id === runtimeSettings.activeProviderId);
    const candidates = [activeProvider, ...enabledProviders].filter(Boolean);
    for (const provider of candidates) {
      const models = normalizeSmartSplitterModelList(provider.imageModels);
      const model = models.includes(provider.defaultImageModel)
        ? provider.defaultImageModel
        : models[0];
      if (provider.baseUrl && model) {
        return {
          provider,
          model,
        };
      }
    }
    return null;
  }, [runtimeSettings.activeProviderId, runtimeSettings.providers]);

  const runStoryboardCoverBatchGeneration = useCallback(async (resultId) => {
    const resultNode = nodesRef.current.find(node => node.id === resultId && node.type === 'result');
    const cards = Array.isArray(resultNode?.data?.storyboardCards) ? resultNode.data.storyboardCards : [];
    if (!resultNode || cards.length === 0) {
      window.alert('当前节点还没有可生成封面的分镜');
      return;
    }

    const providerConfig = getDefaultStoryboardImageProvider();
    if (!providerConfig) {
      window.alert('没有可用的图片生成模型，请先在设置里配置图片模型');
      return;
    }

    const referenceImages = getReferenceImagesForResult(resultId);
    const targets = cards
      .map((card, cardIndex) => ({ card, cardIndex }))
      .filter(({ card, cardIndex }) => {
        const taskKey = `${resultId}:${cardIndex}`;
        return !card.imageUrl
          && card.imagePositivePrompt
          && !['running', 'saving'].includes(card.imageGenerationTask?.status)
          && storyboardImageTasksRef.current[taskKey]?.status !== 'running';
      });

    if (targets.length === 0) {
      window.alert('没有需要生成的空分镜封面');
      return;
    }

    const batchRunId = createGenerationRunId('storyboard_cover_batch');
    const batchId = `storyboard_cover_batch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const concurrency = 3;
    let cursor = 0;
    let submitted = 0;
    const failures = [];

    const runNext = async () => {
      while (cursor < targets.length) {
        const current = targets[cursor];
        cursor += 1;
        const { card, cardIndex } = current;
        const payload = {
          provider_id: providerConfig.provider.id || '',
          api_protocol: providerConfig.provider.protocol || 'openai',
          api_base_url: providerConfig.provider.baseUrl || '',
          api_key: providerConfig.provider.apiKey || '',
          prompt: composeImageGenerationPrompt(
            card.imagePositivePrompt,
            mergeDefaultImageNegativePrompt(card.imageNegativePrompt),
          ),
          model: providerConfig.model,
          size: card.aspectRatio || resultNode.data?.storyboard_aspect_ratio || '16:9',
          resolution: '1k',
          image_urls: referenceImages,
        };
        const result = await submitStoryboardFrameImageGeneration({
          target: {
            resultId,
            cardIndex,
            card,
            referenceImages,
            cardNodeId: null,
          },
          payload,
          generationConfig: {
            image_api_id: providerConfig.provider.id || '',
            model: providerConfig.model,
            image_size: payload.size,
            image_resolution: payload.resolution,
            reference_image_count: referenceImages.length,
            batch_id: batchId,
          },
          runId: batchRunId,
          batchId,
        });
        if (result?.ok) {
          submitted += 1;
        } else if (!result?.skipped) {
          failures.push(result?.reason || `分镜 ${cardIndex + 1} 提交失败`);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, runNext));
    if (submitted > 0) {
      setTaskCenterOpen(true);
    }
    if (submitted === 0) {
      window.alert(failures[0] || '分镜封面批量生成提交失败');
    } else if (failures.length > 0) {
      window.alert(`已提交 ${submitted} 个分镜封面任务，${failures.length} 个提交失败`);
    }
  }, [getDefaultStoryboardImageProvider, getReferenceImagesForResult, submitStoryboardFrameImageGeneration]);

  const spawnStoryboardCards = useCallback((sourceResultId, cards, sourcePosition) => {
    const validCards = (cards || []).filter(Boolean);
    if (validCards.length === 0) return;

    const startX = sourcePosition.x + 460;
    const startY = sourcePosition.y;
    const columns = 2;
    const cardWidth = 300;
    const cardGapX = 28;
    const cardGapY = 28;
    const cardHeight = 330;

    const cardNodes = validCards.map((card, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: `storyboard_card_${sourceResultId}_${index + 1}`,
        type: 'storyboardCard',
        position: {
          x: startX + col * (cardWidth + cardGapX),
          y: startY + row * (cardHeight + cardGapY),
        },
        data: {
          sourceResultId,
          card: { ...card, order: card.order || index + 1 },
          onInteractiveDragCreate,
          onDeleteNode: deleteCanvasNode,
          onStoryboardCardUpdate,
          onCardPlaceholderClick,
        },
        zIndex: 1,
      };
    });

    const cardEdges = cardNodes.map(cardNode => ({
      id: `e_${sourceResultId}_${cardNode.id}`,
      source: sourceResultId,
      target: cardNode.id,
      data: { sourceResultId },
      style: { stroke: 'var(--edge-stroke)', strokeWidth: 1.5 },
      animated: false,
    }));

    setNodes(nds => [
      ...nds.filter(n => n.data?.sourceResultId !== sourceResultId),
      ...cardNodes,
    ]);
    setEdges(eds => [
      ...eds.filter(edge => edge.data?.sourceResultId !== sourceResultId),
      ...cardEdges,
    ]);
  }, [deleteCanvasNode, onCardPlaceholderClick, onInteractiveDragCreate, onStoryboardCardUpdate, setEdges, setNodes]);

  // generator 生成完成 → 更新 result
  const onGenerate = useCallback((generatorId, resultPayload) => {
    let resultId = null;
    for (const [rid, gid] of Object.entries(pairMap.current)) {
      if (gid === generatorId) { resultId = rid; break; }
    }
    if (!resultId) return;
    let storyboardSpawn = null;
    // 只有生成成功时才提交生成器快照；浮层里的普通编辑始终只是本地草稿。
    const generatorExtra = {};
    if (resultPayload && typeof resultPayload === 'object') {
      if ('storyboardVisionDowngraded' in resultPayload) {
        generatorExtra.storyboardVisionDowngraded = resultPayload.storyboardVisionDowngraded;
      }
      if (resultPayload.generationConfig && typeof resultPayload.generationConfig === 'object') {
        Object.assign(generatorExtra, resultPayload.generationConfig);
      }
    }
    setNodes(nds => nds.map(n => {
      if (n.id === generatorId && Object.keys(generatorExtra).length > 0) {
        return { ...n, data: { ...n.data, ...generatorExtra } };
      }
      if (n.id !== resultId) return n;
      if (typeof resultPayload === 'object' && resultPayload !== null) {
        if (resultPayload.spawnStoryboardCards && Array.isArray(resultPayload.storyboardCards)) {
          storyboardSpawn = {
            cards: resultPayload.storyboardCards,
            position: n.position,
          };
        }
        const previousImageUrl = n.data?.imageUrl || '';
        const nextImageUrl = resultPayload.imageUrl || '';
        const incomingImageUrls = Array.isArray(resultPayload.imageUrls) && resultPayload.imageUrls.length > 0
          ? resultPayload.imageUrls.filter(Boolean)
          : (nextImageUrl ? [nextImageUrl] : []);
        const resultRunId = resultPayload.currentRunId || resultPayload.generationTask?.runId || '';
        const appendedImagePatch = n.data?.resultType === 'generateImage' && incomingImageUrls.length > 0
          ? appendImageResultImages(n.data, incomingImageUrls, {
              preserveCover: shouldPreserveManualCoverForRun(n.data, resultRunId),
            })
          : null;
        const previousAllImages = Array.isArray(n.data?.imageUrls) && n.data.imageUrls.length > 0
          ? n.data.imageUrls
          : (previousImageUrl ? [previousImageUrl] : []);
        const existingImageHistory = Array.isArray(n.data?.imageHistory) ? n.data.imageHistory : [];
        let imageHistory = existingImageHistory;
        if (!appendedImagePatch) {
          const nextAllImages = incomingImageUrls;
          const candidates = [...previousAllImages, ...existingImageHistory];
          const dedup = [];
          for (const url of candidates) {
            if (!url) continue;
            if (nextAllImages.includes(url)) continue;
            if (dedup.includes(url)) continue;
            dedup.push(url);
          }
          imageHistory = nextAllImages.length > 0 && dedup.length > 0
            ? dedup.slice(0, 20)
            : existingImageHistory;
        }
        const generatedImageSize = resultPayload.generationConfig?.image_size;
        const generatedVideoRatio = resultPayload.generationConfig?.video_aspect_ratio;
        const generatedRatio = generatedImageSize || generatedVideoRatio;
        const ratioValue = getRatioValue(generatedRatio);
        const currentWidth = n.style?.width || getNodeWidth(n);
        return {
          ...n,
          style: ratioValue
            ? { ...n.style, width: currentWidth, height: Math.round(currentWidth / ratioValue) }
            : n.style,
          data: {
            ...n.data,
            ...resultPayload,
            ...(n.data?.resultType === 'generateText' && Object.prototype.hasOwnProperty.call(resultPayload, 'result')
              ? { textSource: resultPayload.textSource || 'generated' }
              : {}),
            ...(appendedImagePatch || {}),
            ...(generatedImageSize ? {
              imageSize: generatedImageSize,
              imageResolution: resultPayload.generationConfig?.image_resolution,
            } : {}),
            ...(imageHistory.length > 0 ? { imageHistory } : {}),
          },
        };
      }
      return {
        ...n,
        data: {
          ...n.data,
          result: resultPayload,
          ...(n.data?.resultType === 'generateText' ? { textSource: 'generated' } : {}),
        },
      };
    }));
    if (storyboardSpawn) {
      setTimeout(() => spawnStoryboardCards(resultId, storyboardSpawn.cards, storyboardSpawn.position), 0);
    }
    setTimeout(() => syncPromptToGenerators(), 0);
  }, [setNodes, spawnStoryboardCards, syncPromptToGenerators]);

  // 设置生成中状态（通知 ResultNode 显示骨架屏）
  const setGenerating = useCallback((generatorId, generating) => {
    let resultId = null;
    for (const [rid, gid] of Object.entries(pairMap.current)) {
      if (gid === generatorId) { resultId = rid; break; }
    }
    if (!resultId) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== resultId) return n;
      return { ...n, data: { ...n.data, generating } };
    }));
  }, [setNodes]);

  // 保存处理器数据（上传的图片、提示词等）
  const onGeneratorDataChange = useCallback((generatorId, patch) => {
    // 找到配对的 result 节点
    let resultId = null;
    for (const [rid, gid] of Object.entries(pairMap.current)) {
      if (gid === generatorId) { resultId = rid; break; }
    }
    setNodes(nds => nds.map(n => {
      const resultNode = resultId ? nds.find(item => item.id === resultId) : null;
      const generatorNode = nds.find(item => item.id === generatorId);
      if (isRunningGenerationNode(resultNode) || isRunningGenerationNode(generatorNode)) {
        return n;
      }
      if (n.id === generatorId) {
        return { ...n, data: { ...n.data, ...patch } };
      }
      // 同步 imageSize/imageResolution 到 result 节点（用于占位图比例）
      if (n.id === resultId && (patch.image_size !== undefined || patch.image_resolution !== undefined)) {
        const nextImageSize = patch.image_size ?? n.data?.imageSize;
        const ratioValue = getRatioValue(nextImageSize);
        const nextStyle = ratioValue
          ? {
              ...n.style,
              width: n.style?.width || getNodeWidth(n),
              height: Math.round((n.style?.width || getNodeWidth(n)) / ratioValue),
            }
          : n.style;
        return {
          ...n,
          data: {
            ...n.data,
            imageSize: nextImageSize,
            imageResolution: patch.image_resolution ?? n.data?.imageResolution,
          },
          style: nextStyle,
        };
      }
      return n;
    }));
  }, [setNodes]);

  const onResultTextChange = useCallback((resultId, nextText) => {
    setNodes(nds => nds.map(node => (
      node.id === resultId
        ? { ...node, data: { ...node.data, result: nextText, textSource: 'manual' } }
        : node
    )));
  }, [setNodes]);

  const onNodeTitleChange = useCallback((nodeId, label) => {
    const nextLabel = String(label || '').trim();
    if (!nextLabel) return;
    setNodes(nds => nds.map(node => (
      node.id === nodeId
        ? { ...node, data: { ...node.data, label: nextLabel } }
        : node
    )));
  }, [setNodes]);

  const onResultTextEditingChange = useCallback((resultId, editing) => {
    if (!editing) return;
    updateGeneratorVisibility(null);
  }, [updateGeneratorVisibility]);

  const onImageActionEditingChange = useCallback((resultId, editing) => {
    if (!resultId || !editing) return;
    updateGeneratorVisibility(null);
  }, [updateGeneratorVisibility]);

  // 通用：更新结果节点的 data（封面切换、状态字段等）
  const onResultDataChange = useCallback((resultId, patch) => {
    setNodes(nds => nds.map(node => (
      node.id === resultId
        ? isRunningGenerationNode(node)
          && !isManualCoverPatch(patch)
          ? node
          : { ...node, data: { ...node.data, ...patch } }
        : node
    )));
  }, [setNodes]);

  const onWorkflowNodeDataChange = useCallback((nodeId, patch) => {
    setNodes(nds => nds.map(node => (
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...patch } }
        : node
    )));
    queueMicrotask(() => syncGeneratorDataForEdgesRef.current?.());
  }, [setNodes]);

  const onCharacterChange = useCallback((nodeId, payload) => {
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      const currentPayload = buildCharacterPayloadFromData(node.data || {});
      if (areCharacterPayloadsEqual(currentPayload, payload)) return node;
      return {
        ...node,
        data: {
          ...node.data,
          ...payload,
          characterPayload: payload,
        },
      };
    }));
    queueMicrotask(() => syncGeneratorDataForEdgesRef.current?.());
  }, [setNodes]);

  const onResultImageUpload = useCallback((resultId, url, imageSize = null) => {
    if (!url) return;
    const metadata = buildUploadedImageAssetMetadata({}, imageSize);
    setNodes(nds => nds.map(node => {
      if (node.id !== resultId || node.type !== 'result' || node.data?.resultType !== 'generateImage') {
        return node;
      }
      if (isRunningGenerationNode(node)) return node;
      const nextStyle = metadata.width > 0 && metadata.height > 0
        ? resolveUploadedImageNodeStyle(metadata, {})
        : node.style;
      return {
        ...node,
        style: nextStyle,
        data: {
          ...node.data,
          ...replaceImageResultCover(node.data, url),
          imageSource: 'upload',
          ...(metadata.imageSize ? { imageSize: metadata.imageSize } : {}),
          ...(metadata.mediaAspectRatio ? { mediaAspectRatio: metadata.mediaAspectRatio } : {}),
          ...(metadata.width && metadata.height
            ? {
                imageDimensions: { width: metadata.width, height: metadata.height },
                imageDimensionsByUrl: mergeImageDimensions(node.data?.imageDimensionsByUrl, url, metadata),
              }
            : {}),
        },
      };
    }));
  }, [setNodes]);

  const onResultVideoUpload = useCallback((resultId, url) => {
    if (!url) return;
    updateGeneratorVisibility(null);
    setNodes(nds => nds.map(node => (
      node.id === resultId
        && node.type === 'result'
        && node.data?.resultType === 'generateVideo'
        && !isRunningGenerationNode(node)
        ? { ...node, data: { ...node.data, videoUrl: url, videoSource: 'upload' } }
        : node
    )));
  }, [setNodes, updateGeneratorVisibility]);

  const onResultAudioUpload = useCallback((resultId, url) => {
    if (!url) return;
    updateGeneratorVisibility(null);
    setNodes(nds => nds.map(node => (
      node.id === resultId
        && node.type === 'result'
        && node.data?.resultType === 'generateAudio'
        && !isRunningGenerationNode(node)
        ? { ...node, data: { ...node.data, audioUrl: url, audioSource: 'upload' } }
        : node
    )));
  }, [setNodes, updateGeneratorVisibility]);

  // 多图结果节点展开/收起时，把节点的 zIndex 顶到最高，避免被其他节点遮住
  const onResultExpandStateChange = useCallback((resultId, isExpanded) => {
    setExpandedResultId(current => (
      isExpanded
        ? resultId
        : current === resultId ? null : current
    ));
    setNodes(nds => nds.map(node => {
      if (node.id !== resultId) return node;
      if (isExpanded) {
        return { ...node, zIndex: Math.max(node.zIndex || 0, 1000) };
      }
      return { ...node, zIndex: 0 };
    }));
  }, [setNodes]);

  const cancelGenerationTask = useCallback((generatorId) => {
    const task = generationTasksRef.current[generatorId];
    if (!task || task.status !== 'running') return;
    task.status = 'canceled';
    task.controller?.abort();
    // 同步取消后端任务中心的任务
    const resultNode = nodesRef.current.find(n => n.id === task.resultId);
    const taskIds = resultNode?.data?.taskIds || [];
    cancelBackendTaskIds(taskIds);
    setNodes(nds => nds.map(node => {
      if (node.id === task.resultId) {
        return {
          ...node,
          data: {
            ...node.data,
            generating: false,
            generationTask: null,
            taskIds: [], // 清除 taskIds 避免下次刷新页面恢复
            currentRunId: '',
          },
        };
      }
      if (node.id === generatorId) {
        return {
          ...node,
          data: {
            ...node.data,
            generationTask: { id: task.id, status: 'canceled' },
          },
        };
      }
      return node;
    }));
  }, [cancelBackendTaskIds, setNodes]);


  const runGenerationTask = useCallback(async (generatorId, {
    type,
    endpoint,
    payload,
    getSuccessPayload,
    errorFallback,
    generationConfig,
  }) => {
    const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === generatorId)?.[0];
    if (!resultId) return { ok: false, skipped: true, reason: '未找到对应结果节点' };

    const previousTask = generationTasksRef.current[generatorId];
    if (previousTask?.status === 'running') {
      previousTask.status = 'canceled';
      previousTask.controller?.abort();
    }

    const task = {
      id: `${type}_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      generatorId,
      resultId,
      status: 'running',
      controller: new AbortController(),
    };
    generationTasksRef.current[generatorId] = task;

    setNodes(nds => nds.map(node => {
      if (node.id === resultId) {
        return {
          ...node,
          data: {
            ...node.data,
            generating: true,
            generationTask: { id: task.id, status: 'running' },
          },
        };
      }
      if (node.id === generatorId) {
        return {
          ...node,
          data: {
            ...node.data,
            generationTask: { id: task.id, status: 'running' },
            lastGenerationError: '',
          },
        };
      }
      return node;
    }));

    const shouldAcceptResult = () => {
      const currentTask = generationTasksRef.current[generatorId];
      return currentTask?.id === task.id && currentTask.status === 'running';
    };

    try {
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: task.controller.signal,
        body: JSON.stringify(payload),
      });
      const res = await resp.json();
      if (!shouldAcceptResult()) return { ok: false, skipped: true, reason: '任务已被新任务替换' };

      if (res.success) {
        task.status = 'success';
        generationTasksRef.current[generatorId] = task;
        onGenerate(generatorId, {
          ...getSuccessPayload(res),
          generationConfig,
        });
        setNodes(nds => nds.map(node => (
          node.id === generatorId
            ? { ...node, data: { ...node.data, generationTask: { id: task.id, status: 'success' }, lastGenerationError: '' } }
            : node.id === resultId
              ? { ...node, data: { ...node.data, generating: false, generationTask: { id: task.id, status: 'success' } } }
            : node
        )));
        return { ok: true };
      } else {
        const message = res.error || errorFallback || '生成失败';
        if (type === 'generateText' && res.incomplete && res.partial_response) {
          onGenerate(generatorId, {
            result: res.partial_response,
            generationConfig,
          });
        }
        task.status = 'error';
        generationTasksRef.current[generatorId] = task;
        markNodeGenerationFailed(resultId, {
          generatorId,
          taskId: task.id,
          runId: payload?.run_id || '',
          status: 'error',
          message,
        });
        return { ok: false, reason: message };
      }
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
      if (!shouldAcceptResult()) return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      let message = error.message || errorFallback || '生成失败';
      if (error.name === 'TypeError' && message === 'Failed to fetch') {
        message = '无法连接到后端 API。请确认后端服务是否启动。';
      }
      task.status = 'error';
      generationTasksRef.current[generatorId] = task;
      markNodeGenerationFailed(resultId, {
        generatorId,
        taskId: task.id,
        runId: payload?.run_id || '',
        status: 'error',
        message,
      });
      return { ok: false, reason: message };
    } finally {
      if (generationTasksRef.current[generatorId]?.id === task.id) {
        setGenerating(generatorId, false);
      }
    }
  }, [markNodeGenerationFailed, onGenerate, setGenerating, setNodes]);

  const runTextGeneration = useCallback((generatorId, payload, generationConfig) => {
    const maxTextTokens = normalizeMaxTextTokens(
      generationConfig?.max_tokens
      ?? payload?.max_tokens
      ?? runtimeSettings.maxTextTokens,
    );
    return runGenerationTask(generatorId, {
      type: 'generateText',
      endpoint: '/api/llm',
      payload: {
        ...payload,
        max_tokens: maxTextTokens,
      },
      errorFallback: '文本生成失败',
      getSuccessPayload: res => ({ result: res.response }),
      generationConfig: {
        ...generationConfig,
        max_tokens: maxTextTokens,
      },
    });
  }, [runGenerationTask, runtimeSettings.maxTextTokens]);

  const runAudioGeneration = useCallback((generatorId, payload, generationConfig) => {
    return runGenerationTask(generatorId, {
      type: 'generateAudio',
      endpoint: '/api/tts',
      payload,
      errorFallback: '音频生成失败',
      getSuccessPayload: res => ({
        audioUrl: res.audio_url || res.audioUrl || '',
        audioDuration: res.duration || 0,
        audioSource: 'generate',
        audioName: '生成音频',
      }),
      generationConfig,
    });
  }, [runGenerationTask]);

  const runImageGeneration = useCallback(async (generatorId, payload, generationConfig) => {
    const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === generatorId)?.[0];
    if (!resultId) return { ok: false, skipped: true, reason: '未找到对应图片节点' };

    const previousTask = generationTasksRef.current[generatorId];
    if (previousTask?.status === 'running') {
      return { ok: false, skipped: true, reason: '该节点正在生成中' };
    }

    const runId = createGenerationRunId('image_run');
    const requestedCount = Math.max(1, Math.min(
      Number(generationConfig?.image_count ?? payload?.n) || 1,
      4
    ));
    const task = {
      id: `generateImage_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: 'generateImage',
      generatorId,
      resultId,
      runId,
      status: 'running',
      controller: new AbortController(),
    };
    generationTasksRef.current[generatorId] = task;

    const updateTaskState = (status, errorMessage = '') => {
      if (status === 'error' || status === 'failed') {
        markNodeGenerationFailed(resultId, {
          generatorId,
          taskIds: uniqueTaskIds(taskIds),
          runId,
          status: 'error',
          message: errorMessage || '图片生成失败',
        });
        return;
      }
      if (status === 'query_failed' || status === 'save_failed') {
        setNodes(nds => nds.map(node => {
          if (node.id === generatorId) {
            return {
              ...node,
              data: {
                ...node.data,
                generationTask: { id: uniqueTaskIds(taskIds)[0] || task.id, status, runId },
                lastGenerationError: errorMessage || '图片生成失败',
              },
            };
          }
          if (node.id === resultId) {
            return {
              ...node,
              data: {
                ...node.data,
                generating: false,
                generationTask: { id: uniqueTaskIds(taskIds)[0] || task.id, status, runId },
                currentRunId: '',
                taskIds: [],
                smartSplitStatus: '',
                lastGenerationError: errorMessage || '图片生成失败',
              },
            };
          }
          return node;
        }));
        return;
      }
      const abandonsRun = status === 'canceled' || status === 'cancelled';
      setNodes(nds => nds.map(node => {
        if (node.id === generatorId) {
          return {
            ...node,
            data: {
              ...node.data,
              generationTask: { id: task.id, status, runId },
              lastGenerationError: errorMessage,
            },
          };
        }
        if (node.id === resultId) {
          return {
            ...node,
            data: {
              ...node.data,
              generating: status === 'running',
              generationTask: { id: task.id, status, runId },
              currentRunId: abandonsRun ? '' : status === 'running' ? runId : node.data?.currentRunId,
              ...(status === 'running' || abandonsRun ? { taskIds: [] } : {}),
            },
          };
        }
        return node;
      }));
    };

    updateTaskState('running');
    const generatedUrls = [];
    const taskIds = [];
    const errors = [];
    const pushImageGenerationError = (message, status = 'error', taskId = '') => {
      errors.push({ message, status, taskId });
    };

    for (let index = 0; index < requestedCount; index += 1) {
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }

      try {
        // async 模式：提交任务后立即返回 task_id，前端自行轮询
        const response = await fetch(`${API_BASE}/api/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: task.controller.signal,
          body: JSON.stringify({
            ...payload,
            n: 1,
            async_mode: true,
            node_id: resultId,
            project_id: projectId || '',
            run_id: runId,
          }),
        });
        const body = await parseJsonResponse(response, '图片生成提交失败');
        if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
          return { ok: false, skipped: true, reason: '任务已被新任务替换' };
        }
        if (!body.success) {
          pushImageGenerationError(body.error || `第 ${index + 1} 张图片生成失败`);
          continue;
        }

        // 立刻保存 task_id，刷新页面后可恢复
        const tid = body.task_id;
        if (tid) taskIds.push(tid);
        if (tid) {
          setNodes(nds => nds.map(n => n.id === resultId
            ? { ...n, data: { ...n.data, taskIds: uniqueTaskIds(taskIds), currentRunId: runId } }
            : n));
        }

        // 前端轮询任务直到完成
        const pollResult = await pollImageTask(
          tid,
          payload.api_base_url || '',
          payload.api_key || '',
          { signal: task.controller.signal },
        );
        if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
          return { ok: false, skipped: true, reason: '任务已被新任务替换' };
        }
        const currentNode = nodesRef.current.find(n => n.id === resultId);
        if (pollResult.success && !isTaskResultAcceptedForNode(pollResult.task, currentNode)) {
          task.status = 'canceled';
          updateTaskState('canceled');
          return { ok: false, skipped: true, reason: '任务结果已失效' };
        }

        if (!pollResult.success) {
          pushImageGenerationError(
            pollResult.error || `第 ${index + 1} 张图片生成失败`,
            pollResult.query_failed ? 'query_failed' : pollResult.save_failed ? 'save_failed' : 'error',
            pollResult.task_id || '',
          );
          if (pollResult.task_id) taskIds.push(pollResult.task_id);
          continue;
        }

        const imageUrls = pollResult.image_urls || [];
        const imageUrl = imageUrls.find(Boolean) || '';
        if (!imageUrl) {
          pushImageGenerationError(`第 ${index + 1} 张图片生成完成但未返回图片 URL`, 'save_failed', pollResult.task_id || '');
          taskIds.push(pollResult.task_id);
          continue;
        }

        generatedUrls.push(imageUrl);
        if (pollResult.task_id) taskIds.push(pollResult.task_id);
        const nextTaskIds = uniqueTaskIds(taskIds);
        onGenerate(generatorId, {
          result: '',
          imageUrl: generatedUrls[0],
          imageUrls: [...generatedUrls],
          coverIndex: 0,
          taskId: pollResult.task_id,
          taskIds: nextTaskIds,
          currentRunId: runId,
          generationConfig: {
            ...generationConfig,
            image_count: requestedCount,
          },
        });
      } catch (error) {
        if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
        pushImageGenerationError(error?.message === 'Failed to fetch'
          ? '无法连接到后端 API。请确认后端服务是否启动。'
          : error?.message || `第 ${index + 1} 张图片生成失败`);
      }
    }

    if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
      return { ok: false, skipped: true, reason: '任务已被新任务替换' };
    }
    if (generatedUrls.length === 0) {
      const message = errors[0]?.message || '图片生成失败';
      const terminalStatus = errors.find(error => error.status === 'query_failed')?.status
        || errors.find(error => error.status === 'save_failed')?.status
        || 'error';
      task.status = 'error';
      updateTaskState(terminalStatus, message);
      return { ok: false, reason: message };
    }

    task.status = errors.length > 0 ? 'partial_error' : 'success';
    updateTaskState(task.status, errors.length > 0 ? `${errors.length} 张图片生成失败` : '');
    refreshLocalAssets();
    return {
      ok: true,
      partial: errors.length > 0,
      reason: errors.length > 0 ? `${errors.length} 张图片生成失败` : '',
    };
  }, [markNodeGenerationFailed, onGenerate, projectId, refreshLocalAssets, setNodes]);

  const patchCharacterAvatarCertification = useCallback((nodeId, certificationPatch = {}) => {
    if (!nodeId) return;
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      const currentCertification = normalizeAvatarCertification(
        node.data?.avatarCertification || node.data?.characterPayload?.avatarCertification
      );
      const nextCertification = normalizeAvatarCertification({
        ...currentCertification,
        ...certificationPatch,
      });
      return {
        ...node,
        data: {
          ...node.data,
          avatarCertification: nextCertification,
          characterPayload: {
            ...(node.data?.characterPayload || buildCharacterPayloadFromData(node.data || {})),
            avatarCertification: nextCertification,
          },
        },
      };
    }));
  }, [setNodes]);

  const patchCharacterVoiceGeneration = useCallback((nodeId, voicePatch = {}) => {
    if (!nodeId) return;
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      const currentPayload = buildCharacterPayloadFromData(node.data || {});
      const nextPayloadBase = {
        ...currentPayload,
        audioUrl: voicePatch.audioUrl || currentPayload.audioUrl || '',
        voicePrompt: voicePatch.voicePrompt ?? currentPayload.voicePrompt ?? '',
        voiceText: voicePatch.voiceText ?? currentPayload.voiceText ?? '',
      };
      const talentPackage = buildTalentPackageFromCharacterPayload({
        ...nextPayloadBase,
        avatarCertification: node.data?.avatarCertification || currentPayload.avatarCertification,
        talentPackage: node.data?.talentPackage || currentPayload.talentPackage,
      }, node);
      const nextPayload = {
        ...nextPayloadBase,
        talentPackage,
      };
      return {
        ...node,
        data: {
          ...node.data,
          ...voicePatch,
          audioUrl: nextPayload.audioUrl,
          voicePrompt: nextPayload.voicePrompt,
          voiceText: nextPayload.voiceText,
          talentPackage,
          characterPayload: nextPayload,
        },
      };
    }));
  }, [setNodes]);

  const generateCharacterVoice = useCallback(async (nodeId, payload = {}) => {
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    const prompt = String(payload.style || '').trim();
    const previewText = String(payload.text || '').trim();
    if (!prompt) return { ok: false, reason: '请输入声音描述' };
    if (!previewText) return { ok: false, reason: '请输入试听文本' };
    if (previewText.length > 500) return { ok: false, reason: '试听文本不能超过 500 个字符' };

    try {
      const response = await fetch(`${API_BASE}/api/voice-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          preview_text: previewText,
        }),
      });
      const body = await parseJsonResponse(response, '声音生成失败');
      if (!body.success) throw new Error(body.error || '声音生成失败');
      const audioUrl = body.audio_url || body.audioUrl || '';
      if (!audioUrl) throw new Error('声音生成完成但未返回音频地址');
      patchCharacterVoiceGeneration(nodeId, {
        audioUrl,
        voicePrompt: prompt,
        voiceText: previewText,
      });
      return { ok: true, audioUrl };
    } catch (error) {
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '声音生成失败';
      return { ok: false, reason: message };
    }
  }, [patchCharacterVoiceGeneration]);

  const saveCharacterToLibrary = useCallback((nodeId) => {
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    if (!setMaterials) return { ok: false, reason: '当前素材库不可用' };
    const characterPayload = buildCharacterPayloadFromData(characterNode.data || {});
    const talentPackage = buildTalentPackageFromCharacterPayload({
      ...characterPayload,
      avatarCertification: characterNode.data?.avatarCertification || characterPayload.avatarCertification,
      talentPackage: characterNode.data?.talentPackage || characterPayload.talentPackage,
    }, characterNode);
    const material = {
      id: `talent_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: talentPackage.name || characterPayload.characterName || characterNode.data?.label || '未命名角色',
      imageUrl: characterPayload.mainVisualImageUrl || characterPayload.imageUrl || '',
      prompt: characterPayload.characterPrompt || buildCharacterPrompt(characterPayload),
      type: 'talent',
      source: 'character-node',
      sourceId: nodeId,
      groupId: defaultMaterialGroup?.id || '',
      talentPackage,
      characterPayload: {
        ...characterPayload,
        talentPackage,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMaterials(prev => [material, ...(Array.isArray(prev) ? prev : [])]);
    setNodes(nds => nds.map(node => (
      node.id === nodeId && node.type === 'character'
        ? {
            ...node,
            data: {
              ...node.data,
              talentPackage,
              characterPayload: {
                ...(node.data?.characterPayload || characterPayload),
                talentPackage,
              },
            },
          }
        : node
    )));
    return { ok: true, material };
  }, [buildCharacterPrompt, defaultMaterialGroup?.id, setMaterials, setNodes]);

  const submitCharacterAvatarCertification = useCallback(async (nodeId, payload = {}) => {
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    const characterPayload = buildCharacterPayloadFromData(characterNode.data || {});
    const characterName = payload.characterName || characterPayload.characterName || characterNode.data?.label || '角色';
    const mainVisualUrl = payload.mainVisualImageUrl || payload.imageUrl || characterPayload.mainVisualImageUrl || characterPayload.imageUrl || '';
    if (!mainVisualUrl) return { ok: false, reason: '请先生成主视觉，再提交认证' };

    const talentPackage = buildTalentPackageFromCharacterPayload({
      ...characterPayload,
      characterName,
      mainVisualImageUrl: mainVisualUrl,
      mainVisualPublicImageUrl: payload.publicImageUrl || characterPayload.mainVisualPublicImageUrl || characterPayload.publicImageUrl || '',
      avatarCertification: payload.avatarCertification || characterNode.data?.avatarCertification || characterPayload.avatarCertification,
      talentPackage: characterNode.data?.talentPackage || characterPayload.talentPackage,
    }, characterNode);
    const submittedAssets = buildAvatarCertificationSubmitAssets([
      { url: payload.publicImageUrl, type: 'image', role: 'main_visual' },
      { url: characterPayload.mainVisualPublicImageUrl, type: 'image', role: 'main_visual' },
      { url: mainVisualUrl, type: 'image', role: 'main_visual' },
      { url: characterPayload.threeViewPublicImageUrl, type: 'image', role: 'three_view' },
      { url: payload.threeViewImageUrl || characterPayload.threeViewImageUrl || '', type: 'image', role: 'three_view' },
      ...(talentPackage.assets || []).map(asset => ({
        url: asset.sourceUrl || asset.publicUrl || asset.localUrl,
        name: asset.name,
        type: asset.type || 'image',
        role: asset.role || 'reference',
      })),
    ], { avatarCertification: talentPackage.avatarCertification }).map((asset, index) => ({
      ...asset,
      name: asset.name || (index === 0 ? characterName : `${characterName} 素材 ${index + 1}`),
    }));
    if (submittedAssets.length === 0) return { ok: false, reason: '请先生成主视觉和三视图，再提交认证' };
    const enabledProviders = Array.isArray(runtimeSettings.providers)
      ? runtimeSettings.providers.filter(provider => provider?.enabled !== false)
      : [];
    const activeProvider = enabledProviders.find(provider => provider.id === runtimeSettings.activeProviderId);
    const provider = [activeProvider, ...enabledProviders].filter(Boolean).find(item => (
      item?.baseUrl && item?.apiKey
    ));
    if (!provider) return { ok: false, reason: '请先在模型设置中配置可用服务商的 Base URL 和 API Key' };

    const now = new Date().toISOString();
    const localTaskId = createGenerationRunId('avatar_certification_local');
    const runId = createGenerationRunId('avatar_certification_run');
    const providerGroupId = talentPackage.providerGroupId || talentPackage.avatarCertification?.groupId || '';
    const providerProjectName = talentPackage.providerProjectName || talentPackage.avatarCertification?.projectName || 'default';
    patchCharacterAvatarCertification(nodeId, {
      status: 'processing',
      taskId: localTaskId,
      submittedAssets,
      processingAssets: submittedAssets.slice(0, 1),
      failedAssets: [],
      errorMessage: '',
      submittedAt: now,
      updatedAt: now,
    });

    try {
      const response = await fetch(`${API_BASE}/api/private-avatar/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_base_url: provider.baseUrl || '',
          api_key: provider.apiKey || '',
          client_task_id: localTaskId,
          project_name: providerProjectName,
          asset_type: 'Image',
          assets: submittedAssets,
          ...(providerGroupId
            ? { group_id: providerGroupId }
            : {
                group: {
                  name: talentPackage.groupName || characterName,
                  description: `角色节点认证：${characterName}`,
                },
              }),
          node_id: nodeId,
          project_id: projectId || '',
          run_id: runId,
          target: {
            kind: 'character_node',
            nodeId,
          },
        }),
      });
      const body = await parseJsonResponse(response, '提交角色认证失败');
      if (!body.success || !body.task_id) {
        throw new Error(body.error || '提交角色认证失败');
      }
      patchCharacterAvatarCertification(nodeId, {
        status: 'processing',
        taskId: body.task_id,
        submittedAssets,
        processingAssets: submittedAssets.slice(0, 1),
        failedAssets: [],
        errorMessage: '',
        submittedAt: now,
        updatedAt: new Date().toISOString(),
      });
      setTaskCenterOpen(true);
      return { ok: true, taskId: body.task_id };
    } catch (error) {
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '提交角色认证失败';
      patchCharacterAvatarCertification(nodeId, {
        status: 'failed',
        taskId: localTaskId,
        submittedAssets,
        processingAssets: [],
        failedAssets: submittedAssets,
        errorMessage: message,
        updatedAt: new Date().toISOString(),
      });
      return { ok: false, reason: message };
    }
  }, [
    patchCharacterAvatarCertification,
    projectId,
    runtimeSettings.activeProviderId,
    runtimeSettings.providers,
    setTaskCenterOpen,
  ]);

  const getCharacterUpstreamContext = useCallback((nodeId) => {
    const sourceNodes = edges
      .filter(edge => edge.target === nodeId)
      .map(edge => nodes.find(node => node.id === edge.source))
      .filter(Boolean);
    const textReferences = [];
    const images = [];
    const addText = (value) => {
      const text = String(value || '').trim();
      if (text) textReferences.push(text);
    };
    const addImages = (values) => {
      normalizeImageList(values).forEach(url => {
        if (url && !images.includes(url)) images.push(url);
      });
    };

    sourceNodes.forEach(sourceNode => {
      if (sourceNode.type === 'result') {
        const output = getResultNodeOutput(sourceNode);
        output.texts.forEach(addText);
        addImages(output.images);
      }
      if (sourceNode.type === 'character') {
        addText(getCharacterNodeText(sourceNode));
        addImages(getCharacterNodeImages(sourceNode));
      }
      if (sourceNode.type === 'storyboardCard') {
        const card = sourceNode.data?.card;
        if (card) {
          addText(formatStoryboardCardForPrompt(card));
          addImages([card.imageUrl]);
        }
      }
      if (WORKFLOW_TEXT_NODE_TYPES.has(sourceNode.type)) {
        addText(getWorkflowNodeText(sourceNode));
        addImages(getWorkflowNodeImages(sourceNode));
      }
      if (sourceNode.type === 'videoInput' || sourceNode.type === 'videoEditor') {
        addText(sourceNode.data?.label || '');
      }
    });

    return {
      textReferences: uniqueValues(textReferences),
      images: uniqueValues(images),
    };
  }, [edges, nodes]);

  const onCharacterProfileGeneratorDataChange = useCallback((generatorId, patch = {}) => {
    const nodeId = getCharacterNodeIdFromProfileGenerator(generatorId);
    if (!nodeId) return;
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      const nextConfig = {
        ...(node.data?.characterProfileGeneratorConfig || {}),
        ...patch,
      };
      return {
        ...node,
        data: {
          ...node.data,
          characterProfileGeneratorConfig: nextConfig,
          characterPayload: {
            ...(node.data?.characterPayload || {}),
            characterProfileGeneratorConfig: nextConfig,
          },
        },
      };
    }));
  }, [setNodes]);

  const patchCharacterProfileGeneration = useCallback((nodeId, profilePatch = {}) => {
    if (!nodeId) return;
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      const payloadPatch = {
        characterName: profilePatch.characterName || node.data?.characterName || '',
        description: profilePatch.description ?? node.data?.description ?? '',
        voiceDescription: profilePatch.voiceDescription ?? node.data?.voiceDescription ?? '',
        mainVisualPrompt: profilePatch.mainVisualPrompt ?? node.data?.mainVisualPrompt ?? '',
        threeViewPrompt: profilePatch.threeViewPrompt ?? node.data?.threeViewPrompt ?? '',
      };
      const currentLabel = String(node.data?.label || '').trim();
      const shouldRenameNode = payloadPatch.characterName
        && (!currentLabel || ['角色', '未命名角色'].includes(currentLabel));
      return {
        ...node,
        data: {
          ...node.data,
          ...buildCharacterDataPatch(node.data, payloadPatch),
          ...(shouldRenameNode ? { label: payloadPatch.characterName } : {}),
          ...(profilePatch.characterProfileGeneratorConfig
            ? { characterProfileGeneratorConfig: profilePatch.characterProfileGeneratorConfig }
            : {}),
        },
      };
    }));
  }, [setNodes]);

  const cancelCharacterProfileGeneration = useCallback((generatorId) => {
    const task = generationTasksRef.current[generatorId];
    if (task?.status === 'running') {
      task.status = 'canceled';
      task.controller?.abort();
    }
    onCharacterProfileGeneratorDataChange(generatorId, {
      generationTask: { id: task?.id || generatorId, status: 'canceled', runId: task?.runId || '' },
      lastGenerationError: '',
    });
  }, [onCharacterProfileGeneratorDataChange]);

  const runCharacterProfileGeneration = useCallback(async (generatorId, payload, generationConfig = {}) => {
    const nodeId = getCharacterNodeIdFromProfileGenerator(generatorId);
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    const previousTask = generationTasksRef.current[generatorId];
    if (previousTask?.status === 'running') {
      return { ok: false, skipped: true, reason: '角色设定正在生成中' };
    }

    const task = {
      id: `characterProfile_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: 'characterProfile',
      generatorId,
      nodeId,
      runId: createGenerationRunId('character_profile_run'),
      status: 'running',
      controller: new AbortController(),
    };
    generationTasksRef.current[generatorId] = task;
    onCharacterProfileGeneratorDataChange(generatorId, {
      ...generationConfig,
      generationTask: { id: task.id, status: 'running', runId: task.runId },
      lastGenerationError: '',
    });

    try {
      const response = await fetch(`${API_BASE}/api/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: task.controller.signal,
        body: JSON.stringify({
          ...payload,
          async_mode: false,
          node_id: nodeId,
          project_id: projectId || '',
          run_id: task.runId,
          parent_id: nodeId,
          batch_id: `character_profile:${nodeId}`,
        }),
      });
      const body = await parseJsonResponse(response, '角色设定生成失败');
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被取消' };
      }
      if (!body.success) throw new Error(body.error || '角色设定生成失败');
      const profile = parseCharacterProfileResponse(body.response || body.result || '');
      if (!profile) throw new Error('角色设定生成结果不是可解析的 JSON');

      task.status = 'success';
      const nextProfileConfig = {
        ...generationConfig,
        generationTask: { id: task.id, status: 'success', runId: task.runId },
        lastGenerationError: '',
        lastProfileResult: profile,
      };
      patchCharacterProfileGeneration(nodeId, {
        ...profile,
        characterProfileGeneratorConfig: nextProfileConfig,
      });
      onCharacterProfileGeneratorDataChange(generatorId, nextProfileConfig);
      return { ok: true, result: profile };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '角色设定生成失败';
      task.status = 'error';
      onCharacterProfileGeneratorDataChange(generatorId, {
        generationTask: { id: task.id, status: 'error', runId: task.runId },
        lastGenerationError: message,
      });
      return { ok: false, reason: message };
    }
  }, [
    onCharacterProfileGeneratorDataChange,
    patchCharacterProfileGeneration,
    projectId,
  ]);

  const openCharacterProfileGenerator = useCallback((nodeId) => {
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    setActiveCharacterProfileNodeId(nodeId);
    setActiveCharacterImageNodeId(null);
    activeResultRef.current = null;
    setActiveResultId(null);
    setActiveSmartSplitterId(null);
    setExpandedProcessorOverlay(null);
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId) return { ...node, selected: false };
      return {
        ...node,
        selected: true,
        style: {
          ...(node.style || {}),
          width: Math.max(Number(node.style?.width) || 0, CHARACTER_NODE_WORKBENCH_WIDTH),
        },
      };
    }));
    return { ok: true };
  }, [setNodes]);

  const onCharacterImageGeneratorDataChange = useCallback((generatorId, patch) => {
    const parsed = parseCharacterImageGeneratorId(generatorId);
    if (!parsed) return;
    const { nodeId, target } = parsed;
    const configKey = getCharacterImageTargetConfigKey(target);
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      if (isRunningGenerationNode(node)) return node;
      const previousConfig = node.data?.[configKey] || {};
      const nextConfig = {
        ...previousConfig,
        ...patch,
        characterImageTarget: target,
      };
      const payloadPatch = {};
      if (Object.prototype.hasOwnProperty.call(patch, 'image_prompt')) {
        payloadPatch[target === 'threeView' ? 'threeViewPrompt' : 'mainVisualPrompt'] = patch.image_prompt || '';
      }
      return {
        ...node,
        data: {
          ...node.data,
          ...(Object.keys(payloadPatch).length > 0 ? buildCharacterDataPatch(node.data, payloadPatch) : {}),
          [configKey]: nextConfig,
          characterImageGeneratorConfig: nextConfig,
          imageGenerationTarget: target,
        },
      };
    }));
  }, [setNodes]);

  const openCharacterImageGenerator = useCallback((nodeId, payload = {}) => {
    const target = payload?.target === 'threeView' ? 'threeView' : 'mainVisual';
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, reason: '未找到角色节点' };
    const characterPayload = buildCharacterPayloadFromData(characterNode.data || {});
    const mainVisualImageUrl = payload.mainVisualImageUrl
      || payload.imageUrl
      || characterPayload.mainVisualImageUrl
      || characterPayload.imageUrl
      || '';
    if (target === 'threeView' && !mainVisualImageUrl) {
      return { ok: false, reason: '请先生成主视觉，再生成三视图' };
    }

    setActiveCharacterImageNodeId(nodeId);
    setActiveCharacterImageTarget(target);
    setActiveCharacterProfileNodeId(null);
    activeResultRef.current = null;
    setActiveResultId(null);
    setActiveSmartSplitterId(null);
    setExpandedProcessorOverlay(null);
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId) return { ...node, selected: false };
      const nextData = Object.keys(payload || {}).length > 1
        ? {
            ...node.data,
            ...buildCharacterDataPatch(node.data, {
              characterName: payload.characterName || characterPayload.characterName,
              description: payload.description ?? characterPayload.description,
              voiceDescription: payload.voiceDescription ?? characterPayload.voiceDescription,
              mainVisualPrompt: payload.mainVisualPrompt ?? characterPayload.mainVisualPrompt,
              threeViewPrompt: payload.threeViewPrompt ?? characterPayload.threeViewPrompt,
              mainVisualImageUrl,
              threeViewImageUrl: payload.threeViewImageUrl ?? characterPayload.threeViewImageUrl,
            }),
            imageGenerationTarget: target,
          }
        : { ...node.data, imageGenerationTarget: target };
      return {
        ...node,
        selected: true,
        style: {
          ...(node.style || {}),
          width: Math.max(Number(node.style?.width) || 0, CHARACTER_NODE_WORKBENCH_WIDTH),
        },
        data: nextData,
      };
    }));
    return { ok: true };
  }, [setNodes]);

  const onCharacterMainVisualUpload = useCallback((nodeId, payload = {}) => {
    const target = payload?.target === 'threeView' ? 'threeView' : 'mainVisual';
    const imageUrl = payload.imageUrl || '';
    if (!imageUrl) return { ok: false, reason: '缺少图片地址' };
    setNodes(nds => nds.map(node => {
      if (node.id !== nodeId || node.type !== 'character') return node;
      return {
        ...node,
        data: {
          ...node.data,
          ...buildCharacterDataPatch(node.data, target === 'threeView'
            ? { threeViewImageUrl: imageUrl }
            : { mainVisualImageUrl: imageUrl }),
          imageGenerationTarget: target,
          imageGenerationError: '',
        },
      };
    }));
    refreshLocalAssets();
    return { ok: true };
  }, [refreshLocalAssets, setNodes]);

  const cancelCharacterImageGeneration = useCallback((generatorId) => {
    const parsed = parseCharacterImageGeneratorId(generatorId);
    if (!parsed) return;
    const task = generationTasksRef.current[generatorId];
    if (task?.status === 'running') {
      task.status = 'canceled';
      task.controller?.abort();
    }
    const characterNode = nodesRef.current.find(node => node.id === parsed.nodeId && node.type === 'character');
    cancelBackendTaskIds(characterNode?.data?.taskIds || characterNode?.data?.imageTaskIds || []);
    setNodes(nds => nds.map(node => (
      node.id === parsed.nodeId && node.type === 'character'
        ? {
            ...node,
            data: {
              ...node.data,
              generating: false,
              imageGenerationTask: task ? { id: task.id, status: 'canceled', runId: task.runId } : null,
              generationTask: task ? { id: task.id, status: 'canceled', runId: task.runId } : null,
              currentRunId: '',
              taskIds: [],
              imageTaskIds: [],
            },
          }
        : node
    )));
  }, [cancelBackendTaskIds, setNodes]);

  const runCharacterImageGeneration = useCallback(async (generatorId, payload, generationConfig) => {
    const parsed = parseCharacterImageGeneratorId(generatorId);
    if (!parsed) return { ok: false, skipped: true, reason: '未找到角色节点' };
    const { nodeId, target } = parsed;
    const characterNode = nodesRef.current.find(node => node.id === nodeId && node.type === 'character');
    if (!characterNode) return { ok: false, skipped: true, reason: '未找到角色节点' };
    if (target === 'threeView') {
      const characterPayload = buildCharacterPayloadFromData(characterNode.data || {});
      if (!characterPayload.mainVisualImageUrl && !characterPayload.imageUrl) {
        return { ok: false, reason: '请先生成主视觉，再生成三视图' };
      }
    }
    const previousTask = generationTasksRef.current[generatorId];
    if (previousTask?.status === 'running') {
      return { ok: false, skipped: true, reason: '该角色图正在生成中' };
    }

    const runId = createGenerationRunId('character_image_run');
    const task = {
      id: `characterImage_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: 'generateImage',
      generatorId,
      resultId: nodeId,
      runId,
      status: 'running',
      controller: new AbortController(),
    };
    generationTasksRef.current[generatorId] = task;
    const taskIds = [];

    const patchTaskState = (status, errorMessage = '') => {
      const taskState = { id: uniqueTaskIds(taskIds)[0] || task.id, status, runId };
      setNodes(nds => nds.map(node => (
        node.id === nodeId && node.type === 'character'
          ? {
              ...node,
              data: {
                ...node.data,
                generating: status === 'running',
                imageGenerationTarget: target,
                imageGenerationTask: taskState,
                generationTask: taskState,
                currentRunId: status === 'running' ? runId : '',
                taskIds: status === 'running' ? uniqueTaskIds(taskIds) : [],
                imageTaskIds: status === 'running' ? uniqueTaskIds(taskIds) : [],
                imageGenerationError: errorMessage,
              },
            }
          : node
      )));
    };

    patchTaskState('running');

    try {
      const response = await fetch(`${API_BASE}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: task.controller.signal,
        body: JSON.stringify({
          ...payload,
          n: 1,
          async_mode: true,
          node_id: nodeId,
          project_id: projectId || '',
          run_id: runId,
        }),
      });
      const body = await parseJsonResponse(response, '角色图片生成提交失败');
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      if (!body.success || !body.task_id) {
        throw new Error(body.error || '角色图片生成提交失败');
      }

      taskIds.push(body.task_id);
      patchTaskState('running');
      const pollResult = await pollImageTask(
        body.task_id,
        payload.api_base_url || '',
        payload.api_key || '',
        { signal: task.controller.signal },
      );
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      const currentNode = nodesRef.current.find(node => node.id === nodeId);
      if (pollResult.success && !isTaskResultAcceptedForNode(pollResult.task, currentNode)) {
        task.status = 'canceled';
        patchTaskState('canceled');
        return { ok: false, skipped: true, reason: '任务结果已失效' };
      }
      if (!pollResult.success) {
        const status = pollResult.query_failed ? 'query_failed' : pollResult.save_failed ? 'save_failed' : 'error';
        const message = pollResult.error || '角色图片生成失败';
        task.status = 'error';
        patchTaskState(status, message);
        return { ok: false, reason: message };
      }

      const imageUrl = (pollResult.image_urls || []).find(Boolean) || '';
      if (!imageUrl) {
        throw new Error('角色图片生成完成但未返回图片 URL');
      }
      task.status = 'success';
      const configKey = getCharacterImageTargetConfigKey(target);
      const nextConfig = {
        ...(currentNode?.data?.[configKey] || {}),
        ...generationConfig,
        characterImageTarget: target,
      };
      setNodes(nds => nds.map(node => {
        if (node.id !== nodeId || node.type !== 'character') return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...buildCharacterDataPatch(node.data, target === 'threeView'
              ? { threeViewImageUrl: imageUrl, threeViewPrompt: generationConfig?.image_prompt || node.data?.threeViewPrompt || '' }
              : { mainVisualImageUrl: imageUrl, mainVisualPrompt: generationConfig?.image_prompt || node.data?.mainVisualPrompt || '' }),
            [configKey]: nextConfig,
            characterImageGeneratorConfig: nextConfig,
            imageGenerationTarget: target,
            imageGenerationTask: { id: pollResult.task_id || body.task_id, status: 'success', runId },
            generationTask: { id: pollResult.task_id || body.task_id, status: 'success', runId },
            currentRunId: '',
            taskIds: uniqueTaskIds(taskIds),
            imageTaskIds: uniqueTaskIds(taskIds),
            imageGenerationError: '',
          },
        };
      }));
      refreshLocalAssets();
      return { ok: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '角色图片生成失败';
      task.status = 'error';
      patchTaskState('error', message);
      return { ok: false, reason: message };
    } finally {
      if (generationTasksRef.current[generatorId]?.id === task.id) {
        setNodes(nds => nds.map(node => (
          node.id === nodeId && node.type === 'character'
            ? { ...node, data: { ...node.data, generating: false } }
            : node
        )));
      }
    }
  }, [projectId, refreshLocalAssets, setNodes]);

  const runVideoGeneration = useCallback(async (generatorId, payload, generationConfig) => {
    const resultId = Object.entries(pairMap.current).find(([, gid]) => gid === generatorId)?.[0];
    if (!resultId) return { ok: false, skipped: true, reason: '未找到对应视频节点' };

    const previousTask = generationTasksRef.current[generatorId];
    if (previousTask?.status === 'running') {
      return { ok: false, skipped: true, reason: '该节点正在生成中' };
    }

    const runId = createGenerationRunId('video_run');
    const task = {
      id: `generateVideo_task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: 'generateVideo',
      generatorId,
      resultId,
      runId,
      status: 'running',
      controller: new AbortController(),
    };
    generationTasksRef.current[generatorId] = task;

    const updateVideoTaskState = (status, errorMessage = '', backendTaskIds = []) => {
      if (status === 'error' || status === 'failed') {
        markNodeGenerationFailed(resultId, {
          generatorId,
          taskIds: uniqueTaskIds(backendTaskIds),
          runId,
          status: 'error',
          message: errorMessage || '视频生成失败',
        });
        return;
      }
      const taskIds = uniqueTaskIds(backendTaskIds);
      const displayTaskId = taskIds[0] || task.id;
      const abandonsRun = status === 'canceled' || status === 'cancelled';
      setNodes(nds => nds.map(node => {
        if (node.id === generatorId) {
          return {
            ...node,
            data: {
              ...node.data,
              generationTask: { id: displayTaskId, status, runId },
              lastGenerationError: errorMessage,
            },
          };
        }
        if (node.id === resultId) {
          return {
            ...node,
            data: {
              ...node.data,
              generating: status === 'running' || status === 'saving',
              generationTask: { id: displayTaskId, status, runId },
              currentRunId: abandonsRun ? '' : status === 'running' || status === 'saving' ? runId : node.data?.currentRunId,
              taskIds: status === 'running' || status === 'saving' ? taskIds : [],
              smartSplitStatus: status === 'saving' ? '正在保存生成结果...' : status === 'running' ? '正在生成...' : '',
              lastGenerationError: errorMessage,
            },
          };
        }
        return node;
      }));
    };

    updateVideoTaskState('running');

    try {
      const response = await fetch(`${API_BASE}/api/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: task.controller.signal,
        body: JSON.stringify({
          ...payload,
          async_mode: true,
          node_id: resultId,
          project_id: projectId || '',
          run_id: runId,
        }),
      });
      const body = await parseJsonResponse(response, '视频生成提交失败');
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      if (!body.success || !body.task_id) {
        const message = body.error || '视频生成提交失败';
        task.status = 'error';
        generationTasksRef.current[generatorId] = task;
        markNodeGenerationFailed(resultId, {
          generatorId,
          taskId: body.task_id || task.id,
          runId,
          status: 'error',
          message,
        });
        return { ok: false, reason: message };
      }

      const backendTaskId = body.task_id;
      updateVideoTaskState('running', '', [backendTaskId]);

      const pollResult = await pollImageTask(
        backendTaskId,
        payload.api_base_url || '',
        payload.api_key || '',
        { signal: task.controller.signal },
      );
      if (generationTasksRef.current[generatorId]?.id !== task.id || task.status !== 'running') {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      const currentNode = nodesRef.current.find(n => n.id === resultId);
      if (pollResult.success && !isTaskResultAcceptedForNode(pollResult.task, currentNode)) {
        task.status = 'canceled';
        updateVideoTaskState('canceled', '', [backendTaskId]);
        return { ok: false, skipped: true, reason: '任务结果已失效' };
      }
      if (!pollResult.success) {
        const status = pollResult.cancelled
          ? 'canceled'
          : pollResult.query_failed
            ? 'query_failed'
            : pollResult.save_failed
              ? 'save_failed'
              : 'error';
        const message = pollResult.error || '视频生成失败';
        task.status = status === 'canceled' ? 'canceled' : 'error';
        if (status === 'query_failed' || status === 'save_failed') {
          updateVideoTaskState(status, message, [backendTaskId]);
        } else if (status === 'canceled') {
          updateVideoTaskState('canceled', '', [backendTaskId]);
        } else {
          markNodeGenerationFailed(resultId, {
            generatorId,
            taskIds: [backendTaskId],
            runId,
            status: 'error',
            message,
          });
        }
        return { ok: false, reason: message };
      }

      const videoUrl = (pollResult.image_urls || []).find(Boolean) || '';
      if (!videoUrl) {
        const message = '视频生成完成但未返回视频 URL';
        task.status = 'error';
        updateVideoTaskState('save_failed', message, [backendTaskId]);
        return { ok: false, reason: message };
      }

      task.status = pollResult.save_failed ? 'save_failed' : 'success';
      generationTasksRef.current[generatorId] = task;
      onGenerate(generatorId, {
        result: '',
        videoUrl,
        taskId: backendTaskId,
        taskIds: [backendTaskId],
        currentRunId: runId,
        generationConfig,
      });
      updateVideoTaskState(task.status, pollResult.warning || '', []);
      return { ok: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, skipped: true, reason: '任务已取消' };
      if (generationTasksRef.current[generatorId]?.id !== task.id) {
        return { ok: false, skipped: true, reason: '任务已被新任务替换' };
      }
      const message = error?.message === 'Failed to fetch'
        ? '无法连接到后端 API。请确认后端服务是否启动。'
        : error?.message || '视频生成失败';
      task.status = 'error';
      generationTasksRef.current[generatorId] = task;
      markNodeGenerationFailed(resultId, {
        generatorId,
        taskId: task.id,
        runId,
        status: 'error',
        message,
      });
      return { ok: false, reason: message };
    } finally {
      if (generationTasksRef.current[generatorId]?.id === task.id) {
        setGenerating(generatorId, false);
      }
    }
  }, [markNodeGenerationFailed, onGenerate, projectId, setGenerating, setNodes]);

  const handleTaskCenterTasksUpdate = useCallback((tasks) => {
    const groupedByNode = new Map();
    tasks
      .filter(task => task?.node_id && task?.task_id)
      .forEach(task => {
        const runKey = task.run_id || task.task_id;
        const nodeGroups = groupedByNode.get(task.node_id) || new Map();
        const group = nodeGroups.get(runKey) || [];
        group.push(task);
        nodeGroups.set(runKey, group);
        groupedByNode.set(task.node_id, nodeGroups);
      });

    setNodes(nds => {
      const resultUpdates = new Map();
      const generatorUpdates = new Map();
      const characterUpdates = new Map();

      nds.filter(node => (
        node.type === 'result'
        && (node.data?.resultType === 'generateImage' || node.data?.resultType === 'generateVideo')
      )).forEach(node => {
        const nodeGroups = groupedByNode.get(node.id);
        if (!nodeGroups || nodeGroups.size === 0) return;

        const currentRunId = node.data?.currentRunId || '';
        const nodeTaskIds = Array.isArray(node.data?.taskIds) ? node.data.taskIds : [];
        const groups = Array.from(nodeGroups.values());
        const selectedTasks = (
          (currentRunId && nodeGroups.get(currentRunId))
          || groups.find(group => group.some(task => nodeTaskIds.includes(task.task_id)))
          || groups.sort((a, b) => (
            Math.max(...b.map(task => Number(task.created_at) || 0))
            - Math.max(...a.map(task => Number(task.created_at) || 0))
          ))[0]
        );
        if (!selectedTasks || !isTaskCenterGroupAcceptedForNode(selectedTasks, node)) return;

        const normalizedTasks = selectedTasks.map(task => ({
          ...task,
          status: normalizeTaskStatus(task.status),
        }));
        const statuses = normalizedTasks.map(task => task.status);
        const hasRunning = statuses.includes('running');
        const hasSaving = statuses.includes('saving');
        const isActive = hasRunning || hasSaving;
        const renderableUrls = uniqueTaskIds(normalizedTasks.flatMap(getTaskRenderableUrls));
        const sourceToServer = new Map(
          normalizedTasks.flatMap(getTaskSourceToServerEntries)
        );
        const hasFailure = statuses.some(status => TASK_CENTER_FAILURE_STATUSES.has(status));
        const hasSaveFailure = statuses.includes('save_failed');
        const allCancelled = statuses.every(status => TASK_CENTER_CANCELLED_STATUSES.has(status));
        const status = isActive
          ? (hasRunning ? 'running' : 'saving')
          : renderableUrls.length > 0
            ? (hasFailure || hasSaveFailure ? 'partial_error' : 'completed')
            : statuses.includes('query_failed')
              ? 'query_failed'
              : statuses.includes('failed') || statuses.includes('error')
                ? 'failed'
                : hasSaveFailure
                  ? 'save_failed'
                  : allCancelled
                    ? 'cancelled'
                    : statuses[0] || 'failed';
        const runId = normalizedTasks.find(task => task.run_id)?.run_id || '';
        const taskIds = normalizedTasks.map(task => task.task_id).filter(Boolean);
        const generationTask = {
          id: taskIds[0] || '',
          status,
          runId,
          ...buildGenerationTaskTiming(normalizedTasks),
        };
        const errorTask = normalizedTasks.find(task => (
          TASK_CENTER_FAILURE_STATUSES.has(task.status) || task.status === 'save_failed'
        ));
        const errorMessage = errorTask ? getTaskErrorMessage(errorTask) : '';
        const patch = {
          generating: isActive,
          generationTask,
          taskIds: isActive ? taskIds : [],
          currentRunId: isActive ? runId : '',
          smartSplitStatus: hasSaving ? '正在保存生成结果...' : isActive ? '正在生成...' : '',
          lastGenerationError: errorMessage,
        };

        if (renderableUrls.length > 0) {
          if (node.data?.resultType === 'generateVideo' || normalizedTasks.some(task => task.type === 'video')) {
            patch.videoUrl = renderableUrls[0];
          } else if (node.data?.resultType === 'generateImage') {
            const currentUrls = Array.isArray(node.data?.imageUrls) && node.data.imageUrls.length > 0
              ? node.data.imageUrls
              : node.data?.imageUrl ? [node.data.imageUrl] : [];
            const migratedCurrent = uniqueTaskIds(currentUrls.map(url => sourceToServer.get(url) || url));
            const migratedRenderable = uniqueTaskIds(renderableUrls.map(url => sourceToServer.get(url) || url));
            const coverIndex = Number.isInteger(node.data?.coverIndex)
              && node.data.coverIndex >= 0
              && node.data.coverIndex < migratedCurrent.length
              ? node.data.coverIndex
              : 0;
            const taskRunId = runId || getNodeGenerationRunId(node.data);
            const appendedImages = appendImageResultImages({
              ...node.data,
              imageUrl: migratedCurrent[coverIndex] || '',
              imageUrls: migratedCurrent,
              coverIndex,
            }, migratedRenderable, {
              preserveCover: shouldPreserveManualCoverForRun(node.data, taskRunId),
            });
            patch.imageUrl = appendedImages.imageUrl;
            patch.imageUrls = appendedImages.imageUrls;
            patch.coverIndex = appendedImages.coverIndex;
          }
        }

        resultUpdates.set(node.id, patch);
        const generatorId = pairMap.current[node.id];
        if (generatorId) {
          generatorUpdates.set(generatorId, {
            generationTask,
            lastGenerationError: errorMessage,
          });
        }
      });

      nds.filter(node => node.type === 'character').forEach(node => {
        const nodeGroups = groupedByNode.get(node.id);
        if (!nodeGroups || nodeGroups.size === 0) return;
        const currentCertification = normalizeAvatarCertification(
          node.data?.avatarCertification || node.data?.characterPayload?.avatarCertification
        );
        const groups = Array.from(nodeGroups.values());
        const selectedTasks = (
          (currentCertification.taskId && groups.find(group => group.some(task => task.task_id === currentCertification.taskId)))
          || groups.sort((a, b) => (
            Math.max(...b.map(task => Number(task.created_at) || 0))
            - Math.max(...a.map(task => Number(task.created_at) || 0))
          ))[0]
        );
        if (!selectedTasks) return;
        const certificationTask = selectedTasks.find(task => task.type === 'avatar_certification')
          || selectedTasks.find(task => task.result?.usable_assets || task.result?.usableAssets);
        if (!certificationTask) return;
        const status = normalizeTaskStatus(certificationTask.status);
        const result = certificationTask.result || {};
        const usableAssets = result.usable_assets || result.usableAssets || [];
        const failedAssets = result.failed_assets || result.failedAssets || [];
        const submittedAssets = certificationTask.submitted_assets || certificationTask.submittedAssets || [];
        const errorMessage = getTaskErrorMessage(certificationTask);
        const nextCertification = normalizeAvatarCertification({
          status: status === 'completed' && usableAssets.length > 0
            ? 'verified'
            : status === 'running' || status === 'saving' || status === 'query_failed'
              ? 'processing'
              : TASK_CENTER_FAILURE_STATUSES.has(status)
                ? 'failed'
                : currentCertification.status,
          taskId: certificationTask.task_id || currentCertification.taskId,
          groupId: result.group_id || result.groupId || currentCertification.groupId,
          groupName: result.group_name || result.groupName || currentCertification.groupName,
          usableAssets,
          failedAssets,
          submittedAssets,
          errorMessage,
          updatedAt: new Date().toISOString(),
        });
        characterUpdates.set(node.id, {
          avatarCertification: nextCertification,
          characterPayload: {
            ...(node.data?.characterPayload || buildCharacterPayloadFromData(node.data || {})),
            avatarCertification: nextCertification,
          },
        });
      });

      if (resultUpdates.size === 0 && generatorUpdates.size === 0 && characterUpdates.size === 0) return nds;
      return nds.map(node => {
        const patch = resultUpdates.get(node.id) || generatorUpdates.get(node.id) || characterUpdates.get(node.id);
        return patch ? { ...node, data: { ...node.data, ...patch } } : node;
      });
    });
  }, [setNodes]);

  const taskCenterSyncInFlightRef = useRef(false);
  const syncCanvasFromTaskCenter = useCallback(async () => {
    if (taskCenterSyncInFlightRef.current) return;
    taskCenterSyncInFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      const response = await fetch(`${API_BASE}/api/tasks${params.toString() ? `?${params.toString()}` : ''}`);
      const data = await parseJsonResponse(response, '同步任务中心失败');
      if (!data.success || !Array.isArray(data.tasks)) return;

      const taskMap = new Map(data.tasks.map(task => [task.task_id, task]));
      const refreshableTasks = data.tasks.filter(task => (
        task?.task_id && (task.status === 'running' || task.status === 'query_failed')
      ));
      if (refreshableTasks.length > 0) {
        const refreshed = await Promise.allSettled(refreshableTasks.map(async task => {
          const taskResponse = await fetch(`${API_BASE}/api/task/${encodeURIComponent(task.task_id)}`);
          const taskData = await parseJsonResponse(taskResponse, '刷新任务状态失败');
          return taskData.success ? taskData.data : null;
        }));
        refreshed
          .filter(result => result.status === 'fulfilled' && result.value)
          .forEach(result => taskMap.set(result.value.task_id, result.value));
      }

      handleTaskCenterTasksUpdate(Array.from(taskMap.values()));
    } catch (error) {
      console.warn('[task-center-sync] 同步任务中心失败', error);
    } finally {
      taskCenterSyncInFlightRef.current = false;
    }
  }, [handleTaskCenterTasksUpdate, projectId]);

  useEffect(() => {
    syncCanvasFromTaskCenter();
    const interval = window.setInterval(syncCanvasFromTaskCenter, 5000);
    return () => window.clearInterval(interval);
  }, [syncCanvasFromTaskCenter]);

  const onSmartSplitterDataChange = useCallback((splitterId, patch) => {
    setNodes(nds => nds.map(node => (
      node.id === splitterId
        ? { ...node, data: { ...node.data, ...patch } }
        : node
    )));
  }, [setNodes]);

  const cancelSmartSplitter = useCallback((splitterId) => {
    const controller = smartSplitterAbortRef.current.get(splitterId);
    if (!controller) return;
    controller.abort();
    smartSplitterAbortRef.current.delete(splitterId);
    onSmartSplitterDataChange(splitterId, {
      status: '',
      statusLabel: '',
      errorMessage: '',
    });
  }, [onSmartSplitterDataChange]);

  const createSmartSplitterRuntimeData = useCallback((data = {}) => {
    const uploadedReferenceImages = normalizeImageList(data.uploaded_reference_images);
    const connectedImages = normalizeImageList(data.connected_images);
    const referenceImageCount = [...new Set([
      ...connectedImages,
      ...uploadedReferenceImages,
    ].filter(Boolean))].length;
    return {
      label: '智能拆分器',
      local_prompt: '',
      uploaded_reference_images: [],
      direction_count: 'auto',
      images_per_direction: 1,
      image_negative_prompt: resolveImageNegativePrompt(data.image_negative_prompt),
      image_size: '3:4',
      image_resolution: '1k',
      batches: [],
      status: '',
      ...data,
      status: normalizeSmartSplitterPhase(data.status),
      statusLabel: '',
      connected_images: connectedImages,
      uploaded_reference_images: uploadedReferenceImages,
      referenceImageCount,
      apiConfigs,
      apiProviders,
      promptStyles: officialPromptStyles,
      onRun: runSmartSplitterRef.current,
      onCancel: cancelSmartSplitter,
      onDataChange: onSmartSplitterDataChange,
      onNodeTitleChange,
      onInteractiveDragCreate,
      onDeleteNode: deleteCanvasNode,
    };
  }, [apiConfigs, apiProviders, cancelSmartSplitter, deleteCanvasNode, officialPromptStyles, onInteractiveDragCreate, onNodeTitleChange, onSmartSplitterDataChange]);

  const runSmartSplitter = useCallback(async (splitterId, config) => {
    const splitterNode = nodesRef.current.find(node => node.id === splitterId);
    if (!splitterNode) return { ok: false, skipped: true, reason: '未找到拆分器节点' };

    // A splitter only owns its in-flight analysis request. Downstream image tasks
    // are registered independently by generatorId.
    smartSplitterAbortRef.current.get(splitterId)?.abort();
    const abortController = new AbortController();
    smartSplitterAbortRef.current.set(splitterId, abortController);
    const { signal } = abortController;

    const textProviders = getEnabledProvidersWithModels(apiProviders, 'text');
    const imageProviders = getEnabledProvidersWithModels(apiProviders, 'image');
    const textProvider = textProviders.find(provider => provider.id === config.text_api_id) || textProviders[0];
    const imageProvider = imageProviders.find(provider => provider.id === config.image_api_id) || imageProviders[0];
    const textModel = config.text_model || getDefaultProviderModel(textProvider, 'text');
    const imageModel = config.image_model || getDefaultProviderModel(imageProvider, 'image');

    if (!textProvider || !textModel) {
      smartSplitterAbortRef.current.delete(splitterId);
      onSmartSplitterDataChange(splitterId, { status: '', statusLabel: '', errorMessage: '请先配置文本模型' });
      return { ok: false, reason: '请先配置文本模型' };
    }
    if (!imageProvider || !imageModel) {
      smartSplitterAbortRef.current.delete(splitterId);
      onSmartSplitterDataChange(splitterId, { status: '', statusLabel: '', errorMessage: '请先配置图片模型' });
      return { ok: false, reason: '请先配置图片模型' };
    }

    const incoming = edgesRef.current.filter(edge => edge.target === splitterId);
    const sources = incoming.map(edge => nodesRef.current.find(node => node.id === edge.source)).filter(Boolean);
    const upstreamTexts = sources.map(getResultNodeText).filter(Boolean);
    const upstreamImages = sources.flatMap(getNodeOutputImages);
    const merged = mergeSplitterInputs({
      localPrompt: config.local_prompt,
      upstreamTexts,
      upstreamImages,
      uploadedImages: config.uploaded_reference_images,
      maxImages: 10,
    });

    const currentBatches = Array.isArray(splitterNode.data?.batches) ? splitterNode.data.batches : [];
    const batchIndex = getNextSmartSplitterBatchIndex(currentBatches);

    onSmartSplitterDataChange(splitterId, {
      ...config,
      text_api_id: textProvider.id,
      text_model: textModel,
      image_api_id: imageProvider.id,
      image_model: imageModel,
      status: 'analyzing',
      statusLabel: '',
      errorMessage: '',
      connectedPrompt: upstreamTexts.join('\n\n'),
      connected_images: upstreamImages,
      referenceImageCount: merged.referenceImages.length,
    });

    let directions;
    try {
      directions = await requestSplitDirections({
        provider: textProvider,
        model: textModel,
        request: merged.request,
        context: merged.context,
        directionCount: config.direction_count || 'auto',
        referenceImageCount: merged.referenceImages.length,
        imageSize: config.image_size,
      });
    } catch (error) {
      smartSplitterAbortRef.current.delete(splitterId);
      if (signal.aborted) return { ok: false, skipped: true, reason: '任务已取消' };
      const message = error?.message || '提示词分析失败';
      onSmartSplitterDataChange(splitterId, {
        status: '',
        statusLabel: '',
        errorMessage: message,
      });
      return { ok: false, reason: message };
    }

    if (signal.aborted) {
      smartSplitterAbortRef.current.delete(splitterId);
      return { ok: false, skipped: true, reason: '任务已取消' };
    }
    if (directions.length === 0) {
      smartSplitterAbortRef.current.delete(splitterId);
      onSmartSplitterDataChange(splitterId, { status: '', statusLabel: '', errorMessage: '未拆出有效方向' });
      return { ok: false, reason: '未拆出有效方向' };
    }

    const ratioLockedDirections = directions.map(direction => enforceImageRatioInPrompt(direction, config.image_size));
    const requestedImagesPerDirection = Math.max(1, Math.min(Number(config.images_per_direction) || 1, 4));
    onSmartSplitterDataChange(splitterId, {
      status: 'creating',
      statusLabel: '',
      errorMessage: '',
    });
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    if (signal.aborted) {
      smartSplitterAbortRef.current.delete(splitterId);
      return { ok: false, skipped: true, reason: '任务已取消' };
    }

    const ts = Date.now();
    const batchId = `split_batch_${ts}_${Math.random().toString(16).slice(2)}`;
    const splitterPosition = getAbsoluteNodePosition(splitterNode, nodesRef.current);
    const cardWidth = 280;
    const cardHeight = Math.round(cardWidth / (getRatioValue(config.image_size) || (3 / 4)));
    const gap = 26;
    const batchOrigin = {
      x: splitterPosition.x + getNodeWidth(splitterNode) + 90,
      y: splitterPosition.y,
    };

    const resultNodes = [];
    const generatorNodes = [];
    const sourceEdges = [];
    ratioLockedDirections.forEach((directionPrompt, index) => {
      const resultId = `result_${batchId}_${index + 1}`;
      const generatorId = `generator_${batchId}_${index + 1}`;
      pairMap.current[resultId] = generatorId;
      const position = {
        x: batchOrigin.x + index * (cardWidth + gap),
        y: batchOrigin.y,
      };
      resultNodes.push({
        id: resultId,
        type: 'result',
        position,
        style: { width: cardWidth, height: cardHeight },
        data: {
          label: `图片 · 方向 ${index + 1}`,
          result: '',
          resultType: 'generateImage',
          pairedGeneratorId: generatorId,
          promptDraft: directionPrompt,
          imageSize: config.image_size,
          imageResolution: config.image_resolution,
          generationConfig: {
            image_prompt: directionPrompt,
            image_negative_prompt: resolveImageNegativePrompt(config.image_negative_prompt),
            image_model: imageModel,
            image_api_id: imageProvider.id,
            image_size: config.image_size,
            image_resolution: config.image_resolution,
            image_count: requestedImagesPerDirection,
          },
          splitter_source_id: splitterId,
          splitter_batch_id: batchId,
          splitter_direction_index: index,
          apiConfigs,
          apiProviders,
          onDeleteNode: deleteCanvasNode,
          onInteractiveDragCreate,
          onNodeResize,
          onResultMediaAspectChange,
          onResultDataChange,
          onResultImageUpload,
          onResultExpandStateChange,
          onResultTextChange,
        },
        selected: false,
        zIndex: 1,
      });
      generatorNodes.push({
        id: generatorId,
        type: 'generator',
        position: {
          x: position.x + (cardWidth - PROCESSOR_WIDTH) / 2,
          y: position.y + cardHeight + PROCESSOR_GAP_Y,
        },
        hidden: true,
        data: {
          pairedResultId: resultId,
          onGenerate,
          setGenerating,
          onGeneratorDataChange,
          onRunTextGeneration: runTextGeneration,
          onRunImageGeneration: runImageGeneration,
          onRunVideoGeneration: runVideoGeneration,
          onCancelGeneration: cancelGenerationTask,
          onPromptDraftChange: onGeneratorPromptChange,
          connectedPrompt: directionPrompt,
          connectedTextReferences: [directionPrompt],
          connectedImages: merged.referenceImages,
          connectedVideos: [],
          uploadedReferenceImages: [],
          generatorType: 'generateImage',
          apiConfigs,
          apiProviders,
          promptDraft: directionPrompt,
          image_prompt: directionPrompt,
          image_negative_prompt: resolveImageNegativePrompt(config.image_negative_prompt),
          image_model: imageModel,
          image_api_id: imageProvider.id,
          image_size: config.image_size,
          image_resolution: config.image_resolution,
          image_count: config.images_per_direction,
          splitter_source_id: splitterId,
          splitter_batch_id: batchId,
          splitter_direction_index: index,
        },
      });
      sourceEdges.push({
        id: `e_${splitterId}_${resultId}`,
        source: splitterId,
        target: resultId,
        data: { splitterId, batchId, directionIndex: index },
        style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
        animated: false,
      });
    });

    const batchRecord = {
      batch_id: batchId,
      batch_index: batchIndex,
      result_node_ids: resultNodes.map(node => node.id),
      created_at: Date.now(),
      source_prompt_snapshot: merged.request,
      direction_count: directions.length,
      images_per_direction: Number(config.images_per_direction),
    };

    setNodes(nds => [
      ...nds
        .map(node => node.id === splitterId
          ? {
              ...node,
              data: {
                ...node.data,
                ...config,
                batches: appendSmartSplitterBatch(currentBatches, batchRecord),
                status: '',
                statusLabel: '',
                errorMessage: '',
              },
            }
          : node),
      ...resultNodes,
      ...generatorNodes,
    ]);
    setEdges(eds => [
      ...eds,
      ...sourceEdges,
    ]);
    smartSplitterAbortRef.current.delete(splitterId);

    const launchPrompts = ratioLockedDirections.map(direction => (
      composeImageGenerationPrompt(
        buildPromptWithImageMentions(direction, merged.referenceImages, {
          requireReferences: true,
          referenceLabel: '智能拆分器输入素材',
        }),
        resolveImageNegativePrompt(config.image_negative_prompt),
      )
    ));
    const launches = buildSmartSplitterDirectionLaunches({
      directionPrompts: launchPrompts,
      generatorIds: generatorNodes.map(node => node.id),
      provider: imageProvider,
      model: imageModel,
      imageSize: config.image_size,
      imageResolution: config.image_resolution,
      imagesPerDirection: requestedImagesPerDirection,
      referenceImages: merged.referenceImages,
      displayPrompts: ratioLockedDirections,
      negativePrompt: resolveImageNegativePrompt(config.image_negative_prompt),
      splitterId,
      batchId,
    });

    window.setTimeout(() => {
      launches.forEach(({ generatorId, payload, generationConfig }) => {
        void runImageGeneration(generatorId, payload, generationConfig);
      });
    }, 0);

    return {
      ok: true,
      created: resultNodes.length,
    };
  }, [
    apiConfigs,
    apiProviders,
    cancelGenerationTask,
    deleteCanvasNode,
    getAbsoluteNodePosition,
    onGenerate,
    onGeneratorDataChange,
    onGeneratorPromptChange,
    onInteractiveDragCreate,
    onNodeResize,
    onResultDataChange,
    onResultExpandStateChange,
    onResultImageUpload,
    onResultMediaAspectChange,
    onResultTextChange,
    onSmartSplitterDataChange,
    runImageGeneration,
    runTextGeneration,
    runVideoGeneration,
    setEdges,
    setGenerating,
    setNodes,
  ]);

  const buildGeneratorRunRequest = useCallback((generatorNode) => {
    if (!generatorNode) {
      return { ok: false, reason: '未找到对应处理器' };
    }

    const data = generatorNode.data || {};
    const generatorType = data.generatorType || 'generateText';
    const providers = runtimeSettings?.providers || apiProviders || [];
    const commonConfig = getGeneratorCommonGenerationConfig(data);
    const connectedPrompt = appendPrompt(...commonConfig.connectedTextReferences);
    const referenceImages = getGeneratorReferenceImages(data);
    const referenceVideos = getGeneratorReferenceVideos(data);

    if (generatorType === 'generateText') {
      const { provider, model } = pickGeneratorProviderModel(data, 'text', providers);
      const maxTextTokens = getProviderMaxTextTokens(provider, runtimeSettings.maxTextTokens);
      const userPrompt = data.user_prompt || data.promptDraft || '';
      const combinedPrompt = appendPrompt(connectedPrompt, userPrompt);
      if (!combinedPrompt && referenceImages.length === 0) {
        return { ok: false, reason: '文本节点没有提示词或参考素材' };
      }
      return {
        ok: true,
        type: 'generateText',
        payload: {
          provider_id: provider?.id || '',
          api_protocol: provider?.protocol || data.api_protocol || 'openai',
          api_base_url: provider?.baseUrl || data.api_base_url || '',
          text_api_mode: provider?.textApiMode || data.text_api_mode || 'auto',
          api_key: provider?.apiKey || data.api_key || '',
          model_name: model,
          system_prompt: data.system_prompt || '你是一个专业的文本生成助手。',
          user_prompt: buildPromptWithImageMentions(combinedPrompt, referenceImages),
          temperature: data.temperature ?? 0.7,
          max_tokens: maxTextTokens,
          image_urls: referenceImages,
          video_urls: referenceVideos,
        },
        generationConfig: {
          ...commonConfig,
          user_prompt: userPrompt,
          system_prompt: data.system_prompt || '你是一个专业的文本生成助手。',
          model_name: model,
          text_api_id: provider?.id || data.text_api_id || '',
          temperature: data.temperature ?? 0.7,
          max_tokens: maxTextTokens,
        },
      };
    }

    if (generatorType === 'generateImage') {
      const { provider, model } = pickGeneratorProviderModel(data, 'image', providers);
      const hasConnectedText = Boolean(data.connectedPrompt || commonConfig.connectedTextReferences.length > 0);
      const imagePrompt = data.image_prompt || (hasConnectedText ? '' : data.promptDraft || '');
      const combinedPrompt = appendPrompt(connectedPrompt, imagePrompt);
      if (!combinedPrompt) {
        return { ok: false, reason: '图片节点没有提示词' };
      }
      const imageCount = Math.max(1, Math.min(Number(data.image_count || data.image_n) || 1, 4));
      return {
        ok: true,
        type: 'generateImage',
        payload: {
          provider_id: provider?.id || '',
          api_protocol: provider?.protocol || data.api_protocol || 'openai',
          api_base_url: provider?.baseUrl || data.api_base_url || '',
          api_key: provider?.apiKey || data.api_key || '',
          prompt: composeImageGenerationPrompt(
            buildPromptWithImageMentions(combinedPrompt, referenceImages),
            resolveImageNegativePrompt(data.image_negative_prompt),
          ),
          model,
          size: data.image_size || '3:4',
          resolution: data.image_resolution || '1k',
          quality: data.image_quality || 'auto',
          background: data.image_background || 'auto',
          output_format: data.image_output_format || 'png',
          n: 1,
          image_urls: referenceImages,
          video_urls: referenceVideos,
        },
        generationConfig: {
          ...commonConfig,
          image_prompt: imagePrompt,
          image_negative_prompt: resolveImageNegativePrompt(data.image_negative_prompt),
          image_model: model,
          image_api_id: provider?.id || data.image_api_id || '',
          image_size: data.image_size || '3:4',
          image_resolution: data.image_resolution || '1k',
          image_quality: data.image_quality || 'auto',
          image_background: data.image_background || 'auto',
          image_output_format: data.image_output_format || 'png',
          image_count: imageCount,
        },
      };
    }

    if (generatorType === 'generateVideo') {
      const { provider, model } = pickGeneratorProviderModel(data, 'video', providers);
      const videoPrompt = data.video_prompt || data.prompt || '';
      const combinedPrompt = appendPrompt(connectedPrompt, videoPrompt);
      const videoCapabilities = provider?.videoModelCapabilities?.[model]?.capabilities || {};
      const supportsStructuredVideoReferences = Boolean(
        videoCapabilities.supportsOmniReference || videoCapabilities.supportsFirstLastFrame
      );
      const generationModes = Array.isArray(videoCapabilities.generationModes)
        ? videoCapabilities.generationModes
        : [VIDEO_GENERATION_MODE_OMNI];
      const generationMode = generationModes.includes(data.video_generation_mode)
        ? data.video_generation_mode
        : generationModes[0] || VIDEO_GENERATION_MODE_OMNI;
      const isFirstLastFrameMode = generationMode === VIDEO_GENERATION_MODE_FIRST_LAST;
      const firstFrameUrl = referenceImages.includes(data.video_first_frame_url)
        ? data.video_first_frame_url
        : referenceImages[0] || '';
      const lastFrameUrl = referenceImages.includes(data.video_last_frame_url)
        ? data.video_last_frame_url
        : referenceImages.find(src => src !== firstFrameUrl) || '';
      if (!combinedPrompt && !(isFirstLastFrameMode && firstFrameUrl && lastFrameUrl)) {
        return { ok: false, reason: '视频节点没有提示词或首尾帧' };
      }
      if (isFirstLastFrameMode && (!firstFrameUrl || !lastFrameUrl)) {
        return { ok: false, reason: '首尾帧模式需要同时提供首帧和尾帧图片' };
      }
      const videoReferenceImages = model?.toLowerCase().includes('sora')
        ? referenceImages.slice(0, 1)
        : referenceImages;
      const imageWithRoles = isFirstLastFrameMode
        ? [
          { url: firstFrameUrl, role: 'first_frame', assetRole: 'first_frame', name: '首帧' },
          { url: lastFrameUrl, role: 'last_frame', assetRole: 'last_frame', name: '尾帧' },
        ]
        : [];
      const payloadImageUrls = isFirstLastFrameMode ? [] : videoReferenceImages;
      const payloadVideoUrls = isFirstLastFrameMode ? [] : referenceVideos;
      const promptWithImages = buildPromptWithImageMentions(combinedPrompt, payloadImageUrls);
      return {
        ok: true,
        type: 'generateVideo',
        payload: {
          provider_id: provider?.id || '',
          api_protocol: provider?.protocol || data.api_protocol || 'openai',
          api_base_url: provider?.baseUrl || data.api_base_url || '',
          api_key: provider?.apiKey || data.api_key || '',
          prompt: supportsStructuredVideoReferences
            ? buildSeedanceMediaPrompt(promptWithImages, {
              imageUrls: payloadImageUrls,
              imageWithRoles,
              videoUrls: payloadVideoUrls,
            })
            : promptWithImages,
          model,
          duration: data.video_duration || data.duration || 8,
          aspect_ratio: data.video_aspect_ratio || data.aspect_ratio || '16:9',
          resolution: data.video_resolution || data.resolution || '720p',
          generation_mode: generationMode,
          generate_audio: data.video_generate_audio !== false,
          image_urls: payloadImageUrls,
          image_with_roles: imageWithRoles,
          video_urls: payloadVideoUrls,
          reference_video_urls: payloadVideoUrls,
        },
        generationConfig: {
          ...commonConfig,
          video_prompt: videoPrompt,
          video_model: model,
          video_api_id: provider?.id || data.video_api_id || '',
          video_aspect_ratio: data.video_aspect_ratio || data.aspect_ratio || '16:9',
          video_duration: data.video_duration || data.duration || 8,
          video_resolution: data.video_resolution || data.resolution || '720p',
          video_generation_mode: generationMode,
          video_first_frame_url: firstFrameUrl,
          video_last_frame_url: lastFrameUrl,
          video_generate_audio: data.video_generate_audio !== false,
        },
      };
    }

    if (generatorType === 'generateAudio') {
      const { provider } = pickGeneratorProviderModel(data, 'text', providers);
      const audioText = appendPrompt(connectedPrompt, data.audio_text || data.promptDraft || '');
      if (!audioText) {
        return { ok: false, reason: '音频节点没有朗读文本' };
      }
      return {
        ok: true,
        type: 'generateAudio',
        payload: {
          api_key: provider?.apiKey || data.api_key || '',
          text: audioText,
          voice: data.audio_voice || '冰糖',
          style: data.audio_style || '',
        },
        generationConfig: {
          ...commonConfig,
          audio_text: data.audio_text || '',
          audio_voice: data.audio_voice || '冰糖',
          audio_style: data.audio_style || '',
          text_api_id: provider?.id || data.text_api_id || '',
        },
      };
    }

    return { ok: false, reason: '第一版暂不支持该类型的批量运行' };
  }, [apiProviders, runtimeSettings.maxTextTokens, runtimeSettings.providers]);

  const runSelectedNode = useCallback(async (nodeId) => {
    const currentNodes = nodesRef.current;
    const node = currentNodes.find(item => item.id === nodeId);
    if (!node) return { ok: false, skipped: true, reason: '节点不存在' };

    if (node.type === 'smartSplitter') {
      if (node.data?.status === 'analyzing' || node.data?.status === 'generating') {
        return { ok: false, skipped: true, reason: '拆分器正在运行中' };
      }
      const result = await runSmartSplitter(node.id, node.data || {});
      return result || { ok: true };
    }

    if (node.type !== 'result') {
      return { ok: false, skipped: true, reason: '该节点不能直接运行' };
    }

    const generatorId = pairMap.current[node.id] || node.data?.pairedGeneratorId;
    const generatorNode = currentNodes.find(item => item.id === generatorId);
    if (isRunningGenerationNode(node) || isRunningGenerationNode(generatorNode)) {
      return { ok: false, skipped: true, reason: '节点正在生成中' };
    }

    const request = buildGeneratorRunRequest(generatorNode);
    if (!request.ok) {
      return { ok: false, reason: request.reason };
    }

    if (request.type === 'generateText') {
      return await runTextGeneration(generatorId, request.payload, request.generationConfig);
    }
    if (request.type === 'generateImage') {
      return await runImageGeneration(generatorId, request.payload, request.generationConfig);
    }
    if (request.type === 'generateVideo') {
      return await runVideoGeneration(generatorId, request.payload, request.generationConfig);
    }
    if (request.type === 'generateAudio') {
      return await runAudioGeneration(generatorId, request.payload, request.generationConfig);
    }
    return { ok: false, reason: '暂不支持该节点类型' };
  }, [buildGeneratorRunRequest, runAudioGeneration, runImageGeneration, runSmartSplitter, runTextGeneration, runVideoGeneration]);

  const getDependencyRunnableNodeIds = useCallback((candidateNodeIds = []) => {
    const currentNodes = nodesRef.current;
    const candidateIdSet = new Set(candidateNodeIds.filter(Boolean));
    return currentNodes
      .filter(node => candidateIdSet.has(node.id) && isDependencyRunCandidateNode(node))
      .filter(node => {
        if (node.type === 'smartSplitter') return true;
        if (node.type !== 'result') return false;
        if (!shouldOpenResultComposer(node)) return false;
        const generatorId = pairMap.current[node.id] || node.data?.pairedGeneratorId;
        const generatorNode = currentNodes.find(item => item.id === generatorId);
        return buildGeneratorRunRequest(generatorNode).ok;
      })
      .map(node => node.id);
  }, [buildGeneratorRunRequest]);

  const runNodeIdsWithDependencies = useCallback(async (candidateNodeIds = [], {
    emptyMessage = '所选节点里没有可运行的图片、文本、视频、音频或拆分器节点',
    scopeLabel = '选区运行',
    silent = false,
  } = {}) => {
    syncPromptToGenerators();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    const selectedRunnableIds = getDependencyRunnableNodeIds(candidateNodeIds);

    if (selectedRunnableIds.length === 0) {
      if (!silent) window.alert(emptyMessage);
      return {
        successCount: 0,
        failureCount: 0,
        failedItems: [],
        empty: true,
        message: emptyMessage,
      };
    }

    const selectedSet = new Set(selectedRunnableIds);
    const batches = buildSelectionRunBatches(selectedRunnableIds, edgesRef.current);
    const blockedIds = new Set();
    const failedItems = [];
    let successCount = 0;

    const hasBlockedUpstream = (nodeId) => edgesRef.current.some(edge => (
      selectedSet.has(edge.source)
      && selectedSet.has(edge.target)
      && edge.target === nodeId
      && blockedIds.has(edge.source)
    ));

    for (const batch of batches) {
      const runnableBatch = batch.filter(nodeId => {
        if (!hasBlockedUpstream(nodeId)) return true;
        blockedIds.add(nodeId);
        failedItems.push({ nodeId, reason: '上游节点未成功，已跳过' });
        return false;
      });

      const batchResults = await Promise.all(runnableBatch.map(async nodeId => ({
        nodeId,
        result: await runSelectedNode(nodeId),
      })));

      batchResults.forEach(({ nodeId, result }) => {
        if (result?.ok) {
          successCount += 1;
          return;
        }
        blockedIds.add(nodeId);
        failedItems.push({ nodeId, reason: result?.reason || '运行失败' });
      });
    }

    const reasonPreview = failedItems
      .slice(0, 3)
      .map(item => item.reason)
      .join('；');
    const message = failedItems.length > 0
      ? `${scopeLabel}已处理：${successCount} 个节点成功发起或完成，${failedItems.length} 个节点跳过或失败。${reasonPreview}`
      : `${scopeLabel}已处理：${successCount} 个节点成功发起或完成。`;
    if (!silent && failedItems.length > 0) window.alert(message);
    return {
      successCount,
      failureCount: failedItems.length,
      failedItems,
      empty: false,
      message,
    };
  }, [getDependencyRunnableNodeIds, runSelectedNode, syncPromptToGenerators]);

  const handleRunSelected = useCallback(async () => {
    const selectedIds = nodesRef.current
      .filter(node => node.selected)
      .map(node => node.id);
    await runNodeIdsWithDependencies(selectedIds);
  }, [runNodeIdsWithDependencies]);

  const collectGroupRunnableNodeIds = useCallback((groupId) => {
    const currentNodes = nodesRef.current;
    const nodesById = new Map(currentNodes.map(node => [node.id, node]));
    const resultIds = [];
    const visitedGroupIds = new Set();

    const collectFromGroup = (targetGroupId) => {
      if (visitedGroupIds.has(targetGroupId)) return;
      visitedGroupIds.add(targetGroupId);
      const groupNode = nodesById.get(targetGroupId);
      const explicitChildIds = Array.isArray(groupNode?.data?.childIds) ? groupNode.data.childIds : [];
      const parentChildIds = currentNodes
        .filter(node => node.parentNode === targetGroupId)
        .map(node => node.id);
      uniqueValues([...explicitChildIds, ...parentChildIds]).forEach(childId => {
        const childNode = nodesById.get(childId);
        if (!childNode) return;
        if (childNode.type === 'group') {
          collectFromGroup(childNode.id);
          return;
        }
        if (isDependencyRunCandidateNode(childNode)) {
          resultIds.push(childNode.id);
        }
      });
    };

    collectFromGroup(groupId);
    return uniqueValues(resultIds);
  }, []);

  const handleRunGroup = useCallback(async (groupId) => {
    const groupRunnableIds = collectGroupRunnableNodeIds(groupId);
    await runNodeIdsWithDependencies(groupRunnableIds, {
      emptyMessage: '这个组合里没有可运行的图片、文本、视频或拆分器节点',
      scopeLabel: '组合运行',
    });
  }, [collectGroupRunnableNodeIds, runNodeIdsWithDependencies]);

  runSmartSplitterRef.current = runSmartSplitter;

  const imageActionHandlerRef = useRef(null);

  // 创建「生成」结果节点 + 对应处理器浮层
  const createGeneratePair = useCallback((type, position, sourceNodeId, options = {}) => {
    const token = createRuntimeNodeToken();
    const resultId = `result_${token}`;
    const generatorId = `generator_${token}`;
    const sourceHandle = options.sourceHandle || null;
    const sourceNodeAtCreation = sourceNodeId
      ? nodesRef.current.find(node => node.id === sourceNodeId)
      : null;
    const initialConnectedImages = options.connectedImages ?? getConnectedImagesForNewGenerator({
      generatorType: type,
      sourceNode: sourceNodeAtCreation,
      sourceHandle,
    });
    pairMap.current[resultId] = generatorId;
    if (options.activate ?? true) {
      updateGeneratorVisibility(resultId);
    }
    const defaultResultStyle = type === 'generateText'
      ? { width: 280, height: 190 }
      : type === 'generateImage'
        ? { width: 280, height: 373 }
        : type === 'generateVideo'
          ? { width: 320, height: 180 }
          : type === 'generateAudio'
            ? { width: 300, height: 150 }
            : type === 'generateStoryboardScript'
              ? { width: 520 }
              : undefined;
    const resultStyle = options.style || defaultResultStyle;
    const initialImages = type === 'generateImage'
      ? normalizeImageResultData({
          imageUrl: options.imageUrl,
          imageUrls: options.imageUrls,
          coverIndex: options.coverIndex,
        })
      : null;
    const promptDraft = options.promptDraft ?? options.materialPrompt ?? '';
    const textSource = type === 'generateText'
      ? options.textSource || (options.resultText ? 'manual' : undefined)
      : undefined;
    const imagePrompt = options.imagePrompt
      ?? (type === 'generateImage' && !options.suppressImagePrompt ? promptDraft : '');

    const newNodes = [
      {
        id: resultId,
        type: 'result',
        position: { x: position.x, y: position.y },
        ...(options.parentNode ? { parentNode: options.parentNode } : {}),
        style: resultStyle,
        data: {
          label: resolveResultNodeLabel(type, options.label),
          result: options.resultText || '',
          resultType: type,
          pairedGeneratorId: generatorId,
          canvas: {
            ...createCanvasOperation({
              operation: options.operation || 'generate',
              sourceNodeIds: sourceNodeId ? [sourceNodeId] : [],
              references: options.references || [],
              input: { prompt: promptDraft },
              outputType: type.replace(/^generate/, '').toLowerCase() || 'result',
              taskId: options.taskId || '',
              parentVersion: options.parentVersion || '',
            }),
            status: 'idle',
          },
          promptDraft,
          image_prompt: type === 'generateImage' ? imagePrompt : undefined,
          image_negative_prompt: type === 'generateImage'
            ? resolveImageNegativePrompt(options.imageNegativePrompt ?? options.image_negative_prompt)
            : undefined,
          imageSize: type === 'generateImage' ? options.imageSize || undefined : undefined,
          imageDimensions: type === 'generateImage' ? options.imageDimensions || undefined : undefined,
          imageDimensionsByUrl: type === 'generateImage' ? options.imageDimensionsByUrl || undefined : undefined,
          videoUrl: type === 'generateVideo' ? options.videoUrl || '' : undefined,
          audioUrl: type === 'generateAudio' ? options.audioUrl || '' : undefined,
          audioName: type === 'generateAudio' ? options.audioName || '' : undefined,
          ...(initialImages || {}),
          materialId: options.materialId,
          materialName: options.materialName,
          materialPrompt: options.materialPrompt,
          apiConfigs,
          apiProviders: runtimeSettings.providers,
          allowedModels: runtimeSettings.allowedModels,
          onDeleteNode: deleteCanvasNode,
          onInteractiveDragCreate,
          onNodeResize,
          onResultMediaAspectChange,
          onResultDataChange,
          onResultImageUpload,
          onResultVideoUpload,
          onResultAudioUpload,
          onDownloadVideo: downloadNodeVideos,
          onResultExpandStateChange,
          onResultTextChange,
          onTextEditingChange: onResultTextEditingChange,
          onStoryboardCardClickPlaceholder,
          onStoryboardCoverBatchGenerate: runStoryboardCoverBatchGeneration,
          onOpenVideoWorkbench: openVideoWorkbench,
          onCreateVideoEnhancementPrototype: callCreateVideoEnhancementPrototype,
          onCreateVideoSubjectReplacementPrototype: callCreateVideoSubjectReplacementPrototype,
          onCreateVideoSubjectRemovalPrototype: callCreateVideoSubjectRemovalPrototype,
          onGetCanvasImageChoices: getCanvasImageChoices,
          onImageAction: (...args) => imageActionHandlerRef.current?.(...args),
          onImageActionEditingChange,
          ...(textSource ? { textSource } : {}),
          ...(options.imageRotationAutoOpenToken ? { imageRotationAutoOpenToken: options.imageRotationAutoOpenToken } : {}),
          ...(options.imageRotationSourceNodeId ? { imageRotationSourceNodeId: options.imageRotationSourceNodeId } : {}),
          ...(Number.isInteger(options.imageRotationSourceImageIndex) ? { imageRotationSourceImageIndex: options.imageRotationSourceImageIndex } : {}),
          ...(options.imageSource ? { imageSource: options.imageSource } : {}),
          ...(options.videoSource ? { videoSource: options.videoSource } : {}),
          ...(options.audioSource ? { audioSource: options.audioSource } : {}),
        },
        selected: options.selected ?? true,
        ...(options.zIndex !== undefined ? { zIndex: options.zIndex } : {}),
      },
      {
        id: generatorId,
        type: 'generator',
        position: {
          x: position.x + ((resultStyle?.width || GROUP_FALLBACK_WIDTH) - PROCESSOR_WIDTH) / 2,
          y: position.y + (resultStyle?.height || RESULT_FALLBACK_HEIGHT) + PROCESSOR_GAP_Y,
        },
        data: {
          pairedResultId: resultId,
          onGenerate,
          setGenerating,
          onGeneratorDataChange,
          onRunTextGeneration: runTextGeneration,
          onRunImageGeneration: runImageGeneration,
          onRunVideoGeneration: runVideoGeneration,
          onRunAudioGeneration: runAudioGeneration,
          onCancelGeneration: cancelGenerationTask,
          onPromptDraftChange: onGeneratorPromptChange,
          connectedPrompt: options.connectedPrompt || '',
          connectedTextReferences: options.connectedTextReferences || [],
          connectedImages: initialConnectedImages,
          connectedVideos: options.connectedVideos || [],
          connectedReferences: options.connectedReferences || [],
          onDeleteEdge: deleteCanvasEdge,
          uploadedReferenceImages: options.uploadedReferenceImages || [],
          generatorType: type,
          apiConfigs,
          apiProviders: runtimeSettings.providers,
          allowedModels: runtimeSettings.allowedModels,
          activeProviderId: runtimeSettings.activeProviderId,
          maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens),
          promptStyles: officialPromptStyles,
          avatarPackages: certifiedAvatarPackages,
          avatarAssets: certifiedAvatarAssets,
          promptDraft,
          storyboard_script_prompt: options.storyboardScriptPrompt || options.storyboard_script_prompt || '',
          storyboard_script_card_count: options.storyboardScriptCardCount || options.storyboard_script_card_count,
          storyboard_aspect_ratio: options.storyboardAspectRatio || options.storyboard_aspect_ratio,
          storyboard_style: options.storyboardStyle || options.storyboard_style,
          storyboard_total_duration: options.storyboardTotalDuration || options.storyboard_total_duration,
          storyboard_temperature: options.storyboardTemperature ?? options.storyboard_temperature,
          image_prompt: imagePrompt,
          image_negative_prompt: type === 'generateImage'
            ? resolveImageNegativePrompt(options.imageNegativePrompt ?? options.image_negative_prompt)
            : undefined,
          image_model: options.imageModel || '',
          image_api_id: options.imageApiId || '',
          image_size: options.imageSize || options.image_size,
          image_size_preset: options.imageSizePreset || options.image_size_preset,
          image_resolution: options.imageResolution || options.image_resolution,
          image_quality: options.imageQuality || options.image_quality,
          image_background: options.imageBackground || options.image_background,
          image_output_format: options.imageOutputFormat || options.image_output_format,
          image_count: options.imageCount || options.image_count,
          video_prompt: options.videoPrompt || (type === 'generateVideo' ? promptDraft : ''),
          video_model: options.videoModel || '',
          video_api_id: options.videoApiId || '',
          video_aspect_ratio: options.videoAspectRatio || options.video_aspect_ratio,
          video_duration: options.videoDuration || options.video_duration,
          video_resolution: options.videoResolution || options.video_resolution,
          audio_text: options.audioText || options.audio_text || '',
          audio_voice: options.audioVoice || options.audio_voice || '冰糖',
          audio_style: options.audioStyle || options.audio_style || '',
        },
        hidden: true,
      },
    ];

    const newEdges = [];
    // 如果有源节点（从拖拽连线过来），自动连线
    if (sourceNodeId) {
      newEdges.push({
        id: `e_${sourceNodeId}${sourceHandle ? `--${sourceHandle}` : ''}_${resultId}`,
        source: sourceNodeId,
        target: resultId,
        sourceHandle: sourceHandle || undefined,
        style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
        animated: false,
      });
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);

    if (sourceNodeId) {
      setTimeout(() => {
        setNodes(nds => {
          const sourceNode = nds.find(n => n.id === sourceNodeId);
          // 解析 sourceHandle：card-${index} 指向 result 节点某张分镜卡片
          const cardHandleMatch = sourceHandle && sourceHandle.match(/^card-(\d+)$/);
          const cardIndex = cardHandleMatch ? parseInt(cardHandleMatch[1], 10) : -1;
          const resultStoryboardCards = (sourceNode?.type === 'result' && Array.isArray(sourceNode.data?.storyboardCards))
            ? sourceNode.data.storyboardCards
            : null;
          const handleCard = (resultStoryboardCards && cardIndex >= 0 && cardIndex < resultStoryboardCards.length)
            ? resultStoryboardCards[cardIndex]
            : null;
          const storyboardResourcePrompt = sourceNode?.type === 'result'
            ? formatStoryboardResourcePackageForPrompt(sourceNode.data?.storyboardResourcePackage)
            : '';
          const handleCardPrompt = handleCard
            ? appendPrompt(
                storyboardResourcePrompt,
                sourceNode?.data?.storyboardVoiceoverScript ? `整条口播：\n${sourceNode.data.storyboardVoiceoverScript}` : '',
                formatStoryboardCardForPrompt(handleCard),
              )
            : '';
          const resultOutput = sourceNode?.type === 'result' ? getResultNodeOutput(sourceNode) : null;
          const promptText = handleCard
            ? handleCardPrompt
            : resultOutput?.texts?.[0] || '';
          const nextResultType = type;
          const connectedTextReferences = appendPrompt(promptText)
            ? [appendPrompt(promptText)]
            : [];
          const connectedImages = options.connectedImages ?? getConnectedImagesForNewGenerator({
            generatorType: nextResultType,
            sourceNode,
            sourceHandle,
          });
          const resolvedVideoPrompt = handleCard && nextResultType === 'generateVideo'
            ? appendPrompt(
                storyboardResourcePrompt,
                handleCard.seedancePrompt || formatStoryboardCardForPrompt(handleCard),
              )
            : undefined;
          const resolvedVideoDuration = handleCard && nextResultType === 'generateVideo'
            ? handleCard.durationSeconds || Number.parseFloat(String(handleCard.duration || '').match(/(\d+(?:\.\d+)?)/)?.[1]) || undefined
            : undefined;
          const connectedVideos = sourceNode?.type === 'videoInput'
            ? getNodeOutputVideos({
                ...sourceNode,
                data: {
                  ...sourceNode.data,
                  videoUrls: videoInputs.current[sourceNodeId] || sourceNode.data?.videoUrls,
                },
              })
            : getNodeOutputVideos(sourceNode);
          return nds.map(n => {
            if (n.id === generatorId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  connectedPrompt: options.connectedPrompt ?? promptText,
                  connectedTextReferences: options.connectedTextReferences || connectedTextReferences,
                  connectedImages,
                  connectedVideos: options.connectedVideos || connectedVideos,
                  ...(resolvedVideoPrompt ? {
                    video_prompt: resolvedVideoPrompt,
                    promptDraft: resolvedVideoPrompt,
                    video_model: n.data?.video_model || 'doubao-seedance-2.0',
                  } : {}),
                  ...(resolvedVideoDuration ? {
                    video_duration: Math.max(4, Math.min(15, resolvedVideoDuration)),
                    duration: Math.max(4, Math.min(15, resolvedVideoDuration)),
                  } : {}),
                },
              };
            }
            return n;
          });
        });
      }, 150);
    }

    setMenu(null);
    return resultId;
  }, [apiConfigs, apiProviders, callCreateVideoEnhancementPrototype, callCreateVideoSubjectRemovalPrototype, callCreateVideoSubjectReplacementPrototype, cancelGenerationTask, certifiedAvatarAssets, certifiedAvatarPackages, deleteCanvasEdge, deleteCanvasNode, getCanvasImageChoices, officialPromptStyles, onGenerate, onGeneratorDataChange, onGeneratorPromptChange, onInteractiveDragCreate, onNodeResize, onResultAudioUpload, onResultDataChange, onResultExpandStateChange, onResultImageUpload, onResultMediaAspectChange, onResultTextChange, onResultTextEditingChange, onResultVideoUpload, openVideoWorkbench, runAudioGeneration, runImageGeneration, runTextGeneration, runVideoGeneration, setEdges, setGenerating, setNodes, updateGeneratorVisibility, onImageActionEditingChange, runtimeSettings]);

  const getNodeDownstreamPosition = useCallback((sourceNodeId, offsetX = 72) => {
    const sourceNode = nodesRef.current.find(node => node.id === sourceNodeId);
    if (!sourceNode) return { x: 120, y: 120 };
    const position = getAbsoluteNodePosition(sourceNode, nodesRef.current);
    return {
      x: position.x + getNodeWidth(sourceNode) + offsetX,
      y: position.y,
    };
  }, [getAbsoluteNodePosition]);

  const createVideoEnhancementPrototype = useCallback((sourceNodeId, settings = {}) => {
    const sourceNode = nodesRef.current.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateVideo') {
      return { ok: false };
    }
    const sourceVideoUrl = settings.videoUrl || sourceNode.data?.videoUrl || '';
    if (!sourceVideoUrl) return { ok: false };

    const resolution = settings.resolution || '1080P';
    const fps = settings.fps || '自适应（原帧数）';
    const slow = settings.slow || '自适应（原速）';
    const promptDraft = [
      '视频增强原型',
      `分辨率：${resolution}`,
      `帧数：${fps}`,
      `放慢倍率：${slow}`,
    ].join('\n');
    const resultId = createGeneratePair('generateVideo', getNodeDownstreamPosition(sourceNodeId, 96), sourceNodeId, {
      label: '视频增强',
      videoUrl: sourceVideoUrl,
      videoSource: 'enhancement-prototype',
      connectedVideos: [sourceVideoUrl],
      promptDraft,
      videoPrompt: promptDraft,
      videoResolution: resolution,
      operation: 'video-enhancement-prototype',
      activate: false,
      selected: true,
      style: sourceNode.style || { width: 320, height: 180 },
    });

    setNodes(current => current.map(node => {
      if (node.id === resultId) {
        return {
          ...node,
          selected: true,
          data: {
            ...node.data,
            videoEnhancementPrototype: {
              resolution,
              fps,
              slow,
              credits: Number(settings.credits) || 0,
              createdAt: Date.now(),
            },
          },
        };
      }
      return node.selected ? { ...node, selected: false } : node;
    }));

    window.setTimeout(() => {
      fitView({
        nodes: [{ id: sourceNodeId }, { id: resultId }],
        duration: 520,
        padding: 0.24,
        minZoom: 0.3,
        maxZoom: 1.15,
      });
    });

    return { ok: true, resultId };
  }, [createGeneratePair, fitView, getNodeDownstreamPosition, setNodes]);

  useEffect(() => {
    createVideoEnhancementPrototypeRef.current = createVideoEnhancementPrototype;
  }, [createVideoEnhancementPrototype]);

  const createVideoSubjectReplacementPrototype = useCallback((sourceNodeId, settings = {}) => {
    const sourceNode = nodesRef.current.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateVideo') {
      return { ok: false };
    }
    const sourceVideoUrl = settings.videoUrl || sourceNode.data?.videoUrl || '';
    if (!sourceVideoUrl) return { ok: false };

    const promptDraft = [
      '主体替换原型',
      settings.sourceSubjectLabel ? `被替换主体：${settings.sourceSubjectLabel}` : '被替换主体：已框选',
      settings.targetSubjectLabel ? `替换为：${settings.targetSubjectLabel}` : '替换为：已选择图片',
    ].join('\n');
    const resultId = createGeneratePair('generateVideo', getNodeDownstreamPosition(sourceNodeId, 96), sourceNodeId, {
      label: '主体替换',
      videoUrl: sourceVideoUrl,
      videoSource: 'subject-replacement-prototype',
      connectedVideos: [sourceVideoUrl],
      connectedImages: settings.targetImageUrl ? [settings.targetImageUrl] : [],
      promptDraft,
      videoPrompt: promptDraft,
      operation: 'video-subject-replacement-prototype',
      activate: false,
      selected: true,
      style: sourceNode.style || { width: 320, height: 180 },
    });

    setNodes(current => current.map(node => {
      if (node.id === resultId) {
        return {
          ...node,
          selected: true,
          data: {
            ...node.data,
            videoSubjectReplacementPrototype: {
              sourceSubject: settings.sourceSubject || null,
              targetImageUrl: settings.targetImageUrl || '',
              credits: Number(settings.credits) || 0,
              createdAt: Date.now(),
            },
          },
        };
      }
      return node.selected ? { ...node, selected: false } : node;
    }));

    window.setTimeout(() => {
      fitView({
        nodes: [{ id: sourceNodeId }, { id: resultId }],
        duration: 520,
        padding: 0.24,
        minZoom: 0.3,
        maxZoom: 1.15,
      });
    });

    return { ok: true, resultId };
  }, [createGeneratePair, fitView, getNodeDownstreamPosition, setNodes]);

  useEffect(() => {
    createVideoSubjectReplacementPrototypeRef.current = createVideoSubjectReplacementPrototype;
  }, [createVideoSubjectReplacementPrototype]);

  const createVideoSubjectRemovalPrototype = useCallback((sourceNodeId, settings = {}) => {
    const sourceNode = nodesRef.current.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateVideo') {
      return { ok: false };
    }
    const sourceVideoUrl = settings.videoUrl || sourceNode.data?.videoUrl || '';
    if (!sourceVideoUrl) return { ok: false };

    const promptDraft = [
      '主体移除原型',
      settings.removalSubjectLabel ? `移除主体：${settings.removalSubjectLabel}` : '移除主体：已框选',
    ].join('\n');
    const resultId = createGeneratePair('generateVideo', getNodeDownstreamPosition(sourceNodeId, 96), sourceNodeId, {
      label: '移除主体',
      videoUrl: sourceVideoUrl,
      videoSource: 'subject-removal-prototype',
      connectedVideos: [sourceVideoUrl],
      promptDraft,
      videoPrompt: promptDraft,
      operation: 'video-subject-removal-prototype',
      activate: false,
      selected: true,
      style: sourceNode.style || { width: 320, height: 180 },
    });

    setNodes(current => current.map(node => {
      if (node.id === resultId) {
        return {
          ...node,
          selected: true,
          data: {
            ...node.data,
            videoSubjectRemovalPrototype: {
              removalSubject: settings.removalSubject || null,
              credits: Number(settings.credits) || 0,
              createdAt: Date.now(),
            },
          },
        };
      }
      return node.selected ? { ...node, selected: false } : node;
    }));

    window.setTimeout(() => {
      fitView({
        nodes: [{ id: sourceNodeId }, { id: resultId }],
        duration: 520,
        padding: 0.24,
        minZoom: 0.3,
        maxZoom: 1.15,
      });
    });

    return { ok: true, resultId };
  }, [createGeneratePair, fitView, getNodeDownstreamPosition, setNodes]);

  useEffect(() => {
    createVideoSubjectRemovalPrototypeRef.current = createVideoSubjectRemovalPrototype;
  }, [createVideoSubjectRemovalPrototype]);

  const handleImageAction = useCallback(async (action, payload) => {
    const {
      imageUrl,
      nodeId,
      instruction,
      maskDataUrl,
      annotatedImageDataUrl,
      imageSize,
      imageIndex,
      model,
      providerId,
      size,
      sizePreset,
      resolution,
      count,
      sourceHandle,
      sourceType,
      presetId,
      presetLabel,
      horizontalAngle,
      pitchAngle,
      distance,
      crop,
    } = payload || {};
    if (!imageUrl || !nodeId) return;

    if (action === 'rotateCreate') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片不支持旋转与镜像');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('来源图片已不存在');
      }

      const imageUrls = Array.isArray(sourceNode.data?.imageUrls) && sourceNode.data.imageUrls.length > 0
        ? sourceNode.data.imageUrls.filter(Boolean)
        : [imageUrl].filter(Boolean);
      const safeImageIndex = Number.isInteger(imageIndex)
        && imageIndex >= 0
        && imageIndex < imageUrls.length
        ? imageIndex
        : 0;
      const targetImageUrl = imageUrls[safeImageIndex] || imageUrl;
      const targetImageDimensions = sourceNode.data?.imageDimensionsByUrl?.[targetImageUrl]
        || sourceNode.data?.imageDimensions;
      const token = `rotation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const resultId = createGeneratePair('generateImage', getNodeDownstreamPosition(nodeId), nodeId, {
        sourceHandle: sourceHandle || null,
        label: '旋转与镜像',
        imageUrl: targetImageUrl,
        imageUrls: [targetImageUrl],
        coverIndex: 0,
        imageSource: 'upload',
        connectedImages: [targetImageUrl],
        suppressImagePrompt: true,
        activate: false,
        selected: true,
        style: sourceNode.style,
        imageSize: sourceNode.data?.imageSize,
        imageDimensions: targetImageDimensions || undefined,
        imageDimensionsByUrl: targetImageDimensions ? { [targetImageUrl]: targetImageDimensions } : undefined,
        imageRotationAutoOpenToken: token,
        imageRotationSourceNodeId: nodeId,
        imageRotationSourceImageIndex: safeImageIndex,
      });
      setNodes(nds => nds.map(node => (
        node.id === resultId
          ? { ...node, selected: true }
          : node.selected
            ? { ...node, selected: false }
            : node
      )));
      return { ok: true, resultId };
    }

    if (action === 'rotateCancel') {
      setNodes(nds => nds.map(node => (
        node.id === nodeId && node.data?.imageRotationAutoOpenToken
          ? {
              ...node,
              data: {
                ...node.data,
                imageRotationAutoOpenToken: '',
              },
            }
          : node
      )));
      return;
    }

    if (action === 'rotateCommit') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片不支持旋转保存');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('来源图片已不存在');
      }
      if (isRunningGenerationNode(sourceNode)) {
        throw new Error('图片正在生成中，暂时不能覆盖');
      }

      const rotation = normalizeFreeRotation(payload?.rotation);
      const flipX = Boolean(payload?.flipX);
      const flipY = Boolean(payload?.flipY);
      if (Math.abs(rotation) < 0.05 && !flipX && !flipY) {
        setNodes(nds => nds.map(node => (
          node.id === nodeId && node.data?.imageRotationAutoOpenToken
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageRotationAutoOpenToken: '',
                },
              }
            : node
        )));
        return;
      }

      let loaded = null;
      try {
        loaded = await loadCropImage(imageUrl);
        const rotated = await renderImageRotation({
          image: loaded.image,
          rotation,
          flipX,
          flipY,
        });
        const file = new File(
          [rotated.blob],
          `rotate-${Date.now()}.png`,
          { type: 'image/png' },
        );
        const asset = await uploadImageFile(file);
        if (!asset?.url) throw new Error('旋转图片上传成功但未返回地址');
        refreshLocalAssets();

        setNodes(nds => nds.map(node => {
          if (node.id !== nodeId || node.type !== 'result' || node.data?.resultType !== 'generateImage') {
            return node;
          }
          if (isRunningGenerationNode(node)) return node;
          const {
            replacedIndex,
            ...imagePatch
          } = replaceImageResultAtIndex(
            node.data,
            asset.url,
            Number.isInteger(imageIndex) ? imageIndex : 0,
          );
          const isCoverImage = replacedIndex === imagePatch.coverIndex;
          return {
            ...node,
            style: isCoverImage
              ? getCroppedNodeStyle(rotated.width, rotated.height)
              : node.style,
            data: {
              ...node.data,
              ...imagePatch,
              imageSource: node.data?.imageSource || 'upload',
              imageRotationAutoOpenToken: '',
              lastImageRotation: {
                angle: rotation,
                flipX,
                flipY,
                width: rotated.width,
                height: rotated.height,
                updatedAt: Date.now(),
              },
            },
          };
        }));
      } finally {
        loaded?.release?.();
      }
      return;
    }

    if (action === 'cropSave') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片节点不支持裁剪');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('当前图片节点不支持裁剪');
      }
      if (isRunningGenerationNode(sourceNode)) {
        throw new Error('图片生成中，暂时无法保存裁剪结果');
      }

      const resource = await loadCropImage(imageUrl);
      let output;
      try {
        output = await renderImageCrop({
          image: resource.image,
          crop,
          rotation: 0,
        });
      } finally {
        resource.release();
      }

      const file = new File(
        [output.blob],
        `crop-${Date.now()}.png`,
        { type: 'image/png' },
      );
      const asset = await uploadImageFile(file);
      if (!asset?.url) throw new Error('裁剪图片上传成功但未返回地址');
      refreshLocalAssets();

      const resultId = createGeneratePair(
        'generateImage',
        getNodeDownstreamPosition(nodeId),
        nodeId,
        {
          imageUrl: asset.url,
          imageUrls: [asset.url],
          imageSize: output.ratioLabel,
          sourceHandle: sourceHandle || null,
          connectedImages: [],
          connectedTextReferences: [],
          style: getCroppedNodeStyle(output.width, output.height),
          label: '裁剪结果',
          imageSource: 'crop',
          suppressImagePrompt: true,
          activate: false,
          selected: true,
        },
      );

      setNodes(current => current.map(node => (
        node.id === resultId
          ? {
              ...node,
              selected: true,
              data: {
                ...node.data,
                onImageAction: handleImageAction,
                onImageActionEditingChange,
              },
            }
          : { ...node, selected: false }
      )));
      window.setTimeout(() => {
        fitView({
          nodes: [{ id: nodeId }, { id: resultId }],
          duration: 520,
          padding: 0.2,
          minZoom: 0.3,
          maxZoom: 1.1,
        });
      });
      return { ok: true, resultId };
    }

    if (action === 'favorite') {
      openSaveMaterialModal({ type: payload?.mediaType === 'video' ? 'video' : 'image', url: imageUrl, sourceId: nodeId });
      return;
    }

    if (action === 'inpaintGenerate') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片不支持局部修改');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('来源图片已不存在');
      }
      const text = String(instruction || '').trim();
      if (!text) throw new Error('请输入局部修改提示词');
      if (!maskDataUrl) throw new Error('请先在图片上画出调整区域');

      const enabledProviders = Array.isArray(runtimeSettings.providers)
        ? runtimeSettings.providers.filter(provider => provider?.enabled !== false)
        : [];
      const selectedProvider = enabledProviders.find(provider => provider.id === providerId)
        || enabledProviders.find(provider => provider.id === runtimeSettings.activeProviderId)
        || enabledProviders[0];
      const imageModels = normalizeSmartSplitterModelList(selectedProvider?.imageModels);
      const selectedModel = imageModels.includes(model)
        ? model
        : imageModels.includes(selectedProvider?.defaultImageModel)
          ? selectedProvider.defaultImageModel
          : imageModels[0] || model || '';
      if (!selectedProvider || !selectedModel) {
        throw new Error('没有可用的图片生成模型，请先在设置里配置图片模型');
      }
      const selectedModelCapabilities = selectedProvider.imageModelCapabilities?.[selectedModel]?.capabilities;
      if (selectedProvider.protocol === 'apimart' && selectedModelCapabilities?.inpaint !== true) {
        throw new Error('当前 API 的局部修改不支持此图像模型，请切换支持局部修改的模型后再生成');
      }

      const imagePrompt = buildImageInpaintPrompt({ instruction: text, imageSize });
      const outputSize = size || sourceNode.data?.imageSize || 'auto';
      const outputResolution = resolution || '2k';
      const outputCount = Math.max(1, Math.min(Number(count) || 1, 4));
      const outputPreset = sizePreset || getDefaultImageRatioPresetId(outputSize);
      const targetPosition = getNodeDownstreamPosition(nodeId);
      const resultId = createGeneratePair('generateImage', targetPosition, nodeId, {
        sourceHandle: sourceHandle || null,
        connectedImages: [imageUrl],
        uploadedReferenceImages: [],
        promptDraft: imagePrompt,
        imagePrompt,
        imageModel: selectedModel,
        imageApiId: selectedProvider.id || '',
        imageSize: outputSize,
        imageSizePreset: outputPreset,
        imageResolution: outputResolution,
        imageCount: outputCount,
      });
      const generatorId = pairMap.current?.[resultId];
      if (generatorId) {
        void runImageGeneration(generatorId, {
          provider_id: selectedProvider.providerId || selectedProvider.id || '',
          api_protocol: selectedProvider.protocol || 'openai',
          api_base_url: selectedProvider.baseUrl || '',
          api_key: selectedProvider.apiKey || '',
          prompt: imagePrompt,
          model: selectedModel,
          size: outputSize,
          resolution: outputResolution,
          n: outputCount,
          operation: 'inpaint',
          image_url: imageUrl,
          original_image_url: imageUrl,
          mask_url: maskDataUrl,
          image_urls: [imageUrl],
          video_urls: [],
        }, {
          connectedImages: [imageUrl],
          uploadedReferenceImages: [],
          image_prompt: imagePrompt,
          image_model: selectedModel,
          image_api_id: selectedProvider.id || '',
          image_size: outputSize,
          image_size_preset: outputPreset,
          image_resolution: outputResolution,
          image_count: outputCount,
          operation: 'inpaint',
          source_image_url: imageUrl,
          mask_url: maskDataUrl,
          inpaintSourceNodeId: nodeId,
          inpaintSourceImageIndex: Number.isInteger(imageIndex) ? imageIndex : 0,
        });
      }
      return { ok: true, resultId };
    }

    if (action === 'perspectiveGenerate') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片不支持视角调整');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('来源图片已不存在');
      }

      const enabledProviders = Array.isArray(runtimeSettings.providers)
        ? runtimeSettings.providers.filter(provider => provider?.enabled !== false)
        : [];
      const selectedProvider = enabledProviders.find(provider => provider.id === providerId)
        || enabledProviders.find(provider => provider.id === runtimeSettings.activeProviderId)
        || enabledProviders[0];
      const imageModels = normalizeSmartSplitterModelList(selectedProvider?.imageModels);
      const selectedModel = imageModels.includes(model)
        ? model
        : imageModels.includes(selectedProvider?.defaultImageModel)
          ? selectedProvider.defaultImageModel
          : imageModels[0] || model || '';
      if (!selectedProvider || !selectedModel) {
        throw new Error('没有可用的图片生成模型，请先在设置里配置图片模型');
      }
      const selectedModelCapabilities = selectedProvider.imageModelCapabilities?.[selectedModel]?.capabilities;
      if (selectedProvider.protocol === 'apimart' && selectedModelCapabilities?.imageToImage !== true) {
        throw new Error('当前 API 的参考图修改不支持此图像模型，请切换支持参考图的模型后再生成');
      }

      const imagePrompt = buildImagePerspectivePrompt({
        presetId,
        presetLabel,
        horizontalAngle,
        pitchAngle,
        distance,
        instruction,
        imageSize,
      });
      const outputSize = size || sourceNode.data?.imageSize || 'auto';
      const outputResolution = resolution || '2k';
      const outputCount = Math.max(1, Math.min(Number(count) || 1, 4));
      const outputPreset = sizePreset || getDefaultImageRatioPresetId(outputSize);
      const targetPosition = getNodeDownstreamPosition(nodeId);
      const resultId = createGeneratePair('generateImage', targetPosition, nodeId, {
        sourceHandle: sourceHandle || null,
        connectedImages: [imageUrl],
        promptDraft: imagePrompt,
        imagePrompt,
        imageModel: selectedModel,
        imageApiId: selectedProvider.id || '',
        imageSize: outputSize,
        imageSizePreset: outputPreset,
        imageResolution: outputResolution,
        imageCount: outputCount,
      });
      const generatorId = pairMap.current?.[resultId];
      if (generatorId) {
        void runImageGeneration(generatorId, {
          provider_id: selectedProvider.providerId || selectedProvider.id || '',
          api_protocol: selectedProvider.protocol || 'openai',
          api_base_url: selectedProvider.baseUrl || '',
          api_key: selectedProvider.apiKey || '',
          prompt: imagePrompt,
          model: selectedModel,
          size: outputSize,
          resolution: outputResolution,
          n: outputCount,
          image_urls: [imageUrl],
          video_urls: [],
        }, {
          connectedImages: [imageUrl],
          image_prompt: imagePrompt,
          image_model: selectedModel,
          image_api_id: selectedProvider.id || '',
          image_size: outputSize,
          image_size_preset: outputPreset,
          image_resolution: outputResolution,
          image_count: outputCount,
          perspectiveSourceNodeId: nodeId,
          perspectiveSourceImageIndex: Number.isInteger(imageIndex) ? imageIndex : 0,
          perspectivePresetId: presetId || '',
          perspectiveHorizontalAngle: Number(horizontalAngle) || 0,
          perspectivePitchAngle: Number(pitchAngle) || 0,
          perspectiveDistance: Number(distance) || 4,
        });
      }
      return { ok: true, resultId };
    }

    if (action === 'prototypeCreate') {
      if ((sourceType || 'result') !== 'result') {
        throw new Error('当前图片不支持该原型操作');
      }
      const sourceNode = nodesRef.current.find(node => node.id === nodeId);
      if (!sourceNode || sourceNode.type !== 'result' || sourceNode.data?.resultType !== 'generateImage') {
        throw new Error('来源图片已不存在');
      }
      const operation = String(payload?.operation || '').trim();
      const imageSize = sourceNode.data?.imageDimensions
        || sourceNode.data?.imageSize
        || { width: 1024, height: 1024 };
      const sourcePosition = getNodeDownstreamPosition(nodeId);
      const createPrototypeResult = (label, extra = {}, position = sourcePosition) => createGeneratePair(
        'generateImage',
        position,
        nodeId,
        {
          label,
          imageUrl,
          imageUrls: [imageUrl],
          imageSource: 'canvas-prototype',
          imageSize: sourceNode.data?.imageSize,
          imageDimensions: sourceNode.data?.imageDimensions,
          connectedImages: [imageUrl],
          suppressImagePrompt: true,
          activate: false,
          selected: true,
          operation,
          prototype: true,
          prototypeSettings: extra,
          style: sourceNode.style,
        },
      );

      if (operation === 'split') {
        const cells = Array.isArray(payload?.cells) ? payload.cells : [];
        const columns = Number(String(payload?.grid || '2x2').split('x')[0]) || 2;
        const gap = 28;
        const width = Number(sourceNode.style?.width) || 280;
        const results = cells.map((cell, index) => createPrototypeResult(`Quick Split ${index + 1}`, {
          grid: payload.grid,
          cropRegion: {
            x: Number(cell.x) || 0,
            y: Number(cell.y) || 0,
            width: Number(cell.width) || 1 / columns,
            height: Number(cell.height) || 1 / columns,
          },
          sourceDimensions: imageSize,
        }, {
          x: sourcePosition.x + (index % columns) * (width + gap),
          y: sourcePosition.y + Math.floor(index / columns) * 420,
        }));
        return { ok: true, resultIds: results };
      }

      const labels = { outpaint: '扩图结果', erase: '擦除结果', cutout: '抠图结果', enhance: '增强结果' };
      const resultId = createPrototypeResult(labels[operation] || '画布原型结果', {
        ratio: payload.outpaintRatio,
        brushSize: payload.brushSize,
        enhanceLevel: payload.enhanceLevel,
        previewOnly: true,
      });
      return { ok: true, resultId };
    }

    if (action === 'annotationSubmit') {
      if (!annotatedImageDataUrl) throw new Error('未能生成标记图片，请重新绘制后再试');

      const blob = await (await fetch(annotatedImageDataUrl)).blob();
      const file = new File(
        [blob],
        `annotation-${Date.now()}.png`,
        { type: blob.type || 'image/png' },
      );
      const asset = await uploadImageFile(file);
      if (!asset?.url) throw new Error('标记图片上传成功但未返回地址');
      refreshLocalAssets();

      const annotationWidth = Number(imageSize?.width) || 0;
      const annotationHeight = Number(imageSize?.height) || 0;
      const annotationMetadata = buildUploadedImageAssetMetadata(asset, {
        width: annotationWidth,
        height: annotationHeight,
      });
      const resultId = createGeneratePair(
        'generateImage',
        getNodeDownstreamPosition(nodeId),
        nodeId,
        {
          imageUrl: asset.url,
          imageUrls: [asset.url],
          materialId: asset.id,
          imageSize: annotationMetadata.imageSize,
          sourceHandle: sourceHandle || null,
          connectedImages: [],
          connectedTextReferences: [],
          style: annotationWidth && annotationHeight
            ? getCroppedNodeStyle(annotationWidth, annotationHeight)
            : undefined,
          label: '批注结果',
          imageSource: 'annotation',
          suppressImagePrompt: true,
          activate: false,
          selected: true,
        },
      );

      setNodes(current => current.map(node => (
        node.id === resultId
          ? {
              ...node,
              selected: true,
              data: {
                ...node.data,
                onImageAction: handleImageAction,
                onImageActionEditingChange,
              },
            }
          : { ...node, selected: false }
      )));
      return { ok: true, resultId };
    }
    if (action === 'query') {
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (!node) return;
      const taskIds = node.data?.taskIds;
      if (!Array.isArray(taskIds) || taskIds.length === 0) return;
      const genConfig = node.data?.generationConfig || {};
      const apiId = genConfig.image_api_id || genConfig.api_id || '';
      const provider = apiProviders?.find(p => p.id === apiId);
      const apiBaseUrl = provider?.baseUrl || '';
      const apiKey = provider?.apiKey || '';

      setNodes(nds => nds.map(n => n.id === nodeId
        ? { ...n, data: { ...n.data, smartSplitStatus: '正在查询任务...' } }
        : n));

      (async () => {
        const newUrls = [];
        for (const taskId of taskIds) {
          try {
            const result = await pollImageTask(taskId, apiBaseUrl, apiKey, { maxDuration: 30 });
            const currentNode = nodesRef.current.find(n => n.id === nodeId);
            if (result.success && result.image_urls?.length > 0 && isTaskResultAcceptedForNode(result.task, currentNode)) {
              newUrls.push(...result.image_urls);
            }
          } catch { /* skip */ }
        }

        if (newUrls.length > 0) {
          setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            return {
              ...n,
              data: {
                ...n.data,
                imageUrl: newUrls[0],
                imageUrls: newUrls,
                smartSplitStatus: '',
                generationTask: { status: 'success' },
                generating: false,
                currentRunId: '',
                taskIds: [],
              },
            };
          }));
        } else {
          setNodes(nds => nds.map(n => n.id === nodeId
            ? { ...n, data: { ...n.data, smartSplitStatus: '任务尚未完成，请稍后再试' } }
            : n));
        }
      })();
      return;
    }
  }, [createGeneratePair, fitView, getNodeDownstreamPosition, openSaveMaterialModal, apiProviders, refreshLocalAssets, runImageGeneration, runtimeSettings.activeProviderId, runtimeSettings.providers, setNodes]);

  imageActionHandlerRef.current = handleImageAction;

  const createImageNodeGroup = useCallback((imageAssets, position) => {
    const validAssets = (imageAssets || [])
      .map(asset => (typeof asset === 'string' ? { url: asset } : asset))
      .filter(asset => asset?.url);
    if (validAssets.length === 0) return;
    if (validAssets.length === 1) {
      const asset = validAssets[0];
      createGeneratePair('generateImage', position, null, {
        imageUrl: asset.url,
        style: asset.style || { width: 260, height: 195 },
        imageSource: 'upload',
        imageSize: asset.imageSize,
        imageDimensions: asset.imageDimensions,
        imageDimensionsByUrl: asset.imageDimensionsByUrl,
      });
      setMenu(null);
      return;
    }

    const ts = Date.now();
    const cards = validAssets.map(asset => ({
      ...asset,
      style: asset.style || { width: 260, height: 195 },
    }));
    const gap = 26;
    const cardHeight = Math.max(...cards.map(card => Number(card.style.height) || 195));
    const groupContentWidth = cards.reduce((total, card, index) => (
      total + (Number(card.style.width) || 260) + (index > 0 ? gap : 0)
    ), 0);
    const groupId = `group_${ts}_${Math.random().toString(16).slice(2)}`;
    const nextGroupIndex = nodesRef.current.filter(node => node.type === 'group').length + 1;
    const groupNode = {
      id: groupId,
      type: 'group',
      position: {
        x: position.x - GROUP_PADDING,
        y: position.y - GROUP_PADDING - GROUP_LABEL_SPACE,
      },
      data: { label: `组合 ${nextGroupIndex}`, childIds: [], onDeleteNode: deleteCanvasNode, onUngroup: ungroupNodes, onSaveTemplate: openSaveTemplateDialog, onGroupResize, onGroupNameChange },
      style: {
        width: groupContentWidth + GROUP_PADDING * 2,
        height: cardHeight + GROUP_PADDING * 2 + GROUP_LABEL_SPACE,
      },
      selected: true,
      zIndex: 0,
    };
    setNodes(nds => [...nds, groupNode]);
    let offsetX = GROUP_PADDING;
    const resultIds = cards.map((asset) => {
      const childPosition = {
        x: offsetX,
        y: GROUP_PADDING + GROUP_LABEL_SPACE,
      };
      offsetX += (Number(asset.style.width) || 260) + gap;
      return createGeneratePair(
        'generateImage',
        {
          x: childPosition.x,
          y: childPosition.y,
        },
        null,
        {
          imageUrl: asset.url,
          parentNode: groupId,
          style: asset.style,
          selected: false,
          zIndex: 1,
          activate: false,
          imageSource: 'upload',
          imageSize: asset.imageSize,
          imageDimensions: asset.imageDimensions,
          imageDimensionsByUrl: asset.imageDimensionsByUrl,
        },
      );
    });
    setNodes(nds => nds.map(node => (
      node.id === groupId
        ? {
            ...node,
            data: {
              ...node.data,
              childIds: resultIds,
            },
          }
        : node
    )));
    setMenu(null);
  }, [createGeneratePair, deleteCanvasNode, onGroupNameChange, onGroupResize, openSaveTemplateDialog, setNodes, ungroupNodes]);

  const createVideoFromShot = useCallback((shotNodeId, config = {}) => {
    const shotNode = nodesRef.current.find(node => node.id === shotNodeId);
    if (!shotNode) return;
    const position = getNodeDownstreamPosition(shotNodeId);
    const connectedTextReferences = [
      ...(Array.isArray(shotNode.data?.connectedTextReferences) ? shotNode.data.connectedTextReferences : []),
      shotNode.data?.workflowText,
      config.workflowText,
      config.shotGoal ? `本镜头目标：${config.shotGoal}` : '',
    ].filter(Boolean);
    const connectedImages = uniqueValues([
      ...getWorkflowNodeImages(shotNode),
      ...(Array.isArray(shotNode.data?.referenceImages) ? shotNode.data.referenceImages : []),
    ]);
    createGeneratePair('generateVideo', position, shotNodeId, {
      label: config.shotTitle || '生成镜头视频',
      connectedPrompt: appendPrompt(...connectedTextReferences),
      connectedTextReferences,
      connectedImages,
      videoPrompt: [
        config.workflowText || shotNode.data?.workflowText || '',
        config.shotGoal ? `本镜头目标：${config.shotGoal}` : '',
      ].filter(Boolean).join('\n'),
      videoModel: config.seedanceModel || shotNode.data?.seedanceModel || 'doubao-seedance-2.0',
      videoDuration: config.shotDuration || shotNode.data?.shotDuration || 6,
      video_aspect_ratio: shotNode.data?.aspectRatio || '9:16',
      video_resolution: '720p',
      promptDraft: config.shotGoal || '',
    });
  }, [createGeneratePair, getNodeDownstreamPosition]);

  const createVideoEditorFromAssembler = useCallback((assemblerNodeId, config = {}) => {
    const assemblerNode = nodesRef.current.find(node => node.id === assemblerNodeId);
    if (!assemblerNode) return;
    const sources = buildVideoEditorSources(assemblerNodeId, nodesRef.current, edgesRef.current);
    const videoSources = sources.filter(source => source.type === 'video');
    const canvas = createVideoEditorCanvasFromAspectRatio(config.aspectRatio || assemblerNode.data?.aspectRatio || '9:16', '720p');
    const clips = compactTimelineClips(videoSources.map((source, index) => (
      createClipFromSource({
        ...source,
        name: source.name || `镜头 ${index + 1}`,
      }, index * 5)
    )));
    const timeline = {
      version: 1,
      canvas,
      clips,
    };
    const editorId = `video_editor_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setNodes(nds => [...nds, {
      id: editorId,
      type: 'videoEditor',
      position: getNodeDownstreamPosition(assemblerNodeId),
      style: { width: 300, height: 210 },
      selected: true,
      data: {
        label: '种草视频成片',
        videoEditorTimeline: timeline,
        videoUrl: '',
        assemblyBrief: config.workflowText || assemblerNode.data?.workflowText || '',
        onOpenVideoEditor,
        onDownloadVideo: downloadNodeVideos,
        onNodeTitleChange,
        onInteractiveDragCreate,
        onDeleteNode: deleteCanvasNode,
      },
    }]);
    queueMicrotask(() => {
      connectCanvasNodes(assemblerNodeId, editorId);
      videoSources.forEach(source => {
        if (source.nodeId) connectCanvasNodes(source.nodeId, editorId);
      });
      setActiveVideoEditorNodeId(editorId);
    });
  }, [connectCanvasNodes, deleteCanvasNode, getNodeDownstreamPosition, onInteractiveDragCreate, onNodeTitleChange, onOpenVideoEditor, setNodes]);

  const createVideoEditorFromResult = useCallback((resultNodeId) => {
    const sourceNode = nodesRef.current.find(node => node.id === resultNodeId && node.type === 'result');
    const sourceUrl = sourceNode?.data?.videoUrl || sourceNode?.data?.videoUrls?.[0] || '';
    if (!sourceNode || sourceNode.data?.resultType !== 'generateVideo' || !sourceUrl) return;

    const editorId = `video_editor_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const aspectRatio = Number(sourceNode.data?.mediaAspectRatio) > 0
      ? sourceNode.data.mediaAspectRatio
      : '16:9';
    const timeline = {
      version: 1,
      canvas: createVideoEditorCanvasFromAspectRatio(aspectRatio, '720p'),
      clips: [compactTimelineClips([createClipFromSource({
        id: sourceNode.id,
        url: sourceUrl,
        type: 'video',
        name: sourceNode.data?.label || '视频',
        aspectRatio,
      })])[0]].filter(Boolean),
    };

    setNodes(current => [...current, {
      id: editorId,
      type: 'videoEditor',
      position: getNodeDownstreamPosition(resultNodeId),
      style: { width: 300, height: 210 },
      selected: true,
      data: {
        label: '视频编辑器',
        videoEditorTimeline: timeline,
        videoUrl: sourceUrl,
        onOpenVideoEditor,
        onDownloadVideo: downloadNodeVideos,
        onNodeTitleChange,
        onInteractiveDragCreate,
        onDeleteNode: deleteCanvasNode,
      },
    }]);
    queueMicrotask(() => {
      connectCanvasNodes(resultNodeId, editorId);
      setActiveVideoEditorNodeId(editorId);
    });
  }, [connectCanvasNodes, deleteCanvasNode, downloadNodeVideos, getNodeDownstreamPosition, onInteractiveDragCreate, onNodeTitleChange, onOpenVideoEditor, setNodes]);

  const onCaptureVideoFrame = useCallback(async (nodeId, dataUrl, metadata = {}) => {
    if (!dataUrl || !nodeId) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `video-frame-${Date.now()}.png`, { type: 'image/png' });
    const asset = await uploadImageFile(file);
    if (!asset?.url) throw new Error('视频画面上传成功但未返回地址');
    refreshLocalAssets();
    const width = Number(metadata.width) || Number(asset.width) || 0;
    const height = Number(metadata.height) || Number(asset.height) || 0;
    createGeneratePair('generateImage', getNodeDownstreamPosition(nodeId), nodeId, {
      imageUrl: asset.url,
      imageUrls: [asset.url],
      materialId: asset.id,
      imageSize: buildUploadedImageAssetMetadata(asset, { width, height }).imageSize,
      imageDimensions: width && height ? { width, height } : undefined,
      imageDimensionsByUrl: width && height ? { [asset.url]: { width, height } } : undefined,
      style: width && height ? getCroppedNodeStyle(width, height) : undefined,
      label: '视频画面帧',
      imageSource: 'video-frame',
      suppressImagePrompt: true,
      activate: false,
      selected: true,
    });
  }, [createGeneratePair, getNodeDownstreamPosition, refreshLocalAssets]);

  // ==================== 复制 / 粘贴节点 ====================
  // 把当前选中的节点序列化成"剪贴板条目"存到 clipboardRef，
  // 包含类型、位置、尺寸和需要复刻的 data 字段（剥掉函数和 refs）。
  // 粘贴时再按条目反向重建节点，结果节点会带上配对的 generator。
  const copySelectedNodes = useCallback((options = {}) => {
    const directlySelected = Array.isArray(options.directlySelected)
      ? options.directlySelected.filter(Boolean)
      : nodesRef.current.filter(node => node.selected);
    if (directlySelected.length === 0) return false;

    // 展开组：递归包含组内所有子节点
    const selectedIds = new Set(directlySelected.map(n => n.id));
    const expandGroup = (nodeId) => {
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (!node || node.type !== 'group') return;
      (node.data?.childIds || []).forEach(childId => {
        if (!selectedIds.has(childId)) {
          selectedIds.add(childId);
          expandGroup(childId);
        }
      });
    };
    directlySelected.forEach(n => expandGroup(n.id));
    const selected = nodesRef.current.filter(n => selectedIds.has(n.id));
    // 如果只选了组，去掉组外壳，只复制子节点
    const shouldStripGroups = options.stripSingleSelectedGroup !== false
      && directlySelected.length === 1
      && directlySelected[0].type === 'group';
    const filtered = shouldStripGroups
      ? selected.filter(n => n.type !== 'group')
      : selected;
    if (filtered.length === 0) return false;
    const filteredIds = new Set(filtered.map(node => node.id));

    const entries = filtered.map((node) => {
      const shouldKeepRelativePosition = node.parentNode && filteredIds.has(node.parentNode);
      const basePosition = shouldKeepRelativePosition
        ? { x: node.position?.x ?? 0, y: node.position?.y ?? 0 }
        : getAbsoluteNodePosition(node, nodesRef.current);
      const base = {
        _oldId: node.id,
        type: node.type,
        position: basePosition,
        style: node.style ? { ...node.style } : undefined,
      };
      const data = node.data || {};

      if (REMOVED_NODE_TYPES.has(node.type)) {
        return {
          ...base,
          label: data.label || getDefaultNodeLabel(node),
        };
      }

      if (node.type === 'videoInput') {
        return {
          ...base,
          label: data.label,
          videoUrls: data.videoUrls || (data.videoUrl ? [data.videoUrl] : []),
        };
      }
      if (node.type === 'videoEditor') {
        return {
          ...base,
          label: data.label,
          videoEditorTimeline: data.videoEditorTimeline,
          videoUrl: data.videoUrl,
        };
      }
      if (WORKFLOW_TEXT_NODE_TYPES.has(node.type)) {
        return {
          ...base,
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => typeof value !== 'function')
          ),
        };
      }
      if (node.type === 'result') {
        // 把配对的 generator 配置也带上，粘贴时一起重建
        const generatorId = pairMap.current?.[node.id];
        const generatorNode = generatorId
          ? nodesRef.current.find((n) => n.id === generatorId)
          : null;
        return {
          ...base,
          label: data.label,
          result: data.result,
          resultText: data.resultText,
          resultType: data.resultType,
          textSource: data.textSource,
          generationConfig: data.generationConfig,
          promptDraft: data.promptDraft,
          imageUrl: data.imageUrl,
          imageUrls: data.imageUrls,
          coverIndex: data.coverIndex,
          imageDimensions: data.imageDimensions,
          imageDimensionsByUrl: data.imageDimensionsByUrl,
          imageHistory: data.imageHistory,
          imageSource: data.imageSource,
          materialId: data.materialId,
          materialName: data.materialName,
          materialPrompt: data.materialPrompt,
          storyboardCards: data.storyboardCards,
          storyboardResourcePackage: data.storyboardResourcePackage,
          storyboardVoiceoverScript: data.storyboardVoiceoverScript,
          image_prompt: data.image_prompt,
          image_negative_prompt: data.image_negative_prompt,
          image_model: data.image_model,
          image_size: data.image_size,
          image_resolution: data.image_resolution,
          image_quality: data.image_quality,
          image_background: data.image_background,
          image_output_format: data.image_output_format,
          image_count: data.image_count,
          image_api_id: data.image_api_id,
          storyboard_script_prompt: data.storyboard_script_prompt,
          storyboard_script_card_count: data.storyboard_script_card_count,
          storyboard_aspect_ratio: data.storyboard_aspect_ratio,
          storyboard_style: data.storyboard_style,
          storyboard_total_duration: data.storyboard_total_duration,
          storyboard_temperature: data.storyboard_temperature,
          video_prompt: data.video_prompt,
          video_model: data.video_model,
          video_aspect_ratio: data.video_aspect_ratio,
          video_duration: data.video_duration,
          video_resolution: data.video_resolution,
          video_api_id: data.video_api_id,
          text_api_id: data.text_api_id,
          text_model_name: data.text_model_name,
          text_system_prompt: data.text_system_prompt,
          text_temperature: data.text_temperature,
          text_max_tokens: data.text_max_tokens,
          videoUrl: data.videoUrl,
          videoSource: data.videoSource,
          audioUrl: data.audioUrl,
          audioSource: data.audioSource,
          audioName: data.audioName,
          audioDuration: data.audioDuration,
          audio_text: data.audio_text,
          audio_voice: data.audio_voice,
          audio_style: data.audio_style,
          generator: generatorNode ? {
            connectedPrompt: generatorNode.data?.connectedPrompt,
            connectedTextReferences: generatorNode.data?.connectedTextReferences,
            connectedImages: generatorNode.data?.connectedImages,
            connectedVideos: generatorNode.data?.connectedVideos,
            uploadedReferenceImages: generatorNode.data?.uploadedReferenceImages,
            promptDraft: generatorNode.data?.promptDraft,
            api_base_url: generatorNode.data?.api_base_url,
            api_key: generatorNode.data?.api_key,
            model_name: generatorNode.data?.model_name,
            system_prompt: generatorNode.data?.system_prompt,
            user_prompt: generatorNode.data?.user_prompt,
            temperature: generatorNode.data?.temperature,
            max_tokens: generatorNode.data?.max_tokens,
            image_prompt: generatorNode.data?.image_prompt,
            image_negative_prompt: generatorNode.data?.image_negative_prompt,
            image_model: generatorNode.data?.image_model,
            image_size: generatorNode.data?.image_size,
            image_resolution: generatorNode.data?.image_resolution,
            image_quality: generatorNode.data?.image_quality,
            image_background: generatorNode.data?.image_background,
            image_output_format: generatorNode.data?.image_output_format,
            image_count: generatorNode.data?.image_count,
            image_api_id: generatorNode.data?.image_api_id,
            storyboard_script_prompt: generatorNode.data?.storyboard_script_prompt,
            storyboard_script_card_count: generatorNode.data?.storyboard_script_card_count,
            storyboard_aspect_ratio: generatorNode.data?.storyboard_aspect_ratio,
            storyboard_style: generatorNode.data?.storyboard_style,
            storyboard_total_duration: generatorNode.data?.storyboard_total_duration,
            storyboard_temperature: generatorNode.data?.storyboard_temperature,
            video_prompt: generatorNode.data?.video_prompt,
            video_model: generatorNode.data?.video_model,
            video_aspect_ratio: generatorNode.data?.video_aspect_ratio,
            video_duration: generatorNode.data?.video_duration,
            video_resolution: generatorNode.data?.video_resolution,
            video_api_id: generatorNode.data?.video_api_id,
            audio_text: generatorNode.data?.audio_text,
            audio_voice: generatorNode.data?.audio_voice,
            audio_style: generatorNode.data?.audio_style,
            text_api_id: generatorNode.data?.text_api_id,
          } : null,
        };
      }
      if (node.type === 'smartSplitter') {
        return {
          ...base,
          label: data.label,
          local_prompt: data.local_prompt,
          direction_count: data.direction_count,
          images_per_direction: data.images_per_direction,
          image_size: data.image_size,
          image_resolution: data.image_resolution,
          image_negative_prompt: data.image_negative_prompt,
          text_api_id: data.text_api_id,
          text_model: data.text_model,
          image_api_id: data.image_api_id,
          image_model: data.image_model,
          uploaded_reference_images: data.uploaded_reference_images,
          connected_images: data.connected_images,
          connectedPrompt: data.connectedPrompt,
          referenceImageCount: data.referenceImageCount,
        };
      }
      if (node.type === 'group') {
        return {
          ...base,
          label: data.label,
          childIds: data.childIds,
        };
      }
      return null;
    }).filter(Boolean);

    if (entries.length === 0) return false;

    // 复制选中节点之间的边（两端都在选中节点中）
    const copiedNodeIds = new Set(entries.map(entry => entry._oldId).filter(Boolean));
    const copiedEdges = edgesRef.current
      .filter(e => copiedNodeIds.has(e.source) && copiedNodeIds.has(e.target))
      .map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }));

    const clipboardSnapshot = { entries, edges: copiedEdges, pasteCount: 0 };
    if (options.storeClipboard === false) {
      return clipboardSnapshot;
    }

    clipboardRef.current = clipboardSnapshot;
    // 同步到跨项目剪贴板，切换项目后仍可粘贴
    if (crossProjectClipboardRef) {
      crossProjectClipboardRef.current = clipboardRef.current;
    }
    return true;
  }, [crossProjectClipboardRef, getAbsoluteNodePosition]);

  const pasteNodes = useCallback((options = {}) => {
    // 从跨项目剪贴板恢复（切换项目后本地剪贴板为空）
    if (!options.clip && !clipboardRef.current && crossProjectClipboardRef?.current) {
      clipboardRef.current = crossProjectClipboardRef.current;
    }
    const clip = options.clip || clipboardRef.current;
    if (!clip || !Array.isArray(clip.entries) || clip.entries.length === 0) return false;

    if (options.incrementPasteCount !== false) {
      clip.pasteCount = (clip.pasteCount || 0) + 1;
    }

    let dx = Number(options.offset?.dx);
    let dy = Number(options.offset?.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      // 粘贴到当前视口中心（screenToFlowPosition 内部处理 pane 偏移）
      const viewCenter = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const topLevelEntries = clip.entries.filter(entry => (
        !clip.entries.some(parent => (
          parent.type === 'group'
          && Array.isArray(parent.childIds)
          && parent.childIds.includes(entry._oldId)
        ))
      ));
      const anchorEntries = topLevelEntries.length > 0 ? topLevelEntries : clip.entries;
      const centroidX = anchorEntries.reduce((sum, e) => sum + (e.position?.x || 0), 0) / anchorEntries.length;
      const centroidY = anchorEntries.reduce((sum, e) => sum + (e.position?.y || 0), 0) / anchorEntries.length;
      dx = viewCenter.x - centroidX;
      dy = viewCenter.y - centroidY;
    }

    const newNodeIds = [];

    // 旧 ID → 新 ID 映射（预生成，用于边的重建和 group childIds）
    const oldToNew = {};
    clip.entries.forEach(entry => {
      if (!entry._oldId) return;
      const ts = Date.now() + Object.keys(oldToNew).length;
      if (entry.type === 'result') {
        oldToNew[entry._oldId] = `result_${ts}_${Math.random().toString(16).slice(2)}`;
      } else {
        oldToNew[entry._oldId] = `${entry.type}_${ts}_${Math.random().toString(16).slice(2)}`;
      }
    });

    // 收集 group 的 child IDs → 新 group ID 的映射（用于设置 parentNode）
    const childToGroup = {};
    clip.entries.forEach(entry => {
      if (entry.type === 'group' && Array.isArray(entry.childIds)) {
        const gid = oldToNew[entry._oldId];
        if (gid) entry.childIds.forEach(cid => {
          childToGroup[oldToNew[cid] || cid] = gid;
        });
      }
    });
    clip.entries
      .filter(entry => entry.type === 'imageInput')
      .forEach(entry => {
        const resultId = createGeneratePair('generateImage', {
          x: entry.position.x + dx,
          y: entry.position.y + dy,
        }, null, {
          imageUrls: entry.imageUrls,
          imageDimensions: entry.imageDimensions,
          imageDimensionsByUrl: entry.imageDimensionsByUrl,
          materialId: entry.materialId,
          materialName: entry.materialName,
          materialPrompt: entry.materialPrompt,
          style: entry.style ? { ...entry.style } : undefined,
        });
        newNodeIds.push(resultId);
      });

    setNodes((nds) => {
      const additions = [];

      for (const entry of clip.entries) {
        if (entry.type === 'imageInput') continue;
        const baseStyle = entry.style ? { ...entry.style } : undefined;
        const newId = entry._oldId ? oldToNew[entry._oldId] : null;
        if (!newId) continue;
        const parentId = childToGroup[newId] || null;
        const pos = parentId
          ? { x: entry.position.x, y: entry.position.y }
          : { x: entry.position.x + dx, y: entry.position.y + dy };
        const normalizedImages = entry.resultType === 'generateImage'
          ? normalizeImageResultData(entry)
          : {};

        if (entry.type === 'videoInput') {
          const videoUrls = entry.videoUrls || [];
          additions.push({
            id: newId,
            type: 'videoInput',
            position: pos,
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            data: {
              label: entry.label || '视频',
              videoUrls,
              onVideosChange: onVideoInputChange,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onNodeResize,
              onVideoAspectChange,
            },
            style: baseStyle || (videoUrls.length > 0 ? { width: 260, height: 146 } : undefined),
          });
          newNodeIds.push(newId);
          continue;
        }
        if (entry.type === 'videoEditor') {
          additions.push({
            id: newId,
            type: 'videoEditor',
            position: pos,
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            data: {
              label: entry.label || '视频编辑器',
              videoEditorTimeline: entry.videoEditorTimeline || createEmptyVideoEditorTimeline(),
              videoUrl: entry.videoUrl || '',
              onOpenVideoEditor,
              onDownloadVideo: downloadNodeVideos,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onDeleteNode: deleteCanvasNode,
            },
            style: baseStyle || { width: 300, height: 210 },
          });
          newNodeIds.push(newId);
          continue;
        }
        if (REMOVED_NODE_TYPES.has(entry.type)) {
          additions.push({
            id: newId,
            type: entry.type,
            position: pos,
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            data: {
              label: entry.label || getDefaultNodeLabel({ type: entry.type, data: entry }),
              onDeleteNode: deleteCanvasNode,
            },
          });
          newNodeIds.push(newId);
          continue;
        }
        if (WORKFLOW_TEXT_NODE_TYPES.has(entry.type)) {
          additions.push({
            id: newId,
            type: entry.type,
            position: pos,
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            style: baseStyle || {
              width: entry.type === 'ecommerceVideoPlanner' ? 360 : entry.type === 'competitorVideo' ? 330 : 320,
            },
            data: {
              ...entry,
              label: entry.label || getDefaultNodeLabel({ type: entry.type, data: entry }),
              onDataChange: onWorkflowNodeDataChange,
              onCreateVideoFromShot: createVideoFromShot,
              onCreateVideoEditorFromAssembler: createVideoEditorFromAssembler,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onDeleteNode: deleteCanvasNode,
            },
            selected: false,
            zIndex: 1,
          });
          newNodeIds.push(newId);
          continue;
        }
        if (entry.type === 'result') {
          const resultId = newId;
          const generatorId = `generator_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          pairMap.current[resultId] = generatorId;
          updateGeneratorVisibility(resultId);

          const resultStyle = entry.style ? { ...entry.style } : (
            entry.resultType === 'generateText'
              ? { width: 280, height: 190 }
              : entry.resultType === 'generateImage'
                ? { width: 280, height: 373 }
                : entry.resultType === 'generateVideo'
                  ? { width: 320, height: 180 }
                  : entry.resultType === 'generateAudio'
                    ? { width: 300, height: 150 }
                    : entry.resultType === 'generateStoryboardScript'
                      ? { width: 520 }
                      : undefined
          );
          additions.push({
            id: resultId,
            type: 'result',
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            position: pos,
            style: resultStyle,
            data: {
              label: entry.label || (
                entry.resultType === 'generateText' ? '文本'
                : entry.resultType === 'generateImage' ? '图片'
                : entry.resultType === 'generateVideo' ? '视频'
                : entry.resultType === 'generateAudio' ? '音频'
                : entry.resultType === 'generateStoryboardScript' ? '分镜工作台'
                : '结果'
              ),
              result: entry.result || '',
              resultText: entry.resultText,
              resultType: entry.resultType,
              textSource: entry.textSource,
              generationConfig: entry.generationConfig,
              pairedGeneratorId: generatorId,
              promptDraft: entry.promptDraft || '',
              ...normalizedImages,
              imageHistory: entry.imageHistory,
              materialId: entry.materialId,
              materialName: entry.materialName,
              materialPrompt: entry.materialPrompt,
              storyboardCards: entry.storyboardCards,
              storyboardResourcePackage: entry.storyboardResourcePackage,
              storyboardVoiceoverScript: entry.storyboardVoiceoverScript,
              image_prompt: entry.image_prompt || '',
              image_negative_prompt: entry.image_negative_prompt,
              image_model: entry.image_model || '',
              image_size: entry.image_size || '3:4',
              image_resolution: entry.image_resolution || '1k',
              image_quality: entry.image_quality || 'auto',
              image_background: entry.image_background || 'auto',
              image_output_format: entry.image_output_format || 'png',
              image_count: entry.image_count || 1,
              image_api_id: entry.image_api_id || '',
              storyboard_script_prompt: entry.storyboard_script_prompt || '',
              storyboard_script_card_count: entry.storyboard_script_card_count,
              storyboard_aspect_ratio: entry.storyboard_aspect_ratio,
              storyboard_style: entry.storyboard_style,
              storyboard_total_duration: entry.storyboard_total_duration,
              storyboard_temperature: entry.storyboard_temperature,
              video_prompt: entry.video_prompt || '',
              video_model: entry.video_model || '',
              video_aspect_ratio: entry.video_aspect_ratio || '',
              video_duration: entry.video_duration,
              video_resolution: entry.video_resolution || '',
              video_api_id: entry.video_api_id || '',
              videoUrl: entry.videoUrl,
              videoSource: entry.videoSource,
              audioUrl: entry.audioUrl,
              audioSource: entry.audioSource,
              audioName: entry.audioName,
              audioDuration: entry.audioDuration,
              audio_text: entry.audio_text || '',
              audio_voice: entry.audio_voice || '冰糖',
              audio_style: entry.audio_style || '',
              imageSource: entry.imageSource,
              text_api_id: entry.text_api_id || '',
              text_model_name: entry.text_model_name || '',
              text_system_prompt: entry.text_system_prompt || '',
              text_temperature: entry.text_temperature,
              text_max_tokens: entry.text_max_tokens,
              apiConfigs,
              apiProviders,
              onDeleteNode: deleteCanvasNode,
              onInteractiveDragCreate,
              onNodeResize,
              onResultMediaAspectChange,
              onResultDataChange,
              onResultImageUpload,
              onResultVideoUpload,
              onResultAudioUpload,
              onResultExpandStateChange,
              onResultTextChange,
              onTextEditingChange: onResultTextEditingChange,
            },
            selected: true,
          });
          const generatorDraft = buildPastedGeneratorDraft(entry);
          additions.push({
            id: generatorId,
            type: 'generator',
            position: {
              x: pos.x + ((resultStyle?.width || GROUP_FALLBACK_WIDTH) - PROCESSOR_WIDTH) / 2,
              y: pos.y + (resultStyle?.height || RESULT_FALLBACK_HEIGHT) + PROCESSOR_GAP_Y,
            },
            data: {
              pairedResultId: resultId,
              onGenerate,
              setGenerating,
              onGeneratorDataChange,
              onRunTextGeneration: runTextGeneration,
              onRunImageGeneration: runImageGeneration,
              onRunVideoGeneration: runVideoGeneration,
              onRunAudioGeneration: runAudioGeneration,
              onCancelGeneration: cancelGenerationTask,
              onPromptDraftChange: onGeneratorPromptChange,
              apiConfigs,
              apiProviders,
              ...generatorDraft,
            },
            hidden: true,
          });
          newNodeIds.push(resultId, generatorId);
          if (entry._oldId) oldToNew[entry._oldId] = resultId;
          continue;
        }
        if (entry.type === 'smartSplitter') {
          additions.push({
            id: newId,
            type: 'smartSplitter',
            position: pos,
            parentNode: parentId || undefined,
            extent: parentId ? 'parent' : undefined,
            data: {
              label: entry.label || '智能拆分器',
              local_prompt: entry.local_prompt || '',
              direction_count: entry.direction_count || 'auto',
              images_per_direction: entry.images_per_direction || 1,
              image_size: entry.image_size || '3:4',
              image_resolution: entry.image_resolution || '1k',
              image_negative_prompt: resolveImageNegativePrompt(entry.image_negative_prompt),
              text_api_id: entry.text_api_id || '',
              text_model: entry.text_model || '',
              image_api_id: entry.image_api_id || '',
              image_model: entry.image_model || '',
              uploaded_reference_images: entry.uploaded_reference_images || [],
              connected_images: entry.connected_images || [],
              connectedPrompt: entry.connectedPrompt || '',
              referenceImageCount: entry.referenceImageCount || 0,
              apiConfigs,
              apiProviders,
              onDeleteNode: deleteCanvasNode,
              onInteractiveDragCreate,
              onNodeTitleChange,
            },
            selected: false,
            zIndex: 1,
          });
          newNodeIds.push(newId);
          continue;
        }
        if (entry.type === 'group') {
          const newChildIds = (entry.childIds || []).map(cid => oldToNew[cid]).filter(Boolean);
          additions.push({
            id: newId,
            type: 'group',
            position: pos,
            style: baseStyle || { width: 260, height: 200 },
            data: {
              label: entry.label || '组合',
              childIds: newChildIds,
              onDeleteNode: deleteCanvasNode,
              onUngroup: ungroupNodes,
              onSaveTemplate: openSaveTemplateDialog,
              onGroupResize,
              onGroupNameChange,
            },
          });
          newNodeIds.push(newId);
          continue;
        }
      }

      return [...nds, ...additions];
    });

    // 粘贴后选中新节点
    if (newNodeIds.length > 0 && options.selectNewNodes !== false) {
      setNodes((nds) => nds.map((n) => (
        newNodeIds.includes(n.id) ? { ...n, selected: true } : { ...n, selected: false }
      )));
    }

    // 重建选中节点之间的边
    if (Array.isArray(clip.edges) && clip.edges.length > 0) {
      const newEdges = clip.edges
        .map(e => {
          const newSource = oldToNew[e.source];
          const newTarget = oldToNew[e.target];
          if (newSource && newTarget) {
            return { ...e, id: `e_${newSource}_${newTarget}_${Date.now()}`, source: newSource, target: newTarget };
          }
          return null;
        })
        .filter(Boolean);
      if (newEdges.length > 0) {
        setEdges(eds => [...eds, ...newEdges]);
      }
    }

    // 更新 group 的 childIds 为新 ID，子节点设置 parentNode
    if (clip.entries.some(e => e.type === 'group')) {
      setNodes(nds => {
        // 先收集所有 group → 新 childIds 的映射
        const groupChildMap = {};
        nds.forEach(n => {
          if (n.type === 'group' && n.data?.childIds) {
            const newChildIds = n.data.childIds.map(cid => oldToNew[cid]).filter(Boolean);
            if (newChildIds.length > 0) groupChildMap[n.id] = newChildIds;
          }
        });
        return nds.map(n => {
          // 更新 group 的 childIds
          if (groupChildMap[n.id]) {
            return { ...n, data: { ...n.data, childIds: groupChildMap[n.id] } };
          }
          // 子节点设置 parentNode + extent
          for (const [gid, childIds] of Object.entries(groupChildMap)) {
            if (childIds.includes(n.id)) {
              return { ...n, parentNode: gid, extent: 'parent', zIndex: Math.max(n.zIndex || 0, 2) };
            }
          }
          return n;
        });
      });
    }

    return true;
  }, [
    onVideoInputChange, onOpenVideoEditor, onNodeTitleChange,
    createGeneratePair, onInteractiveDragCreate, onNodeResize, apiConfigs, apiProviders,
    deleteCanvasNode, onResultMediaAspectChange, onResultDataChange, onResultAudioUpload, onResultImageUpload,
    onResultExpandStateChange, onResultTextChange, onResultTextEditingChange, onResultVideoUpload,
    onGenerate, setGenerating, onGeneratorDataChange, runTextGeneration,
    runAudioGeneration, runImageGeneration, runVideoGeneration, cancelGenerationTask,
    onGeneratorPromptChange, ungroupNodes, openSaveTemplateDialog, onGroupResize, onGroupNameChange,
    updateGeneratorVisibility, getViewport,
  ]);

  // 用 ref 保存最新 pasteNodes / copySelectedNodes，避免键盘事件绑定陈旧闭包
  pasteNodesRef.current = pasteNodes;
  copySelectedNodesRef.current = copySelectedNodes;

  const duplicateNodeFromToolbar = useCallback((nodeId) => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!node) return false;
    const clip = copySelectedNodes({
      directlySelected: [node],
      stripSingleSelectedGroup: false,
      storeClipboard: false,
    });
    if (!clip) return false;
    return pasteNodes({
      clip,
      incrementPasteCount: false,
      offset: { dx: 36, dy: 36 },
    });
  }, [copySelectedNodes, pasteNodes]);

  const groupSelectionFromToolbar = useCallback((nodeId) => {
    const selectedIds = nodesRef.current
      .filter(node => node.selected)
      .map(node => node.id);
    if (!selectedIds.includes(nodeId)) selectedIds.push(nodeId);
    createGroupFromNodeIds(selectedIds);
  }, [createGroupFromNodeIds]);

  // 键盘快捷键：Cmd/Ctrl+C 复制、Cmd/Ctrl+V 粘贴、Cmd/Ctrl+D 原地复制
  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!target) return false;
      const tag = target.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'c' || e.key === 'C') {
        if (copySelectedNodesRef.current()) {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        // 节点剪贴板优先：粘贴一次后立即清空
        if (clipboardRef.current?.entries?.length > 0) {
          pasteNodesRef.current();
          clipboardRef.current = null;
          ignoreNextPasteRef.current = true;
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        if (copySelectedNodesRef.current() && pasteNodesRef.current()) {
          clipboardRef.current = null;
          ignoreNextPasteRef.current = true;
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // mount-only：通过 ref 调用最新函数，永不陈旧

  // 添加节点
  const createPlaylistFromNodeIds = useCallback((nodeIds) => {
    const selectedVideos = nodesRef.current.filter(node => (
      nodeIds.includes(node.id)
      && ['videoInput', 'videoEditor', 'result'].includes(node.type)
      && (node.data?.videoUrl || node.data?.videoUrls?.length || node.data?.resultType === 'generateVideo')
    ));
    if (selectedVideos.length < 1) {
      window.alert('请选择至少一个视频节点来创建 Playlist');
      return null;
    }
    const clips = selectedVideos.map((node, index) => ({
      id: node.id,
      url: node.data?.videoUrl || node.data?.videoUrls?.[0] || node.data?.videoUrls?.[0] || '',
      label: node.data?.label || `片段 ${index + 1}`,
      duration: Number(node.data?.duration || node.data?.videoDuration || 5),
    }));
    const position = getNodeDownstreamPosition(selectedVideos[0].id);
    const playlistId = `playlist_${Date.now()}`;
    setNodes(nds => [...nds.map(node => ({ ...node, selected: false })), {
      id: playlistId,
      type: 'playlist',
      position,
      style: { width: 360 },
      selected: true,
      data: {
        label: 'Playlist',
        clips,
        canvas: createCanvasOperation({ operation: 'playlist', sourceNodeIds: selectedVideos.map(node => node.id), outputType: 'video' }),
        onPlaylistChange: (id, nextClips) => setNodes(current => current.map(node => node.id === id ? { ...node, data: { ...node.data, clips: nextClips } } : node)),
        onNodeTitleChange,
        onInteractiveDragCreate,
        onDeleteNode: deleteCanvasNode,
      },
    }]);
    setEdges(edges => [...edges, ...selectedVideos.map(node => ({
      id: `e_${node.id}_${playlistId}`,
      source: node.id,
      target: playlistId,
      style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
    }))]);
    return playlistId;
  }, [deleteCanvasNode, getNodeDownstreamPosition, onInteractiveDragCreate, onNodeTitleChange, setEdges, setNodes]);

  const createViewfinderCapture = useCallback((nodeId, camera = {}) => {
    const position = getNodeDownstreamPosition(nodeId);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#131820"/><path d="M0 430L240 230 430 360 650 120 960 390V540H0Z" fill="#273746"/><circle cx="480" cy="270" r="82" fill="none" stroke="#A78BFA" stroke-width="3"/><path d="M480 164V376M374 270H586" stroke="#A78BFA" stroke-width="2" opacity=".8"/><text x="32" y="48" fill="#e8edf4" font-family="Arial" font-size="22">3D VIEWFINDER · YAW ${Math.round(camera.yaw || 0)}° · PITCH ${Math.round(camera.pitch || 0)}°</text></svg>`;
    return createGeneratePair('generateImage', position, nodeId, {
      label: 'Viewfinder 截图',
      imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      imageUrls: [`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`],
      operation: 'capture-frame',
      imageSource: '3d-viewfinder',
      suppressImagePrompt: true,
      activate: false,
      selected: true,
      prototype: true,
      prototypeSettings: camera,
    });
  }, [createGeneratePair, getNodeDownstreamPosition]);

  const addNode = useCallback((type, position, extraData = {}, options = {}) => {
    const ts = Date.now();
    let createdNodeId = null;
    const batchSourceIds = Array.isArray(menu?.dragSourceIds)
      ? [...new Set(menu.dragSourceIds.filter(Boolean))]
      : [];

    if (type === 'videoInput') {
      const videoUrls = extraData.videoUrls || (extraData.videoUrl ? [extraData.videoUrl] : []);
      createdNodeId = `video_${ts}`;
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'videoInput',
        position,
        data: { label: extraData.label || '视频', onVideosChange: onVideoInputChange, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onNodeResize, onVideoAspectChange, ...extraData, videoUrls, onDownloadVideo: downloadNodeVideos },
        style: videoUrls.length > 0 ? { width: 260, height: 146 } : undefined,
      }]);
    } else if (type === 'videoEditor') {
      createdNodeId = `video_editor_${ts}`;
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'videoEditor',
        position,
        style: { width: 300, height: 210 },
        data: {
          label: extraData.label || '视频编辑器',
          videoEditorTimeline: extraData.videoEditorTimeline || createEmptyVideoEditorTimeline(),
          videoUrl: extraData.videoUrl || '',
          onOpenVideoEditor,
          onDownloadVideo: downloadNodeVideos,
          onNodeTitleChange,
          onInteractiveDragCreate,
          onDeleteNode: deleteCanvasNode,
          ...extraData,
        },
      }]);
    } else if (type === 'playlist') {
      createdNodeId = `playlist_${ts}`;
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'playlist',
        position,
        style: { width: 360 },
        data: { label: 'Playlist', clips: extraData.clips || [], onPlaylistChange: (id, clips) => setNodes(current => current.map(node => node.id === id ? { ...node, data: { ...node.data, clips } } : node)), onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, ...extraData },
      }]);
    } else if (type === 'threeD') {
      createdNodeId = `three_d_${ts}`;
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'threeD',
        position,
        style: { width: 360, height: 330 },
        data: { label: '3D Viewfinder', onCaptureViewfinder: createViewfinderCapture, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, ...extraData },
      }]);
    } else if (type === 'character') {
      createdNodeId = `character_${ts}`;
      const characterPayload = buildCharacterPayloadFromData({
        label: extraData.label || '角色',
        characterName: extraData.characterName || '',
        description: extraData.description || '',
        voiceDescription: extraData.voiceDescription || '',
        mainVisualPrompt: extraData.mainVisualPrompt || '',
        threeViewPrompt: extraData.threeViewPrompt || '',
        mainVisualImageUrl: extraData.mainVisualImageUrl || extraData.imageUrl || '',
        threeViewImageUrl: extraData.threeViewImageUrl || '',
        audioUrl: extraData.audioUrl || '',
      });
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'character',
        position,
        style: { width: CHARACTER_NODE_WORKBENCH_WIDTH },
        data: {
          label: extraData.label || '角色',
          ...characterPayload,
          characterPayload,
          onCharacterChange,
          onOpenCharacterProfileGenerator: openCharacterProfileGenerator,
          onOpenCharacterImageGenerator: openCharacterImageGenerator,
          onSubmitAvatarCertification: submitCharacterAvatarCertification,
          onGenerateCharacterVoice: generateCharacterVoice,
          onSaveCharacterToLibrary: saveCharacterToLibrary,
          onCharacterMainVisualUpload,
          onImageAction: handleImageAction,
          apiProviders: runtimeSettings.providers,
          activeProviderId: runtimeSettings.activeProviderId,
          onNodeTitleChange,
          onInteractiveDragCreate,
          onDeleteNode: deleteCanvasNode,
        },
      }]);
    } else if (type === 'smartSplitter') {
      createdNodeId = `splitter_${ts}`;
      setNodes(nds => [...nds, {
        id: createdNodeId,
        type: 'smartSplitter',
        position,
        style: { width: 280 },
        data: createSmartSplitterRuntimeData({
          local_prompt: '',
          uploaded_reference_images: [],
          direction_count: 'auto',
          images_per_direction: 1,
          image_size: '3:4',
          image_resolution: '1k',
          batches: [],
          status: 'idle',
        }),
      }]);
    } else if (type === 'generateText' || type === 'generateImage' || type === 'generateVideo' || type === 'generateAudio' || type === 'generateStoryboardScript') {
      const connectToNodeId = options.connectToNodeId;
      const singleDragSourceId = batchSourceIds.length > 0 ? null : menu?.dragSourceId;
      const generateOptions = {
        ...extraData,
        sourceHandle: menu?.dragSourceHandle || extraData.sourceHandle || null,
      };
      if (options.selected !== undefined) {
        generateOptions.selected = options.selected;
      }
      if (options.activate !== undefined) {
        generateOptions.activate = options.activate;
      }
      createdNodeId = createGeneratePair(type, position, connectToNodeId ? null : singleDragSourceId, {
        ...generateOptions,
      });
      if (createdNodeId && batchSourceIds.length > 0) {
        connectMultipleCanvasNodes(batchSourceIds, createdNodeId);
      }
      if (createdNodeId && connectToNodeId) {
        connectCanvasNodes(createdNodeId, connectToNodeId);
      }
      return createdNodeId;
    }

    if (createdNodeId && options.connectToNodeId) {
      connectCanvasNodes(createdNodeId, options.connectToNodeId);
    }
    if (createdNodeId && batchSourceIds.length > 0) {
      connectMultipleCanvasNodes(batchSourceIds, createdNodeId);
    } else if (createdNodeId && (type === 'smartSplitter' || type === 'videoEditor' || type === 'playlist' || type === 'threeD' || type === 'character') && menu?.dragSourceId) {
      connectCanvasNodes(menu.dragSourceId, createdNodeId, menu?.dragSourceHandle || null);
    }

    setMenu(null);
    return createdNodeId;
  }, [setNodes, onVideoInputChange, onOpenVideoEditor, onCharacterChange, openCharacterProfileGenerator, openCharacterImageGenerator, submitCharacterAvatarCertification, generateCharacterVoice, saveCharacterToLibrary, onCharacterMainVisualUpload, handleImageAction, onImageActionEditingChange, runtimeSettings.activeProviderId, runtimeSettings.providers, onNodeTitleChange, onInteractiveDragCreate, deleteCanvasNode, onNodeResize, downloadNodeVideos, createGeneratePair, createViewfinderCapture, menu, connectCanvasNodes, connectMultipleCanvasNodes, createSmartSplitterRuntimeData]);

  const getCopilotCanvasState = useCallback(() => {
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(node => node.selected);
    const contextNodes = [
      ...selectedNodes,
      ...currentNodes.filter(node => !node.selected),
    ].slice(0, 80);
    const contextNodeIds = new Set(contextNodes.map(node => node.id));
    const compactText = value => String(value || '').trim().slice(0, 1600);
    return {
      projectId,
      nodeCount: currentNodes.length,
      edgeCount: edgesRef.current.length,
      selectedNodeIds: selectedNodes.map(node => node.id),
      nodes: contextNodes.map(node => ({
        id: node.id,
        type: node.type,
        resultType: node.data?.resultType || '',
        label: node.data?.label || node.data?.title || node.id,
        content: compactText(
          node.data?.result
          || node.data?.promptDraft
          || node.data?.image_prompt
          || node.data?.text
          || '',
        ),
      })),
      edges: edgesRef.current
        .filter(edge => contextNodeIds.has(edge.source) && contextNodeIds.has(edge.target))
        .slice(0, 160)
        .map(edge => ({ source: edge.source, target: edge.target })),
      truncated: currentNodes.length > contextNodes.length,
    };
  }, [projectId]);

  const getCopilotStartPosition = useCallback((selectedNodes) => {
    if (selectedNodes.length > 0) {
      const right = Math.max(...selectedNodes.map(node => {
        const pos = getAbsoluteNodePosition(node, nodesRef.current);
        return pos.x + getNodeWidth(node);
      }));
      const top = Math.min(...selectedNodes.map(node => getAbsoluteNodePosition(node, nodesRef.current).y));
      return { x: right + 96, y: top };
    }
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    return screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
  }, [getAbsoluteNodePosition, screenToFlowPosition]);

  const applyCopilotPlan = useCallback(async (rawPlan) => {
    const requestedTargetIds = [...new Set(
      (Array.isArray(rawPlan?.targetNodeIds) ? rawPlan.targetNodeIds : []).filter(Boolean),
    )];
    const plan = normalizeCopilotPlan(rawPlan);
    const selectedNodes = nodesRef.current.filter(node => node.selected);
    const existingIds = new Set(nodesRef.current.map(node => node.id));
    const selectedIds = requestedTargetIds.filter(id => existingIds.has(id)).length > 0
      ? requestedTargetIds.filter(id => existingIds.has(id))
      : selectedNodes.map(node => node.id);
    const newRefs = new Set(plan.nodes.map(node => node.ref));
    const unknownRefs = plan.nodes.flatMap(node => node.upstreamRefs)
      .filter(ref => !existingIds.has(ref) && !newRefs.has(ref));
    if (unknownRefs.length > 0) {
      throw new Error(`Copilot 引用了画布中不存在的节点：${[...new Set(unknownRefs)].slice(0, 3).join('、')}`);
    }

    const createdResultIds = [];
    const createdByRef = new Map();
    const branchGapY = 260;
    const stepGapX = 360;
    const start = getCopilotStartPosition(selectedNodes);
    const layout = getCopilotPlanLayout(plan);

    historyPastRef.current = [...historyPastRef.current, createCanvasHistorySnapshot()].slice(-CANVAS_HISTORY_LIMIT);
    historyFutureRef.current = [];

    plan.nodes.forEach((nodeSpec) => {
      const nodeLayout = layout.get(nodeSpec.ref) || { column: 0, row: 0, rowCount: 1 };
      const position = {
        x: start.x + nodeLayout.column * stepGapX,
        y: start.y + (nodeLayout.row - (nodeLayout.rowCount - 1) / 2) * branchGapY,
      };
      const resultId = createGeneratePair(nodeSpec.nodeType, position, null, {
        label: nodeSpec.label,
        resultText: nodeSpec.nodeType === 'generateText' ? nodeSpec.content : '',
        promptDraft: nodeSpec.prompt,
        imagePrompt: nodeSpec.imagePrompt || nodeSpec.prompt,
        activate: false,
        selected: false,
        textSource: nodeSpec.nodeType === 'generateText' && nodeSpec.content ? 'copilot' : undefined,
      });
      if (!resultId) throw new Error(`无法创建节点：${nodeSpec.label}`);
      createdResultIds.push(resultId);
      createdByRef.set(nodeSpec.ref, resultId);
    });

    let connectionCount = 0;
    plan.nodes.forEach((nodeSpec) => {
      const targetId = createdByRef.get(nodeSpec.ref);
      const upstreamIds = nodeSpec.upstreamRefs
        .map(ref => createdByRef.get(ref) || (existingIds.has(ref) ? ref : null))
        .filter(Boolean);
      if (upstreamIds.length > 0) {
        connectMultipleCanvasNodes(upstreamIds, targetId);
        connectionCount += upstreamIds.length;
      } else if (selectedIds.length > 0) {
        connectMultipleCanvasNodes(selectedIds, targetId);
        connectionCount += selectedIds.length;
      }
    });

    if (createdResultIds.length > 0) {
      window.setTimeout(() => {
        setNodes(current => current.map(node => ({
          ...node,
          selected: createdResultIds.includes(node.id),
        })));
        fitView({
          nodes: createdResultIds.map(id => ({ id })),
          duration: 520,
          padding: 0.22,
          minZoom: CANVAS_MIN_ZOOM,
          maxZoom: 1.2,
        });
      }, 120);
    }

    const runNodeIds = plan.nodes
      .filter(node => node.run)
      .map(node => createdByRef.get(node.ref))
      .filter(Boolean);
    let runResult = null;
    if (runNodeIds.length > 0) {
      await new Promise(resolve => window.setTimeout(resolve, 240));
      runResult = await runNodeIdsWithDependencies(runNodeIds, {
        emptyMessage: 'Copilot 创建的节点里暂时没有可运行节点',
        scopeLabel: 'Copilot 运行',
        silent: true,
      });
    }

    copilotLastCreatedIdsRef.current = createdResultIds;
    copilotLastEditUndoRef.current = null;
    const runMessage = runResult?.message
      ? ` ${runResult.message}`
      : runNodeIds.length > 0
        ? ` 并运行 ${runNodeIds.length} 个节点。`
        : '';
    return {
      message: `画布操作已完成：创建 ${createdResultIds.length} 个节点，连接 ${connectionCount} 条关系。${runMessage}`.trim(),
      createdResultIds,
    };
  }, [
    connectMultipleCanvasNodes,
    createCanvasHistorySnapshot,
    createGeneratePair,
    fitView,
    getCopilotStartPosition,
    runNodeIdsWithDependencies,
    setNodes,
  ]);

  const applyCopilotEditPlan = useCallback(async (rawPlan) => {
    const targetNodeIds = [...new Set(
      (Array.isArray(rawPlan?.targetNodeIds) ? rawPlan.targetNodeIds : []).filter(Boolean),
    )];
    const targetRevisions = rawPlan?.targetRevisions && typeof rawPlan.targetRevisions === 'object'
      ? rawPlan.targetRevisions
      : {};
    const plan = normalizeCopilotEditPlan(rawPlan);
    const allowedTargetIds = new Set(targetNodeIds);
    if (allowedTargetIds.size === 0 || plan.edits.some(edit => !allowedTargetIds.has(edit.nodeId))) {
      throw new Error('Copilot 尝试修改未引用的画布节点，已阻止操作');
    }

    const currentNodes = nodesRef.current;
    const currentTargets = buildCopilotNodeTargets(currentNodes, targetNodeIds, pairMap.current);
    const currentTargetsById = new Map(currentTargets.map(target => [target.id, target]));
    for (const edit of plan.edits) {
      const target = currentTargetsById.get(edit.nodeId);
      if (!target) throw new Error(`引用的节点已不存在：${edit.nodeId}`);
      if (targetRevisions[edit.nodeId] && target.revision !== targetRevisions[edit.nodeId]) {
        throw new Error(`“${target.label}”在 Copilot 思考期间已发生变化，请重新发送修改要求`);
      }
      const node = currentNodes.find(item => item.id === edit.nodeId);
      const generatorId = pairMap.current[edit.nodeId] || node?.data?.pairedGeneratorId;
      const generatorNode = currentNodes.find(item => item.id === generatorId);
      if (isRunningGenerationNode(node) || isRunningGenerationNode(generatorNode)) {
        throw new Error(`“${target.label}”正在生成中，暂时不能修改`);
      }
    }

    const beforeSnapshot = createCanvasHistorySnapshot();
    const applied = applyCopilotEditsToNodes(currentNodes, plan, pairMap.current);
    historyPastRef.current = [...historyPastRef.current, beforeSnapshot].slice(-CANVAS_HISTORY_LIMIT);
    historyFutureRef.current = [];
    const nextNodes = applied.nodes.map(node => (
      isSelectableCanvasNode(node)
        ? { ...node, selected: applied.updatedNodeIds.includes(node.id) }
        : node
    ));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    copilotLastCreatedIdsRef.current = [];
    copilotLastEditUndoRef.current = applied.inversePlan;
    window.setTimeout(() => {
      syncPromptToGenerators();
      fitView({
        nodes: applied.updatedNodeIds.map(id => ({ id })),
        duration: 420,
        padding: 0.28,
        minZoom: CANVAS_MIN_ZOOM,
        maxZoom: 1.2,
      });
    }, 80);

    const promptOnlyNote = plan.edits.some(edit => edit.operation === 'update_prompt')
      ? ' 提示词已更新，尚未重新生成。'
      : '';
    const cleanSummary = plan.summary.replace(/[。！!？?，,；;]+$/u, '');
    return {
      message: `画布内容已更新：${cleanSummary}，共修改 ${plan.edits.length} 项。${promptOnlyNote}`.trim(),
      updatedNodeIds: applied.updatedNodeIds,
    };
  }, [createCanvasHistorySnapshot, fitView, setNodes, syncPromptToGenerators]);

  const handleCopilotUserRequest = useCallback(async ({
    text,
    sessionId,
    modelSelection,
    attachments = [],
    targetNodes = [],
  }) => {
    const response = await fetch(`${API_BASE}/api/copilot/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: text,
        canvas: getCopilotCanvasState(),
        provider_id: modelSelection?.providerId || '',
        model_name: modelSelection?.modelName || '',
        target_nodes: targetNodes.map(target => ({
          id: target.id,
          node_type: target.nodeType,
          result_type: target.resultType,
          label: target.label,
          kind: target.kind,
          content: target.content,
          prompt: target.prompt,
          thumbnail_url: String(target.thumbnailUrl || '').startsWith('data:') ? '' : target.thumbnailUrl || '',
          can_edit_content: target.canEditContent,
          can_edit_prompt: target.canEditPrompt,
          can_rename: target.canRename,
          revision: target.revision,
        })),
        attachments: attachments.map(attachment => ({
          name: attachment.name,
          mime_type: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
          data_url: attachment.dataUrl || '',
          text_content: attachment.textContent || '',
        })),
      }),
    });
    const payload = await parseJsonResponse(response, 'Copilot 对话失败');
    const targetNodeIds = targetNodes.map(target => target.id);
    const targetRevisions = Object.fromEntries(targetNodes.map(target => [target.id, target.revision]));
    const normalizedPlan = payload.plan ? normalizeCopilotPlan(payload.plan) : null;
    const plan = normalizedPlan ? { ...normalizedPlan, targetNodeIds } : null;
    const normalizedEditPlan = payload.editPlan || payload.edit_plan
      ? normalizeCopilotEditPlan(payload.editPlan || payload.edit_plan)
      : null;
    const editPlan = normalizedEditPlan
      ? { ...normalizedEditPlan, targetNodeIds, targetRevisions }
      : null;
    const choices = payload.choices ? normalizeCopilotChoices(payload.choices) : null;
    if (!plan && !editPlan) {
      return { message: payload.message || '我在。你想先聊聊什么？', choices };
    }

    if (editPlan) {
      if (copilotEditPlanNeedsConfirmation(editPlan, payload.editRequiresConfirmation)) {
        return {
          message: payload.message || `我准备修改 ${editPlan.edits.length} 项节点内容。`,
          pendingEditPlan: editPlan,
          choices,
        };
      }
      const applied = await applyCopilotEditPlan(editPlan);
      return {
        message: applied.message,
        choices,
      };
    }

    if (copilotPlanNeedsConfirmation(plan, payload.requiresConfirmation)) {
      return {
        message: payload.message || `我准备了一个包含 ${plan.nodes.length} 个节点的画布方案。`,
        pendingPlan: plan,
        choices,
      };
    }

    const applied = await applyCopilotPlan(plan);
    return {
      message: [payload.message, applied.message].filter(Boolean).join('\n'),
      choices,
    };
  }, [applyCopilotEditPlan, applyCopilotPlan, getCopilotCanvasState]);

  const undoCopilotLastAction = useCallback(() => {
    const ids = copilotLastCreatedIdsRef.current;
    if (ids.length > 0) {
      handleNodesChange(ids.map(id => ({ id, type: 'remove' })));
      copilotLastCreatedIdsRef.current = [];
      return;
    }
    const inversePlan = copilotLastEditUndoRef.current;
    if (inversePlan) {
      try {
        const beforeSnapshot = createCanvasHistorySnapshot();
        const applied = applyCopilotEditsToNodes(nodesRef.current, inversePlan, pairMap.current);
        historyPastRef.current = [...historyPastRef.current, beforeSnapshot].slice(-CANVAS_HISTORY_LIMIT);
        historyFutureRef.current = [];
        nodesRef.current = applied.nodes;
        setNodes(applied.nodes);
        copilotLastEditUndoRef.current = null;
        window.setTimeout(syncPromptToGenerators, 0);
        return;
      } catch (error) {
        console.warn('[copilot] 撤销节点修改失败，回退到画布撤销', error);
        copilotLastEditUndoRef.current = null;
      }
    }
    undoCanvas();
  }, [createCanvasHistorySnapshot, handleNodesChange, setNodes, syncPromptToGenerators, undoCanvas]);

  const copilotTools = useMemo(() => ({
    handleUserRequest: handleCopilotUserRequest,
    applyPlan: applyCopilotPlan,
    applyEditPlan: applyCopilotEditPlan,
    undoLastAction: undoCopilotLastAction,
  }), [applyCopilotEditPlan, applyCopilotPlan, handleCopilotUserRequest, undoCopilotLastAction]);

  const copilotModelOptions = useMemo(
    () => buildCopilotModelOptions(runtimeSettings),
    [runtimeSettings],
  );

  const addMaterialToCanvas = useCallback((material, position) => {
    if (!material) return;
    const targetPosition = position || screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const materialPrompt = material.prompt || '';
    if (material.type === 'video') {
      createGeneratePair('generateVideo', targetPosition, null, {
        videoUrl: material.imageUrl,
        materialId: material.id,
        materialName: material.name,
        materialPrompt,
      });
      return;
    }
    if (material.type === 'text' || !material.imageUrl) {
      createGeneratePair('generateText', targetPosition, null, {
        resultText: materialPrompt || material.name || '',
      });
      return;
    }
    createGeneratePair('generateImage', targetPosition, null, {
      imageUrl: material.imageUrl,
      materialId: material.id,
      materialName: material.name,
      materialPrompt,
    });
  }, [createGeneratePair, screenToFlowPosition]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    setNodes(nds => {
      const generatorIds = new Set(nds.filter(n => n.type === 'generator').map(n => n.id));
      const hydrated = nds.map(n => {
        if (n.type === 'result') {
          const linkedGeneratorId = n.id.replace('result_', 'generator_');
          if (generatorIds.has(linkedGeneratorId)) {
            pairMap.current[n.id] = linkedGeneratorId;
          }
          const normalizedData = n.data?.resultType === 'generateImage'
            ? { ...n.data, ...normalizeImageResultData(n.data) }
            : n.data;
          return { ...n, data: { ...normalizedData, label: normalizedData?.label || getDefaultNodeLabel(n), apiConfigs, apiProviders, onDeleteNode: deleteCanvasNode, onInteractiveDragCreate, onNodeResize, onResultMediaAspectChange, onResultCardUpdate, onResultDataChange, onResultImageUpload, onResultVideoUpload, onResultAudioUpload, onDownloadVideo: downloadNodeVideos, onResultExpandStateChange, onResultTextChange, onTextEditingChange: onResultTextEditingChange, onStoryboardCardClickPlaceholder, onStoryboardCoverBatchGenerate: runStoryboardCoverBatchGeneration, onOpenVideoWorkbench: openVideoWorkbench, onCreateVideoEnhancementPrototype: createVideoEnhancementPrototype, onCreateVideoSubjectReplacementPrototype: createVideoSubjectReplacementPrototype, onCreateVideoSubjectRemovalPrototype: createVideoSubjectRemovalPrototype, onGetCanvasImageChoices: getCanvasImageChoices, onImageAction: handleImageAction, onImageActionEditingChange, allowedModels: runtimeSettings.allowedModels } };
        }

        if (n.type === 'videoInput') {
          const videoUrls = n.data?.videoUrls || (n.data?.videoUrl ? [n.data.videoUrl] : []);
          videoInputs.current[n.id] = videoUrls;
          return { ...n, data: { ...n.data, label: n.data?.label || getDefaultNodeLabel(n), videoUrls, onVideosChange: onVideoInputChange, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onNodeResize, onVideoAspectChange, onDownloadVideo: downloadNodeVideos } };
        }

        if (n.type === 'videoEditor') {
          return { ...n, data: { ...n.data, label: n.data?.label || getDefaultNodeLabel(n), videoEditorTimeline: n.data?.videoEditorTimeline || createEmptyVideoEditorTimeline(), onOpenVideoEditor, onDownloadVideo: downloadNodeVideos, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
        }

        if (n.type === 'character') {
          const characterPayload = buildCharacterPayloadFromData(n.data || {});
          return {
            ...n,
            style: { ...(n.style || {}), width: Math.max(Number(n.style?.width) || 0, CHARACTER_NODE_WORKBENCH_WIDTH) },
            data: {
              ...n.data,
              ...characterPayload,
              characterPayload,
              label: n.data?.label || getDefaultNodeLabel(n),
              onCharacterChange,
              onOpenCharacterProfileGenerator: openCharacterProfileGenerator,
              onOpenCharacterImageGenerator: openCharacterImageGenerator,
              onSubmitAvatarCertification: submitCharacterAvatarCertification,
              onGenerateCharacterVoice: generateCharacterVoice,
              onSaveCharacterToLibrary: saveCharacterToLibrary,
              onCharacterMainVisualUpload,
              onImageAction: handleImageAction,
              apiProviders: runtimeSettings.providers,
              activeProviderId: runtimeSettings.activeProviderId,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onDeleteNode: deleteCanvasNode,
            },
          };
        }

        if (REMOVED_NODE_TYPES.has(n.type)) {
          return { ...n, data: { label: n.data?.label || getDefaultNodeLabel(n), onDeleteNode: deleteCanvasNode } };
        }

        if (WORKFLOW_TEXT_NODE_TYPES.has(n.type)) {
          return {
            ...n,
            data: {
              ...n.data,
              label: n.data?.label || getDefaultNodeLabel(n),
              onDataChange: onWorkflowNodeDataChange,
              onCreateVideoFromShot: createVideoFromShot,
              onCreateVideoEditorFromAssembler: createVideoEditorFromAssembler,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onDeleteNode: deleteCanvasNode,
            },
          };
        }

        if (n.type === 'generator') {
          return { ...n, data: { ...n.data, onGenerate, setGenerating, onGeneratorDataChange, onDeleteEdge: deleteCanvasEdge, onRunTextGeneration: runTextGeneration, onRunImageGeneration: runImageGeneration, onRunVideoGeneration: runVideoGeneration, onRunAudioGeneration: runAudioGeneration, onCancelGeneration: cancelGenerationTask, onPromptDraftChange: onGeneratorPromptChange, onStoryboardPromptUpdate, apiConfigs, apiProviders: runtimeSettings.providers, allowedModels: runtimeSettings.allowedModels, activeProviderId: runtimeSettings.activeProviderId, maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens), promptStyles: officialPromptStyles } };
        }

        if (n.type === 'smartSplitter') {
          return { ...n, data: createSmartSplitterRuntimeData(n.data) };
        }

        if (n.type === 'playlist') {
          return { ...n, data: { ...n.data, onPlaylistChange: (id, clips) => setNodes(current => current.map(node => node.id === id ? { ...node, data: { ...node.data, clips } } : node)), onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
        }

        if (n.type === 'threeD') {
          return { ...n, data: { ...n.data, onCaptureViewfinder: createViewfinderCapture, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
        }

        if (n.type === 'storyboardCard') {
          return { ...n, data: { ...n.data, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onStoryboardCardUpdate, onCardPlaceholderClick } };
        }

        if (n.type === 'group') {
          return { ...n, data: { ...n.data, label: n.data?.label || '未命名组合', onDeleteNode: deleteCanvasNode, onUngroup: ungroupNodes, onSaveTemplate: openSaveTemplateDialog, onGroupResize, onGroupNameChange } };
        }

        // 所有节点附加交互圆点拖拽回调
        return { ...n, data: { ...n.data, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
      });

      return hydrated;
    });
  }, [apiConfigs, apiProviders, cancelGenerationTask, createSmartSplitterRuntimeData, createVideoEditorFromAssembler, createVideoFromShot, createVideoEnhancementPrototype, createVideoSubjectRemovalPrototype, createVideoSubjectReplacementPrototype, deleteCanvasEdge, deleteCanvasNode, getCanvasImageChoices, handleImageAction, onImageActionEditingChange, officialPromptStyles, onCardPlaceholderClick, onCharacterChange, openCharacterProfileGenerator, openCharacterImageGenerator, submitCharacterAvatarCertification, generateCharacterVoice, saveCharacterToLibrary, onCharacterMainVisualUpload, onGenerate, onGeneratorDataChange, onGeneratorPromptChange, onGroupNameChange, onGroupResize, onNodeResize, onNodeTitleChange, onOpenVideoEditor, onResultCardUpdate, onResultDataChange, onResultExpandStateChange, onResultImageUpload, onResultMediaAspectChange, onResultTextChange, onResultTextEditingChange, onResultVideoUpload, onStoryboardCardClickPlaceholder, onStoryboardCardUpdate, onStoryboardPromptUpdate, onVideoAspectChange, onVideoInputChange, onInteractiveDragCreate, onWorkflowNodeDataChange, openSaveTemplateDialog, openVideoWorkbench, runImageGeneration, runTextGeneration, runVideoGeneration, setGenerating, setNodes, ungroupNodes, runtimeSettings]);

  useEffect(() => {
    setNodes(nds => nds.map(n => {
      if (n.type === 'generator') {
        return { ...n, data: { ...n.data, apiConfigs, apiProviders: runtimeSettings.providers, onDeleteEdge: deleteCanvasEdge, onRunTextGeneration: runTextGeneration, onRunImageGeneration: runImageGeneration, onRunVideoGeneration: runVideoGeneration, onCancelGeneration: cancelGenerationTask, onStoryboardPromptUpdate, allowedModels: runtimeSettings.allowedModels, activeProviderId: runtimeSettings.activeProviderId, maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens), promptStyles: officialPromptStyles } };
      }
      if (n.type === 'storyboardCard') {
        return { ...n, data: { ...n.data, onStoryboardCardUpdate, onCardPlaceholderClick, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
      }
      if (n.type === 'result') {
        return { ...n, data: { ...n.data, label: n.data?.label || getDefaultNodeLabel(n), apiConfigs, apiProviders, onDeleteNode: deleteCanvasNode, onResultCardUpdate, onResultDataChange, onResultImageUpload, onResultVideoUpload, onDownloadVideo: downloadNodeVideos, onResultExpandStateChange, onResultTextChange, onTextEditingChange: onResultTextEditingChange, onStoryboardCardClickPlaceholder, onStoryboardCoverBatchGenerate: runStoryboardCoverBatchGeneration, onOpenVideoWorkbench: openVideoWorkbench, onCreateVideoEnhancementPrototype: createVideoEnhancementPrototype, onCreateVideoSubjectReplacementPrototype: createVideoSubjectReplacementPrototype, onCreateVideoSubjectRemovalPrototype: createVideoSubjectRemovalPrototype, onGetCanvasImageChoices: getCanvasImageChoices, onInteractiveDragCreate, onNodeResize, onResultMediaAspectChange, onImageAction: handleImageAction, onImageActionEditingChange, allowedModels: runtimeSettings.allowedModels } };
      }
      if (n.type === 'smartSplitter') {
        return { ...n, data: createSmartSplitterRuntimeData(n.data) };
      }
      if (n.type === 'playlist') {
        return { ...n, data: { ...n.data, onPlaylistChange: (id, clips) => setNodes(current => current.map(node => node.id === id ? { ...node, data: { ...node.data, clips } } : node)), onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
      }
      if (n.type === 'threeD') {
        return { ...n, data: { ...n.data, onCaptureViewfinder: createViewfinderCapture, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
      }
      if (n.type === 'videoInput') {
        return { ...n, data: { ...n.data, label: n.data?.label || getDefaultNodeLabel(n), onVideosChange: onVideoInputChange, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onNodeResize, onVideoAspectChange, onDownloadVideo: downloadNodeVideos } };
      }
      if (n.type === 'videoEditor') {
        return { ...n, data: { ...n.data, label: n.data?.label || getDefaultNodeLabel(n), videoEditorTimeline: n.data?.videoEditorTimeline || createEmptyVideoEditorTimeline(), onOpenVideoEditor, onDownloadVideo: downloadNodeVideos, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
      }
      if (n.type === 'character') {
        const characterPayload = buildCharacterPayloadFromData(n.data || {});
        return {
          ...n,
            style: { ...(n.style || {}), width: Math.max(Number(n.style?.width) || 0, CHARACTER_NODE_WORKBENCH_WIDTH) },
            data: {
              ...n.data,
              ...characterPayload,
              characterPayload,
              label: n.data?.label || getDefaultNodeLabel(n),
              onCharacterChange,
              onOpenCharacterProfileGenerator: openCharacterProfileGenerator,
              onOpenCharacterImageGenerator: openCharacterImageGenerator,
              onSubmitAvatarCertification: submitCharacterAvatarCertification,
              onGenerateCharacterVoice: generateCharacterVoice,
              onSaveCharacterToLibrary: saveCharacterToLibrary,
              onCharacterMainVisualUpload,
              onImageAction: handleImageAction,
              apiProviders: runtimeSettings.providers,
              activeProviderId: runtimeSettings.activeProviderId,
              onNodeTitleChange,
              onInteractiveDragCreate,
              onDeleteNode: deleteCanvasNode,
          },
        };
      }
      if (n.type === 'group') {
        return { ...n, data: { ...n.data, label: n.data?.label || '未命名组合', onDeleteNode: deleteCanvasNode, onUngroup: ungroupNodes, onSaveTemplate: openSaveTemplateDialog, onGroupResize, onGroupNameChange } };
      }
      if (REMOVED_NODE_TYPES.has(n.type)) {
        return { ...n, data: { label: n.data?.label || getDefaultNodeLabel(n), onDeleteNode: deleteCanvasNode } };
      }
      if (WORKFLOW_TEXT_NODE_TYPES.has(n.type)) {
        return {
          ...n,
          data: {
            ...n.data,
            label: n.data?.label || getDefaultNodeLabel(n),
            onDataChange: onWorkflowNodeDataChange,
            onCreateVideoFromShot: createVideoFromShot,
            onCreateVideoEditorFromAssembler: createVideoEditorFromAssembler,
            onNodeTitleChange,
            onInteractiveDragCreate,
            onDeleteNode: deleteCanvasNode,
          },
        };
      }
      return n;
    }));
  }, [apiConfigs, apiProviders, cancelGenerationTask, createSmartSplitterRuntimeData, createVideoEditorFromAssembler, createVideoFromShot, createVideoEnhancementPrototype, createVideoSubjectRemovalPrototype, createVideoSubjectReplacementPrototype, deleteCanvasEdge, deleteCanvasNode, getCanvasImageChoices, handleImageAction, onImageActionEditingChange, officialPromptStyles, onCardPlaceholderClick, onCharacterChange, openCharacterProfileGenerator, openCharacterImageGenerator, submitCharacterAvatarCertification, generateCharacterVoice, saveCharacterToLibrary, onCharacterMainVisualUpload, onGroupNameChange, onGroupResize, onInteractiveDragCreate, onNodeResize, onNodeTitleChange, onOpenVideoEditor, onWorkflowNodeDataChange, onResultAudioUpload, onResultCardUpdate, onResultImageUpload, onResultMediaAspectChange, onResultTextChange, onResultTextEditingChange, onResultVideoUpload, onStoryboardCardClickPlaceholder, onStoryboardCardUpdate, onStoryboardPromptUpdate, onVideoAspectChange, onVideoInputChange, openSaveTemplateDialog, openVideoWorkbench, runAudioGeneration, runImageGeneration, runTextGeneration, runVideoGeneration, setNodes, ungroupNodes, runtimeSettings]);

  const hydrateTemplateNode = useCallback((node) => {
    if (node.type === 'result') {
      const normalizedData = node.data?.resultType === 'generateImage'
        ? { ...node.data, ...normalizeImageResultData(node.data) }
        : node.data;
      return {
        ...node,
        data: {
          ...normalizedData,
          label: normalizedData?.label || getDefaultNodeLabel(node),
          apiConfigs,
          apiProviders,
          onDeleteNode: deleteCanvasNode,
          onInteractiveDragCreate,
          onNodeResize,
          onResultMediaAspectChange,
          onResultCardUpdate,
          onResultDataChange,
          onResultImageUpload,
          onResultVideoUpload,
          onResultAudioUpload,
          onResultExpandStateChange,
          onResultTextChange,
          onTextEditingChange: onResultTextEditingChange,
          onStoryboardCardClickPlaceholder,
          onStoryboardCoverBatchGenerate: runStoryboardCoverBatchGeneration,
          onOpenVideoWorkbench: openVideoWorkbench,
          onCreateVideoEnhancementPrototype: createVideoEnhancementPrototype,
          onCreateVideoSubjectReplacementPrototype: createVideoSubjectReplacementPrototype,
          onCreateVideoSubjectRemovalPrototype: createVideoSubjectRemovalPrototype,
          onGetCanvasImageChoices: getCanvasImageChoices,
          onImageAction: handleImageAction, onImageActionEditingChange, allowedModels: runtimeSettings.allowedModels,
        },
      };
    }
    if (node.type === 'videoInput') {
      const videoUrls = node.data?.videoUrls || (node.data?.videoUrl ? [node.data.videoUrl] : []);
      videoInputs.current[node.id] = videoUrls;
      return { ...node, data: { ...node.data, label: node.data?.label || getDefaultNodeLabel(node), videoUrls, onVideosChange: onVideoInputChange, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onNodeResize, onVideoAspectChange, onDownloadVideo: downloadNodeVideos } };
    }
    if (node.type === 'videoEditor') {
      return { ...node, data: { ...node.data, label: node.data?.label || getDefaultNodeLabel(node), videoEditorTimeline: node.data?.videoEditorTimeline || createEmptyVideoEditorTimeline(), onOpenVideoEditor, onDownloadVideo: downloadNodeVideos, onNodeTitleChange, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
    }
    if (node.type === 'character') {
      const characterPayload = buildCharacterPayloadFromData(node.data || {});
      return {
        ...node,
          style: { ...(node.style || {}), width: Math.max(Number(node.style?.width) || 0, CHARACTER_NODE_WORKBENCH_WIDTH) },
          data: {
            ...node.data,
            ...characterPayload,
            characterPayload,
            label: node.data?.label || getDefaultNodeLabel(node),
            onCharacterChange,
            onOpenCharacterProfileGenerator: openCharacterProfileGenerator,
            onOpenCharacterImageGenerator: openCharacterImageGenerator,
            onSubmitAvatarCertification: submitCharacterAvatarCertification,
            onGenerateCharacterVoice: generateCharacterVoice,
            onSaveCharacterToLibrary: saveCharacterToLibrary,
            onCharacterMainVisualUpload,
            onImageAction: handleImageAction,
            apiProviders: runtimeSettings.providers,
            activeProviderId: runtimeSettings.activeProviderId,
            onNodeTitleChange,
            onInteractiveDragCreate,
            onDeleteNode: deleteCanvasNode,
        },
      };
    }
    if (REMOVED_NODE_TYPES.has(node.type)) {
      return { ...node, data: { label: node.data?.label || getDefaultNodeLabel(node), onDeleteNode: deleteCanvasNode } };
    }
    if (WORKFLOW_TEXT_NODE_TYPES.has(node.type)) {
      return {
        ...node,
        data: {
          ...node.data,
          label: node.data?.label || getDefaultNodeLabel(node),
          onDataChange: onWorkflowNodeDataChange,
          onCreateVideoFromShot: createVideoFromShot,
          onCreateVideoEditorFromAssembler: createVideoEditorFromAssembler,
          onNodeTitleChange,
          onInteractiveDragCreate,
          onDeleteNode: deleteCanvasNode,
        },
      };
    }
    if (node.type === 'generator') {
      return {
        ...node,
        data: {
          ...node.data,
          onGenerate,
          setGenerating,
          onGeneratorDataChange,
          onRunTextGeneration: runTextGeneration,
          onRunImageGeneration: runImageGeneration,
          onRunVideoGeneration: runVideoGeneration,
          onRunAudioGeneration: runAudioGeneration,
          onCancelGeneration: cancelGenerationTask,
          onPromptDraftChange: onGeneratorPromptChange,
          onStoryboardPromptUpdate,
          apiConfigs,
          apiProviders,
          allowedModels: runtimeSettings.allowedModels,
          activeProviderId: runtimeSettings.activeProviderId,
          maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens),
          promptStyles: officialPromptStyles,
        },
      };
    }
    if (node.type === 'smartSplitter') {
      return { ...node, data: createSmartSplitterRuntimeData(node.data) };
    }
    if (node.type === 'storyboardCard') {
      return { ...node, data: { ...node.data, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode, onStoryboardCardUpdate, onCardPlaceholderClick } };
    }
    return { ...node, data: { ...node.data, onInteractiveDragCreate, onDeleteNode: deleteCanvasNode } };
  }, [apiConfigs, apiProviders, cancelGenerationTask, createSmartSplitterRuntimeData, createVideoEditorFromAssembler, createVideoFromShot, createVideoEnhancementPrototype, createVideoSubjectRemovalPrototype, createVideoSubjectReplacementPrototype, deleteCanvasNode, getCanvasImageChoices, handleImageAction, onImageActionEditingChange, officialPromptStyles, onCardPlaceholderClick, onCharacterChange, openCharacterProfileGenerator, openCharacterImageGenerator, submitCharacterAvatarCertification, generateCharacterVoice, saveCharacterToLibrary, onCharacterMainVisualUpload, onGenerate, onGeneratorDataChange, onGeneratorPromptChange, onInteractiveDragCreate, onNodeResize, onNodeTitleChange, onOpenVideoEditor, onWorkflowNodeDataChange, onResultAudioUpload, onResultCardUpdate, onResultDataChange, onResultExpandStateChange, onResultImageUpload, onResultMediaAspectChange, onResultTextChange, onResultTextEditingChange, onResultVideoUpload, onStoryboardCardClickPlaceholder, onStoryboardCardUpdate, onStoryboardPromptUpdate, onVideoAspectChange, onVideoInputChange, openVideoWorkbench, runAudioGeneration, runImageGeneration, runTextGeneration, runVideoGeneration, runtimeSettings.activeProviderId, runtimeSettings.allowedModels, runtimeSettings.maxTextTokens]);

  const addWorkflowTemplateToCanvas = useCallback((template) => {
    if (!template) return;
    historySnapshotRef.current = createCanvasHistorySnapshot();
    historyFutureRef.current = [];
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const targetPosition = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
    const instance = instantiateWorkflowTemplate(template, { position: targetPosition });
    const group = {
      ...instance.group,
      data: {
        ...instance.group.data,
        label: instance.group.data?.label || template.name || '未命名组合',
        onDeleteNode: deleteCanvasNode,
        onUngroup: ungroupNodes,
        onSaveTemplate: openSaveTemplateDialog,
        onGroupResize,
        onGroupNameChange,
      },
    };
    const hydratedNodes = instance.nodes.map(hydrateTemplateNode);
    instance.pairs.forEach(({ resultId, generatorId }) => {
      pairMap.current[resultId] = generatorId;
    });
    setNodes(current => [
      ...current.map(node => ({ ...node, selected: false })),
      group,
      ...hydratedNodes,
    ]);
    setEdges(current => [...current, ...instance.edges]);
    setMaterialDrawerOpen(false);
  }, [createCanvasHistorySnapshot, deleteCanvasNode, hydrateTemplateNode, onGroupNameChange, onGroupResize, openSaveTemplateDialog, screenToFlowPosition, setEdges, setNodes, ungroupNodes]);

  const runWorkflowTemplateFromRunner = useCallback(async (template, valuesByInputId = {}) => {
    if (!template) return;
    historySnapshotRef.current = createCanvasHistorySnapshot();
    historyFutureRef.current = [];
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const targetPosition = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
    const inputs = getWorkflowTemplateRunInputs(template);
    const rawInstance = instantiateWorkflowTemplate(template, { position: targetPosition });
    const instance = applyWorkflowTemplateRunInputs(rawInstance, inputs, valuesByInputId);
    const group = {
      ...instance.group,
      data: {
        ...instance.group.data,
        label: instance.group.data?.label || template.name || '未命名组合',
        onDeleteNode: deleteCanvasNode,
        onUngroup: ungroupNodes,
        onSaveTemplate: openSaveTemplateDialog,
        onGroupResize,
        onGroupNameChange,
      },
    };
    const hydratedNodes = instance.nodes.map(hydrateTemplateNode);
    instance.pairs.forEach(({ resultId, generatorId }) => {
      pairMap.current[resultId] = generatorId;
    });

    const nextNodes = [
      ...nodesRef.current.map(node => ({ ...node, selected: false })),
      group,
      ...hydratedNodes,
    ];
    const nextEdges = [...edgesRef.current, ...instance.edges];
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    setTemplateRunnerOpen(false);

    await new Promise(resolve => window.setTimeout(resolve, 0));
    const inputNodeIds = instance.inputNodeIds || new Set();
    const inputGeneratorIds = instance.inputGeneratorIds || new Set();
    const runnableCandidateIds = instance.nodes
      .filter(node => !inputNodeIds.has(node.id) && !inputGeneratorIds.has(node.id))
      .map(node => node.id);
    await runNodeIdsWithDependencies(runnableCandidateIds, {
      emptyMessage: '这个模板里没有可自动运行的生成节点',
      scopeLabel: `模板“${template.name || '未命名模板'}”运行`,
    });
  }, [createCanvasHistorySnapshot, deleteCanvasNode, hydrateTemplateNode, onGroupNameChange, onGroupResize, openSaveTemplateDialog, runNodeIdsWithDependencies, screenToFlowPosition, setEdges, setNodes, ungroupNodes]);

  const addOfficialTemplateToCanvas = useCallback(async (template) => {
    if (!template?.id) return;
    try {
      const detail = template.workflowData ? template : await getPublicTemplate(template.id);
      historySnapshotRef.current = createCanvasHistorySnapshot();
      historyFutureRef.current = [];
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      const preferred = screenToFlowPosition({
        x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
        y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
      });
      const bounds = detail.workflowData?.bounds || { width: 360, height: 260 };
      const position = findOpenCanvasPosition({
        nodes: nodesRef.current,
        preferred,
        width: bounds.width + 96,
        height: bounds.height + 96,
      });
      const instance = instantiateOfficialTemplate({
        ...detail.workflowData,
        name: detail.name,
        templateId: detail.id,
        versionId: detail.versionId,
      }, {
        mode: 'group',
        position,
        sourceTemplateId: detail.id,
        sourceTemplateVersion: detail.versionId,
      });
      const group = {
        ...instance.group,
        data: {
          ...instance.group.data,
          label: detail.name || '官方模板',
          onDeleteNode: deleteCanvasNode,
          onUngroup: ungroupNodes,
          onSaveTemplate: openSaveTemplateDialog,
          onGroupResize,
          onGroupNameChange,
        },
      };
      Object.entries(instance.pairMap).forEach(([resultId, generatorId]) => {
        pairMap.current[resultId] = generatorId;
      });
      setNodes(current => [
        ...current.map(node => ({ ...node, selected: false })),
        group,
        ...instance.nodes.map(hydrateTemplateNode),
      ]);
      setEdges(current => [...current, ...instance.edges]);
      setMaterialDrawerOpen(false);
    } catch (error) {
      window.alert(error.message || '官方模板添加失败');
    }
  }, [createCanvasHistorySnapshot, deleteCanvasNode, hydrateTemplateNode, onGroupNameChange, onGroupResize, openSaveTemplateDialog, screenToFlowPosition, setEdges, setNodes, ungroupNodes]);

  // 素材库通过这里复用画布已有的节点创建逻辑。
  useEffect(() => {
    const request = pendingInjectRef?.current;
    if (!request) return;
    pendingInjectRef.current = null;

    if (request.kind === 'material') {
      addMaterialToCanvas(request.item);
      return;
    }
    if (request.kind === 'template') {
      addWorkflowTemplateToCanvas(request.item);
      return;
    }

    const type = request.type === 'generateVideo' ? 'generateVideo' : 'generateImage';
    createGeneratePair(
      type,
      { x: 240, y: 240 },
      null,
      buildHomeGeneratorOptions(request),
    );
  }, [addMaterialToCanvas, addWorkflowTemplateToCanvas, createGeneratePair, pendingInjectRef]);

  // 单击空白画布关闭菜单并隐藏处理器
  const onPaneClick = useCallback(() => {
    if (isSpacePanning) {
      return;
    }
    // 刚拖拽连线结束，不关闭菜单
    if (justConnectedRef.current) {
      justConnectedRef.current = false;
      return;
    }
    setMenu(null);
    setCopilotPickingNode(false);
    updateGeneratorVisibility(null);
    setActiveSmartSplitterId(null);
    resetEdgeStyles();
  }, [isSpacePanning, updateGeneratorVisibility, resetEdgeStyles]);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    if (isSpacePanning) return;
    setMenu({
      x: event.clientX || event.pageX || window.innerWidth / 2,
      y: event.clientY || event.pageY || window.innerHeight / 2,
      items: PANE_CONTEXT_MENU,
      parentLabel: '操作菜单',
      submenu: null,
    });
  }, [isSpacePanning]);

  useEffect(() => {
    const closePaneContextMenu = () => setMenu(null);
    window.addEventListener('pplai:close-pane-context-menu', closePaneContextMenu);
    return () => window.removeEventListener('pplai:close-pane-context-menu', closePaneContextMenu);
  }, []);

  const handleMenuHover = useCallback((item) => {
    if (!item.children) return;
    setMenu(prev => prev ? { ...prev, submenu: item } : prev);
  }, []);

  const handleMenuClick = useCallback((item, e) => {
    e.stopPropagation();
    if (item.children) {
      setMenu(prev => prev ? { ...prev, submenu: item } : prev);
    } else if (item.action === 'upload-media') {
      pendingPaneUploadPositionRef.current = screenToFlowPosition({ x: menu.x, y: menu.y });
      setMenu(null);
      paneUploadInputRef.current?.click();
    } else if (item.nodeType) {
      const dropPosition = screenToFlowPosition({ x: menu.x, y: menu.y });
      const isInputDrag = menu?.dragSide === 'left';
      const position = isInputDrag
        ? centerNodeAtPosition(item.nodeType, dropPosition)
        : dropPosition;
      const extra = !isInputDrag && menu?.dragSourceHandle
        ? { sourceHandle: menu.dragSourceHandle }
        : {};
      const options = isInputDrag
        ? { connectToNodeId: menu.dragSourceId }
        : {};
      addNode(item.nodeType, position, extra, options);
    }
  }, [menu, screenToFlowPosition, addNode]);

  const handleQuickNodeClick = useCallback((item, e) => {
    e.stopPropagation();
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });
    setMenu(null);
    addNode(item.nodeType, position);
  }, [screenToFlowPosition, addNode]);

  const handleNodeSearchSelect = useCallback((type) => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const position = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
    setNodeSearchOpen(false);
    addNode(type, position, {}, { selected: false, activate: false });
  }, [addNode, screenToFlowPosition]);

  const handleEmptyCanvasAction = useCallback((action) => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });

    if (action === 'workflows') {
      setTemplateRunnerOpen(true);
      setMaterialDrawerOpen(false);
      setCharacterDrawerOpen(false);
      setCopilotOpen(false);
      setCopilotPickingNode(false);
      return;
    }

    if (action === 'first-last-frame') {
      addNode('generateVideo', position, { video_generation_mode: VIDEO_GENERATION_MODE_FIRST_LAST });
      return;
    }

    if (action === 'replace-background') {
      addNode('generateImage', position, {
        promptDraft: 'Replace the background while preserving the main subject',
        user_prompt: 'Replace the background while preserving the main subject',
      });
      return;
    }

    addNode('generateVideo', position);
  }, [addNode, screenToFlowPosition]);

  const uploadImageAssetsForCanvas = useCallback(async (files) => {
    const imageFiles = Array.from(files || []).filter(isSupportedImageFile);
    if (imageFiles.length === 0) return [];
    const assets = await Promise.all(imageFiles.map(async (file) => {
      const [asset, imageSize] = await Promise.all([
        uploadImageFile(file),
        readLocalImageFileSize(file),
      ]);
      if (!asset?.url) return null;
      const metadata = buildUploadedImageAssetMetadata(asset, imageSize);
      return {
        ...asset,
        ...metadata,
        imageDimensions: metadata.width && metadata.height
          ? { width: metadata.width, height: metadata.height }
          : undefined,
        imageDimensionsByUrl: metadata.width && metadata.height
          ? { [asset.url]: { width: metadata.width, height: metadata.height } }
          : undefined,
        style: resolveUploadedImageNodeStyle(metadata, asset),
      };
    }));
    const validAssets = assets.filter(asset => asset?.url);
    if (validAssets.length > 0) refreshLocalAssets();
    return validAssets;
  }, [refreshLocalAssets]);

  const uploadVideoFilesForCanvas = useCallback(async (files) => {
    const videoFiles = Array.from(files || []).filter(isSupportedVideoFile);
    if (videoFiles.length === 0) return [];
    const assets = await Promise.all(videoFiles.map(file => uploadVideoFile(file)));
    const urls = assets.map(asset => asset.url).filter(Boolean);
    if (urls.length > 0) refreshLocalAssets();
    return urls;
  }, [refreshLocalAssets]);

  const uploadAudioFilesForCanvas = useCallback(async (files) => {
    const audioFiles = Array.from(files || []).filter(isSupportedAudioFile);
    if (audioFiles.length === 0) return [];
    const assets = await Promise.all(audioFiles.map(file => uploadAudioFile(file)));
    const urls = assets.map(asset => asset.url).filter(Boolean);
    if (urls.length > 0) refreshLocalAssets();
    return urls;
  }, [refreshLocalAssets]);

  const uploadCanvasFilesForCanvas = useCallback(async (files) => {
    const supportedFiles = Array.from(files || []).filter(file => (
      isSupportedImageFile(file) || isSupportedVideoFile(file) || isSupportedAudioFile(file)
    ));
    const result = { imageAssets: [], videoUrls: [], audioUrls: [] };
    if (supportedFiles.length === 0) return result;

    const failedFiles = [];
    for (const file of supportedFiles) {
      try {
        if (isSupportedImageFile(file)) {
          const assets = await uploadImageAssetsForCanvas([file]);
          if (assets[0]) result.imageAssets.push(assets[0]);
          else failedFiles.push(file);
        } else if (isSupportedVideoFile(file)) {
          const urls = await uploadVideoFilesForCanvas([file]);
          if (urls[0]) result.videoUrls.push(urls[0]);
          else failedFiles.push(file);
        } else {
          const urls = await uploadAudioFilesForCanvas([file]);
          if (urls[0]) result.audioUrls.push(urls[0]);
          else failedFiles.push(file);
        }
      } catch (error) {
        failedFiles.push(file);
        console.warn('右键菜单上传文件失败', error);
      }
    }

    if (failedFiles.length > 0) {
      window.alert(`${failedFiles.length} 个文件上传失败，其余文件已继续放置到画布`);
    }
    return result;
  }, [uploadAudioFilesForCanvas, uploadImageAssetsForCanvas, uploadVideoFilesForCanvas]);

  const handlePaneUploadFiles = useCallback(async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    const supportedFiles = files.filter(file => (
      isSupportedImageFile(file) || isSupportedVideoFile(file) || isSupportedAudioFile(file)
    ));
    if (supportedFiles.length === 0) {
      window.alert(`文件格式不支持。图片支持 ${SUPPORTED_IMAGE_LABEL}；视频支持 ${SUPPORTED_VIDEO_LABEL}；音频支持 ${SUPPORTED_AUDIO_LABEL}`);
      return;
    }

    const basePosition = pendingPaneUploadPositionRef.current
      || screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    pendingPaneUploadPositionRef.current = null;

    try {
      const { imageAssets, videoUrls, audioUrls } = await uploadCanvasFilesForCanvas(supportedFiles);
      videoUrls.forEach((videoUrl, index) => {
        createGeneratePair('generateVideo', {
          x: basePosition.x + index * 340,
          y: basePosition.y,
        }, null, {
          videoUrl,
          videoSource: 'upload',
          activate: false,
        });
      });
      audioUrls.forEach((audioUrl, index) => {
        createGeneratePair('generateAudio', {
          x: basePosition.x + (videoUrls.length + index) * 340,
          y: basePosition.y,
        }, null, {
          audioUrl,
          audioSource: 'upload',
          activate: false,
        });
      });
      if (imageAssets.length > 0) {
        createImageNodeGroup(
          imageAssets,
          {
            x: basePosition.x + (videoUrls.length + audioUrls.length) * 340,
            y: basePosition.y,
          },
        );
      }
    } catch (error) {
      console.warn('右键菜单上传文件失败', error);
      window.alert(error?.message || '文件上传失败，请检查后端服务是否正常');
    }
  }, [
    createGeneratePair,
    createImageNodeGroup,
    screenToFlowPosition,
    uploadCanvasFilesForCanvas,
  ]);

  const openPaneUploadAtCanvasCenter = useCallback(() => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    pendingPaneUploadPositionRef.current = screenToFlowPosition({ x: centerX, y: centerY });
    paneUploadInputRef.current?.click();
  }, [screenToFlowPosition]);

  // 粘贴图片 / 文本
  useEffect(() => {
    const handlePaste = (e) => {
      // 节点粘贴后跳过 paste 事件（避免重复处理）
      if (ignoreNextPasteRef.current) {
        ignoreNextPasteRef.current = false;
        return;
      }
      // 节点剪贴板有数据时不处理系统剪贴板
      if (clipboardRef.current?.entries?.length > 0) return;

      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable)) {
        return;
      }

      const selectedNodes = nodesRef.current.filter(n => n.selected);
      const targetNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
      const items = e.clipboardData?.items;

      // ── 粘贴图片到选中的图片节点 ──
      if (targetNode?.data?.resultType === 'generateImage' && items) {
        if (isRunningGenerationNode(targetNode)) return;
        for (const item of items) {
          const file = item.getAsFile();
          if (file && isSupportedImageFile(file)) {
            e.preventDefault();
            const generatorId = pairMap.current[targetNode.id];
            if (generatorId) setGenerating(generatorId, true);
            uploadImageAssetsForCanvas([file]).then((assets) => {
              if (assets.length === 0) return;
              const asset = assets[0];
              const url = asset.url;
              setNodes(nds => nds.map(n => n.id === targetNode.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      imageUrl: url,
                      imageUrls: [url],
                      coverIndex: 0,
                      imageSource: 'upload',
                      ...(asset.imageSize ? { imageSize: asset.imageSize } : {}),
                      ...(asset.mediaAspectRatio ? { mediaAspectRatio: asset.mediaAspectRatio } : {}),
                      ...(asset.imageDimensions ? { imageDimensions: asset.imageDimensions } : {}),
                      ...(asset.imageDimensionsByUrl ? { imageDimensionsByUrl: asset.imageDimensionsByUrl } : {}),
                    },
                    style: asset.style || n.style,
                  }
                : n));
              if (generatorId) {
                setGenerating(generatorId, false);
                onGenerate?.(generatorId, {
                  imageUrl: url,
                  imageUrls: [url],
                  coverIndex: 0,
                  imageSource: 'upload',
                  ...(asset.imageSize ? { imageSize: asset.imageSize } : {}),
                  ...(asset.imageDimensions ? { imageDimensions: asset.imageDimensions } : {}),
                  ...(asset.imageDimensionsByUrl ? { imageDimensionsByUrl: asset.imageDimensionsByUrl } : {}),
                });
              }
            }).catch((error) => {
              console.warn('粘贴图片替换失败', error);
              window.alert(error?.message || '图片替换失败，请检查后端服务');
              if (generatorId) setGenerating(generatorId, false);
            });
            return;
          }
        }
      }

      // ── 粘贴音频到选中的音频节点 ──
      if (targetNode?.data?.resultType === 'generateAudio' && items) {
        if (isRunningGenerationNode(targetNode)) return;
        for (const item of items) {
          const file = item.getAsFile();
          if (file && isSupportedAudioFile(file)) {
            e.preventDefault();
            const generatorId = pairMap.current[targetNode.id];
            if (generatorId) setGenerating(generatorId, true);
            uploadAudioFilesForCanvas([file]).then((urls) => {
              if (urls.length === 0) return;
              const url = urls[0];
              setNodes(nds => nds.map(n => n.id === targetNode.id
                ? { ...n, data: { ...n.data, audioUrl: url, audioSource: 'upload' } }
                : n));
              if (generatorId) {
                setGenerating(generatorId, false);
                onGenerate?.(generatorId, { audioUrl: url, audioSource: 'upload' });
              }
            }).catch((error) => {
              console.warn('粘贴音频替换失败', error);
              window.alert(error?.message || '音频替换失败，请检查后端服务');
              if (generatorId) setGenerating(generatorId, false);
            });
            return;
          }
        }
      }

      // ── 粘贴文本到选中的文本节点 ──
      if (targetNode?.data?.resultType === 'generateText') {
        if (isRunningGenerationNode(targetNode)) return;
        const text = e.clipboardData?.getData('text/plain');
        if (text && text.trim()) {
          e.preventDefault();
          setNodes(nds => nds.map(n => n.id === targetNode.id
            ? { ...n, data: { ...n.data, result: text, textSource: 'manual' } }
            : n));
          const generatorId = pairMap.current[targetNode.id];
          if (generatorId) onGenerate?.(generatorId, { result: text, textSource: 'manual' });
          return;
        }
      }

      // ── 兜底：粘贴到画布新建图片节点 ──
      if (items) {
        for (const item of items) {
          const file = item.getAsFile();
          if (file && isSupportedImageFile(file)) {
            e.preventDefault();
            uploadImageAssetsForCanvas([file]).then((assets) => {
              if (assets.length === 0) return;
              const asset = assets[0];
              const position = screenToFlowPosition({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 100 });
              createGeneratePair('generateImage', position, null, {
                imageUrl: asset.url,
                style: asset.style,
                imageSource: 'upload',
                imageSize: asset.imageSize,
                imageDimensions: asset.imageDimensions,
                imageDimensionsByUrl: asset.imageDimensionsByUrl,
              });
            }).catch((error) => {
              console.warn('粘贴图片上传失败', error);
              window.alert(error?.message || '图片上传失败，请检查后端服务是否正常');
            });
            return;
          }
          if (file && isSupportedAudioFile(file)) {
            e.preventDefault();
            uploadAudioFilesForCanvas([file]).then((urls) => {
              if (urls.length === 0) return;
              const position = screenToFlowPosition({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 75 });
              createGeneratePair('generateAudio', position, null, { audioUrl: urls[0], audioSource: 'upload', activate: false });
            }).catch((error) => {
              console.warn('粘贴音频上传失败', error);
              window.alert(error?.message || '音频上传失败，请检查后端服务是否正常');
            });
            return;
          }
        }
      }

      // ── 兜底：粘贴到画布新建文本节点 ──
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        const position = screenToFlowPosition({ x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 95 });
        createGeneratePair('generateText', position, null, { resultText: text, textSource: 'manual' });
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [screenToFlowPosition, createGeneratePair, uploadAudioFilesForCanvas, uploadImageAssetsForCanvas, setGenerating, setNodes, onGenerate]);

  // 拖拽图片到画布
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleDragOver = (e) => {
      const types = Array.from(e.dataTransfer?.types || []);
      const hasMaterial = types.includes('application/x-ai-canvas-material');
      const hasFiles = Array.from(e.dataTransfer?.types || []).includes('Files');
      if (!hasMaterial && !hasFiles) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e) => {
      const materialPayload = e.dataTransfer?.getData('application/x-ai-canvas-material');
      if (materialPayload) {
        e.preventDefault();
        try {
          const material = JSON.parse(materialPayload);
          const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addMaterialToCanvas(material, position);
        } catch (error) {
          console.warn('无法读取拖拽素材', error);
        }
        return;
      }

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFiles = files.filter(isSupportedImageFile);
      const videoFiles = files.filter(isSupportedVideoFile);
      const audioFiles = files.filter(isSupportedAudioFile);
      if (imageFiles.length === 0 && videoFiles.length === 0 && audioFiles.length === 0) return;
      e.preventDefault();

      const dropPoint = { x: e.clientX, y: e.clientY };
      Promise.all([
        uploadImageAssetsForCanvas(imageFiles),
        uploadVideoFilesForCanvas(videoFiles),
        uploadAudioFilesForCanvas(audioFiles),
      ]).then(([imageAssets, videoUrls, audioUrls]) => {
        const position = screenToFlowPosition(dropPoint);
        videoUrls.forEach((videoUrl, index) => {
          // 本地文件拖入的视频等同于「新建视频节点后上传视频」：
          // 创建 generateVideo 结果节点，并标记 videoSource=upload，避免点击节点时再弹出生成器覆盖用户素材。
          createGeneratePair('generateVideo', {
            x: position.x + index * 340,
            y: position.y,
          }, null, {
            videoUrl,
            videoSource: 'upload',
            activate: false,
          });
        });
        audioUrls.forEach((audioUrl, index) => {
          createGeneratePair('generateAudio', {
            x: position.x + (videoUrls.length + index) * 320,
            y: position.y,
          }, null, {
            audioUrl,
            audioSource: 'upload',
            activate: false,
          });
        });
        if (imageAssets.length > 0) {
          createImageNodeGroup(
            imageAssets,
            videoUrls.length + audioUrls.length > 0
              ? { x: position.x + videoUrls.length * 340 + audioUrls.length * 320, y: position.y }
              : position
          );
        }
      }).catch((error) => {
        console.warn('拖拽素材上传失败', error);
        window.alert(error?.message || '素材上传失败，请检查后端服务是否正常');
      });
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
    };
  }, [addMaterialToCanvas, screenToFlowPosition, createGeneratePair, createImageNodeGroup, uploadAudioFilesForCanvas, uploadImageAssetsForCanvas, uploadVideoFilesForCanvas]);

  const nodesForRender = useMemo(() => {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const selectedNodeIds = getSelectableSelectedNodeIds(nodes);
    const hasMultiSelection = selectedNodeIds.size > 1;
    const canGroupSelection = nodes.filter(node => (
      node.selected
      && node.type !== 'group'
      && node.type !== 'generator'
      && !node.parentNode
    )).length > 1;
    const shouldHideNodeResize = (node) => (
      isSelectionBoxActive || (hasMultiSelection && selectedNodeIds.has(node.id))
    );
    const incomingSources = new Map();
    const previousImagesCache = new Map();
    const isResultComposerOpen = (node) => {
      if (!activeResultId || node.id !== activeResultId) return false;
      if (!shouldOpenResultComposer(node)) return false;
      const generatorId = pairMap.current[node.id] || node.id.replace('result_', 'generator_');
      return Boolean(nodesById.get(generatorId));
    };
    edges.forEach(edge => {
      const sources = incomingSources.get(edge.target) || [];
      sources.push(edge.source);
      incomingSources.set(edge.target, sources);
    });

    const collectPreviousImages = (nodeId, activePath = new Set()) => {
      if (!nodeId || activePath.has(nodeId)) return [];
      const cached = previousImagesCache.get(nodeId);
      if (cached) return cached;

      const nextPath = new Set(activePath);
      nextPath.add(nodeId);
      const found = [];
      (incomingSources.get(nodeId) || []).forEach(sourceId => {
        const sourceNode = nodesById.get(sourceId);
        if (!sourceNode) return;
        if (sourceNode.type === 'result' && sourceNode.data?.imageUrl) {
          found.push(sourceNode.data.imageUrl);
          if (Array.isArray(sourceNode.data?.imageHistory)) {
            found.push(...sourceNode.data.imageHistory);
          }
        }
        found.push(...collectPreviousImages(sourceId, nextPath));
      });
      previousImagesCache.set(nodeId, found);
      return found;
    };

    const renderedNodes = nodes.filter(node => node.type !== 'generator').map(node => {
      if (node.type === 'group') {
        const minSize = getGroupMinimumSize(node, nodes);
        const isMultiSelected = shouldHideNodeResize(node);
        return getCachedRenderNode(node, [
          node.data?.label || '',
          minSize.width,
          minSize.height,
          isMultiSelected,
          deleteCanvasNode,
          handleRunGroup,
          ungroupNodes,
          openSaveTemplateDialog,
          onGroupResize,
          onGroupNameChange,
        ], () => ({
          ...node,
          zIndex: 0,
          data: {
            ...node.data,
            label: node.data?.label || '未命名组合',
            minWidth: minSize.width,
            minHeight: minSize.height,
            isMultiSelected,
            onDeleteNode: deleteCanvasNode,
            onRunGroup: handleRunGroup,
            onUngroup: ungroupNodes,
            onSaveTemplate: openSaveTemplateDialog,
            onGroupResize,
            onGroupNameChange,
          },
        }));
      }
      if (node.type === 'result' && node.data?.resultType === 'generateImage') {
        const composerOpen = isResultComposerOpen(node);
        const generatorId = pairMap.current[node.id] || node.id.replace('result_', 'generator_');
        const generatorNode = nodesById.get(generatorId);
        const historyImages = [
          ...(Array.isArray(node.data?.imageHistory) ? node.data.imageHistory : []),
          ...(Array.isArray(generatorNode?.data?.connectedImages) ? generatorNode.data.connectedImages : []),
          ...collectPreviousImages(node.id),
        ];
        const previewHistoryImages = [...new Set(
          historyImages.filter(url => url && url !== node.data?.imageUrl)
        )];
        const cachedRenderNode = imageRenderNodeCache.get(node);
        const historyMatches = cachedRenderNode
          && cachedRenderNode.previewHistoryImages.length === previewHistoryImages.length
          && cachedRenderNode.previewHistoryImages.every((url, index) => url === previewHistoryImages[index]);
        if (
          cachedRenderNode?.sourceNode === node
          && cachedRenderNode.generatorNode === generatorNode
          && cachedRenderNode.onResultNodeDragByScreenDelta === onResultNodeDragByScreenDelta
          && cachedRenderNode.onResultImageUpload === onResultImageUpload
          && cachedRenderNode.onResultImageDimensionsChange === onResultImageDimensionsChange
          && cachedRenderNode.composerOpen === composerOpen
          && cachedRenderNode.isMultiSelected === shouldHideNodeResize(node)
          && historyMatches
        ) {
          return cachedRenderNode.renderNode;
        }

        const renderNode = {
          ...node,
          zIndex: Math.max(node.zIndex || 0, 2),
          data: {
            ...node.data,
            label: node.data?.label || '图片',
            onResultNodeDragByScreenDelta,
            onResultImageUpload,
            onResultImageDimensionsChange,
            previewHistoryImages,
            isComposerOpen: composerOpen,
            isMultiSelected: shouldHideNodeResize(node),
          },
        };
        imageRenderNodeCache.set(node, {
          sourceNode: node,
          generatorNode,
          previewHistoryImages,
          onResultNodeDragByScreenDelta,
          onResultImageUpload,
          onResultImageDimensionsChange,
          composerOpen,
          isMultiSelected: shouldHideNodeResize(node),
          renderNode,
        });
        return renderNode;
      }
      if (node.type === 'result' && node.data?.resultType === 'generateVideo') {
        const isMultiSelected = shouldHideNodeResize(node);
        const composerOpen = isResultComposerOpen(node);
        return getCachedRenderNode(node, [
          node.data?.label || '',
          composerOpen,
          isMultiSelected,
          onResultVideoUpload,
          onResultVideoDimensionsChange,
          onVideoQuickTrimChange,
          createVideoEditorFromResult,
          onCaptureVideoFrame,
          node.zIndex || 0,
        ], () => ({
          ...node,
          zIndex: Math.max(node.zIndex || 0, 2),
          data: {
            ...node.data,
            label: node.data?.label || '视频',
            onResultVideoUpload,
            onResultVideoDimensionsChange,
            onVideoQuickTrimChange,
            onCreateVideoEditorFromResult: createVideoEditorFromResult,
            onCaptureVideoFrame: onCaptureVideoFrame,
            isComposerOpen: composerOpen,
            isMultiSelected,
          },
        }));
      }
      if (node.type === 'result' && node.data?.resultType === 'generateStoryboardScript') {
        const { height, minHeight, ...styleWithoutFixedHeight } = node.style || {};
        void height;
        void minHeight;
        const isMultiSelected = shouldHideNodeResize(node);
        return getCachedRenderNode(node, [
          node.style,
          isMultiSelected,
          node.zIndex || 0,
        ], () => ({
          ...node,
          zIndex: Math.max(node.zIndex || 0, 2),
          style: {
            ...styleWithoutFixedHeight,
            height: 'auto',
          },
          data: {
            ...node.data,
            isMultiSelected,
          },
        }));
      }
      if (node.type === 'result' && node.data?.resultType === 'generateText') {
        const composerOpen = isResultComposerOpen(node);
        const label = resolveResultNodeLabel('generateText', node.data?.label);
        const isMultiSelected = shouldHideNodeResize(node);
        return getCachedRenderNode(node, [
          label,
          composerOpen,
          isMultiSelected,
          canGroupSelection,
          onResultTextChange,
          onResultTextEditingChange,
          duplicateNodeFromToolbar,
          groupSelectionFromToolbar,
          node.zIndex || 0,
        ], () => (
          node.data?.label === label
            && node.data?.onResultTextChange === onResultTextChange
            && node.data?.onDuplicateNode === duplicateNodeFromToolbar
            && node.data?.onGroupSelection === groupSelectionFromToolbar
            && Boolean(node.data?.canGroupSelection) === canGroupSelection
            && Boolean(node.data?.isComposerOpen) === composerOpen
            && Boolean(node.data?.isMultiSelected) === isMultiSelected
            && (node.zIndex || 0) >= 2
            ? node
            : {
                ...node,
                zIndex: Math.max(node.zIndex || 0, 2),
                data: {
                  ...node.data,
                  label,
                  onResultTextChange,
                  onTextEditingChange: onResultTextEditingChange,
                  onDuplicateNode: duplicateNodeFromToolbar,
                  onGroupSelection: groupSelectionFromToolbar,
                  canGroupSelection,
                  isComposerOpen: composerOpen,
                  isMultiSelected,
                },
              }
        ));
      }
      if (node.type === 'videoInput') {
        const isMultiSelected = shouldHideNodeResize(node);
        return getCachedRenderNode(node, [
          isMultiSelected,
          node.zIndex || 0,
        ], () => ({
          ...node,
          zIndex: Math.max(node.zIndex || 0, 2),
          data: {
            ...node.data,
            isMultiSelected,
          },
        }));
      }
      const isMultiSelected = shouldHideNodeResize(node);
      return getCachedRenderNode(node, [
        node.type,
        isMultiSelected,
        node.zIndex || 0,
      ], () => ({
        ...node,
        zIndex: Math.max(node.zIndex || 0, 2),
        data: {
          ...node.data,
          isMultiSelected,
        },
      }));
    });
    return renderedNodes;
  }, [activeResultId, createVideoEditorFromResult, deleteCanvasNode, duplicateNodeFromToolbar, edges, getGroupMinimumSize, groupSelectionFromToolbar, handleRunGroup, isSelectionBoxActive, nodes, onCaptureVideoFrame, onGroupNameChange, onGroupResize, onResultImageDimensionsChange, onResultImageUpload, onResultNodeDragByScreenDelta, onResultTextChange, onResultTextEditingChange, onResultVideoDimensionsChange, onResultVideoUpload, onVideoQuickTrimChange, openSaveTemplateDialog, ungroupNodes]);

  // 组合背景、连线、内容节点依次位于 0/1/2 层。连线不会再被组合色块遮挡，
  // 同时实际节点和节点里的交互圆点仍稳定显示在线条之上。
  const edgesForRender = useMemo(() => (
    edges.map(edge => ({
      ...edge,
      zIndex: Math.max(edge.zIndex || 0, 1),
    }))
  ), [edges]);

  const activeComposer = useMemo(() => {
    if (!activeResultId) return null;
    if (expandedResultId === activeResultId) return null;
    const resultNode = nodes.find(node => node.id === activeResultId && node.type === 'result');
    const generatorId = pairMap.current[activeResultId]
      || activeResultId.replace('result_', 'generator_');
    const generatorNode = generatorId
      ? nodes.find(node => node.id === generatorId && node.type === 'generator')
      : null;
    if (!resultNode || !generatorNode) return null;
    if (!shouldOpenResultComposer(resultNode)) return null;
    const storedGenerationConfig = resultNode.data?.generationConfig;
    const legacyRatio = getClosestRatioLabel(resultNode.data?.mediaAspectRatio);
    const legacyGenerationConfig = resultNode.data?.resultType === 'generateVideo' && legacyRatio
      ? { video_aspect_ratio: legacyRatio }
      : resultNode.data?.resultType === 'generateImage' && resultNode.data?.imageSize
        ? { image_size: resultNode.data.imageSize }
        : null;
    const generationConfig = storedGenerationConfig || legacyGenerationConfig;

    return {
      resultId: resultNode.id,
      resultAnchor: {
        position: getAbsoluteNodePosition(resultNode, nodes),
        width: getNodeWidth(resultNode),
        height: getNodeHeight(resultNode),
      },
      generatorNode: generationConfig && typeof generationConfig === 'object'
        ? {
            ...generatorNode,
            data: {
              ...mergeGeneratorComposerData(generatorNode.data, generationConfig),
              avatarPackages: certifiedAvatarPackages,
              avatarAssets: certifiedAvatarAssets,
            },
          }
      : {
          ...generatorNode,
          data: {
            ...generatorNode.data,
            avatarPackages: certifiedAvatarPackages,
            avatarAssets: certifiedAvatarAssets,
          },
        },
    };
  }, [activeResultId, certifiedAvatarAssets, certifiedAvatarPackages, expandedResultId, getAbsoluteNodePosition, nodes]);

  const activeCharacterImageComposer = useMemo(() => {
    if (!activeCharacterImageNodeId) return null;
    const characterNode = nodes.find(node => node.id === activeCharacterImageNodeId && node.type === 'character');
    if (!characterNode) return null;
    const characterData = characterNode.data || {};
    const characterPayload = characterData.characterPayload || buildCharacterPayloadFromData(characterData);
    const characterName = characterPayload.characterName || characterData.characterName || characterData.label || '角色';
    const description = characterPayload.description || characterData.description || '';
    const voiceDescription = characterPayload.voiceDescription || characterData.voiceDescription || '';
    const imageTarget = activeCharacterImageTarget === 'threeView' ? 'threeView' : 'mainVisual';
    const configKey = getCharacterImageTargetConfigKey(imageTarget);
    const storedConfig = characterData[configKey]
      || characterPayload[configKey]
      || (
        (characterData.characterImageGeneratorConfig?.characterImageTarget || 'mainVisual') === imageTarget
          ? characterData.characterImageGeneratorConfig
          : null
      )
      || (
        (characterPayload.characterImageGeneratorConfig?.characterImageTarget || 'mainVisual') === imageTarget
          ? characterPayload.characterImageGeneratorConfig
          : null
      )
      || {};
    const enabledImageProviders = getEnabledProvidersWithModels(runtimeSettings.providers, 'image')
      .filter(provider => provider?.baseUrl && provider?.apiKey);
    const activeProvider = enabledImageProviders.find(provider => provider.id === runtimeSettings.activeProviderId);
    const provider = activeProvider || enabledImageProviders[0] || null;
    const model = storedConfig.image_model || getDefaultProviderModel(provider, 'image') || provider?.defaultImageModel || '';
    const fallbackPrompt = imageTarget === 'threeView'
      ? buildCharacterThreeViewPrompt({
          characterName,
          description,
          mainVisualPrompt: characterPayload.mainVisualPrompt || '',
        })
      : buildCharacterImagePrompt({ characterName, description, voiceDescription });
    const storedPrompt = storedConfig.image_prompt || storedConfig.promptDraft || '';
    const storedThreeViewPrompt = characterPayload.threeViewPrompt || storedPrompt;
    const prompt = imageTarget === 'threeView'
      ? (isLikelyThreeViewCharacterPrompt(storedThreeViewPrompt) ? storedThreeViewPrompt : fallbackPrompt)
      : (storedPrompt || characterPayload.mainVisualPrompt || fallbackPrompt);
    const upstreamContext = getCharacterUpstreamContext(activeCharacterImageNodeId);
    const profileConfig = characterData.characterProfileGeneratorConfig
      || characterPayload.characterProfileGeneratorConfig
      || {};
    const profileConnectedImages = normalizeImageList(profileConfig.connectedImages || []);
    const profileUploadedReferenceImages = normalizeImageList(profileConfig.uploadedReferenceImages || [])
      .filter(url => !profileConnectedImages.includes(url));
    const profileReferenceImages = normalizeImageList([
      ...profileConnectedImages,
      ...profileUploadedReferenceImages,
    ]);
    const mainVisualImageUrl = characterPayload.mainVisualImageUrl
      || characterPayload.imageUrl
      || (Array.isArray(characterPayload.images) ? characterPayload.images[0] : '')
      || characterData.imageUrl
      || '';
    const connectedReferenceImages = normalizeImageList([
      ...(profileReferenceImages.length > 0 ? profileConnectedImages : upstreamContext.images || []),
      ...(imageTarget === 'threeView' ? [mainVisualImageUrl] : []),
    ]);
    const inheritedUploadedReferenceImages = imageTarget === 'mainVisual' ? profileUploadedReferenceImages : [];
    const generatorId = getCharacterImageGeneratorId(activeCharacterImageNodeId, imageTarget);
    const defaultImageSize = imageTarget === 'mainVisual' ? '3:4' : '16:9';
    const generationTask = characterData.imageGenerationTarget === imageTarget
      ? characterData.imageGenerationTask || characterData.generationTask || null
      : null;

    return {
      resultId: activeCharacterImageNodeId,
      generatorNode: {
        id: generatorId,
        type: 'generator',
        data: {
          pairedResultId: activeCharacterImageNodeId,
          generatorType: 'generateImage',
          apiConfigs,
          apiProviders: runtimeSettings.providers,
          allowedModels: runtimeSettings.allowedModels,
          activeProviderId: runtimeSettings.activeProviderId,
          maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens),
          promptStyles: officialPromptStyles,
          promptDraft: prompt,
          image_prompt: prompt,
          image_negative_prompt: resolveImageNegativePrompt(storedConfig.image_negative_prompt),
          image_size: imageTarget === 'mainVisual' ? '3:4' : storedConfig.image_size || defaultImageSize,
          image_size_preset: imageTarget === 'mainVisual'
            ? getDefaultImageRatioPresetId('3:4')
            : storedConfig.image_size_preset || getDefaultImageRatioPresetId(defaultImageSize),
          image_resolution: imageTarget === 'mainVisual' ? '2k' : storedConfig.image_resolution || '1k',
          image_count: imageTarget === 'mainVisual' ? 1 : storedConfig.image_count || 1,
          fixedImageSettings: imageTarget === 'mainVisual'
            ? {
                image_size: '3:4',
                image_size_preset: getDefaultImageRatioPresetId('3:4'),
                image_resolution: '2k',
                image_count: 1,
                hideSettings: true,
              }
            : null,
          image_model: model,
          image_api_id: storedConfig.image_api_id || provider?.id || '',
          characterImageTarget: imageTarget,
          connectedPrompt: (upstreamContext.textReferences || []).join('\n\n'),
          connectedTextReferences: upstreamContext.textReferences || [],
          connectedImages: connectedReferenceImages,
          connectedVideos: [],
          uploadedReferenceImages: imageTarget === 'mainVisual'
            ? uniqueValues([
                ...inheritedUploadedReferenceImages,
                ...(storedConfig.uploadedReferenceImages || []),
              ])
            : storedConfig.uploadedReferenceImages || [],
          generationTask,
          lastGenerationError: characterData.imageGenerationTarget === imageTarget ? characterData.imageGenerationError || '' : '',
          onGeneratorDataChange: onCharacterImageGeneratorDataChange,
          onRunImageGeneration: runCharacterImageGeneration,
          onCancelGeneration: cancelCharacterImageGeneration,
        },
      },
    };
  }, [
    activeCharacterImageNodeId,
    activeCharacterImageTarget,
    apiConfigs,
    cancelCharacterImageGeneration,
    getCharacterUpstreamContext,
    nodes,
    officialPromptStyles,
    onCharacterImageGeneratorDataChange,
    runCharacterImageGeneration,
    runtimeSettings.activeProviderId,
    runtimeSettings.allowedModels,
    runtimeSettings.maxTextTokens,
    runtimeSettings.providers,
  ]);

  const activeCharacterProfileComposer = useMemo(() => {
    if (!activeCharacterProfileNodeId) return null;
    const characterNode = nodes.find(node => node.id === activeCharacterProfileNodeId && node.type === 'character');
    if (!characterNode) return null;
    const characterData = characterNode.data || {};
    const characterPayload = characterData.characterPayload || buildCharacterPayloadFromData(characterData);
    const profileConfig = characterData.characterProfileGeneratorConfig
      || characterPayload.characterProfileGeneratorConfig
      || {};
    const upstreamContext = getCharacterUpstreamContext(activeCharacterProfileNodeId);
    const enabledTextProviders = getEnabledProvidersWithModels(runtimeSettings.providers, 'text')
      .filter(provider => provider?.baseUrl && provider?.apiKey);
    const activeProvider = enabledTextProviders.find(provider => provider.id === runtimeSettings.activeProviderId);
    const provider = activeProvider || enabledTextProviders[0] || null;
    const model = profileConfig.model_name
      || profileConfig.text_model_name
      || getDefaultProviderModel(provider, 'text')
      || provider?.defaultTextModel
      || '';
    const generatorId = getCharacterProfileGeneratorId(activeCharacterProfileNodeId);
    const profileGenerationTask = profileConfig.generationTask || null;
    const profileGenerationTaskStatus = getGenerationConfigStatus(profileConfig);
    const runtimeProfileTask = generationTasksRef.current[generatorId];
    const isStaleRunningProfileTask = GENERATION_RUNNING_STATUSES.has(profileGenerationTaskStatus)
      && (!runtimeProfileTask || runtimeProfileTask.id !== profileGenerationTask?.id || runtimeProfileTask.status !== 'running');
    const userPrompt = profileConfig.user_prompt
      || profileConfig.promptDraft
      || DEFAULT_CHARACTER_PROFILE_PROMPT;

    return {
      resultId: activeCharacterProfileNodeId,
      generatorNode: {
        id: generatorId,
        type: 'generator',
        data: {
          pairedResultId: activeCharacterProfileNodeId,
          generatorType: 'generateText',
          apiConfigs,
          apiProviders: runtimeSettings.providers,
          allowedModels: runtimeSettings.allowedModels,
          activeProviderId: runtimeSettings.activeProviderId,
          maxTextTokens: normalizeMaxTextTokens(runtimeSettings.maxTextTokens),
          promptStyles: officialPromptStyles,
          promptDraft: userPrompt,
          user_prompt: userPrompt,
          system_prompt: profileConfig.system_prompt || CHARACTER_PROFILE_SYSTEM_PROMPT,
          model_name: model,
          text_model_name: model,
          text_api_id: profileConfig.text_api_id || provider?.id || '',
          temperature: profileConfig.temperature ?? 0.7,
          connectedPrompt: (upstreamContext.textReferences || []).join('\n\n'),
          connectedTextReferences: upstreamContext.textReferences || [],
          connectedImages: upstreamContext.images || [],
          connectedVideos: [],
          uploadedReferenceImages: profileConfig.uploadedReferenceImages || [],
          generationTask: isStaleRunningProfileTask ? null : profileGenerationTask,
          lastGenerationError: profileConfig.lastGenerationError || '',
          onGeneratorDataChange: onCharacterProfileGeneratorDataChange,
          onRunTextGeneration: runCharacterProfileGeneration,
          onCancelGeneration: cancelCharacterProfileGeneration,
        },
      },
    };
  }, [
    activeCharacterProfileNodeId,
    apiConfigs,
    cancelCharacterProfileGeneration,
    getCharacterUpstreamContext,
    nodes,
    officialPromptStyles,
    onCharacterProfileGeneratorDataChange,
    runCharacterProfileGeneration,
    runtimeSettings.activeProviderId,
    runtimeSettings.allowedModels,
    runtimeSettings.maxTextTokens,
    runtimeSettings.providers,
  ]);

  const activeSmartSplitter = useMemo(() => {
    if (!activeSmartSplitterId) return null;
    return nodes.find(node => node.id === activeSmartSplitterId && node.type === 'smartSplitter') || null;
  }, [activeSmartSplitterId, nodes]);

  useEffect(() => {
    if (!expandedProcessorOverlay) return;
    if (expandedProcessorOverlay.type === 'composer' && activeComposer?.resultId !== expandedProcessorOverlay.id) {
      setExpandedProcessorOverlay(null);
      return;
    }
    if (expandedProcessorOverlay.type === 'smartSplitter' && activeSmartSplitter?.id !== expandedProcessorOverlay.id) {
      setExpandedProcessorOverlay(null);
      return;
    }
    if (expandedProcessorOverlay.type === 'characterImage' && activeCharacterImageComposer?.resultId !== expandedProcessorOverlay.id) {
      setExpandedProcessorOverlay(null);
      return;
    }
    if (expandedProcessorOverlay.type === 'characterProfile' && activeCharacterProfileComposer?.resultId !== expandedProcessorOverlay.id) {
      setExpandedProcessorOverlay(null);
    }
  }, [activeCharacterImageComposer?.resultId, activeCharacterProfileComposer?.resultId, activeComposer?.resultId, activeSmartSplitter?.id, expandedProcessorOverlay]);

  const activeVideoEditor = useMemo(() => {
    if (!activeVideoEditorNodeId) return null;
    const node = nodes.find(item => item.id === activeVideoEditorNodeId && item.type === 'videoEditor');
    if (!node) return null;
    return {
      node,
      sources: buildVideoEditorSources(node.id, nodes, edges),
    };
  }, [activeVideoEditorNodeId, edges, nodes]);

  const renderedMenuPosition = useMemo(() => {
    if (!menu) return null;
    const isPaneMenu = menu.items === PANE_CONTEXT_MENU;
    const isDragCreateMenu = menu.items === NODE_CREATE_MENU;
    const menuWidth = isPaneMenu || isDragCreateMenu ? 220 : 184;
    const menuColumns = menu.items.some(item => item.children) ? 2 : 1;
    const dividerHeight = menu.items.filter(item => item.dividerBefore).length * 9;
    const titleHeight = isDragCreateMenu ? 40 : 0;
    const menuHeight = 20 + titleHeight + menu.items.length * 40 + dividerHeight;
    return {
      x: Math.max(8, Math.min(menu.x, window.innerWidth - menuWidth * menuColumns - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - menuHeight - 8)),
    };
  }, [menu]);

  // 用原生事件绑定绕过 Chrome passive wheel 限制
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const handler = (e) => handleCanvasWheelCapture(e);
    el.addEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => el.removeEventListener('wheel', handler, CANVAS_WHEEL_LISTENER_OPTIONS);
  }, [handleCanvasWheelCapture]);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return undefined;
    const preventBrowserGestureZoom = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener('gesturestart', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    el.addEventListener('gesturechange', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => {
      el.removeEventListener('gesturestart', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
      el.removeEventListener('gesturechange', preventBrowserGestureZoom, CANVAS_WHEEL_LISTENER_OPTIONS);
    };
  }, []);

  return (
    <>
      <div
        ref={canvasContainerRef}
        className={`canvas-flow-shell${isSpacePanning ? ' space-panning' : ''}${copilotPickingNode ? ' copilot-picking-node' : ''}${copilotOpen ? ' copilot-open' : ''}`}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onClickCapture={handleCanvasClickCapture}
      >
        <CanvasHoverGlow rootRef={canvasContainerRef} />
        <CanvasFlowHoverBorder />
        <CanvasDotGrid viewportTransform={viewportTransform} />
        <ReactFlow
          nodes={nodesForRender}
          edges={edgesForRender}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          nodeTypes={stableNodeTypesRef.current}
          edgeTypes={stableEdgeTypesRef.current}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          zoomOnDoubleClick={false}
          panOnDrag={isSpacePanning ? true : [1]}
          panActivationKeyCode={null}
          panOnScroll
          nodesDraggable={!isSpacePanning}
          nodesConnectable={!isSpacePanning}
          elementsSelectable={!isSpacePanning}
          minZoom={CANVAS_MIN_ZOOM}
          maxZoom={CANVAS_MAX_ZOOM}
          selectionOnDrag={!isSpacePanning}
          selectNodesOnDrag={!isSpacePanning}
          selectionMode={SelectionMode.Partial}
          zoomOnPinch
          zoomActivationKeyCode={['Control', 'Meta']}
          snapToGrid={snapEnabled}
          snapGrid={[20, 20]}
          multiSelectionKeyCode={['Shift']}
          deleteKeyCode={activeVideoEditorNodeId ? null : undefined}
          proOptions={{ hideAttribution: true }}
          defaultViewport={initialViewport}
          fitView={!initialViewport}
          onlyRenderVisibleElements
        >
          {miniMapAvailable && miniMapOpen && (
            <MiniMap
              position="bottom-left"
              className="canvas-minimap"
              bgColor="var(--minimap-bg)"
              maskColor="var(--minimap-mask)"
              pannable
              zoomable
              nodeColor={(node) => {
                const t = node.type;
                if (t === 'result') return '#22c55e';
                if (t === 'videoInput') return '#f97316';
                if (t === 'videoEditor') return '#06b6d4';
                if (t === 'product') return '#a855f7';
                if (t === 'prompt') return '#60a5fa';
                return 'var(--fg-tertiary)';
              }}
            />
          )}
        </ReactFlow>
        {nodes.length === 0 && (
          <div className="canvas-empty-state" aria-label="Empty canvas starter actions">
            <div className="canvas-empty-state-heading">
              <span className="canvas-empty-state-hint">
                <Icon name="cursor" size={20} />
                <strong>Double-click canvas</strong>
              </span>
              <span className="canvas-empty-state-subtitle">Create freely on the canvas</span>
            </div>
            <div className="canvas-empty-state-actions">
              <button type="button" onClick={() => handleEmptyCanvasAction('text-to-video')}>
                <Icon name="videoGenFill" size={20} />
                <span>Text to video</span>
              </button>
              <button type="button" onClick={() => handleEmptyCanvasAction('replace-background')}>
                <Icon name="imageGenFill" size={20} />
                <span>Replace background</span>
              </button>
              <button type="button" onClick={() => handleEmptyCanvasAction('first-last-frame')}>
                <Icon name="imageGenFill" size={20} />
                <span>First &amp; last frame</span>
              </button>
              <button type="button" onClick={() => handleEmptyCanvasAction('workflows')}>
                <Icon name="apps" size={20} />
                <span>My workflows</span>
              </button>
            </div>
          </div>
        )}
        {alignmentGuides && alignmentGuides.guides.length > 0 && (
          <div
            className="alignment-guides-overlay"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
              zIndex: 10,
              overflow: 'hidden',
            }}
          >
            {alignmentGuides.guides.map(g => {
              const zoom = viewportTransform?.[2] || 1;
              const vx = viewportTransform?.[0] || 0;
              const vy = viewportTransform?.[1] || 0;
              if (g.type === 'v') {
                const sx = g.x1 * zoom + vx;
                const sy = g.y1 * zoom + vy;
                const sh = (g.y2 - g.y1) * zoom;
                return (
                  <div
                    key={g.key}
                    style={{
                      position: 'absolute',
                      left: sx,
                      top: sy,
                      width: '1px',
                      height: sh,
                      background: 'var(--accent)',
                      opacity: 0.6,
                    }}
                  />
                );
              }
              const sx = g.x1 * zoom + vx;
              const sy = g.y1 * zoom + vy;
              const sw = (g.x2 - g.x1) * zoom;
              return (
                <div
                  key={g.key}
                  style={{
                    position: 'absolute',
                    left: sx,
                    top: sy,
                    width: sw,
                    height: '1px',
                    background: 'var(--accent)',
                    opacity: 0.6,
                  }}
                />
              );
            })}
          </div>
        )}
        {activeComposer && (
          <CanvasComposerOverlay
            resultId={activeComposer.resultId}
            generatorNode={activeComposer.generatorNode}
            resultAnchor={activeComposer.resultAnchor}
            containerRef={canvasContainerRef}
            overlayBoundaryRef={activeComposerOverlayRef}
            nodesRevision={nodes}
            viewportRevision={viewportTransform}
            promptStyles={officialPromptStyles}
            hidden={expandedProcessorOverlay?.type === 'composer'}
            onExpand={() => setExpandedProcessorOverlay({ type: 'composer', id: activeComposer.resultId })}
          />
        )}
        {activeCharacterImageComposer && (
          <CanvasComposerOverlay
            resultId={activeCharacterImageComposer.resultId}
            generatorNode={activeCharacterImageComposer.generatorNode}
            containerRef={canvasContainerRef}
            overlayBoundaryRef={activeComposerOverlayRef}
            nodesRevision={nodes}
            viewportRevision={viewportTransform}
            anchorSelector={activeCharacterImageComposer.anchorSelector}
            promptStyles={officialPromptStyles}
            hidden={expandedProcessorOverlay?.type === 'characterImage'}
            onExpand={() => setExpandedProcessorOverlay({ type: 'characterImage', id: activeCharacterImageComposer.resultId })}
          />
        )}
        {activeCharacterProfileComposer && (
          <CanvasComposerOverlay
            resultId={activeCharacterProfileComposer.resultId}
            generatorNode={activeCharacterProfileComposer.generatorNode}
            containerRef={canvasContainerRef}
            overlayBoundaryRef={activeComposerOverlayRef}
            nodesRevision={nodes}
            viewportRevision={viewportTransform}
            anchorSelector={activeCharacterProfileComposer.anchorSelector}
            promptStyles={officialPromptStyles}
            hidden={expandedProcessorOverlay?.type === 'characterProfile'}
            onExpand={() => setExpandedProcessorOverlay({ type: 'characterProfile', id: activeCharacterProfileComposer.resultId })}
          />
        )}
        {activeSmartSplitter && (
          <CanvasSmartSplitterOverlay
            splitterNode={activeSmartSplitter}
            containerRef={canvasContainerRef}
            overlayBoundaryRef={activeSmartSplitterOverlayRef}
            promptStyles={officialPromptStyles}
            hidden={expandedProcessorOverlay?.type === 'smartSplitter'}
            onExpand={() => setExpandedProcessorOverlay({ type: 'smartSplitter', id: activeSmartSplitter.id })}
          />
        )}
        <CanvasProcessorExpandedDialog
          open={Boolean(expandedProcessorOverlay)}
          type={expandedProcessorOverlay?.type === 'smartSplitter' ? 'smartSplitter' : 'composer'}
          composer={expandedProcessorOverlay?.type === 'characterImage'
            ? activeCharacterImageComposer
            : expandedProcessorOverlay?.type === 'characterProfile'
              ? activeCharacterProfileComposer
              : activeComposer}
          splitterNode={activeSmartSplitter}
          promptStyles={officialPromptStyles}
          overlayBoundaryRef={expandedProcessorOverlayRef}
          onClose={() => setExpandedProcessorOverlay(null)}
        />
      </div>

      <CanvasMaterialDrawer
        open={materialDrawerOpen}
        mode="materials"
        materials={materials || []}
        materialGroups={materialGroups || []}
        workflowTemplates={workflowTemplates || []}
        officialTemplates={officialTemplates}
        onClose={() => setMaterialDrawerOpen(false)}
        onAddMaterial={material => addMaterialToCanvas(material)}
        onAddTemplate={addWorkflowTemplateToCanvas}
        onAddOfficialTemplate={addOfficialTemplateToCanvas}
        onUpdateTemplate={(templateId, patch) => {
          setWorkflowTemplates?.(current => current.map(template => (
            template.id === templateId
              ? { ...template, ...patch, updatedAt: new Date().toISOString() }
              : template
          )));
        }}
        onDeleteTemplate={templateId => {
          setWorkflowTemplates?.(current => current.filter(template => template.id !== templateId));
        }}
      />
      <CanvasMaterialDrawer
        open={characterDrawerOpen}
        mode="characters"
        materials={materials || []}
        workflowTemplates={workflowTemplates || []}
        onClose={() => setCharacterDrawerOpen(false)}
        onAddMaterial={material => addMaterialToCanvas(material)}
      />
      <CanvasTemplateRunnerDrawer
        open={templateRunnerOpen}
        workflowTemplates={workflowTemplates || []}
        onClose={() => setTemplateRunnerOpen(false)}
        onRunTemplate={runWorkflowTemplateFromRunner}
      />
      <TaskCenterDrawer
        open={taskCenterOpen}
        onClose={() => setTaskCenterOpen(false)}
        projectId={projectId}
        onLocateNode={(nodeId) => {
          fitView({ nodes: [{ id: nodeId }], duration: 800, minZoom: 0.5, maxZoom: 1.5 });
        }}
      />
      <CanvasCopilotDrawer
        open={copilotOpen}
        onClose={() => {
          setCopilotOpen(false);
          setCopilotPickingNode(false);
        }}
        tools={copilotTools}
        modelOptions={copilotModelOptions}
        nodeTargets={copilotTargetNodes}
        pickingCanvasNode={copilotPickingNode}
        onToggleCanvasPicker={toggleCopilotNodePicker}
        onRemoveNodeTarget={removeCopilotTargetNode}
        onFocusNodeTarget={focusCopilotTargetNode}
      />

      <NodeSearchDialog
        open={nodeSearchOpen}
        onClose={() => setNodeSearchOpen(false)}
        onSelectNode={handleNodeSearchSelect}
      />

      <CanvasBottomToolbar
        materialOpen={materialDrawerOpen}
        characterOpen={characterDrawerOpen}
        appsOpen={templateRunnerOpen}
        onUploadFiles={openPaneUploadAtCanvasCenter}
        onOpenFeedback={openFeedbackForm}
        onOpenNodeSearch={() => {
          setNodeSearchOpen(true);
          setMenu(null);
          setMaterialDrawerOpen(false);
          setCharacterDrawerOpen(false);
          setTaskCenterOpen(false);
          setTemplateRunnerOpen(false);
          setCopilotOpen(false);
          setCopilotPickingNode(false);
        }}
        onToggleMaterials={() => {
          setMaterialDrawerOpen(open => !open);
          setCharacterDrawerOpen(false);
          setTaskCenterOpen(false);
          setTemplateRunnerOpen(false);
          setCopilotOpen(false);
          setCopilotPickingNode(false);
        }}
        onToggleCharacters={() => {
          setCharacterDrawerOpen(open => !open);
          setMaterialDrawerOpen(false);
          setTaskCenterOpen(false);
          setTemplateRunnerOpen(false);
          setCopilotOpen(false);
          setCopilotPickingNode(false);
        }}
        onToggleApps={() => {
          setTemplateRunnerOpen(open => !open);
          setMaterialDrawerOpen(false);
          setCharacterDrawerOpen(false);
          setTaskCenterOpen(false);
          setCopilotOpen(false);
          setCopilotPickingNode(false);
        }}
        onAddNode={(type) => addNode(type, screenToFlowPosition({
          x: (canvasContainerRef.current?.getBoundingClientRect()?.left || 0) + (canvasContainerRef.current?.getBoundingClientRect()?.width || window.innerWidth) / 2,
          y: (canvasContainerRef.current?.getBoundingClientRect()?.top || 0) + (canvasContainerRef.current?.getBoundingClientRect()?.height || window.innerHeight) / 2,
        }), {}, { selected: false, activate: false })}
      />
      <button
        type="button"
        className={`canvas-copilot-launcher ${copilotOpen ? 'active' : ''}`}
        onClick={() => {
          const opening = !copilotOpen;
          setCopilotOpen(opening);
          setCopilotPickingNode(false);
          setMaterialDrawerOpen(false);
          setCharacterDrawerOpen(false);
          setTaskCenterOpen(false);
          setTemplateRunnerOpen(false);
        }}
        data-tooltip="Copilot"
        aria-label="打开 Copilot"
      >
        <img src={publicAsset('canvas-agent-mascot.png')} alt="" aria-hidden="true" />
      </button>
      <CanvasZoomControls
        scale={viewportTransform ? viewportTransform[2] : 1}
        onScaleChange={(newZoom) => {
          const vp = getViewport();
          const container = canvasContainerRef.current;
          const cw = container?.clientWidth || window.innerWidth;
          const ch = container?.clientHeight || window.innerHeight;
          setViewport(getCenteredZoomViewport({
            viewport: vp,
            width: cw,
            height: ch,
            nextZoom: newZoom,
            minZoom: CANVAS_MIN_ZOOM,
            maxZoom: CANVAS_MAX_ZOOM,
          }));
        }}
        onFitView={() => fitView({
          duration: 320,
          padding: 0.18,
          minZoom: CANVAS_MIN_ZOOM,
          maxZoom: CANVAS_MAX_ZOOM,
        })}
        miniMapOpen={miniMapOpen}
        miniMapAvailable={miniMapAvailable}
        onToggleMiniMap={toggleMiniMap}
        snapEnabled={snapEnabled}
        onToggleSnap={toggleSnapEnabled}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
      />
      {optionDragGhost ? (
        <div
          className="option-drag-copy-ghost"
          style={{ left: optionDragGhost.x, top: optionDragGhost.y }}
          aria-hidden="true"
        >
          {optionDragGhost.items?.length > 0 ? (
            optionDragGhost.items.map(item => (
              <div
                key={item.id}
                className={`option-drag-copy-node ${item.className}`}
                style={{
                  width: item.width,
                  height: item.height,
                  transform: `translate(${item.offsetX}px, ${item.offsetY}px)`,
                }}
                dangerouslySetInnerHTML={{ __html: item.html }}
              />
            ))
          ) : (
            <div className="option-drag-copy-fallback">
              {optionDragGhost.count > 1 ? optionDragGhost.count : null}
            </div>
          )}
        </div>
      ) : null}
      <SelectionBoundsOverlay nodes={nodes} onDragCreate={onSelectionDragCreate} />
      <SelectionToolbar
        nodes={nodes}
        onRunSelected={handleRunSelected}
        onGroupSelected={() => {
          const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
          createGroupFromNodeIds(selectedIds);
        }}
        onStackSelected={() => {
          const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
          createStackFromNodeIds(selectedIds);
        }}
        onPlaylistSelected={() => {
          const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
          createPlaylistFromNodeIds(selectedIds);
        }}
        onDownloadSelected={async () => {
          const selected = nodes.filter(n => n.selected);
          const downloadItems = [];
          let downloadableNodeCount = 0;
          for (const node of selected) {
            const nodeItems = getDownloadMediaItemsForNode(node);
            if (nodeItems.length > 0) downloadableNodeCount += 1;
            downloadItems.push(...nodeItems);
          }
          if (downloadItems.length === 0) {
            window.alert('所选节点没有可下载的图片或视频');
            return;
          }
          try {
            const result = await downloadMedia(downloadItems, 'selected-media', {
              zip: downloadableNodeCount > 1 || downloadItems.length > 1,
              zipFilename: `selected-media-${new Date().toISOString().slice(0, 10)}`,
            });
            if (result.downloaded === 0) {
              window.alert('媒体下载失败，请稍后重试');
            }
          } catch (error) {
            console.warn('[downloadSelected] 下载失败', error);
            window.alert('媒体下载失败，请稍后重试');
          }
        }}
        onDeleteSelected={() => {
          const selected = nodes.filter(n => n.selected);
          if (selected.length === 0) return;
          handleNodesChange(selected.map(node => ({ id: node.id, type: 'remove' })));
        }}
      />

      {menu && (
        <>
          {renderedMenuPosition && menu.connectionStart && (
            <svg
              className="canvas-pending-connection"
              viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
              aria-hidden="true"
            >
              {(() => {
                const startX = Number(menu.connectionStart.x);
                const startY = Number(menu.connectionStart.y);
                const endX = Number(menu.x);
                const endY = Number(menu.y);
                if (![startX, startY, endX, endY].every(Number.isFinite)) return null;
                const isRight = endX >= startX;
                const curveOffset = Math.max(60, Math.abs(endX - startX) * 0.5);
                const cp1x = isRight ? startX + curveOffset : startX - curveOffset;
                const cp2x = isRight ? endX - curveOffset : endX + curveOffset;
                return (
                  <path
                    d={`M${startX},${startY} C${cp1x},${startY} ${cp2x},${endY} ${endX},${endY}`}
                  />
                );
              })()}
            </svg>
          )}
          <div
            ref={menuRef}
            className={[
              'context-menu',
              menu.items === PANE_CONTEXT_MENU && 'pane-context-menu',
              menu.items === NODE_CREATE_MENU && 'drag-create-menu',
            ].filter(Boolean).join(' ')}
            style={{ position: 'fixed', left: renderedMenuPosition.x, top: renderedMenuPosition.y, zIndex: 1000 }}
          >
            {menu.items !== PANE_CONTEXT_MENU && (
              <div className="context-menu-title">{menu.parentLabel || '选择操作'}</div>
            )}
            {menu.items.map((item, i) => (
              <Fragment key={`${item.label}_${i}`}>
                {item.dividerBefore && <div className="context-menu-divider" role="separator" />}
                <div
                  className={`context-menu-item ${menu.submenu?.label === item.label ? 'active' : ''}`}
                  onMouseEnter={() => handleMenuHover(item)}
                  onPointerEnter={() => handleMenuHover(item)}
                  onClick={(e) => handleMenuClick(item, e)}
                >
                  <span className="menu-icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className="menu-label">{item.label}</span>
                  {item.children && <span className="menu-arrow">›</span>}
                </div>
              </Fragment>
            ))}
          </div>

          {menu.submenu?.children && (
            <div
              className="context-menu submenu pane-context-menu"
              style={{
                position: 'fixed',
                left: renderedMenuPosition.x + 184,
                top: renderedMenuPosition.y,
                zIndex: 1001,
              }}
            >
              <div className="context-menu-title">{menu.submenu.label}</div>
              {menu.submenu.children.map((item, i) => (
                <Fragment key={`${item.label}_${i}`}>
                  {item.dividerBefore && <div className="context-menu-divider" role="separator" />}
                  <div
                    className="context-menu-item"
                    onClick={(e) => handleMenuClick(item, e)}
                >
                    <span className="menu-icon">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span className="menu-label">{item.label}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </>
      )}

      <input
        ref={paneUploadInputRef}
        className="pane-context-upload-input"
        type="file"
        accept={[SUPPORTED_IMAGE_ACCEPT, SUPPORTED_VIDEO_ACCEPT, SUPPORTED_AUDIO_ACCEPT].join(',')}
        multiple
        onChange={handlePaneUploadFiles}
        tabIndex={-1}
        aria-hidden="true"
      />

      {activeVideoEditor && (
        <VideoEditorDialog
          nodeId={activeVideoEditor.node.id}
          title={activeVideoEditor.node.data?.label || '视频编辑器'}
          sources={activeVideoEditor.sources}
          timeline={activeVideoEditor.node.data?.videoEditorTimeline}
          onClose={() => setActiveVideoEditorNodeId(null)}
          onSave={onVideoEditorTimelineSave}
          onRendered={onVideoEditorRendered}
        />
      )}

      {saveMaterialDraft && (
        <div className="modal-overlay material-save-modal-overlay" onClick={() => setSaveMaterialDraft(null)}>
          <div className="material-edit-dialog" onClick={e => e.stopPropagation()}>
            <div className="material-edit-header">
              <h3>保存到素材</h3>
              <button type="button" className="icon-button" onClick={() => setSaveMaterialDraft(null)}>
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="material-edit-body">
              <div className="material-save-preview">
                {saveMaterialDraft.type === 'video' ? (
                  <video src={saveMaterialDraft.url} muted />
                ) : (
                  <img src={saveMaterialDraft.url} alt="预览" />
                )}
              </div>
              <label>
                素材名称
                <input
                  type="text"
                  value={saveMaterialDraft.name}
                  onChange={e => setSaveMaterialDraft({ ...saveMaterialDraft, name: e.target.value })}
                  placeholder="给素材起个名字"
                />
              </label>
              <label>
                提示词
                <textarea
                  rows={4}
                  value={saveMaterialDraft.prompt}
                  onChange={e => setSaveMaterialDraft({ ...saveMaterialDraft, prompt: e.target.value })}
                  placeholder="为这个素材添加提示词描述..."
                />
              </label>
              <label>
                分组
                <select
                  value={saveMaterialDraft.groupId}
                  onChange={e => setSaveMaterialDraft({ ...saveMaterialDraft, groupId: e.target.value })}
                >
                  {(materialGroups || []).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setSaveMaterialDraft(null)}>取消</button>
              <button className="modal-btn confirm" onClick={confirmSaveMaterial}>保存</button>
            </div>
          </div>
        </div>
      )}

      {storyboardGeneratorTarget && (
        <StoryboardImageGenerator
          initialPrompt={storyboardGeneratorTarget.card?.imagePositivePrompt || ''}
          initialNegativePrompt={storyboardGeneratorTarget.card?.imageNegativePrompt || ''}
          referenceImages={storyboardGeneratorTarget.referenceImages || []}
          apiConfigs={apiConfigs}
          apiProviders={runtimeSettings.providers}
          promptStyles={officialPromptStyles}
          aspectRatio={storyboardGeneratorTarget.card?.aspectRatio || '16:9'}
          cardInfo={{ shotNo: storyboardGeneratorTarget.card?.shotNo, title: storyboardGeneratorTarget.card?.cameraMovement }}
          onClose={() => setStoryboardGeneratorTarget(null)}
          onRun={runStoryboardFrameImageGeneration}
        />
      )}

      {videoWorkbenchNode && (
        <VideoWorkbenchDialog
          node={videoWorkbenchNode}
          onClose={() => setVideoWorkbenchNodeId(null)}
        />
      )}

      {saveTemplateGroupId && (
        <SaveWorkflowTemplateDialog
          key={saveTemplateGroupId}
          open
          initialName={saveTemplateSummary.name}
          nodeCount={saveTemplateSummary.nodeCount}
          edgeCount={saveTemplateSummary.edgeCount}
          saving={saveTemplatePending}
          error={saveTemplateError}
          onClose={() => {
            if (saveTemplatePending) return;
            setSaveTemplateGroupId(null);
            setSaveTemplateError('');
          }}
          onConfirm={confirmSaveWorkflowTemplate}
        />
      )}
    </>
  );
}

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const STORAGE_KEYS = {
  projects: 'ai-canvas.projects',
  apiConfigs: 'ai-canvas.apiConfigs',
  selectedApiId: 'ai-canvas.selectedApiId',
  chatGroups: 'ai-canvas.chatGroups',
  chatSessions: 'ai-canvas.chatSessions',
  materials: 'ai-canvas.materials',
  materialGroups: 'ai-canvas.materialGroups',
  workflowTemplates: 'ai-canvas.workflowTemplates',
};

const LOCALHOST_UPLOAD_URL_RE = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1])(?::\d+)?(\/uploads\/[^?#]+)([?#].*)?$/i;
const MIGRATABLE_IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const MIGRATABLE_IMAGE_DATA_URL_HEADER_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64$/i;

const isMigratableImageDataUrl = (value) => (
  typeof value === 'string' && MIGRATABLE_IMAGE_DATA_URL_RE.test(value)
);

const normalizePortableUploadUrl = (value) => {
  if (typeof value !== 'string') return value;
  const match = value.match(LOCALHOST_UPLOAD_URL_RE);
  return match ? `${match[1]}${match[2] || ''}` : value;
};

const replacePortableLocalUploadUrls = (value, seen = new WeakMap()) => {
  if (typeof value === 'string') {
    return normalizePortableUploadUrl(value);
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    let didChange = false;
    const nextArray = value.map((item) => {
      const nextItem = replacePortableLocalUploadUrls(item, seen);
      didChange = didChange || nextItem !== item;
      return nextItem;
    });
    seen.set(value, didChange ? nextArray : value);
    return didChange ? nextArray : value;
  }

  let didChange = false;
  const nextObject = {};
  seen.set(value, nextObject);

  Object.entries(value).forEach(([key, item]) => {
    const nextItem = replacePortableLocalUploadUrls(item, seen);
    didChange = didChange || nextItem !== item;
    nextObject[key] = nextItem;
  });

  return didChange ? nextObject : value;
};

const dataUrlToImageFile = (dataUrl, index = 0) => {
  const [header, encoded] = dataUrl.split(',');
  const mimeMatch = header.match(MIGRATABLE_IMAGE_DATA_URL_HEADER_RE);

  if (!mimeMatch || !encoded) {
    throw new Error('不支持的历史图片格式');
  }

  const mimeType = mimeMatch[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
  return new File([bytes], `migrated-canvas-image-${index + 1}.${extension}`, { type: mimeType });
};

const collectMigratableImageDataUrls = (value, output = new Set(), seen = new WeakSet()) => {
  if (isMigratableImageDataUrl(value)) {
    output.add(value);
    return output;
  }

  if (!value || typeof value !== 'object') return output;
  if (seen.has(value)) return output;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach(item => collectMigratableImageDataUrls(item, output, seen));
    return output;
  }

  Object.values(value).forEach(item => collectMigratableImageDataUrls(item, output, seen));
  return output;
};

const createDataUrlMigrationMap = async (dataUrls) => {
  const migrationMap = new Map();
  let index = 0;

  for (const dataUrl of dataUrls) {
    const file = dataUrlToImageFile(dataUrl, index);
    const asset = await uploadImageFile(file);

    if (asset?.url) {
      migrationMap.set(dataUrl, asset.url);
    }

    index += 1;
  }

  return migrationMap;
};

const replaceMigratedDataUrls = (value, migrationMap, seen = new WeakMap()) => {
  if (typeof value === 'string') {
    return migrationMap.get(value) || value;
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    let didChange = false;
    const nextArray = value.map((item) => {
      const nextItem = replaceMigratedDataUrls(item, migrationMap, seen);
      didChange = didChange || nextItem !== item;
      return nextItem;
    });
    seen.set(value, didChange ? nextArray : value);
    return didChange ? nextArray : value;
  }

  let didChange = false;
  const nextObject = {};
  seen.set(value, nextObject);

  Object.entries(value).forEach(([key, item]) => {
    const nextItem = replaceMigratedDataUrls(item, migrationMap, seen);
    didChange = didChange || nextItem !== item;
    nextObject[key] = nextItem;
  });

  return didChange ? nextObject : value;
};

const createDefaultProject = (name = 'Untitled') => ({
  id: makeId('project'),
  name,
  updatedAt: new Date().toISOString(),
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

const createDefaultMaterialGroup = () => ({
  id: `material_group_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  name: '默认分组',
  createdAt: new Date().toISOString(),
});

const createDefaultApiConfigs = () => [];

const PROVIDER_PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'apimart', label: 'APIMart' },
  { value: 'rightcode', label: 'Right Code' },
  { value: 'minimax', label: 'MiniMax 官方' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'volcengine', label: '火山引擎' },
  { value: 'runninghub', label: 'RunningHub' },
  { value: 'jimeng', label: '即梦' },
];

const API_MODEL_GROUPS = [
  { key: 'text', title: '文本模型', field: 'textModels', defaultField: 'defaultTextModel' },
  { key: 'image', title: '图片模型', field: 'imageModels', defaultField: 'defaultImageModel' },
  { key: 'video', title: '视频模型', field: 'videoModels', defaultField: 'defaultVideoModel' },
];

const normalizeModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

const isKnownImageOnlyModel = (model = '') => (
  [
    'doubao-seedance-4-0',
    'doubao-seedance-4.0',
    'doubao-seedance-4-5',
    'doubao-seedance-4.5',
  ]
    .includes(String(model).trim().toLowerCase().replaceAll('_', '-'))
);

const inferProtocol = (baseUrl = '') => {
  const url = baseUrl.toLowerCase();
  if (url.includes('apimart')) return 'apimart';
  if (url.includes('rightapi')) return 'rightcode';
  if (url.includes('minimax')) return 'minimax';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (url.includes('volcengine') || url.includes('volces')) return 'volcengine';
  if (url.includes('runninghub')) return 'runninghub';
  return 'openai';
};

const normalizeApiProvider = (api) => {
  if (!api) return api;
  if (api.textModels || api.imageModels || api.videoModels || api.protocol) {
    const textModels = normalizeModelList(api.textModels);
    const storedImageModels = normalizeModelList(api.imageModels);
    const storedVideoModels = normalizeModelList(api.videoModels);
    const misplacedImageModels = storedVideoModels.filter(isKnownImageOnlyModel);
    const imageModels = [...new Set([...storedImageModels, ...misplacedImageModels])];
    const videoModels = storedVideoModels.filter(model => !isKnownImageOnlyModel(model));
    return {
      id: api.id || makeId('api'),
      name: api.name || 'Untitled API',
      protocol: api.protocol || inferProtocol(api.baseUrl),
      textApiMode: api.textApiMode || 'auto',
      maxTextTokens: normalizeMaxTextTokens(api.maxTextTokens ?? DEFAULT_MAX_TEXT_TOKENS),
      baseUrl: api.baseUrl || '',
      apiKey: api.apiKey || '',
      enabled: api.enabled !== false,
      textModels,
      imageModels,
      imageModelCapabilities: normalizeImageModelCapabilities(api.imageModelCapabilities),
      videoModels,
      videoModelCapabilities: normalizeImageModelCapabilities(api.videoModelCapabilities),
      defaultTextModel: api.defaultTextModel || textModels[0] || '',
      defaultImageModel: imageModels.includes(api.defaultImageModel)
        ? api.defaultImageModel
        : imageModels[0] || '',
      defaultVideoModel: videoModels.includes(api.defaultVideoModel)
        ? api.defaultVideoModel
        : videoModels[0] || '',
    };
  }

  const textModels = api.type === 'text' ? normalizeModelList(api.model) : [];
  const legacyModels = normalizeModelList(api.model);
  const imageModels = api.type === 'image' || legacyModels.some(isKnownImageOnlyModel)
    ? legacyModels
    : [];
  const videoModels = api.type === 'video'
    ? legacyModels.filter(model => !isKnownImageOnlyModel(model))
    : [];
  return {
    id: api.id || makeId('api'),
    name: api.name || 'Untitled API',
    protocol: inferProtocol(api.baseUrl),
    textApiMode: 'auto',
    maxTextTokens: normalizeMaxTextTokens(api.maxTextTokens ?? DEFAULT_MAX_TEXT_TOKENS),
    baseUrl: api.baseUrl || '',
    apiKey: api.apiKey || '',
    enabled: true,
    textModels,
    imageModels,
    imageModelCapabilities: {},
    videoModels,
    videoModelCapabilities: {},
    defaultTextModel: textModels[0] || '',
    defaultImageModel: imageModels[0] || '',
    defaultVideoModel: videoModels[0] || '',
  };
};

const normalizeApiProviders = (apis, fallbackToDefault = false) => {
  const normalized = Array.isArray(apis)
    ? apis.map(normalizeApiProvider).filter(Boolean)
    : [];
  return normalized.length > 0 || !fallbackToDefault ? normalized : createDefaultApiConfigs();
};

const normalizeRuntimeSettingsPayload = (settings = {}) => {
  const maxTextTokens = normalizeMaxTextTokens(settings.maxTextTokens);
  return {
    activeProviderId: settings.activeProviderId || '',
    providers: Array.isArray(settings.providers)
      ? settings.providers.map(provider => normalizeApiProvider({
          ...provider,
          maxTextTokens: provider?.maxTextTokens ?? maxTextTokens,
        })).filter(Boolean)
      : [],
    allowedModels: settings.allowedModels || { text: [], image: [], video: [] },
    maxTextTokens,
  };
};

const getModelCount = (api) => (
  normalizeModelList(api?.textModels).length +
  normalizeModelList(api?.imageModels).length +
  normalizeModelList(api?.videoModels).length
);

const flattenApiConfigs = (providers) => (
  normalizeApiProviders(providers).flatMap(provider => {
    if (provider.enabled === false) return [];
    return API_MODEL_GROUPS.flatMap(group => {
      const models = normalizeModelList(provider[group.field]);
      return models.map(model => ({
        id: `${provider.id}:${group.key}:${model}`,
        providerId: provider.id,
        providerName: provider.name,
        protocol: provider.protocol,
        textApiMode: provider.textApiMode || 'auto',
        maxTextTokens: provider.maxTextTokens,
        name: `${provider.name} / ${model}`,
        type: group.key,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model,
        imageModelCapabilities: group.key === 'image' ? provider.imageModelCapabilities : {},
        videoModelCapabilities: group.key === 'video' ? provider.videoModelCapabilities : {},
      }));
    });
  })
);

const prepareProjectsForStorage = (projects) => (
  projects.map(project => ({
    ...project,
    nodes: project.nodes.map(stripRuntimeNodeData),
  }))
);

const isSameCanvasSnapshot = (project, nodes, edges) => (
  JSON.stringify(project.nodes) === JSON.stringify(nodes) &&
  JSON.stringify(project.edges) === JSON.stringify(edges)
);

const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const pad = value => String(value).padStart(2, '0');
  const timeText = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (diffMs < minuteMs) return '刚刚';
  if (diffMs < hourMs) return `${Math.floor(diffMs / minuteMs)}分钟前`;

  const isToday = (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
  if (isToday) return `今天 ${timeText}`;

  const monthDayTime = `${date.getMonth() + 1}月${date.getDate()}日 ${timeText}`;
  if (date.getFullYear() === now.getFullYear()) return monthDayTime;

  return `${date.getFullYear()}年${monthDayTime}`;
};

function Sidebar({ view, onNavigate }) {
  return (
    <aside className="app-sidebar">
      <button
        className="sidebar-logo-button"
        onClick={() => onNavigate('projects')}
        data-tooltip="返回画布"
        aria-label="返回画布"
      >
        <img src={publicAsset('infinite-canvas-logo.png')} alt="Infinite Canvas" />
      </button>
      <div className="sidebar-nav">
        <button
          className={`sidebar-button ${view === 'projects' ? 'active' : ''}`}
          onClick={() => onNavigate('projects')}
          data-tooltip="画布"
          aria-label="画布"
        >
          <Icon name="compass" size={19} />
        </button>
        <button
          className={`sidebar-button ${view === 'materials' ? 'active' : ''}`}
          onClick={() => onNavigate('materials')}
          data-tooltip="素材库"
          aria-label="素材库"
        >
          <Icon name="image" size={19} />
        </button>
        <button
          className={`sidebar-button ${view === 'templates' ? 'active' : ''}`}
          onClick={() => onNavigate('templates')}
          data-tooltip="模板库"
          aria-label="模板库"
        >
          <Icon name="apps" size={19} />
        </button>
        <button
          className={`sidebar-button ${view === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
          data-tooltip="设置"
          aria-label="设置"
        >
          <Icon name="settings" size={19} />
        </button>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-version">V1.1.10</div>
      </div>
    </aside>
  );
}

const COPILOT_WELCOME_MESSAGE = {
  id: 'copilot_welcome',
  role: 'assistant',
  content: '你好，我可以和你讨论需求，也可以在你明确提出时创建、连接、修改或运行画布节点。',
};

function CanvasCopilotDrawer({
  open,
  onClose,
  tools,
  modelOptions = [],
  nodeTargets = [],
  pickingCanvasNode = false,
  onToggleCanvasPicker,
  onRemoveNodeTarget,
  onFocusNodeTarget,
}) {
  const [messages, setMessages] = useState([COPILOT_WELCOME_MESSAGE]);
  const [working, setWorking] = useState(false);
  const [sessionId, setSessionId] = useState(createCopilotSessionId);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [pendingEditPlan, setPendingEditPlan] = useState(null);
  const [selectedModelId, setSelectedModelId] = useState('auto');
  const messagesEndRef = useRef(null);
  const selectedModel = selectedModelId === 'auto'
    ? null
    : modelOptions.find(model => model.id === selectedModelId && model.available) || null;

  const createMessage = useCallback((role, content, messageAttachments = [], choices = null, targets = []) => ({
    id: `copilot_${role}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role,
    content,
    attachments: messageAttachments,
    targets,
    choices: choices ? { ...choices, status: 'open', selectedOptionId: '' } : null,
  }), []);

  const startNewConversation = useCallback(() => {
    setMessages([COPILOT_WELCOME_MESSAGE]);
    setPendingPlan(null);
    setPendingEditPlan(null);
    setSessionId(createCopilotSessionId());
  }, []);

  useEffect(() => {
    if (selectedModelId === 'auto') return;
    if (!modelOptions.some(model => model.id === selectedModelId && model.available)) {
      setSelectedModelId('auto');
    }
  }, [modelOptions, selectedModelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, pendingEditPlan, pendingPlan, working]);

  const submit = useCallback(async ({ text, displayText, attachments, modelSelection, targetNodes = nodeTargets }) => {
    if (working) return false;
    setPendingPlan(null);
    setPendingEditPlan(null);
    setMessages(current => [...current, createMessage(
      'user',
      displayText,
      attachments,
      null,
      targetNodes,
    )]);
    setWorking(true);
    try {
      const result = await tools.handleUserRequest({
        text,
        sessionId,
        modelSelection,
        attachments,
        targetNodes,
      });
      setMessages(current => [...current, createMessage('assistant', result.message, [], result.choices)]);
      setPendingPlan(result.pendingPlan || null);
      setPendingEditPlan(result.pendingEditPlan || null);
      return true;
    } catch (error) {
      setMessages(current => [...current, createMessage('assistant', `Copilot 暂时无法回答：${error.message || '请稍后重试'}`)]);
      return false;
    } finally {
      setWorking(false);
    }
  }, [createMessage, nodeTargets, sessionId, tools, working]);

  const selectChoice = useCallback(async (messageId, option) => {
    if (working) return;
    setMessages(current => current.map(message => (
      message.id === messageId
        ? { ...message, choices: { ...message.choices, status: 'submitting', selectedOptionId: option.id } }
        : message
    )));
    const accepted = await submit({
      text: option.submitText,
      displayText: option.submitText,
      attachments: [],
      modelSelection: selectedModel,
      targetNodes: nodeTargets,
    });
    setMessages(current => current.map(message => (
      message.id === messageId
        ? {
            ...message,
            choices: {
              ...message.choices,
              status: accepted ? 'selected' : 'open',
              selectedOptionId: accepted ? option.id : '',
            },
          }
        : message
    )));
  }, [nodeTargets, selectedModel, submit, working]);

  const confirmPendingPlan = useCallback(async () => {
    if (!pendingPlan || working) return;
    setWorking(true);
    try {
      const result = await tools.applyPlan(pendingPlan);
      setPendingPlan(null);
      setMessages(current => [...current, createMessage('assistant', result.message)]);
    } catch (error) {
      setMessages(current => [...current, createMessage('assistant', `画布操作失败：${error.message || '请稍后重试'}`)]);
    } finally {
      setWorking(false);
    }
  }, [createMessage, pendingPlan, tools, working]);

  const confirmPendingEditPlan = useCallback(async () => {
    if (!pendingEditPlan || working) return;
    setWorking(true);
    try {
      const result = await tools.applyEditPlan(pendingEditPlan);
      setPendingEditPlan(null);
      setMessages(current => [...current, createMessage('assistant', result.message)]);
    } catch (error) {
      setMessages(current => [...current, createMessage('assistant', `画布修改失败：${error.message || '请稍后重试'}`)]);
    } finally {
      setWorking(false);
    }
  }, [createMessage, pendingEditPlan, tools, working]);

  const cancelPendingAction = useCallback(() => {
    setPendingPlan(null);
    setPendingEditPlan(null);
    setMessages(current => [...current, createMessage('assistant', '已取消，这次没有修改画布。')]);
  }, [createMessage]);

  if (!open) return null;

  return (
    <aside className="canvas-copilot-drawer nodrag nopan">
      <div className="canvas-copilot-header">
        <button type="button" className="canvas-copilot-new-btn" onClick={startNewConversation}>
          <Icon name="add" size={16} /> 新建对话
        </button>
        <button type="button" className="canvas-copilot-close-btn" onClick={onClose} aria-label="关闭 Copilot">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="canvas-copilot-messages" aria-live="polite">
        {messages.map(message => (
          <article key={message.id} className={`canvas-copilot-message ${message.role}`}>
            <div className="canvas-copilot-message-stack">
              <div className="canvas-copilot-bubble">
                {message.targets?.length > 0 && (
                  <CopilotNodeReferences
                    targets={message.targets}
                    compact
                    onFocus={onFocusNodeTarget}
                  />
                )}
                {message.content}
                {message.attachments?.length > 0 && (
                  <div className="canvas-copilot-message-attachments">
                    {message.attachments.map(attachment => (
                      <span key={attachment.id} title={attachment.name}>
                        {attachment.kind === 'image'
                          ? <img src={attachment.dataUrl} alt={attachment.name} />
                          : <Icon name="fileText" size={14} />}
                        <small>{attachment.name}</small>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {message.choices && (
                <div className="canvas-copilot-choice-list" role="radiogroup" aria-label={message.choices.question}>
                  <div className="canvas-copilot-choice-question">{message.choices.question}</div>
                  {message.choices.options.map(option => {
                    const selected = message.choices.selectedOptionId === option.id;
                    const submitting = selected && message.choices.status === 'submitting';
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`canvas-copilot-choice ${selected ? 'selected' : ''}`}
                        onClick={() => selectChoice(message.id, option)}
                        disabled={working || message.choices.status !== 'open'}
                        role="radio"
                        aria-checked={selected}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          {option.description && <small>{option.description}</small>}
                        </span>
                        {submitting
                          ? <Icon name="loader" size={15} />
                          : selected && <Icon name="check" size={15} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        ))}
        {(pendingPlan || pendingEditPlan) && (
          <section className="canvas-copilot-plan">
            <strong>{pendingEditPlan?.summary || pendingPlan?.summary}</strong>
            {pendingEditPlan ? (
              <span>将修改 {pendingEditPlan.edits.length} 项节点内容</span>
            ) : (
              <span>
                将创建 {pendingPlan.nodes.length} 个节点
                {pendingPlan.nodes.some(node => node.run) ? '，并运行生成任务' : ''}
              </span>
            )}
            <div className="canvas-copilot-plan-actions">
              <button type="button" onClick={cancelPendingAction} disabled={working}>取消</button>
              <button
                type="button"
                className="primary"
                onClick={pendingEditPlan ? confirmPendingEditPlan : confirmPendingPlan}
                disabled={working}
              >
                执行
              </button>
            </div>
          </section>
        )}
        {working && (
          <article className="canvas-copilot-message assistant">
            <div className="canvas-copilot-bubble muted">正在思考...</div>
          </article>
        )}
        <div ref={messagesEndRef} />
      </div>
      <CopilotComposer
        key={sessionId}
        working={working}
        modelOptions={modelOptions}
        selectedModelId={selectedModelId}
        nodeTargets={nodeTargets}
        pickingCanvasNode={pickingCanvasNode}
        onModelChange={setSelectedModelId}
        onSubmit={submit}
        onUndo={tools.undoLastAction}
        onToggleCanvasPicker={onToggleCanvasPicker}
        onRemoveNodeTarget={onRemoveNodeTarget}
        onFocusNodeTarget={onFocusNodeTarget}
      />
    </aside>
  );
}

function ProjectsView({ projects, onCreateProject, onOpenProject, onRenameProject, onDeleteProject, onDeleteProjects }) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e) => {
      if (e.target.closest?.('.project-card-actions')) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

  const handleMenuToggle = useCallback((e, projectId) => {
    e.stopPropagation();
    setOpenMenuId(prev => prev === projectId ? null : projectId);
  }, []);

  const handleRename = useCallback((e, project) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setRenamingId(project.id);
    setRenameValue(project.name);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const commitRename = useCallback(() => {
    if (renamingId) {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== projects.find(p => p.id === renamingId)?.name) {
        onRenameProject(renamingId, trimmed);
      }
      setRenamingId(null);
      setRenameValue('');
    }
  }, [renamingId, renameValue, projects, onRenameProject]);

  const handleDeleteClick = useCallback((e, project) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setDeleteTarget(project);
  }, []);

  const toggleBulkMode = useCallback(() => {
    setOpenMenuId(null);
    setRenamingId(null);
    setBulkMode(prev => {
      const nextBulkMode = !prev;
      if (!nextBulkMode) {
        setSelectedProjectIds([]);
      }
      return nextBulkMode;
    });
  }, []);

  const toggleProjectSelection = useCallback((projectId) => {
    setSelectedProjectIds(prev => (
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    ));
  }, []);

  const handleProjectClick = useCallback((projectId) => {
    if (bulkMode) {
      toggleProjectSelection(projectId);
      return;
    }
    onOpenProject(projectId);
  }, [bulkMode, onOpenProject, toggleProjectSelection]);

  const handleSelectAll = useCallback(() => {
    setSelectedProjectIds(prev => (
      prev.length === projects.length ? [] : projects.map(project => project.id)
    ));
  }, [projects]);

  const handleCancelBulk = useCallback(() => {
    setBulkMode(false);
    setSelectedProjectIds([]);
  }, []);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedProjectIds.length === 0) return;
    setDeleteTarget({ type: 'bulk', ids: selectedProjectIds });
  }, [selectedProjectIds]);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      if (deleteTarget.type === 'bulk') {
        onDeleteProjects(deleteTarget.ids);
        setSelectedProjectIds([]);
        setBulkMode(false);
      } else {
        onDeleteProject(deleteTarget.id);
      }
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteProject, onDeleteProjects]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  return (
    <main className="workspace-page">
      <div className="page-header">
        <h1>画布</h1>
        <button
          className={`icon-button ${bulkMode ? 'active' : ''}`}
          title={bulkMode ? '退出批量操作' : '批量操作'}
          onClick={toggleBulkMode}
        >
          <Icon name="batch" size={20} />
        </button>
      </div>

      <div className="project-grid">
        <button
          className={`new-project-card ${bulkMode ? 'disabled' : ''}`}
          onClick={onCreateProject}
          disabled={bulkMode}
        >
          <span className="new-project-plus"><Icon name="add" size={40} strokeWidth={1.8} /></span>
          <span className="project-card-title">新建画布</span>
        </button>

        {projects.map(project => {
          const selected = selectedProjectIds.includes(project.id);
          const coverImages = getProjectCoverImages(project);
          return (
            <div
              className={`project-card ${bulkMode ? 'bulk-mode' : ''} ${selected ? 'selected' : ''}`}
              key={project.id}
              onClick={() => handleProjectClick(project.id)}
            >
              <div className="project-card-clickable">
                <div className={`project-thumb ${coverImages.length > 0 ? 'has-cover' : 'empty'}`}>
                  {bulkMode && (
                    <span className={`project-select-check ${selected ? 'checked' : ''}`}>
                      {selected ? <Icon name="check" size={14} strokeWidth={3} /> : null}
                    </span>
                  )}
                  {coverImages.length > 0 ? (
                    <div className={`project-cover-grid count-${coverImages.length}`}>
                      {coverImages.map((imageUrl, index) => (
                        <img src={imageUrl} alt="" key={`${imageUrl}_${index}`} loading="lazy" decoding="async" />
                      ))}
                    </div>
                  ) : (
                    <span className="project-thumb-placeholder">
                      <Icon name="image" size={28} />
                    </span>
                  )}
                </div>
                <div className="project-card-info">
                  <div className="project-title-row">
                    {renamingId === project.id ? (
                      <input
                        ref={renameInputRef}
                        className="project-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="project-card-title">
                        {project.name}
                      </span>
                    )}
                    {!bulkMode && (
                      <div className="project-card-actions" ref={menuRef}>
                        <button
                          className={`project-more-btn ${openMenuId === project.id ? 'active' : ''}`}
                          title="更多操作"
                          onClick={(e) => handleMenuToggle(e, project.id)}
                        >
                          <Icon name="more" size={18} />
                        </button>
                        {openMenuId === project.id && (
                          <div className="project-dropdown">
                            <button className="dropdown-item" onClick={(e) => handleRename(e, project)}>
                              <Icon name="edit" size={15} /> 重命名
                            </button>
                            <button className="dropdown-item danger" onClick={(e) => handleDeleteClick(e, project)}>
                              <Icon name="trash" size={15} /> 删除
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="project-card-meta">
                    更新于{formatDate(project.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {bulkMode && (
        <div className="bulk-action-bar">
          <button className="bulk-action-btn" onClick={handleSelectAll}>
            {selectedProjectIds.length === projects.length ? '取消全选' : '全选'}
          </button>
          <span className="bulk-selected-count">已选 {selectedProjectIds.length} 个</span>
          <button
            className="bulk-action-btn danger"
            onClick={handleBulkDeleteClick}
            disabled={selectedProjectIds.length === 0}
          >
            删除
          </button>
          <button className="bulk-action-btn" onClick={handleCancelBulk}>取消</button>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>删除画布</h3>
            <p>
              {deleteTarget.type === 'bulk'
                ? `确定要删除选中的 ${deleteTarget.ids.length} 个画布吗？此操作不可撤销。`
                : `确定要删除「${deleteTarget.name}」吗？此操作不可撤销。`}
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={cancelDelete}>取消</button>
              <button className="modal-btn confirm" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const MODEL_TAG_MAX_CHARS = 36;

function ModelGroupEditor({ title, models, defaultModel, onModelsChange, onDefaultChange }) {
  const modelOptions = normalizeModelList(models);
  const [inputValue, setInputValue] = useState('');

  const addModel = useCallback((value) => {
    const name = (value || inputValue).trim();
    if (!name) return;
    const nextModels = [...modelOptions, name];
    onModelsChange(nextModels);
    if (!defaultModel || defaultModel === modelOptions[0]) {
      onDefaultChange(nextModels[0]);
    }
    setInputValue('');
  }, [inputValue, modelOptions, defaultModel, onModelsChange, onDefaultChange]);

  const removeModel = useCallback((name) => {
    const nextModels = modelOptions.filter(m => m !== name);
    onModelsChange(nextModels);
    if (defaultModel === name) {
      onDefaultChange(nextModels[0] || '');
    }
  }, [modelOptions, defaultModel, onModelsChange, onDefaultChange]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addModel();
    }
  }, [addModel]);

  return (
    <div className="model-group-card">
      <div className="model-group-title">{title}</div>
      <div className="model-tags-input-wrap">
        <div className="model-tags-list">
          {modelOptions.map(model => (
            <span key={model} className="model-tag">
              <span className="model-tag-text" title={model}>
                {model.length > MODEL_TAG_MAX_CHARS ? model.slice(0, MODEL_TAG_MAX_CHARS) + '…' : model}
              </span>
              <button
                type="button"
                className="model-tag-remove"
                aria-label={`移除 ${model}`}
                onClick={() => removeModel(model)}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          <input
            type="text"
            className="model-tag-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={modelOptions.length === 0 ? '输入模型名，按 Enter 添加' : '输入并回车添加'}
          />
        </div>
      </div>
      <label>
        默认模型
        <select
          value={defaultModel || ''}
          onChange={e => onDefaultChange(e.target.value)}
          disabled={modelOptions.length === 0}
        >
          <option value="">
            {modelOptions.length === 0 ? '请先添加模型' : '选择默认模型'}
          </option>
          {modelOptions.map(model => (
            <option value={model} key={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ModelPickerModal({ data, onConfirm, onCancel }) {
  // local selected state: group key → array of model names
  const [selected, setSelected] = useState(() => {
    const initial = {};
    for (const [key, group] of Object.entries(data)) {
      initial[key] = [...group.selected];
    }
    return initial;
  });

  const toggleModel = useCallback((groupKey, model) => {
    setSelected(prev => {
      const list = prev[groupKey];
      if (list.includes(model)) {
        return { ...prev, [groupKey]: list.filter(m => m !== model) };
      }
      return { ...prev, [groupKey]: [...list, model] };
    });
  }, []);

  const toggleGroupAll = useCallback((groupKey) => {
    setSelected(prev => {
      const all = data[groupKey].models;
      const current = prev[groupKey];
      if (current.length === all.length) {
        return { ...prev, [groupKey]: [] };
      }
      return { ...prev, [groupKey]: [...all] };
    });
  }, [data]);

  const totalCount = Object.values(data).reduce((sum, g) => sum + g.models.length, 0);
  const selectedCount = Object.values(selected).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="model-picker-overlay" onClick={onCancel}>
      <div className="model-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="model-picker-header">
          <h3>选择启用的模型</h3>
          <span className="model-picker-summary">已拉取 {totalCount} 个模型，已选 {selectedCount} 个</span>
        </div>
        <div className="model-picker-body">
          {Object.entries(data).map(([key, group]) => {
            const allList = group.models;
            const selectedList = selected[key] || [];
            const allChecked = allList.length > 0 && selectedList.length === allList.length;
            if (allList.length === 0) return null;
            return (
              <div key={key} className="model-picker-group">
                <div className="model-picker-group-header">
                  <span className="model-picker-group-title">
                    {group.title}
                    <span className="model-picker-group-count">{selectedList.length}/{allList.length}</span>
                  </span>
                  <button
                    type="button"
                    className="model-picker-toggle-all"
                    onClick={() => toggleGroupAll(key)}
                  >
                    {allChecked ? '取消全选' : '全选'}
                  </button>
                </div>
                <div className="model-picker-list">
                  {allList.map(model => (
                    <label key={model} className="model-picker-item" title={model}>
                      <input
                        type="checkbox"
                        className="model-checkbox"
                        checked={selectedList.includes(model)}
                        onChange={() => toggleModel(key, model)}
                      />
                      <span className="model-picker-text">{model}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="model-picker-footer">
          <button className="api-secondary-btn" type="button" onClick={onCancel}>取消</button>
          <button className="api-save-btn" type="button" onClick={() => onConfirm(selected)}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}



function CanvasPage({ project, apiConfigs, apiProviders, onBack, onRenameProject, onCanvasChange, materials, setMaterials, materialGroups, workflowTemplates, setWorkflowTemplates, officialTemplates, officialPromptStyles, pendingInjectRef, runtimeSettings, crossProjectClipboardRef, refreshLocalAssets }) {
  const handleCanvasChange = useCallback((nodes, edges, meta) => {
    onCanvasChange(project.id, nodes, edges, meta);
  }, [onCanvasChange, project.id]);

  return (
    <div className="canvas-page">
      <div className="canvas-topbar">
        <button className="back-button" onClick={onBack}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <input
          className="canvas-title-input"
          value={project.name}
          onChange={e => onRenameProject(project.id, e.target.value)}
          aria-label="画布名称"
        />
      </div>
      <ReactFlowProvider key={project.id}>
        <CanvasFlow
          projectId={project.id}
          initialNodes={project.nodes}
          initialEdges={project.edges}
          initialViewport={project.viewport}
          apiConfigs={apiConfigs}
          apiProviders={runtimeSettings.providers}
          onCanvasChange={handleCanvasChange}
          materials={materials}
          setMaterials={setMaterials}
          materialGroups={materialGroups}
          workflowTemplates={workflowTemplates}
          setWorkflowTemplates={setWorkflowTemplates}
          officialTemplates={officialTemplates}
          officialPromptStyles={officialPromptStyles}
          pendingInjectRef={pendingInjectRef}
          runtimeSettings={runtimeSettings}
          crossProjectClipboardRef={crossProjectClipboardRef}
          refreshLocalAssets={refreshLocalAssets}
        />
      </ReactFlowProvider>
    </div>
  );
}

function App() {
  const adminTemplateId = new URLSearchParams(window.location.search).get('adminTemplateId');
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState('projects');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [apiConfigs, setApiConfigs] = useState(createDefaultApiConfigs());
  const [selectedApiId, setSelectedApiId] = useState(null);
  const [chatGroups, setChatGroups] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [localAssets, setLocalAssets] = useState([]);
  const [materialGroups, setMaterialGroups] = useState(() => [createDefaultMaterialGroup()]);
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [officialTemplates, setOfficialTemplates] = useState([]);
  const [officialPromptStyles, setOfficialPromptStyles] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const crossProjectClipboardRef = useRef(null);
  const [runtimeSettings, setRuntimeSettings] = useState({
    activeProviderId: '',
    providers: [],
    allowedModels: { text: [], image: [], video: [] },
    maxTextTokens: DEFAULT_MAX_TEXT_TOKENS,
  });
  const [runtimeSettingsLoadState, setRuntimeSettingsLoadState] = useState({ status: 'idle', error: '' });

  const pendingInjectRef = useRef(null);
  const dataUrlMigrationCheckedRef = useRef(false);

  useEffect(() => {
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) return;
    setView('projects');
    setActiveProjectId(null);
  }, []);

  const refreshOfficialTemplates = useCallback(async () => {
    try {
      const templates = await listPublicTemplates();
      setOfficialTemplates(templates);
    } catch (error) {
      console.warn('加载官方模板失败', error);
    }
  }, []);

  const refreshOfficialPromptStyles = useCallback(async () => {
    try {
      setOfficialPromptStyles(await listPublicPromptStyles());
    } catch (error) {
      console.warn('加载官方风格提示词失败', error);
    }
  }, []);

  const refreshLocalAssets = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/assets`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
      }
      setLocalAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (error) {
      console.warn('加载本地素材失败', error);
    }
  }, []);

  useEffect(() => {
    refreshOfficialTemplates();
    window.addEventListener('focus', refreshOfficialTemplates);
    return () => window.removeEventListener('focus', refreshOfficialTemplates);
  }, [refreshOfficialTemplates]);

  useEffect(() => {
    refreshOfficialPromptStyles();
    window.addEventListener('focus', refreshOfficialPromptStyles);
    return () => window.removeEventListener('focus', refreshOfficialPromptStyles);
  }, [refreshOfficialPromptStyles]);

  useEffect(() => {
    refreshLocalAssets();
    window.addEventListener('focus', refreshLocalAssets);
    return () => window.removeEventListener('focus', refreshLocalAssets);
  }, [refreshLocalAssets]);

  // 启动时从 IndexedDB 加载数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        storedProjects,
        storedChatGroups, storedChatSessions,
        storedMaterials, storedMaterialGroups,
        storedWorkflowTemplates,
      ] = await Promise.all([
        storage.getItem(STORAGE_KEYS.projects),
        storage.getItem(STORAGE_KEYS.chatGroups),
        storage.getItem(STORAGE_KEYS.chatSessions),
        storage.getItem(STORAGE_KEYS.materials),
        storage.getItem(STORAGE_KEYS.materialGroups),
        storage.getItem(STORAGE_KEYS.workflowTemplates),
      ]);
      if (cancelled) return;
      if (Array.isArray(storedProjects) && storedProjects.length > 0) {
        setProjects(storedProjects.map(migrateLegacyPromptProject));
      }
      // old apiConfigs 不再从 localStorage 加载，统一走运行设置接口
      setApiConfigs([]);
      if (Array.isArray(storedChatGroups)) {
        setChatGroups(storedChatGroups);
      }
      if (Array.isArray(storedChatSessions)) {
        setChatSessions(storedChatSessions);
      }
      if (Array.isArray(storedMaterials)) {
        setMaterials(storedMaterials);
      }
      if (Array.isArray(storedMaterialGroups) && storedMaterialGroups.length > 0) {
        setMaterialGroups(storedMaterialGroups);
      }
      if (Array.isArray(storedWorkflowTemplates)) {
        setWorkflowTemplates(storedWorkflowTemplates.map(migrateLegacyPromptTemplate));
      }
      setStorageReady(true);

      // Load runtime settings
      try {
        setRuntimeSettingsLoadState({ status: 'loading', error: '' });
        const resp = await fetch(`${API_BASE}/api/admin/runtime-settings`);
        if (resp.ok) {
          const rs = await resp.json();
          setRuntimeSettings(normalizeRuntimeSettingsPayload(rs));
          setRuntimeSettingsLoadState({ status: 'success', error: '' });
        } else {
          setRuntimeSettingsLoadState({ status: 'error', error: `HTTP ${resp.status}` });
        }
      } catch (e) {
        console.warn('加载运行配置失败', e);
        setRuntimeSettingsLoadState({ status: 'error', error: e.message || '加载失败' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 窗口聚焦时重新拉取运行配置
  useEffect(() => {
    const refresh = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/admin/runtime-settings`);
        if (resp.ok) {
          const rs = await resp.json();
          setRuntimeSettings(prev => {
            const next = normalizeRuntimeSettingsPayload(rs);
            // 只在数据真正变化时更新，避免不必要的重渲染
            if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
            return next;
          });
        }
      } catch (e) { /* 静默 */ }
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const saveRuntimeSettings = useCallback(async (settings) => {
    const normalized = normalizeRuntimeSettingsPayload(settings);
    const resp = await fetch(`${API_BASE}/api/admin/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.detail || payload.error || `保存失败 (${resp.status})`);
    }
    const next = normalizeRuntimeSettingsPayload(payload.settings || {});
    setRuntimeSettings(next);
    setRuntimeSettingsLoadState({ status: 'success', error: '' });
    return next;
  }, []);

  const activeProject = projects.find(project => project.id === activeProjectId);
  const canvasApiConfigs = useMemo(() => flattenApiConfigs(apiConfigs), [apiConfigs]);

  // 数据变更时保存到 IndexedDB
  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.projects, prepareProjectsForStorage(projects));
  }, [projects, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.chatGroups, chatGroups);
  }, [chatGroups, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.chatSessions, chatSessions);
  }, [chatSessions, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.materials, materials);
  }, [materials, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.workflowTemplates, workflowTemplates);
  }, [storageReady, workflowTemplates]);

  useEffect(() => {
    if (!storageReady || dataUrlMigrationCheckedRef.current) return;
    dataUrlMigrationCheckedRef.current = true;

    const normalizedProjects = replacePortableLocalUploadUrls(projects);
    const normalizedMaterials = replacePortableLocalUploadUrls(materials);
    const normalizedWorkflowTemplates = replacePortableLocalUploadUrls(workflowTemplates);
    if (normalizedProjects !== projects) {
      setProjects(normalizedProjects);
    }
    if (normalizedMaterials !== materials) {
      setMaterials(normalizedMaterials);
    }
    if (normalizedWorkflowTemplates !== workflowTemplates) {
      setWorkflowTemplates(normalizedWorkflowTemplates);
    }

    const dataUrls = collectMigratableImageDataUrls({
      projects: normalizedProjects,
      materials: normalizedMaterials,
      workflowTemplates: normalizedWorkflowTemplates,
    });
    if (dataUrls.size === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const migrationMap = await createDataUrlMigrationMap(dataUrls);
        if (cancelled || migrationMap.size === 0) return;

        setProjects(prevProjects => replaceMigratedDataUrls(prevProjects, migrationMap));
        setMaterials(prevMaterials => replaceMigratedDataUrls(prevMaterials, migrationMap));
        setWorkflowTemplates(prevTemplates => replaceMigratedDataUrls(prevTemplates, migrationMap));
        refreshLocalAssets();
        console.info(`已迁移 ${migrationMap.size} 张历史 base64 画布图片`);
      } catch (error) {
        console.warn('历史 base64 图片迁移失败', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshLocalAssets, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    storage.setItem(STORAGE_KEYS.materialGroups, materialGroups);
  }, [materialGroups, storageReady]);

  const openProject = useCallback((projectId) => {
    setActiveProjectId(projectId);
    setView('canvas');
  }, []);

  const createProject = useCallback((initialPrompt) => {
    const project = createDefaultProject();
    const request = buildHomeCreationRequest(
      typeof initialPrompt === 'object' && initialPrompt
        ? initialPrompt
        : { prompt: initialPrompt },
    );
    if (
      request.prompt
      || request.model
      || request.apiId
      || request.uploadedReferenceImages.length > 0
    ) {
      pendingInjectRef.current = {
        ...request,
        at: Date.now(),
      };
    }
    setProjects(prev => [project, ...prev]);
    setActiveProjectId(project.id);
    setView('canvas');
  }, []);

  const useLibraryItemInNewProject = useCallback((kind, item) => {
    if (!item) return;
    const project = createDefaultProject(getLibraryProjectName(kind, item));
    pendingInjectRef.current = {
      kind,
      item,
      at: Date.now(),
    };
    setProjects(current => [project, ...current]);
    setActiveProjectId(project.id);
    setView('canvas');
  }, []);

  const updateWorkflowTemplate = useCallback((templateId, patch) => {
    setWorkflowTemplates(current => current.map(template => (
      template.id === templateId
        ? { ...template, ...patch, updatedAt: new Date().toISOString() }
        : template
    )));
  }, []);

  const deleteWorkflowTemplate = useCallback((templateId) => {
    setWorkflowTemplates(current => current.filter(template => template.id !== templateId));
  }, []);

  const renameProject = useCallback((projectId, name) => {
    setProjects(prev => prev.map(project => (
      project.id === projectId
        ? { ...project, name, updatedAt: new Date().toISOString() }
        : project
    )));
  }, []);

  const deleteProject = useCallback((projectId) => {
    setProjects(prev => prev.filter(project => project.id !== projectId));
  }, []);

  const deleteProjects = useCallback((projectIds) => {
    const idsToDelete = new Set(projectIds);
    setProjects(prev => prev.filter(project => !idsToDelete.has(project.id)));
  }, []);

  const updateProjectCanvas = useCallback((projectId, nodes, edges, meta = {}) => {
    setProjects(prev => prev.map(project => (
      project.id === projectId && !isSameCanvasSnapshot(project, nodes, edges)
        ? {
            ...project,
            nodes,
            edges,
            viewport: meta.viewport || project.viewport,
            updatedAt: new Date().toISOString(),
          }
        : project
    )));
  }, []);

  const addApi = useCallback(() => {
    const api = {
      id: makeId('api'),
      name: 'Untitled Provider',
      protocol: 'openai',
      textApiMode: 'auto',
      baseUrl: '',
      apiKey: '',
      enabled: true,
      textModels: [],
      imageModels: [],
      videoModels: [],
      defaultTextModel: '',
      defaultImageModel: '',
      defaultVideoModel: '',
    };
    setApiConfigs(prev => [...prev, api]);
    setSelectedApiId(api.id);
  }, []);

  const updateApi = useCallback((apiId, patch) => {
    setApiConfigs(prev => prev.map(api => (
      api.id === apiId ? normalizeApiProvider({ ...api, ...patch }) : api
    )));
  }, []);

  const deleteApi = useCallback((apiId) => {
    setApiConfigs(prev => {
      const next = prev.filter(api => api.id !== apiId);
      setSelectedApiId(current => {
        if (current !== apiId) return current;
        return next[0]?.id || null;
      });
      return next;
    });
  }, []);

  const navigate = useCallback((nextView) => {
    setView(nextView);
    if (nextView !== 'canvas') {
      setActiveProjectId(null);
    }
  }, []);

  if (adminTemplateId) {
    return (
      <OfficialTemplateEditor
        templateId={adminTemplateId}
        CanvasComponent={CanvasFlow}
        apiConfigs={canvasApiConfigs}
        materials={materials}
        setMaterials={setMaterials}
        materialGroups={materialGroups}
        workflowTemplates={workflowTemplates}
        setWorkflowTemplates={setWorkflowTemplates}
        officialTemplates={officialTemplates}
        officialPromptStyles={officialPromptStyles}
        runtimeSettings={runtimeSettings}
      />
    );
  }

  if (view === 'canvas' && activeProject) {
    return (
      <div className="app-shell">
        <CanvasPage
          project={activeProject}
          apiConfigs={canvasApiConfigs}
          apiProviders={apiConfigs}
          onBack={() => navigate('projects')}
          onRenameProject={renameProject}
          onCanvasChange={updateProjectCanvas}
          materials={materials}
          setMaterials={setMaterials}
          materialGroups={materialGroups}
          workflowTemplates={workflowTemplates}
          setWorkflowTemplates={setWorkflowTemplates}
          officialTemplates={officialTemplates}
          officialPromptStyles={officialPromptStyles}
          pendingInjectRef={pendingInjectRef}
          runtimeSettings={runtimeSettings}
          crossProjectClipboardRef={crossProjectClipboardRef}
          refreshLocalAssets={refreshLocalAssets}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onNavigate={navigate}
      />
      {view === 'chat' ? (
        <ChatView
          apiConfigs={apiConfigs}
          chatGroups={chatGroups}
          setChatGroups={setChatGroups}
          chatSessions={chatSessions}
          setChatSessions={setChatSessions}
          materials={materials}
          materialGroups={materialGroups}
        />
      ) : view === 'materials' ? (
        <MaterialsView
          libraryMode="materials"
          materials={materials}
          localAssets={localAssets}
          setMaterials={setMaterials}
          materialGroups={materialGroups}
          setMaterialGroups={setMaterialGroups}
          workflowTemplates={workflowTemplates}
          onUpdateTemplate={updateWorkflowTemplate}
          onDeleteTemplate={deleteWorkflowTemplate}
          onUseMaterial={material => useLibraryItemInNewProject('material', material)}
          onUseTemplate={template => useLibraryItemInNewProject('template', template)}
        />
      ) : view === 'templates' ? (
        <MaterialsView
          libraryMode="templates"
          materials={materials}
          localAssets={localAssets}
          setMaterials={setMaterials}
          materialGroups={materialGroups}
          setMaterialGroups={setMaterialGroups}
          workflowTemplates={workflowTemplates}
          onUpdateTemplate={updateWorkflowTemplate}
          onDeleteTemplate={deleteWorkflowTemplate}
          onUseMaterial={material => useLibraryItemInNewProject('material', material)}
          onUseTemplate={template => useLibraryItemInNewProject('template', template)}
        />
      ) : view === 'settings' ? (
        <SettingsView
          runtimeSettings={runtimeSettings}
          loadState={runtimeSettingsLoadState}
          onSaveRuntimeSettings={saveRuntimeSettings}
        />
      ) : (
        <ProjectsView
          projects={projects}
          onCreateProject={createProject}
          onOpenProject={openProject}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onDeleteProjects={deleteProjects}
        />
      )}
    </div>
  );
}

export default App;
