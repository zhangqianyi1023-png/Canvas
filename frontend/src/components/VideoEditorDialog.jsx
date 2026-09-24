import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { API_BASE } from '../apiBase';
import { downloadBlob } from '../imageDownload';
import {
  compactTimelineClips,
  createClipFromSource,
  createTimelineScale,
  createVideoEditorCanvasFromAspectRatio,
  createVideoEditorTracks,
  DEFAULT_VIDEO_EDITOR_FRAME_RATE,
  DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO,
  duplicateClipAtTime,
  getAspectFillScale,
  getAspectFitScale,
  formatSeconds,
  formatAspectRatioLabel,
  formatVideoEditorFrameClock,
  getClipMaxDuration,
  getTimelinePlaybackState,
  getTimelineDuration,
  insertClipAtTime,
  normalizeAspectRatioNumber,
  normalizeVideoEditorTimeline,
  removeClipWithRipple,
  reorderClipWithRipple,
  snapVideoEditorTimeToFrame,
  splitClipAtTime,
  trimClipWithRipple,
  trimClipEndWithSnap,
  trimClipStartWithSnap,
  VIDEO_EDITOR_ASPECT_RATIO_PRESETS,
  VIDEO_EDITOR_RESOLUTION_PRESETS,
  VIDEO_EDITOR_TRACK_DEFINITIONS,
} from '../videoEditorModel';

const DEFAULT_PX_PER_SECOND = 88;
const MIN_TIMELINE_ZOOM = 1;
const MAX_TIMELINE_ZOOM = 600;
const TIMELINE_WIDTH_PADDING = 120;
const MIN_VISIBLE_TIMELINE_SECONDS = 6;
const TIMELINE_FRAME_RATE = DEFAULT_VIDEO_EDITOR_FRAME_RATE;
const MAX_VIDEO_TIMELINE_FRAMES = 240;
const MAX_IMAGE_TIMELINE_FRAMES = 48;
const TIMELINE_TRACK_HEADER_WIDTH = 132;
const AUTO_SAVE_DEBOUNCE_MS = 650;
const PREVIEW_MEDIA_WIDTH_RATIO = 58;
const PREVIEW_SNAP_THRESHOLD_PX = 12;
const TIMELINE_DRAG_MODES = new Set(['playhead', 'move', 'trim-start', 'trim-end']);
const DEFAULT_EDITOR_LAYOUT = {
  libraryWidth: 260,
  inspectorWidth: 280,
  timelineHeight: 246,
};
const EDITOR_LAYOUT_LIMITS = {
  libraryWidth: { min: 220, max: 420 },
  inspectorWidth: { min: 240, max: 460 },
  timelineHeight: { min: 190, max: 420 },
  previewMinWidth: 420,
  mainMinHeight: 260,
  resizeHandleWidth: 12,
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const VIDEO_EDITOR_TRACK_ICON = {
  video: 'video',
  image: 'image',
  audio: 'volume',
};
const VIDEO_EDITOR_TRACK_LABEL = Object.fromEntries(
  VIDEO_EDITOR_TRACK_DEFINITIONS.map(track => [track.type, track.label]),
);

const formatTimelineClock = (seconds = 0) => {
  return formatVideoEditorFrameClock(seconds, TIMELINE_FRAME_RATE);
};

const snapTimelineFrameTime = (time) => snapVideoEditorTimeToFrame(time, TIMELINE_FRAME_RATE);

const clampTimelineTime = (time, maxTime) => (
  clamp(snapTimelineFrameTime(time), 0, snapTimelineFrameTime(maxTime))
);

const getTimelineClipFrameCount = (clip, pxPerSecond) => {
  const clipWidth = Math.max(46, (clip?.duration || 0) * pxPerSecond);
  const maxFrames = clip?.type === 'video' ? MAX_VIDEO_TIMELINE_FRAMES : MAX_IMAGE_TIMELINE_FRAMES;
  const targetFrameWidth = clip?.type === 'video'
    ? (pxPerSecond >= 420 ? 18 : pxPerSecond >= 260 ? 24 : pxPerSecond >= 180 ? 34 : pxPerSecond >= 120 ? 44 : pxPerSecond >= 72 ? 58 : 82)
    : (pxPerSecond >= 180 ? 46 : pxPerSecond >= 96 ? 58 : 78);
  return Math.round(clamp(Math.ceil(clipWidth / targetFrameWidth), 1, maxFrames));
};

const getTimelineRulerConfig = (pxPerSecond) => {
  if (pxPerSecond >= 420) return { mode: 'frame', minor: 1 / TIMELINE_FRAME_RATE, medium: 5 / TIMELINE_FRAME_RATE, major: 1 };
  if (pxPerSecond >= 260) return { minor: 0.1, medium: 0.5, major: 1 };
  if (pxPerSecond >= 180) return { minor: 0.1, medium: 0.5, major: 1 };
  if (pxPerSecond >= 120) return { minor: 0.25, medium: 0.5, major: 1 };
  if (pxPerSecond >= 84) return { minor: 0.25, medium: 0.5, major: 1 };
  if (pxPerSecond >= 48) return { minor: 0.5, medium: null, major: 1 };
  if (pxPerSecond >= 24) return { minor: 1, medium: null, major: 5 };
  if (pxPerSecond >= 12) return { minor: 5, medium: null, major: 10 };
  if (pxPerSecond >= 6) return { minor: 10, medium: null, major: 30 };
  return { minor: 30, medium: null, major: 60 };
};

const isTimelineMultiple = (time, interval) => {
  if (!interval) return false;
  return Math.abs(time / interval - Math.round(time / interval)) < 0.001;
};

const getTimelineZoomStep = (pxPerSecond) => {
  if (pxPerSecond < 24) return 2;
  if (pxPerSecond < 64) return 4;
  if (pxPerSecond < 160) return 8;
  return 16;
};

const getTimelineDensity = (pxPerSecond) => {
  if (pxPerSecond >= 420) return 'frame';
  if (pxPerSecond >= 160) return 'fine';
  if (pxPerSecond >= 72) return 'standard';
  return 'overview';
};

const getPreviewMediaSizePercent = ({ clip, stageRect, mediaAspectRatio }) => {
  if (!clip || !stageRect?.width || !stageRect?.height || !mediaAspectRatio) {
    return { width: 0, height: 0 };
  }
  const width = PREVIEW_MEDIA_WIDTH_RATIO * (clip.transform?.scale || 1);
  const heightPx = (stageRect.width * (PREVIEW_MEDIA_WIDTH_RATIO / 100) / mediaAspectRatio) * (clip.transform?.scale || 1);
  return {
    width,
    height: (heightPx / stageRect.height) * 100,
  };
};

const getPreviewAxisBounds = (sizePercent) => {
  const half = Math.max(0, sizePercent / 2);
  if (half <= 50) return { min: half, max: 100 - half };
  return { min: 100 - half, max: half };
};

const clampPreviewPositionBySize = ({ x, y, size }) => {
  const xBounds = getPreviewAxisBounds(size.width);
  const yBounds = getPreviewAxisBounds(size.height);
  return {
    x: clamp(x, xBounds.min, xBounds.max),
    y: clamp(y, yBounds.min, yBounds.max),
    size,
  };
};

const clampPreviewPosition = ({ x, y, clip, stageRect, mediaAspectRatio, measuredSize }) => (
  clampPreviewPositionBySize({
    x,
    y,
    size: measuredSize || getPreviewMediaSizePercent({ clip, stageRect, mediaAspectRatio }),
  })
);

const resolvePreviewSnap = ({ x, y, clip, stageRect, mediaAspectRatio, enabled, measuredSize }) => {
  const bounded = clampPreviewPosition({ x, y, clip, stageRect, mediaAspectRatio, measuredSize });
  if (!enabled) return { x: bounded.x, y: bounded.y, snapX: null, snapY: null };
  const size = bounded.size;
  const thresholdX = (PREVIEW_SNAP_THRESHOLD_PX / Math.max(1, stageRect.width)) * 100;
  const thresholdY = (PREVIEW_SNAP_THRESHOLD_PX / Math.max(1, stageRect.height)) * 100;
  const xPoints = [
    { value: 50, type: 'center' },
    { value: size.width / 2, type: 'left' },
    { value: 100 - size.width / 2, type: 'right' },
  ].filter(point => Number.isFinite(point.value));
  const yPoints = [
    { value: 50, type: 'center' },
    { value: size.height / 2, type: 'top' },
    { value: 100 - size.height / 2, type: 'bottom' },
  ].filter(point => Number.isFinite(point.value));

  const snapX = xPoints.find(point => Math.abs(point.value - x) <= thresholdX) || null;
  const snapY = yPoints.find(point => Math.abs(point.value - y) <= thresholdY) || null;
  const snapped = clampPreviewPosition({
    x: snapX ? snapX.value : bounded.x,
    y: snapY ? snapY.value : bounded.y,
    clip,
    stageRect,
    mediaAspectRatio,
    measuredSize: size,
  });
  return {
    x: snapped.x,
    y: snapped.y,
    snapX: snapX?.type || null,
    snapY: snapY?.type || null,
  };
};

const getFrameStripKey = (clip, frameCount) => [
  clip.id,
  clip.sourceUrl,
  clip.inPoint || 0,
  clip.duration,
  frameCount,
].join('|');

const waitForVideoEvent = (video, eventName) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => {
    cleanup();
    reject(new Error(`video ${eventName} timeout`));
  }, 2600);
  const handleEvent = () => {
    cleanup();
    resolve();
  };
  const handleError = () => {
    cleanup();
    reject(new Error(`video ${eventName} failed`));
  };
  const cleanup = () => {
    window.clearTimeout(timer);
    video.removeEventListener(eventName, handleEvent);
    video.removeEventListener('error', handleError);
  };
  video.addEventListener(eventName, handleEvent, { once: true });
  video.addEventListener('error', handleError, { once: true });
});

const captureVideoFrameStrip = async ({ sourceUrl, inPoint = 0, duration = 0, frameCount = 1 }) => {
  if (typeof document === 'undefined' || !sourceUrl) return [];
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (/^https?:\/\//.test(sourceUrl) && typeof window !== 'undefined' && !sourceUrl.startsWith(window.location.origin)) {
    video.crossOrigin = 'anonymous';
  }
  video.src = sourceUrl;

  try {
    if (!Number.isFinite(video.duration) || video.readyState < 1) {
      await waitForVideoEvent(video, 'loadedmetadata');
    }
    const mediaDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : inPoint + duration;
    const safeEnd = Math.max(0, Math.min(mediaDuration - 0.05, inPoint + duration - 0.05));
    const safeStart = clamp(inPoint + 0.03, 0, safeEnd);
    const sampleCount = Math.max(1, frameCount);
    const videoWidth = video.videoWidth || 160;
    const videoHeight = video.videoHeight || 90;
    const aspectRatio = videoWidth / Math.max(1, videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(240, Math.max(120, videoWidth));
    canvas.height = Math.max(68, Math.round(canvas.width / aspectRatio));
    const context = canvas.getContext('2d');
    if (!context) return [];

    const frames = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const progress = sampleCount === 1 ? 0.5 : index / (sampleCount - 1);
      const targetTime = safeStart + (safeEnd - safeStart) * progress;
      const mediaTime = clamp(targetTime, 0, Math.max(0, mediaDuration - 0.05));
      if (Math.abs(video.currentTime - mediaTime) > 0.01 || video.readyState < 2) {
        video.currentTime = mediaTime;
        await waitForVideoEvent(video, 'seeked');
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.72));
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
};

function VideoEditorDialog({
  nodeId,
  title = '视频编辑器',
  sources = [],
  timeline,
  onClose,
  onSave,
  onRendered,
}) {
  const [draft, setDraft] = useState(() => {
    const normalized = normalizeVideoEditorTimeline(timeline);
    return { ...normalized, clips: compactTimelineClips(normalized.clips) };
  });
  const [selectedClipId, setSelectedClipId] = useState(draft.clips[0]?.id || '');
  const [dragState, setDragState] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [sourceDrag, setSourceDrag] = useState(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [sourceAspectRatios, setSourceAspectRatios] = useState({});
  const [sourceDurations, setSourceDurations] = useState({});
  const [clipFrameStrips, setClipFrameStrips] = useState({});
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState('saved');
  const [editorLayout, setEditorLayout] = useState(DEFAULT_EDITOR_LAYOUT);
  const [layoutResize, setLayoutResize] = useState(null);
  const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(960);
  const shellRef = useRef(null);
  const previewRef = useRef(null);
  const previewVideoRef = useRef(null);
  const timelineRef = useRef(null);
  const exportMenuRef = useRef(null);
  const clipFrameStripsRef = useRef({});
  const draftRef = useRef(draft);
  const autoSaveTimerRef = useRef(0);
  const lastSavedDraftRef = useRef(JSON.stringify(draft));
  const playbackFrameRef = useRef(0);
  const playbackAnchorRef = useRef({ startedAt: 0, timelineTime: 0 });
  const isPlayingRef = useRef(false);
  const playbackRunRef = useRef(0);
  const previewSeekRef = useRef({ clipId: '', mediaTime: -1 });
  const gestureStartScaleRef = useRef(DEFAULT_PX_PER_SECOND);

  const selectedClip = draft.clips.find(clip => clip.id === selectedClipId) || null;
  const timelineDuration = getTimelineDuration(draft.clips);
  const totalDuration = Math.max(MIN_VISIBLE_TIMELINE_SECONDS, timelineDuration);
  const minTimelineZoom = useMemo(() => {
    const visibleWidth = Math.max(280, timelineViewportWidth - TIMELINE_WIDTH_PADDING);
    return clamp(
      Math.floor(visibleWidth / Math.max(MIN_VISIBLE_TIMELINE_SECONDS, totalDuration)),
      MIN_TIMELINE_ZOOM,
      MAX_TIMELINE_ZOOM,
    );
  }, [timelineViewportWidth, totalDuration]);
  const timelineWidth = Math.max(timelineViewportWidth, TIMELINE_TRACK_HEADER_WIDTH + totalDuration * pxPerSecond + TIMELINE_WIDTH_PADDING);
  const snapThreshold = useMemo(() => Math.max(0.06, 10 / pxPerSecond), [pxPerSecond]);
  const canvasAspectRatio = draft.canvas.width / draft.canvas.height;
  const frameStepSeconds = 1 / TIMELINE_FRAME_RATE;

  const getConstrainedEditorLayout = useCallback((nextLayout) => {
    const shellRect = shellRef.current?.getBoundingClientRect();
    const shellWidth = shellRect?.width || 1280;
    const shellHeight = shellRect?.height || 760;
    const horizontalHandles = EDITOR_LAYOUT_LIMITS.resizeHandleWidth * 2;
    const libraryMax = Math.max(
      EDITOR_LAYOUT_LIMITS.libraryWidth.min,
      Math.min(
        EDITOR_LAYOUT_LIMITS.libraryWidth.max,
        shellWidth
          - nextLayout.inspectorWidth
          - EDITOR_LAYOUT_LIMITS.previewMinWidth
          - horizontalHandles,
      ),
    );
    const libraryWidth = clamp(
      nextLayout.libraryWidth,
      EDITOR_LAYOUT_LIMITS.libraryWidth.min,
      libraryMax,
    );
    const inspectorMax = Math.max(
      EDITOR_LAYOUT_LIMITS.inspectorWidth.min,
      Math.min(
        EDITOR_LAYOUT_LIMITS.inspectorWidth.max,
        shellWidth
          - libraryWidth
          - EDITOR_LAYOUT_LIMITS.previewMinWidth
          - horizontalHandles,
      ),
    );
    const inspectorWidth = clamp(
      nextLayout.inspectorWidth,
      EDITOR_LAYOUT_LIMITS.inspectorWidth.min,
      inspectorMax,
    );
    const timelineMax = Math.max(
      EDITOR_LAYOUT_LIMITS.timelineHeight.min,
      Math.min(
        EDITOR_LAYOUT_LIMITS.timelineHeight.max,
        shellHeight - 58 - EDITOR_LAYOUT_LIMITS.mainMinHeight,
      ),
    );
    return {
      libraryWidth,
      inspectorWidth,
      timelineHeight: clamp(
        nextLayout.timelineHeight,
        EDITOR_LAYOUT_LIMITS.timelineHeight.min,
        timelineMax,
      ),
    };
  }, []);

  const startLayoutResize = useCallback((event, target) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setLayoutResize({
      target,
      startX: event.clientX,
      startY: event.clientY,
      layout: editorLayout,
    });
  }, [editorLayout]);

  const pauseTimelinePlayback = useCallback((message = '') => {
    playbackRunRef.current += 1;
    isPlayingRef.current = false;
    if (playbackFrameRef.current) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = 0;
    }
    const video = previewVideoRef.current;
    if (video && !video.paused) video.pause();
    setIsPlaying(false);
    if (message) setStatusMessage(message);
  }, []);

  const stopTimelinePlayback = useCallback((message = '') => {
    playbackRunRef.current += 1;
    isPlayingRef.current = false;
    if (playbackFrameRef.current) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = 0;
    }
    const video = previewVideoRef.current;
    if (video && !video.paused) video.pause();
    setIsPlaying(false);
    if (message) setStatusMessage(message);
  }, []);

  const startTimelinePlayback = useCallback(() => {
    if (draft.clips.length === 0 || timelineDuration <= 0) {
      setStatusMessage('时间轴里还没有可播放的片段');
      return;
    }
    if (isPlayingRef.current) return;
    const playbackRunId = playbackRunRef.current + 1;
    playbackRunRef.current = playbackRunId;
    const startTime = playheadTime >= timelineDuration - 0.01 ? 0 : clampTimelineTime(playheadTime, timelineDuration);
    const initialState = getTimelinePlaybackState(draft.clips, startTime);
    if (initialState?.clip) setSelectedClipId(initialState.clip.id);
    setPlayheadTime(startTime);
    playbackAnchorRef.current = {
      startedAt: performance.now(),
      timelineTime: startTime,
    };
    isPlayingRef.current = true;
    setIsPlaying(true);
    setStatusMessage('播放中');

    const advance = (now) => {
      if (!isPlayingRef.current || playbackRunRef.current !== playbackRunId) return;
      const elapsed = (now - playbackAnchorRef.current.startedAt) / 1000;
      const nextTime = clampTimelineTime(Math.min(
        timelineDuration,
        playbackAnchorRef.current.timelineTime + elapsed,
      ), timelineDuration);
      const playbackState = getTimelinePlaybackState(draft.clips, Math.min(nextTime, Math.max(0, timelineDuration - 0.001)));
      if (playbackState?.clip) {
        setSelectedClipId(current => (
          current === playbackState.clip.id ? current : playbackState.clip.id
        ));
      }
      setPlayheadTime(nextTime);
      const timelineElement = timelineRef.current;
      if (timelineElement) {
        const playheadX = TIMELINE_TRACK_HEADER_WIDTH + nextTime * pxPerSecond;
        const visibleLeft = timelineElement.scrollLeft + 56;
        const visibleRight = timelineElement.scrollLeft + timelineElement.clientWidth - 72;
        if (playheadX > visibleRight) {
          timelineElement.scrollLeft = Math.max(0, playheadX - timelineElement.clientWidth + 96);
        } else if (playheadX < visibleLeft) {
          timelineElement.scrollLeft = Math.max(0, playheadX - 56);
        }
      }
      if (nextTime >= timelineDuration) {
        playbackRunRef.current += 1;
        isPlayingRef.current = false;
        playbackFrameRef.current = 0;
        setIsPlaying(false);
        setStatusMessage('播放完成');
        return;
      }
      playbackFrameRef.current = requestAnimationFrame(advance);
    };

    playbackFrameRef.current = requestAnimationFrame(advance);
  }, [draft.clips, playheadTime, pxPerSecond, timelineDuration]);

  const toggleTimelinePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      stopTimelinePlayback();
    } else {
      startTimelinePlayback();
    }
  }, [startTimelinePlayback, stopTimelinePlayback]);

  const updateClip = useCallback((clipId, patcher) => {
    setDraft(current => ({
      ...current,
      clips: current.clips.map(clip => {
        if (clip.id !== clipId) return clip;
        const patch = typeof patcher === 'function' ? patcher(clip) : patcher;
        return {
          ...clip,
          ...patch,
          transform: {
            ...clip.transform,
            ...(patch.transform || {}),
          },
        };
      }),
    }));
  }, []);

  const updateCanvasSettings = useCallback((patch) => {
    pauseTimelinePlayback();
    setDraft(current => {
      const aspectRatio = patch.aspectRatio || current.canvas.aspectRatio || formatAspectRatioLabel(
        current.canvas.width / current.canvas.height,
      );
      const resolution = patch.resolution || current.canvas.resolution;
      return {
        ...current,
        canvas: createVideoEditorCanvasFromAspectRatio(aspectRatio, resolution),
      };
    });
    setRenderError('');
    setStatusMessage('画布规格已更新');
  }, [pauseTimelinePlayback]);

  const getClipMediaAspectRatio = useCallback((clip) => (
    clip?.aspectRatio
    || sourceAspectRatios[clip?.sourceId]
    || sourceAspectRatios[clip?.id]
    || canvasAspectRatio
  ), [canvasAspectRatio, sourceAspectRatios]);

  const rememberSourceMetadata = useCallback((source, { aspectRatio, duration } = {}) => {
    const ratio = normalizeAspectRatioNumber(aspectRatio, 0);
    const sourceDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    if (!source?.id || (!ratio && !sourceDuration)) return;
    if (ratio) {
      setSourceAspectRatios(current => (
        Math.abs((current[source.id] || 0) - ratio) < 0.01
          ? current
          : { ...current, [source.id]: ratio }
      ));
    }
    if (sourceDuration) {
      setSourceDurations(current => (
        Math.abs((current[source.id] || 0) - sourceDuration) < 0.05
          ? current
          : { ...current, [source.id]: sourceDuration }
      ));
    }
    setDraft(current => {
      let changed = false;
      const nextClips = current.clips.map((clip) => {
        if (clip.sourceId !== source.id) return clip;
        const nextClip = {
          ...clip,
          aspectRatio: ratio || clip.aspectRatio,
          sourceDuration: sourceDuration || clip.sourceDuration,
        };
        const maxDuration = getClipMaxDuration(nextClip);
        const duration = clip.type === 'video' && sourceDuration
          ? Math.min(maxDuration, clip.duration)
          : clip.duration;
        if (
          nextClip.aspectRatio !== clip.aspectRatio
          || nextClip.sourceDuration !== clip.sourceDuration
          || duration !== clip.duration
        ) {
          changed = true;
          return { ...nextClip, duration };
        }
        return clip;
      });
      return changed ? { ...current, clips: nextClips } : current;
    });
  }, []);

  const handleSourceImageLoad = useCallback((source, event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      rememberSourceMetadata(source, { aspectRatio: naturalWidth / naturalHeight });
    }
  }, [rememberSourceMetadata]);

  const handleSourceVideoMetadata = useCallback((source, event) => {
    const { videoWidth, videoHeight, duration } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0) {
      rememberSourceMetadata(source, {
        aspectRatio: videoWidth / videoHeight,
        duration,
      });
    }
  }, [rememberSourceMetadata]);

  const createSourceClip = useCallback((source, start) => {
    const aspectRatio = source.aspectRatio || sourceAspectRatios[source.id];
    const sourceDuration = source.sourceDuration || source.duration || sourceDurations[source.id];
    return {
      clip: createClipFromSource({ ...source, aspectRatio, sourceDuration }, start),
      aspectRatio,
    };
  }, [sourceAspectRatios, sourceDurations]);

  const getSourceMeta = useCallback((source) => {
    const aspectRatio = formatAspectRatioLabel(
      source.aspectRatio || sourceAspectRatios[source.id] || canvasAspectRatio,
    );
    const duration = source.type === 'video'
      ? source.sourceDuration || source.duration || sourceDurations[source.id]
      : 0;
    const detail = source.type === 'video' && duration
      ? `${formatSeconds(duration)} · ${aspectRatio}`
      : aspectRatio;
    return {
      typeLabel: source.type === 'video' ? '视频' : '图片',
      detail,
    };
  }, [canvasAspectRatio, sourceAspectRatios, sourceDurations]);

  const insertSourceAtPlayhead = useCallback((source) => {
    if (!source?.url) return;
    pauseTimelinePlayback();
    setDraft(current => {
      const insertTime = clampTimelineTime(playheadTime, getTimelineDuration(current.clips));
      const { clip } = createSourceClip(source, insertTime);
      const result = insertClipAtTime(current.clips, clip, insertTime);
      const insertedClip = result.clips.find(item => item.id === clip.id);
      setSelectedClipId(clip.id);
      setPlayheadTime(insertedClip?.start || 0);
      setStatusMessage(`已在 ${formatTimelineClock(insertTime)} 插入素材，后续片段已顺延`);
      return {
        ...current,
        clips: result.clips,
      };
    });
  }, [createSourceClip, pauseTimelinePlayback, playheadTime]);

  const removeSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    pauseTimelinePlayback();
    setDraft(current => {
      const ordered = compactTimelineClips(current.clips);
      const removedIndex = ordered.findIndex(clip => clip.id === selectedClipId);
      const clips = removeClipWithRipple(ordered, selectedClipId);
      const nextClip = clips[Math.min(Math.max(removedIndex, 0), clips.length - 1)] || null;
      setSelectedClipId(nextClip?.id || '');
      setPlayheadTime(nextClip?.start || Math.min(playheadTime, getTimelineDuration(clips)));
      setStatusMessage('片段已删除，后续片段已自动补位');
      return { ...current, clips };
    });
    setContextMenu(null);
  }, [pauseTimelinePlayback, playheadTime, selectedClipId]);

  const splitSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    pauseTimelinePlayback();
    setDraft(current => {
      const splitTime = clampTimelineTime(playheadTime, getTimelineDuration(current.clips));
      const splitClips = splitClipAtTime(current.clips, selectedClipId, splitTime);
      if (splitClips === current.clips) {
        setStatusMessage('播放头需要落在片段中间才能切割');
        return current;
      }
      const nextClips = compactTimelineClips(splitClips);
      const createdClip = nextClips.find(clip => !current.clips.some(item => item.id === clip.id));
      if (createdClip) setSelectedClipId(createdClip.id);
      setStatusMessage(`已在 ${formatTimelineClock(splitTime)} 切割片段`);
      return { ...current, clips: nextClips };
    });
    setContextMenu(null);
  }, [pauseTimelinePlayback, playheadTime, selectedClipId]);

  const duplicateSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    pauseTimelinePlayback();
    setDraft(current => {
      const currentClip = current.clips.find(clip => clip.id === selectedClip.id);
      if (!currentClip) return current;
      const nextStart = currentClip.start + currentClip.duration;
      const copy = duplicateClipAtTime(currentClip, nextStart);
      if (!copy) return current;
      const result = insertClipAtTime(current.clips, copy, nextStart);
      const insertedClip = result.clips.find(clip => clip.id === copy.id);
      setSelectedClipId(copy.id);
      setPlayheadTime(insertedClip?.start || nextStart);
      return {
        ...current,
        clips: result.clips,
      };
    });
    setStatusMessage('片段副本已插入到原片段之后');
    setContextMenu(null);
  }, [pauseTimelinePlayback, selectedClip]);

  const moveSelectedClipToPlayhead = useCallback(() => {
    if (!selectedClip) return;
    pauseTimelinePlayback();
    setDraft(current => {
      const ordered = compactTimelineClips(current.clips);
      const remaining = ordered.filter(clip => clip.id !== selectedClip.id);
      let targetIndex = remaining.findIndex(clip => playheadTime <= clip.start + clip.duration / 2);
      if (targetIndex < 0) targetIndex = remaining.length;
      const clips = reorderClipWithRipple(ordered, selectedClip.id, targetIndex);
      const movedClip = clips.find(clip => clip.id === selectedClip.id);
      setPlayheadTime(movedClip?.start || 0);
      return { ...current, clips };
    });
    setStatusMessage('片段已移动到播放头附近');
    setContextMenu(null);
  }, [pauseTimelinePlayback, playheadTime, selectedClip]);

  const getTimelineTimeFromPointerEvent = useCallback((event) => {
    if (!timelineRef.current) return playheadTime;
    const rect = timelineRef.current.getBoundingClientRect();
    const scale = createTimelineScale({
      pxPerSecond,
      scrollLeft: timelineRef.current.scrollLeft,
      gutter: TIMELINE_TRACK_HEADER_WIDTH,
    });
    return clampTimelineTime(scale.pxToTime(event.clientX - rect.left), totalDuration);
  }, [playheadTime, pxPerSecond, totalDuration]);

  const setPlayheadFromPointerEvent = useCallback((event) => {
    setPlayheadTime(getTimelineTimeFromPointerEvent(event));
  }, [getTimelineTimeFromPointerEvent]);

  const getSourceById = useCallback((sourceId) => (
    sources.find(source => source.id === sourceId) || null
  ), [sources]);

  const getSourceDropPreview = useCallback((source, event, clips = draft.clips) => {
    if (!source) return null;
    const compacted = compactTimelineClips(clips);
    const timelineEnd = getTimelineDuration(compacted);
    const pointerTime = getTimelineTimeFromPointerEvent(event);
    let insertionTime = clampTimelineTime(pointerTime, timelineEnd);
    let snapPoint = null;

    if (snapEnabled) {
      const points = [
        0,
        timelineEnd,
        clampTimelineTime(playheadTime, timelineEnd),
        ...compacted.flatMap(clip => [clip.start, clip.start + clip.duration]),
      ];
      snapPoint = points.reduce((nearest, point) => {
        if (!Number.isFinite(point)) return nearest;
        const distance = Math.abs(point - insertionTime);
        if (distance > snapThreshold) return nearest;
        if (nearest == null || distance < Math.abs(nearest - insertionTime)) return point;
        return nearest;
      }, null);
      if (snapPoint != null) insertionTime = snapPoint;
    }

    const { clip } = createSourceClip(source, insertionTime);
    return {
      mode: 'source-insert',
      sourceId: source.id,
      sourceName: source.name || clip.name,
      type: clip.type,
      start: insertionTime,
      duration: clip.duration,
      snapPoint,
    };
  }, [createSourceClip, draft.clips, getTimelineTimeFromPointerEvent, playheadTime, snapEnabled, snapThreshold]);

  const handleSourceDragStart = useCallback((event, source) => {
    if (!source?.url || event.target?.closest?.('button')) {
      event.preventDefault();
      return;
    }
    pauseTimelinePlayback();
    setContextMenu(null);
    setSourceDrag({ sourceId: source.id });
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-video-editor-source-id', source.id);
    event.dataTransfer.setData('text/plain', source.name || '素材');
    setStatusMessage('拖到时间轴释放，即可插入主轨');
  }, [pauseTimelinePlayback]);

  const handleSourceDragEnd = useCallback(() => {
    setSourceDrag(null);
    setDragPreview(null);
  }, []);

  const handleTimelineDragOver = useCallback((event) => {
    const sourceId = sourceDrag?.sourceId
      || event.dataTransfer?.getData('application/x-video-editor-source-id');
    const source = getSourceById(sourceId);
    if (!source) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const preview = getSourceDropPreview(source, event);
    if (preview) setDragPreview(preview);
  }, [getSourceById, getSourceDropPreview, sourceDrag]);

  const handleTimelineDragLeave = useCallback((event) => {
    if (!sourceDrag) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && timelineRef.current?.contains?.(nextTarget)) return;
    setDragPreview(current => (current?.mode === 'source-insert' ? null : current));
  }, [sourceDrag]);

  const handleTimelineDrop = useCallback((event) => {
    const sourceId = event.dataTransfer?.getData('application/x-video-editor-source-id') || sourceDrag?.sourceId;
    const source = getSourceById(sourceId);
    if (!source) return;
    event.preventDefault();
    pauseTimelinePlayback();
    setContextMenu(null);

    setDraft(current => {
      const preview = getSourceDropPreview(source, event, current.clips);
      if (!preview) return current;
      const { clip } = createSourceClip(source, preview.start);
      const result = insertClipAtTime(current.clips, clip, preview.start);
      const insertedClip = result.clips.find(item => item.id === clip.id);
      setSelectedClipId(clip.id);
      setPlayheadTime(insertedClip?.start || preview.start);
      setStatusMessage(`已插入 ${source.name || '素材'}，后续片段已顺延`);
      return {
        ...current,
        clips: result.clips,
      };
    });
    setSourceDrag(null);
    setDragPreview(null);
  }, [createSourceClip, getSourceById, getSourceDropPreview, pauseTimelinePlayback, sourceDrag]);

  const startPlayheadDrag = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    pauseTimelinePlayback();
    setPlayheadFromPointerEvent(event);
    setDragState({
      mode: 'playhead',
      clientX: event.clientX,
    });
    setContextMenu(null);
  }, [pauseTimelinePlayback, setPlayheadFromPointerEvent]);

  const startTimelineDrag = useCallback((event, clip, mode) => {
    event.preventDefault();
    event.stopPropagation();
    pauseTimelinePlayback();
    setSelectedClipId(clip.id);
    setDragState({
      mode,
      clipId: clip.id,
      clientX: event.clientX,
      start: clip.start,
      duration: clip.duration,
      inPoint: clip.inPoint || 0,
      sourceDuration: clip.sourceDuration,
      type: clip.type,
      clips: draft.clips,
    });
    setContextMenu(null);
  }, [draft.clips, pauseTimelinePlayback]);

  const openTimelineClipMenu = useCallback((event, clip) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId(clip.id);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      clipId: clip.id,
    });
  }, []);

  const handleTimelinePointerMove = useCallback((event) => {
    if (!dragState) return;
    if (!TIMELINE_DRAG_MODES.has(dragState.mode)) return;
    if (dragState.mode === 'playhead') {
      setPlayheadFromPointerEvent(event);
      return;
    }
    const deltaSeconds = (event.clientX - dragState.clientX) / pxPerSecond;
    const originalClip = {
      id: dragState.clipId,
      type: dragState.type,
      start: dragState.start,
      duration: dragState.duration,
      inPoint: dragState.inPoint,
      sourceDuration: dragState.sourceDuration,
    };
    if (dragState.mode === 'move') {
      let pointerTime = getTimelineTimeFromPointerEvent(event);
      const snapPoint = snapEnabled && Math.abs(pointerTime - playheadTime) <= snapThreshold
        ? playheadTime
        : null;
      if (snapPoint != null) pointerTime = snapPoint;
      const remaining = compactTimelineClips(dragState.clips).filter(clip => clip.id !== dragState.clipId);
      let targetIndex = remaining.findIndex(clip => pointerTime < clip.start + clip.duration / 2);
      if (targetIndex < 0) targetIndex = remaining.length;
      const insertionTime = targetIndex < remaining.length
        ? remaining[targetIndex].start
        : getTimelineDuration(remaining);
      setDragPreview({
        mode: 'move',
        clipId: dragState.clipId,
        type: dragState.type,
        start: insertionTime,
        duration: dragState.duration,
        targetIndex,
        snapPoint,
      });
      return;
    }
    if (dragState.mode === 'trim-start') {
      const result = trimClipStartWithSnap(originalClip, dragState.clips, snapTimelineFrameTime(dragState.start + deltaSeconds), {
        playheadTime,
        snapEnabled,
        threshold: snapThreshold,
      });
      const clips = trimClipWithRipple(dragState.clips, dragState.clipId, {
        duration: result.duration,
        inPoint: result.inPoint,
      });
      const trimmedClip = clips.find(clip => clip.id === dragState.clipId);
      setDraft(current => ({ ...current, clips }));
      setPlayheadTime(trimmedClip?.start || 0);
      setDragPreview({
        mode: 'trim-start',
        clipId: dragState.clipId,
        type: dragState.type,
        start: trimmedClip?.start || 0,
        duration: result.duration,
        inPoint: result.inPoint,
        snapPoint: result.snapPoint,
      });
      return;
    }
    if (dragState.mode !== 'trim-end') return;
    const result = trimClipEndWithSnap(originalClip, dragState.clips, snapTimelineFrameTime(dragState.start + dragState.duration + deltaSeconds), {
      playheadTime,
      snapEnabled,
      threshold: snapThreshold,
    });
    const clips = trimClipWithRipple(dragState.clips, dragState.clipId, {
      duration: result.duration,
    });
    const trimmedClip = clips.find(clip => clip.id === dragState.clipId);
    setDraft(current => ({ ...current, clips }));
    setPlayheadTime((trimmedClip?.start || 0) + result.duration);
    setDragPreview({
      mode: 'trim-end',
      clipId: dragState.clipId,
      type: dragState.type,
      start: trimmedClip?.start || 0,
      duration: result.duration,
      snapPoint: result.snapPoint,
    });
  }, [dragState, getTimelineTimeFromPointerEvent, playheadTime, pxPerSecond, setPlayheadFromPointerEvent, snapEnabled, snapThreshold]);

  const handleTimelinePointerUp = useCallback(() => {
    if (!dragState || !TIMELINE_DRAG_MODES.has(dragState.mode)) return;
    if (dragState?.mode === 'move' && dragPreview?.targetIndex != null) {
      setDraft(current => {
        const clips = reorderClipWithRipple(current.clips, dragState.clipId, dragPreview.targetIndex);
        const movedClip = clips.find(clip => clip.id === dragState.clipId);
        setPlayheadTime(movedClip?.start || 0);
        return { ...current, clips };
      });
      setStatusMessage('片段顺序已调整，主轨已自动补位');
    } else if (dragState) {
      setStatusMessage(dragState.mode === 'playhead' ? '播放头已定位' : '片段裁剪已完成');
    }
    setDragState(null);
    setDragPreview(null);
  }, [dragPreview, dragState]);

  const startPreviewDrag = useCallback((event) => {
    if (!selectedClip || !previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    pauseTimelinePlayback();
    const rect = previewRef.current.getBoundingClientRect();
    const mediaRect = event.currentTarget.getBoundingClientRect();
    const measuredSize = {
      width: Math.max(0, (mediaRect.width / Math.max(1, rect.width)) * 100),
      height: Math.max(0, (mediaRect.height / Math.max(1, rect.height)) * 100),
    };
    const mediaAspectRatio = getClipMediaAspectRatio(selectedClip);
    const initialX = selectedClip.transform.x;
    const initialY = selectedClip.transform.y;
    const pointerStartX = event.clientX;
    const pointerStartY = event.clientY;
    setDragState({ mode: 'preview-move', clipId: selectedClip.id });
    const move = (moveEvent) => {
      const deltaX = ((moveEvent.clientX - pointerStartX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - pointerStartY) / rect.height) * 100;
      const snapped = resolvePreviewSnap({
        x: initialX + deltaX,
        y: initialY + deltaY,
        clip: selectedClip,
        stageRect: rect,
        mediaAspectRatio,
        enabled: snapEnabled,
        measuredSize,
      });
      updateClip(selectedClip.id, {
        transform: {
          x: snapped.x,
          y: snapped.y,
        },
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragState(null);
      setStatusMessage('素材位置已调整');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [getClipMediaAspectRatio, pauseTimelinePlayback, selectedClip, snapEnabled, updateClip]);

  const saveDraftNow = useCallback(async ({ force = false } = {}) => {
    const nextDraft = draftRef.current;
    const signature = JSON.stringify(nextDraft);
    if (!force && signature === lastSavedDraftRef.current) {
      setAutoSaveStatus('saved');
      return true;
    }

    setAutoSaveStatus('saving');
    try {
      await onSave?.(nodeId, nextDraft);
      lastSavedDraftRef.current = signature;
      setRenderError('');
      setAutoSaveStatus(JSON.stringify(draftRef.current) === signature ? 'saved' : 'dirty');
      return true;
    } catch (error) {
      console.warn('[VideoEditorDialog] 自动保存草稿失败', error);
      setAutoSaveStatus('error');
      return false;
    }
  }, [nodeId, onSave]);

  useEffect(() => {
    draftRef.current = draft;
    const signature = JSON.stringify(draft);
    if (signature === lastSavedDraftRef.current) {
      setAutoSaveStatus('saved');
      return undefined;
    }

    setAutoSaveStatus('dirty');
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = 0;
      saveDraftNow();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = 0;
      }
    };
  }, [draft, saveDraftNow]);

  const handleCloseEditor = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = 0;
    }
    const saved = await saveDraftNow({ force: true });
    if (saved) {
      onClose?.();
      return;
    }
    setRenderError('自动保存失败，暂时无法关闭以免丢失草稿');
  }, [onClose, saveDraftNow]);

  const updateSelectedTransform = useCallback((patch) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      transform: {
        ...selectedClip.transform,
        ...patch,
      },
    });
  }, [selectedClip, updateClip]);

  const updateSelectedDuration = useCallback((duration) => {
    if (!selectedClip) return;
    pauseTimelinePlayback();
    setDraft(current => ({
      ...current,
      clips: trimClipWithRipple(current.clips, selectedClip.id, {
        duration: Math.max(0.5, Number(duration) || 0.5),
      }),
    }));
  }, [pauseTimelinePlayback, selectedClip]);

  const centerSelectedClip = useCallback(() => {
    updateSelectedTransform({ x: 50, y: 50 });
    setStatusMessage('片段已居中');
  }, [updateSelectedTransform]);

  const fitSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    const scale = getAspectFitScale(
      getClipMediaAspectRatio(selectedClip),
      canvasAspectRatio,
      DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO,
    );
    updateSelectedTransform({ x: 50, y: 50, scale, rotate: 0 });
    setStatusMessage('片段已适配画布');
  }, [canvasAspectRatio, getClipMediaAspectRatio, selectedClip, updateSelectedTransform]);

  const fillSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    const scale = getAspectFillScale(
      getClipMediaAspectRatio(selectedClip),
      canvasAspectRatio,
      DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO,
    );
    updateSelectedTransform({ x: 50, y: 50, scale, rotate: 0 });
    setStatusMessage('片段已填充画布');
  }, [canvasAspectRatio, getClipMediaAspectRatio, selectedClip, updateSelectedTransform]);

  const resetSelectedClip = useCallback(() => {
    updateSelectedTransform({ x: 50, y: 50, scale: 1, rotate: 0, opacity: 1 });
    setStatusMessage('片段变换已重置');
  }, [updateSelectedTransform]);

  const startPreviewScale = useCallback((event) => {
    if (!selectedClip) return;
    event.preventDefault();
    event.stopPropagation();
    const initialX = event.clientX;
    const initialScale = selectedClip.transform.scale;
    const move = (moveEvent) => {
      const nextScale = clamp(initialScale + (moveEvent.clientX - initialX) / 180, 0.2, 8);
      updateClip(selectedClip.id, { transform: { scale: nextScale } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [selectedClip, updateClip]);

  const startPreviewRotate = useCallback((event) => {
    if (!selectedClip || !previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = previewRef.current.getBoundingClientRect();
    const centerX = rect.left + (selectedClip.transform.x / 100) * rect.width;
    const centerY = rect.top + (selectedClip.transform.y / 100) * rect.height;
    const move = (moveEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
      updateClip(selectedClip.id, { transform: { rotate: clamp(Math.round(angle + 90), -180, 180) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [selectedClip, updateClip]);

  const downloadRenderedVideo = useCallback(async (videoUrl) => {
    const downloadUrl = videoUrl.startsWith('/') ? `${API_BASE}${videoUrl}` : videoUrl;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`视频下载失败: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    downloadBlob(blob, `video-editor-${Date.now()}.mp4`);
  }, []);

  const renderVideo = useCallback(async (exportTarget = 'node') => {
    setRenderError('');
    setExportMenuOpen(false);
    const saved = await saveDraftNow({ force: true });
    if (!saved) {
      setRenderError('自动保存失败，请稍后重试');
      return;
    }
    if (draft.clips.length === 0) {
      setRenderError('请先把素材加入时间轴');
      return;
    }
    setIsRendering(true);
    try {
      const response = await fetch(`${API_BASE}/api/video-editor/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          timeline: draft,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !payload.video_url) {
        throw new Error(payload?.detail || payload?.error || '视频合成失败');
      }
      if (exportTarget === 'download') {
        await downloadRenderedVideo(payload.video_url);
        setStatusMessage('导出完成，已下载视频');
      } else {
        onRendered?.(nodeId, payload.video_url, draft);
        setStatusMessage('导出完成，已回写到节点');
      }
    } catch (error) {
      setRenderError(error?.message || '视频合成失败');
      setStatusMessage('');
    } finally {
      setIsRendering(false);
    }
  }, [downloadRenderedVideo, draft, nodeId, onRendered, saveDraftNow]);

  const sortedClips = useMemo(() => (
    [...draft.clips].sort((a, b) => a.start - b.start)
  ), [draft.clips]);

  const timelineTracks = useMemo(() => {
    const tracks = createVideoEditorTracks(sortedClips);
    const displayOrder = ['image', 'video', 'audio'];
    return displayOrder
      .map(type => tracks.find(track => track.type === type))
      .filter(Boolean);
  }, [sortedClips]);

  const getTrackClipTop = useCallback((type) => {
    const trackIndex = Math.max(0, timelineTracks.findIndex(track => track.type === type));
    return 42 + trackIndex * 82;
  }, [timelineTracks]);

  const getTimelineX = useCallback((time) => (
    TIMELINE_TRACK_HEADER_WIDTH + time * pxPerSecond
  ), [pxPerSecond]);

  const timelineTrackHeight = 48 + Math.max(1, timelineTracks.length) * 82 + 8;

  const timelineTicks = useMemo(() => {
    const config = getTimelineRulerConfig(pxPerSecond);
    if (config.mode === 'frame') {
      const ticks = [];
      const totalFrames = Math.ceil(totalDuration * TIMELINE_FRAME_RATE);
      for (let frame = 0; frame <= totalFrames; frame += 1) {
        const time = Math.min(totalDuration, frame / TIMELINE_FRAME_RATE);
        const major = frame % TIMELINE_FRAME_RATE === 0;
        ticks.push({
          time,
          kind: major ? 'major' : frame % 5 === 0 ? 'medium' : 'minor',
          label: major ? formatTimelineClock(time) : '',
        });
      }
      return ticks;
    }

    let minorStep = config.minor;
    while (totalDuration / minorStep > 1400) {
      minorStep *= 2;
    }
    const ticks = [];
    const steps = Math.ceil(totalDuration / minorStep);
    for (let index = 0; index <= steps; index += 1) {
      const time = Math.min(totalDuration, Number((index * minorStep).toFixed(3)));
      const major = isTimelineMultiple(time, config.major);
      ticks.push({
        time,
        kind: major ? 'major' : isTimelineMultiple(time, config.medium) ? 'medium' : 'minor',
        label: major ? formatTimelineClock(time) : '',
      });
    }
    const lastTick = ticks[ticks.length - 1];
    if (lastTick && lastTick.time < totalDuration - 0.001) {
      ticks.push({ time: totalDuration, kind: 'major', label: formatTimelineClock(totalDuration) });
    }
    return ticks;
  }, [pxPerSecond, totalDuration]);

  const timelineDensity = useMemo(() => getTimelineDensity(pxPerSecond), [pxPerSecond]);

  const getClipTimelineFrames = useCallback((clip) => {
    const frameCount = getTimelineClipFrameCount(clip, pxPerSecond);
    const cachedFrames = clip.type === 'video' ? clipFrameStrips[clip.id]?.frames : null;
    const frames = cachedFrames?.length
      ? cachedFrames
      : clip.type === 'image'
        ? Array.from({ length: frameCount }, () => clip.sourceUrl)
        : [];
    return frames.length >= frameCount
      ? frames.slice(0, frameCount)
      : Array.from({ length: frameCount }, (_, index) => frames[index % frames.length]).filter(Boolean);
  }, [clipFrameStrips, pxPerSecond]);

  const changeTimelineZoom = useCallback((delta) => {
    setPxPerSecond(current => clamp(current + delta, minTimelineZoom, MAX_TIMELINE_ZOOM));
  }, [minTimelineZoom]);

  const zoomTimelineAtClientX = useCallback((clientX, nextScale) => {
    const scrollElement = timelineRef.current;
    if (!scrollElement) return;
    const rect = scrollElement.getBoundingClientRect();
    const pointerX = clamp(
      normalizeAspectRatioNumber(1, 1) * (Number(clientX) || rect.left + rect.width / 2) - rect.left,
      0,
      rect.width,
    );
    const timeAtPointer = Math.max(
      0,
      (scrollElement.scrollLeft + pointerX - TIMELINE_TRACK_HEADER_WIDTH) / pxPerSecond,
    );
    const clampedScale = clamp(nextScale, minTimelineZoom, MAX_TIMELINE_ZOOM);
    if (clampedScale === pxPerSecond) return;
    setPxPerSecond(clampedScale);
    requestAnimationFrame(() => {
      scrollElement.scrollLeft = Math.max(
        0,
        TIMELINE_TRACK_HEADER_WIDTH + timeAtPointer * clampedScale - pointerX,
      );
    });
  }, [minTimelineZoom, pxPerSecond]);

  const fitTimelineZoom = useCallback(() => {
    const viewportWidth = timelineRef.current?.clientWidth || 720;
    const nextScale = clamp(
      Math.floor((viewportWidth - TIMELINE_WIDTH_PADDING - TIMELINE_TRACK_HEADER_WIDTH) / Math.max(1, totalDuration)),
      minTimelineZoom,
      MAX_TIMELINE_ZOOM,
    );
    setPxPerSecond(nextScale);
    requestAnimationFrame(() => {
      if (timelineRef.current) timelineRef.current.scrollLeft = 0;
    });
    setStatusMessage('时间轴已适配当前视图宽度');
  }, [minTimelineZoom, totalDuration]);

  useEffect(() => {
    clipFrameStripsRef.current = clipFrameStrips;
  }, [clipFrameStrips]);

  useEffect(() => {
    const element = timelineRef.current;
    if (!element) return undefined;
    const updateTimelineWidth = () => {
      setTimelineViewportWidth(element.clientWidth || 960);
    };
    updateTimelineWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateTimelineWidth);
      return () => window.removeEventListener('resize', updateTimelineWidth);
    }
    const observer = new ResizeObserver(updateTimelineWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPxPerSecond(current => clamp(current, minTimelineZoom, MAX_TIMELINE_ZOOM));
  }, [minTimelineZoom]);

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const closeExportMenu = (event) => {
      if (exportMenuRef.current?.contains(event.target)) return;
      setExportMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeExportMenu);
    return () => window.removeEventListener('pointerdown', closeExportMenu);
  }, [exportMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    const activeClipIds = new Set(sortedClips.map(clip => clip.id));
    setClipFrameStrips(current => {
      const entries = Object.entries(current).filter(([clipId]) => activeClipIds.has(clipId));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });

    sortedClips
      .filter(clip => clip.type === 'video' && clip.sourceUrl)
      .forEach((clip) => {
        const frameCount = getTimelineClipFrameCount(clip, pxPerSecond);
        const frameStripKey = getFrameStripKey(clip, frameCount);
        const cached = clipFrameStripsRef.current[clip.id];
        if (cached?.key === frameStripKey || cached?.loadingKey === frameStripKey) return;
        setClipFrameStrips(current => ({
          ...current,
          [clip.id]: {
            ...(current[clip.id] || {}),
            loadingKey: frameStripKey,
            status: 'loading',
          },
        }));
        captureVideoFrameStrip({
          sourceUrl: clip.sourceUrl,
          inPoint: clip.inPoint || 0,
          duration: clip.duration,
          frameCount,
        }).then((frames) => {
          if (cancelled) return;
          setClipFrameStrips(current => ({
            ...current,
            [clip.id]: {
              key: frameStripKey,
              frames,
              status: frames.length ? 'ready' : 'empty',
            },
          }));
        }).catch(() => {
          if (cancelled) return;
          setClipFrameStrips(current => ({
            ...current,
            [clip.id]: {
              key: frameStripKey,
              frames: [],
              status: 'fallback',
            },
          }));
        });
      });

    return () => {
      cancelled = true;
    };
  }, [pxPerSecond, sortedClips]);

  const setPlayheadFromEvent = useCallback((event) => {
    if (event.target?.closest?.('.video-editor-clip, .video-editor-playhead, .video-editor-context-menu')) return;
    pauseTimelinePlayback();
    setPlayheadFromPointerEvent(event);
    setContextMenu(null);
  }, [pauseTimelinePlayback, setPlayheadFromPointerEvent]);

  const handleTimelineWheel = useCallback((event) => {
    if (!(event.ctrlKey || event.metaKey) || !timelineRef.current) return;
    event.preventDefault();
    const fallbackStep = getTimelineZoomStep(pxPerSecond);
    const proportionalScale = pxPerSecond * Math.exp(-event.deltaY * 0.01);
    const fallbackScale = pxPerSecond + (event.deltaY > 0 ? -fallbackStep : fallbackStep);
    const nextScale = Number.isFinite(proportionalScale) ? proportionalScale : fallbackScale;
    zoomTimelineAtClientX(event.clientX, nextScale);
  }, [pxPerSecond, zoomTimelineAtClientX]);

  useEffect(() => {
    const element = timelineRef.current;
    if (!element) return undefined;
    const handleGestureStart = (event) => {
      event.preventDefault();
      gestureStartScaleRef.current = pxPerSecond;
    };
    const handleGestureChange = (event) => {
      event.preventDefault();
      const scale = Number(event.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      zoomTimelineAtClientX(event.clientX, gestureStartScaleRef.current * scale);
    };
    element.addEventListener('gesturestart', handleGestureStart);
    element.addEventListener('gesturechange', handleGestureChange);
    return () => {
      element.removeEventListener('gesturestart', handleGestureStart);
      element.removeEventListener('gesturechange', handleGestureChange);
    };
  }, [pxPerSecond, zoomTimelineAtClientX]);

  useEffect(() => {
    if (!dragState || !TIMELINE_DRAG_MODES.has(dragState.mode)) return undefined;
    const move = event => handleTimelinePointerMove(event);
    const finish = () => handleTimelinePointerUp();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragState, handleTimelinePointerMove, handleTimelinePointerUp]);

  useEffect(() => {
    if (!layoutResize) return undefined;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = layoutResize.target === 'timeline' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (event) => {
      const deltaX = event.clientX - layoutResize.startX;
      const deltaY = event.clientY - layoutResize.startY;
      const nextLayout = { ...layoutResize.layout };
      if (layoutResize.target === 'library') {
        nextLayout.libraryWidth = layoutResize.layout.libraryWidth + deltaX;
      } else if (layoutResize.target === 'inspector') {
        nextLayout.inspectorWidth = layoutResize.layout.inspectorWidth - deltaX;
      } else if (layoutResize.target === 'timeline') {
        nextLayout.timelineHeight = layoutResize.layout.timelineHeight - deltaY;
      }
      setEditorLayout(getConstrainedEditorLayout(nextLayout));
    };
    const finish = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setLayoutResize(null);
      setStatusMessage('编辑器区域尺寸已调整');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [getConstrainedEditorLayout, layoutResize]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || selectedClip?.type !== 'video') return;
    const playbackState = getTimelinePlaybackState(draft.clips, playheadTime);
    if (!playbackState || playbackState.clip.id !== selectedClip.id) {
      if (!video.paused) video.pause();
      return;
    }
    const maxMediaTime = Number.isFinite(video.duration)
      ? Math.max(0, video.duration - 0.05)
      : playbackState.mediaTime;
    const targetMediaTime = Math.min(playbackState.mediaTime, maxMediaTime);
    if (!Number.isFinite(targetMediaTime)) return;

    if (isPlayingRef.current) {
      previewSeekRef.current = { clipId: selectedClip.id, mediaTime: targetMediaTime };
      if (Math.abs(video.currentTime - targetMediaTime) > 0.18) {
        video.currentTime = targetMediaTime;
      }
      if (video.paused) {
        video.play().catch(() => stopTimelinePlayback('浏览器暂时无法播放该素材'));
      }
      return;
    }

    if (!video.paused) {
      video.pause();
    }
    const frozenMediaTime = Math.round(targetMediaTime * 100) / 100;
    const previousSeek = previewSeekRef.current;
    if (
      previousSeek.clipId !== selectedClip.id
      || Math.abs(previousSeek.mediaTime - frozenMediaTime) > 0.01
    ) {
      previewSeekRef.current = { clipId: selectedClip.id, mediaTime: frozenMediaTime };
      if (Math.abs(video.currentTime - targetMediaTime) > 0.08) {
        video.currentTime = targetMediaTime;
      }
    }
  }, [draft.clips, isPlaying, playheadTime, selectedClip, stopTimelinePlayback]);

  useEffect(() => () => {
    playbackRunRef.current += 1;
    isPlayingRef.current = false;
    if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
      if (isEditingText) return;
      const claimEditorShortcut = ({ preventDefault = true } = {}) => {
        if (preventDefault) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      };
      if (event.key === 'Escape') {
        claimEditorShortcut({ preventDefault: false });
        setContextMenu(null);
        return;
      }
      if (event.code === 'Space') {
        claimEditorShortcut();
        toggleTimelinePlayback();
        return;
      }
      if (event.key.toLowerCase() === 's') {
        claimEditorShortcut();
        splitSelectedClip();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        claimEditorShortcut();
        if (selectedClip) removeSelectedClip();
        else setStatusMessage('请先选择时间轴片段');
        return;
      }
      if (!selectedClip && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        claimEditorShortcut();
        pauseTimelinePlayback();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const step = event.shiftKey ? frameStepSeconds * 10 : frameStepSeconds;
        const nextTime = clampTimelineTime(playheadTime + direction * step, totalDuration);
        setPlayheadTime(nextTime);
        setStatusMessage(`播放头 ${formatTimelineClock(nextTime)}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [frameStepSeconds, pauseTimelinePlayback, playheadTime, removeSelectedClip, selectedClip, splitSelectedClip, toggleTimelinePlayback, totalDuration]);

  const currentStatus = renderError
    || (dragPreview?.mode === 'source-insert' ? `释放后插入 ${dragPreview.sourceName || '素材'} · ${formatSeconds(dragPreview.start)}` : '')
    || (dragPreview?.snapPoint != null ? `已吸附到 ${formatSeconds(dragPreview.snapPoint)}` : '')
    || (dragPreview?.mode === 'move' ? `将片段插入到 ${formatSeconds(dragPreview.start)}` : '')
    || (dragState?.mode?.startsWith('trim') ? '正在裁剪片段' : '')
    || (dragState?.mode === 'preview-move' ? '拖动素材位置' : '')
    || (dragState?.mode === 'playhead' ? `播放头 ${formatTimelineClock(playheadTime)}` : '')
    || (isPlaying ? '播放中' : '')
    || statusMessage;
  const autoSaveMessage = {
    dirty: '有未保存修改',
    saving: '正在自动保存...',
    error: '自动保存失败',
    saved: '已自动保存',
  }[autoSaveStatus] || '已自动保存';
  const previewGuideState = selectedClip ? (() => {
    const mediaAspectRatio = getClipMediaAspectRatio(selectedClip);
    const width = PREVIEW_MEDIA_WIDTH_RATIO * selectedClip.transform.scale;
    const height = mediaAspectRatio
      ? (PREVIEW_MEDIA_WIDTH_RATIO * selectedClip.transform.scale * canvasAspectRatio) / mediaAspectRatio
      : 0;
    const x = selectedClip.transform.x;
    const y = selectedClip.transform.y;
    const active = dragState?.mode === 'preview-move';
    const threshold = 1.2;
    return {
      active,
      centerX: Math.abs(x - 50) <= threshold,
      centerY: Math.abs(y - 50) <= threshold,
      left: active && width > 0 && Math.abs(x - width / 2) <= threshold,
      right: active && width > 0 && Math.abs(x - (100 - width / 2)) <= threshold,
      top: active && height > 0 && Math.abs(y - height / 2) <= threshold,
      bottom: active && height > 0 && Math.abs(y - (100 - height / 2)) <= threshold,
    };
  })() : null;

  return (
    <div className="video-editor-overlay" role="dialog" aria-modal="true" aria-label="视频编辑器">
      <div
        ref={shellRef}
        className={`video-editor-shell ${layoutResize ? 'resizing' : ''}`}
        style={{
          '--video-editor-left-width': `${editorLayout.libraryWidth}px`,
          '--video-editor-right-width': `${editorLayout.inspectorWidth}px`,
          '--video-editor-timeline-height': `${editorLayout.timelineHeight}px`,
        }}
      >
        <header className="video-editor-header">
          <div className="video-editor-title">
            <Icon name="movieAi" size={20} />
            <div>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="video-editor-actions">
            {currentStatus && <span className={`video-editor-status ${renderError ? 'error' : ''}`}>{currentStatus}</span>}
            <span className={`video-editor-status autosave ${autoSaveStatus}`}>{autoSaveMessage}</span>
            <div className="video-editor-export-menu" ref={exportMenuRef}>
              <button
                type="button"
                className="primary export-trigger"
                disabled={isRendering}
                onClick={() => setExportMenuOpen(open => !open)}
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
              >
                <span>{isRendering ? '正在合成...' : '导出'}</span>
                <Icon name="chevronDown" size={16} />
              </button>
              {exportMenuOpen && (
                <div className="video-editor-export-popover" role="menu">
                  <span>导出选项</span>
                  <button type="button" role="menuitem" onClick={() => renderVideo('node')}>
                    <Icon name="grid" size={16} />
                    <strong>导出到节点</strong>
                  </button>
                  <button type="button" role="menuitem" onClick={() => renderVideo('download')}>
                    <Icon name="save" size={16} />
                    <strong>导出视频</strong>
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="icon-only" onClick={handleCloseEditor} aria-label="关闭视频编辑器">
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        <main className="video-editor-main">
          <aside className="video-editor-library">
            <div className="video-editor-panel-title">素材</div>
            {sources.length === 0 ? (
              <div className="video-editor-empty">连接图片或视频节点后会显示在这里</div>
            ) : sources.map(source => {
              const sourceMeta = getSourceMeta(source);
              const isSourceAdded = draft.clips.some(clip => clip.sourceId === source.id);
              return (
                <article
                  key={source.id}
                  className={`video-editor-source-card ${isSourceAdded ? 'added' : ''} ${sourceDrag?.sourceId === source.id ? 'dragging' : ''}`}
                  draggable={Boolean(source.url)}
                  onDragStart={event => handleSourceDragStart(event, source)}
                  onDragEnd={handleSourceDragEnd}
                  onDoubleClick={() => insertSourceAtPlayhead(source)}
                  title="拖到下方时间轴插入，双击插入到播放头"
                >
                  <div className="video-editor-source-preview">
                    {source.type === 'video'
                      ? <video src={source.url} muted playsInline preload="metadata" draggable={false} onLoadedMetadata={event => handleSourceVideoMetadata(source, event)} />
                      : <img src={source.url} alt={source.name || '素材'} draggable={false} onLoad={event => handleSourceImageLoad(source, event)} />}
                    {isSourceAdded && <span className="source-added-badge">已添加</span>}
                  </div>
                  <div className="video-editor-source-meta">
                    <div className="source-title-row">
                      <strong>{source.name}</strong>
                      <span className="source-inline-detail">{sourceMeta.detail}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </aside>

          <div
            className={`video-editor-layout-resizer vertical ${layoutResize?.target === 'library' ? 'active' : ''}`}
            role="separator"
            aria-label="调整素材区宽度"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={event => startLayoutResize(event, 'library')}
          />

          <section className="video-editor-preview-column">
            <div
              ref={previewRef}
              className="video-editor-preview-stage"
              style={{
                aspectRatio: `${draft.canvas.width} / ${draft.canvas.height}`,
                '--video-editor-canvas-ratio': canvasAspectRatio,
              }}
            >
              <div className="video-editor-canvas-badge">
                {formatAspectRatioLabel(canvasAspectRatio)} · {draft.canvas.width}×{draft.canvas.height}
              </div>
              {selectedClip && (
                <>
                  <div className={`video-editor-guide vertical ${previewGuideState?.centerX ? 'visible' : ''}`} />
                  <div className={`video-editor-guide horizontal ${previewGuideState?.centerY ? 'visible' : ''}`} />
                  <div className={`video-editor-guide edge left ${previewGuideState?.left ? 'visible' : ''}`} />
                  <div className={`video-editor-guide edge right ${previewGuideState?.right ? 'visible' : ''}`} />
                  <div className={`video-editor-guide edge top ${previewGuideState?.top ? 'visible' : ''}`} />
                  <div className={`video-editor-guide edge bottom ${previewGuideState?.bottom ? 'visible' : ''}`} />
                </>
              )}
              {selectedClip ? (
                <div
                  className={`video-editor-preview-media ${dragState?.mode?.startsWith('preview') ? 'editing' : ''}`}
                  style={{
                    left: `${selectedClip.transform.x}%`,
                    top: `${selectedClip.transform.y}%`,
                    aspectRatio: `${getClipMediaAspectRatio(selectedClip)}`,
                    opacity: selectedClip.transform.opacity,
                    transform: `translate3d(-50%, -50%, 0) scale(${selectedClip.transform.scale}) rotate(${selectedClip.transform.rotate}deg)`,
                  }}
                  onPointerDown={startPreviewDrag}
                  draggable={false}
                  onDragStart={event => event.preventDefault()}
                >
                  {selectedClip.type === 'video'
                      ? <video
                        ref={previewVideoRef}
                        src={selectedClip.sourceUrl}
                        muted
                        playsInline
                        preload="metadata"
                        disablePictureInPicture
                        tabIndex={-1}
                        onLoadedMetadata={event => {
                          const video = event.currentTarget;
                          const { videoWidth, videoHeight } = video;
                          if (videoWidth > 0 && videoHeight > 0) {
                            rememberSourceMetadata(
                              { id: selectedClip.sourceId },
                              {
                                aspectRatio: videoWidth / videoHeight,
                                duration: video.duration,
                              },
                            );
                          }
                          const playbackState = getTimelinePlaybackState(draft.clips, playheadTime);
                          if (playbackState?.clip.id === selectedClip.id) {
                            video.currentTime = Math.min(
                              playbackState.mediaTime,
                              Math.max(0, video.duration - 0.05),
                            );
                          }
                        }}
                      />
                    : <img
                        src={selectedClip.sourceUrl}
                        alt={selectedClip.name}
                        onLoad={event => {
                          const { naturalWidth, naturalHeight } = event.currentTarget;
                          if (naturalWidth > 0 && naturalHeight > 0) {
                            rememberSourceMetadata(
                              { id: selectedClip.sourceId },
                              { aspectRatio: naturalWidth / naturalHeight },
                            );
                          }
                        }}
                  />}
                  <span className="video-editor-selection-box" aria-hidden="true" />
                  <span className="preview-handle scale top-left" onPointerDown={startPreviewScale} />
                  <span className="preview-handle scale top-right" onPointerDown={startPreviewScale} />
                  <span className="preview-handle scale bottom-left" onPointerDown={startPreviewScale} />
                  <span className="preview-handle scale bottom-right" onPointerDown={startPreviewScale} />
                  <span className="preview-handle rotate" onPointerDown={startPreviewRotate} />
                </div>
              ) : (
                <div className="video-editor-preview-empty">选择一个时间轴片段进行预览</div>
              )}
            </div>
            <div
              className="video-editor-canvas-settings-control"
              onPointerDown={event => event.stopPropagation()}
            >
              <button
                type="button"
                className={`video-editor-canvas-settings-trigger ${canvasSettingsOpen ? 'active' : ''}`}
                onClick={() => setCanvasSettingsOpen(open => !open)}
                aria-expanded={canvasSettingsOpen}
                aria-label="画布比例和分辨率"
              >
                <span>{formatAspectRatioLabel(canvasAspectRatio)}</span>
                <strong>{draft.canvas.resolution || '720p'}</strong>
              </button>
              {canvasSettingsOpen && (
                <div className="video-editor-canvas-settings-popover">
                  <div className="video-editor-section-heading">
                    <strong>画布</strong>
                    <span>{draft.canvas.width}×{draft.canvas.height}</span>
                  </div>
                  <div className="video-editor-preset-grid aspect-ratios">
                    {VIDEO_EDITOR_ASPECT_RATIO_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        className={draft.canvas.aspectRatio === preset.value ? 'active' : ''}
                        onClick={() => updateCanvasSettings({ aspectRatio: preset.value })}
                        aria-pressed={draft.canvas.aspectRatio === preset.value}
                      >
                        <strong>{preset.label}</strong>
                        <span>{preset.description}</span>
                      </button>
                    ))}
                  </div>
                  <div className="video-editor-resolution-options" aria-label="分辨率">
                    <span>分辨率</span>
                    <div>
                      {VIDEO_EDITOR_RESOLUTION_PRESETS.map(preset => (
                        <button
                          key={preset.value}
                          type="button"
                          className={(draft.canvas.resolution || '720p') === preset.value ? 'active' : ''}
                          onClick={() => updateCanvasSettings({ resolution: preset.value })}
                          aria-pressed={(draft.canvas.resolution || '720p') === preset.value}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div
            className={`video-editor-layout-resizer vertical ${layoutResize?.target === 'inspector' ? 'active' : ''}`}
            role="separator"
            aria-label="调整编辑区宽度"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={event => startLayoutResize(event, 'inspector')}
          />

          <aside className="video-editor-inspector">
            <div className="video-editor-panel-title">编辑</div>
            {selectedClip ? (
              <>
                <div className="video-editor-quick-actions">
                  <button type="button" onClick={centerSelectedClip}>居中</button>
                  <button type="button" onClick={fitSelectedClip}>适配</button>
                  <button type="button" onClick={fillSelectedClip}>填充</button>
                  <button type="button" onClick={resetSelectedClip}>重置</button>
                </div>
                <label>
                  <span>开始</span>
                  <input type="number" value={selectedClip.start.toFixed(1)} readOnly title="主轨会自动连续排列，拖动片段可调整顺序" />
                </label>
                <label>
                  <span>时长</span>
                  <input type="number" min="0.5" step="0.1" value={selectedClip.duration} onChange={event => updateSelectedDuration(event.target.value)} />
                </label>
                <label>
                  <span>缩放 {selectedClip.transform.scale.toFixed(2)}</span>
                  <input type="range" min="0.2" max="8" step="0.05" value={selectedClip.transform.scale} onChange={event => updateClip(selectedClip.id, { transform: { scale: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>透明度 {Math.round(selectedClip.transform.opacity * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.05" value={selectedClip.transform.opacity} onChange={event => updateClip(selectedClip.id, { transform: { opacity: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>旋转 {Math.round(selectedClip.transform.rotate)}°</span>
                  <input type="range" min="-180" max="180" step="1" value={selectedClip.transform.rotate} onChange={event => updateClip(selectedClip.id, { transform: { rotate: Number(event.target.value) } })} />
                </label>
                <div className="video-editor-position-grid">
                  <label>
                    <span>X</span>
                    <input type="number" min="0" max="100" step="1" value={Math.round(selectedClip.transform.x)} onChange={event => updateClip(selectedClip.id, { transform: { x: Number(event.target.value) } })} />
                  </label>
                  <label>
                    <span>Y</span>
                    <input type="number" min="0" max="100" step="1" value={Math.round(selectedClip.transform.y)} onChange={event => updateClip(selectedClip.id, { transform: { y: Number(event.target.value) } })} />
                  </label>
                </div>
              </>
            ) : (
              <div className="video-editor-empty">选中时间轴片段后可调整位置、大小、透明度和旋转</div>
            )}
          </aside>
        </main>

        <footer className="video-editor-timeline">
          <div
            className={`video-editor-layout-resizer horizontal ${layoutResize?.target === 'timeline' ? 'active' : ''}`}
            role="separator"
            aria-label="调整时间轴高度"
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={event => startLayoutResize(event, 'timeline')}
          />
          <div className="video-editor-timeline-toolbar">
            <div className="video-editor-tool-group timeline-edit-tools" aria-label="时间轴编辑工具">
              <button
                type="button"
                disabled={!selectedClip}
                onClick={splitSelectedClip}
                title="切割片段"
              >
                <Icon name="split" size={16} />
              </button>
              <button type="button" disabled={!selectedClip} onClick={duplicateSelectedClip} title="复制片段">
                <Icon name="copy" size={16} />
              </button>
              <button type="button" disabled={!selectedClip} onClick={removeSelectedClip} title="删除片段">
                <Icon name="trash" size={16} />
              </button>
            </div>
            <div className="video-editor-playback-tools" aria-label="播放控制">
              <span>{formatTimelineClock(playheadTime)}</span>
              <button
                type="button"
                className="video-editor-play-toggle"
                disabled={draft.clips.length === 0}
                onClick={toggleTimelinePlayback}
                title={isPlaying ? '暂停' : '播放'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
              </button>
              <span>{formatTimelineClock(timelineDuration)}</span>
            </div>
            <div className="video-editor-tool-group timeline-view-tools" aria-label="时间轴视图工具">
              <button type="button" className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled(value => !value)} title="吸附开关">
                <Icon name="magnet" size={16} />
              </button>
              <button
                type="button"
                onClick={() => changeTimelineZoom(-getTimelineZoomStep(pxPerSecond))}
                disabled={pxPerSecond <= minTimelineZoom}
                title="缩小时间轴"
              >
                <Icon name="zoomOut" size={16} />
              </button>
              <label className="video-editor-zoom" title="时间轴缩放">
                <input
                  type="range"
                  min={minTimelineZoom}
                  max={MAX_TIMELINE_ZOOM}
                  step="1"
                  value={pxPerSecond}
                  onChange={event => setPxPerSecond(clamp(Number(event.target.value), minTimelineZoom, MAX_TIMELINE_ZOOM))}
                />
              </label>
              <button
                type="button"
                onClick={() => changeTimelineZoom(getTimelineZoomStep(pxPerSecond))}
                disabled={pxPerSecond >= MAX_TIMELINE_ZOOM}
                title="放大时间轴"
              >
                <Icon name="zoomIn" size={16} />
              </button>
              <button type="button" onClick={fitTimelineZoom} title="适配时间轴">
                <Icon name="fullscreen" size={16} />
              </button>
            </div>
          </div>
          <div
            ref={timelineRef}
            className={`video-editor-track-scroll ${sourceDrag ? 'source-drag-active' : ''} ${dragPreview?.mode === 'source-insert' ? 'source-drag-over' : ''}`}
            onPointerDown={setPlayheadFromEvent}
            onWheel={handleTimelineWheel}
            onDragOver={handleTimelineDragOver}
            onDragLeave={handleTimelineDragLeave}
            onDrop={handleTimelineDrop}
          >
            <div
              className={`video-editor-track density-${timelineDensity}`}
              style={{
                width: timelineWidth,
                height: timelineTrackHeight,
                '--timeline-second-width': `${Math.max(4, pxPerSecond)}px`,
                '--timeline-frame-width': `${Math.max(2, pxPerSecond / TIMELINE_FRAME_RATE)}px`,
              }}
            >
              <div className="video-editor-track-rows">
                {timelineTracks.map((track, trackIndex) => (
                  <div
                    key={track.id}
                    className={`video-editor-track-row ${track.type}`}
                    style={{ top: 42 + trackIndex * 82 }}
                  >
                    <span className="video-editor-track-row-label">
                      <Icon name={VIDEO_EDITOR_TRACK_ICON[track.type] || 'layers'} size={14} />
                      <span>{VIDEO_EDITOR_TRACK_LABEL[track.type] || track.label}</span>
                    </span>
                    <span className="video-editor-track-row-controls">
                      <button type="button" aria-label={`${VIDEO_EDITOR_TRACK_LABEL[track.type] || track.label}显示控制`} title="显示控制" onClick={event => event.stopPropagation()}>
                        <Icon name="eye" size={13} />
                      </button>
                      <button type="button" aria-label={`${VIDEO_EDITOR_TRACK_LABEL[track.type] || track.label}声音控制`} title="声音控制" onClick={event => event.stopPropagation()}>
                        <Icon name="volume" size={13} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="video-editor-ruler-marks" aria-hidden="true">
                {timelineTicks.map(tick => (
                  <span
                    key={`${tick.time}-${tick.kind}`}
                    className={tick.kind}
                    style={{ left: getTimelineX(tick.time) }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
              {dragPreview?.snapPoint != null && (
                <div className="video-editor-snap-line" style={{ left: getTimelineX(dragPreview.snapPoint) }} aria-hidden="true" />
              )}
              <div
                className={`video-editor-playhead ${isPlaying ? 'playing' : ''}`}
                style={{ left: getTimelineX(playheadTime) }}
                onPointerDown={startPlayheadDrag}
                aria-label="拖动播放头"
                role="slider"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalDuration * 10) / 10}
                aria-valuenow={Math.round(playheadTime * 10) / 10}
              >
                <span className="playhead-grip" />
                <span className={`playhead-time ${dragState?.mode === 'playhead' ? 'visible' : ''}`}>{formatSeconds(playheadTime)}</span>
              </div>
              {dragPreview && (
                <div
                  className={`video-editor-clip-ghost ${dragPreview.mode || ''} ${dragPreview.snapPoint != null ? 'snapped' : ''}`}
                  style={{
                    left: getTimelineX(dragPreview.start),
                    width: Math.max(46, dragPreview.duration * pxPerSecond),
                    top: getTrackClipTop(dragPreview.type),
                  }}
                  aria-hidden="true"
                />
              )}
              {(dragPreview?.mode === 'move' || dragPreview?.mode === 'source-insert') && (
                <div
                  className={`video-editor-insertion-marker ${dragPreview.mode}`}
                  style={{ left: getTimelineX(dragPreview.start) }}
                  aria-hidden="true"
                >
                  <span />
                </div>
              )}
              {dragPreview && (
                <div
                  className={`video-editor-time-tooltip ${dragPreview.mode}`}
                  style={{ left: getTimelineX(dragPreview.start) }}
                  aria-hidden="true"
                >
                  {dragPreview.mode === 'move'
                    ? `插入 ${formatSeconds(dragPreview.start)}`
                    : dragPreview.mode === 'source-insert'
                      ? `放下插入 · ${formatSeconds(dragPreview.duration)}`
                    : `${formatSeconds(dragPreview.start)} - ${formatSeconds(dragPreview.start + dragPreview.duration)} · ${formatSeconds(dragPreview.duration)}`}
                </div>
              )}
              {timelineTracks.flatMap(track => track.clips.map((clip) => {
                  const timelineFrames = getClipTimelineFrames(clip);
                  const isTimelineDrag = dragState?.clipId === clip.id
                    && ['move', 'trim-start', 'trim-end'].includes(dragState.mode);
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={`video-editor-clip ${clip.type} ${clip.id === selectedClipId ? 'selected' : ''} ${isTimelineDrag ? 'dragging' : ''} ${isTimelineDrag && dragState.mode?.startsWith('trim') ? 'trimming' : ''} ${clip.duration * pxPerSecond < 92 ? 'short' : ''}`}
                      style={{
                        left: getTimelineX(clip.start),
                        top: getTrackClipTop(clip.type),
                        width: Math.max(46, clip.duration * pxPerSecond),
                      }}
                      onPointerDown={event => startTimelineDrag(event, clip, 'move')}
                      onContextMenu={event => openTimelineClipMenu(event, clip)}
                    >
                      <span className="clip-handle left" onPointerDown={event => startTimelineDrag(event, clip, 'trim-start')} />
                      <span className={`clip-media ${clip.type}`}>
                        {clip.type === 'video' && !timelineFrames.length ? (
                          <video
                            className="clip-cover-video"
                            src={clip.sourceUrl}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : null}
                        {clip.type === 'audio' ? (
                          <span className="clip-audio-bars" aria-hidden="true">
                            {Array.from({ length: 28 }, (_, index) => (
                              <i key={`${clip.id}-audio-bar-${index}`} style={{ '--bar-scale': 0.32 + ((index * 7) % 11) / 16 }} />
                            ))}
                          </span>
                        ) : (
                          <span
                            className="clip-filmstrip"
                            style={{ '--clip-frame-count': Math.max(1, timelineFrames.length) }}
                          >
                            {timelineFrames.map((frameUrl, frameIndex) => (
                              <span
                                key={`${clip.id}-frame-${frameIndex}`}
                                className="clip-frame"
                                style={frameUrl ? { backgroundImage: `url(${JSON.stringify(frameUrl)})` } : undefined}
                              />
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="clip-content">
                        <span className="clip-name">{clip.name}</span>
                        <small>{VIDEO_EDITOR_TRACK_LABEL[clip.type] || '素材'} · {formatTimelineClock(clip.duration)}</small>
                      </span>
                      <span className={`clip-accent ${clip.type}`} />
                      <span className="clip-handle right" onPointerDown={event => startTimelineDrag(event, clip, 'trim-end')} />
                    </button>
                  );
                }))}
            </div>
          </div>
        </footer>
        {contextMenu && (
          <div
            className="video-editor-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={event => event.stopPropagation()}
          >
            <button type="button" onClick={splitSelectedClip}>切割</button>
            <button type="button" onClick={duplicateSelectedClip}>复制</button>
            <button type="button" onClick={moveSelectedClipToPlayhead}>移到播放头</button>
            <button type="button" className="danger" onClick={removeSelectedClip}>删除</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoEditorDialog;
