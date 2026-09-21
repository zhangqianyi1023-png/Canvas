import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectTimelineSnapPoints,
  compactTimelineClips,
  createClipFromSource,
  createVideoEditorCanvasFromAspectRatio,
  duplicateClipAtTime,
  findClipAtTime,
  formatSeconds,
  getAspectFillScale,
  getAspectFitScale,
  getClipMaxDuration,
  getTimelinePlaybackState,
  insertClipAtTime,
  normalizeAspectRatioNumber,
  normalizeVideoEditorTimeline,
  moveClipWithSnap,
  removeClipWithRipple,
  reorderClipWithRipple,
  splitClipAtTime,
  trimClipWithRipple,
  trimClipEndWithSnap,
  trimClipStartWithSnap,
} from './videoEditorModel.js';

const baseClip = {
  id: 'clip-a',
  name: '视频 A',
  type: 'video',
  sourceId: 'video-a',
  sourceUrl: '/uploads/a.mp4',
  start: 0,
  duration: 4,
  inPoint: 0,
  transform: { x: 50, y: 50, scale: 1, rotate: 0, opacity: 1 },
};

test('collectTimelineSnapPoints includes zero, playhead, and other clip edges', () => {
  const points = collectTimelineSnapPoints([
    baseClip,
    { ...baseClip, id: 'clip-b', start: 4.25, duration: 2 },
  ], { excludeClipId: 'clip-a', playheadTime: 2.5 });

  assert.deepEqual(points, [0, 2.5, 4.25, 6.25]);
});

test('moveClipWithSnap snaps starts to nearby clip edges', () => {
  const result = moveClipWithSnap(
    baseClip,
    [baseClip, { ...baseClip, id: 'clip-b', start: 4, duration: 2 }],
    3.94,
    { snapEnabled: true, playheadTime: 1 }
  );

  assert.equal(result.start, 4);
  assert.equal(result.duration, 4);
  assert.equal(result.snapPoint, 4);
});

test('moveClipWithSnap leaves starts unsnapped when snapping is disabled', () => {
  const result = moveClipWithSnap(
    baseClip,
    [baseClip, { ...baseClip, id: 'clip-b', start: 4, duration: 2 }],
    3.94,
    { snapEnabled: false, playheadTime: 1 }
  );

  assert.equal(result.start, 3.94);
  assert.equal(result.snapPoint, null);
});

test('trimClipStartWithSnap clamps duration and advances inPoint', () => {
  const result = trimClipStartWithSnap(
    { ...baseClip, start: 1, duration: 4, inPoint: 0.5 },
    [{ ...baseClip, start: 1, duration: 4 }],
    2.25,
    { snapEnabled: false }
  );

  assert.equal(result.start, 2.25);
  assert.equal(result.duration, 2.75);
  assert.equal(result.inPoint, 1.75);
});

test('trimClipEndWithSnap snaps the end edge to playhead', () => {
  const result = trimClipEndWithSnap(
    { ...baseClip, start: 1, duration: 4 },
    [{ ...baseClip, start: 1, duration: 4 }],
    3.92,
    { snapEnabled: true, playheadTime: 4 }
  );

  assert.equal(result.duration, 3);
  assert.equal(result.snapPoint, 4);
});

test('trimClipEndWithSnap caps video clips at source duration', () => {
  const result = trimClipEndWithSnap(
    { ...baseClip, start: 0, duration: 2, inPoint: 1, sourceDuration: 4 },
    [{ ...baseClip, start: 0, duration: 2, inPoint: 1, sourceDuration: 4 }],
    8,
    { snapEnabled: false }
  );

  assert.equal(result.duration, 3);
  assert.equal(getClipMaxDuration({ ...baseClip, inPoint: 1, sourceDuration: 4 }), 3);
});

test('trimClipWithRipple keeps video duration inside the available source range', () => {
  const result = trimClipWithRipple(
    [
      { ...baseClip, id: 'clip-a', duration: 2, inPoint: 1, sourceDuration: 4 },
      { ...baseClip, id: 'clip-b', duration: 2 },
    ],
    'clip-a',
    { duration: 8 }
  );

  assert.equal(result[0].duration, 3);
  assert.equal(result[1].start, 3);
});

test('splitClipAtTime divides a clip and shifts the right inPoint', () => {
  const clips = splitClipAtTime([{ ...baseClip, start: 1, duration: 5, inPoint: 0.5 }], 'clip-a', 3);

  assert.equal(clips.length, 2);
  assert.equal(clips[0].duration, 2);
  assert.equal(clips[1].start, 3);
  assert.equal(clips[1].duration, 3);
  assert.equal(clips[1].inPoint, 2.5);
});

test('splitClipAtTime ignores splits too close to clip edges', () => {
  const clips = [{ ...baseClip, start: 1, duration: 5 }];

  assert.equal(splitClipAtTime(clips, 'clip-a', 1.2), clips);
  assert.equal(splitClipAtTime(clips, 'clip-a', 5.8), clips);
});

test('duplicateClipAtTime copies a clip with a new id and start', () => {
  const copy = duplicateClipAtTime(baseClip, 6);

  assert.notEqual(copy.id, baseClip.id);
  assert.equal(copy.start, 6);
  assert.equal(copy.name, '视频 A 副本');
  assert.deepEqual(copy.transform, baseClip.transform);
});

test('formatSeconds rounds to one fixed decimal place', () => {
  assert.equal(formatSeconds(0), '0.0s');
  assert.equal(formatSeconds(9.95), '10.0s');
  assert.equal(formatSeconds(10.96), '11.0s');
});

test('normalizeAspectRatioNumber accepts colon ratios and numeric ratios', () => {
  assert.equal(normalizeAspectRatioNumber('9:16'), 9 / 16);
  assert.equal(normalizeAspectRatioNumber('16/9'), 16 / 9);
  assert.equal(normalizeAspectRatioNumber(0.75), 0.75);
});

test('createVideoEditorCanvasFromAspectRatio creates portrait canvas for 9:16 media', () => {
  const canvas = createVideoEditorCanvasFromAspectRatio('9:16');

  assert.equal(canvas.width, 720);
  assert.equal(canvas.height, 1280);
  assert.equal(canvas.aspectRatio, '9:16');
  assert.equal(canvas.resolution, '720p');
});

test('createVideoEditorCanvasFromAspectRatio applies resolution presets by orientation', () => {
  const portrait = createVideoEditorCanvasFromAspectRatio('9:16', '1080p');
  const cinema = createVideoEditorCanvasFromAspectRatio('21:9', '1080p');
  const square = createVideoEditorCanvasFromAspectRatio('1:1', '1080p');

  assert.deepEqual(portrait, {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    resolution: '1080p',
  });
  assert.deepEqual(cinema, {
    width: 1920,
    height: 824,
    aspectRatio: '21:9',
    resolution: '1080p',
  });
  assert.deepEqual(square, {
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    resolution: '1080p',
  });
});

test('createClipFromSource preserves source aspect ratio', () => {
  const clip = createClipFromSource({
    id: 'image-source',
    url: '/uploads/portrait.png',
    type: 'image',
    name: '竖图',
    aspectRatio: '9:16',
  }, 0);

  assert.equal(clip.aspectRatio, 9 / 16);
});

test('createClipFromSource uses video source duration when available', () => {
  const clip = createClipFromSource({
    id: 'source-video',
    type: 'video',
    url: '/uploads/video.mp4',
    sourceDuration: 4.534,
  }, 0);

  assert.equal(clip.duration, 4.534);
  assert.equal(clip.sourceDuration, 4.534);
});

test('aspect fit and fill scales account for the preview base width', () => {
  assert.equal(Number(getAspectFitScale(9 / 16, 9 / 16).toFixed(3)), 1.724);
  assert.equal(Number(getAspectFillScale(9 / 16, 9 / 16).toFixed(3)), 1.741);
  assert.ok(Math.abs(getAspectFillScale(16 / 9, 9 / 16) - 5.503) < 0.001);
});

test('normalizeVideoEditorTimeline preserves custom portrait canvas', () => {
  const timeline = normalizeVideoEditorTimeline({
    canvas: { width: 720, height: 1280, aspectRatio: '9:16', resolution: '720p' },
    clips: [],
  });

  assert.equal(timeline.canvas.width, 720);
  assert.equal(timeline.canvas.height, 1280);
  assert.equal(timeline.canvas.aspectRatio, '9:16');
  assert.equal(timeline.canvas.resolution, '720p');
});

test('normalizeVideoEditorTimeline converts legacy odd canvas dimensions to encoder-safe even values', () => {
  const timeline = normalizeVideoEditorTimeline({
    canvas: { width: 735, height: 1280, aspectRatio: '9:16', resolution: '720p' },
    clips: [],
  });

  assert.equal(timeline.canvas.width, 736);
  assert.equal(timeline.canvas.height, 1280);
  assert.equal(timeline.canvas.aspectRatio, '9:16');
});

test('normalizeVideoEditorTimeline preserves portrait 4K canvas height', () => {
  const timeline = normalizeVideoEditorTimeline({
    canvas: createVideoEditorCanvasFromAspectRatio('9:16', '4K'),
    clips: [],
  });

  assert.equal(timeline.canvas.width, 2160);
  assert.equal(timeline.canvas.height, 3840);
  assert.equal(timeline.canvas.aspectRatio, '9:16');
  assert.equal(timeline.canvas.resolution, '4K');
});

test('compactTimelineClips sorts clips and removes gaps', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-b', start: 8, duration: 2 },
    { ...baseClip, id: 'clip-a', start: 2, duration: 4 },
  ]);

  assert.deepEqual(clips.map(clip => clip.id), ['clip-a', 'clip-b']);
  assert.deepEqual(clips.map(clip => clip.start), [0, 4]);
});

test('findClipAtTime returns the clip covering the playhead', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
  ]);

  assert.equal(findClipAtTime(clips, 3.5)?.id, 'clip-a');
  assert.equal(findClipAtTime(clips, 4)?.id, 'clip-b');
  assert.equal(findClipAtTime(clips, 6.1), null);
});

test('getTimelinePlaybackState maps timeline time to clip media time', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4, inPoint: 0.5 },
    { ...baseClip, id: 'clip-b', duration: 3, inPoint: 2 },
  ]);
  const state = getTimelinePlaybackState(clips, 5.5);

  assert.equal(state.clip.id, 'clip-b');
  assert.equal(state.clipOffset, 1.5);
  assert.equal(state.mediaTime, 3.5);
});

test('getTimelinePlaybackState uses the next clip at an exact boundary', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 3, inPoint: 1 },
  ]);
  const state = getTimelinePlaybackState(clips, 4);

  assert.equal(state.clip.id, 'clip-b');
  assert.equal(state.clipOffset, 0);
  assert.equal(state.mediaTime, 1);
});

test('getTimelinePlaybackState returns null outside the timeline', () => {
  const clips = compactTimelineClips([{ ...baseClip, duration: 4 }]);

  assert.equal(getTimelinePlaybackState(clips, 4.1), null);
});

test('insertClipAtTime splits a clip and ripples later clips', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
  ]);
  const inserted = { ...baseClip, id: 'clip-new', name: '插入素材', duration: 3 };
  const result = insertClipAtTime(clips, inserted, 2);

  assert.deepEqual(result.clips.map(clip => clip.start), [0, 2, 5, 7]);
  assert.deepEqual(result.clips.map(clip => clip.duration), [2, 3, 2, 2]);
  assert.equal(result.clips[1].id, 'clip-new');
  assert.equal(result.clips[2].inPoint, 2);
});

test('insertClipAtTime inserts at an existing boundary without splitting', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
  ]);
  const result = insertClipAtTime(
    clips,
    { ...baseClip, id: 'clip-new', duration: 1 },
    4,
  );

  assert.deepEqual(result.clips.map(clip => clip.id), ['clip-a', 'clip-new', 'clip-b']);
  assert.deepEqual(result.clips.map(clip => clip.start), [0, 4, 5]);
});

test('insertClipAtTime uses the nearest edge when the playhead is too close to split', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
  ]);
  const inserted = { ...baseClip, id: 'clip-new', duration: 1 };

  const nearStart = insertClipAtTime(clips, inserted, 0.2);
  const nearEnd = insertClipAtTime(clips, { ...inserted, id: 'clip-new-end' }, 3.8);

  assert.deepEqual(nearStart.clips.map(clip => clip.id), ['clip-new', 'clip-a', 'clip-b']);
  assert.deepEqual(nearEnd.clips.map(clip => clip.id), ['clip-a', 'clip-new-end', 'clip-b']);
});

test('removeClipWithRipple closes the removed clip gap', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
    { ...baseClip, id: 'clip-c', duration: 3 },
  ]);
  const result = removeClipWithRipple(clips, 'clip-b');

  assert.deepEqual(result.map(clip => clip.id), ['clip-a', 'clip-c']);
  assert.deepEqual(result.map(clip => clip.start), [0, 4]);
});

test('reorderClipWithRipple changes order and recomputes starts', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
    { ...baseClip, id: 'clip-c', duration: 3 },
  ]);
  const result = reorderClipWithRipple(clips, 'clip-c', 0);

  assert.deepEqual(result.map(clip => clip.id), ['clip-c', 'clip-a', 'clip-b']);
  assert.deepEqual(result.map(clip => clip.start), [0, 3, 7]);
});

test('trimClipWithRipple changes duration and shifts later clips', () => {
  const clips = compactTimelineClips([
    { ...baseClip, id: 'clip-a', duration: 4 },
    { ...baseClip, id: 'clip-b', duration: 2 },
  ]);
  const result = trimClipWithRipple(clips, 'clip-a', {
    duration: 2,
    inPoint: 1,
  });

  assert.equal(result[0].duration, 2);
  assert.equal(result[0].inPoint, 1);
  assert.equal(result[1].start, 2);
});
