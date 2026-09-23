import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';
import InlineImageAnnotationEditor from '../components/InlineImageAnnotationEditor';
import InlineImageInpaintEditor from '../components/InlineImageInpaintEditor';
import InlineImagePerspectiveEditor from '../components/InlineImagePerspectiveEditor';
import CanvasImagePrototype from '../components/CanvasImagePrototype';
import { NodeTagColorMenuItems, NodeTagPickerButtonContent, getNodeTagPickerTitle } from '../components/NodeTagPicker';
import { API_BASE } from '../apiBase';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';
import { resolveImageActionPortalPosition } from '../imageActionOverlayPosition';
import toolbarInpaintIcon from '../assets/figma-image-actions/toolbar-inpaint.svg';
import toolbarCropIcon from '../assets/figma-image-actions/toolbar-crop.svg';
import toolbarUploadIcon from '../assets/figma-image-actions/toolbar-upload.svg';
import toolbarFavoriteIcon from '../assets/figma-image-actions/toolbar-favorite.svg';
import toolbarDownloadIcon from '../assets/figma-image-actions/toolbar-download.svg';
import { normalizeNodeTagColors } from '../nodeTagColors';
import {
  CROP_RATIO_OPTIONS,
  DEFAULT_CROP,
  fitCropToRatio,
  moveCrop,
  normalizeFreeRotation,
  resizeCrop,
  resolveCropRatio,
} from '../imageCrop';
import {
  GRID_SPLIT_PRESETS,
  buildSelectedGridCells,
  clampGridCut,
  createGridSplitState,
  getGridCellCrop,
  getGridCellKey,
} from '../imageGridSplit';
import { listCanvasToolbarActions } from '../canvasToolbarActions.js';

const actionItems = [
  { action: 'crop', label: '裁剪', icon: 'crop', toolbarIcon: toolbarCropIcon },
  { action: 'perspective', label: '角度控制', icon: 'angleControl', sourceTypes: ['result'] },
  { action: 'inpaint', label: '局部修改', icon: 'edit', toolbarIcon: toolbarInpaintIcon, sourceTypes: ['result'] },
  { action: 'lighting', label: '打光', icon: 'sun', sourceTypes: ['result'] },
  { action: 'outpaint', label: '扩图', icon: 'image' },
  { action: 'resize', label: '调整像素', icon: 'expandDiagonal' },
  { action: 'enhance', label: '增强', icon: 'spark' },
  { action: 'rotate', label: '旋转', icon: 'rotateImage', sourceTypes: ['result'] },
  { action: 'erase', label: '擦除', icon: 'erase' },
  { action: 'cutout', label: '抠图', icon: 'scissors' },
  { action: 'annotate', label: '标注', icon: 'edit', sourceTypes: ['result'] },
  { action: 'gridSplit', label: '宫格拆分', icon: 'grid', sourceTypes: ['result'] },
  { action: 'seedanceCompliance', label: 'Seedance2.0 合规认证', icon: 'certificate', sourceTypes: ['result'] },
  { action: 'split', label: 'Quick Split', icon: 'grid' },
  { action: 'favorite', label: '保存到素材库', icon: 'layers', toolbarIcon: toolbarFavoriteIcon, iconOnly: true },
  { action: 'download', label: '下载', icon: 'save', toolbarIcon: toolbarDownloadIcon, iconOnly: true },
];

const IMAGE_EDIT_ACTION_ORDER = [
  'crop',
  'perspective',
  'inpaint',
  'lighting',
  'outpaint',
  'gridSplit',
];

const IMAGE_MORE_ACTION_ORDER = [
  'enhance',
  'resize',
  'cutout',
  'annotate',
  'erase',
  'seedanceCompliance',
  'rotate',
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

const LIGHTING_POSITION_OPTIONS = [
  { id: 'left', label: '左侧', point: { x: 0.24, y: 0.5 } },
  { id: 'top', label: '顶部', point: { x: 0.5, y: 0.2 } },
  { id: 'right', label: '右侧', point: { x: 0.76, y: 0.5 } },
  { id: 'front', label: '前方', point: { x: 0.5, y: 0.58 } },
  { id: 'bottom', label: '底部', point: { x: 0.5, y: 0.8 } },
  { id: 'back', label: '后方', point: { x: 0.5, y: 0.34 } },
];

const LIGHTING_EDITOR_GAP = 14;

const resolveLightingEditorPosition = (anchorRect) => {
  if (!anchorRect?.width || !anchorRect?.height) return null;

  return {
    left: Math.round((anchorRect.left + anchorRect.width / 2) * 10) / 10,
    top: Math.round((anchorRect.bottom + LIGHTING_EDITOR_GAP) * 10) / 10,
  };
};

const clampLightPoint = ({ x, y }) => {
  const center = 0.5;
  const dx = x - center;
  const dy = y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const maxDistance = 0.47;
  if (distance <= maxDistance) {
    return {
      x: Math.min(0.97, Math.max(0.03, x)),
      y: Math.min(0.97, Math.max(0.03, y)),
    };
  }
  const scale = maxDistance / distance;
  return {
    x: center + dx * scale,
    y: center + dy * scale,
  };
};

function ThermometerIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 14.76V5.5a3 3 0 0 0-6 0v9.26a5 5 0 1 0 6 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 6v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const clampLightingValue = (value, min, max, step = 1) => {
  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed)) return min;
  const rounded = Math.round(parsed / step) * step;
  return Math.min(max, Math.max(min, rounded));
};

function LightingValuePill({
  icon,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commitDraft = useCallback(() => {
    const next = clampLightingValue(draft, min, max, step);
    onChange(next);
    setDraft(String(next));
    setEditing(false);
  }, [draft, max, min, onChange, step]);

  if (editing) {
    return (
      <span className="image-lighting-value-pill is-editing">
        {icon}
        <input
          value={draft}
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          autoFocus
          onChange={event => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(String(value));
              setEditing(false);
            }
          }}
        />
        <span>{unit}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="image-lighting-value-pill"
      onClick={() => setEditing(true)}
      aria-label={`${ariaLabel}，点击输入`}
    >
      {icon}
      <b>{value}</b>
      <span>{unit}</span>
    </button>
  );
}

function InlineImageLightingEditor({
  imageUrl,
  anchorRef,
  onCancel,
  onGenerate,
}) {
  const [brightness, setBrightness] = useState(72);
  const [temperature, setTemperature] = useState(4200);
  const [activePosition, setActivePosition] = useState('front');
  const [rimEnabled, setRimEnabled] = useState(false);
  const [activeLight, setActiveLight] = useState('main');
  const [lights, setLights] = useState({
    main: { x: 0.5, y: 0.58 },
    rim: { x: 0.72, y: 0.28 },
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const orbRef = useRef(null);
  const editorRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    let frameId = 0;
    const updatePosition = () => {
      const anchor = resolveRotationAnchor(anchorRef?.current);
      if (!anchor) return;
      const nextPosition = resolveLightingEditorPosition(
        anchor.getBoundingClientRect(),
      );
      setPosition((current) => {
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
  }, [anchorRef]);

  const setLightPoint = useCallback((lightKey, point) => {
    setLights(current => ({
      ...current,
      [lightKey]: clampLightPoint(point),
    }));
  }, []);

  const resolvePointFromEvent = useCallback((event) => {
    const rect = orbRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return clampLightPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }, []);

  const beginLightDrag = useCallback((event, lightKey = activeLight) => {
    if (event.button !== 0) return;
    if (lightKey === 'rim' && !rimEnabled) return;
    const nextPoint = resolvePointFromEvent(event);
    if (!nextPoint) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLight(lightKey);
    setLightPoint(lightKey, nextPoint);

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const movePoint = resolvePointFromEvent(moveEvent);
      if (movePoint) setLightPoint(lightKey, movePoint);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', cleanup, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
  }, [activeLight, resolvePointFromEvent, rimEnabled, setLightPoint]);

  const selectPosition = useCallback((option) => {
    setActivePosition(option.id);
    setActiveLight('main');
    setLightPoint('main', option.point);
  }, [setLightPoint]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      await onGenerate?.({
        brightness,
        temperature,
        mainLightPosition: activePosition,
        mainLight: lights.main,
        rimEnabled,
        rimLight: lights.rim,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [activePosition, brightness, isGenerating, lights, onGenerate, rimEnabled, temperature]);

  const temperatureRatio = (temperature - 2000) / 6000;

  const editor = (
    <div
      ref={editorRef}
      className="image-lighting-editor nodrag nopan"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="image-lighting-orb-panel">
        <div className="image-lighting-view-tabs" aria-label="视角模式">
          <button type="button" className="active">透视</button>
          <button type="button">正面</button>
        </div>
        <div
          ref={orbRef}
          className="image-lighting-orb"
          role="application"
          aria-label="拖动控制灯光位置"
          onPointerDown={event => beginLightDrag(event)}
        >
          <span className="image-lighting-ring outer" aria-hidden="true" />
          <span className="image-lighting-ring middle" aria-hidden="true" />
          <span className="image-lighting-ring inner" aria-hidden="true" />
          <span className="image-lighting-axis horizontal" aria-hidden="true" />
          <span className="image-lighting-axis vertical" aria-hidden="true" />
          <div
            className="image-lighting-preview"
            style={{
              '--light-x': `${lights.main.x * 100}%`,
              '--light-y': `${lights.main.y * 100}%`,
              '--light-brightness': brightness / 100,
              '--light-temperature': temperatureRatio,
            }}
          >
            <img src={imageUrl} alt="" draggable={false} />
          </div>
          <button
            type="button"
            className={`image-lighting-dot main ${activeLight === 'main' ? 'active' : ''}`}
            style={{ left: `${lights.main.x * 100}%`, top: `${lights.main.y * 100}%` }}
            aria-label="拖动主光源"
            onPointerDown={event => beginLightDrag(event, 'main')}
          >
            <span />
          </button>
          {rimEnabled ? (
            <button
              type="button"
              className={`image-lighting-dot rim ${activeLight === 'rim' ? 'active' : ''}`}
              style={{ left: `${lights.rim.x * 100}%`, top: `${lights.rim.y * 100}%` }}
              aria-label="拖动轮廓光"
              onPointerDown={event => beginLightDrag(event, 'rim')}
            >
              <span />
            </button>
          ) : null}
        </div>
        <div className="image-lighting-orb-footer">
          <span>{activeLight === 'rim' ? '轮廓光' : '主光源'}</span>
          <button type="button" onClick={() => selectPosition(LIGHTING_POSITION_OPTIONS.find(option => option.id === 'front'))}>
            <Icon name="refresh" size={14} />
            <span>重置</span>
          </button>
        </div>
      </div>

      <div className="image-lighting-control-panel">
        <div className="image-lighting-title-row">
          <h3>全局</h3>
          <button type="button" className="image-lighting-close" onClick={onCancel} aria-label="关闭打光">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="image-lighting-global-control">
          <span className="image-lighting-field-title">亮度</span>
          <div className="image-lighting-control-row">
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={brightness}
              onChange={event => setBrightness(Number(event.target.value))}
              aria-label="亮度"
            />
            <LightingValuePill
              icon={<Icon name="sun" size={16} />}
              value={brightness}
              unit="%"
              min={10}
              max={100}
              step={1}
              onChange={setBrightness}
              ariaLabel="输入亮度"
            />
          </div>
        </div>

        <div className="image-lighting-global-control temperature">
          <span className="image-lighting-field-title">色温</span>
          <div className="image-lighting-control-row">
            <input
              type="range"
              min="2000"
              max="8000"
              step="100"
              value={temperature}
              onChange={event => setTemperature(Number(event.target.value))}
              aria-label="色温"
            />
            <LightingValuePill
              icon={<ThermometerIcon size={16} />}
              value={temperature}
              unit="K"
              min={2000}
              max={8000}
              step={100}
              onChange={setTemperature}
              ariaLabel="输入色温"
            />
          </div>
        </div>

        <div className="image-lighting-section">
          <span className="image-lighting-section-title">主光源位置</span>
          <div className="image-lighting-position-grid">
            {LIGHTING_POSITION_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={activePosition === option.id ? 'active' : ''}
                onClick={() => selectPosition(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="image-lighting-rim-row">
          <div>
            <span>轮廓光</span>
            <Icon name="help" size={14} />
          </div>
          <button
            type="button"
            className={`image-lighting-switch ${rimEnabled ? 'active' : ''}`}
            role="switch"
            aria-checked={rimEnabled}
            onClick={() => {
              setRimEnabled(current => {
                const next = !current;
                setActiveLight(next ? 'rim' : 'main');
                return next;
              });
            }}
          >
            <span />
          </button>
        </div>

        <div className="image-lighting-footer">
          <div className="image-lighting-cost">
            <Icon name="aed" size={16} />
            <span>20</span>
          </div>
          <button
            type="button"
            className="image-lighting-generate"
            onClick={handleGenerate}
            disabled={isGenerating}
            aria-label="生成打光图片"
          >
            <Icon name={isGenerating ? 'loader' : 'arrowUp'} size={18} />
            <span>{isGenerating ? '生成中' : '生成'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(editor, document.body)
    : editor;
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
  tagColors,
  onTagToggle,
}) {
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [inpaintOpen, setInpaintOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [perspectiveOpen, setPerspectiveOpen] = useState(false);
  const [lightingOpen, setLightingOpen] = useState(false);
  const [rotationOpen, setRotationOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [prototypeOperation, setPrototypeOperation] = useState(null);
  const [cropDraft, setCropDraft] = useState({ ...DEFAULT_CROP });
  const [cropPreset, setCropPreset] = useState('free');
  const [cropImageSize, setCropImageSize] = useState({ width: 1, height: 1 });
  const [cropRatioOpen, setCropRatioOpen] = useState(false);
  const [isCropSaving, setIsCropSaving] = useState(false);
  const [cropError, setCropError] = useState('');
  const [gridOpen, setGridOpen] = useState(false);
  const [gridPresetOpen, setGridPresetOpen] = useState(false);
  const [gridCustomPanelOpen, setGridCustomPanelOpen] = useState(false);
  const [gridCustomPreview, setGridCustomPreview] = useState({ rows: 3, cols: 3 });
  const [gridDraft, setGridDraft] = useState(() => createGridSplitState(3, 3));
  const [gridSelectedKeys, setGridSelectedKeys] = useState(() => new Set());
  const [isGridSaving, setIsGridSaving] = useState(false);
  const [gridError, setGridError] = useState('');
  const [openMenuAction, setOpenMenuAction] = useState('');
  const openedRotationTokenRef = useRef('');
  const layerRef = useRef(null);
  const toolbarRef = useRef(null);
  const normalizedTagColors = normalizeNodeTagColors(tagColors);
  const [portalPosition, setPortalPosition] = useState(null);
  const [prototypePortalPosition, setPrototypePortalPosition] = useState(null);
  const cropPointerCleanupRef = useRef(null);
  const gridPointerCleanupRef = useRef(null);
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
  const editToolbarActions = IMAGE_EDIT_ACTION_ORDER
    .map(action => imageActions.find(item => item.action === action))
    .filter(Boolean)
    .map(item => (
      item.action === 'gridSplit'
        ? {
            ...item,
            iconOnly: true,
            menuLabel: '选择宫格拆分方式',
            menuItems: GRID_SPLIT_PRESETS.map(option => ({
              id: option.id,
              label: option.label,
              icon: 'grid',
              action: 'gridSplitPreset',
              rows: option.rows,
              cols: option.cols,
            })),
          }
        : { ...item, iconOnly: true }
    ));
  const moreMenuItems = IMAGE_MORE_ACTION_ORDER
    .map(action => imageActions.find(item => item.action === action))
    .filter(Boolean)
    .map(item => ({
      id: item.action,
      label: item.label,
      icon: item.icon,
      toolbarIcon: item.toolbarIcon,
      action: item.action === 'cutout' ? null : item.action,
    }));
  const moreToolbarActions = moreMenuItems.length > 0
    ? [{
        action: 'more',
        label: '更多',
        icon: 'more',
        iconOnly: true,
        menuLabel: '更多工具',
        menuItems: moreMenuItems,
      }]
    : [];
  const markerToolbarActions = sourceType === 'result' && typeof onTagToggle === 'function'
    ? [{
        action: 'nodeTags',
        label: '添加标记',
        title: getNodeTagPickerTitle(tagColors),
        icon: 'tag',
        iconOnly: true,
        active: normalizedTagColors.length > 0,
        nodeTagPicker: true,
        menuLabel: '节点标记颜色',
      }]
    : [];
  const afterUploadActions = imageActions.filter(item => item.action === 'favorite' || item.action === 'download');
  const secondaryToolbarActions = [
    ...(uploadAction ? [uploadAction] : []),
    ...afterUploadActions,
  ];
  const pendingToolbarAction = hasPendingTasks
    ? { action: 'query', label: '查询', icon: 'refresh' }
    : null;
  const toolbarGroups = [
    ...(editToolbarActions.length > 0
      ? [{ key: 'edit', actions: [...editToolbarActions, ...moreToolbarActions] }]
      : []),
    ...(markerToolbarActions.length > 0
      ? [{ key: 'marker', actions: markerToolbarActions, separatorBefore: editToolbarActions.length > 0 }]
      : []),
    ...(secondaryToolbarActions.length > 0
      ? [{ key: 'secondary', actions: secondaryToolbarActions, separatorBefore: editToolbarActions.length > 0 || markerToolbarActions.length > 0 }]
      : []),
    ...(pendingToolbarAction
      ? [{ key: 'pending', actions: [pendingToolbarAction], separatorBefore: editToolbarActions.length > 0 || markerToolbarActions.length > 0 || secondaryToolbarActions.length > 0 }]
      : []),
  ];
  const visibleActions = toolbarGroups.flatMap(group => group.actions);

  const closeInpaint = useCallback(() => {
    setInpaintOpen(false);
  }, []);

  const closeErase = useCallback(() => {
    setEraseOpen(false);
  }, []);

  const closeAnnotation = useCallback(() => {
    setAnnotationOpen(false);
  }, []);

  const closePerspective = useCallback(() => {
    setPerspectiveOpen(false);
  }, []);

  const closeLighting = useCallback(() => {
    setLightingOpen(false);
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

  useLayoutEffect(() => {
    if (prototypeOperation !== 'resize' || typeof window === 'undefined') {
      setPrototypePortalPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const expandedCard = layerRef.current?.closest?.('.result-image-expanded-card');
      const anchor = expandedCard
        || layerRef.current?.closest?.('.result-image-toolbar-anchor')
        || layerRef.current?.closest?.('.result-image-wrap')
        || layerRef.current?.parentElement;
      if (!anchor) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth || 1280;
      const panelWidth = 360;
      const margin = 12;
      const top = rect.bottom + margin;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, panelWidth / 2 + margin),
        viewportWidth - panelWidth / 2 - margin,
      );
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
      };
      setPrototypePortalPosition((current) => {
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
  }, [prototypeOperation]);

  useEffect(() => {
    if (!rotationAutoOpenToken || !imageUrl) return;
    if (openedRotationTokenRef.current === rotationAutoOpenToken) return;
    openedRotationTokenRef.current = rotationAutoOpenToken;
    setAnnotationOpen(false);
    setInpaintOpen(false);
    setPerspectiveOpen(false);
    setLightingOpen(false);
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
    if (!annotationOpen && !inpaintOpen && !eraseOpen && !perspectiveOpen && !lightingOpen && !cropOpen && !gridOpen && !prototypeOperation) return undefined;
    const anchor = resolveRotationAnchor(layerRef.current);
    if (!anchor) return undefined;
    anchor.classList.add('is-image-action-editing');
    if (annotationOpen) anchor.classList.add('is-annotation-editing');
    if (inpaintOpen || eraseOpen) anchor.classList.add('is-inpaint-editing');
    if (perspectiveOpen) anchor.classList.add('is-perspective-editing');
    if (lightingOpen) anchor.classList.add('is-lighting-editing');
    if (gridOpen) anchor.classList.add('is-grid-splitting');
    if (prototypeOperation) anchor.classList.add('is-prototype-editing');
    return () => {
      anchor.classList.remove('is-image-action-editing');
      anchor.classList.remove('is-annotation-editing');
      anchor.classList.remove('is-inpaint-editing');
      anchor.classList.remove('is-perspective-editing');
      anchor.classList.remove('is-lighting-editing');
      anchor.classList.remove('is-grid-splitting');
      anchor.classList.remove('is-prototype-editing');
    };
  }, [annotationOpen, cropOpen, eraseOpen, gridOpen, inpaintOpen, lightingOpen, perspectiveOpen, prototypeOperation]);

  useEffect(() => {
    onEditingChange?.(annotationOpen || inpaintOpen || eraseOpen || perspectiveOpen || lightingOpen || rotationOpen || cropOpen || gridOpen || Boolean(prototypeOperation));
  }, [annotationOpen, cropOpen, eraseOpen, gridOpen, inpaintOpen, lightingOpen, onEditingChange, perspectiveOpen, prototypeOperation, rotationOpen]);

  useEffect(() => () => {
    cropPointerCleanupRef.current?.();
    gridPointerCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!openMenuAction) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && toolbarRef.current?.contains(event.target)) return;
      setOpenMenuAction('');
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [openMenuAction]);

  useEffect(() => {
    if (!gridPresetOpen) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && toolbarRef.current?.contains(event.target)) return;
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [gridPresetOpen]);

  const emitAction = useCallback((action, extra = {}) => {
    if (action === 'download') {
      downloadImage(imageUrl, `image-${nodeId}`);
      return;
    }

    if (action === 'inpaint') {
      setAnnotationOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setInpaintOpen(true);
      return;
    }

    if (action === 'erase') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setPrototypeOperation(null);
      setEraseOpen(true);
      return;
    }

    if (['outpaint', 'cutout', 'enhance', 'split', 'resize'].includes(action)) {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setPrototypeOperation(action);
      return;
    }

    if (action === 'gridSplit') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setPrototypeOperation(null);
      setGridPresetOpen(current => !current);
      setGridCustomPanelOpen(false);
      return;
    }

    if (action === 'perspective') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setPerspectiveOpen(true);
      return;
    }

    if (action === 'lighting') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setPrototypeOperation(null);
      setLightingOpen(true);
      return;
    }

    if (action === 'crop' && enableCropEditor) {
      const image = layerRef.current?.parentElement?.querySelector?.(':scope > img');
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
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
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setRotationOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
      setAnnotationOpen(true);
      return;
    }

    if (action === 'rotate') {
      setAnnotationOpen(false);
      setInpaintOpen(false);
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
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
      setEraseOpen(false);
      setPerspectiveOpen(false);
      setLightingOpen(false);
      setCropOpen(false);
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
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

  const closePrototype = useCallback(() => setPrototypeOperation(null), []);
  const confirmPrototype = useCallback(async (settings) => {
    await onAction?.('prototypeCreate', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      ...settings,
    });
    setPrototypeOperation(null);
  }, [imageIndex, imageUrl, nodeId, onAction, sourceHandle, sourceType]);

  const cancelCrop = useCallback(() => {
    if (isCropSaving) return;
    cropPointerCleanupRef.current?.();
    setCropRatioOpen(false);
    setCropError('');
    setCropOpen(false);
  }, [isCropSaving]);

  const openGridSplit = useCallback((rows, cols) => {
    setAnnotationOpen(false);
    setInpaintOpen(false);
    setEraseOpen(false);
    setPerspectiveOpen(false);
    setLightingOpen(false);
    setRotationOpen(false);
    setCropOpen(false);
    setPrototypeOperation(null);
    setGridDraft(createGridSplitState(rows, cols));
    setGridSelectedKeys(new Set());
    setGridError('');
    setGridPresetOpen(false);
    setGridCustomPanelOpen(false);
    setOpenMenuAction('');
    setGridOpen(true);
  }, []);

  const cancelGridSplit = useCallback(() => {
    if (isGridSaving) return;
    gridPointerCleanupRef.current?.();
    setGridError('');
    setGridPresetOpen(false);
    setGridCustomPanelOpen(false);
    setGridOpen(false);
  }, [isGridSaving]);

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
    if (!gridOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelGridSplit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelGridSplit, gridOpen]);

  useEffect(() => {
    if (!cropOpen || forceVisible || isCropSaving) return undefined;
    const timeoutId = window.setTimeout(cancelCrop, 0);
    return () => window.clearTimeout(timeoutId);
  }, [cancelCrop, cropOpen, forceVisible, isCropSaving]);

  useEffect(() => {
    if (!gridOpen || forceVisible || isGridSaving) return undefined;
    const timeoutId = window.setTimeout(cancelGridSplit, 0);
    return () => window.clearTimeout(timeoutId);
  }, [cancelGridSplit, forceVisible, gridOpen, isGridSaving]);

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

  const beginGridLineDrag = useCallback((event, axis, index) => {
    if (event.button !== 0 || isGridSaving) return;
    const bounds = layerRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    event.preventDefault();
    event.stopPropagation();
    gridPointerCleanupRef.current?.();

    const handlePointerMove = moveEvent => {
      moveEvent.preventDefault();
      const nextValue = axis === 'x'
        ? (moveEvent.clientX - bounds.left) / bounds.width
        : (moveEvent.clientY - bounds.top) / bounds.height;
      setGridDraft(current => ({
        ...current,
        [axis === 'x' ? 'xCuts' : 'yCuts']: clampGridCut(
          axis === 'x' ? current.xCuts : current.yCuts,
          index,
          nextValue,
        ),
      }));
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      gridPointerCleanupRef.current = null;
    };
    gridPointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  }, [isGridSaving]);

  const toggleGridCell = useCallback((row, col) => {
    if (isGridSaving) return;
    const key = getGridCellKey(row, col);
    setGridSelectedKeys(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setGridError('');
  }, [isGridSaving]);

  const resetGridSplit = useCallback(() => {
    setGridDraft(createGridSplitState(gridDraft.rows, gridDraft.cols));
    setGridSelectedKeys(new Set());
    setGridError('');
  }, [gridDraft.cols, gridDraft.rows]);

  const saveGridSplit = useCallback(async () => {
    if (isGridSaving) return;
    const cells = buildSelectedGridCells(gridDraft, gridSelectedKeys);
    if (cells.length === 0) {
      setGridError('请选择要拆分的宫格');
      return;
    }
    setGridError('');
    setIsGridSaving(true);
    try {
      await onAction?.('gridSplitSave', {
        imageUrl,
        nodeId,
        sourceType,
        imageIndex,
        sourceHandle,
        grid: gridDraft,
        cells,
      });
      setGridOpen(false);
      setGridPresetOpen(false);
      setGridCustomPanelOpen(false);
    } catch (error) {
      setGridError(error?.message || '宫格拆分失败，请重试');
    } finally {
      setIsGridSaving(false);
    }
  }, [gridDraft, gridSelectedKeys, imageIndex, imageUrl, isGridSaving, nodeId, onAction, sourceHandle, sourceType]);

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

  const submitErase = useCallback((payload) => (
    onAction?.('prototypeCreate', {
      imageUrl,
      nodeId,
      sourceType,
      imageIndex,
      sourceHandle,
      operation: 'erase',
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

  const submitLighting = useCallback((payload) => (
    onAction?.('lightingGenerate', {
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

  const gridPresetMenu = (
    <div className="image-grid-preset-menu nodrag nopan" role="menu" aria-label="选择宫格拆分方式">
      {GRID_SPLIT_PRESETS.map(option => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          onClick={() => openGridSplit(option.rows, option.cols)}
        >
          {option.label}
        </button>
      ))}
      <div className="image-grid-custom-menu-item">
        <button
          type="button"
          role="menuitem"
          aria-expanded={gridCustomPanelOpen}
          onMouseEnter={() => setGridCustomPanelOpen(true)}
          onFocus={() => setGridCustomPanelOpen(true)}
          onClick={() => setGridCustomPanelOpen(true)}
        >
          <span>自定义</span>
          <span aria-hidden="true">›</span>
        </button>
        {gridCustomPanelOpen ? (
          <div className="image-grid-custom-panel" role="group" aria-label="自定义宫格">
            <div className="image-grid-custom-panel-header">
              <span>自定义宫格</span>
              <strong>{gridCustomPreview.rows} x {gridCustomPreview.cols}</strong>
            </div>
            <div className="image-grid-custom-picker">
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                Array.from({ length: 5 }).map((__, colIndex) => {
                  const rows = rowIndex + 1;
                  const cols = colIndex + 1;
                  const enabled = rows <= gridCustomPreview.rows && cols <= gridCustomPreview.cols;
                  const selectable = rows >= 2 && cols >= 2;
                  return (
                    <button
                      key={`${rows}-${cols}`}
                      type="button"
                      className={enabled ? 'selected' : ''}
                      aria-label={`${rows} x ${cols}`}
                      disabled={!selectable}
                      onMouseEnter={() => setGridCustomPreview({ rows, cols })}
                      onFocus={() => setGridCustomPreview({ rows, cols })}
                      onClick={() => openGridSplit(rows, cols)}
                    />
                  );
                })
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

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
          {group.actions.map((item, index) => {
            const hasMenu = item.nodeTagPicker || (Array.isArray(item.menuItems) && item.menuItems.length > 0);
            const menuOpen = openMenuAction === item.action;
            const active = menuOpen || Boolean(item.active);
            return (
              <span
                key={item.action}
                className={`image-action-toolbar-item${hasMenu ? ' has-menu' : ''}`}
              >
                <button
                  type="button"
                  className={[
                    item.separatorBefore && index > 0 ? 'with-separator' : '',
                    item.action === 'annotate' && annotationOpen ? 'active' : '',
                    item.action === 'inpaint' && inpaintOpen ? 'active' : '',
                    item.action === 'perspective' && perspectiveOpen ? 'active' : '',
                    item.action === 'lighting' && lightingOpen ? 'active' : '',
                    item.action === 'gridSplit' && gridOpen ? 'active' : '',
                    active ? 'active' : '',
                    item.tone === 'danger' ? 'danger' : '',
                    item.iconOnly ? 'is-icon-only' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={(event) => {
                    if (hasMenu) {
                      event.stopPropagation();
                      setOpenMenuAction(current => current === item.action ? '' : item.action);
                      return;
                    }
                    emitAction(item.action);
                  }}
                  data-tooltip={item.title || item.label}
                  aria-label={item.title || item.label}
                  aria-haspopup={hasMenu ? 'menu' : undefined}
                  aria-expanded={hasMenu ? menuOpen : undefined}
                >
                  {item.action === 'nodeTags' ? (
                    <NodeTagPickerButtonContent
                      tagColors={tagColors}
                      label={item.label}
                      iconSize={16}
                      iconClassName="image-action-toolbar-icon"
                      labelClassName="image-action-toolbar-label"
                      dotsClassName="image-action-toolbar-tag-dots"
                    />
                  ) : (
                    <>
                      <span className="image-action-toolbar-icon" aria-hidden="true">
                        {item.toolbarIcon
                          ? <img src={item.toolbarIcon} alt="" />
                          : <Icon name={item.icon} size={16} />}
                      </span>
                      <span className="image-action-toolbar-label">{item.label}</span>
                    </>
                  )}
                </button>
                {hasMenu && menuOpen ? (
                  <div className="image-action-toolbar-menu" role="menu" aria-label={item.menuLabel || item.label}>
                    {item.nodeTagPicker ? (
                      <NodeTagColorMenuItems
                        tagColors={tagColors}
                        onToggle={onTagToggle}
                        onAfterToggle={() => setOpenMenuAction('')}
                      />
                    ) : item.menuItems.map(menuItem => {
                      const hasSubmenu = menuItem.action === 'gridSplit';
                      const submenuOpen = hasSubmenu && gridPresetOpen;
                      return (
                        <span
                          key={menuItem.id}
                          className={`image-action-toolbar-menu-row${hasSubmenu ? ' has-submenu' : ''}${submenuOpen ? ' is-submenu-open' : ''}`}
                        >
                          <button
                            type="button"
                            role={menuItem.color ? 'menuitemcheckbox' : 'menuitem'}
                            aria-checked={menuItem.color ? Boolean(menuItem.active) : undefined}
                            aria-haspopup={hasSubmenu ? 'menu' : undefined}
                            aria-expanded={hasSubmenu ? submenuOpen : undefined}
                            className={menuItem.active || submenuOpen ? 'is-active' : ''}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (hasSubmenu) {
                                setGridPresetOpen(current => !current);
                                setGridCustomPanelOpen(false);
                                return;
                              }
                              if (menuItem.action === 'gridSplitPreset') {
                                openGridSplit(menuItem.rows, menuItem.cols);
                                setOpenMenuAction('');
                                return;
                              }
                              if (menuItem.action) {
                                emitAction(menuItem.action);
                              } else {
                                menuItem.onClick?.(event);
                              }
                              setOpenMenuAction('');
                            }}
                          >
                            {menuItem.color ? (
                              <span className="image-action-toolbar-menu-color" style={{ '--node-tag-color': menuItem.color }}>
                                <span className="image-action-toolbar-menu-color-dot" aria-hidden="true" />
                                {menuItem.active ? <Icon name="check" size={13} /> : null}
                              </span>
                            ) : (
                              <span className="image-action-toolbar-menu-icon" aria-hidden="true">
                                {menuItem.toolbarIcon
                                  ? <img src={menuItem.toolbarIcon} alt="" />
                                  : <Icon name={menuItem.icon} size={15} />}
                              </span>
                            )}
                            <span>{menuItem.label}</span>
                            {hasSubmenu ? (
                              <span className="image-action-toolbar-menu-chevron" aria-hidden="true">
                                <Icon name="chevronRight" size={14} />
                              </span>
                            ) : null}
                          </button>
                          {submenuOpen ? gridPresetMenu : null}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </span>
            );
          })}
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

  const gridSelectedCount = gridSelectedKeys.size;
  const gridToolbar = (
    <div
      ref={toolbarRef}
      className="image-crop-toolbar image-grid-toolbar nodrag nopan"
      style={portalPosition ? { left: portalPosition.left, top: portalPosition.top } : undefined}
      onPointerEnter={onToolbarPointerEnter}
      onPointerLeave={onToolbarPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="image-crop-toolbar-group">
        <button type="button" onClick={cancelGridSplit} disabled={isGridSaving}>
          <Icon name="x" size={16} />
          <span>取消</span>
        </button>
      </div>
      <div className="image-crop-toolbar-group image-crop-toolbar-controls">
        <span className="image-grid-count">已选 {gridSelectedCount} 个</span>
        <button type="button" onClick={resetGridSplit} disabled={isGridSaving}>
          <Icon name="refresh" size={16} />
          <span>重置切分</span>
        </button>
      </div>
      <div className="image-crop-toolbar-group">
        <button type="button" onClick={saveGridSplit} disabled={isGridSaving || gridSelectedCount === 0}>
          <Icon name={isGridSaving ? 'loader' : 'check'} size={16} />
          <span>{isGridSaving ? '拆分中' : '确认拆分'}</span>
        </button>
      </div>
      {gridError ? <span className="image-crop-toolbar-error">{gridError}</span> : null}
    </div>
  );

  const wheelHandoffEnabled = visibleActions.length > 0
    && !rotationOpen
    && !annotationOpen
    && !inpaintOpen
    && !eraseOpen
    && !perspectiveOpen
    && !lightingOpen
    && !gridOpen
    && !prototypeOperation
    && !suppressToolbar
    && (!portalToolbar || (forceVisible && Boolean(portalPosition)));

  useCanvasWheelHandoff(toolbarRef, {
    enabled: wheelHandoffEnabled,
  });

  return (
    <div ref={layerRef} className={`image-action-layer ${forceVisible ? 'is-open' : ''} ${annotationOpen ? 'is-annotating' : ''} ${inpaintOpen ? 'is-inpainting' : ''} ${eraseOpen ? 'is-inpainting is-erasing' : ''} ${perspectiveOpen ? 'is-perspective' : ''} ${lightingOpen ? 'is-lighting' : ''} ${cropOpen ? 'is-cropping' : ''} ${gridOpen ? 'is-grid-splitting' : ''}`}>
      {!suppressToolbar && !annotationOpen && !inpaintOpen && !eraseOpen && !perspectiveOpen && !lightingOpen && !rotationOpen && !cropOpen && !gridOpen && !prototypeOperation && !portalToolbar ? toolbar : null}
      {!suppressToolbar && !annotationOpen && !inpaintOpen && !eraseOpen && !perspectiveOpen && !lightingOpen && !rotationOpen && !cropOpen && !gridOpen && portalToolbar && forceVisible && portalPosition && typeof document !== 'undefined'
        ? createPortal(toolbar, document.body)
        : null}
      {cropOpen && portalToolbar && forceVisible && portalPosition && typeof document !== 'undefined'
        ? createPortal(cropToolbar, document.body)
        : null}
      {gridOpen && portalToolbar && forceVisible && portalPosition && typeof document !== 'undefined'
        ? createPortal(gridToolbar, document.body)
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
      {eraseOpen && imageUrl ? (
        <InlineImageInpaintEditor
          imageUrl={imageUrl}
          anchorRef={layerRef}
          apiConfigs={apiConfigs}
          apiProviders={apiProviders}
          mode="erase"
          onCancel={closeErase}
          onGenerate={submitErase}
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
      {lightingOpen && imageUrl ? (
        <InlineImageLightingEditor
          imageUrl={imageUrl}
          anchorRef={layerRef}
          onCancel={closeLighting}
          onGenerate={submitLighting}
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
      {gridOpen && imageUrl ? (
        <div className="image-grid-split-surface nodrag nopan">
          {Array.from({ length: gridDraft.rows }).map((_, row) => (
            Array.from({ length: gridDraft.cols }).map((__, col) => {
              const crop = getGridCellCrop(gridDraft, row, col);
              const key = getGridCellKey(row, col);
              const selected = gridSelectedKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`image-grid-cell ${selected ? 'selected' : ''}`}
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                  onClick={() => toggleGridCell(row, col)}
                  disabled={isGridSaving}
                  aria-pressed={selected}
                >
                  <span>{row + 1}-{col + 1}</span>
                </button>
              );
            })
          ))}
          {gridDraft.xCuts.map((cut, index) => (
            <button
              key={`x-${index}`}
              type="button"
              className="image-grid-line image-grid-line-v"
              style={{ left: `${cut * 100}%` }}
              onPointerDown={event => beginGridLineDrag(event, 'x', index)}
              disabled={isGridSaving}
              aria-label={`拖动第 ${index + 1} 条竖线`}
            />
          ))}
          {gridDraft.yCuts.map((cut, index) => (
            <button
              key={`y-${index}`}
              type="button"
              className="image-grid-line image-grid-line-h"
              style={{ top: `${cut * 100}%` }}
              onPointerDown={event => beginGridLineDrag(event, 'y', index)}
              disabled={isGridSaving}
              aria-label={`拖动第 ${index + 1} 条横线`}
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
      {prototypeOperation === 'resize' && imageUrl && prototypePortalPosition && typeof document !== 'undefined' ? (
        createPortal((
          <CanvasImagePrototype
            operation={prototypeOperation}
            imageUrl={imageUrl}
            onCancel={closePrototype}
            onConfirm={confirmPrototype}
            floating
            style={{
              left: prototypePortalPosition.left,
              top: prototypePortalPosition.top,
            }}
          />
        ), document.body)
      ) : null}
      {prototypeOperation && prototypeOperation !== 'resize' && imageUrl ? (
        <CanvasImagePrototype operation={prototypeOperation} imageUrl={imageUrl} onCancel={closePrototype} onConfirm={confirmPrototype} />
      ) : null}
    </div>
  );
}

export default ImageActionOverlay;
