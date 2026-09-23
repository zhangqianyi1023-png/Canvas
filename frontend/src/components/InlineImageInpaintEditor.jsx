import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'reactflow';
import Icon from './Icon';
import { IMAGE_RATIO_PRESETS, getDefaultImageRatioPresetId, getImageRatioSummary } from '../imageRatioPresets';
import {
  buildCapabilityOptions,
  buildImageRatioOptions,
  normalizeImageModelCapabilities,
  resolveCapabilityValue,
} from '../apimartModelSupport';
import { IMAGE_ACTION_TOOLBAR_GAP } from '../imageActionOverlayPosition';

const MIN_BRUSH_SIZE = 8;
const MAX_BRUSH_SIZE = 96;
const MAX_HISTORY = 30;
const PANEL_WIDTH = 420;

export const normalizeInlineImageModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

export const buildInlineImageProviders = (apiProviders = [], flattenedApis = [], requiredCapability = '') => {
  const providers = Array.isArray(apiProviders)
    ? apiProviders
        .filter(api => api?.enabled !== false && normalizeInlineImageModelList(api?.imageModels).length > 0)
        .map(api => {
          const modelCapabilities = normalizeImageModelCapabilities(api.imageModelCapabilities);
          const allModels = normalizeInlineImageModelList(api.imageModels);
          const models = requiredCapability && Object.keys(modelCapabilities).length > 0
            ? allModels.filter(model => modelCapabilities[model]?.capabilities?.[requiredCapability] === true)
            : allModels;
          return {
            id: api.id,
            name: api.name || 'API',
            protocol: api.protocol || 'openai',
            providerId: api.providerId || api.id,
            baseUrl: api.baseUrl || '',
            apiKey: api.apiKey || '',
            models,
            modelCapabilities,
            defaultModel: models.includes(api.defaultImageModel) ? api.defaultImageModel : models[0],
          };
        })
        .filter(api => api.models.length > 0)
    : [];

  if (providers.length > 0) return providers;

  const groups = new Map();
  (Array.isArray(flattenedApis) ? flattenedApis : [])
    .filter(api => api?.type === 'image')
    .forEach(api => {
      const id = api.providerId || api.baseUrl || api.id;
      const existing = groups.get(id);
      const models = [...(existing?.models || []), api.model].filter(Boolean);
      const modelCapabilities = {
        ...(existing?.modelCapabilities || {}),
        ...normalizeImageModelCapabilities(api.imageModelCapabilities),
      };
      groups.set(id, {
        id,
        name: api.providerName || api.name || 'API',
        protocol: api.protocol || 'openai',
        providerId: api.providerId || id,
        baseUrl: api.baseUrl || '',
        apiKey: api.apiKey || '',
        models: [...new Set(models)],
        modelCapabilities,
        defaultModel: existing?.defaultModel || api.model || '',
      });
    });
  return [...groups.values()];
};

export const clampInlineImageValue = (value, min, max) => Math.min(max, Math.max(min, value));

const getCanvasDpr = () => clampInlineImageValue(window.devicePixelRatio || 1, 1, 3);

const get2dContext = (canvas) => {
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) throw new Error('浏览器无法创建局部修改遮罩画布');
  return context;
};

const prepareCanvasContext = (canvas) => {
  const ctx = get2dContext(canvas);
  const dpr = Number(canvas.dataset.dpr || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
};

const clearCanvas = (canvas) => {
  const ctx = get2dContext(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  prepareCanvasContext(canvas);
};

const getCanvasPoint = (canvas, event, cachedRect = null) => {
  const rect = cachedRect || canvas.getBoundingClientRect();
  const dpr = Number(canvas.dataset.dpr || 1);
  const logicalWidth = canvas.width / dpr || rect.width;
  const logicalHeight = canvas.height / dpr || rect.height;
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
  return {
    x: clampInlineImageValue((event.clientX - rect.left) * scaleX, 0, logicalWidth),
    y: clampInlineImageValue((event.clientY - rect.top) * scaleY, 0, logicalHeight),
  };
};

const drawMaskLine = (ctx, from, to, { tool, brushSize }) => {
  ctx.save();
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = brushSize;
  if (from.x === to.x && from.y === to.y) {
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
};

const restoreCanvasImageData = (canvas, imageData) => {
  if (!canvas || !imageData) return prepareCanvasContext(canvas);
  const ctx = get2dContext(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(imageData, 0, 0);
  return prepareCanvasContext(canvas);
};

const drawMaskRect = (ctx, start, end, { tool }) => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 1 || height < 1) return;

  ctx.save();
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
};

const restoreCanvasFromDataUrl = (canvas, dataUrl, onDone) => {
  const image = new Image();
  image.onload = () => {
    const ctx = get2dContext(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    prepareCanvasContext(canvas);
    onDone?.();
  };
  image.src = dataUrl;
};

export const resolveInlineImageAnchorElement = (layer) => (
  layer?.closest?.('.result-image-expanded-card')
  || layer?.closest?.('.result-image-stack')
  || layer?.closest?.('.result-image-wrap')
  || layer?.closest?.('.result-image-toolbar-anchor')
  || layer?.parentElement
);

export const loadInlineImageSize = imageUrl => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve({
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0,
  });
  image.onerror = () => resolve({ width: 0, height: 0 });
  image.src = imageUrl;
});

export function InpaintPopoverControl({
  label,
  value,
  open,
  disabled = false,
  wide = false,
  onToggle,
  children,
}) {
  return (
    <div className={`inline-inpaint-popover-control ${wide ? 'is-wide' : ''}`}>
      <button
        type="button"
        className={`inline-inpaint-popover-trigger ${open ? 'active' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-label={label}
      >
        <span>{value}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open ? (
        <div className="inline-inpaint-popover" role="menu" aria-label={label}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function InlineImageInpaintEditor({
  imageUrl,
  anchorRef,
  apiConfigs = [],
  apiProviders = [],
  mode = 'inpaint',
  onCancel,
  onGenerate,
}) {
  const viewportTransform = useStore(state => state.transform);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const emptySnapshotRef = useRef('');
  const currentSnapshotRef = useRef('');
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const drawStateRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [toolbarAnchorRect, setToolbarAnchorRect] = useState(null);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(28);
  const [hasMask, setHasMask] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [imageSize, setImageSize] = useState('auto');
  const [imageSizePreset, setImageSizePreset] = useState(getDefaultImageRatioPresetId('auto'));
  const [resolution, setResolution] = useState('2k');
  const [count, setCount] = useState(1);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [openPopover, setOpenPopover] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const isEraseMode = mode === 'erase';
  const credits = count * (isEraseMode ? 8 : 12);

  const imageProviders = useMemo(
    () => buildInlineImageProviders(apiProviders, apiConfigs, 'inpaint'),
    [apiConfigs, apiProviders],
  );
  const selectedProvider = imageProviders.find(api => api.id === selectedProviderId) || imageProviders[0];
  const modelOptions = selectedProvider?.models || [];
  const activeModel = modelOptions.includes(selectedModel)
    ? selectedModel
    : selectedProvider?.defaultModel || modelOptions[0] || selectedModel || 'gpt-image-2';
  const activeModelSupport = selectedProvider?.modelCapabilities?.[activeModel] || null;
  const activeCapabilities = activeModelSupport?.adapted === true
    ? activeModelSupport.capabilities || {}
    : null;
  const ratioOptions = useMemo(
    () => buildImageRatioOptions(activeCapabilities, IMAGE_RATIO_PRESETS),
    [activeCapabilities],
  );
  const resolutionOptions = useMemo(
    () => buildCapabilityOptions(
      activeCapabilities?.resolutions,
      ['1k', '2k', '4k'].map(value => ({ value, label: value.toUpperCase() })),
    ),
    [activeCapabilities],
  );
  const resolvedImageSize = resolveCapabilityValue(
    imageSize,
    ratioOptions,
    activeCapabilities?.defaultRatio,
  ) || imageSize;
  const resolvedRatioOption = ratioOptions.find(option => option.value === resolvedImageSize);
  const resolvedResolution = resolveCapabilityValue(
    resolution,
    resolutionOptions,
    activeCapabilities?.defaultResolution,
  );
  const settingsSummary = [
    getImageRatioSummary(resolvedImageSize, resolvedRatioOption?.id || imageSizePreset),
    resolutionOptions.length > 0 ? String(resolvedResolution).toUpperCase() : '',
    `${count}张`,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (selectedProvider?.id && selectedProvider.id !== selectedProviderId) {
      setSelectedProviderId(selectedProvider.id);
    }
  }, [selectedProvider?.id, selectedProviderId]);

  useEffect(() => {
    if (activeModel && activeModel !== selectedModel) {
      setSelectedModel(activeModel);
    }
  }, [activeModel, selectedModel]);

  useEffect(() => {
    let cancelled = false;
    loadInlineImageSize(imageUrl).then(size => {
      if (!cancelled) setSourceSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const updateHistoryState = useCallback(() => {
    const canvas = canvasRef.current;
    const snapshot = canvas?.toDataURL('image/png') || '';
    currentSnapshotRef.current = snapshot;
    const nextHasMask = Boolean(snapshot && snapshot !== emptySnapshotRef.current);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    setHasMask(nextHasMask);
  }, []);

  const resizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);
    const dpr = getCanvasDpr();
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    const previous = document.createElement('canvas');
    previous.width = canvas.width || nextWidth;
    previous.height = canvas.height || nextHeight;
    get2dContext(previous).drawImage(canvas, 0, 0);

    canvas.dataset.dpr = String(dpr);
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    clearCanvas(canvas);
    if (previous.width > 0 && previous.height > 0) {
      const ctx = get2dContext(canvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(previous, 0, 0, nextWidth, nextHeight);
      prepareCanvasContext(canvas);
    }

    const empty = document.createElement('canvas');
    empty.width = nextWidth;
    empty.height = nextHeight;
    emptySnapshotRef.current = empty.toDataURL('image/png');
    updateHistoryState();
  }, [updateHistoryState]);

  useLayoutEffect(() => {
    resizeCanvas();
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  const updateAnchorRects = useCallback(() => {
    const anchor = resolveInlineImageAnchorElement(anchorRef.current);
    if (!anchor) return;
    const resultNode = anchor.closest?.('.result-node');
    const toolbarAnchor = resultNode?.querySelector?.('.node-header') || anchor;
    const readRect = element => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    };
    const nextAnchorRect = readRect(anchor);
    const nextToolbarAnchorRect = readRect(toolbarAnchor);
    setAnchorRect(current => (
      current?.left === nextAnchorRect.left
      && current?.top === nextAnchorRect.top
      && current?.width === nextAnchorRect.width
      && current?.height === nextAnchorRect.height
        ? current
        : nextAnchorRect
    ));
    setToolbarAnchorRect(current => (
      current?.left === nextToolbarAnchorRect.left
      && current?.top === nextToolbarAnchorRect.top
      && current?.width === nextToolbarAnchorRect.width
      && current?.height === nextToolbarAnchorRect.height
        ? current
        : nextToolbarAnchorRect
    ));
  }, [anchorRef]);

  useLayoutEffect(() => {
    let frameId = 0;
    const scheduleAnchorRectUpdate = () => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(() => {
          frameId = 0;
          updateAnchorRects();
        });
      }
    };

    updateAnchorRects();
    window.addEventListener('resize', scheduleAnchorRectUpdate);
    window.addEventListener('scroll', scheduleAnchorRectUpdate, true);
    window.addEventListener('wheel', scheduleAnchorRectUpdate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleAnchorRectUpdate);
      window.removeEventListener('scroll', scheduleAnchorRectUpdate, true);
      window.removeEventListener('wheel', scheduleAnchorRectUpdate);
    };
  }, [updateAnchorRects]);

  useLayoutEffect(() => {
    updateAnchorRects();
  }, [updateAnchorRects, viewportTransform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearCanvas(canvas);
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateHistoryState();
  }, [imageUrl, updateHistoryState]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (openPopover) {
          setOpenPopover(null);
          return;
        }
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, openPopover]);

  useEffect(() => {
    if (!openPopover) return undefined;

    const handleOutsidePointerDown = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.inline-inpaint-popover-control')) return;
      setOpenPopover(null);
    };

    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [openPopover]);

  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snapshot = currentSnapshotRef.current || canvas.toDataURL('image/png');
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY - 1)), snapshot];
    redoStackRef.current = [];
  }, []);

  const restoreSnapshot = useCallback((snapshot) => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    restoreCanvasFromDataUrl(canvas, snapshot, updateHistoryState);
  }, [updateHistoryState]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const previous = undoStackRef.current.pop();
    if (!canvas || !previous) return;
    const snapshot = currentSnapshotRef.current || canvas.toDataURL('image/png');
    redoStackRef.current = [...redoStackRef.current.slice(-(MAX_HISTORY - 1)), snapshot];
    restoreSnapshot(previous);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    const next = redoStackRef.current.pop();
    if (!canvas || !next) return;
    const snapshot = currentSnapshotRef.current || canvas.toDataURL('image/png');
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY - 1)), snapshot];
    restoreSnapshot(next);
  }, [restoreSnapshot]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasMask) return;
    pushUndo();
    clearCanvas(canvas);
    updateHistoryState();
  }, [hasMask, pushUndo, updateHistoryState]);

  const handlePointerDown = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || isGenerating) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const point = getCanvasPoint(canvas, event, rect);
    pushUndo();
    const context = prepareCanvasContext(canvas);
    drawStateRef.current = {
      pointerId: event.pointerId,
      start: point,
      last: point,
      rect,
      context,
      imageData: tool === 'rect' ? context.getImageData(0, 0, canvas.width, canvas.height) : null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === 'rect') {
      drawMaskRect(context, point, point, { tool: 'brush' });
    } else {
      drawMaskLine(context, point, point, { tool, brushSize });
    }
  }, [brushSize, isGenerating, pushUndo, tool]);

  const handlePointerMove = useCallback((event) => {
    const canvas = canvasRef.current;
    const draft = drawStateRef.current;
    if (!canvas || !draft || draft.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent || event;
    const coalescedEvents = nativeEvent.getCoalescedEvents?.() || [];
    const pointerEvents = coalescedEvents.length > 0 ? coalescedEvents : [nativeEvent];
    pointerEvents.forEach((pointerEvent) => {
      const point = getCanvasPoint(canvas, pointerEvent, draft.rect);
      if (tool === 'rect') {
        draft.context = restoreCanvasImageData(canvas, draft.imageData);
        drawMaskRect(draft.context, draft.start, point, { tool: 'brush' });
        draft.last = point;
      } else {
        drawMaskLine(draft.context, draft.last, point, { tool, brushSize });
        draft.last = point;
      }
    });
  }, [brushSize, tool]);

  const finishPointer = useCallback((event) => {
    const draft = drawStateRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drawStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    updateHistoryState();
  }, [updateHistoryState]);

  const buildMaskDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const width = sourceSize.width > 0 ? sourceSize.width : canvas.width;
    const height = sourceSize.height > 0 ? sourceSize.height : canvas.height;
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const ctx = mask.getContext('2d');
    ctx.drawImage(canvas, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const isPainted = pixels.data[index + 3] > 0;
      pixels.data[index] = 0;
      pixels.data[index + 1] = 0;
      pixels.data[index + 2] = 0;
      pixels.data[index + 3] = isPainted ? 0 : 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return mask.toDataURL('image/png');
  }, [sourceSize.height, sourceSize.width]);

  const handleRatioChange = useCallback((preset) => {
    setImageSize(preset.value);
    setImageSizePreset(preset.id);
  }, []);

  const togglePopover = useCallback((key) => {
    setOpenPopover(current => (current === key ? null : key));
  }, []);

  const selectProvider = useCallback((provider) => {
    setSelectedProviderId(provider.id);
    setSelectedModel(provider.defaultModel || provider.models?.[0] || '');
    setOpenPopover(null);
  }, []);

  const selectModel = useCallback((model) => {
    setSelectedModel(model);
    setOpenPopover(null);
  }, []);

  const submit = useCallback(async () => {
    const instruction = isEraseMode ? '擦除选中区域' : prompt.trim();
    if (!instruction || !hasMask || isGenerating) return;
    setErrorMessage('');
    setIsGenerating(true);
    try {
      await onGenerate?.({
        instruction,
        maskDataUrl: buildMaskDataUrl(),
        imageSize: {
          width: sourceSize.width,
          height: sourceSize.height,
        },
        providerId: selectedProvider?.id || '',
        model: activeModel,
        size: resolvedImageSize,
        sizePreset: resolvedRatioOption?.id || imageSizePreset,
        resolution: resolvedResolution,
        count,
        credits,
      });
      onCancel?.();
    } catch (error) {
      setErrorMessage(error?.message || (isEraseMode ? '擦除提交失败' : '局部修改提交失败'));
      setIsGenerating(false);
    }
  }, [activeModel, buildMaskDataUrl, count, credits, hasMask, imageSizePreset, isEraseMode, isGenerating, onCancel, onGenerate, prompt, resolvedImageSize, resolvedRatioOption?.id, resolvedResolution, selectedProvider?.id, sourceSize.height, sourceSize.width]);

  const toolbarPosition = toolbarAnchorRect
    ? {
        left: toolbarAnchorRect.left + toolbarAnchorRect.width / 2,
        top: Math.max(52, toolbarAnchorRect.top - IMAGE_ACTION_TOOLBAR_GAP),
      }
    : null;
  const panelPosition = anchorRect
    ? {
        left: clampInlineImageValue(
          anchorRect.left + anchorRect.width / 2 - PANEL_WIDTH / 2,
          12,
          Math.max(12, (window.innerWidth || PANEL_WIDTH) - PANEL_WIDTH - 12),
        ),
        top: Math.min(
          anchorRect.top + anchorRect.height + 16,
          Math.max(72, (window.innerHeight || 800) - 210),
        ),
      }
    : null;

  const toolbar = toolbarPosition && typeof document !== 'undefined'
    ? createPortal((
      <div
        className="inline-inpaint-toolbar nodrag nopan"
        role="toolbar"
        aria-label={isEraseMode ? '擦除工具栏' : '局部修改工具栏'}
        style={{ left: toolbarPosition.left, top: toolbarPosition.top }}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div className="inline-inpaint-toolbar-group inline-inpaint-cancel-group">
          <button type="button" className="inline-inpaint-labeled-button canvas-flow-hover-target" onClick={onCancel} data-tooltip={isEraseMode ? '退出擦除' : '退出局部修改'} aria-label={isEraseMode ? '退出擦除' : '退出局部修改'}>
            <Icon name="x" size={16} />
            <span>取消</span>
          </button>
        </div>
        <div className="inline-inpaint-toolbar-group inline-inpaint-tools">
          <button type="button" className={`canvas-flow-hover-target ${tool === 'brush' ? 'active' : ''}`} onClick={() => setTool('brush')} data-tooltip="画笔" aria-label="画笔" aria-pressed={tool === 'brush'}>
            <Icon name="edit" size={16} />
          </button>
          {isEraseMode ? (
            <button type="button" className={`canvas-flow-hover-target ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} data-tooltip="矩形" aria-label="矩形" aria-pressed={tool === 'rect'}>
              <Icon name="square" size={15} />
            </button>
          ) : null}
          <button type="button" className={`canvas-flow-hover-target ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} data-tooltip="橡皮" aria-label="橡皮" aria-pressed={tool === 'eraser'}>
            <Icon name="eraser" size={16} />
          </button>
          <span className="inline-inpaint-divider" aria-hidden="true" />
          <label className="inline-inpaint-size canvas-flow-hover-target" data-tooltip="画笔大小">
            <Icon name="batch" size={15} />
            <input
              type="range"
              min={MIN_BRUSH_SIZE}
              max={MAX_BRUSH_SIZE}
              step="1"
              value={brushSize}
              onChange={event => setBrushSize(Number(event.target.value))}
              aria-label="画笔大小"
            />
            <span>{brushSize}</span>
          </label>
          <span className="inline-inpaint-divider" aria-hidden="true" />
          <button type="button" className="canvas-flow-hover-target" onClick={undo} disabled={!canUndo} data-tooltip="撤销" aria-label="撤销">
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="canvas-flow-hover-target" onClick={redo} disabled={!canRedo} data-tooltip="重做" aria-label="重做">
            <Icon name="redo" size={16} />
          </button>
          <button type="button" className="canvas-flow-hover-target" onClick={clearMask} disabled={!hasMask} data-tooltip="清空遮罩" aria-label="清空遮罩">
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
    ), document.body)
    : null;

  const panel = panelPosition && typeof document !== 'undefined'
    ? createPortal((
      <div
        className="inline-inpaint-generator nodrag nopan"
        style={{ left: panelPosition.left, top: panelPosition.top }}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        {isEraseMode ? (
          <div className="inline-inpaint-prototype-note">
            <strong>擦除选中区域</strong>
            <span>原型模式 · 生成后会创建擦除结果节点</span>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="描述你想调整的内容..."
            rows={3}
            disabled={isGenerating}
          />
        )}
        {errorMessage ? <div className="inline-inpaint-error">{errorMessage}</div> : null}
        <div className="inline-inpaint-footer">
          {!isEraseMode ? (
            <InpaintPopoverControl
              label="图片 API"
              value={selectedProvider?.name || '未配置 API'}
              open={openPopover === 'provider'}
              disabled={isGenerating || imageProviders.length === 0}
              onToggle={() => togglePopover('provider')}
            >
              {imageProviders.length > 0
                ? imageProviders.map(provider => (
                  <button
                    type="button"
                    key={provider.id}
                    className={provider.id === selectedProvider?.id ? 'active' : ''}
                    onClick={() => selectProvider(provider)}
                    role="menuitem"
                  >
                    <span>{provider.name}</span>
                    {provider.id === selectedProvider?.id ? <Icon name="check" size={14} /> : null}
                  </button>
                ))
                : <div className="inline-inpaint-popover-empty">未配置 API</div>}
            </InpaintPopoverControl>
          ) : null}
          <InpaintPopoverControl
            label="图片模型"
            value={activeModel || '选择模型'}
            open={openPopover === 'model'}
            disabled={isGenerating || modelOptions.length === 0}
            onToggle={() => togglePopover('model')}
          >
            {modelOptions.length > 0
              ? modelOptions.map(model => (
                <button
                  type="button"
                  key={model}
                  className={model === activeModel ? 'active' : ''}
                  onClick={() => selectModel(model)}
                  role="menuitem"
                >
                  <span>{model}</span>
                  {model === activeModel ? <Icon name="check" size={14} /> : null}
                </button>
              ))
              : <div className="inline-inpaint-popover-empty">暂无模型</div>}
          </InpaintPopoverControl>
          <InpaintPopoverControl
            label={isEraseMode ? '擦除参数' : '局部修改参数'}
            value={settingsSummary}
            open={openPopover === 'settings'}
            disabled={isGenerating}
            wide
            onToggle={() => togglePopover('settings')}
          >
            <div className="inline-inpaint-settings-popover">
              <div className="inline-inpaint-setting-section">
                <span>比例</span>
                <div className="inline-inpaint-option-grid">
                  {ratioOptions.map(option => (
                    <button
                      type="button"
                      key={option.id}
                      className={resolvedRatioOption?.id === option.id ? 'active' : ''}
                      onClick={() => handleRatioChange(option)}
                    >
                      {option.value === 'auto' ? '智能' : option.value}
                    </button>
                  ))}
                </div>
              </div>
              {resolutionOptions.length > 0 && <div className="inline-inpaint-setting-section">
                <span>尺寸</span>
                <div className="inline-inpaint-option-row">
                  {resolutionOptions.map(option => (
                    <button type="button" key={option.value} className={resolvedResolution === option.value ? 'active' : ''} onClick={() => setResolution(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>}
              <div className="inline-inpaint-setting-section">
                <span>张数</span>
                <div className="inline-inpaint-option-row">
                  {[1, 2, 3, 4].map(value => (
                    <button type="button" key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>
                      {value}张
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </InpaintPopoverControl>
          <span className="inline-inpaint-credit-pill" aria-label={`需要 ${credits} 积分`}>
            <Icon name="lightning" size={13} />
            {credits}
          </span>
          <button
            type="button"
            className="inline-inpaint-run-btn"
            onClick={submit}
            disabled={isGenerating || !hasMask || (!isEraseMode && !prompt.trim())}
            title={!hasMask ? (isEraseMode ? '先在图片上画出擦除区域' : '先在图片上画出调整区域') : '生成'}
            aria-label={isEraseMode ? '生成擦除图片' : '生成局部修改图片'}
          >
            <Icon name={isGenerating ? 'loader' : 'play'} size={17} />
          </button>
        </div>
      </div>
    ), document.body)
    : null;

  return (
    <div
      ref={wrapRef}
      className="inline-image-inpaint nodrag nopan"
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      <canvas
        ref={canvasRef}
        className={`inline-inpaint-canvas tool-${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={finishPointer}
      />
      {toolbar}
      {panel}
    </div>
  );
}

export default InlineImageInpaintEditor;
