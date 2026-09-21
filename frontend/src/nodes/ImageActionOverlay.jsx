import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';
import InlineImageAnnotationEditor from '../components/InlineImageAnnotationEditor';
import InlineImageInpaintEditor from '../components/InlineImageInpaintEditor';
import InlineImagePerspectiveEditor from '../components/InlineImagePerspectiveEditor';
import { API_BASE } from '../apiBase';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';
import { resolveImageActionPortalPosition } from '../imageActionOverlayPosition';
import toolbarAnnotateIcon from '../assets/figma-image-actions/toolbar-annotate.svg';
import toolbarInpaintIcon from '../assets/figma-image-actions/toolbar-inpaint.svg';
import toolbarCropIcon from '../assets/figma-image-actions/toolbar-crop.svg';
import toolbarRotateIcon from '../assets/figma-image-actions/toolbar-rotate.svg';
import toolbarUploadIcon from '../assets/figma-image-actions/toolbar-upload.svg';
import toolbarFavoriteIcon from '../assets/figma-image-actions/toolbar-favorite.svg';
import toolbarDownloadIcon from '../assets/figma-image-actions/toolbar-download.svg';
import {
  CROP_RATIO_OPTIONS,
  DEFAULT_CROP,
  fitCropToRatio,
  moveCrop,
  normalizeFreeRotation,
  resizeCrop,
  resolveCropRatio,
} from '../imageCrop';
import { listCanvasToolbarActions } from '../canvasToolbarActions.js';

const actionItems = [
  { action: 'annotate', label: '标记', icon: 'palette', toolbarIcon: toolbarAnnotateIcon, sourceTypes: ['result'] },
  { action: 'inpaint', label: '局部修改', icon: 'edit', toolbarIcon: toolbarInpaintIcon, sourceTypes: ['result'] },
  { action: 'perspective', label: '角度控制', icon: 'compass', sourceTypes: ['result'] },
  { action: 'crop', label: '裁剪', icon: 'crop', toolbarIcon: toolbarCropIcon, separatorBefore: true },
  { action: 'rotate', label: '旋转', icon: 'rotateRight', toolbarIcon: toolbarRotateIcon, sourceTypes: ['result'] },
  { action: 'favorite', label: '收藏', icon: 'layers', toolbarIcon: toolbarFavoriteIcon, iconOnly: true },
  { action: 'download', label: '下载', icon: 'save', toolbarIcon: toolbarDownloadIcon, iconOnly: true },
];

const IMPLEMENTED_CANVAS_ACTIONS = new Set(
  listCanvasToolbarActions({ nodeType: 'image', implementedOnly: true })
    .map(item => item.id),
);

const isRegisteredImplementedAction = (action) => (
  IMPLEMENTED_CANVAS_ACTIONS.has(action)
  || (action === 'favorite' && IMPLEMENTED_CANVAS_ACTIONS.has('save-to-library'))
);

// 文件名兜底：去掉 URL 里可能存在的扩展名/查询串
const guessExtension = (url, mime) => {
  if (mime) {
    const sub = mime.split('/')[1];
    if (sub) return sub.replace('jpeg', 'jpg');
  }
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* ignore */
  }
  return 'png';
};

// 把 data: URL 转成 Blob；其他情况直接 fetch
// 对跨域图，优先走前端 fetch（同源 / 配了 CORS 的图能直接拿 blob）；
// 失败则走后端中转 /api/proxy/download（任何 URL 都能转成 blob）
const fetchAsBlob = async (url) => {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    return res.blob();
  }
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return res.blob();
  } catch {
    // 跨域无 CORS 头，落到中转
  }
  const proxyUrl = `${API_BASE}/api/proxy/download?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  return res.blob();
};

const downloadImage = async (url, name = 'canvas-image') => {
  if (!url) return;
  try {
    const blob = await fetchAsBlob(url);
    const ext = guessExtension(url, blob.type);
    const filename = `${name}.${ext}`;
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 留一帧再释放，避免某些浏览器还没真正开始下载就把 blob URL 撤了
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    console.error('图片下载失败:', err);
    alert(`图片下载失败：${err?.message || err}`);
  }
};

const getRotatedViewportSize = (width, height, rotation) => {
  const radians = normalizeFreeRotation(rotation) * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
};

const resolveRotationAnchor = (layer) => (
  layer?.closest?.('.result-image-expanded-card')
  || layer?.closest?.('.result-image-stack')
  || layer?.closest?.('.result-image-wrap')
  || layer?.closest?.('.result-image-toolbar-anchor')
  || layer?.parentElement
);

function ImageRotationEditor({
  imageUrl,
  anchorRef,
  onCancel,
  onSave,
}) {
  const [rect, setRect] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [angleText, setAngleText] = useState('0');
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const dragRef = useRef(null);

  useLayoutEffect(() => {
    let frameId = 0;
    const updateRect = () => {
      const anchor = resolveRotationAnchor(anchorRef.current);
      if (!anchor) return;
      const next = anchor.getBoundingClientRect();
      setRect((current) => {
        const rounded = {
          left: Math.round(next.left * 10) / 10,
          top: Math.round(next.top * 10) / 10,
          width: Math.round(next.width * 10) / 10,
          height: Math.round(next.height * 10) / 10,
        };
        if (
          current?.left === rounded.left
          && current?.top === rounded.top
          && current?.width === rounded.width
          && current?.height === rounded.height
        ) {
          return current;
        }
        return rounded;
      });
      frameId = window.requestAnimationFrame(updateRect);
    };

    updateRect();
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorRef]);

  useEffect(() => {
    setRotation(0);
    setAngleText('0');
    setFlipX(false);
    setFlipY(false);
    setError('');
    setIsSaving(false);
  }, [imageUrl]);

  useEffect(() => {
    if (document.activeElement?.classList?.contains('image-rotation-angle-input')) return;
    setAngleText(String(Math.round(normalizeFreeRotation(rotation))));
  }, [rotation]);

  const getPointerAngle = useCallback((event) => {
    const current = rect;
    if (!current) return 0;
    const centerX = current.left + current.width / 2;
    const centerY = current.top + current.height / 2;
    return Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
  }, [rect]);

  const beginRotate = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!rect || isSaving) return;
    dragRef.current = {
      pointerAngle: getPointerAngle(event),
      rotation,
      shiftKey: event.shiftKey,
    };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const drag = dragRef.current;
      if (!drag) return;
      const delta = getPointerAngle(moveEvent) - drag.pointerAngle;
      let next = normalizeFreeRotation(drag.rotation + delta);
      if (moveEvent.shiftKey || drag.shiftKey) {
        next = Math.round(next / 15) * 15;
      }
      const normalized = normalizeFreeRotation(next);
      setRotation(normalized);
      setAngleText(String(Math.round(normalized)));
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
  }, [getPointerAngle, isSaving, rect, rotation]);

  const commitAngleText = useCallback(() => {
    const parsed = Number.parseFloat(angleText);
    if (!Number.isFinite(parsed)) {
      setAngleText(String(Math.round(normalizeFreeRotation(rotation))));
      return;
    }
    const next = normalizeFreeRotation(parsed);
    setRotation(next);
    setAngleText(String(Math.round(next)));
  }, [angleText, rotation]);

  const rotateByRightAngle = useCallback(() => {
    if (isSaving) return;
    const next = normalizeFreeRotation(rotation + 90);
    setRotation(next);
    setAngleText(String(Math.round(next)));
  }, [isSaving, rotation]);

  const saveRotation = useCallback(async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isSaving) return;
    setError('');
    setIsSaving(true);
    try {
      await onSave({
        rotation: normalizeFreeRotation(rotation),
        flipX,
        flipY,
      });
      onCancel();
    } catch (err) {
      setError(err?.message || '旋转保存失败');
      setIsSaving(false);
    }
  }, [flipX, flipY, isSaving, onCancel, onSave, rotation]);

  if (!rect || !imageUrl || typeof document === 'undefined') return null;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const rotatedSize = getRotatedViewportSize(rect.width, rect.height, rotation);
  const stagePadding = 26;
  const stageWidth = Math.min(
    window.innerWidth - 48,
    Math.max(rect.width, rotatedSize.width) + stagePadding * 2,
  );
  const stageHeight = Math.min(
    window.innerHeight - 132,
    Math.max(rect.height, rotatedSize.height) + stagePadding * 2,
  );
  const toolbarTop = Math.max(52, centerY - stageHeight / 2 - 16);

  return createPortal(
    <div
      className="image-rotation-editor nodrag nopan"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="image-rotation-stage"
        style={{
          left: centerX,
          top: centerY,
          width: stageWidth,
          height: stageHeight,
        }}
      />
      <div
        className="image-rotation-frame"
        style={{
          left: centerX,
          top: centerY,
          width: rect.width,
          height: rect.height,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{ transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` }}
        />
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
          <button
            key={corner}
            type="button"
            className={`image-rotation-corner ${corner}`}
            onPointerDown={beginRotate}
            aria-label="拖动旋转图片"
            title="拖动旋转图片"
            disabled={isSaving}
          />
        ))}
        <button
          type="button"
          className="image-rotation-handle"
          onPointerDown={beginRotate}
          aria-label="拖动旋转图片"
          title="拖动旋转图片"
          disabled={isSaving}
        >
          <Icon name="rotateRight" size={15} />
        </button>
      </div>
      <div
        className="image-rotation-toolbar"
        style={{
          left: centerX,
          top: toolbarTop,
        }}
      >
        <div className="image-rotation-toolbar-group">
          <button
            type="button"
            className="image-rotation-text-button"
            onClick={onCancel}
            aria-label="取消旋转"
            disabled={isSaving}
          >
            <Icon name="x" size={16} />
            <span>取消</span>
          </button>
        </div>

        <div className="image-rotation-toolbar-group image-rotation-controls">
          <label className="image-rotation-degree-field" aria-label="当前旋转角度">
            <span className="image-rotation-sr-only">旋转角度</span>
            <input
              className="image-rotation-angle-input"
              type="number"
              min="-180"
              max="180"
              step="1"
              value={angleText}
              inputMode="decimal"
              disabled={isSaving}
              onChange={event => setAngleText(event.target.value)}
              onBlur={commitAngleText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              aria-label="旋转角度"
            />
            <span aria-hidden="true">°</span>
          </label>
          <input
            className="image-rotation-range"
            type="range"
            min="-180"
            max="180"
            step="1"
            value={rotation}
            disabled={isSaving}
            onChange={(event) => {
              const next = normalizeFreeRotation(event.target.value);
              setRotation(next);
              setAngleText(String(Math.round(next)));
            }}
            aria-label="旋转角度"
          />
          <span className="image-rotation-divider" aria-hidden="true" />
          <button
            type="button"
            className="image-rotation-icon-button"
            onClick={rotateByRightAngle}
            aria-label="顺时针旋转 90°"
            data-tooltip="顺时针旋转 90°"
            disabled={isSaving}
          >
            <Icon name="rotateRight" size={16} />
          </button>
          <button
            type="button"
            className={`image-rotation-icon-button ${flipY ? 'active' : ''}`}
            onClick={() => setFlipY(value => !value)}
            aria-label="垂直镜像"
            aria-pressed={flipY}
            data-tooltip="垂直镜像"
            disabled={isSaving}
          >
            <Icon name="mirrorVertical" size={16} />
          </button>
          <button
            type="button"
            className={`image-rotation-icon-button ${flipX ? 'active' : ''}`}
            onClick={() => setFlipX(value => !value)}
            aria-label="水平镜像"
            aria-pressed={flipX}
            data-tooltip="水平镜像"
            disabled={isSaving}
          >
            <Icon name="mirrorHorizontal" size={16} />
          </button>
        </div>

        <div className="image-rotation-toolbar-group">
          {error ? <span className="image-rotation-error">{error}</span> : null}
          <button
            type="button"
            className="image-rotation-text-button image-rotation-save-button"
            onClick={saveRotation}
            disabled={isSaving}
          >
            <Icon name={isSaving ? 'loader' : 'check'} size={16} />
            <span>{isSaving ? '保存中' : '保存'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ImageActionOverlay({
  imageUrl,
  nodeId,
  sourceType,
  imageIndex = 0,
  sourceHandle = null,
  onAction,
  onUpload,
  forceVisible = false,
  onToolbarPointerEnter,
  onToolbarPointerLeave,
  portalToolbar = false,
  hasPendingTasks = false,
  apiConfigs = [],
  apiProviders = [],
  rotationAutoOpenToken = '',
  onEditingChange,
  enableCropEditor = false,
  suppressToolbar = false,
}) {
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [inpaintOpen, setInpaintOpen] = useState(false);
  const [perspectiveOpen, setPerspectiveOpen] = useState(false);
  const [rotationOpen, setRotationOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropDraft, setCropDraft] = useState({ ...DEFAULT_CROP });
  const [cropPreset, setCropPreset] = useState('free');
  const [cropImageSize, setCropImageSize] = useState({ width: 1, height: 1 });
  const [cropRatioOpen, setCropRatioOpen] = useState(false);
  const [isCropSaving, setIsCropSaving] = useState(false);
  const [cropError, setCropError] = useState('');
  const openedRotationTokenRef = useRef('');
  const layerRef = useRef(null);
  const toolbarRef = useRef(null);
  const [portalPosition, setPortalPosition] = useState(null);
  const cropPointerCleanupRef = useRef(null);
  const imageActions = imageUrl ? actionItems.filter(item => (
    isRegisteredImplementedAction(item.action)
    && (!item.sourceTypes || item.sourceTypes.includes(sourceType))
  )) : [];
  const uploadAction = onUpload
    ? {
        action: 'upload',
        label: imageUrl ? '重新上传' : '上传图片',
        icon: 'image',
        toolbarIcon: toolbarUploadIcon,
        iconOnly: Boolean(imageUrl),
      }
    : null;
  const beforeUploadActions = imageActions.filter(item => (
    item.action === 'annotate'
    || item.action === 'inpaint'
    || item.action === 'perspective'
    || item.action === 'crop'
    || item.action === 'rotate'
  ));
  const afterUploadActions = imageActions.filter(item => item.action === 'favorite' || item.action === 'download');
  const primaryToolbarActions = beforeUploadActions;
  const secondaryToolbarActions = [
    ...(uploadAction ? [uploadAction] : []),
    ...afterUploadActions,
  ];
  const pendingToolbarAction = hasPendingTasks
    ? { action: 'query', label: '查询', icon: 'refresh' }
    : null;
  const toolbarGroups = [
    ...(primaryToolbarActions.length > 0
      ? [{ key: 'primary', actions: primaryToolbarActions }]
      : []),
    ...(secondaryToolbarActions.length > 0
      ? [{ key: 'secondary', actions: secondaryToolbarActions, separatorBefore: primaryToolbarActions.length > 0 }]
      : []),
    ...(pendingToolbarAction
      ? [{ key: 'pending', actions: [pendingToolbarAction], separatorBefore: primaryToolbarActions.length > 0 || secondaryToolbarActions.length > 0 }]
      : []),
  ];
  const visibleActions = toolbarGroups.flatMap(group => group.actions);

  const closeInpaint = useCallback(() => {
    setInpaintOpen(false);
  }, []);

  const closeAnnotation = useCallback(() => {
    setAnnotationOpen(false);
  }, []);

  const closePerspective = useCallback(() => {
    setPerspectiveOpen(false);
  }, []);

  const cancelRotation = useCallback(() => {
    setRotationOpen(false);
    if (!rotationAutoOpenToken) return;
    onAction?.('rotateCancel', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      rotationAutoOpenToken,
    });
  }, [imageIndex, imageUrl, nodeId, onAction, rotationAutoOpenToken, sourceHandle, sourceType]);

  useLayoutEffect(() => {
    if (!portalToolbar || !forceVisible) {
      setPortalPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const resultNode = layerRef.current?.closest?.('.result-node');
      const nodeHeader = resultNode?.querySelector?.('.node-header');
      const expandedCard = layerRef.current?.closest?.('.result-image-expanded-card');
      const anchor = expandedCard
        || nodeHeader
        || layerRef.current?.closest?.('.result-image-toolbar-anchor')
        || layerRef.current?.closest?.('.result-image-wrap')
        || resultNode
        || layerRef.current?.parentElement;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const nextPosition = resolveImageActionPortalPosition(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setPortalPosition((current) => {
        if (!nextPosition) return current === null ? current : null;
        if (current?.left === nextPosition.left && current?.top === nextPosition.top) {
          return current;
        }
        return nextPosition;
      });
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [forceVisible, portalToolbar]);

  useEffect(() => {
    if (!rotationAutoOpenToken || !imageUrl) return;
    if (openedRotationTokenRef.current === rotationAutoOpenToken) return;
    openedRotationTokenRef.current = rotationAutoOpenToken;
    setAnnotationOpen(false);
    setInpaintOpen(false);
    setPerspectiveOpen(false);
    setCropOpen(false);
    setRotationOpen(true);
  }, [imageUrl, rotationAutoOpenToken]);

  useEffect(() => {
    if (!rotationOpen) return undefined;
    const anchor = resolveRotationAnchor(layerRef.current);
    if (!anchor) return undefined;
    anchor.classList.add('is-rotation-editing');
    return () => {
      anchor.classList.remove('is-rotation-editing');
    };
  }, [rotationOpen]);

  useEffect(() => {
    if (!annotationOpen && !inpaintOpen && !perspectiveOpen && !cropOpen) return undefined;
    const anchor = resolveRotationAnchor(layerRef.current);
    if (!anchor) return undefined;
    anchor.classList.add('is-image-action-editing');
    if (annotationOpen) anchor.classList.add('is-annotation-editing');
    if (inpaintOpen) anchor.classList.add('is-inpaint-editing');
    if (perspectiveOpen) anchor.classList.add('is-perspective-editing');
    return () => {
      anchor.classList.remove('is-image-action-editing');
      anchor.classList.remove('is-annotation-editing');
      anchor.classList.remove('is-inpaint-editing');
      anchor.classList.remove('is-perspective-editing');
    };
  }, [annotationOpen, cropOpen, inpaintOpen, perspectiveOpen]);

  useEffect(() => {
    onEditingChange?.(annotationOpen || inpaintOpen || perspectiveOpen || rotationOpen || cropOpen);
  }, [annotationOpen, cropOpen, inpaintOpen, onEditingChange, perspectiveOpen, rotationOpen]);

  useEffect(() => () => {
    cropPointerCleanupRef.current?.();
  }, []);

  const emitAction = useCallback((action, extra = {}) => {
    if (action === 'download') {
      downloadImage(imageUrl, `image-${nodeId}`);
      return;
    }

    if (action === 'inpaint') {
      setAnnotationOpen(false);
      setPerspectiveOpen(false);
      setInpaintOpen(true);
      return;
    }

    if (action === 'perspective') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setRotationOpen(false);
      setPerspectiveOpen(true);
      return;
    }

    if (action === 'crop' && enableCropEditor) {
      const image = layerRef.current?.parentElement?.querySelector?.(':scope > img');
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setPerspectiveOpen(false);
      setRotationOpen(false);
      setCropImageSize({
        width: image?.naturalWidth || image?.clientWidth || 1,
        height: image?.naturalHeight || image?.clientHeight || 1,
      });
      setCropPreset('free');
      setCropDraft({ ...DEFAULT_CROP });
      setCropRatioOpen(false);
      setCropError('');
      setCropOpen(true);
      return;
    }

    if (action === 'annotate') {
      setInpaintOpen(false);
      setPerspectiveOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setAnnotationOpen(true);
      return;
    }

    if (action === 'rotate') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setPerspectiveOpen(false);
      setCropOpen(false);
      onAction?.('rotateCreate', {
        imageUrl,
        nodeId,
        sourceType,
        imageIndex,
        sourceHandle,
        ...extra,
      });
      return;
    }

    if (action === 'upload') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setPerspectiveOpen(false);
      setCropOpen(false);
      onUpload?.();
      return;
    }

    onAction?.(action, {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      ...extra,
    });
  }, [enableCropEditor, imageIndex, imageUrl, nodeId, onAction, onUpload, sourceHandle, sourceType]);

  const cancelCrop = useCallback(() => {
    if (isCropSaving) return;
    cropPointerCleanupRef.current?.();
    setCropRatioOpen(false);
    setCropError('');
    setCropOpen(false);
  }, [isCropSaving]);

  useEffect(() => {
    if (!cropOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelCrop();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelCrop, cropOpen]);

  useEffect(() => {
    if (!cropOpen || forceVisible || isCropSaving) return undefined;
    const timeoutId = window.setTimeout(cancelCrop, 0);
    return () => window.clearTimeout(timeoutId);
  }, [cancelCrop, cropOpen, forceVisible, isCropSaving]);

  const applyCropPreset = useCallback((preset) => {
    const pixelRatio = resolveCropRatio(preset, cropImageSize.width, cropImageSize.height, 0);
    setCropPreset(preset);
    setCropDraft(current => (
      pixelRatio ? fitCropToRatio(current, pixelRatio, cropImageSize) : { ...current }
    ));
    setCropRatioOpen(false);
  }, [cropImageSize]);

  const resetCrop = useCallback(() => {
    const pixelRatio = resolveCropRatio(cropPreset, cropImageSize.width, cropImageSize.height, 0);
    setCropDraft(pixelRatio
      ? fitCropToRatio({ ...DEFAULT_CROP }, pixelRatio, cropImageSize)
      : { ...DEFAULT_CROP });
  }, [cropImageSize, cropPreset]);

  const beginCropInteraction = useCallback((event, handle = 'move') => {
    if (event.button !== 0 || isCropSaving) return;
    const bounds = layerRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    event.preventDefault();
    event.stopPropagation();

    cropPointerCleanupRef.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const startCrop = { ...cropDraft };
    const pixelRatio = resolveCropRatio(cropPreset, cropImageSize.width, cropImageSize.height, 0);

    const handlePointerMove = moveEvent => {
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - startX) / bounds.width;
      const dy = (moveEvent.clientY - startY) / bounds.height;
      setCropDraft(handle === 'move'
        ? moveCrop(startCrop, dx, dy)
        : resizeCrop({
            crop: startCrop,
            dx,
            dy,
            handle,
            pixelRatio,
            imageSize: cropImageSize,
          }));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      cropPointerCleanupRef.current = null;
    };
    cropPointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  }, [cropDraft, cropImageSize, cropPreset, isCropSaving]);

  const saveCrop = useCallback(async () => {
    if (isCropSaving) return;
    setCropError('');
    setIsCropSaving(true);
    try {
      await onAction?.('cropSave', {
        imageUrl,
        nodeId,
        sourceType,
        imageIndex,
        sourceHandle,
        crop: cropDraft,
      });
      setCropRatioOpen(false);
      setCropOpen(false);
    } catch (error) {
      setCropError(error?.message || '图片裁剪保存失败，请重试');
    } finally {
      setIsCropSaving(false);
    }
  }, [cropDraft, imageIndex, imageUrl, isCropSaving, nodeId, onAction, sourceHandle, sourceType]);

  const saveRotation = useCallback((transform) => (
    onAction?.('rotateCommit', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      rotation: transform?.rotation,
      flipX: transform?.flipX,
      flipY: transform?.flipY,
    })
  ), [imageIndex, imageUrl, nodeId, onAction, sourceHandle, sourceType]);

  const submitInpaint = useCallback((payload) => (
    onAction?.('inpaintGenerate', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      ...payload,
    })
  ), [imageIndex, imageUrl, nodeId, onAction, sourceHandle, sourceType]);

  const submitPerspective = useCallback((payload) => (
    onAction?.('perspectiveGenerate', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      ...payload,
    })
  ), [imageIndex, imageUrl, nodeId, onAction, sourceHandle, sourceType]);

  const submitAnnotation = useCallback(async (payload) => {
    await onAction?.('annotationSubmit', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      ...payload,
    });
    setAnnotationOpen(false);
  }, [imageIndex, imageUrl, nodeId, onAction, sourceHandle, sourceType]);

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`image-action-toolbar nodrag ${portalToolbar ? 'result-image-portal-toolbar' : ''}`}
      style={portalToolbar && portalPosition ? { left: portalPosition.left, top: portalPosition.top } : undefined}
      onPointerEnter={onToolbarPointerEnter}
      onPointerLeave={onToolbarPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {toolbarGroups.map(group => (
        <div
          key={group.key}
          className={[
            'image-action-toolbar-group',
            group.separatorBefore ? 'with-separator' : '',
          ].filter(Boolean).join(' ')}
        >
          {group.actions.map((item, index) => (
            <button
              key={item.action}
              type="button"
              className={[
                item.separatorBefore && index > 0 ? 'with-separator' : '',
                item.action === 'annotate' && annotationOpen ? 'active' : '',
                item.action === 'inpaint' && inpaintOpen ? 'active' : '',
                item.action === 'perspective' && perspectiveOpen ? 'active' : '',
                item.tone === 'danger' ? 'danger' : '',
                item.iconOnly ? 'is-icon-only' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => emitAction(item.action)}
              data-tooltip={item.label}
              aria-label={item.label}
            >
              <span className="image-action-toolbar-icon" aria-hidden="true">
                {item.toolbarIcon
                  ? <img src={item.toolbarIcon} alt="" />
                  : <Icon name={item.icon} size={16} />}
              </span>
              <span className="image-action-toolbar-label">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  const cropToolbar = (
    <div
      ref={toolbarRef}
      className="image-crop-toolbar nodrag nopan"
      style={portalPosition ? { left: portalPosition.left, top: portalPosition.top } : undefined}
      onPointerEnter={onToolbarPointerEnter}
      onPointerLeave={onToolbarPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="image-crop-toolbar-group">
        <button type="button" onClick={cancelCrop} disabled={isCropSaving}>
          <Icon name="x" size={16} />
          <span>取消</span>
        </button>
      </div>
      <div className="image-crop-toolbar-group image-crop-toolbar-controls">
        <div className="image-crop-ratio-control">
          <button
            type="button"
            aria-expanded={cropRatioOpen}
            onClick={() => setCropRatioOpen(current => !current)}
            disabled={isCropSaving}
          >
            <Icon name="crop" size={16} />
            <span>宽高比</span>
          </button>
          {cropRatioOpen && (
            <div className="image-crop-ratio-menu" role="menu">
              {CROP_RATIO_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={cropPreset === option.id ? 'active' : ''}
                  role="menuitemradio"
                  aria-checked={cropPreset === option.id}
                  onClick={() => applyCropPreset(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={resetCrop} disabled={isCropSaving}>
          <Icon name="refresh" size={16} />
          <span>重置</span>
        </button>
      </div>
      <div className="image-crop-toolbar-group">
        <button type="button" onClick={saveCrop} disabled={isCropSaving}>
          <Icon name={isCropSaving ? 'loader' : 'check'} size={16} />
          <span>{isCropSaving ? '保存中' : '保存'}</span>
        </button>
      </div>
      {cropError ? <span className="image-crop-toolbar-error">{cropError}</span> : null}
    </div>
  );

  const wheelHandoffEnabled = visibleActions.length > 0
    && !rotationOpen
    && !annotationOpen
    && !inpaintOpen
    && !perspectiveOpen
    && !suppressToolbar
    && (!portalToolbar || (forceVisible && Boolean(portalPosition)));

  useCanvasWheelHandoff(toolbarRef, {
    enabled: wheelHandoffEnabled,
  });

  return (
    <div ref={layerRef} className={`image-action-layer ${forceVisible ? 'is-open' : ''} ${annotationOpen ? 'is-annotating' : ''} ${inpaintOpen ? 'is-inpainting' : ''} ${perspectiveOpen ? 'is-perspective' : ''} ${cropOpen ? 'is-cropping' : ''}`}>
      {!suppressToolbar && !annotationOpen && !inpaintOpen && !perspectiveOpen && !rotationOpen && !cropOpen && !portalToolbar ? toolbar : null}
      {!suppressToolbar && !annotationOpen && !inpaintOpen && !perspectiveOpen && !rotationOpen && !cropOpen && portalToolbar && forceVisible && portalPosition && typeof document !== 'undefined'
        ? createPortal(toolbar, document.body)
        : null}
      {cropOpen && portalToolbar && forceVisible && portalPosition && typeof document !== 'undefined'
        ? createPortal(cropToolbar, document.body)
        : null}

      {annotationOpen && imageUrl ? (
        <InlineImageAnnotationEditor
          imageUrl={imageUrl}
          onCancel={closeAnnotation}
          onDone={submitAnnotation}
        />
      ) : null}
      {inpaintOpen && imageUrl ? (
        <InlineImageInpaintEditor
          imageUrl={imageUrl}
          anchorRef={layerRef}
          apiConfigs={apiConfigs}
          apiProviders={apiProviders}
          onCancel={closeInpaint}
          onGenerate={submitInpaint}
        />
      ) : null}
      {perspectiveOpen && imageUrl ? (
        <InlineImagePerspectiveEditor
          imageUrl={imageUrl}
          anchorRef={layerRef}
          apiConfigs={apiConfigs}
          apiProviders={apiProviders}
          onCancel={closePerspective}
          onGenerate={submitPerspective}
        />
      ) : null}
      {cropOpen && imageUrl ? (
        <div
          className="image-crop-selection nodrag nopan"
          style={{
            left: `${cropDraft.x * 100}%`,
            top: `${cropDraft.y * 100}%`,
            width: `${cropDraft.width * 100}%`,
            height: `${cropDraft.height * 100}%`,
          }}
          onPointerDown={event => beginCropInteraction(event, 'move')}
        >
          <span className="image-crop-grid image-crop-grid-v first" aria-hidden="true" />
          <span className="image-crop-grid image-crop-grid-v second" aria-hidden="true" />
          <span className="image-crop-grid image-crop-grid-h first" aria-hidden="true" />
          <span className="image-crop-grid image-crop-grid-h second" aria-hidden="true" />
          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => (
            <button
              key={handle}
              type="button"
              className={`image-crop-handle is-${handle}`}
              aria-label={`调整裁剪区域 ${handle}`}
              onPointerDown={event => beginCropInteraction(event, handle)}
              disabled={isCropSaving}
            />
          ))}
        </div>
      ) : null}
      {rotationOpen && imageUrl ? (
        <ImageRotationEditor
          imageUrl={imageUrl}
          anchorRef={layerRef}
          onCancel={cancelRotation}
          onSave={saveRotation}
        />
      ) : null}
    </div>
  );
}

export default ImageActionOverlay;
