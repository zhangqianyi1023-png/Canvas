export const DEFAULT_VIDEO_EDITOR_CANVAS = {
  width: 1280,
  height: 720,
  aspectRatio: '16:9',
  resolution: '720p',
};

export const VIDEO_EDITOR_TRACK_DEFINITIONS = [
  { id: 'imageTrack', type: 'image', label: '图片轨' },
  { id: 'videoTrack', type: 'video', label: '视频轨' },
  { id: 'audioTrack', type: 'audio', label: '音频轨' },
];

export const VIDEO_EDITOR_ASPECT_RATIO_PRESETS = [
  { value: '16:9', label: '16:9', description: '横屏' },
  { value: '21:9', label: '21:9', description: '电影' },
  { value: '9:16', label: '9:16', description: '竖屏' },
  { value: '4:3', label: '4:3', description: '经典' },
  { value: '3:4', label: '3:4', description: '竖版' },
  { value: '1:1', label: '1:1', description: '方形' },
];

export const VIDEO_EDITOR_RESOLUTION_PRESETS = [
  { value: '480p', label: '480p', width: 854, height: 480 },
  { value: '720p', label: '720p', width: 1280, height: 720 },
  { value: '1080p', label: '1080p', width: 1920, height: 1080 },
  { value: '2k', label: '2K', width: 2560, height: 1440 },
  { value: '3k', label: '3K', width: 3200, height: 1800 },
  { value: '4k', label: '4K', width: 3840, height: 2160 },
];

export const normalizeAspectRatioNumber = (value, fallback = 16 / 9) => {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) return width / height;
    }
  }
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return next;
};

export const formatAspectRatioLabel = (aspectRatio) => {
  const ratio = normalizeAspectRatioNumber(aspectRatio);
  const knownRatios = [
    { value: 16 / 9, label: '16:9' },
    { value: 21 / 9, label: '21:9' },
    { value: 9 / 16, label: '9:16' },
    { value: 4 / 3, label: '4:3' },
    { value: 3 / 4, label: '3:4' },
    { value: 1, label: '1:1' },
  ];
  const known = knownRatios.find(item => Math.abs(item.value - ratio) < 0.02);
  if (known) return known.label;
  return `${ratio.toFixed(2)}:1`;
};

const roundToEven = (value) => {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

export const getVideoEditorResolutionPreset = (resolution) => {
  const canonical = String(resolution ?? '').trim().toLowerCase();
  return (
    VIDEO_EDITOR_RESOLUTION_PRESETS.find(item => item.value === canonical)
    || VIDEO_EDITOR_RESOLUTION_PRESETS.find(item => item.value === DEFAULT_VIDEO_EDITOR_CANVAS.resolution)
    || VIDEO_EDITOR_RESOLUTION_PRESETS[1]
  );
};

export const createVideoEditorCanvasFromAspectRatio = (aspectRatio, resolution = DEFAULT_VIDEO_EDITOR_CANVAS.resolution) => {
  const ratio = normalizeAspectRatioNumber(aspectRatio);
  const preset = getVideoEditorResolutionPreset(resolution);
  const bounds = ratio >= 1
    ? { width: preset.width, height: preset.height }
    : { width: preset.height, height: preset.width };
  let width = bounds.width;
  let height = width / ratio;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * ratio;
  }
  return {
    width: roundToEven(width),
    height: roundToEven(height),
    aspectRatio: formatAspectRatioLabel(ratio),
    resolution: preset.value,
  };
};

export const getVideoEditorNodeSizeForAspectRatio = (aspectRatio, options = {}) => {
  const ratio = normalizeAspectRatioNumber(aspectRatio);
  const maxLongSide = normalizeTimelineNumber(options.maxLongSide, 300, 180, 520);
  const minShortSide = normalizeTimelineNumber(options.minShortSide, 96, 60, maxLongSide);
  const maxShortSide = normalizeTimelineNumber(options.maxShortSide, maxLongSide, minShortSide, maxLongSide);

  if (ratio >= 1) {
    return {
      width: Math.round(maxLongSide),
      height: Math.round(Math.min(maxShortSide, Math.max(minShortSide, maxLongSide / ratio))),
    };
  }

  return {
    width: Math.round(Math.min(maxShortSide, Math.max(minShortSide, maxLongSide * ratio))),
    height: Math.round(maxLongSide),
  };
};

export const createEmptyVideoEditorTimeline = () => ({
  version: 1,
  canvas: { ...DEFAULT_VIDEO_EDITOR_CANVAS },
  clips: [],
  tracks: VIDEO_EDITOR_TRACK_DEFINITIONS.map(track => ({ ...track, clips: [] })),
});

export const normalizeTimelineNumber = (value, fallback, min = -Infinity, max = Infinity) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

export const MIN_VIDEO_EDITOR_CLIP_DURATION = 0.5;
export const DEFAULT_TIMELINE_SNAP_THRESHOLD = 0.12;
export const DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO = 0.58;
export const MIN_AUDIO_PLAYBACK_RATE = 0.5;
export const MAX_AUDIO_PLAYBACK_RATE = 3;
export const DEFAULT_VIDEO_EDITOR_FRAME_RATE = 30;

export const timeToVideoEditorFrame = (time, frameRate = DEFAULT_VIDEO_EDITOR_FRAME_RATE) => {
  const safeFrameRate = normalizeTimelineNumber(frameRate, DEFAULT_VIDEO_EDITOR_FRAME_RATE, 1, 240);
  return Math.max(0, Math.round(normalizeTimelineNumber(time, 0, 0) * safeFrameRate));
};

export const frameToVideoEditorTime = (frame, frameRate = DEFAULT_VIDEO_EDITOR_FRAME_RATE) => {
  const safeFrameRate = normalizeTimelineNumber(frameRate, DEFAULT_VIDEO_EDITOR_FRAME_RATE, 1, 240);
  return Math.max(0, Math.round(normalizeTimelineNumber(frame, 0, 0) / safeFrameRate * 1000) / 1000);
};

export const snapVideoEditorTimeToFrame = (time, frameRate = DEFAULT_VIDEO_EDITOR_FRAME_RATE) => (
  frameToVideoEditorTime(timeToVideoEditorFrame(time, frameRate), frameRate)
);

export const formatVideoEditorFrameClock = (time, frameRate = DEFAULT_VIDEO_EDITOR_FRAME_RATE) => {
  const safeFrameRate = normalizeTimelineNumber(frameRate, DEFAULT_VIDEO_EDITOR_FRAME_RATE, 1, 240);
  const totalFrames = timeToVideoEditorFrame(time, safeFrameRate);
  const frames = totalFrames % safeFrameRate;
  const totalSeconds = Math.floor(totalFrames / safeFrameRate);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};

export const getClipSourceDuration = (clip) => (
  normalizeTimelineNumber(
    clip?.sourceDuration ?? clip?.mediaDuration ?? clip?.originalDuration,
    0,
    0,
    24 * 60 * 60,
  )
);

export const getClipMaxDuration = (clip, inPoint = clip?.inPoint) => {
  const sourceDuration = getClipSourceDuration(clip);
  if ((clip?.type !== 'video' && clip?.type !== 'audio') || sourceDuration <= 0) return 300;
  const safeInPoint = normalizeTimelineNumber(inPoint, 0, 0, sourceDuration);
  const availableDuration = sourceDuration - safeInPoint;
  if (clip?.type === 'video' || clip?.type === 'audio') {
    const playbackRate = normalizeTimelineNumber(clip.playbackRate, 1, MIN_AUDIO_PLAYBACK_RATE, MAX_AUDIO_PLAYBACK_RATE);
    return Math.max(MIN_VIDEO_EDITOR_CLIP_DURATION, availableDuration / playbackRate);
  }
  return Math.max(MIN_VIDEO_EDITOR_CLIP_DURATION, availableDuration);
};

export const getAspectFillScale = (
  mediaAspectRatio,
  canvasAspectRatio,
  baseWidthRatio = DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO,
) => {
  const mediaRatio = normalizeAspectRatioNumber(mediaAspectRatio, 1);
  const canvasRatio = normalizeAspectRatioNumber(canvasAspectRatio, 1);
  const baseRatio = normalizeTimelineNumber(baseWidthRatio, DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO, 0.01, 1);
  return Math.max(
    1 / baseRatio,
    mediaRatio / (baseRatio * canvasRatio),
  ) * 1.01;
};

export const getAspectFitScale = (
  mediaAspectRatio,
  canvasAspectRatio,
  baseWidthRatio = DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO,
) => {
  const mediaRatio = normalizeAspectRatioNumber(mediaAspectRatio, 1);
  const canvasRatio = normalizeAspectRatioNumber(canvasAspectRatio, 1);
  const baseRatio = normalizeTimelineNumber(baseWidthRatio, DEFAULT_PREVIEW_MEDIA_WIDTH_RATIO, 0.01, 1);
  return Math.min(
    1 / baseRatio,
    mediaRatio / (baseRatio * canvasRatio),
  );
};

export const normalizeVideoEditorTimeline = (timeline) => {
  const base = createEmptyVideoEditorTimeline();
  const canvas = {
    ...base.canvas,
    ...(timeline?.canvas || {}),
  };
  const normalizedCanvas = {
    ...canvas,
    width: roundToEven(normalizeTimelineNumber(canvas.width, base.canvas.width, 320, 3840)),
    height: roundToEven(normalizeTimelineNumber(canvas.height, base.canvas.height, 240, 3840)),
  };
  normalizedCanvas.aspectRatio = canvas.aspectRatio || formatAspectRatioLabel(normalizedCanvas.width / normalizedCanvas.height);
  normalizedCanvas.resolution = getVideoEditorResolutionPreset(canvas.resolution).value;
  const trackClips = Array.isArray(timeline?.tracks)
    ? timeline.tracks.flatMap(track => (Array.isArray(track?.clips) ? track.clips : []))
    : [];
  const clips = Array.isArray(timeline?.clips) && timeline.clips.length > 0
    ? timeline.clips
    : trackClips;
  const normalizedClips = clips.map((clip, index) => {
    const type = clip.type === 'video' ? 'video' : clip.type === 'audio' ? 'audio' : 'image';
    const sourceDuration = getClipSourceDuration({ ...clip, type });
    const inPoint = normalizeTimelineNumber(clip.inPoint, 0, 0, sourceDuration || 300);
    const playbackRate = normalizeTimelineNumber(clip.playbackRate ?? clip.speed, 1, MIN_AUDIO_PLAYBACK_RATE, MAX_AUDIO_PLAYBACK_RATE);
    const maxDuration = getClipMaxDuration({ ...clip, type, sourceDuration, playbackRate }, inPoint);
    const fallbackDuration = type === 'audio'
      ? maxDuration
      : type === 'video'
        ? (sourceDuration || 4)
        : 3;
    return {
      id: clip.id || `clip_${index}`,
      sourceId: clip.sourceId || '',
      sourceUrl: clip.sourceUrl || clip.url || '',
      type,
      name: clip.name || `素材 ${index + 1}`,
      start: normalizeTimelineNumber(clip.start, 0, 0),
      duration: normalizeTimelineNumber(clip.duration, fallbackDuration, MIN_VIDEO_EDITOR_CLIP_DURATION, maxDuration),
      inPoint,
      sourceDuration: sourceDuration || undefined,
      playbackRate,
      volume: normalizeTimelineNumber(clip.volume, 1, 0, 2),
      fadeIn: normalizeTimelineNumber(clip.fadeIn, 0, 0, 10),
      fadeOut: normalizeTimelineNumber(clip.fadeOut, 0, 0, 10),
      aspectRatio: clip.aspectRatio ? normalizeAspectRatioNumber(clip.aspectRatio) : undefined,
      transform: {
        x: normalizeTimelineNumber(clip.transform?.x, 50, 0, 100),
        y: normalizeTimelineNumber(clip.transform?.y, 50, 0, 100),
        scale: normalizeTimelineNumber(clip.transform?.scale, 1, 0.1, 8),
        rotate: normalizeTimelineNumber(clip.transform?.rotate, 0, -180, 180),
        opacity: normalizeTimelineNumber(clip.transform?.opacity, 1, 0, 1),
      },
    };
  });
  return {
    version: 1,
    canvas: normalizedCanvas,
    clips: normalizedClips,
    tracks: createVideoEditorTracks(normalizedClips),
  };
};

export const createVideoEditorTracks = (clips = []) => (
  VIDEO_EDITOR_TRACK_DEFINITIONS.map(track => ({
    ...track,
    clips: (clips || [])
      .filter(clip => clip?.type === track.type)
      .sort((a, b) => normalizeTimelineNumber(a.start, 0, 0) - normalizeTimelineNumber(b.start, 0, 0)),
  }))
);

export const syncVideoEditorTimelineTracks = (timeline) => ({
  ...timeline,
  tracks: createVideoEditorTracks(timeline?.clips || []),
});

export const getTimelineDuration = (clips) => (
  (clips || []).reduce((max, clip) => Math.max(max, (clip.start || 0) + (clip.duration || 0)), 0)
);

export const sortTimelineClips = (clips = []) => (
  clips
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => {
      const timeDelta = normalizeTimelineNumber(left.clip?.start, 0, 0)
        - normalizeTimelineNumber(right.clip?.start, 0, 0);
      return timeDelta || left.index - right.index;
    })
    .map(item => item.clip)
);

const layoutTimelineClipsInOrder = (clips = []) => {
  let cursor = 0;
  return clips.map((clip) => {
    const duration = normalizeTimelineNumber(
      clip?.duration,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      300,
    );
    const compacted = {
      ...clip,
      start: cursor,
      duration,
    };
    cursor += duration;
    return compacted;
  });
};

export const compactTimelineClips = (clips = []) => (
  layoutTimelineClipsInOrder(sortTimelineClips(clips))
);

export const findClipAtTime = (clips = [], time = 0) => {
  const target = normalizeTimelineNumber(time, 0, 0);
  const sorted = sortTimelineClips(clips);
  return sorted.find((clip, index) => {
    const start = normalizeTimelineNumber(clip?.start, 0, 0);
    const end = start + normalizeTimelineNumber(clip?.duration, 0, 0);
    const isLast = index === sorted.length - 1;
    return target >= start && (target < end || (isLast && target === end));
  }) || null;
};

export const getTimelinePlaybackState = (clips = [], time = 0) => {
  const timelineTime = normalizeTimelineNumber(time, 0, 0);
  const clip = findClipAtTime(clips, timelineTime);
  if (!clip) return null;
  const clipOffset = Math.min(
    normalizeTimelineNumber(clip.duration, 0, 0),
    Math.max(0, timelineTime - normalizeTimelineNumber(clip.start, 0, 0)),
  );
  return {
    clip,
    clipOffset,
    mediaTime: normalizeTimelineNumber(clip.inPoint, 0, 0) + (
      clip?.type === 'video' || clip?.type === 'audio'
        ? clipOffset * normalizeTimelineNumber(clip.playbackRate, 1, MIN_AUDIO_PLAYBACK_RATE, MAX_AUDIO_PLAYBACK_RATE)
        : clipOffset
    ),
  };
};

const VIDEO_EDITOR_LAYER_ORDER = {
  video: 0,
  image: 1,
  audio: 2,
};

export const getTimelineActiveClips = (clips = [], time = 0) => {
  const timelineTime = normalizeTimelineNumber(time, 0, 0);
  return (clips || [])
    .filter((clip) => {
      const start = normalizeTimelineNumber(clip?.start, 0, 0);
      const duration = normalizeTimelineNumber(clip?.duration, 0, 0);
      if (duration <= 0) return false;
      return timelineTime >= start && timelineTime < start + duration;
    })
    .sort((left, right) => {
      const layerDelta = (VIDEO_EDITOR_LAYER_ORDER[left?.type] ?? 10) - (VIDEO_EDITOR_LAYER_ORDER[right?.type] ?? 10);
      if (layerDelta) return layerDelta;
      return normalizeTimelineNumber(left?.start, 0, 0) - normalizeTimelineNumber(right?.start, 0, 0);
    });
};

export const createClipFromSource = (source, start = 0, options = {}) => {
  const type = source.type === 'video' ? 'video' : source.type === 'audio' ? 'audio' : 'image';
  const sourceDuration = getClipSourceDuration({ ...source, type });
  const sourceAspectRatio = source.aspectRatio ? normalizeAspectRatioNumber(source.aspectRatio) : undefined;
  const canvasAspectRatio = options.canvasAspectRatio
    ? normalizeAspectRatioNumber(options.canvasAspectRatio)
    : undefined;
  const defaultScale = type === 'video' && options.defaultFit === 'fill'
    ? getAspectFillScale(sourceAspectRatio || canvasAspectRatio || 1, canvasAspectRatio || sourceAspectRatio || 1)
    : 1;
  return {
    id: `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sourceId: source.id || '',
    sourceUrl: source.url,
    type,
    name: source.name || (type === 'video' ? '视频素材' : type === 'audio' ? '音频素材' : '图片素材'),
    start,
    duration: type === 'video' || type === 'audio' ? (sourceDuration || 4) : 3,
    inPoint: 0,
    sourceDuration: sourceDuration || undefined,
    playbackRate: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    aspectRatio: sourceAspectRatio,
    transform: {
      x: 50,
      y: 50,
      scale: defaultScale,
      rotate: 0,
      opacity: 1,
    },
  };
};

export const createStoryboardVideoEditorTimeline = (cards = [], options = {}) => {
  const orderedCards = Array.isArray(cards) ? cards : [];
  const canvas = createVideoEditorCanvasFromAspectRatio(options.aspectRatio || '9:16', options.resolution || '720p');
  const clips = compactTimelineClips(orderedCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card?.videoUrl)
    .map(({ card, index }) => (
      createClipFromSource({
        id: card.id || card.shotNo || `storyboard_shot_${index + 1}`,
        url: card.videoUrl,
        type: 'video',
        name: card.shotNo
          ? `${card.shotNo} ${card.cameraMovement || `分镜 ${index + 1}`}`
          : `分镜 ${index + 1}`,
        sourceDuration: card.videoDurationSeconds || card.durationSeconds,
        aspectRatio: card.aspectRatio || options.aspectRatio,
      }, index * 5, { canvasAspectRatio: canvas.aspectRatio, defaultFit: 'fill' })
    )));

  return {
    version: 1,
    canvas,
    clips,
    tracks: createVideoEditorTracks(clips),
  };
};

export const formatSeconds = (value) => {
  const seconds = Math.max(0, Number(value) || 0);
  return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
};

export const createTimelineScale = ({ pxPerSecond, scrollLeft = 0, gutter = 16 } = {}) => {
  const scale = normalizeTimelineNumber(pxPerSecond, 88, 1);
  return {
    timeToPx: (time) => normalizeTimelineNumber(time, 0, 0) * scale,
    pxToTime: (px) => Math.max(0, (normalizeTimelineNumber(px, 0) + scrollLeft - gutter) / scale),
  };
};

export const collectTimelineSnapPoints = (clips = [], { excludeClipId = '', playheadTime = 0 } = {}) => {
  const points = [0, normalizeTimelineNumber(playheadTime, 0, 0)];
  clips.forEach((clip) => {
    if (!clip || clip.id === excludeClipId) return;
    const start = normalizeTimelineNumber(clip.start, 0, 0);
    const end = start + normalizeTimelineNumber(clip.duration, 0, 0);
    points.push(start, end);
  });
  return [...new Set(points.map(point => Number(point.toFixed(3))))].sort((a, b) => a - b);
};

export const snapTimelineTime = (time, snapPoints = [], { enabled = true, threshold = DEFAULT_TIMELINE_SNAP_THRESHOLD } = {}) => {
  const nextTime = normalizeTimelineNumber(time, 0, 0);
  if (!enabled) return { time: nextTime, snappedTo: null };
  const nearest = snapPoints.reduce((best, point) => {
    const distance = Math.abs(point - nextTime);
    if (!best || distance < best.distance) return { point, distance };
    return best;
  }, null);
  if (!nearest || nearest.distance > threshold) {
    return { time: nextTime, snappedTo: null };
  }
  return { time: Math.max(0, nearest.point), snappedTo: nearest.point };
};

export const moveClipWithSnap = (clip, clips, nextStart, options = {}) => {
  const duration = normalizeTimelineNumber(clip?.duration, MIN_VIDEO_EDITOR_CLIP_DURATION, MIN_VIDEO_EDITOR_CLIP_DURATION);
  const snapPoints = collectTimelineSnapPoints(clips, {
    excludeClipId: clip?.id,
    playheadTime: options.playheadTime,
  });
  const snappedStart = snapTimelineTime(nextStart, snapPoints, {
    enabled: options.snapEnabled,
    threshold: options.threshold,
  });
  return {
    start: snappedStart.time,
    duration,
    snapPoint: snappedStart.snappedTo,
  };
};

export const trimClipStartWithSnap = (clip, clips, nextStart, options = {}) => {
  const originalStart = normalizeTimelineNumber(clip?.start, 0, 0);
  const originalDuration = normalizeTimelineNumber(clip?.duration, MIN_VIDEO_EDITOR_CLIP_DURATION, MIN_VIDEO_EDITOR_CLIP_DURATION);
  const maxStart = originalStart + originalDuration - MIN_VIDEO_EDITOR_CLIP_DURATION;
  const snapPoints = collectTimelineSnapPoints(clips, {
    excludeClipId: clip?.id,
    playheadTime: options.playheadTime,
  });
  const snappedStart = snapTimelineTime(Math.min(maxStart, nextStart), snapPoints, {
    enabled: options.snapEnabled,
    threshold: options.threshold,
  });
  const start = Math.min(maxStart, snappedStart.time);
  const delta = start - originalStart;
  const inPoint = Math.max(0, normalizeTimelineNumber(clip?.inPoint, 0, 0) + delta);
  const maxDuration = getClipMaxDuration(clip, inPoint);
  return {
    start,
    duration: Math.min(maxDuration, Math.max(MIN_VIDEO_EDITOR_CLIP_DURATION, originalDuration - delta)),
    inPoint,
    snapPoint: snappedStart.snappedTo,
  };
};

export const trimClipEndWithSnap = (clip, clips, nextEnd, options = {}) => {
  const start = normalizeTimelineNumber(clip?.start, 0, 0);
  const minEnd = start + MIN_VIDEO_EDITOR_CLIP_DURATION;
  const maxDuration = getClipMaxDuration(clip);
  const maxEnd = start + maxDuration;
  const snapPoints = collectTimelineSnapPoints(clips, {
    excludeClipId: clip?.id,
    playheadTime: options.playheadTime,
  });
  const snappedEnd = snapTimelineTime(Math.min(maxEnd, Math.max(minEnd, nextEnd)), snapPoints, {
    enabled: options.snapEnabled,
    threshold: options.threshold,
  });
  const end = Math.min(maxEnd, Math.max(minEnd, snappedEnd.time));
  return {
    duration: Math.max(MIN_VIDEO_EDITOR_CLIP_DURATION, end - start),
    snapPoint: snappedEnd.snappedTo,
  };
};

export const splitClipAtTime = (clips = [], clipId, time) => {
  const splitTime = normalizeTimelineNumber(time, 0, 0);
  const clip = clips.find(item => item.id === clipId);
  if (!clip) return clips;
  const start = normalizeTimelineNumber(clip.start, 0, 0);
  const duration = normalizeTimelineNumber(clip.duration, MIN_VIDEO_EDITOR_CLIP_DURATION, MIN_VIDEO_EDITOR_CLIP_DURATION);
  const end = start + duration;
  if (splitTime <= start + MIN_VIDEO_EDITOR_CLIP_DURATION || splitTime >= end - MIN_VIDEO_EDITOR_CLIP_DURATION) {
    return clips;
  }
  const leftDuration = splitTime - start;
  const rightDuration = end - splitTime;
  const playbackRate = clip.type === 'video' || clip.type === 'audio'
    ? normalizeTimelineNumber(clip.playbackRate, 1, MIN_AUDIO_PLAYBACK_RATE, MAX_AUDIO_PLAYBACK_RATE)
    : 1;
  const rightClip = {
    ...clip,
    id: `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    start: splitTime,
    duration: rightDuration,
    inPoint: normalizeTimelineNumber(clip.inPoint, 0, 0) + leftDuration * playbackRate,
    name: `${clip.name} 片段`,
  };
  return clips.flatMap(item => (
    item.id === clipId
      ? [{ ...clip, duration: leftDuration }, rightClip]
      : [item]
  ));
};

export const duplicateClipAtTime = (clip, start) => {
  if (!clip) return null;
  return {
    ...clip,
    id: `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    start: normalizeTimelineNumber(start, clip.start || 0, 0),
    name: `${clip.name} 副本`,
  };
};

export const insertClipAtTime = (clips = [], clip, time = 0) => {
  if (!clip) {
    return {
      clips: compactTimelineClips(clips),
      insertedIndex: -1,
    };
  }
  const compacted = compactTimelineClips(clips);
  const timelineDuration = getTimelineDuration(compacted);
  const insertionTime = normalizeTimelineNumber(time, timelineDuration, 0, timelineDuration);
  const coveringIndex = compacted.findIndex((item) => {
    const start = normalizeTimelineNumber(item.start, 0, 0);
    const end = start + normalizeTimelineNumber(item.duration, 0, 0);
    return (
      insertionTime > start + MIN_VIDEO_EDITOR_CLIP_DURATION
      && insertionTime < end - MIN_VIDEO_EDITOR_CLIP_DURATION
    );
  });

  let nextClips = compacted;
  let insertionIndex;
  if (coveringIndex >= 0) {
    const coveringClip = compacted[coveringIndex];
    nextClips = splitClipAtTime(compacted, coveringClip.id, insertionTime);
    insertionIndex = nextClips.findIndex(item => item.id === coveringClip.id) + 1;
  } else {
    const containingIndex = compacted.findIndex((item) => {
      const start = normalizeTimelineNumber(item.start, 0, 0);
      const end = start + normalizeTimelineNumber(item.duration, 0, 0);
      return insertionTime > start && insertionTime < end;
    });
    if (containingIndex >= 0) {
      const containingClip = compacted[containingIndex];
      const start = normalizeTimelineNumber(containingClip.start, 0, 0);
      const end = start + normalizeTimelineNumber(containingClip.duration, 0, 0);
      insertionIndex = insertionTime - start <= end - insertionTime
        ? containingIndex
        : containingIndex + 1;
    } else {
      insertionIndex = nextClips.findIndex(item => (
        normalizeTimelineNumber(item.start, 0, 0) >= insertionTime
      ));
      if (insertionIndex < 0) insertionIndex = nextClips.length;
    }
  }

  const insertedClip = {
    ...clip,
    start: insertionTime,
    duration: normalizeTimelineNumber(
      clip.duration,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      getClipMaxDuration(clip),
    ),
  };
  const result = [...nextClips];
  result.splice(insertionIndex, 0, insertedClip);
  return {
    clips: layoutTimelineClipsInOrder(result),
    insertedIndex: insertionIndex,
  };
};

export const insertClipIntoLayeredTimeline = (clips = [], clip, time = 0) => {
  if (!clip) {
    return {
      clips,
      insertedIndex: -1,
    };
  }
  const insertionTime = normalizeTimelineNumber(time, getTimelineDuration(clips), 0);
  const nextClip = {
    ...clip,
    start: insertionTime,
    duration: normalizeTimelineNumber(
      clip.duration,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      MIN_VIDEO_EDITOR_CLIP_DURATION,
      getClipMaxDuration(clip),
    ),
  };
  if (nextClip.type === 'video') {
    const videoClips = (clips || []).filter(item => item?.type === 'video');
    const nonVideoClips = (clips || []).filter(item => item?.type !== 'video');
    const result = insertClipAtTime(videoClips, nextClip, insertionTime);
    return {
      ...result,
      clips: [...result.clips, ...nonVideoClips],
    };
  }
  return {
    clips: [...(clips || []), nextClip],
    insertedIndex: (clips || []).length,
  };
};

export const removeClipWithRipple = (clips = [], clipId) => (
  compactTimelineClips(clips.filter(clip => clip.id !== clipId))
);

export const removeClipFromLayeredTimeline = (clips = [], clipId) => {
  const clip = (clips || []).find(item => item?.id === clipId);
  if (!clip) return clips || [];
  if (clip.type === 'video') {
    const videoClips = (clips || []).filter(item => item?.type === 'video');
    const nonVideoClips = (clips || []).filter(item => item?.type !== 'video');
    return [...removeClipWithRipple(videoClips, clipId), ...nonVideoClips];
  }
  return (clips || []).filter(item => item?.id !== clipId);
};

export const reorderClipWithRipple = (clips = [], clipId, targetIndex = 0) => {
  const compacted = compactTimelineClips(clips);
  const currentIndex = compacted.findIndex(clip => clip.id === clipId);
  if (currentIndex < 0) return compacted;
  const [movingClip] = compacted.splice(currentIndex, 1);
  const nextIndex = Math.min(
    compacted.length,
    Math.max(0, Math.round(normalizeTimelineNumber(targetIndex, currentIndex))),
  );
  compacted.splice(nextIndex, 0, movingClip);
  return layoutTimelineClipsInOrder(compacted);
};

export const trimClipWithRipple = (clips = [], clipId, patch = {}) => (
  compactTimelineClips(
    clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const inPoint = normalizeTimelineNumber(patch.inPoint, clip.inPoint || 0, 0, getClipSourceDuration(clip) || 300);
      const nextClip = { ...clip, ...patch, inPoint };
      return {
        ...nextClip,
        duration: normalizeTimelineNumber(
          patch.duration,
          clip.duration,
          MIN_VIDEO_EDITOR_CLIP_DURATION,
          getClipMaxDuration(nextClip, inPoint),
        ),
      };
    }),
  )
);

export const trimClipInLayeredTimeline = (clips = [], clipId, patch = {}) => {
  const clip = (clips || []).find(item => item?.id === clipId);
  if (!clip) return clips || [];
  if (clip.type === 'video') {
    const videoClips = (clips || []).filter(item => item?.type === 'video');
    const nonVideoClips = (clips || []).filter(item => item?.type !== 'video');
    return [...trimClipWithRipple(videoClips, clipId, patch), ...nonVideoClips];
  }
  return (clips || []).map((item) => {
    if (item?.id !== clipId) return item;
    const inPoint = normalizeTimelineNumber(patch.inPoint, item.inPoint || 0, 0, getClipSourceDuration(item) || 300);
    const nextItem = { ...item, ...patch, inPoint };
    return {
      ...nextItem,
      duration: normalizeTimelineNumber(
        patch.duration,
        item.duration,
        MIN_VIDEO_EDITOR_CLIP_DURATION,
        getClipMaxDuration(nextItem, inPoint),
      ),
    };
  });
};
