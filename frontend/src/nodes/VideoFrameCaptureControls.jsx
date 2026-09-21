import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';
import { useModalFocus } from '../modalFocus.js';
import { VIDEO_FRAME_ACTIONS } from '../videoFrameCapture.js';
import {
  QUICK_TRIM_FILMSTRIP_COUNT,
  buildQuickTrimFrameTimes,
  createQuickTrimContract,
  formatQuickTrimDuration,
  normalizeQuickTrimRange,
  resolveQuickTrimKeyboardRange,
  resolveQuickTrimPointerRange,
} from './videoQuickTrim.js';
import { useVideoFrameCapture } from './useVideoFrameCapture.js';
import trimCancelIcon from '../assets/figma-video-node/trim-cancel.svg';
import trimSaveIcon from '../assets/figma-video-node/trim-save.svg';
import './VideoFrameCaptureControls.css';

const FILMSTRIP_ITEMS = Array.from({ length: QUICK_TRIM_FILMSTRIP_COUNT }, (_, index) => index);


const QUICK_TRIM_VIEWPORT_MARGIN = 14;
const QUICK_TRIM_ANCHOR_GAP = 12;

// QUICK_TRIM_VIEWPORT_PLACEMENT_START
function resolveQuickTrimViewportPlacement({
  anchorRect,
  dialogRect,
  viewportWidth,
  viewportHeight,
  overflowTop = 0,
  overflowBottom = 0,
  margin = QUICK_TRIM_VIEWPORT_MARGIN,
  gap = QUICK_TRIM_ANCHOR_GAP,
}) {
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const dialogWidth = Math.max(0, Number(dialogRect?.width) || 0);
  const dialogHeight = Math.max(0, Number(dialogRect?.height) || 0);
  const safeOverflowTop = Math.max(0, Number(overflowTop) || 0);
  const safeOverflowBottom = Math.max(0, Number(overflowBottom) || 0);
  const visualHeight = safeOverflowTop + dialogHeight + safeOverflowBottom;
  const anchorLeft = Number(anchorRect?.left) || 0;
  const anchorRight = Number(anchorRect?.right) || anchorLeft;
  const anchorTop = Number(anchorRect?.top) || 0;
  const anchorBottom = Number(anchorRect?.bottom) || anchorTop;
  const maxLeft = Math.max(margin, safeViewportWidth - dialogWidth - margin);
  const minTop = margin + safeOverflowTop;
  const maxTop = Math.max(
    minTop,
    safeViewportHeight - dialogHeight - safeOverflowBottom - margin,
  );
  const desiredLeft = ((anchorLeft + anchorRight) / 2) - (dialogWidth / 2);
  const availableAbove = anchorTop - gap - margin;
  const placeBelow = availableAbove < visualHeight;
  const desiredTop = placeBelow
    ? anchorBottom + gap + safeOverflowTop
    : anchorTop - gap - dialogHeight - safeOverflowBottom;

  return {
    left: Math.min(Math.max(margin, desiredLeft), maxLeft),
    top: Math.min(Math.max(minTop, desiredTop), maxTop),
    placement: placeBelow ? 'below' : 'above',
  };
}
// QUICK_TRIM_VIEWPORT_PLACEMENT_END

function readVideoMetrics(video) {
  return {
    duration: Number.isFinite(video?.duration) ? video.duration : 0,
    aspectRatio: video?.videoWidth > 0 && video?.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : undefined,
  };
}

function waitForVideoEvent(video, eventName, signal, timeoutMs = 5000) {
  if (signal?.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error(`等待视频事件 ${eventName} 超时`)), timeoutMs);
    const finish = (error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onEvent = () => finish();
    const onError = () => finish(new Error('视频帧预览加载失败'));
    const onAbort = () => finish(new DOMException('已取消', 'AbortError'));
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function captureVideoFrame(video) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(320, video.videoWidth);
  canvas.height = Math.max(1, Math.round(canvas.width * video.videoHeight / video.videoWidth));
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

async function generateQuickTrimFilmstrip({ sourceVideoUrl, sourceDuration, signal }) {
  if (!sourceVideoUrl || !Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = sourceVideoUrl;

  try {
    if (video.readyState < 1) {
      video.load();
      await waitForVideoEvent(video, 'loadedmetadata', signal);
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : sourceDuration;
    if (video.readyState < 2) await waitForVideoEvent(video, 'loadeddata', signal);
    const frameTimes = buildQuickTrimFrameTimes(duration, QUICK_TRIM_FILMSTRIP_COUNT);
    const frames = [];
    for (const time of frameTimes) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      const targetTime = Math.min(Math.max(0, time), Math.max(0, duration - 0.01));
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        video.currentTime = targetTime;
        await waitForVideoEvent(video, 'seeked', signal);
      }
      const frame = captureVideoFrame(video);
      if (!frame) throw new Error('视频帧不可读取');
      frames.push({ time: targetTime, src: frame });
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export default function VideoFrameCaptureControls({
  sourceNodeId,
  getVideoElement,
  sourceVideoUrl,
  initialTrim,
  onTrimConfirm,
  trimRequestId = 0,
  onTrimOpenChange,
  hideActions = false,
  variant = '',
}) {
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [draftRange, setDraftRange] = useState({ start: 0, end: 0, duration: 0 });
  const [previewFrames, setPreviewFrames] = useState([]);
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [trimPlacement, setTrimPlacement] = useState(null);
  const controlsRef = useRef(null);
  const startHandleRef = useRef(null);
  const trackRef = useRef(null);
  const selectionRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const pendingClientXRef = useRef(null);
  const initialVideoTimeRef = useRef(null);
  const filmstripAbortRef = useRef(null);
  const placementRafRef = useRef(0);
  const handledTrimRequestIdRef = useRef(trimRequestId);
  const { captureFrame, capturingKind, progress } = useVideoFrameCapture({
    sourceNodeId,
    getVideoElement,
    sourceVideoUrl,
  });
  const activeAction = VIDEO_FRAME_ACTIONS.find(action => action.id === capturingKind);
  const normalizedDraft = useMemo(
    () => normalizeQuickTrimRange(draftRange, sourceDuration),
    [draftRange, sourceDuration],
  );

  const closeTrim = useCallback(() => {
    const video = getVideoElement?.();
    if (video && Number.isFinite(initialVideoTimeRef.current)) {
      video.currentTime = initialVideoTimeRef.current;
    }
    initialVideoTimeRef.current = null;
    setTrimOpen(false);
    onTrimOpenChange?.(false);
    setTrimPlacement(null);
    setDraftRange(normalizeQuickTrimRange(initialTrim, sourceDuration));
    dragRef.current = null;
    pendingClientXRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    filmstripAbortRef.current?.abort();
    filmstripAbortRef.current = null;
  }, [getVideoElement, initialTrim, onTrimOpenChange, sourceDuration]);

  const trimDialogRef = useModalFocus(trimOpen, closeTrim);

  useEffect(() => {
    if (!trimOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => startHandleRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [trimOpen]);


  const updateTrimPlacement = useCallback(() => {
    const anchor = controlsRef.current;
    const dialog = trimDialogRef.current;
    if (!anchor || !dialog) return;
    const anchorRect = anchor.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const durationRect = dialog.querySelector('.video-quick-trim-duration')?.getBoundingClientRect();
    const resolvedPlacement = resolveQuickTrimViewportPlacement({
      anchorRect,
      dialogRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflowTop: durationRect ? Math.max(0, dialogRect.top - durationRect.top) : 0,
      overflowBottom: durationRect ? Math.max(0, durationRect.bottom - dialogRect.bottom) : 0,
    });
    const nextPlacement = variant === 'result-video'
      ? {
          ...resolvedPlacement,
          top: Math.min(
            Math.max(QUICK_TRIM_VIEWPORT_MARGIN, anchorRect.bottom + 4),
            Math.max(QUICK_TRIM_VIEWPORT_MARGIN, window.innerHeight - dialogRect.height - QUICK_TRIM_VIEWPORT_MARGIN),
          ),
          placement: 'below',
        }
      : resolvedPlacement;
    setTrimPlacement(current => (
      current
      && current.left === nextPlacement.left
      && current.top === nextPlacement.top
      && current.placement === nextPlacement.placement
        ? current
        : nextPlacement
    ));
  }, [trimDialogRef, variant]);

  useLayoutEffect(() => {
    if (!trimOpen) return undefined;
    let tracking = true;
    const trackPlacement = () => {
      updateTrimPlacement();
      if (tracking) {
        placementRafRef.current = window.requestAnimationFrame(trackPlacement);
      }
    };

    trackPlacement();

    return () => {
      tracking = false;
      if (placementRafRef.current) window.cancelAnimationFrame(placementRafRef.current);
      placementRafRef.current = 0;
    };
  }, [trimDialogRef, trimOpen, updateTrimPlacement]);

  useEffect(() => {
    if (!captureMenuOpen && !trimOpen) return undefined;
    const closeCaptureMenuOnOutsidePointer = event => {
      if (!captureMenuOpen) return;
      if (controlsRef.current?.contains(event.target) || trimDialogRef.current?.contains(event.target)) return;
      setCaptureMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      setCaptureMenuOpen(false);
      if (trimOpen) closeTrim();
    };
    document.addEventListener('pointerdown', closeCaptureMenuOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeCaptureMenuOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [captureMenuOpen, closeTrim, trimDialogRef, trimOpen]);

  useEffect(() => () => {
    if (trimOpen) onTrimOpenChange?.(false);
  }, [onTrimOpenChange, trimOpen]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (placementRafRef.current) cancelAnimationFrame(placementRafRef.current);
    filmstripAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!trimOpen || sourceDuration <= 0) return undefined;
    const controller = new AbortController();
    filmstripAbortRef.current?.abort();
    filmstripAbortRef.current = controller;
    void generateQuickTrimFilmstrip({
      sourceVideoUrl,
      sourceDuration,
      signal: controller.signal,
    }).then(frames => {
      if (controller.signal.aborted) return;
      setPreviewFrames(frames);
      setPreviewStatus(frames.length === QUICK_TRIM_FILMSTRIP_COUNT ? 'ready' : 'unavailable');
    }).catch(error => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      // 跨域视频可能允许播放但不允许像素读取。此时只降级预览，不伪造重复帧。
      setPreviewFrames([]);
      setPreviewStatus('unavailable');
    });
    return () => controller.abort();
  }, [sourceDuration, sourceVideoUrl, trimOpen]);

  const openTrimSelector = useCallback((event) => {
    event?.stopPropagation?.();
    const video = getVideoElement?.();
    const metrics = readVideoMetrics(video);
    if (metrics.duration <= 0) return;
    setCaptureMenuOpen(false);
    initialVideoTimeRef.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    setSourceDuration(metrics.duration);
    setDraftRange(normalizeQuickTrimRange(initialTrim, metrics.duration));
    setPreviewFrames([]);
    setPreviewStatus('loading');
    setTrimOpen(true);
    onTrimOpenChange?.(true);
  }, [getVideoElement, initialTrim, onTrimOpenChange]);

  useEffect(() => {
    if (!trimRequestId || handledTrimRequestIdRef.current === trimRequestId) return;
    handledTrimRequestIdRef.current = trimRequestId;
    openTrimSelector();
  }, [openTrimSelector, trimRequestId]);

  const previewRangeBoundary = useCallback((range, mode) => {
    const video = getVideoElement?.();
    if (!video) return;
    const previewTime = mode === 'end' ? range.end : range.start;
    video.currentTime = Math.min(Math.max(0, previewTime), Math.max(0, sourceDuration - 0.01));
  }, [getVideoElement, sourceDuration]);

  const commitPendingPointer = useCallback(() => {
    rafRef.current = 0;
    const drag = dragRef.current;
    const clientX = pendingClientXRef.current;
    if (!drag || !Number.isFinite(clientX)) return;
    const nextRange = resolveQuickTrimPointerRange({
      mode: drag.mode,
      clientX,
      originX: drag.originX,
      trackWidth: drag.trackWidth,
      initialRange: drag.initialRange,
      sourceDuration,
    });
    setDraftRange(nextRange);
    previewRangeBoundary(nextRange, drag.mode);
  }, [previewRangeBoundary, sourceDuration]);

  const beginPointerDrag = useCallback((mode, event) => {
    event.preventDefault();
    event.stopPropagation();
    const trackRect = trackRef.current?.getBoundingClientRect();
    if (!trackRect?.width) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      mode,
      originX: event.clientX,
      trackWidth: trackRect.width,
      initialRange: normalizedDraft,
    };
  }, [normalizedDraft]);

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    pendingClientXRef.current = event.clientX;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(commitPendingPointer);
  }, [commitPendingPointer]);

  const finishPointerDrag = useCallback((event) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    pendingClientXRef.current = event.clientX;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    commitPendingPointer();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    pendingClientXRef.current = null;
  }, [commitPendingPointer]);

  const adjustRangeWithKeyboard = useCallback((mode, event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setDraftRange(current => {
      const nextRange = resolveQuickTrimKeyboardRange({
        mode,
        key: event.key,
        shiftKey: event.shiftKey,
        initialRange: current,
        sourceDuration,
      });
      previewRangeBoundary(nextRange, mode);
      return nextRange;
    });
  }, [previewRangeBoundary, sourceDuration]);


  const confirmTrim = useCallback((event) => {
    event.stopPropagation();
    const video = getVideoElement?.();
    const metrics = readVideoMetrics(video);
    const resolvedDuration = metrics.duration || sourceDuration;
    const range = normalizeQuickTrimRange(normalizedDraft, resolvedDuration);
    const contract = createQuickTrimContract({
      sourceNodeId,
      sourceUrl: sourceVideoUrl,
      sourceDuration: resolvedDuration,
      aspectRatio: metrics.aspectRatio,
      range,
    });
    if (video) {
      video.pause();
      video.currentTime = range.start;
    }
    onTrimConfirm?.(contract);
    initialVideoTimeRef.current = null;
    setTrimOpen(false);
    setTrimPlacement(null);
    onTrimOpenChange?.(false);
    filmstripAbortRef.current?.abort();
  }, [getVideoElement, normalizedDraft, onTrimConfirm, onTrimOpenChange, sourceDuration, sourceNodeId, sourceVideoUrl]);

  const selectionStyle = sourceDuration > 0 ? {
    left: `${(normalizedDraft.start / sourceDuration) * 100}%`,
    width: `${(normalizedDraft.duration / sourceDuration) * 100}%`,
  } : { left: '0%', width: '0%' };
  const selectionStartPercent = sourceDuration > 0 ? (normalizedDraft.start / sourceDuration) * 100 : 0;
  const selectionEndPercent = sourceDuration > 0 ? (normalizedDraft.end / sourceDuration) * 100 : 0;

  return (
    <div
      ref={controlsRef}
      className={`video-frame-capture-controls nodrag nopan ${variant ? `is-${variant}` : ''} ${trimOpen ? 'is-trimming' : ''}`}
      aria-label="视频截帧和快速裁剪工具"
      onPointerDown={event => event.stopPropagation()}
    >
      {!hideActions && <div className="video-frame-capture-actions">
        <button
          type="button"
          className="video-frame-capture-trigger"
          disabled={Boolean(capturingKind)}
          aria-haspopup="menu"
          aria-expanded={captureMenuOpen}
          onClick={event => {
            event.stopPropagation();
            if (trimOpen) closeTrim();
            setCaptureMenuOpen(current => !current);
          }}
        >
          <Icon name="imageAdd" size={14} />
          <span>{capturingKind ? `${activeAction?.shortLabel || '截帧'} ${progress || 0}%` : '截取画面帧'}</span>
          <Icon name="chevronDown" size={14} />
        </button>
        <button
          type="button"
          className={`video-quick-trim-trigger ${initialTrim ? 'is-active' : ''}`}
          onClick={openTrimSelector}
          aria-haspopup="dialog"
          aria-expanded={trimOpen}
        >
          <Icon name="split" size={14} />
          <span>快速裁剪</span>
        </button>
      </div>}

      {!hideActions && captureMenuOpen && (
        <div className="video-frame-capture-menu" role="menu" aria-label="选择截帧位置">
          {VIDEO_FRAME_ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={Boolean(capturingKind)}
              onClick={event => {
                event.stopPropagation();
                setCaptureMenuOpen(false);
                void captureFrame(action.id);
              }}
              title={action.label}
              aria-label={action.label}
            >
              <Icon name="imageAdd" size={13} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {trimOpen && createPortal(
        <div
          ref={trimDialogRef}
          className={`video-quick-trim-selector ${variant ? `is-${variant}` : ''} ${trimPlacement ? 'is-positioned' : ''}`}
          data-placement={trimPlacement?.placement || 'above'}
          style={trimPlacement ? { left: trimPlacement.left, top: trimPlacement.top } : undefined}
          role="dialog"
          aria-label="快速裁剪视频区间"
          aria-modal="true"
          onPointerDown={event => event.stopPropagation()}
        >
          <button type="button" className="video-quick-trim-decision" onClick={() => closeTrim()} aria-label="取消快速裁剪">
            {variant === 'result-video'
              ? <img src={trimCancelIcon} alt="" aria-hidden="true" />
              : <Icon name="x" size={16} />}
            {variant === 'result-video' && <span>取消</span>}
          </button>
          <div ref={trackRef} className="video-quick-trim-track">
            <div className={`video-quick-trim-filmstrip is-${previewStatus}`} aria-hidden="true">
              {FILMSTRIP_ITEMS.map(index => (
                <span key={index}>
                  {previewFrames[index]?.src
                    ? <img src={previewFrames[index].src} alt="" draggable="false" />
                    : <i />}
                </span>
              ))}
            </div>
            {previewStatus === 'unavailable' && (
              <span className="video-quick-trim-preview-status" role="status">
                受视频跨域策略限制，缩略帧不可用；仍可按时间区间正常裁剪
              </span>
            )}
            <div
              className="video-quick-trim-scrim is-before"
              style={{ width: `${selectionStartPercent}%` }}
              aria-hidden="true"
            />
            <div
              className="video-quick-trim-scrim is-after"
              style={{ left: `${selectionEndPercent}%`, width: `${Math.max(0, 100 - selectionEndPercent)}%` }}
              aria-hidden="true"
            />
            <div
              ref={selectionRef}
              className="video-quick-trim-selection"
              style={selectionStyle}
              role="group"
              tabIndex={0}
              aria-label={`裁剪区间：${formatQuickTrimDuration(normalizedDraft.start)} 至 ${formatQuickTrimDuration(normalizedDraft.end)}；方向键整体平移，Shift 加方向键大步平移`}
              onKeyDown={event => adjustRangeWithKeyboard('move', event)}
              onPointerDown={event => beginPointerDrag('move', event)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerDrag}
              onPointerCancel={finishPointerDrag}
            >
              <button
                ref={startHandleRef}
                type="button"
                className="video-quick-trim-handle is-start"
                role="slider"
                aria-label="裁剪起点"
                aria-valuemin={0}
                aria-valuemax={sourceDuration}
                aria-valuenow={normalizedDraft.start}
                aria-valuetext={formatQuickTrimDuration(normalizedDraft.start)}
                onKeyDown={event => adjustRangeWithKeyboard('start', event)}
                onPointerDown={event => beginPointerDrag('start', event)}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerDrag}
                onPointerCancel={finishPointerDrag}
              />
              <span className="video-quick-trim-duration">{formatQuickTrimDuration(normalizedDraft.duration)}</span>
              <button
                type="button"
                className="video-quick-trim-handle is-end"
                role="slider"
                aria-label="裁剪终点"
                aria-valuemin={0}
                aria-valuemax={sourceDuration}
                aria-valuenow={normalizedDraft.end}
                aria-valuetext={formatQuickTrimDuration(normalizedDraft.end)}
                onKeyDown={event => adjustRangeWithKeyboard('end', event)}
                onPointerDown={event => beginPointerDrag('end', event)}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerDrag}
                onPointerCancel={finishPointerDrag}
              />
            </div>
          </div>
          <button type="button" className="video-quick-trim-decision" onClick={confirmTrim} aria-label="确认快速裁剪">
            {variant === 'result-video'
              ? <img src={trimSaveIcon} alt="" aria-hidden="true" />
              : <Icon name="check" size={16} />}
            {variant === 'result-video' && <span>保存</span>}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
