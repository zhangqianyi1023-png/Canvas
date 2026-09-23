// ===== 结果节点 =====
// nodeType === 'result'
// resultType === 'generateText' → 文本节点
// resultType === 'generateImage' → 生成图片节点
// resultType === 'generateVideo' → 生成视频节点
// resultType === 'generateStoryboardScript' → 生成分镜脚本节点
import { memo, useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Handle, NodeResizer, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import Icon from '../components/Icon';
import AngleCameraPreview from '../components/AngleCameraPreview';
import ImagePreviewOverlay from '../components/ImagePreviewOverlay';
import ImageActionOverlay from './ImageActionOverlay';
import VideoFrameCaptureControls from './VideoFrameCaptureControls.jsx';
import { normalizeQuickTrimContract } from './videoQuickTrim.js';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import { uploadImageFile } from '../uploadImage';
import { readLocalImageFileSize } from '../imageFileMetadata';
import { uploadAudioFile } from '../uploadAudio';
import {
  SUPPORTED_AUDIO_ACCEPT,
  getUnsupportedAudioMessage,
  isSupportedAudioFile,
} from '../audioFormats';
import {
  SUPPORTED_VIDEO_ACCEPT,
  getUnsupportedVideoMessage,
  isSupportedVideoFile,
} from '../videoFormats';
import { uploadVideoFile } from '../uploadVideo';
import { calculateExpandedImageLayout } from '../resultImageExpansionLayout';
import { preferCanvasServerUrls, toDisplayMediaUrl } from '../taskMedia';
import { shouldCloseExpandedImagesOnKeyDown } from '../resultImageExpansionInteraction';
import { copyImageToClipboard, downloadImages } from '../imageDownload';
import { getTaskDurationLabel, isTaskActive } from '../taskTiming';
import {
  DEFAULT_TEXT_FORMAT_STATE,
  TEXT_FORMAT_COLORS,
  applyTextFormat,
  getTextFormatState,
} from '../textFormatting';
import { formatImageDimensions, normalizeImageDimensions } from '../imageDimensions';
import { NODE_TAG_COLORS, normalizeNodeTagColors } from '../nodeTagColors';

const IMAGE_POINTER_INTENT_THRESHOLD = 6;
const STORYBOARD_FRAME_POINTER_INTENT_THRESHOLD = 8;
const EXPANDED_IMAGE_CLOSE_MS = 180;
const IMAGE_TOOLBAR_CLOSE_MS = 180;
const RESULT_TOOLBAR_CLOSE_MS = 180;
const VIDEO_ENHANCEMENT_RESOLUTION_OPTIONS = ['1080P', '2K', '4K'];
const VIDEO_ENHANCEMENT_FPS_OPTIONS = ['自适应（原帧数）', '30fps', '60fps', '90fps'];
const VIDEO_ENHANCEMENT_SLOW_OPTIONS = ['自适应（原速）', '2x'];
const DEFAULT_VIDEO_ENHANCEMENT_SETTINGS = {
  resolution: '1080P',
  fps: '自适应（原帧数）',
  slow: '自适应（原速）',
};
const DEFAULT_SUBJECT_REPLACEMENT_BOX = {
  x: 31,
  y: 20,
  width: 38,
  height: 56,
};
const VIDEO_EXTENSION_DIRECTIONS = ['片尾延长', '片头延长'];
const VIDEO_EXTENSION_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
const VIDEO_EXTENSION_METHODS = ['自然延续', '动作延续', '延续运镜', '推进场景'];
const VIDEO_RETAKE_MODES = ['保持不变', '固定', '切换', '平滑移动'];
const VIDEO_RETAKE_CAMERA_ANGLES = ['正面', '侧前方', '侧后方', '背面', '俯视', '仰视'];
const VIDEO_RETAKE_SHOT_SIZES = ['特写', '中景', '全景', '远景'];
const VIDEO_RETAKE_CAMERA_POSITIONS = {
  正面: { x: 50, y: 50, yaw: 0, pitch: 0 },
  侧前方: { x: 74, y: 40, yaw: 45, pitch: 0 },
  侧后方: { x: 78, y: 62, yaw: 135, pitch: 0 },
  背面: { x: 50, y: 82, yaw: 180, pitch: 0 },
  俯视: { x: 50, y: 24, yaw: 0, pitch: -35 },
  仰视: { x: 50, y: 74, yaw: 0, pitch: 35 },
  自定义视角: { x: 68, y: 48, yaw: 25, pitch: -8 },
};
const VIDEO_RETAKE_SHOT_DISTANCE = {
  特写: 1.4,
  中景: 4,
  全景: 6.2,
  远景: 8,
};
const DEFAULT_VIDEO_RETAKE_CAMERA_SETTINGS = {
  fixed: { angle: '正面', shotSize: '特写', ...VIDEO_RETAKE_CAMERA_POSITIONS.正面, distance: VIDEO_RETAKE_SHOT_DISTANCE.特写, custom: false },
  start: { angle: '俯视', shotSize: '全景', ...VIDEO_RETAKE_CAMERA_POSITIONS.俯视, distance: VIDEO_RETAKE_SHOT_DISTANCE.全景, custom: false },
  end: { angle: '侧后方', shotSize: '远景', ...VIDEO_RETAKE_CAMERA_POSITIONS.侧后方, distance: VIDEO_RETAKE_SHOT_DISTANCE.远景, custom: false },
};
const DEFAULT_VIDEO_RETAKE_SEGMENTS = [{ id: 'shot-1', start: 0, end: 14.4 }];
const DEFAULT_VIDEO_RETAKE_PLAYHEAD_TIME = 5;
const VIDEO_RETAKE_MIN_SEGMENT_DURATION = 1;
const REFERENCE_IMAGE_PREVIEW_MAX_SIZE = 220;
const REFERENCE_IMAGE_PREVIEW_MARGIN = 12;
const REFERENCE_IMAGE_PREVIEW_GAP = 10;
const TEXT_BACKGROUND_COLORS = [
  { id: 'none', label: '默认颜色', swatch: '#f4f4f4', background: '' },
  { id: 'red', label: '红色', swatch: '#a94b4d', background: 'rgba(169, 75, 77, 0.22)' },
  { id: 'orange', label: '橙色', swatch: '#9b5c18', background: 'rgba(155, 92, 24, 0.22)' },
  { id: 'yellow', label: '黄色', swatch: '#a89a36', background: 'rgba(168, 154, 54, 0.2)' },
  { id: 'green', label: '绿色', swatch: '#40824f', background: 'rgba(64, 130, 79, 0.2)' },
  { id: 'cyan', label: '青色', swatch: '#3d8394', background: 'rgba(61, 131, 148, 0.2)' },
  { id: 'blue', label: '蓝色', swatch: '#34639c', background: 'rgba(52, 99, 156, 0.22)' },
  { id: 'purple', label: '紫色', swatch: '#81409a', background: 'rgba(129, 64, 154, 0.22)' },
];
const TEXT_BACKGROUND_COLOR_MAP = new Map(
  TEXT_BACKGROUND_COLORS.map(color => [color.id, color])
);

const resolveTextBackgroundColor = (colorId) => (
  TEXT_BACKGROUND_COLOR_MAP.get(colorId) || TEXT_BACKGROUND_COLORS[0]
);

const getViewportSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1280,
  height: typeof window !== 'undefined' ? window.innerHeight : 800,
});

const ImageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <path d="M938.666667 553.92V768c0 64.8-52.533333 117.333333-117.333334 117.333333H202.666667c-64.8 0-117.333333-52.533333-117.333334-117.333333V256c0-64.8 52.533333-117.333333 117.333334-117.333333h618.666666c64.8 0 117.333333 52.533333 117.333334 117.333333v297.92z m-64-74.624V256a53.333333 53.333333 0 0 0-53.333334-53.333333H202.666667a53.333333 53.333333 0 0 0-53.333334 53.333333v344.48A290.090667 290.090667 0 0 1 192 597.333333a286.88 286.88 0 0 1 183.296 65.845334C427.029333 528.384 556.906667 437.333333 704 437.333333c65.706667 0 126.997333 16.778667 170.666667 41.962667z m0 82.24c-5.333333-8.32-21.130667-21.653333-43.648-32.917333C796.768 511.488 753.045333 501.333333 704 501.333333c-121.770667 0-229.130667 76.266667-270.432 188.693334-2.730667 7.445333-7.402667 20.32-13.994667 38.581333-7.68 21.301333-34.453333 28.106667-51.370666 13.056-16.437333-14.634667-28.554667-25.066667-36.138667-31.146667A222.890667 222.890667 0 0 0 192 661.333333c-14.464 0-28.725333 1.365333-42.666667 4.053334V768a53.333333 53.333333 0 0 0 53.333334 53.333333h618.666666a53.333333 53.333333 0 0 0 53.333334-53.333333V561.525333zM320 480a96 96 0 1 1 0-192 96 96 0 0 1 0 192z m0-64a32 32 0 1 0 0-64 32 32 0 0 0 0 64z" fill="#b0b5be" />
  </svg>
);

function ResultPortalToolbar({
  open,
  actions,
  onPointerEnter,
  onPointerLeave,
}) {
  const layerRef = useRef(null);
  const toolbarRef = useRef(null);
  const [portalPosition, setPortalPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open || actions.length === 0) {
      setPortalPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = layerRef.current?.closest?.('.result-node-toolbar-anchor')
        || layerRef.current?.parentElement;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const nextPosition = {
        left: Math.round((rect.left + rect.width / 2) * 10) / 10,
        top: Math.round(Math.max(64, rect.top - 14) * 10) / 10,
      };
      setPortalPosition((current) => {
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
  }, [actions.length, open]);

  useCanvasWheelHandoff(toolbarRef, {
    enabled: open && actions.length > 0 && Boolean(portalPosition),
  });

  const toolbar = (
    <div
      ref={toolbarRef}
      className="image-action-toolbar nodrag result-image-portal-toolbar result-node-portal-toolbar"
      style={portalPosition ? { left: portalPosition.left, top: portalPosition.top } : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map(item => (
        <button
          key={item.action}
          type="button"
          className={item.tone === 'danger' ? 'danger' : ''}
          onClick={(event) => {
            event.stopPropagation();
            item.onClick?.(event);
          }}
          data-tooltip={item.label}
          aria-label={item.label}
        >
          <Icon name={item.icon} size={14} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <span ref={layerRef} className="result-node-toolbar-layer">
      {open && portalPosition && typeof document !== 'undefined'
        ? createPortal(toolbar, document.body)
        : null}
    </span>
  );
}

function TextFormatToolbarPortal({
  open,
  anchorRef,
  fallbackAnchorRef,
  value,
  selection,
  formatState,
  expanded,
  tagColors,
  backgroundColor,
  onApply,
  onCommand,
  onTagToggle,
  onBackgroundColorChange,
}) {
  const toolbarRef = useRef(null);
  const backgroundButtonRef = useRef(null);
  const backgroundMenuRef = useRef(null);
  const tagButtonRef = useRef(null);
  const tagMenuRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [backgroundMenuOpen, setBackgroundMenuOpen] = useState(false);
  const [backgroundMenuPosition, setBackgroundMenuPosition] = useState(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuPosition, setTagMenuPosition] = useState(null);
  const normalizedTagColors = normalizeNodeTagColors(tagColors);
  const selectedBackgroundColor = resolveTextBackgroundColor(backgroundColor);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const rect = (
        anchorRef.current?.getBoundingClientRect()
        || fallbackAnchorRef?.current?.getBoundingClientRect()
      );
      if (!rect) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }
      const nextPosition = {
        left: Math.round(Math.min(Math.max(rect.left + rect.width / 2, 168), window.innerWidth - 168) * 10) / 10,
        top: Math.round(Math.max(70, rect.top - 16) * 10) / 10,
      };
      setPosition(current => (
        current?.left === nextPosition.left && current?.top === nextPosition.top
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [anchorRef, fallbackAnchorRef, open]);

  useCanvasWheelHandoff(toolbarRef, {
    enabled: open && Boolean(position),
  });

  useEffect(() => {
    if (!open) {
      setBackgroundMenuOpen(false);
      setTagMenuOpen(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!backgroundMenuOpen) {
      setBackgroundMenuPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updateMenuPosition = () => {
      const rect = backgroundButtonRef.current?.getBoundingClientRect();
      if (rect) {
        const nextPosition = {
          left: Math.round((rect.left + rect.width / 2) * 10) / 10,
          top: Math.round((rect.bottom + 8) * 10) / 10,
        };
        setBackgroundMenuPosition(current => (
          current?.left === nextPosition.left && current?.top === nextPosition.top
            ? current
            : nextPosition
        ));
      }
      frameId = window.requestAnimationFrame(updateMenuPosition);
    };
    updateMenuPosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [backgroundMenuOpen]);

  useLayoutEffect(() => {
    if (!tagMenuOpen) {
      setTagMenuPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updateMenuPosition = () => {
      const rect = tagButtonRef.current?.getBoundingClientRect();
      if (rect) {
        const nextPosition = {
          left: Math.round((rect.left + rect.width / 2) * 10) / 10,
          top: Math.round((rect.bottom + 8) * 10) / 10,
        };
        setTagMenuPosition(current => (
          current?.left === nextPosition.left && current?.top === nextPosition.top
            ? current
            : nextPosition
        ));
      }
      frameId = window.requestAnimationFrame(updateMenuPosition);
    };
    updateMenuPosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [tagMenuOpen]);

  useEffect(() => {
    if (!backgroundMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && toolbarRef.current?.contains(event.target)) return;
      if (event.type === 'pointerdown' && backgroundMenuRef.current?.contains(event.target)) return;
      setBackgroundMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [backgroundMenuOpen]);

  useEffect(() => {
    if (!tagMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && toolbarRef.current?.contains(event.target)) return;
      if (event.type === 'pointerdown' && tagMenuRef.current?.contains(event.target)) return;
      setTagMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [tagMenuOpen]);

  const state = formatState || getTextFormatState(value, selection.start, selection.end);

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const apply = (action, payload) => {
    onApply?.(action, payload);
  };

  if (!open || !position || typeof document === 'undefined') return null;

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`text-format-toolbar nodrag nopan ${expanded ? 'text-format-toolbar-expanded' : ''}`.trim()}
      style={{ left: position.left, top: position.top }}
      role="toolbar"
      aria-label="文本格式"
      onPointerDown={handlePointerDown}
      onMouseDown={handlePointerDown}
      onClick={(event) => event.stopPropagation()}
    >
      {typeof onBackgroundColorChange === 'function' ? (
        <>
          <button
            ref={backgroundButtonRef}
            type="button"
            className="text-format-icon-btn text-format-background-btn"
            aria-label="背景颜色"
            aria-haspopup="menu"
            aria-expanded={backgroundMenuOpen}
            aria-pressed={selectedBackgroundColor.id !== 'none'}
            onClick={(event) => {
              event.stopPropagation();
              setTagMenuOpen(false);
              setBackgroundMenuOpen(current => !current);
            }}
          >
            <Icon name="palette" size={15} />
            {selectedBackgroundColor.id !== 'none' ? (
              <span
                className="text-format-background-indicator"
                style={{ '--text-background-swatch': selectedBackgroundColor.swatch }}
                aria-hidden="true"
              />
            ) : null}
            <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">背景颜色</span>
          </button>
          <span className="text-format-divider" />
        </>
      ) : null}
      {[
        ['h1', 'H1', '标题 1'],
        ['h2', 'H2', '标题 2'],
        ['h3', 'H3', '标题 3'],
        ['p', 'P', '正文'],
      ].map(([action, label, title]) => (
        <button
          key={action}
          type="button"
          className="text-format-type-btn"
          aria-label={title}
          title={title}
          aria-pressed={state.block === action}
          onClick={() => apply(action)}
        >
          {label}
        </button>
      ))}
      <span className="text-format-divider" />
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="加粗"
        aria-pressed={state.bold}
        onClick={() => apply('bold')}
      >
        <strong>B</strong>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">加粗</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="斜体"
        aria-pressed={state.italic}
        onClick={() => apply('italic')}
      >
        <em>I</em>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">斜体</span>
      </button>
      <span className="text-format-divider" />
      <button
        type="button"
        className="text-format-icon-btn text-format-list-btn"
        aria-label="无序列表"
        aria-pressed={state.list === 'ul'}
        onClick={() => apply('ul')}
      >
        <span aria-hidden="true">•</span>
        <span aria-hidden="true">≡</span>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">无序列表</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn text-format-list-btn"
        aria-label="有序列表"
        aria-pressed={state.list === 'ol'}
        onClick={() => apply('ol')}
      >
        <span aria-hidden="true">1</span>
        <span aria-hidden="true">≡</span>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">有序列表</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="插入分割线"
        onClick={() => apply('rule')}
      >
        <Icon name="subtract" size={16} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">插入分割线</span>
      </button>
      {typeof onTagToggle === 'function' ? (
        <span className="text-format-tag-menu-wrap">
          <button
            ref={tagButtonRef}
            type="button"
            className="text-format-icon-btn text-format-tag-btn"
            aria-label="添加标记"
            aria-haspopup="menu"
            aria-expanded={tagMenuOpen}
            aria-pressed={normalizedTagColors.length > 0}
            onClick={(event) => {
              event.stopPropagation();
              setBackgroundMenuOpen(false);
              setTagMenuOpen(current => !current);
            }}
          >
            <Icon name="tag" size={15} />
            {normalizedTagColors.length > 0 ? (
              <span className="text-format-tag-dots" aria-hidden="true">
                {normalizedTagColors.slice(0, 3).map(colorId => {
                  const color = NODE_TAG_COLORS.find(option => option.id === colorId);
                  return color ? <span key={colorId} style={{ '--node-tag-color': color.value }} /> : null;
                })}
              </span>
            ) : null}
            <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">添加标记</span>
          </button>
        </span>
      ) : null}
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="复制提示词"
        onClick={() => onCommand?.('copyPrompt')}
      >
        <Icon name="copy" size={15} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">复制提示词</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="全屏编辑"
        disabled={expanded}
        onClick={() => onCommand?.('expand')}
      >
        <Icon name="fullscreen" size={15} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">全屏编辑</span>
      </button>
    </div>
  );

  const backgroundMenu = backgroundMenuOpen && backgroundMenuPosition ? (
    <div
      ref={backgroundMenuRef}
      className="text-format-background-menu nodrag nopan"
      style={{ left: backgroundMenuPosition.left, top: backgroundMenuPosition.top }}
      role="menu"
      aria-label="文本节点背景颜色"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {TEXT_BACKGROUND_COLORS.map(color => (
        <button
          key={color.id}
          type="button"
          role="menuitemradio"
          aria-label={color.label}
          aria-checked={selectedBackgroundColor.id === color.id}
          className={selectedBackgroundColor.id === color.id ? 'is-active' : ''}
          onClick={(event) => {
            event.stopPropagation();
            onBackgroundColorChange(color.id);
            setBackgroundMenuOpen(false);
          }}
        >
          <span
            className={`text-format-background-swatch ${color.id === 'none' ? 'is-none' : ''}`}
            style={{ '--text-background-swatch': color.swatch }}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  ) : null;

  const tagMenu = tagMenuOpen && tagMenuPosition ? (
    <div
      ref={tagMenuRef}
      className="text-format-tag-menu nodrag nopan"
      style={{ left: tagMenuPosition.left, top: tagMenuPosition.top }}
      role="menu"
      aria-label="节点标记颜色"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {NODE_TAG_COLORS.map(color => (
        <button
          key={color.id}
          type="button"
          role="menuitemcheckbox"
          aria-checked={normalizedTagColors.includes(color.id)}
          className={normalizedTagColors.includes(color.id) ? 'is-active' : ''}
          onClick={(event) => {
            event.stopPropagation();
            onTagToggle(color.id);
            setTagMenuOpen(false);
          }}
        >
          <span className="text-format-tag-menu-color" style={{ '--node-tag-color': color.value }}>
            {normalizedTagColors.includes(color.id) ? <Icon name="check" size={13} /> : null}
          </span>
          <span>{color.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return createPortal(
    <>
      {toolbar}
      {backgroundMenu}
      {tagMenu}
    </>,
    document.body,
  );
}

const isSafeColor = (value) => /^#[0-9a-fA-F]{3,8}$/.test(value || '');

const normalizeCssColor = (value) => {
  const color = String(value || '').trim();
  if (isSafeColor(color)) return color;
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return '';
  return `#${rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part)))
    .toString(16)
    .padStart(2, '0')).join('')}`;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const inlineMarkdownToHtml = (text) => {
  const source = String(text || '');
  const colorPattern = /\{color=(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/color\}/g;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = colorPattern.exec(source)) !== null) {
    html += inlineMarksToHtml(source.slice(lastIndex, match.index));
    const color = isSafeColor(match[1]) ? match[1] : TEXT_FORMAT_COLORS[0];
    html += `<span style="color: ${color};">${inlineMarksToHtml(match[2])}</span>`;
    lastIndex = match.index + match[0].length;
  }
  html += inlineMarksToHtml(source.slice(lastIndex));
  return html || '<br>';
};

const inlineMarksToHtml = (text) => {
  const source = String(text || '');
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    if (match[2]) html += `<strong>${escapeHtml(match[2])}</strong>`;
    else if (match[3]) html += `<em>${escapeHtml(match[3])}</em>`;
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
};

const markdownToRichTextHtml = (value) => {
  const text = String(value || '');
  if (!text.trim()) return '<p><br></p>';
  const lines = text.split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(`<li>${inlineMarkdownToHtml(itemMatch[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (olMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(`<li>${inlineMarkdownToHtml(itemMatch[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    blocks.push(`<p>${line.trim() ? inlineMarkdownToHtml(line) : '<br>'}</p>`);
    index += 1;
  }
  return blocks.join('');
};

const serializeInlineNode = (node) => {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'br') return '';
  const content = Array.from(element.childNodes).map(serializeInlineNode).join('');
  if (tag === 'strong' || tag === 'b') return content ? `**${content}**` : '';
  if (tag === 'em' || tag === 'i') return content ? `*${content}*` : '';
  if (tag === 'span') {
    const color = normalizeCssColor(element.style?.color);
    return color ? `{color=${color}}${content}{/color}` : content;
  }
  return content;
};

const serializeRichTextBlock = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'hr') return '---';
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(element.children)
      .filter(child => child.tagName?.toLowerCase() === 'li')
      .map((child, index) => {
        const content = serializeInlineNode(child).trim();
        return tag === 'ul' ? `- ${content}` : `${index + 1}. ${content}`;
      })
      .join('\n');
  }
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = Number(tag.slice(1));
    return `${'#'.repeat(level)} ${serializeInlineNode(element).trim()}`.trimEnd();
  }
  if (tag === 'div' || tag === 'p') return serializeInlineNode(element);
  return Array.from(element.childNodes).map(serializeRichTextBlock).join('\n');
};

const richTextHtmlToMarkdown = (root) => (
  Array.from(root?.childNodes || [])
    .map(serializeRichTextBlock)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
);

const selectionBelongsTo = (editor) => {
  if (!editor || typeof window === 'undefined') return false;
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  return Boolean(node && editor.contains(node));
};

const focusRichTextEditorEnd = (editor) => {
  if (!editor || typeof window === 'undefined') return;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const getRichTextFormatState = (editor) => {
  if (!selectionBelongsTo(editor)) return DEFAULT_TEXT_FORMAT_STATE;
  const selection = window.getSelection();
  let node = selection?.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : null;
  const closest = selector => element?.closest?.(selector);
  const block = closest('h1,h2,h3,p,div,li');
  const colorNode = closest('span[style*="color"]');
  return {
    ...DEFAULT_TEXT_FORMAT_STATE,
    block: ['h1', 'h2', 'h3'].includes(block?.tagName?.toLowerCase())
      ? block.tagName.toLowerCase()
      : 'p',
    bold: Boolean(closest('strong,b')),
    italic: Boolean(closest('em,i')),
    list: closest('ul') ? 'ul' : closest('ol') ? 'ol' : null,
    color: normalizeCssColor(colorNode?.style?.color)
      ? normalizeCssColor(colorNode?.style?.color)
      : DEFAULT_TEXT_FORMAT_STATE.color,
  };
};

const normalizeRichTextEditorDom = (editor) => {
  if (!editor) return;
  if (!editor.innerText.trim() && editor.querySelectorAll('img,video,audio').length === 0) {
    editor.innerHTML = '<p><br></p>';
  }
};

function renderInlineFormattedText(text, keyPrefix = 'inline') {
  const source = String(text || '');
  const colorPattern = /\{color=(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/color\}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = colorPattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderMarks(source.slice(lastIndex, match.index), `${keyPrefix}-${lastIndex}`));
    }
    const color = isSafeColor(match[1]) ? match[1] : 'currentColor';
    parts.push(
      <span key={`${keyPrefix}-color-${match.index}`} style={{ color }}>
        {renderMarks(match[2], `${keyPrefix}-color-${match.index}`)}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push(...renderMarks(source.slice(lastIndex), `${keyPrefix}-${lastIndex}`));
  }
  return parts.length ? parts : source;
}

function renderMarks(text, keyPrefix) {
  const source = String(text || '');
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
    if (match[2]) {
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={`${keyPrefix}-i-${match.index}`}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

function FormattedTextContent({ value, emptyText = '暂无文本内容' }) {
  const lines = String(value || '').split('\n');
  if (!String(value || '').trim()) return emptyText;

  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(<li key={`ul-${index}`}>{renderInlineFormattedText(itemMatch[1], `ul-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (olMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(<li key={`ol-${index}`}>{renderInlineFormattedText(itemMatch[1], `ol-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items}</ol>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const HeadingTag = `h${heading[1].length}`;
      blocks.push(
        <HeadingTag key={`h-${index}`}>
          {renderInlineFormattedText(heading[2], `h-${index}`)}
        </HeadingTag>
      );
      index += 1;
      continue;
    }
    blocks.push(
      <p key={`p-${index}`} className={line.trim() ? undefined : 'is-empty'}>
        {line.trim() ? renderInlineFormattedText(line, `p-${index}`) : '\u00a0'}
      </p>
    );
    index += 1;
  }

  return <div className="formatted-text-content">{blocks}</div>;
}

function RichTextEditor({
  editorRef,
  value,
  className,
  style,
  placeholder,
  onInput,
  onSelectionChange,
  onKeyDown,
  onBlur,
}) {
  const lastSyncedValueRef = useRef(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastSyncedValueRef.current === value) return;
    if (document.activeElement === editor && lastSyncedValueRef.current !== null) return;
    editor.innerHTML = markdownToRichTextHtml(value);
    lastSyncedValueRef.current = value;
  }, [editorRef, value]);

  const handleInput = useCallback((event) => {
    lastSyncedValueRef.current = richTextHtmlToMarkdown(event.currentTarget);
    onInput?.(event);
  }, [onInput]);

  const handleSelection = useCallback((event) => {
    onSelectionChange?.(event.currentTarget);
  }, [onSelectionChange]);

  const handlePaste = useCallback((event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    document.execCommand('insertText', false, text);
  }, []);

  return (
    <div
      ref={editorRef}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      spellCheck={false}
      onInput={handleInput}
      onSelect={handleSelection}
      onKeyUp={handleSelection}
      onMouseUp={handleSelection}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      onBlur={onBlur}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        if (event.metaKey || event.ctrlKey) return;
        event.stopPropagation();
      }}
      role="textbox"
      aria-multiline="true"
      aria-label="文本内容"
    />
  );
}

const parseImageAspect = (imageSize) => {
  if (imageSize === 'auto' || !imageSize || !imageSize.includes(':')) {
    return null;
  }
  const [w, h] = imageSize.split(':').map(n => Number.parseFloat(n));
  if (!w || !h) return null;
  return { cssValue: `${w} / ${h}`, ratio: w / h };
};

const hasStoryboardScriptShape = (data, cards) => (
  data?.resultType === 'generateStoryboardScript'
  || (
    Array.isArray(cards)
    && cards.length > 0
    && cards.some(card => (
      card?.shotNo
      || card?.title
      || card?.imagePositivePrompt
      || card?.imageUrl
      || card?.visual
      || card?.narration
    ))
  )
);

function ResultNode({ id, selected, data }) {
  const result = data?.result || '';
  const imageUrl = data?.imageUrl || '';
  const videoUrl = data?.videoUrl || '';
  const audioUrl = data?.audioUrl || '';
  const rawLabel = data?.label || '';
  const generating = data?.generating || false;
  const generationTask = data?.generationTask || null;
  const contentLocked = generating || ['running', 'saving'].includes(generationTask?.status);
  const smartSplitStatus = data?.smartSplitStatus || '';
  const imageSize = data?.imageSize || (
    data?.resultType === 'generateImage' && data?.imageSource === 'upload'
      ? 'auto'
      : '3:4'
  );
  const isImageResult = data?.resultType === 'generateImage';
  const isVideoResult = data?.resultType === 'generateVideo';
  const seedanceComplianceStatus = isImageResult ? data?.seedanceComplianceStatus || '' : '';
  const isEmptyVideoResult = isVideoResult && !videoUrl;
  const isAudioResult = data?.resultType === 'generateAudio';
  const isScriptResult = data?.resultType === 'generateScript';
  const isStoryboardResult = data?.resultType === 'generateStoryboard';
  const storyboardCards = Array.isArray(data?.storyboardCards) ? data.storyboardCards : [];
  const storyboardResourcePackage = data?.storyboardResourcePackage && typeof data.storyboardResourcePackage === 'object'
    ? data.storyboardResourcePackage
    : null;
  const storyboardVoiceoverScript = data?.storyboardVoiceoverScript || '';
  const isStoryboardScriptResult = hasStoryboardScriptShape(data, storyboardCards);
  const isTextResult = data?.resultType === 'generateText';
  const hasTextContent = isTextResult && typeof result === 'string' && Boolean(result.trim());
  const isComposerOpen = Boolean(data?.isComposerOpen);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const hasPendingTasks = Array.isArray(data?.taskIds) && data.taskIds.length > 0
    && !(Array.isArray(data?.imageUrls) && data.imageUrls.length > 0)
    && ['running', 'saving'].includes(data?.generationTask?.status);
  const onResultExpandStateChange = data?.onResultExpandStateChange;
  const label = isStoryboardScriptResult && ['生成分镜脚本', '分镜脚本生成器'].includes(rawLabel)
    ? '分镜工作台'
    : rawLabel;
  const displayLabel = label || (isStoryboardScriptResult ? '分镜工作台' : '结果');
  const storyboardBatchCoverTargets = storyboardCards.filter(card => (
    !card?.imageUrl
    && card?.imagePositivePrompt
    && !['running', 'saving'].includes(card?.imageGenerationTask?.status)
  ));
  const canBatchGenerateStoryboardCovers = isStoryboardScriptResult
    && storyboardCards.length > 0
    && typeof data?.onStoryboardCoverBatchGenerate === 'function';
  const titleIcon = isStoryboardScriptResult ? 'storyboardWorkbench' : isAudioResult ? 'audioGenFill' : isVideoResult ? 'videoGenFill' : isImageResult ? 'imageGenFill' : (isScriptResult || isStoryboardResult) ? 'barChartBoxAi' : 'inputMethodFill';
  const isResizableResult = isImageResult || isVideoResult || isAudioResult || isTextResult;
  const isSmartImageRatio = isImageResult && imageSize === 'auto';
  const keepResizeAspectRatio = isVideoResult || (isImageResult && !isSmartImageRatio);
  const nodeClassName = [
    'custom-node',
    'result-node',
    isImageResult || isVideoResult || isAudioResult ? 'result-media-node' : '',
    isImageResult ? 'result-image-node' : '',
    isVideoResult ? 'result-video-node' : '',
    isAudioResult ? 'result-audio-node' : '',
    isTextResult ? 'result-text-node' : '',
    isStoryboardScriptResult ? 'result-storyboard-node' : '',
    generating ? 'running' : '',
    data?.generationFailureFlashId ? 'generation-failure-flash' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  // ===== 多图结果（扇形堆叠） =====
  const allImageUrls = (() => {
    const normalizeDisplayUrls = urls => (
      data?.resultType === 'generateImage' ? preferCanvasServerUrls(urls) : urls
    );
    if (Array.isArray(data?.imageUrls) && data.imageUrls.length > 0) {
      return normalizeDisplayUrls(data.imageUrls.filter(Boolean));
    }
    if (data?.imageUrl) return normalizeDisplayUrls([data.imageUrl]);
    return [];
  })();
  const isMultiImage = allImageUrls.length > 1;
  const coverIndex = (typeof data?.coverIndex === 'number' && data.coverIndex >= 0 && data.coverIndex < allImageUrls.length)
    ? data.coverIndex
    : 0;
  const coverImageUrl = allImageUrls[coverIndex] || imageUrl;
  const imageDimensionsByUrl = data?.imageDimensionsByUrl || {};
  const hasMappedImageDimensions = Object.keys(imageDimensionsByUrl).length > 0;
  const imageResolution = normalizeImageDimensions(
    imageDimensionsByUrl[coverImageUrl]
      || (!isMultiImage || !hasMappedImageDimensions
        ? data?.imageDimensions
          || (data?.imageWidth && data?.imageHeight
            ? { width: data.imageWidth, height: data.imageHeight }
            : null)
        : null),
  );
  const imageResolutionLabel = formatImageDimensions(imageResolution);
  const videoResolution = normalizeImageDimensions(
    data?.videoDimensions
      || (data?.videoWidth && data?.videoHeight
        ? { width: data.videoWidth, height: data.videoHeight }
        : null),
  );
  const videoResolutionLabel = formatImageDimensions(videoResolution);
  const mediaResolutionLabel = isImageResult ? imageResolutionLabel : isVideoResult ? videoResolutionLabel : '';
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandedClosing, setIsExpandedClosing] = useState(false);
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [taskNowMs, setTaskNowMs] = useState(() => Date.now());
  const shouldShowTaskTiming = (isImageResult || isVideoResult) && Boolean(generationTask);
  const taskDurationLabel = shouldShowTaskTiming ? getTaskDurationLabel(generationTask, taskNowMs) : '';
  const nodeTaskTimingLabel = taskDurationLabel
    ? `${isTaskActive(generationTask?.status) ? '正在生成 · ' : ''}${taskDurationLabel}`
    : '';
  useEffect(() => {
    if (!shouldShowTaskTiming || !isTaskActive(generationTask?.status)) return undefined;
    setTaskNowMs(Date.now());
    const interval = window.setInterval(() => setTaskNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [generationTask?.created_at, generationTask?.id, generationTask?.status, shouldShowTaskTiming]);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isTextExpandedEditing, setIsTextExpandedEditing] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [videoTrimRequestId, setVideoTrimRequestId] = useState(0);
  const [isVideoTrimming, setIsVideoTrimming] = useState(false);
  const [videoEnhancementOpen, setVideoEnhancementOpen] = useState(false);
  const [videoEnhancementSettings, setVideoEnhancementSettings] = useState(DEFAULT_VIDEO_ENHANCEMENT_SETTINGS);
  const [videoEnhancementPosition, setVideoEnhancementPosition] = useState(null);
  const [videoEnhancementStatus, setVideoEnhancementStatus] = useState('');
  const videoEnhancementPanelRef = useRef(null);
  const videoEnhancementStatusTimerRef = useRef(null);
  const [subjectReplacementOpen, setSubjectReplacementOpen] = useState(false);
  const [subjectReplacementPosition, setSubjectReplacementPosition] = useState(null);
  const [subjectReplacementStatus, setSubjectReplacementStatus] = useState('');
  const [subjectRemovalOpen, setSubjectRemovalOpen] = useState(false);
  const [subjectRemovalPosition, setSubjectRemovalPosition] = useState(null);
  const [subjectRemovalStatus, setSubjectRemovalStatus] = useState('');
  const [videoExtensionOpen, setVideoExtensionOpen] = useState(false);
  const [videoExtensionPosition, setVideoExtensionPosition] = useState(null);
  const [videoExtensionStatus, setVideoExtensionStatus] = useState('');
  const [videoExtensionPrompt, setVideoExtensionPrompt] = useState('');
  const [videoExtensionDirection, setVideoExtensionDirection] = useState('片尾延长');
  const [videoExtensionDuration, setVideoExtensionDuration] = useState(8);
  const [videoExtensionMethod, setVideoExtensionMethod] = useState('自然延续');
  const [videoExtensionSettingsOpen, setVideoExtensionSettingsOpen] = useState(false);
  const [videoExtensionReferences, setVideoExtensionReferences] = useState([]);
  const [videoExtensionReferencePreview, setVideoExtensionReferencePreview] = useState(null);
  const [videoExtensionMentionOpen, setVideoExtensionMentionOpen] = useState(false);
  const [videoRetakeOpen, setVideoRetakeOpen] = useState(false);
  const [videoRetakePosition, setVideoRetakePosition] = useState(null);
  const [videoRetakeStatus, setVideoRetakeStatus] = useState('');
  const [videoRetakeMode, setVideoRetakeMode] = useState('固定');
  const [videoRetakeSegments, setVideoRetakeSegments] = useState(DEFAULT_VIDEO_RETAKE_SEGMENTS);
  const [selectedVideoRetakeSegmentId, setSelectedVideoRetakeSegmentId] = useState('shot-1');
  const [videoRetakePlayheadTime, setVideoRetakePlayheadTime] = useState(DEFAULT_VIDEO_RETAKE_PLAYHEAD_TIME);
  const [isVideoRetakePlayheadDragging, setIsVideoRetakePlayheadDragging] = useState(false);
  const [videoRetakeSwitchViewTab, setVideoRetakeSwitchViewTab] = useState('start');
  const [videoRetakeCameraSettings, setVideoRetakeCameraSettings] = useState(DEFAULT_VIDEO_RETAKE_CAMERA_SETTINGS);
  const [videoRetakePreviewImage, setVideoRetakePreviewImage] = useState('');
  const [videoRetakePrompt, setVideoRetakePrompt] = useState('');
  const [sourceSubject, setSourceSubject] = useState(null);
  const [removalSubject, setRemovalSubject] = useState(null);
  const [targetSubject, setTargetSubject] = useState(null);
  const [isSubjectMaskSelecting, setIsSubjectMaskSelecting] = useState(false);
  const [subjectMaskPurpose, setSubjectMaskPurpose] = useState('replacement');
  const [subjectMaskDraft, setSubjectMaskDraft] = useState(null);
  const [subjectMaskCursor, setSubjectMaskCursor] = useState('crosshair');
  const [isSubjectMaskDragging, setIsSubjectMaskDragging] = useState(false);
  const [isSubjectRecognizing, setIsSubjectRecognizing] = useState(false);
  const [replacementSourceMenuOpen, setReplacementSourceMenuOpen] = useState(false);
  const subjectReplacementPanelRef = useRef(null);
  const subjectRemovalPanelRef = useRef(null);
  const videoExtensionPanelRef = useRef(null);
  const videoRetakePanelRef = useRef(null);
  const videoRetakeFilmstripRef = useRef(null);
  const subjectReplacementStatusTimerRef = useRef(null);
  const subjectRemovalStatusTimerRef = useRef(null);
  const videoExtensionStatusTimerRef = useRef(null);
  const videoRetakeStatusTimerRef = useRef(null);
  const subjectMaskDragStartRef = useRef(null);
  const subjectMaskDragModeRef = useRef('draw');
  const subjectMaskResizeHandleRef = useRef('');
  const subjectReplacementUploadInputRef = useRef(null);
  const videoExtensionUploadInputRef = useRef(null);
  const targetSubjectObjectUrlRef = useRef('');
  const videoExtensionObjectUrlsRef = useRef(new Set());
  const videoRetakePlayheadDraggingRef = useRef(false);
  const isTextFormatEditing = isTextEditing || isTextExpandedEditing;
  const textBackgroundColor = resolveTextBackgroundColor(data?.textBackgroundColor);
  const textBackgroundStyle = textBackgroundColor.background
    ? {
        '--result-text-bg-color': textBackgroundColor.background,
        background: 'linear-gradient(var(--result-text-bg-color), var(--result-text-bg-color)), var(--canvas-inner-bg, var(--glass-bg))',
      }
    : undefined;
  const shouldShowTextFormatToolbar = isTextResult
    && !isMultiSelected
    && !data?.isProcessorExpanded
    && !contentLocked
    && !isTitleEditing
    && (
      isTextFormatEditing
      || (selected && !isTextExpanded)
    );
  const [hoveredImageIndex, setHoveredImageIndex] = useState(-1);
  const resultNodeRef = useRef(null);
  const resultVideoRef = useRef(null);
  const activeVideoTrim = useMemo(
    () => normalizeQuickTrimContract(data?.videoQuickTrims?.[videoUrl], videoUrl),
    [data?.videoQuickTrims, videoUrl],
  );
  const handleVideoQuickTrimConfirm = useCallback((contract) => {
    data?.onVideoQuickTrimChange?.(id, contract);
  }, [data, id]);
  const textEditorRef = useRef(null);
  const expandedTextEditorRef = useRef(null);
  const imageStackPointerStartRef = useRef(null);
  const storyboardFramePointerStartRef = useRef(null);
  const imageStackDragCleanupRef = useRef(null);
  const expandedCloseTimerRef = useRef(null);
  const expandedImageToolbarCloseTimerRef = useRef(null);
  const textToolbarCloseTimerRef = useRef(null);
  const uploadInputRef = useRef(null);
  const videoUploadInputRef = useRef(null);
  const audioUploadInputRef = useRef(null);
  const uploadObjectUrlRef = useRef('');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState('');
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');
  const [isTextToolbarOpen, setIsTextToolbarOpen] = useState(false);
  const [textSelection, setTextSelection] = useState({ start: 0, end: 0 });
  const [currentTextFormatState, setCurrentTextFormatState] = useState(DEFAULT_TEXT_FORMAT_STATE);
  const [previewState, setPreviewState] = useState({ imageUrl: '', images: [], index: 0 });
  const [imageContextMenu, setImageContextMenu] = useState(null);
  const imageContextMenuRef = useRef(null);
  const [expandedNodeSize, setExpandedNodeSize] = useState({ width: 0, height: 0 });
  const [expandedViewportSize, setExpandedViewportSize] = useState(getViewportSize);
  const videoEnhancementCredits = useMemo(() => {
    let credits = 12;
    if (videoEnhancementSettings.resolution === '2K') credits += 8;
    if (videoEnhancementSettings.resolution === '4K') credits += 18;
    if (videoEnhancementSettings.fps === '60fps') credits += 6;
    if (videoEnhancementSettings.fps === '90fps') credits += 12;
    if (videoEnhancementSettings.slow === '2x') credits += 8;
    return credits;
  }, [videoEnhancementSettings]);
  const subjectReplacementCredits = useMemo(() => (
    640 + (sourceSubject ? 100 : 0) + (targetSubject ? 100 : 0)
  ), [sourceSubject, targetSubject]);
  const subjectRemovalCredits = useMemo(() => (
    520 + (removalSubject ? 120 : 0)
  ), [removalSubject]);
  const videoExtensionCredits = useMemo(() => (
    420 + videoExtensionDuration * 28 + videoExtensionReferences.length * 24
  ), [videoExtensionDuration, videoExtensionReferences.length]);
  const selectedVideoRetakeSegment = useMemo(() => (
    videoRetakeSegments.find(segment => segment.id === selectedVideoRetakeSegmentId)
    || videoRetakeSegments[0]
    || DEFAULT_VIDEO_RETAKE_SEGMENTS[0]
  ), [selectedVideoRetakeSegmentId, videoRetakeSegments]);
  const videoRetakeTotalDuration = useMemo(() => (
    Math.max(...videoRetakeSegments.map(segment => Number(segment.end) || 0), DEFAULT_VIDEO_RETAKE_SEGMENTS[0].end)
  ), [videoRetakeSegments]);
  const videoRetakePlayheadPercent = useMemo(() => (
    videoRetakeTotalDuration > 0
      ? Math.max(0, Math.min(100, (videoRetakePlayheadTime / videoRetakeTotalDuration) * 100))
      : 0
  ), [videoRetakePlayheadTime, videoRetakeTotalDuration]);
  const videoRetakeCredits = useMemo(() => {
    const modeCost = videoRetakeMode === '保持不变' ? 220 : videoRetakeMode === '固定' ? 360 : 460;
    return modeCost + Math.max(0, videoRetakeSegments.length - 1) * 80;
  }, [videoRetakeMode, videoRetakeSegments.length]);
  const activeVideoRetakeCameraKey = videoRetakeMode === '切换'
    ? videoRetakeSwitchViewTab
    : 'fixed';
  const activeVideoRetakeCamera = videoRetakeCameraSettings[activeVideoRetakeCameraKey]
    || DEFAULT_VIDEO_RETAKE_CAMERA_SETTINGS.fixed;
  const videoRetakeAngle = activeVideoRetakeCamera.custom ? '自定义视角' : activeVideoRetakeCamera.angle;
  const videoRetakeShotSize = activeVideoRetakeCamera.shotSize;
  const videoRetakeCameraYaw = Number(activeVideoRetakeCamera.yaw) || 0;
  const videoRetakeCameraPitch = Number(activeVideoRetakeCamera.pitch) || 0;
  const videoRetakeCameraDistance = Number(activeVideoRetakeCamera.distance) || VIDEO_RETAKE_SHOT_DISTANCE[videoRetakeShotSize] || 4;
  const secondaryVideoRetakeCamera = videoRetakeMode === '切换'
    ? videoRetakeCameraSettings[videoRetakeSwitchViewTab === 'start' ? 'end' : 'start']
    : null;
  const canvasImageChoices = useMemo(() => (
    subjectReplacementOpen
      ? data?.onGetCanvasImageChoices?.(id) || []
      : []
  ), [data, id, subjectReplacementOpen]);
  const canvasMediaChoices = useMemo(() => (
    videoExtensionOpen || videoExtensionMentionOpen
      ? data?.onGetCanvasMediaChoices?.(id) || []
      : []
  ), [data, id, videoExtensionMentionOpen, videoExtensionOpen]);

  useCanvasWheelHandoff(resultNodeRef, {
    enabled: isTextResult,
  });

  useLayoutEffect(() => {
    if (!videoEnhancementOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(380, Math.max(300, rect.width + 28));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 16, rect.bottom + 10);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
      };
      setVideoEnhancementPosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, videoEnhancementOpen]);

  useLayoutEffect(() => {
    if (!subjectReplacementOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(520, Math.max(420, rect.width + 96));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 16, rect.bottom + 10);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
      };
      setSubjectReplacementPosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, subjectReplacementOpen]);

  useLayoutEffect(() => {
    if (!subjectRemovalOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(380, Math.max(320, rect.width + 40));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 16, rect.bottom + 10);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
      };
      setSubjectRemovalPosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, subjectRemovalOpen]);

  useLayoutEffect(() => {
    if (!videoExtensionOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(620, Math.max(460, rect.width + 220));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 16, rect.bottom + 12);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
      };
      setVideoExtensionPosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, videoExtensionOpen]);

  useLayoutEffect(() => {
    if (!videoRetakeOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(760, Math.max(560, rect.width + 320));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 280, rect.bottom + 8);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
        maxHeight: Math.max(280, Math.round(window.innerHeight - top - 12)),
      };
      setVideoRetakePosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
        && current.maxHeight === nextPosition.maxHeight
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, videoRetakeOpen]);

  useEffect(() => {
    if (!videoEnhancementOpen) return undefined;

    const closeOnOutsidePointer = event => {
      const target = event.target;
      if (videoEnhancementPanelRef.current?.contains(target)) return;
      if (target?.closest?.('.node-hover-toolbar-portal, .node-hover-toolbar-anchor')) return;
      if (resultNodeRef.current?.contains(target)) return;
      setVideoEnhancementOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setVideoEnhancementOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [videoEnhancementOpen]);

  useEffect(() => {
    if (!subjectReplacementOpen) return undefined;

    const closeOnOutsidePointer = event => {
      const target = event.target;
      if (subjectReplacementPanelRef.current?.contains(target)) return;
      if (target?.closest?.('.node-hover-toolbar-portal, .node-hover-toolbar-anchor')) return;
      if (resultNodeRef.current?.contains(target)) return;
      setSubjectReplacementOpen(false);
      setIsSubjectMaskSelecting(false);
      setReplacementSourceMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      setSubjectReplacementOpen(false);
      setIsSubjectMaskSelecting(false);
      setReplacementSourceMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [subjectReplacementOpen]);

  useEffect(() => {
    if (!subjectRemovalOpen) return undefined;

    const closeOnOutsidePointer = event => {
      const target = event.target;
      if (subjectRemovalPanelRef.current?.contains(target)) return;
      if (target?.closest?.('.node-hover-toolbar-portal, .node-hover-toolbar-anchor')) return;
      if (resultNodeRef.current?.contains(target)) return;
      setSubjectRemovalOpen(false);
      setIsSubjectMaskSelecting(false);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      setSubjectRemovalOpen(false);
      setIsSubjectMaskSelecting(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [subjectRemovalOpen]);

  useEffect(() => {
    if (!videoExtensionOpen) return undefined;

    const closeOnOutsidePointer = event => {
      const target = event.target;
      if (videoExtensionPanelRef.current?.contains(target)) return;
      if (target?.closest?.('.node-hover-toolbar-portal, .node-hover-toolbar-anchor, .reference-image-preview-portal')) return;
      if (resultNodeRef.current?.contains(target)) return;
      setVideoExtensionOpen(false);
      setVideoExtensionSettingsOpen(false);
      setVideoExtensionMentionOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      if (videoExtensionSettingsOpen || videoExtensionMentionOpen) {
        setVideoExtensionSettingsOpen(false);
        setVideoExtensionMentionOpen(false);
      } else {
        setVideoExtensionOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [videoExtensionMentionOpen, videoExtensionOpen, videoExtensionSettingsOpen]);

  useEffect(() => {
    if (!videoRetakeOpen) return undefined;

    const closeOnEscape = event => {
      if (event.key === 'Escape') setVideoRetakeOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [videoRetakeOpen]);

  useEffect(() => {
    if (selected && isVideoResult) return undefined;
    const timer = window.setTimeout(() => setVideoEnhancementOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [isVideoResult, selected]);

  useEffect(() => {
    if (selected && isVideoResult) return undefined;
    const timer = window.setTimeout(() => {
      setSubjectReplacementOpen(false);
      setSubjectRemovalOpen(false);
      setVideoExtensionOpen(false);
      setVideoRetakeOpen(false);
      setIsSubjectMaskSelecting(false);
      setReplacementSourceMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isVideoResult, selected]);

  useEffect(() => {
    if (!videoRetakeOpen || !isVideoResult) {
      setVideoRetakePreviewImage('');
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const video = resultVideoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        setVideoRetakePreviewImage(canvas.toDataURL('image/png'));
      } catch {
        // 视频源如果不允许被 canvas 读取，就让 3D 控件使用默认占位平面。
        setVideoRetakePreviewImage('');
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isVideoResult, videoRetakeOpen, videoUrl]);

  useEffect(() => () => {
    window.clearTimeout(videoEnhancementStatusTimerRef.current);
    window.clearTimeout(subjectReplacementStatusTimerRef.current);
    window.clearTimeout(subjectRemovalStatusTimerRef.current);
    window.clearTimeout(videoExtensionStatusTimerRef.current);
    window.clearTimeout(videoRetakeStatusTimerRef.current);
    if (targetSubjectObjectUrlRef.current) {
      URL.revokeObjectURL(targetSubjectObjectUrlRef.current);
      targetSubjectObjectUrlRef.current = '';
    }
    videoExtensionObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    videoExtensionObjectUrlsRef.current.clear();
  }, []);

  const expandedAspect = useMemo(() => parseImageAspect(imageSize), [imageSize]);
  const expandedAspectRatio = expandedAspect?.cssValue || '1 / 1';
  const expandedAspectNumber = expandedAspect?.ratio || 1;
  const expandedFallbackCardWidth = expandedAspectNumber >= 1.45
    ? 280
    : expandedAspectNumber <= 0.9
      ? 180
      : 220;
  const expandedLayout = useMemo(() => calculateExpandedImageLayout({
    imageCount: allImageUrls.length,
    aspectRatio: expandedAspectNumber,
    nodeWidth: expandedNodeSize.width,
    fallbackCardWidth: expandedFallbackCardWidth,
    viewportWidth: expandedViewportSize.width,
    viewportHeight: expandedViewportSize.height,
  }), [
    allImageUrls.length,
    expandedAspectNumber,
    expandedFallbackCardWidth,
    expandedNodeSize.width,
    expandedViewportSize.height,
    expandedViewportSize.width,
  ]);
  const expandedCardWidth = expandedLayout.cardWidth;
  const expandedGridClass = expandedLayout.gridClass;

  useLayoutEffect(() => {
    if (!isExpanded) return undefined;
    const measureNode = () => {
      const nextViewportSize = getViewportSize();
      setExpandedViewportSize(current => (
        current.width === nextViewportSize.width && current.height === nextViewportSize.height
          ? current
          : nextViewportSize
      ));
      const rect = resultNodeRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setExpandedNodeSize(current => (
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize
      ));
    };
    measureNode();
    window.addEventListener('resize', measureNode);
    return () => window.removeEventListener('resize', measureNode);
  }, [isExpanded]);

  useEffect(() => {
    if (!isTextEditing || !textEditorRef.current) return undefined;
    const frameId = requestAnimationFrame(() => {
      const editor = textEditorRef.current;
      if (!editor) return;
      focusRichTextEditorEnd(editor);
      setCurrentTextFormatState(getRichTextFormatState(editor));
    });
    return () => cancelAnimationFrame(frameId);
  }, [isTextEditing]);

  useEffect(() => {
    if (!isTextExpandedEditing || !expandedTextEditorRef.current) return undefined;
    const frameId = requestAnimationFrame(() => {
      const editor = expandedTextEditorRef.current;
      if (!editor) return;
      focusRichTextEditorEnd(editor);
      setCurrentTextFormatState(getRichTextFormatState(editor));
    });
    return () => cancelAnimationFrame(frameId);
  }, [isTextExpandedEditing]);

  const enterTextEditing = useCallback((event) => {
    if (!isTextResult || contentLocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(false);
    data?.onTextEditingChange?.(id, true);
    setIsTextEditing(true);
  }, [contentLocked, data, id, isTextResult]);

  const handleTextEditorBlur = useCallback(() => {
    setIsTextEditing(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  const syncTextSelection = useCallback((editor) => {
    if (!editor) return;
    setCurrentTextFormatState(getRichTextFormatState(editor));
  }, []);

  const getActiveTextEditor = useCallback(() => (
    isTextExpandedEditing ? expandedTextEditorRef.current : textEditorRef.current
  ), [isTextExpandedEditing]);

  const commitRichTextEditorValue = useCallback((editor) => {
    if (!editor) return;
    normalizeRichTextEditorDom(editor);
    data?.onResultTextChange?.(id, richTextHtmlToMarkdown(editor));
    setCurrentTextFormatState(getRichTextFormatState(editor));
  }, [data, id]);

  const applyTextEditorFormat = useCallback((action, payload) => {
    const editor = getActiveTextEditor();
    if (!editor) {
      const next = applyTextFormat(result, textSelection.start, textSelection.end, action, payload);
      data?.onResultTextChange?.(id, next.value);
      setTextSelection({ start: next.selectionStart, end: next.selectionEnd });
      return;
    }

    if (!selectionBelongsTo(editor)) focusRichTextEditorEnd(editor);
    editor.focus();
    if (action === 'h1' || action === 'h2' || action === 'h3' || action === 'p') {
      document.execCommand('formatBlock', false, action === 'p' ? 'p' : action);
    } else if (action === 'bold') {
      document.execCommand('bold', false);
    } else if (action === 'italic') {
      document.execCommand('italic', false);
    } else if (action === 'ul') {
      document.execCommand('insertUnorderedList', false);
    } else if (action === 'ol') {
      document.execCommand('insertOrderedList', false);
    } else if (action === 'rule') {
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
    }
    commitRichTextEditorValue(editor);
  }, [commitRichTextEditorValue, data, getActiveTextEditor, id, result, textSelection.end, textSelection.start]);

  const handleTextEditorKeyDown = useCallback((event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'i') return;
    event.preventDefault();
    event.stopPropagation();
    applyTextEditorFormat(key === 'b' ? 'bold' : 'italic');
  }, [applyTextEditorFormat]);

  const openTextExpandedEditor = useCallback((event) => {
    if (!isTextResult) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextEditing(false);
    setIsTextExpanded(true);
    setIsTextExpandedEditing(true);
    data?.onTextEditingChange?.(id, true);
  }, [data, id, isTextResult]);

  const handleTextFormatCommand = useCallback((command) => {
    if (command === 'expand') {
      openTextExpandedEditor();
      return;
    }
    if (command === 'copyPrompt') {
      const copyPrompt = async () => {
        if (!result) return;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(result);
            return;
          }
          const textarea = document.createElement('textarea');
          textarea.value = result;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        } catch {
          // ignore clipboard failures
        }
      };
      copyPrompt();
      return;
    }
  }, [openTextExpandedEditor, result]);

  const openTextExpanded = useCallback((event) => {
    if (!isTextResult) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpanded(true);
  }, [isTextResult]);

  const closeTextExpanded = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpandedEditing(false);
    setIsTextExpanded(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  const enterTextExpandedEditing = useCallback((event) => {
    if (!isTextResult || contentLocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpandedEditing(true);
    data?.onTextEditingChange?.(id, true);
  }, [contentLocked, data, id, isTextResult]);

  const handleTextExpandedEditorBlur = useCallback(() => {
    setIsTextExpandedEditing(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  useEffect(() => {
    if (!isTextExpanded) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeTextExpanded(event);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeTextExpanded, isTextExpanded]);

  const requestCloseExpandedImages = useCallback(() => {
    if (!isExpanded) return;
    window.clearTimeout(expandedCloseTimerRef.current);
    setIsExpandedClosing(true);
    expandedCloseTimerRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      setIsExpandedClosing(false);
      setHoveredImageIndex(-1);
    }, EXPANDED_IMAGE_CLOSE_MS);
  }, [isExpanded]);

  const openExpandedImages = useCallback(() => {
    window.clearTimeout(expandedCloseTimerRef.current);
    setExpandedViewportSize(getViewportSize());
    setIsExpandedClosing(false);
    setIsExpanded(true);
  }, []);

  const openImageContextMenu = useCallback((event, contextImageUrl, imageIndexAt = 0) => {
    if (!contextImageUrl) return;
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('pplai:close-pane-context-menu'));
    const menuWidth = 184;
    const menuHeight = 84;
    const viewportPadding = 8;
    setImageContextMenu({
      imageUrl: contextImageUrl,
      imageIndex: imageIndexAt,
      x: Math.max(viewportPadding, Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)),
      y: Math.max(viewportPadding, Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)),
    });
  }, []);

  const closeImageContextMenu = useCallback(() => {
    setImageContextMenu(null);
  }, []);

  const copyContextMenuImage = useCallback(async () => {
    const contextImageUrl = imageContextMenu?.imageUrl;
    closeImageContextMenu();
    if (!contextImageUrl) return;
    try {
      await copyImageToClipboard(contextImageUrl);
    } catch (error) {
      window.alert(error?.message || '复制图片失败，请重试');
    }
  }, [closeImageContextMenu, imageContextMenu?.imageUrl]);

  const downloadContextMenuImage = useCallback(async () => {
    const contextImageUrl = imageContextMenu?.imageUrl;
    const contextImageIndex = imageContextMenu?.imageIndex || 0;
    closeImageContextMenu();
    if (!contextImageUrl) return;
    const result = await downloadImages([{
      url: contextImageUrl,
      filename: `image-${id}-${contextImageIndex + 1}`,
    }], 'image');
    if (result.downloaded === 0) {
      window.alert('图片下载失败，请重试');
    }
  }, [closeImageContextMenu, id, imageContextMenu]);

  useEffect(() => {
    if (!imageContextMenu) return undefined;
    const handlePointerDown = event => {
      if (imageContextMenuRef.current?.contains(event.target)) return;
      closeImageContextMenu();
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') closeImageContextMenu();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', closeImageContextMenu);
    window.addEventListener('blur', closeImageContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', closeImageContextMenu);
      window.removeEventListener('blur', closeImageContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeImageContextMenu, imageContextMenu]);

  // 失焦自动收起
  useEffect(() => {
    if (!isExpanded) return undefined;
    const handler = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      // 节点本身 + 它的处理器（generator）都不算"外部"
      const insideResult = target.closest(`[data-id="${id}"]`);
      if (insideResult) return;
      // InteractiveHandle 是 fixed 浮层，菜单也是 fixed 浮层 → 都不算外部
      if (target.closest('.node-interactive-handle, .canvas-context-menu, .image-preview-overlay, .image-action-toolbar, .storyboard-script-overlay, .result-image-set-cover-btn, .result-image-expanded-card, .result-image-expanded-close, .result-image-stack-toggle')) return;
      requestCloseExpandedImages();
    };
    // 用 mousedown 抢在 click 之前，但延迟 0ms 让当前点击的冒泡完成
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handler, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handler, true);
    };
  }, [isExpanded, id, requestCloseExpandedImages]);

  useEffect(() => {
    if (!isExpanded) return undefined;

    const handleKeyDown = (event) => {
      if (!shouldCloseExpandedImagesOnKeyDown({
        key: event.key,
        target: event.target,
        previewOpen: Boolean(previewState.imageUrl),
      })) return;

      event.preventDefault();
      requestCloseExpandedImages();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, previewState.imageUrl, requestCloseExpandedImages]);

  useEffect(() => () => {
    window.clearTimeout(expandedCloseTimerRef.current);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(textToolbarCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selected) return;
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(false);
  }, [selected]);

  const handleImageActionEditingChange = useCallback((editing) => {
    data?.onImageActionEditingChange?.(id, editing);
  }, [data, id]);

  const openTextToolbar = useCallback(() => {
    if (isMultiSelected || hasTextContent || isVideoResult || (selected && !isStoryboardScriptResult)) return;
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(true);
  }, [hasTextContent, isMultiSelected, isStoryboardScriptResult, isVideoResult, selected]);

  const scheduleCloseTextToolbar = useCallback(() => {
    window.clearTimeout(textToolbarCloseTimerRef.current);
    textToolbarCloseTimerRef.current = window.setTimeout(() => {
      setIsTextToolbarOpen(false);
    }, RESULT_TOOLBAR_CLOSE_MS);
  }, []);

  const releaseUploadPreview = useCallback(() => {
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = '';
    }
    setUploadPreviewUrl('');
  }, []);

  useEffect(() => () => {
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = '';
    }
  }, []);

  const openUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isImageResult || isUploadingImage || contentLocked) return;
    setUploadError('');
    uploadInputRef.current?.click();
  }, [contentLocked, isImageResult, isUploadingImage]);

  const handleUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedImageFile);
    if (!file) {
      setUploadError(getUnsupportedImageMessage(files.length || 1));
      return;
    }

    releaseUploadPreview();
    const objectUrl = URL.createObjectURL(file);
    uploadObjectUrlRef.current = objectUrl;
    setUploadPreviewUrl(objectUrl);
    setUploadProgress(0);
    setUploadError('');
    setIsUploadingImage(true);

    try {
      const [asset, imageSize] = await Promise.all([
        uploadImageFile(file, setUploadProgress),
        readLocalImageFileSize(file),
      ]);
      if (!asset?.url) throw new Error('图片上传成功但未返回图片地址');
      data?.onResultImageUpload?.(id, asset.url, {
        width: imageSize?.width || asset.width,
        height: imageSize?.height || asset.height,
      });
    } catch (error) {
      setUploadError(error?.message || '图片上传失败，请重试');
    } finally {
      setIsUploadingImage(false);
      releaseUploadPreview();
    }
  }, [contentLocked, data, id, releaseUploadPreview]);

  const openVideoUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isVideoResult || isUploadingVideo || contentLocked) return;
    setVideoUploadError('');
    videoUploadInputRef.current?.click();
  }, [contentLocked, isUploadingVideo, isVideoResult]);

  const handleVideoUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedVideoFile);
    if (!file) {
      setVideoUploadError(getUnsupportedVideoMessage(files.length || 1));
      return;
    }

    setVideoUploadProgress(0);
    setVideoUploadError('');
    setIsUploadingVideo(true);
    try {
      const asset = await uploadVideoFile(file, setVideoUploadProgress);
      if (!asset?.url) throw new Error('视频上传成功但未返回视频地址');
      data?.onResultVideoUpload?.(id, asset.url);
    } catch (error) {
      setVideoUploadError(error?.message || '视频上传失败，请重试');
    } finally {
      setIsUploadingVideo(false);
    }
  }, [contentLocked, data, id]);

  const openAudioUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isAudioResult || isUploadingAudio || contentLocked) return;
    setAudioUploadError('');
    audioUploadInputRef.current?.click();
  }, [contentLocked, isAudioResult, isUploadingAudio]);

  const handleAudioUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedAudioFile);
    if (!file) {
      setAudioUploadError(getUnsupportedAudioMessage());
      return;
    }

    setAudioUploadProgress(0);
    setAudioUploadError('');
    setIsUploadingAudio(true);
    try {
      const asset = await uploadAudioFile(file, setAudioUploadProgress);
      if (!asset?.url) throw new Error('音频上传成功但未返回音频地址');
      data?.onResultAudioUpload?.(id, asset.url);
    } catch (error) {
      setAudioUploadError(error?.message || '音频上传失败，请重试');
    } finally {
      setIsUploadingAudio(false);
    }
  }, [contentLocked, data, id]);

  const displayedImageUrls = useMemo(() => {
    if (!uploadPreviewUrl) return allImageUrls;
    if (allImageUrls.length === 0) return [uploadPreviewUrl];
    return allImageUrls.map((url, index) => (
      index === coverIndex ? uploadPreviewUrl : url
    ));
  }, [allImageUrls, coverIndex, uploadPreviewUrl]);
  const displayedBrowserImageUrls = useMemo(
    () => displayedImageUrls.map(url => toDisplayMediaUrl(url)),
    [displayedImageUrls],
  );
  const displayedCoverUrl = displayedBrowserImageUrls[coverIndex] || toDisplayMediaUrl(uploadPreviewUrl || coverImageUrl);

  // 展开时把节点 zIndex 顶到最高，避免被旁边节点遮住；收起时复位
  useEffect(() => {
    if (onResultExpandStateChange) {
      onResultExpandStateChange(id, isExpanded);
    }
    return () => {
      if (isExpanded && onResultExpandStateChange) {
        onResultExpandStateChange(id, false);
      }
    };
  }, [id, isExpanded, onResultExpandStateChange]);

  // 切换封面
  const handleSetCover = useCallback((index, event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (index < 0 || index >= allImageUrls.length) return;
    if (index === coverIndex) return;
    if (data?.onResultDataChange) {
      data.onResultDataChange(id, {
        coverIndex: index,
        imageUrl: allImageUrls[index],
        manualCoverRunId: data.currentRunId || data.generationTask?.runId || '',
        manualCoverUpdatedAt: Date.now(),
      });
    }
  }, [allImageUrls, coverIndex, data, id]);

  // 拖出图片到画布
  const handleImageDragStart = useCallback((event, imageUrlAt, index) => {
    if (!imageUrlAt) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ai-canvas-material', JSON.stringify({
      type: 'image',
      imageUrl: imageUrlAt,
      name: `生成图 ${index + 1}`,
      id: `result_image_${id}_${index}`,
    }));
  }, [id]);

  // 打开全屏预览（双击图片）
  const openPreview = useCallback((imageUrlAt, event, previewImages = [], previewIndex = 0) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!imageUrlAt) return;
    const images = (previewImages && previewImages.length > 0 ? previewImages : [imageUrlAt]).filter(Boolean);
    const safeIndex = Math.max(0, Math.min(previewIndex, images.length - 1));
    setPreviewState({
      imageUrl: images[safeIndex] || imageUrlAt,
      images,
      index: safeIndex,
    });
  }, []);

  useEffect(() => () => {
    imageStackDragCleanupRef.current?.();
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
    }
  }, []);

  const openExpandedImageToolbar = useCallback((index) => {
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
      expandedImageToolbarCloseTimerRef.current = null;
    }
    setHoveredImageIndex(index);
  }, []);

  const scheduleCloseExpandedImageToolbar = useCallback((index) => {
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
    }
    expandedImageToolbarCloseTimerRef.current = window.setTimeout(() => {
      setHoveredImageIndex(prev => prev === index ? -1 : prev);
      expandedImageToolbarCloseTimerRef.current = null;
    }, IMAGE_TOOLBAR_CLOSE_MS);
  }, []);

  const beginImageStackDrag = useCallback((event) => {
    if (event.button !== 0 || event.target.closest('.result-image-stack-toggle')) return;

    imageStackDragCleanupRef.current?.();

    const pointerStart = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    imageStackPointerStartRef.current = pointerStart;

    let lastX = event.clientX;
    let lastY = event.clientY;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;

      const totalDx = moveEvent.clientX - pointerStart.x;
      const totalDy = moveEvent.clientY - pointerStart.y;
      const moved = Math.sqrt(totalDx * totalDx + totalDy * totalDy) > IMAGE_POINTER_INTENT_THRESHOLD;

      if (!moved) return;

      pointerStart.moved = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      const delta = {
        x: moveEvent.clientX - lastX,
        y: moveEvent.clientY - lastY,
      };

      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      data?.onResultNodeDragByScreenDelta?.(id, delta);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', cleanup, true);
      window.removeEventListener('pointercancel', cleanup, true);
      imageStackDragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', cleanup, true);
    window.addEventListener('pointercancel', cleanup, true);
    imageStackDragCleanupRef.current = cleanup;
  }, [data, id]);

  const didMoveImageStackPointer = useCallback((event) => {
    const start = imageStackPointerStartRef.current;
    imageStackPointerStartRef.current = null;
    if (!start) return false;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    return start.moved || Math.sqrt(dx * dx + dy * dy) > IMAGE_POINTER_INTENT_THRESHOLD;
  }, []);

  const isImagePreviewExcludedTarget = useCallback((target) => (
    target?.closest?.('.image-action-toolbar, .image-action-layer, .result-image-upload-control, .result-image-upload-status, .result-image-upload-error, .canvas-node-resize-handle, .node-interactive-handle, .react-flow__handle')
  ), []);

  // 不同 result 类型的最小尺寸
  const resizeMinWidth = isImageResult || isVideoResult
    ? 160
    : isStoryboardScriptResult
      ? 340
      : 220;
  const resizeMinHeight = isImageResult || isVideoResult
    ? 100
    : isStoryboardScriptResult
      ? 220
      : 140;

  // 将 imageSize (如 '16:9' 或 'auto') 转为 CSS aspect-ratio
  const getAspectStyle = () => {
    return expandedAspect ? { aspectRatio: expandedAspect.cssValue } : {};
  };

  const [expandedCardIndex, setExpandedCardIndex] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState(null);
  const [editForm, setEditForm] = useState({});
  const handleImageLoad = useCallback((event, loadedImageUrl = coverImageUrl) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      data?.onResultImageDimensionsChange?.(id, loadedImageUrl, {
        width: naturalWidth,
        height: naturalHeight,
      });
      data?.onResultMediaAspectChange?.(id, naturalWidth / naturalHeight);
    }
  }, [coverImageUrl, data, id]);

  const handleVideoLoadedMetadata = useCallback((event) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0) {
      data?.onResultVideoDimensionsChange?.(id, videoUrl, {
        width: videoWidth,
        height: videoHeight,
      });
      data?.onResultMediaAspectChange?.(id, videoWidth / videoHeight);
    }
  }, [data, id, videoUrl]);

  const captureVideoFrame = useCallback(async (kind = 'current') => {
    const video = resultVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const originalTime = video.currentTime;
    const targetTime = kind === 'first'
      ? 0
      : kind === 'last'
        ? Math.max(0, (video.duration || 0) - 0.05)
        : originalTime;
    if (Math.abs(targetTime - originalTime) > 0.01) {
      await new Promise((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('视频定位失败')); };
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.currentTime = targetTime;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    data?.onCaptureVideoFrame?.(id, canvas.toDataURL('image/png'), {
      width: canvas.width,
      height: canvas.height,
      kind,
      time: targetTime,
    });
    if (Math.abs(targetTime - originalTime) > 0.01) video.currentTime = originalTime;
  }, [data, id]);

  const requestVideoFullscreen = useCallback(() => {
    const video = resultVideoRef.current;
    const requestFullscreen = video?.requestFullscreen
      || video?.webkitRequestFullscreen
      || video?.webkitEnterFullscreen;
    requestFullscreen?.call(video);
  }, []);

  const updateVideoEnhancementSetting = useCallback((key, value) => {
    setVideoEnhancementSettings(current => ({ ...current, [key]: value }));
  }, []);

  const runVideoEnhancementPrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!isVideoResult || !videoUrl) return;

    // Prototype only: this creates a connected downstream video node for flow
    // feedback, but it never calls the backend, starts a task, or spends credits.
    const result = data?.onCreateVideoEnhancementPrototype?.(id, {
      ...videoEnhancementSettings,
      credits: videoEnhancementCredits,
      videoUrl,
    });
    if (result?.ok) {
      setVideoEnhancementOpen(false);
      return;
    }

    setVideoEnhancementStatus('仅原型展示，暂未接入真实增强');
    window.clearTimeout(videoEnhancementStatusTimerRef.current);
    videoEnhancementStatusTimerRef.current = window.setTimeout(() => {
      setVideoEnhancementStatus('');
    }, 1800);
  }, [data, id, isVideoResult, videoEnhancementCredits, videoEnhancementSettings, videoUrl]);

  const showSubjectReplacementStatus = useCallback((message, duration = 1800) => {
    setSubjectReplacementStatus(message);
    window.clearTimeout(subjectReplacementStatusTimerRef.current);
    subjectReplacementStatusTimerRef.current = window.setTimeout(() => {
      setSubjectReplacementStatus('');
    }, duration);
  }, []);

  const showSubjectRemovalStatus = useCallback((message, duration = 1800) => {
    setSubjectRemovalStatus(message);
    window.clearTimeout(subjectRemovalStatusTimerRef.current);
    subjectRemovalStatusTimerRef.current = window.setTimeout(() => {
      setSubjectRemovalStatus('');
    }, duration);
  }, []);

  const beginSubjectMaskSelection = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!isVideoResult || !videoUrl) return;
    setSubjectMaskPurpose('replacement');
    setSubjectReplacementOpen(true);
    setSubjectRemovalOpen(false);
    setVideoEnhancementOpen(false);
    setIsSubjectMaskSelecting(true);
    setSubjectMaskDraft(null);
    setSubjectMaskCursor('crosshair');
    showSubjectReplacementStatus('请在视频画面中拖拽框选主体');
  }, [isVideoResult, showSubjectReplacementStatus, videoUrl]);

  const beginSubjectRemovalMaskSelection = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!isVideoResult || !videoUrl) return;
    setSubjectMaskPurpose('removal');
    setSubjectRemovalOpen(true);
    setSubjectReplacementOpen(false);
    setVideoEnhancementOpen(false);
    setIsSubjectMaskSelecting(true);
    setSubjectMaskDraft(null);
    setSubjectMaskCursor('crosshair');
    showSubjectRemovalStatus('请在视频画面中框选需要移除的主体');
  }, [isVideoResult, showSubjectRemovalStatus, videoUrl]);

  const cancelSubjectMaskSelection = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsSubjectMaskSelecting(false);
    setIsSubjectMaskDragging(false);
    setSubjectMaskDraft(null);
    setSubjectMaskCursor('crosshair');
  }, []);

  const getSubjectMaskRectFromPointer = useCallback((event, startPoint) => {
    const wrap = resultNodeRef.current?.querySelector?.('.result-video-wrap');
    const rect = wrap?.getBoundingClientRect();
    if (!rect) return null;
    const currentX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const left = Math.min(startPoint.x, currentX);
    const top = Math.min(startPoint.y, currentY);
    const width = Math.max(24, Math.abs(currentX - startPoint.x));
    const height = Math.max(24, Math.abs(currentY - startPoint.y));
    return {
      x: Math.round((left / rect.width) * 1000) / 10,
      y: Math.round((top / rect.height) * 1000) / 10,
      width: Math.round((Math.min(width, rect.width - left) / rect.width) * 1000) / 10,
      height: Math.round((Math.min(height, rect.height - top) / rect.height) * 1000) / 10,
    };
  }, []);

  const clampSubjectMaskDraft = useCallback((draft) => {
    const width = Math.max(1, Math.min(100, Number(draft?.width) || 1));
    const height = Math.max(1, Math.min(100, Number(draft?.height) || 1));
    return {
      x: Math.round(Math.max(0, Math.min(100 - width, Number(draft?.x) || 0)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(100 - height, Number(draft?.y) || 0)) * 10) / 10,
      width: Math.round(width * 10) / 10,
      height: Math.round(height * 10) / 10,
    };
  }, []);

  const clampSubjectMaskDraftLive = useCallback((draft) => {
    const width = Math.max(1, Math.min(100, Number(draft?.width) || 1));
    const height = Math.max(1, Math.min(100, Number(draft?.height) || 1));
    return {
      x: Math.max(0, Math.min(100 - width, Number(draft?.x) || 0)),
      y: Math.max(0, Math.min(100 - height, Number(draft?.y) || 0)),
      width,
      height,
    };
  }, []);

  const getSubjectMaskResizeHandle = useCallback((pointerPercent, draft, videoRect) => {
    if (!draft || !videoRect) return '';
    const thresholdX = Math.max(1.5, Math.min(4, (10 / videoRect.width) * 100));
    const thresholdY = Math.max(1.5, Math.min(4, (10 / videoRect.height) * 100));
    const nearLeft = Math.abs(pointerPercent.x - draft.x) <= thresholdX;
    const nearRight = Math.abs(pointerPercent.x - (draft.x + draft.width)) <= thresholdX;
    const nearTop = Math.abs(pointerPercent.y - draft.y) <= thresholdY;
    const nearBottom = Math.abs(pointerPercent.y - (draft.y + draft.height)) <= thresholdY;
    const withinX = pointerPercent.x >= draft.x - thresholdX && pointerPercent.x <= draft.x + draft.width + thresholdX;
    const withinY = pointerPercent.y >= draft.y - thresholdY && pointerPercent.y <= draft.y + draft.height + thresholdY;
    if (!withinX || !withinY) return '';
    const vertical = nearTop ? 'n' : nearBottom ? 's' : '';
    const horizontal = nearLeft ? 'w' : nearRight ? 'e' : '';
    return `${vertical}${horizontal}`;
  }, []);

  const getSubjectMaskCursor = useCallback((handle, insideMask) => {
    if (handle === 'n' || handle === 's') return 'ns-resize';
    if (handle === 'e' || handle === 'w') return 'ew-resize';
    if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
    if (handle === 'nw' || handle === 'se') return 'nwse-resize';
    return insideMask ? 'move' : 'crosshair';
  }, []);

  const resizeSubjectMaskDraft = useCallback((draft, pointerPercent, handle) => {
    const minSize = 8;
    let left = draft.x;
    let top = draft.y;
    let right = draft.x + draft.width;
    let bottom = draft.y + draft.height;
    if (handle.includes('w')) left = Math.max(0, Math.min(pointerPercent.x, right - minSize));
    if (handle.includes('e')) right = Math.min(100, Math.max(pointerPercent.x, left + minSize));
    if (handle.includes('n')) top = Math.max(0, Math.min(pointerPercent.y, bottom - minSize));
    if (handle.includes('s')) bottom = Math.min(100, Math.max(pointerPercent.y, top + minSize));
    return clampSubjectMaskDraft({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }, [clampSubjectMaskDraft]);

  const handleSubjectMaskPointerDown = useCallback((event) => {
    if (!isSubjectMaskSelecting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const wrap = resultNodeRef.current?.querySelector?.('.result-video-wrap');
    const rect = wrap?.getBoundingClientRect();
    if (!rect) return;
    const startPoint = {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
    const pointerPercent = {
      x: (startPoint.x / rect.width) * 100,
      y: (startPoint.y / rect.height) * 100,
    };
    const isMovingExistingMask = subjectMaskDraft
      && pointerPercent.x >= subjectMaskDraft.x
      && pointerPercent.x <= subjectMaskDraft.x + subjectMaskDraft.width
      && pointerPercent.y >= subjectMaskDraft.y
      && pointerPercent.y <= subjectMaskDraft.y + subjectMaskDraft.height;
    const resizeHandle = getSubjectMaskResizeHandle(pointerPercent, subjectMaskDraft, rect);
    subjectMaskResizeHandleRef.current = resizeHandle;
    subjectMaskDragModeRef.current = resizeHandle ? 'resize' : isMovingExistingMask ? 'move' : 'draw';
    setSubjectMaskCursor(getSubjectMaskCursor(resizeHandle, isMovingExistingMask));
    subjectMaskDragStartRef.current = resizeHandle || isMovingExistingMask
      ? {
        ...startPoint,
        draft: subjectMaskDraft,
        rect,
        grabOffset: subjectMaskDraft ? {
          x: pointerPercent.x - subjectMaskDraft.x,
          y: pointerPercent.y - subjectMaskDraft.y,
        } : { x: 0, y: 0 },
      }
      : startPoint;
    setIsSubjectMaskDragging(true);
    if (!resizeHandle && !isMovingExistingMask) {
      setSubjectMaskDraft({
        x: Math.round((startPoint.x / rect.width) * 1000) / 10,
        y: Math.round((startPoint.y / rect.height) * 1000) / 10,
        width: 12,
        height: 12,
      });
    }
  }, [getSubjectMaskCursor, getSubjectMaskResizeHandle, isSubjectMaskSelecting, subjectMaskDraft]);

  const handleSubjectMaskPointerMove = useCallback((event) => {
    if (!isSubjectMaskSelecting) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isSubjectMaskDragging || !subjectMaskDragStartRef.current) {
      const wrap = resultNodeRef.current?.querySelector?.('.result-video-wrap');
      const rect = wrap?.getBoundingClientRect();
      if (!rect) return;
      const pointerPercent = {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
      };
      const handle = getSubjectMaskResizeHandle(pointerPercent, subjectMaskDraft, rect);
      const insideMask = Boolean(subjectMaskDraft)
        && pointerPercent.x >= subjectMaskDraft.x
        && pointerPercent.x <= subjectMaskDraft.x + subjectMaskDraft.width
        && pointerPercent.y >= subjectMaskDraft.y
        && pointerPercent.y <= subjectMaskDraft.y + subjectMaskDraft.height;
      setSubjectMaskCursor(getSubjectMaskCursor(handle, insideMask));
      return;
    }
    if (subjectMaskDragModeRef.current === 'move') {
      const start = subjectMaskDragStartRef.current;
      const rect = start?.rect;
      if (!rect || !start?.draft) return;
      const pointerPercent = {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
      };
      setSubjectMaskDraft(clampSubjectMaskDraftLive({
        ...start.draft,
        x: pointerPercent.x - (start.grabOffset?.x || 0),
        y: pointerPercent.y - (start.grabOffset?.y || 0),
      }));
      return;
    }
    if (subjectMaskDragModeRef.current === 'resize') {
      const start = subjectMaskDragStartRef.current;
      const rect = start?.rect;
      if (!rect || !start?.draft || !subjectMaskResizeHandleRef.current) return;
      setSubjectMaskDraft(resizeSubjectMaskDraft(start.draft, {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
      }, subjectMaskResizeHandleRef.current));
      return;
    }
    const nextRect = getSubjectMaskRectFromPointer(event, subjectMaskDragStartRef.current);
    if (nextRect) setSubjectMaskDraft(nextRect);
  }, [clampSubjectMaskDraftLive, getSubjectMaskCursor, getSubjectMaskRectFromPointer, getSubjectMaskResizeHandle, isSubjectMaskDragging, isSubjectMaskSelecting, resizeSubjectMaskDraft, subjectMaskDraft]);

  const handleSubjectMaskPointerUp = useCallback((event) => {
    if (!isSubjectMaskSelecting || !isSubjectMaskDragging || !subjectMaskDragStartRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (subjectMaskDragModeRef.current === 'move') {
      const start = subjectMaskDragStartRef.current;
      const rect = start?.rect;
      if (rect && start?.draft) {
        const pointerPercent = {
          x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
          y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
        };
        setSubjectMaskDraft(clampSubjectMaskDraft({
          ...start.draft,
          x: pointerPercent.x - (start.grabOffset?.x || 0),
          y: pointerPercent.y - (start.grabOffset?.y || 0),
        }));
      }
    } else if (subjectMaskDragModeRef.current === 'resize') {
      const start = subjectMaskDragStartRef.current;
      const rect = start?.rect;
      if (rect && start?.draft && subjectMaskResizeHandleRef.current) {
        setSubjectMaskDraft(resizeSubjectMaskDraft(start.draft, {
          x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
          y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
        }, subjectMaskResizeHandleRef.current));
      }
    } else {
      const nextRect = getSubjectMaskRectFromPointer(event, subjectMaskDragStartRef.current);
      if (nextRect) setSubjectMaskDraft(nextRect);
    }
    setIsSubjectMaskDragging(false);
    subjectMaskDragStartRef.current = null;
    subjectMaskDragModeRef.current = 'draw';
    subjectMaskResizeHandleRef.current = '';
    setSubjectMaskCursor('crosshair');
  }, [clampSubjectMaskDraft, getSubjectMaskRectFromPointer, isSubjectMaskDragging, isSubjectMaskSelecting, resizeSubjectMaskDraft]);

  const captureSubjectMaskPreview = useCallback((maskRect) => {
    const video = resultVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || !maskRect) return '';
    try {
      const sx = Math.max(0, Math.round((maskRect.x / 100) * video.videoWidth));
      const sy = Math.max(0, Math.round((maskRect.y / 100) * video.videoHeight));
      const sw = Math.max(1, Math.round((maskRect.width / 100) * video.videoWidth));
      const sh = Math.max(1, Math.round((maskRect.height / 100) * video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(320, sw);
      canvas.height = Math.max(1, Math.round((canvas.width / sw) * sh));
      canvas.getContext('2d')?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }, []);

  const confirmSubjectMaskSelection = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const maskRect = subjectMaskDraft || DEFAULT_SUBJECT_REPLACEMENT_BOX;
    setIsSubjectMaskSelecting(false);
    setIsSubjectMaskDragging(false);
    setSubjectMaskDraft(null);
    setIsSubjectRecognizing(true);
    if (subjectMaskPurpose === 'removal') {
      showSubjectRemovalStatus('正在识别需要移除的主体...', 900);
    } else {
      showSubjectReplacementStatus('正在识别框选主体...', 900);
    }
    window.setTimeout(() => {
      const previewUrl = captureSubjectMaskPreview(maskRect);
      const nextSubject = {
        previewUrl,
        rect: maskRect,
        label: '已选择主体',
        createdAt: Date.now(),
      };
      if (subjectMaskPurpose === 'removal') {
        setRemovalSubject(nextSubject);
        showSubjectRemovalStatus('已识别需要移除的主体');
      } else {
        setSourceSubject(nextSubject);
        showSubjectReplacementStatus('已识别主体');
      }
      setIsSubjectRecognizing(false);
    }, 520);
  }, [captureSubjectMaskPreview, showSubjectRemovalStatus, showSubjectReplacementStatus, subjectMaskDraft, subjectMaskPurpose]);

  const clearSourceSubject = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setSourceSubject(null);
  }, []);

  const clearRemovalSubject = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setRemovalSubject(null);
  }, []);

  const clearTargetSubject = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (targetSubjectObjectUrlRef.current) {
      URL.revokeObjectURL(targetSubjectObjectUrlRef.current);
      targetSubjectObjectUrlRef.current = '';
    }
    setTargetSubject(null);
  }, []);

  const chooseCanvasReplacementImage = useCallback((choice) => {
    if (!choice?.url) return;
    if (targetSubjectObjectUrlRef.current) {
      URL.revokeObjectURL(targetSubjectObjectUrlRef.current);
      targetSubjectObjectUrlRef.current = '';
    }
    setTargetSubject({
      previewUrl: choice.url,
      source: 'canvas',
      label: choice.label || '画布图片',
      createdAt: Date.now(),
    });
    setReplacementSourceMenuOpen(false);
  }, []);

  const openReplacementUploadPicker = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    subjectReplacementUploadInputRef.current?.click();
    setReplacementSourceMenuOpen(false);
  }, []);

  const handleReplacementUploadChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      showSubjectReplacementStatus(getUnsupportedImageMessage(file));
      return;
    }
    if (targetSubjectObjectUrlRef.current) {
      URL.revokeObjectURL(targetSubjectObjectUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    targetSubjectObjectUrlRef.current = previewUrl;
    setTargetSubject({
      previewUrl,
      source: 'upload',
      label: file.name || '本地图片',
      createdAt: Date.now(),
    });
  }, [showSubjectReplacementStatus]);

  const runSubjectReplacementPrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!sourceSubject || !targetSubject) {
      showSubjectReplacementStatus('请先选择被替换主体和替换图片');
      return;
    }
    // Prototype only: this simulates the replacement flow by creating a
    // downstream video node. It never calls backend replacement APIs or spends credits.
    const result = data?.onCreateVideoSubjectReplacementPrototype?.(id, {
      sourceSubject,
      sourceSubjectLabel: sourceSubject.label,
      targetImageUrl: targetSubject.previewUrl,
      targetSubjectLabel: targetSubject.label,
      credits: subjectReplacementCredits,
      videoUrl,
    });
    if (result?.ok) {
      setSubjectReplacementOpen(false);
      setIsSubjectMaskSelecting(false);
      setReplacementSourceMenuOpen(false);
      return;
    }
    showSubjectReplacementStatus('仅原型展示，暂未接入真实替换');
  }, [data, id, showSubjectReplacementStatus, sourceSubject, subjectReplacementCredits, targetSubject, videoUrl]);

  const runSubjectRemovalPrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!removalSubject) {
      showSubjectRemovalStatus('请先选择需要移除的主体');
      return;
    }
    // Prototype only: this simulates subject removal by creating a connected
    // downstream video node. It never calls backend removal APIs or spends credits.
    const result = data?.onCreateVideoSubjectRemovalPrototype?.(id, {
      removalSubject,
      removalSubjectLabel: removalSubject.label,
      credits: subjectRemovalCredits,
      videoUrl,
    });
    if (result?.ok) {
      setSubjectRemovalOpen(false);
      setIsSubjectMaskSelecting(false);
      return;
    }
    showSubjectRemovalStatus('仅原型展示，暂未接入真实移除');
  }, [data, id, removalSubject, showSubjectRemovalStatus, subjectRemovalCredits, videoUrl]);

  const showVideoExtensionStatus = useCallback((message, duration = 1800) => {
    setVideoExtensionStatus(message);
    window.clearTimeout(videoExtensionStatusTimerRef.current);
    videoExtensionStatusTimerRef.current = window.setTimeout(() => {
      setVideoExtensionStatus('');
    }, duration);
  }, []);

  const showVideoExtensionReferencePreview = useCallback((event, reference) => {
    if (!reference?.url || reference.kind !== 'image') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const availableAbove = rect.top - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const availableBelow = window.innerHeight - rect.bottom - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const placeAbove = availableAbove >= REFERENCE_IMAGE_PREVIEW_MAX_SIZE || availableAbove >= availableBelow;
    const previewHalfSize = REFERENCE_IMAGE_PREVIEW_MAX_SIZE / 2;
    const left = Math.max(
      REFERENCE_IMAGE_PREVIEW_MARGIN + previewHalfSize,
      Math.min(window.innerWidth - REFERENCE_IMAGE_PREVIEW_MARGIN - previewHalfSize, rect.left + rect.width / 2),
    );
    setVideoExtensionReferencePreview({
      src: reference.url,
      left,
      top: placeAbove ? rect.top - REFERENCE_IMAGE_PREVIEW_GAP : rect.bottom + REFERENCE_IMAGE_PREVIEW_GAP,
      placement: placeAbove ? 'above' : 'below',
    });
  }, []);

  const hideVideoExtensionReferencePreview = useCallback(() => {
    setVideoExtensionReferencePreview(null);
  }, []);

  const addVideoExtensionReference = useCallback((reference) => {
    if (!reference?.url) return;
    setVideoExtensionReferences(current => {
      if (current.some(item => item.url === reference.url)) return current;
      return [...current, {
        id: reference.id || `ref-${Date.now()}`,
        kind: reference.kind || 'image',
        url: reference.url,
        label: reference.label || (reference.kind === 'video' ? '视频素材' : '图片素材'),
        local: Boolean(reference.local),
      }].slice(0, 6);
    });
  }, []);

  const removeVideoExtensionReference = useCallback((event, referenceId) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setVideoExtensionReferences(current => {
      const target = current.find(item => item.id === referenceId);
      if (target?.local && videoExtensionObjectUrlsRef.current.has(target.url)) {
        URL.revokeObjectURL(target.url);
        videoExtensionObjectUrlsRef.current.delete(target.url);
      }
      return current.filter(item => item.id !== referenceId);
    });
    hideVideoExtensionReferencePreview();
  }, [hideVideoExtensionReferencePreview]);

  const handleVideoExtensionUploadChange = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const availableSlots = Math.max(0, 6 - videoExtensionReferences.length);
    if (availableSlots <= 0) {
      showVideoExtensionStatus('最多添加 6 个参考素材');
      return;
    }
    if (files.length > availableSlots) {
      showVideoExtensionStatus(`最多添加 6 个参考素材，已取前 ${availableSlots} 个`);
    }
    files.slice(0, availableSlots).forEach(file => {
      const isImage = isSupportedImageFile(file);
      const isVideo = isSupportedVideoFile(file);
      if (!isImage && !isVideo) {
        showVideoExtensionStatus(isImage ? getUnsupportedImageMessage(file) : getUnsupportedVideoMessage(file));
        return;
      }
      const url = URL.createObjectURL(file);
      videoExtensionObjectUrlsRef.current.add(url);
      addVideoExtensionReference({
        id: `local-${Date.now()}-${file.name}`,
        kind: isVideo ? 'video' : 'image',
        url,
        label: file.name || (isVideo ? '本地视频' : '本地图片'),
        local: true,
      });
    });
  }, [addVideoExtensionReference, showVideoExtensionStatus, videoExtensionReferences.length]);

  const handleVideoExtensionPromptChange = useCallback((event) => {
    const nextValue = event.target.value;
    setVideoExtensionPrompt(nextValue);
    setVideoExtensionMentionOpen(nextValue.endsWith('@'));
  }, []);

  const insertVideoExtensionMention = useCallback((choice) => {
    if (!choice) return;
    addVideoExtensionReference(choice);
    setVideoExtensionPrompt(current => `${current.replace(/@$/, '')}@${choice.label} `);
    setVideoExtensionMentionOpen(false);
  }, [addVideoExtensionReference]);

  const runVideoExtensionPrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    // Prototype only: this creates a connected downstream video node for the
    // extension flow. It never calls backend generation APIs or spends credits.
    const result = data?.onCreateVideoExtensionPrototype?.(id, {
      direction: videoExtensionDirection,
      duration: videoExtensionDuration,
      method: videoExtensionMethod,
      prompt: videoExtensionPrompt.trim(),
      references: videoExtensionReferences,
      credits: videoExtensionCredits,
      videoUrl,
    });
    if (result?.ok) {
      setVideoExtensionOpen(false);
      setVideoExtensionSettingsOpen(false);
      setVideoExtensionMentionOpen(false);
      return;
    }
    showVideoExtensionStatus('仅原型展示，暂未接入真实延长');
  }, [data, id, showVideoExtensionStatus, videoExtensionCredits, videoExtensionDirection, videoExtensionDuration, videoExtensionMethod, videoExtensionPrompt, videoExtensionReferences, videoUrl]);

  const showVideoRetakeStatus = useCallback((message, duration = 1800) => {
    setVideoRetakeStatus(message);
    window.clearTimeout(videoRetakeStatusTimerRef.current);
    videoRetakeStatusTimerRef.current = window.setTimeout(() => {
      setVideoRetakeStatus('');
    }, duration);
  }, []);

  const formatVideoRetakeTime = useCallback((time) => (
    `${Number(time || 0).toFixed(1)}s`
  ), []);

  const formatVideoRetakeSegmentLabel = useCallback((segment, index, total) => (
    `分镜 ${index + 1}/${total} ${formatVideoRetakeTime(segment.start)}-${formatVideoRetakeTime(segment.end)}`
  ), [formatVideoRetakeTime]);

  const syncVideoRetakePlayhead = useCallback((nextTime, segments = videoRetakeSegments) => {
    const totalDuration = Math.max(...segments.map(segment => Number(segment.end) || 0), DEFAULT_VIDEO_RETAKE_SEGMENTS[0].end);
    const time = Math.round(Math.max(0, Math.min(totalDuration, Number(nextTime) || 0)) * 10) / 10;
    const segmentAtTime = segments.find(segment => time >= segment.start && time <= segment.end);
    if (segmentAtTime) setSelectedVideoRetakeSegmentId(segmentAtTime.id);
    setVideoRetakePlayheadTime(time);
    return time;
  }, [videoRetakeSegments]);

  const getVideoRetakeTimeFromPointer = useCallback((event) => {
    const rect = videoRetakeFilmstripRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return videoRetakePlayheadTime;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * videoRetakeTotalDuration * 10) / 10;
  }, [videoRetakePlayheadTime, videoRetakeTotalDuration]);

  const moveVideoRetakePlayheadFromPointer = useCallback((event) => {
    syncVideoRetakePlayhead(getVideoRetakeTimeFromPointer(event));
  }, [getVideoRetakeTimeFromPointer, syncVideoRetakePlayhead]);

  const handleVideoRetakePlayheadPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    videoRetakePlayheadDraggingRef.current = true;
    setIsVideoRetakePlayheadDragging(true);
    moveVideoRetakePlayheadFromPointer(event);
  }, [moveVideoRetakePlayheadFromPointer]);

  const handleVideoRetakePlayheadPointerMove = useCallback((event) => {
    if (!videoRetakePlayheadDraggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    moveVideoRetakePlayheadFromPointer(event);
  }, [moveVideoRetakePlayheadFromPointer]);

  const handleVideoRetakePlayheadPointerUp = useCallback((event) => {
    if (!videoRetakePlayheadDraggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    videoRetakePlayheadDraggingRef.current = false;
    setIsVideoRetakePlayheadDragging(false);
    moveVideoRetakePlayheadFromPointer(event);
  }, [moveVideoRetakePlayheadFromPointer]);

  const handleVideoRetakePlayheadKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 1 : 0.2;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    syncVideoRetakePlayhead(videoRetakePlayheadTime + (event.key === 'ArrowRight' ? step : -step));
  }, [syncVideoRetakePlayhead, videoRetakePlayheadTime]);

  const updateVideoRetakeCameraSetting = useCallback((patch, key = activeVideoRetakeCameraKey) => {
    setVideoRetakeCameraSettings(current => ({
      ...current,
      [key]: {
        ...(current[key] || DEFAULT_VIDEO_RETAKE_CAMERA_SETTINGS.fixed),
        ...patch,
      },
    }));
  }, [activeVideoRetakeCameraKey]);

  const chooseVideoRetakeAngle = useCallback((angle) => {
    if (angle === '自定义视角') {
      updateVideoRetakeCameraSetting({
        angle: '自定义视角',
        custom: true,
        yaw: activeVideoRetakeCamera.yaw ?? VIDEO_RETAKE_CAMERA_POSITIONS.自定义视角.yaw,
        pitch: activeVideoRetakeCamera.pitch ?? VIDEO_RETAKE_CAMERA_POSITIONS.自定义视角.pitch,
      });
      return;
    }
    const preset = VIDEO_RETAKE_CAMERA_POSITIONS[angle] || VIDEO_RETAKE_CAMERA_POSITIONS.正面;
    updateVideoRetakeCameraSetting({
      angle,
      custom: false,
      ...preset,
    });
  }, [activeVideoRetakeCamera.pitch, activeVideoRetakeCamera.yaw, updateVideoRetakeCameraSetting]);

  const chooseVideoRetakeShotSize = useCallback((shotSize) => {
    updateVideoRetakeCameraSetting({
      shotSize,
      distance: VIDEO_RETAKE_SHOT_DISTANCE[shotSize] || 4,
    });
  }, [updateVideoRetakeCameraSetting]);

  const handleVideoRetakeCameraChange = useCallback(({ yaw, pitch }) => {
    updateVideoRetakeCameraSetting({
      angle: '自定义视角',
      custom: true,
      yaw,
      pitch,
    });
  }, [updateVideoRetakeCameraSetting]);

  const resetVideoRetakePrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setVideoRetakeSegments(DEFAULT_VIDEO_RETAKE_SEGMENTS);
    setSelectedVideoRetakeSegmentId('shot-1');
    setVideoRetakePlayheadTime(DEFAULT_VIDEO_RETAKE_PLAYHEAD_TIME);
    setVideoRetakeMode('固定');
    setVideoRetakeSwitchViewTab('start');
    setVideoRetakeCameraSettings(DEFAULT_VIDEO_RETAKE_CAMERA_SETTINGS);
    setVideoRetakePrompt('');
    showVideoRetakeStatus('已重置重拍设置');
  }, [showVideoRetakeStatus]);

  const splitVideoRetakeSegment = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setVideoRetakeSegments(current => {
      const targetIndex = current.findIndex(segment => segment.id === selectedVideoRetakeSegmentId);
      if (targetIndex < 0) return current;
      const target = current[targetIndex];
      if ((target.end - target.start) <= 1.2) {
        showVideoRetakeStatus('当前分镜太短，暂不再拆分');
        return current;
      }
      const splitAt = Math.round(videoRetakePlayheadTime * 10) / 10;
      if (
        splitAt <= target.start + VIDEO_RETAKE_MIN_SEGMENT_DURATION
        || splitAt >= target.end - VIDEO_RETAKE_MIN_SEGMENT_DURATION
      ) {
        showVideoRetakeStatus('请把指针移动到分镜中间一点再裁剪');
        return current;
      }
      // 原型切分：这里只改变本地时间轴展示，不会真的裁剪视频文件。
      const first = { ...target, end: splitAt };
      const second = {
        id: `shot-${Date.now()}`,
        start: splitAt,
        end: target.end,
      };
      const nextSegments = [
        ...current.slice(0, targetIndex),
        first,
        second,
        ...current.slice(targetIndex + 1),
      ];
      setSelectedVideoRetakeSegmentId(first.id);
      setVideoRetakePlayheadTime(splitAt);
      showVideoRetakeStatus('已拆分为两个分镜片段');
      return nextSegments;
    });
  }, [selectedVideoRetakeSegmentId, showVideoRetakeStatus, videoRetakePlayheadTime]);

  const runVideoRetakePrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!isVideoResult || !videoUrl) return;

    // 仅原型：创建一个连线的下游视频节点，让重拍流程看起来完整。
    // 这里不会真的裁剪、重拍生成，也不会消耗积分。
    const result = data?.onCreateVideoRetakePrototype?.(id, {
      mode: videoRetakeMode,
      angle: videoRetakeAngle,
      shotSize: videoRetakeShotSize,
      cameraSettings: videoRetakeCameraSettings,
      activeView: videoRetakeMode === '切换' ? videoRetakeSwitchViewTab : 'fixed',
      prompt: videoRetakePrompt.trim(),
      segment: selectedVideoRetakeSegment,
      segments: videoRetakeSegments,
      credits: videoRetakeCredits,
      videoUrl,
    });
    if (result?.ok) {
      setVideoRetakeOpen(false);
      return;
    }
    showVideoRetakeStatus('仅原型展示，暂未接入真实重拍');
  }, [data, id, isVideoResult, selectedVideoRetakeSegment, showVideoRetakeStatus, videoRetakeAngle, videoRetakeCameraSettings, videoRetakeCredits, videoRetakeMode, videoRetakePrompt, videoRetakeSegments, videoRetakeShotSize, videoRetakeSwitchViewTab, videoUrl]);

  const toggleCard = useCallback((index) => {
    setExpandedCardIndex(prev => prev === index ? null : index);
  }, []);

  const openStoryboardFrameGenerator = useCallback((event, cardIndex, card) => {
    if (!isStoryboardScriptResult) return;
    event?.stopPropagation();
    if (data?.onStoryboardCardClickPlaceholder) {
      data.onStoryboardCardClickPlaceholder(id, cardIndex, card);
    }
  }, [data, id, isStoryboardScriptResult]);

  const handleStoryboardFramePointerDown = useCallback((event) => {
    event.stopPropagation();
    storyboardFramePointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const handleStoryboardFramePointerUp = useCallback((event, cardIndex, card) => {
    event.stopPropagation();
    const start = storyboardFramePointerStartRef.current;
    storyboardFramePointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) <= STORYBOARD_FRAME_POINTER_INTENT_THRESHOLD) {
      openStoryboardFrameGenerator(event, cardIndex, card);
    }
  }, [openStoryboardFrameGenerator]);

  const handleStoryboardFramePointerCancel = useCallback((event) => {
    event.stopPropagation();
    storyboardFramePointerStartRef.current = null;
  }, []);

  const renderUploadFeedback = () => {
    if (isUploadingImage) {
      return (
        <div
          className="result-image-upload-status nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span>正在上传 {uploadProgress}%</span>
          <span className="result-image-upload-progress-track">
            <span style={{ width: `${uploadProgress}%` }} />
          </span>
        </div>
      );
    }
    if (!uploadError) return null;
    return (
      <div
        className="result-image-upload-error nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span>{uploadError}</span>
        <button type="button" onClick={openUploadPicker}>重试</button>
      </div>
    );
  };

  // 图片结果区域：单图 / 多图堆叠 / 多图展开
  const renderImageResult = () => {
    const aspectStyle = getAspectStyle();

    // 多图：堆叠 + 展开
    if (isMultiImage) {
      if (isExpanded) {
        return (
          <div
            className={`result-image-expanded nodrag ${expandedGridClass} ${isExpandedClosing ? 'is-closing' : 'is-opening'}`}
            style={{
              '--result-expanded-aspect': expandedAspectRatio,
              '--result-expanded-card-width': `${expandedCardWidth}px`,
              '--result-expanded-max-height': `${expandedLayout.maxHeight}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="result-image-expanded-close nodrag"
              onClick={(e) => {
                e.stopPropagation();
                requestCloseExpandedImages();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="收起"
              aria-label="收起图片"
            >
              ✕
            </button>
            {displayedImageUrls.map((url, index) => {
              const isCover = index === coverIndex;
              const isHover = hoveredImageIndex === index;
              const displayUrl = displayedBrowserImageUrls[index] || toDisplayMediaUrl(url);
              return (
                <div
                  className={`result-image-expanded-card canvas-image-preview-trigger ${isCover ? 'is-cover' : ''}`}
                  key={`expanded_${index}_${url.slice(-12)}`}
                  onContextMenu={(event) => openImageContextMenu(event, url, index)}
                  onMouseEnter={() => openExpandedImageToolbar(index)}
                  onMouseLeave={() => scheduleCloseExpandedImageToolbar(index)}
                  onDoubleClick={(e) => {
                    if (e.target.closest('.image-action-toolbar, .image-action-layer, .result-image-set-cover-btn')) return;
                    openPreview(displayUrl, e, displayedBrowserImageUrls, index);
                  }}
                  onDragStart={(e) => handleImageDragStart(e, url, index)}
                  draggable
                >
                  <img
                    src={displayUrl}
                    alt={`生成图 ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    onLoad={event => handleImageLoad(event, url)}
                    draggable={false}
                  />
                  <ImageActionOverlay
                    imageUrl={url}
                    imageIndex={index}
                    sourceHandle={`img-${index}`}
                    nodeId={id}
                    sourceType="result"
                    onAction={data?.onImageAction}
                    onUpload={openUploadPicker}
                    onDelete={() => data?.onDeleteNode?.(id)}
                    forceVisible={!isMultiSelected && isHover}
                    onToolbarPointerEnter={() => openExpandedImageToolbar(index)}
                    onToolbarPointerLeave={() => scheduleCloseExpandedImageToolbar(index)}
                    portalToolbar
                    tagColors={data?.tagColors}
                    onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
                    apiConfigs={data?.apiConfigs}
                    apiProviders={data?.apiProviders}
                    rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
                    onEditingChange={handleImageActionEditingChange}
                    enableCropEditor
                    suppressToolbar={isMultiSelected}
                    hasPendingTasks={hasPendingTasks}
                  />{/* multi-card */}
                  {isCover && <span className="result-image-cover-badge">封面</span>}
                  {isHover && (
                    <button
                      type="button"
                      className="result-image-set-cover-btn nodrag"
                      onClick={(e) => handleSetCover(index, e)}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      设为封面
                    </button>
                  )}
                </div>
              );
            })}
            {renderUploadFeedback()}
          </div>
        );
      }
      // 收起：deck 堆叠
      return (
        <div
          className="result-image-stack result-image-toolbar-anchor canvas-image-preview-trigger"
          onContextMenu={(event) => openImageContextMenu(event, coverImageUrl, coverIndex)}
          onDoubleClick={(e) => {
            // 点 toggle 按钮、工具栏就别触发大图
            if (e.target.closest('.result-image-stack-toggle, .image-action-toolbar, .image-action-layer')) return;
            if (didMoveImageStackPointer(e)) return;
            e.stopPropagation();
            openPreview(displayedCoverUrl, e, displayedBrowserImageUrls, coverIndex);
          }}
          onPointerDown={beginImageStackDrag}
          title="双击查看大图，点击右上角「N张」展开"
        >
          <img
            className="result-image-stack-card is-cover"
            src={displayedCoverUrl}
            alt="生成图封面"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            draggable={false}
          />
          <button
            type="button"
            className="result-image-stack-toggle nodrag"
            onClick={(e) => {
              e.stopPropagation();
              openExpandedImages();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="展开查看全部图片"
          >
            <span>{allImageUrls.length} 张</span>
            <span className="chevron">▾</span>
          </button>
          <ImageActionOverlay
            imageUrl={coverImageUrl}
            imageIndex={coverIndex}
            nodeId={id}
            sourceType="result"
            onAction={data?.onImageAction}
            onUpload={openUploadPicker}
            onDelete={() => data?.onDeleteNode?.(id)}
            forceVisible={!isMultiSelected && selected}
            portalToolbar
            tagColors={data?.tagColors}
            onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
            apiConfigs={data?.apiConfigs}
            apiProviders={data?.apiProviders}
            rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
            onEditingChange={handleImageActionEditingChange}
            enableCropEditor
            suppressToolbar={isMultiSelected}
            hasPendingTasks={hasPendingTasks}
          />{/* multi-collapsed */}
          {renderUploadFeedback()}
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }

    // 单图：维持现有样式
    if (displayedCoverUrl) {
      return (
        <div
          className="result-image-wrap result-image-toolbar-anchor canvas-image-preview-trigger"
          style={aspectStyle}
          onContextMenu={(event) => openImageContextMenu(event, coverImageUrl, coverIndex)}
          onDoubleClick={(event) => {
            if (isImagePreviewExcludedTarget(event.target)) return;
            openPreview(displayedCoverUrl, event, displayedBrowserImageUrls, coverIndex);
          }}
        >
          <img
            src={displayedCoverUrl}
            alt="生成图片结果"
            title="双击预览大图，拖动移动节点"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            draggable={false}
          />
          <ImageActionOverlay
            imageUrl={coverImageUrl}
            imageIndex={coverIndex}
            nodeId={id}
            sourceType="result"
            onAction={data?.onImageAction}
            onUpload={openUploadPicker}
            onDelete={() => data?.onDeleteNode?.(id)}
            forceVisible={!isMultiSelected && selected}
            portalToolbar
            tagColors={data?.tagColors}
            onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
            apiConfigs={data?.apiConfigs}
            apiProviders={data?.apiProviders}
            rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
            onEditingChange={handleImageActionEditingChange}
            enableCropEditor
            suppressToolbar={isMultiSelected}
            hasPendingTasks={hasPendingTasks}
          />{/* single-image */}
          {renderUploadFeedback()}
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }
    if (generating || smartSplitStatus) {
      return (
        <div className="result-skeleton shimmer" style={aspectStyle}>
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="result-skeleton result-image-empty result-image-toolbar-anchor"
        style={aspectStyle}
      >
        <ImageIcon />
        <span>点击节点打开生成器，或从上方工具栏上传图片</span>
        <ImageActionOverlay
          imageUrl=""
          nodeId={id}
          sourceType="result"
          onUpload={openUploadPicker}
          onDelete={() => data?.onDeleteNode?.(id)}
          forceVisible={!isMultiSelected && selected}
          portalToolbar
          apiConfigs={data?.apiConfigs}
          apiProviders={data?.apiProviders}
          rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
          onEditingChange={handleImageActionEditingChange}
          suppressToolbar={isMultiSelected}
          hasPendingTasks={hasPendingTasks}
        />
        {renderUploadFeedback()}
      </div>
    );
  };

  const renderVideoResult = () => {
    if (videoUrl) {
      return (
        <div className="result-video-wrap">
          <video ref={resultVideoRef} src={videoUrl} controls onLoadedMetadata={handleVideoLoadedMetadata} />
          {isSubjectMaskSelecting && (
            <div
              className={`subject-replacement-mask-layer nodrag nopan ${subjectMaskDraft ? 'has-mask-draft' : ''}`}
              style={{ cursor: subjectMaskCursor }}
              onPointerDown={handleSubjectMaskPointerDown}
              onPointerMove={handleSubjectMaskPointerMove}
              onPointerUp={handleSubjectMaskPointerUp}
              onPointerCancel={cancelSubjectMaskSelection}
              onPointerLeave={() => {
                if (!isSubjectMaskDragging) setSubjectMaskCursor('crosshair');
              }}
            >
              <div className="subject-replacement-mask-dim" />
              <div className="subject-replacement-mask-hint">
                {subjectMaskDraft
                  ? '拖动选区或边框调整，确认后继续'
                  : subjectMaskPurpose === 'removal'
                    ? '拖拽框选需要移除的主体'
                    : '拖拽框选需要替换的主体'}
              </div>
              {subjectMaskDraft && (
                <div
                  className="subject-replacement-mask-box"
                  data-dragging={isSubjectMaskDragging ? 'true' : undefined}
                  style={{
                    left: `${subjectMaskDraft.x}%`,
                    top: `${subjectMaskDraft.y}%`,
                    width: `${subjectMaskDraft.width}%`,
                    height: `${subjectMaskDraft.height}%`,
                  }}
                >
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => (
                    <span key={handle} className={`subject-replacement-mask-handle is-${handle}`} />
                  ))}
                </div>
              )}
              {subjectMaskDraft && !isSubjectMaskDragging && (
                <div
                  className={`subject-replacement-mask-actions ${subjectMaskDraft.y + subjectMaskDraft.height > 78 ? 'is-above' : ''}`}
                  style={{
                    left: `${subjectMaskDraft.x + subjectMaskDraft.width / 2}%`,
                    top: subjectMaskDraft.y + subjectMaskDraft.height > 78
                      ? `${subjectMaskDraft.y}%`
                      : `${subjectMaskDraft.y + subjectMaskDraft.height}%`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button type="button" onClick={cancelSubjectMaskSelection} aria-label="取消框选主体">
                    <Icon name="x" size={22} />
                  </button>
                  <button type="button" onClick={confirmSubjectMaskSelection} aria-label="确认框选主体">
                    <Icon name="check" size={22} />
                  </button>
                </div>
              )}
            </div>
          )}
          <VideoFrameCaptureControls
            sourceNodeId={id}
            sourceVideoUrl={videoUrl}
            getVideoElement={() => resultVideoRef.current}
            initialTrim={activeVideoTrim}
            onTrimConfirm={handleVideoQuickTrimConfirm}
            trimRequestId={videoTrimRequestId}
            onTrimOpenChange={setIsVideoTrimming}
            hideActions
            variant="result-video"
          />
          {isUploadingVideo && <span className="result-video-upload-status">正在上传 {videoUploadProgress}%</span>}
          {videoUploadError && <span className="result-video-upload-error">{videoUploadError}</span>}
        </div>
      );
    }

    return (
      <div className={`result-video-placeholder ${generating ? 'shimmer' : ''}`}>
        <span>{isUploadingVideo ? `正在上传 ${videoUploadProgress}%` : '点击节点打开生成器，或从工具栏上传视频'}</span>
        {videoUploadError && <span className="result-video-upload-error">{videoUploadError}</span>}
      </div>
    );
  };

  const renderAudioResult = () => {
    if (audioUrl) {
      return (
        <div className="result-audio-wrap">
          <div className="result-audio-card">
            <Icon name="audioGenFill" size={24} />
            <div>
              <strong>{data?.audioName || '音频'}</strong>
              <span>{data?.audioSource === 'upload' ? '上传音频素材' : '生成音频'}</span>
            </div>
          </div>
          <audio
            className="result-audio-player nodrag"
            src={audioUrl}
            controls
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
          {isUploadingAudio && <span className="result-video-upload-status">正在上传 {audioUploadProgress}%</span>}
          {audioUploadError && <span className="result-video-upload-error">{audioUploadError}</span>}
        </div>
      );
    }

    return (
      <div className={`result-audio-placeholder ${generating ? 'shimmer' : ''}`}>
        <Icon name="audioGenFill" size={30} />
        <span>{isUploadingAudio ? `正在上传 ${audioUploadProgress}%` : '点击节点打开生成器，或从工具栏上传音频'}</span>
        {audioUploadError && <span className="result-video-upload-error">{audioUploadError}</span>}
      </div>
    );
  };

  const renderScriptResult = () => {
    if (generating) {
      return (
        <div className="result-skeleton shimmer">
          <span className="skeleton-icon"><Icon name={isStoryboardScriptResult ? 'storyboardWorkbench' : 'barChartBoxAi'} size={32} /></span>
        </div>
      );
    }

    if (storyboardCards.length > 0) {
      return (
        <div className="storyboard-list">
          {(storyboardResourcePackage || storyboardVoiceoverScript) && (
            <details className="storyboard-resource-package nodrag">
              <summary>
                <span>资源包</span>
                <strong>{storyboardCards.length} 镜 · Seedance 4-15s</strong>
              </summary>
              <div className="storyboard-resource-grid">
                {storyboardResourcePackage?.productIdentity && (
                  <div><span>商品</span><p>{storyboardResourcePackage.productIdentity}</p></div>
                )}
                {storyboardResourcePackage?.sceneLock && (
                  <div><span>场景</span><p>{storyboardResourcePackage.sceneLock}</p></div>
                )}
                {storyboardResourcePackage?.characterLock && (
                  <div><span>人物</span><p>{storyboardResourcePackage.characterLock}</p></div>
                )}
                {storyboardResourcePackage?.visualStyle && (
                  <div><span>风格</span><p>{storyboardResourcePackage.visualStyle}</p></div>
                )}
                {storyboardResourcePackage?.seedanceGlobalPrompt && (
                  <div className="wide"><span>Seedance 全局</span><p>{storyboardResourcePackage.seedanceGlobalPrompt}</p></div>
                )}
                {Array.isArray(storyboardResourcePackage?.negativeConstraints) && storyboardResourcePackage.negativeConstraints.length > 0 && (
                  <div className="wide"><span>负面约束</span><p>{storyboardResourcePackage.negativeConstraints.join('，')}</p></div>
                )}
                {storyboardVoiceoverScript && (
                  <div className="wide"><span>整条口播</span><p>{storyboardVoiceoverScript}</p></div>
                )}
              </div>
            </details>
          )}
          {storyboardCards.map((card, index) => {
            const isExpanded = expandedCardIndex === index;
            const isFrameGenerating = ['running', 'saving'].includes(card.imageGenerationTask?.status);
            return (
              <div
                className={`storyboard-card ${isExpanded ? 'storyboard-card-expanded' : ''}`}
                key={`storyboard_${index}`}
                onClick={() => isStoryboardScriptResult && toggleCard(index)}
                style={{ cursor: isStoryboardScriptResult ? 'pointer' : 'default' }}
              >
                {isStoryboardScriptResult && (
                  <InteractiveHandle
                    side="right"
                    nodeId={id}
                    onDragCreate={data?.onInteractiveDragCreate}
                    extra={{ kind: 'storyboardCard', cardIndex: index }}
                  />
                )}
                <div
                  className={`storyboard-card-visual nodrag ${card.imageUrl ? 'has-image' : 'placeholder-clickable'} ${isFrameGenerating ? 'is-generating' : ''}`}
                  onPointerDown={handleStoryboardFramePointerDown}
                  onPointerUp={(e) => handleStoryboardFramePointerUp(e, index, card)}
                  onPointerCancel={handleStoryboardFramePointerCancel}
                  onClick={(e) => e.stopPropagation()}
                  title={isFrameGenerating ? '本帧图片生成中' : '点击生成本帧图片'}
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.shotNo || `分镜 ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', borderRadius: '4px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="storyboard-card-placeholder">
                      <Icon name="imageGen" size={22} />
                      <span>{isFrameGenerating ? '本帧生成中...' : card.imagePositivePrompt ? '点击生成本帧' : '绘图提示词生成中...'}</span>
                    </div>
                  )}
                  {isFrameGenerating && (
                    <div className="storyboard-frame-loading" aria-label="本帧图片生成中">
                      <span className="storyboard-frame-loading-spinner" />
                      <strong>生成中</strong>
                    </div>
                  )}
                </div>
                <div className="storyboard-card-main">
                  <div className="storyboard-card-body">
                    <div className="storyboard-card-title">
                      <span>{card.shotNo || String(index + 1).padStart(2, '0')}</span>
                      <strong>{card.cameraMovement || `分镜 ${index + 1}`}</strong>
                    </div>
                    {card.duration && (
                      <div className="storyboard-card-time">
                        <span>时间</span>
                        <p>{card.duration}</p>
                      </div>
                    )}
                  {card.visualDescription && (
                    <div className="storyboard-field">
                      <span>画面</span>
                      <p>{card.visualDescription}</p>
                    </div>
                  )}
                    {card.narration && (
                    <div className="storyboard-field">
                      <span>旁白</span>
                      <p>{card.narration}</p>
                    </div>
                  )}
                    {isExpanded && card.seedancePrompt && (
                      <div className="storyboard-field">
                        <span>Seedance</span>
                        <p>{card.seedancePrompt}</p>
                      </div>
                    )}
                    {isExpanded && card.continuityNotes && (
                      <div className="storyboard-field">
                        <span>连续性</span>
                        <p>{card.continuityNotes}</p>
                      </div>
                    )}
                    {isExpanded && Array.isArray(card.qualityChecklist) && card.qualityChecklist.length > 0 && (
                      <div className="storyboard-card-meta">
                        {card.qualityChecklist.map(item => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isStoryboardScriptResult && (
                  <button
                    type="button"
                    className="storyboard-card-edit-btn nodrag"
                    aria-label="编辑分镜卡片"
                    title="编辑"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCardIndex(index);
                      setEditForm({
                        duration: card.duration || '',
                        cameraMovement: card.cameraMovement || '',
                        visualDescription: card.visualDescription || '',
                        narration: card.narration || '',
                      });
                    }}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="storyboard-list" style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--fg-tertiary)',
        fontSize: 'var(--fs-xs)',
      }}>
        等待生成...
      </div>
    );
  };

  return (
    <div
      ref={resultNodeRef}
      className={nodeClassName}
      onMouseEnter={() => { setIsHovering(true); if (!hasTextContent) openTextToolbar(); }}
      onMouseLeave={() => { setIsHovering(false); scheduleCloseTextToolbar(); }}
    >
      {isTextResult && (
        <TextFormatToolbarPortal
          open={shouldShowTextFormatToolbar}
          anchorRef={isTextExpandedEditing ? expandedTextEditorRef : textEditorRef}
          fallbackAnchorRef={resultNodeRef}
          value={result}
          selection={textSelection}
          formatState={currentTextFormatState}
          expanded={isTextExpandedEditing}
          tagColors={data?.tagColors}
          backgroundColor={data?.textBackgroundColor}
          onApply={applyTextEditorFormat}
          onCommand={handleTextFormatCommand}
          onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
          onBackgroundColorChange={(colorId) => data?.onResultTextBackgroundChange?.(id, colorId)}
        />
      )}
      {isResizableResult && (
        <NodeResizer
          isVisible={!isMultiSelected && (selected || (!isComposerOpen && isHovering))}
          minWidth={resizeMinWidth}
          minHeight={resizeMinHeight}
          keepAspectRatio={keepResizeAspectRatio}
          handleClassName="canvas-node-resize-handle"
          lineClassName="canvas-node-resize-line"
          onResize={(_, params) => {
            if (!data?.onNodeResize) return;
            data.onNodeResize(id, { width: params.width, height: params.height });
          }}
          onResizeEnd={(_, params) => {
            if (!data?.onNodeResize) return;
            data.onNodeResize(id, { width: params.width, height: params.height });
          }}
        />
      )}
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      {isImageResult && (
        <input
          ref={uploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          onChange={handleUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isVideoResult && (
        <input
          ref={videoUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_VIDEO_ACCEPT}
          onChange={handleVideoUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isVideoResult && (
        <input
          ref={subjectReplacementUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          onChange={handleReplacementUploadChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isVideoResult && (
        <input
          ref={videoExtensionUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={`${SUPPORTED_IMAGE_ACCEPT},${SUPPORTED_VIDEO_ACCEPT}`}
          multiple
          onChange={handleVideoExtensionUploadChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isAudioResult && (
        <input
          ref={audioUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_AUDIO_ACCEPT}
          onChange={handleAudioUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}

      <div className="node-header">
        <div className="result-node-title-row">
          <EditableNodeTitle
            icon={<Icon name={titleIcon} size={16} />}
            value={displayLabel}
            fallback={isStoryboardScriptResult ? '分镜工作台' : '结果'}
            tagColors={data?.tagColors}
            onChange={(nextLabel) => data?.onResultDataChange?.(id, { label: nextLabel })}
            onEditingChange={setIsTitleEditing}
          />
          {seedanceComplianceStatus === 'checking' && (
            <span className="seedance-compliance-badge is-checking">正在验证，请稍等...</span>
          )}
          {seedanceComplianceStatus === 'passed' && (
            <span className="seedance-compliance-badge is-passed" title="Seedance2.0 已合规" aria-label="Seedance2.0 已合规">
              <Icon name="certificate" size={13} />
            </span>
          )}
          {(isImageResult || isVideoResult) && mediaResolutionLabel && (
            <span className="result-image-dimensions">{mediaResolutionLabel}</span>
          )}
        </div>
        {isStoryboardScriptResult && (
          <button
            type="button"
            className="storyboard-workbench-open-btn nodrag"
            title="打开视频工作台"
            aria-label="打开视频工作台"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data?.onOpenVideoWorkbench?.(id);
            }}
          >
            ↗
          </button>
        )}
        {nodeTaskTimingLabel && (
          <span className="result-task-timing">{nodeTaskTimingLabel}</span>
        )}
      </div>

      <div className="node-body">
        {isTextResult && !generating && !isTextEditing && (
          <button
            type="button"
            className="result-text-expand-btn nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openTextExpanded}
            aria-label="放大文本节点"
            title="放大"
          >
            <Icon name="expandDiagonal" size={13} />
          </button>
        )}
        {isAudioResult ? (
          renderAudioResult()
        ) : isVideoResult ? (
          renderVideoResult()
        ) : (isScriptResult || isStoryboardResult || isStoryboardScriptResult) ? (
          renderScriptResult()
        ) : isImageResult ? (
          renderImageResult()
        ) : generating ? (
          <div className="result-skeleton result-text-skeleton shimmer" style={textBackgroundStyle} aria-label="正在生成文本">
            <span className="text-skeleton-line text-skeleton-line-wide" />
            <span className="text-skeleton-line" />
            <span className="text-skeleton-line text-skeleton-line-short" />
            <span className="text-skeleton-line text-skeleton-line-medium" />
          </div>
        ) : isTextResult && isTextEditing ? (
          <RichTextEditor
            editorRef={textEditorRef}
            className="node-output result-text-output result-text-editor rich-text-editor nodrag nopan nowheel"
            style={textBackgroundStyle}
            value={result}
            placeholder="输入文本内容..."
            onInput={(event) => commitRichTextEditorValue(event.currentTarget)}
            onSelectionChange={syncTextSelection}
            onKeyDown={handleTextEditorKeyDown}
            onBlur={handleTextEditorBlur}
          />
        ) : isTextResult && result ? (
          <div
            className="node-output result-text-output result-text-display result-node-toolbar-anchor nowheel"
            style={textBackgroundStyle}
            onDoubleClick={enterTextEditing}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              enterTextEditing(event);
            }}
            aria-label="文本内容，双击编辑"
          >
            <FormattedTextContent value={result} />
          </div>
        ) : isTextResult ? (
          <div
            className="result-empty result-text-edit-prompt result-node-toolbar-anchor"
            style={textBackgroundStyle}
            role="button"
            tabIndex={0}
            onDoubleClick={enterTextEditing}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              enterTextEditing(event);
            }}
          >
            <strong>双击输入文本</strong>
            <span>也可以打开生成器生成内容</span>
          </div>
        ) : (
          <div className="result-empty">
            等待生成...
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <NodeHoverToolbar
        hidden={isMultiSelected || isTextResult || isImageResult || isVideoTrimming || (isVideoResult && !selected) || (selected && !isStoryboardScriptResult && !isVideoResult) || isTitleEditing || isTextEditing || isTextExpanded}
        portal
        forceVisible={!isMultiSelected && !isTextExpanded && (isVideoResult ? selected : (isTextToolbarOpen || (isEmptyVideoResult && selected)))}
        variant={isVideoResult ? 'video' : ''}
        onToolbarPointerEnter={openTextToolbar}
        onToolbarPointerLeave={scheduleCloseTextToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[
          ...(isTextResult ? [{
            id: 'edit-text',
            label: '编辑提示词',
            title: '编辑提示词',
            icon: 'edit',
            onClick: enterTextEditing,
          }] : []),
          ...(isVideoResult ? (videoUrl ? [
            {
              id: 'edit-video',
              label: '剪辑',
              title: '剪辑视频',
              icon: 'videoEdit',
              onClick: () => setVideoTrimRequestId(current => current + 1),
            },
            {
              id: 'enhance-video',
              label: '增强',
              title: '视频增强',
              icon: 'videoEnhance',
              active: videoEnhancementOpen,
              onClick: (event) => {
                event.stopPropagation();
                setSubjectReplacementOpen(false);
                setSubjectRemovalOpen(false);
                setIsSubjectMaskSelecting(false);
                setVideoExtensionOpen(false);
                setVideoRetakeOpen(false);
                setVideoEnhancementOpen(current => !current);
              },
            },
            {
              id: 'replace-subject',
              label: '替换主体',
              title: '替换主体',
              icon: 'replaceSubject',
              active: subjectReplacementOpen,
              onClick: (event) => {
                event.stopPropagation();
                setVideoEnhancementOpen(false);
                setSubjectRemovalOpen(false);
                setVideoExtensionOpen(false);
                setVideoRetakeOpen(false);
                setSubjectReplacementOpen(current => !current);
              },
            },
            {
              id: 'remove-subject',
              label: '移除主体',
              title: '移除主体',
              icon: 'removeSubject',
              active: subjectRemovalOpen,
              onClick: (event) => {
                event.stopPropagation();
                setVideoEnhancementOpen(false);
                setSubjectReplacementOpen(false);
                setVideoExtensionOpen(false);
                setVideoRetakeOpen(false);
                setSubjectRemovalOpen(current => !current);
              },
            },
            {
              id: 'extend-video',
              label: '视频延长',
              title: '视频延长',
              icon: 'videoExtend',
              active: videoExtensionOpen,
              onClick: (event) => {
                event.stopPropagation();
                setVideoEnhancementOpen(false);
                setSubjectReplacementOpen(false);
                setSubjectRemovalOpen(false);
                setIsSubjectMaskSelecting(false);
                setVideoExtensionSettingsOpen(false);
                setVideoExtensionMentionOpen(false);
                setVideoRetakeOpen(false);
                setVideoExtensionOpen(current => !current);
              },
            },
            {
              id: 'retake-video',
              label: '视频重拍',
              title: '视频重拍',
              icon: 'movieAi',
              active: videoRetakeOpen,
              onClick: (event) => {
                event.stopPropagation();
                setVideoEnhancementOpen(false);
                setSubjectReplacementOpen(false);
                setSubjectRemovalOpen(false);
                setVideoExtensionOpen(false);
                setVideoExtensionSettingsOpen(false);
                setVideoExtensionMentionOpen(false);
                setIsSubjectMaskSelecting(false);
                setVideoRetakeOpen(current => !current);
              },
            },
            {
              id: 'capture-video-frame',
              label: '截取画面帧',
              title: '截取画面帧',
              icon: 'captureFrame',
              menuItems: [
                { id: 'current', label: '截取当前帧', onClick: () => { void captureVideoFrame('current'); } },
                { id: 'first', label: '截取首帧', onClick: () => { void captureVideoFrame('first'); } },
                { id: 'last', label: '截取尾帧', onClick: () => { void captureVideoFrame('last'); } },
              ],
            },
            {
              id: 'video-more-tools',
              label: '更多',
              title: '更多',
              icon: 'more',
              compact: true,
              // 原型入口：当前只展示菜单按钮，不接真实解析或合规校验能力。
              menuItems: [
                { id: 'analyze-video', label: '解析', icon: 'video' },
                { id: 'seedance-compliance', label: 'Seedance 2.0 合规验证', icon: 'certificate' },
              ],
            },
            {
              id: 'download-video',
              label: '下载视频',
              title: '下载视频',
              icon: 'download',
              compact: true,
              separatorBefore: true,
              onClick: () => data?.onDownloadVideo?.(id),
            },
            {
              id: 'favorite-video',
              label: '收藏',
              title: '收藏视频',
              icon: 'folder',
              compact: true,
              onClick: () => data?.onImageAction?.('favorite', {
                imageUrl: videoUrl,
                nodeId: id,
                sourceType: 'video',
                mediaType: 'video',
              }),
            },
            {
              id: 'fullscreen-video',
              label: '全屏播放',
              title: '全屏播放',
              icon: 'fullscreen',
              compact: true,
              onClick: requestVideoFullscreen,
            },
          ] : [{
            id: 'upload-video',
            label: '上传视频',
            title: '上传视频',
            icon: 'upload',
            onClick: openVideoUploadPicker,
          }]) : []),
          ...(isAudioResult ? [{
            id: 'upload-audio',
            label: audioUrl ? '替换音频' : '上传音频',
            title: audioUrl ? '替换音频' : '上传音频',
            icon: 'upload',
            onClick: openAudioUploadPicker,
          }] : []),
          ...(canBatchGenerateStoryboardCovers ? [{
            id: 'batch-storyboard-covers',
            label: '批量生成封面',
            title: storyboardBatchCoverTargets.length > 0
              ? `批量生成 ${storyboardBatchCoverTargets.length} 张分镜封面`
              : '批量生成分镜封面',
            icon: 'imageGen',
            onClick: () => data?.onStoryboardCoverBatchGenerate?.(id),
          }] : []),
        ]}
        onDelete={!isVideoResult ? () => data?.onDeleteNode?.(id) : undefined}
      />
      {isVideoResult && videoEnhancementOpen && videoEnhancementPosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={videoEnhancementPanelRef}
          className="video-enhancement-prototype-panel nodrag nopan"
          style={{
            left: videoEnhancementPosition.left,
            top: videoEnhancementPosition.top,
            width: videoEnhancementPosition.width,
          }}
          role="dialog"
          aria-label="视频增强"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="video-enhancement-prototype-header">
            <strong>视频增强</strong>
            <button
              type="button"
              className="video-enhancement-prototype-close"
              onClick={() => setVideoEnhancementOpen(false)}
              aria-label="关闭视频增强"
              title="关闭"
            >
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="video-enhancement-prototype-body">
            {[
              { key: 'resolution', label: '视频高清分辨率', options: VIDEO_ENHANCEMENT_RESOLUTION_OPTIONS },
              { key: 'fps', label: '视频帧数（可选）', options: VIDEO_ENHANCEMENT_FPS_OPTIONS },
              { key: 'slow', label: '视频放慢倍率（可选）', options: VIDEO_ENHANCEMENT_SLOW_OPTIONS },
            ].map(group => (
              <div className="video-enhancement-prototype-field" key={group.key}>
                <span>{group.label}</span>
                <div className="video-enhancement-prototype-options" role="radiogroup" aria-label={group.label}>
                  {group.options.map(option => (
                    <button
                      key={option}
                      type="button"
                      className={videoEnhancementSettings[group.key] === option ? 'active' : ''}
                      role="radio"
                      aria-checked={videoEnhancementSettings[group.key] === option}
                      onClick={() => updateVideoEnhancementSetting(group.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <footer className="video-enhancement-prototype-footer">
            <span className="video-enhancement-prototype-status" role="status">{videoEnhancementStatus}</span>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${videoEnhancementCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{videoEnhancementCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runVideoEnhancementPrototype}
              aria-label="生成视频增强原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {isVideoResult && subjectReplacementOpen && subjectReplacementPosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={subjectReplacementPanelRef}
          className="subject-replacement-prototype-panel nodrag nopan"
          style={{
            left: subjectReplacementPosition.left,
            top: subjectReplacementPosition.top,
            width: subjectReplacementPosition.width,
          }}
          role="dialog"
          aria-label="主体替换"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="subject-replacement-prototype-header">
            <strong>主体替换</strong>
            <button
              type="button"
              className="video-enhancement-prototype-close"
              onClick={() => {
                setSubjectReplacementOpen(false);
                setIsSubjectMaskSelecting(false);
                setReplacementSourceMenuOpen(false);
              }}
              aria-label="关闭主体替换"
              title="关闭"
            >
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className="subject-replacement-prototype-body">
            <div className="subject-replacement-slot">
              <div className={`subject-replacement-preview ${sourceSubject ? 'has-media' : ''}`}>
                {sourceSubject?.previewUrl ? (
                  <img src={sourceSubject.previewUrl} alt="被替换主体预览" />
                ) : sourceSubject ? (
                  <div className="subject-replacement-fallback-subject">
                    <span />
                    <strong>已识别主体</strong>
                  </div>
                ) : (
                  <div className="subject-replacement-empty">
                    <Icon name="focus" size={26} />
                    <span>从视频中框选</span>
                  </div>
                )}
                {sourceSubject && (
                  <button
                    type="button"
                    className="subject-replacement-remove"
                    onClick={clearSourceSubject}
                    aria-label="清空被替换主体"
                    title="清空"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
                {isSubjectRecognizing && <span className="subject-replacement-recognizing">识别中...</span>}
              </div>
              <button
                type="button"
                className="subject-replacement-slot-action"
                onClick={beginSubjectMaskSelection}
              >
                选择主体
              </button>
              <span>被替换主体</span>
            </div>

            <div className="subject-replacement-arrow" aria-hidden="true">→</div>

            <div className="subject-replacement-slot">
              <div className={`subject-replacement-preview ${targetSubject ? 'has-media' : ''}`}>
                {targetSubject?.previewUrl ? (
                  <img src={targetSubject.previewUrl} alt="替换图片预览" />
                ) : (
                  <div className="subject-replacement-empty">
                    <Icon name="image" size={28} />
                    <span>选择替换图片</span>
                  </div>
                )}
                {targetSubject && (
                  <button
                    type="button"
                    className="subject-replacement-remove"
                    onClick={clearTargetSubject}
                    aria-label="清空替换图片"
                    title="清空"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
              <div className="subject-replacement-source">
                <button
                  type="button"
                  className="subject-replacement-slot-action"
                  onClick={() => setReplacementSourceMenuOpen(current => !current)}
                >
                  选择图片
                </button>
                {replacementSourceMenuOpen && (
                  <div className="subject-replacement-source-menu">
                    <button type="button" onClick={openReplacementUploadPicker}>
                      <Icon name="upload" size={14} />
                      本地上传
                    </button>
                    <div className="subject-replacement-source-menu-divider" />
                    {canvasImageChoices.length > 0 ? canvasImageChoices.map(choice => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => chooseCanvasReplacementImage(choice)}
                      >
                        <img src={choice.url} alt="" />
                        <span>{choice.label}</span>
                      </button>
                    )) : (
                      <span className="subject-replacement-source-empty">暂无可选画布图片</span>
                    )}
                  </div>
                )}
              </div>
              <span>替换为</span>
            </div>
          </div>

          <footer className="video-enhancement-prototype-footer subject-replacement-prototype-footer">
            <span className="video-enhancement-prototype-status" role="status">{subjectReplacementStatus}</span>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${subjectReplacementCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{subjectReplacementCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runSubjectReplacementPrototype}
              aria-label="生成主体替换原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {isVideoResult && subjectRemovalOpen && subjectRemovalPosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={subjectRemovalPanelRef}
          className="subject-replacement-prototype-panel subject-removal-prototype-panel nodrag nopan"
          style={{
            left: subjectRemovalPosition.left,
            top: subjectRemovalPosition.top,
            width: subjectRemovalPosition.width,
          }}
          role="dialog"
          aria-label="移除主体"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="subject-replacement-prototype-header">
            <strong>移除主体</strong>
            <button
              type="button"
              className="video-enhancement-prototype-close"
              onClick={() => {
                setSubjectRemovalOpen(false);
                setIsSubjectMaskSelecting(false);
              }}
              aria-label="关闭移除主体"
              title="关闭"
            >
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className="subject-removal-prototype-body">
            <div className="subject-replacement-slot subject-removal-slot">
              <div className={`subject-replacement-preview subject-removal-preview ${removalSubject ? 'has-media' : ''}`}>
                {removalSubject?.previewUrl ? (
                  <img src={removalSubject.previewUrl} alt="需要移除的主体预览" />
                ) : removalSubject ? (
                  <div className="subject-replacement-fallback-subject">
                    <span />
                    <strong>已识别主体</strong>
                  </div>
                ) : (
                  <div className="subject-replacement-empty">
                    <Icon name="crop" size={28} />
                    <span>框选需要移除的主体</span>
                  </div>
                )}
                {removalSubject && (
                  <button
                    type="button"
                    className="subject-replacement-remove"
                    onClick={clearRemovalSubject}
                    aria-label="清空需要移除的主体"
                    title="清空"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
                {isSubjectRecognizing && subjectMaskPurpose === 'removal' && (
                  <span className="subject-replacement-recognizing">识别中...</span>
                )}
              </div>
              <button
                type="button"
                className="subject-replacement-slot-action"
                onClick={beginSubjectRemovalMaskSelection}
              >
                选择主体
              </button>
              <span>需要移除的主体</span>
            </div>
          </div>

          <footer className="video-enhancement-prototype-footer subject-replacement-prototype-footer">
            <span className="video-enhancement-prototype-status" role="status">{subjectRemovalStatus}</span>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${subjectRemovalCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{subjectRemovalCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runSubjectRemovalPrototype}
              aria-label="生成移除主体原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {isVideoResult && videoExtensionOpen && videoExtensionPosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={videoExtensionPanelRef}
          className="video-extension-prototype-panel nodrag nopan"
          style={{
            left: videoExtensionPosition.left,
            top: videoExtensionPosition.top,
            width: videoExtensionPosition.width,
          }}
          role="dialog"
          aria-label="视频延长"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="video-extension-prototype-header">
            <strong>视频延长</strong>
            <button
              type="button"
              className="video-enhancement-prototype-close"
              onClick={() => {
                setVideoExtensionOpen(false);
                setVideoExtensionSettingsOpen(false);
                setVideoExtensionMentionOpen(false);
              }}
              aria-label="关闭视频延长"
              title="关闭"
            >
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className="video-extension-prototype-body">
            <section className="video-extension-reference-section" aria-label="参考素材">
              <div className="reference-card-row video-extension-reference-row">
                {videoExtensionReferences.map(reference => (
                  <div
                    key={reference.id}
                    className={`reference-card reference-image-card video-extension-reference-card ${reference.kind === 'video' ? 'is-video' : ''}`}
                    tabIndex={0}
                    onMouseEnter={(event) => showVideoExtensionReferencePreview(event, reference)}
                    onMouseLeave={hideVideoExtensionReferencePreview}
                    onFocus={(event) => showVideoExtensionReferencePreview(event, reference)}
                    onBlur={hideVideoExtensionReferencePreview}
                  >
                    {reference.kind === 'video' ? (
                      <>
                        <video src={reference.url} muted playsInline preload="metadata" />
                        <span className="video-extension-reference-type">视频</span>
                      </>
                    ) : (
                      <img src={reference.url} alt={reference.label || '参考图片'} />
                    )}
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={(event) => removeVideoExtensionReference(event, reference.id)}
                      aria-label="删除参考素材"
                      title="删除"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="reference-add-card video-extension-add-card"
                  onClick={() => videoExtensionUploadInputRef.current?.click()}
                  disabled={videoExtensionReferences.length >= 6}
                  aria-label="上传参考素材"
                  title="上传参考素材"
                >
                  <Icon name="upload" size={18} />
                  <span className="reference-add-count">上传</span>
                </button>
              </div>
            </section>

            <section className="video-extension-prompt-section">
              <div className="video-extension-prompt-wrap">
                <textarea
                  className="video-extension-prompt-input"
                  value={videoExtensionPrompt}
                  onChange={handleVideoExtensionPromptChange}
                  placeholder="描述希望延长出来的画面、动作或运镜..."
                  rows={3}
                />
                {videoExtensionMentionOpen && (
                  <div className="video-extension-mention-menu">
                    {canvasMediaChoices.length > 0 ? canvasMediaChoices.map(choice => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => insertVideoExtensionMention(choice)}
                      >
                        {choice.kind === 'video' ? (
                          <video src={choice.url} muted playsInline preload="metadata" />
                        ) : (
                          <img src={choice.url} alt="" />
                        )}
                        <span>{choice.label}</span>
                      </button>
                    )) : (
                      <span className="video-extension-empty-choice">暂无可选画布素材</span>
                    )}
                  </div>
                )}
              </div>
            </section>

          </div>

          <footer className="video-enhancement-prototype-footer video-extension-prototype-footer">
            <div className="video-extension-footer-left">
              <section className="video-extension-settings-section">
                <button
                  type="button"
                  className="video-extension-settings-trigger"
                  onClick={() => setVideoExtensionSettingsOpen(current => !current)}
                  aria-expanded={videoExtensionSettingsOpen}
                >
                  <span>{videoExtensionDirection} · {videoExtensionDuration}s · {videoExtensionMethod}</span>
                  <Icon name="chevronDown" size={16} />
                </button>
                {videoExtensionSettingsOpen && (
                  <div className="video-extension-settings-popover">
                    <div className="video-extension-setting-group">
                      <span>延长模式</span>
                      <div className="video-extension-option-row" role="radiogroup" aria-label="延长模式">
                        {VIDEO_EXTENSION_DIRECTIONS.map(direction => (
                          <button
                            key={direction}
                            type="button"
                            className={videoExtensionDirection === direction ? 'active' : ''}
                            role="radio"
                            aria-checked={videoExtensionDirection === direction}
                            onClick={() => setVideoExtensionDirection(direction)}
                          >
                            {direction}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="video-extension-setting-group">
                      <span>延长时长</span>
                      <div className="video-extension-duration-grid" role="radiogroup" aria-label="延长时长">
                        {VIDEO_EXTENSION_DURATIONS.map(duration => (
                          <button
                            key={duration}
                            type="button"
                            className={videoExtensionDuration === duration ? 'active' : ''}
                            role="radio"
                            aria-checked={videoExtensionDuration === duration}
                            onClick={() => setVideoExtensionDuration(duration)}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="video-extension-setting-group">
                      <span>延长方式</span>
                      <div className="video-extension-option-row video-extension-method-row" role="radiogroup" aria-label="延长方式">
                        {VIDEO_EXTENSION_METHODS.map(method => (
                          <button
                            key={method}
                            type="button"
                            className={videoExtensionMethod === method ? 'active' : ''}
                            role="radio"
                            aria-checked={videoExtensionMethod === method}
                            onClick={() => setVideoExtensionMethod(method)}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
              <span className="video-enhancement-prototype-status" role="status">{videoExtensionStatus}</span>
            </div>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${videoExtensionCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{videoExtensionCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runVideoExtensionPrototype}
              aria-label="生成视频延长原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {isVideoResult && videoRetakeOpen && videoRetakePosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={videoRetakePanelRef}
          className="video-retake-prototype-panel nodrag nopan"
          style={{
            left: videoRetakePosition.left,
            top: videoRetakePosition.top,
            width: videoRetakePosition.width,
            maxHeight: videoRetakePosition.maxHeight,
          }}
          role="dialog"
          aria-label="视频重拍"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="video-retake-prototype-topbar">
            <div className="video-retake-prototype-shot-title">
              <strong>
                {formatVideoRetakeSegmentLabel(
                  selectedVideoRetakeSegment,
                  Math.max(0, videoRetakeSegments.findIndex(segment => segment.id === selectedVideoRetakeSegment.id)),
                  videoRetakeSegments.length,
                )}
              </strong>
              <span>视频重拍</span>
            </div>
            <div className="video-retake-prototype-tools">
              <button type="button" aria-label="播放预览" title="播放预览">
                <Icon name="play" size={16} />
              </button>
              <button type="button" onClick={splitVideoRetakeSegment} aria-label="裁剪分镜" title="裁剪">
                <Icon name="split" size={16} />
              </button>
              <button type="button" onClick={resetVideoRetakePrototype} aria-label="重置重拍设置" title="重置">
                <Icon name="refresh" size={16} />
              </button>
              <button
                type="button"
                className="video-enhancement-prototype-close"
                onClick={() => setVideoRetakeOpen(false)}
                aria-label="关闭视频重拍"
                title="关闭"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </header>

          <div className="video-retake-prototype-timeline" aria-label="视频重拍时间轴">
            <div
              ref={videoRetakeFilmstripRef}
              className={`video-retake-prototype-filmstrip ${isVideoRetakePlayheadDragging ? 'is-dragging' : ''}`}
              role="slider"
              tabIndex={0}
              aria-label="重拍裁剪指针"
              aria-valuemin={0}
              aria-valuemax={videoRetakeTotalDuration}
              aria-valuenow={videoRetakePlayheadTime}
              aria-valuetext={formatVideoRetakeTime(videoRetakePlayheadTime)}
              onPointerDown={handleVideoRetakePlayheadPointerDown}
              onPointerMove={handleVideoRetakePlayheadPointerMove}
              onPointerUp={handleVideoRetakePlayheadPointerUp}
              onPointerCancel={handleVideoRetakePlayheadPointerUp}
              onKeyDown={handleVideoRetakePlayheadKeyDown}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <div className="video-retake-prototype-frame" key={index}>
                  <video src={videoUrl} muted playsInline preload="metadata" />
                </div>
              ))}
              <span
                className="video-retake-prototype-cursor"
                style={{ left: `${videoRetakePlayheadPercent}%` }}
                aria-hidden="true"
              >
                <span>{formatVideoRetakeTime(videoRetakePlayheadTime)}</span>
              </span>
            </div>
            <div className="video-retake-prototype-segments">
              {videoRetakeSegments.map((segment, index) => (
                <button
                  key={segment.id}
                  type="button"
                  className={segment.id === selectedVideoRetakeSegment.id ? 'active' : ''}
                  style={{ flexGrow: Math.max(1, segment.end - segment.start) }}
                  onClick={() => {
                    setSelectedVideoRetakeSegmentId(segment.id);
                    setVideoRetakePlayheadTime(Math.round(((segment.start + segment.end) / 2) * 10) / 10);
                  }}
                  aria-pressed={segment.id === selectedVideoRetakeSegment.id}
                >
                  <span>{`分镜 ${index + 1}`}</span>
                  <small>{`${formatVideoRetakeTime(segment.start)}-${formatVideoRetakeTime(segment.end)}`}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="video-retake-prototype-mode-row" role="tablist" aria-label="镜头变化">
            <span>镜头变化</span>
            {VIDEO_RETAKE_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                className={videoRetakeMode === mode ? 'active' : ''}
                role="tab"
                aria-selected={videoRetakeMode === mode}
                onClick={() => setVideoRetakeMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {videoRetakeMode === '切换' && (
            <div className="video-retake-view-tabs" role="tablist" aria-label="切换镜头视角">
              {[
                { key: 'start', label: '开始视角' },
                { key: 'end', label: '结束视角' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={videoRetakeSwitchViewTab === tab.key ? 'active' : ''}
                  role="tab"
                  aria-selected={videoRetakeSwitchViewTab === tab.key}
                  onClick={() => setVideoRetakeSwitchViewTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="video-retake-prototype-body">
            <section className="video-retake-camera-control" aria-label="摄像机角度控制">
              <div className="video-retake-camera-title" aria-hidden="true">
                <span>透视</span>
                <strong>{videoRetakeAngle}</strong>
              </div>
              <AngleCameraPreview
                imageUrl={videoRetakePreviewImage}
                yaw={videoRetakeCameraYaw}
                pitch={videoRetakeCameraPitch}
                distance={videoRetakeCameraDistance}
                secondaryCamera={secondaryVideoRetakeCamera}
                disabled={videoRetakeMode === '保持不变'}
                onChange={handleVideoRetakeCameraChange}
              />
              <span className="video-retake-camera-hint">拖动相机调整视角</span>
            </section>

            <section className="video-retake-settings" aria-label="重拍设置">
              <div className="video-retake-setting-group">
                <span>{videoRetakeMode === '切换' ? `${videoRetakeSwitchViewTab === 'start' ? '开始' : '结束'}视角` : '视角'}</span>
                <div className="video-retake-camera-options" role="radiogroup" aria-label="视角">
                  {[...VIDEO_RETAKE_CAMERA_ANGLES, '自定义视角'].map(angle => (
                    <button
                      key={angle}
                      type="button"
                      className={videoRetakeAngle === angle ? 'active' : ''}
                      role="radio"
                      aria-checked={videoRetakeAngle === angle}
                      onClick={() => chooseVideoRetakeAngle(angle)}
                      disabled={videoRetakeMode === '保持不变'}
                    >
                      {angle}
                    </button>
                  ))}
                </div>
              </div>

              <div className="video-retake-setting-group">
                <span>{videoRetakeMode === '切换' ? `${videoRetakeSwitchViewTab === 'start' ? '开始' : '结束'}视角 · 景别` : '景别'}</span>
                <div className="video-retake-shot-options" role="radiogroup" aria-label="景别">
                  {VIDEO_RETAKE_SHOT_SIZES.map(shotSize => (
                    <button
                      key={shotSize}
                      type="button"
                      className={videoRetakeShotSize === shotSize ? 'active' : ''}
                      role="radio"
                      aria-checked={videoRetakeShotSize === shotSize}
                      onClick={() => chooseVideoRetakeShotSize(shotSize)}
                      disabled={videoRetakeMode === '保持不变'}
                    >
                      {shotSize}
                    </button>
                  ))}
                </div>
              </div>

              <div className="video-retake-setting-group">
                <span>补充镜头要求</span>
                <textarea
                  value={videoRetakePrompt}
                  onChange={(event) => setVideoRetakePrompt(event.target.value)}
                  placeholder={videoRetakeMode === '保持不变' ? '当前分镜保持原视频，不做镜头变化' : '补充镜头要求，例如：缓慢绕到人物侧后方（可选）'}
                  rows={3}
                  disabled={videoRetakeMode === '保持不变'}
                />
              </div>

              <div className="video-retake-mode-hint" role="status">
                {videoRetakeMode === '保持不变' && '当前分镜会沿用原片段，只作为分镜结构预览。'}
                {videoRetakeMode === '固定' && '适合保持一个固定视角，只调整视角、景别或主体状态。'}
                {videoRetakeMode === '切换' && '适合把当前片段切到另一个镜头视角，形成更明显的镜头变化。'}
                {videoRetakeMode === '平滑移动' && '适合模拟推拉、横移、环绕等连续运镜。'}
              </div>
            </section>
          </div>

          <footer className="video-enhancement-prototype-footer video-retake-prototype-footer">
            <span className="video-enhancement-prototype-status" role="status">{videoRetakeStatus}</span>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${videoRetakeCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{videoRetakeCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runVideoRetakePrototype}
              aria-label="生成视频重拍原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {videoExtensionReferencePreview && typeof document !== 'undefined' && createPortal(
        <div
          className={`reference-image-preview-portal ${videoExtensionReferencePreview.placement}`}
          style={{
            left: videoExtensionReferencePreview.left,
            top: videoExtensionReferencePreview.top,
          }}
        >
          <img src={videoExtensionReferencePreview.src} alt="参考图预览" />
        </div>,
        document.body,
      )}
      {/* 多图展开时：单图 handle 仍然可用，但用户也可以从每张图右侧的小 dot 拖出（指向特定图） */}
      {isImageResult && isMultiImage && allImageUrls.map((url, index) => (
        <Handle
          key={`handle_img_${index}`}
          id={`img-${index}`}
          type="source"
          position={Position.Right}
          style={{
            top: `${20 + index * 24}%`,
            background: index === coverIndex ? 'var(--accent)' : 'var(--success-alt)',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      ))}
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      {isTextResult && isTextExpanded && createPortal(
        <div className="canvas-processor-expanded-backdrop result-text-expanded-overlay nodrag nopan" onClick={closeTextExpanded}>
          <section
            className="canvas-processor-expanded-dialog result-text-expanded-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="文本节点内容"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="canvas-processor-expanded-header result-text-expanded-header">
              <button
                type="button"
                className="canvas-processor-expanded-close result-text-collapse-btn"
                onClick={closeTextExpanded}
                aria-label="缩小文本节点"
                title="缩小"
              >
                <Icon name="collapseDiagonal" size={16} />
              </button>
            </header>
            <div className="canvas-processor-expanded-body result-text-expanded-body">
              {isTextExpandedEditing ? (
                <RichTextEditor
                  editorRef={expandedTextEditorRef}
                  className="result-text-expanded-content result-text-expanded-editor rich-text-editor nodrag nopan nowheel"
                  value={result}
                  placeholder="输入文本内容..."
                  onInput={(event) => commitRichTextEditorValue(event.currentTarget)}
                  onSelectionChange={syncTextSelection}
                  onKeyDown={handleTextEditorKeyDown}
                  onBlur={handleTextExpandedEditorBlur}
                />
              ) : (
                <div
                  className="result-text-expanded-content nowheel"
                  onDoubleClick={enterTextExpandedEditing}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    enterTextExpandedEditing(event);
                  }}
                  aria-label="文本内容，双击编辑"
                >
                  <FormattedTextContent value={result} />
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}

      <ImagePreviewOverlay
        imageUrl={previewState.imageUrl}
        images={previewState.images}
        initialIndex={previewState.index}
        historyImages={data?.previewHistoryImages || []}
        alt="生成图片大图预览"
        nodeId={id}
        sourceType="result"
        apiConfigs={data?.apiConfigs}
        apiProviders={data?.apiProviders}
        onAction={data?.onImageAction}
        onClose={() => setPreviewState({ imageUrl: '', images: [], index: 0 })}
      />

      {imageContextMenu && createPortal(
        <div
          ref={imageContextMenuRef}
          className="context-menu pane-context-menu result-node-context-menu nodrag nopan"
          role="menu"
          aria-label="图片操作"
          style={{
            position: 'fixed',
            left: imageContextMenu.x,
            top: imageContextMenu.y,
            zIndex: 10001,
          }}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div className="context-menu-item" role="menuitem" tabIndex={0} onClick={copyContextMenuImage}>
            <span className="menu-icon"><Icon name="copy" size={16} /></span>
            <span className="menu-label">复制图片</span>
          </div>
          <div className="context-menu-item" role="menuitem" tabIndex={0} onClick={downloadContextMenuImage}>
            <span className="menu-icon"><Icon name="download" size={16} /></span>
            <span className="menu-label">下载原图</span>
          </div>
        </div>,
        document.body,
      )}

      {editingCardIndex != null && createPortal(
        <div className="storyboard-edit-overlay" onClick={() => setEditingCardIndex(null)}>
          <div className="storyboard-edit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="storyboard-edit-header">
              <h3>编辑分镜 {storyboardCards[editingCardIndex]?.shotNo || String(editingCardIndex + 1).padStart(2, '0')}</h3>
              <button type="button" className="storyboard-edit-close" onClick={() => setEditingCardIndex(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="storyboard-edit-body">
              <label className="storyboard-edit-field">
                <span>时长</span>
                <input
                  type="text"
                  value={editForm.duration || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="如 5s"
                />
              </label>
              <label className="storyboard-edit-field">
                <span>运镜效果</span>
                <input
                  type="text"
                  value={editForm.cameraMovement || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, cameraMovement: e.target.value }))}
                  placeholder="如：推、拉、摇、移、跟..."
                />
              </label>
              <label className="storyboard-edit-field">
                <span>画面描述</span>
                <textarea
                  value={editForm.visualDescription || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, visualDescription: e.target.value }))}
                  placeholder="描述画面内容、构图、光线..."
                  rows={4}
                />
              </label>
              <label className="storyboard-edit-field">
                <span>旁白</span>
                <textarea
                  value={editForm.narration || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, narration: e.target.value }))}
                  placeholder="旁白/口播文案..."
                  rows={3}
                />
              </label>
            </div>
            <div className="storyboard-edit-footer">
              <button type="button" className="storyboard-edit-cancel" onClick={() => setEditingCardIndex(null)}>取消</button>
              <button type="button" className="storyboard-edit-save" onClick={() => {
                data?.onResultCardUpdate?.(id, editingCardIndex, editForm);
                setEditingCardIndex(null);
              }}>保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default memo(ResultNode);
