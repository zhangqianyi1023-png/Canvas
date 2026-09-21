import { uploadImageFile } from './uploadImage.js';

export const VIDEO_FRAME_ACTIONS = Object.freeze([
  Object.freeze({ id: 'current', label: '截取当前帧', shortLabel: '当前帧' }),
  Object.freeze({ id: 'first', label: '截取首帧', shortLabel: '首帧' }),
  Object.freeze({ id: 'last', label: '截取尾帧', shortLabel: '尾帧' }),
]);

const FRAME_LABELS = Object.freeze({
  current: '当前帧',
  first: '首帧',
  last: '尾帧',
});

export function resolveVideoFrameTime(kind, { currentTime = 0, duration = 0 } = {}) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const maxTime = safeDuration > 0 ? Math.max(0, safeDuration - Math.min(0.05, safeDuration / 2)) : 0;
  if (kind === 'first') return 0;
  if (kind === 'last') return maxTime;
  const safeCurrent = Number.isFinite(currentTime) ? currentTime : 0;
  return Math.min(Math.max(0, safeCurrent), maxTime || safeCurrent);
}

export function assertPersistentFrameAsset(asset) {
  const url = String(asset?.url || '').trim();
  if (!url) throw new Error('视频截帧上传未返回图片地址');
  return { ...asset, url };
}

function waitForEvent(target, successEvent, errorEvent, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      target.removeEventListener(successEvent, handleSuccess);
      if (errorEvent) target.removeEventListener(errorEvent, handleError);
      clearTimeout(timer);
    };
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('视频读取失败，无法截取画面'));
    };
    target.addEventListener(successEvent, handleSuccess, { once: true });
    if (errorEvent) target.addEventListener(errorEvent, handleError, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('视频截帧等待超时，请重试'));
    }, timeoutMs);
  });
}

async function ensureVideoMetadata(video) {
  if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) return;
  if (!video.currentSrc && !video.src) throw new Error('没有可截取的视频');
  video.load?.();
  await waitForEvent(video, 'loadedmetadata', 'error');
}

async function seekVideo(video, time) {
  if (Math.abs(Number(video.currentTime || 0) - time) < 0.01 && video.readyState >= 2) return;
  const waiting = waitForEvent(video, 'seeked', 'error');
  video.currentTime = time;
  await waiting;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('视频画面转换失败，请检查 OSS 跨域配置'));
      }, 'image/png');
    } catch (error) {
      reject(new Error(error?.message || '视频画面转换失败，请检查图片跨域配置', { cause: error }));
    }
  });
}

export async function captureAndUploadVideoFrame(video, kind, {
  upload = uploadImageFile,
  createCanvas = () => document.createElement('canvas'),
  createFile = (blob, filename) => new File([blob], filename, { type: 'image/png' }),
  now = () => Date.now(),
  onProgress,
} = {}) {
  if (!video || !VIDEO_FRAME_ACTIONS.some(action => action.id === kind)) {
    throw new Error('请选择有效的视频截帧方式');
  }
  await ensureVideoMetadata(video);

  const originalTime = Number(video.currentTime || 0);
  const targetTime = resolveVideoFrameTime(kind, {
    currentTime: originalTime,
    duration: Number(video.duration || 0),
  });
  if (kind !== 'current') await seekVideo(video, targetTime);

  const width = Number(video.videoWidth || 0);
  const height = Number(video.videoHeight || 0);
  if (width <= 0 || height <= 0) throw new Error('视频尺寸无效，无法截取画面');

  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持视频截帧');
  context.drawImage(video, 0, 0, width, height);
  const blob = await canvasToBlob(canvas);
  const file = createFile(blob, `video-frame-${kind}-${now()}.png`);
  const asset = assertPersistentFrameAsset(await upload(file, onProgress));

  if (kind !== 'current' && Number.isFinite(originalTime)) {
    try {
      video.currentTime = originalTime;
    } catch {
      // 截帧已经完成，恢复播放点失败不影响持久化结果。
    }
  }

  return {
    asset,
    kind,
    label: FRAME_LABELS[kind],
    capturedAt: targetTime,
    width,
    height,
  };
}

export function buildVideoFrameResultNode({
  sourceNode,
  capture,
  id = `result_video_frame_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  offsetIndex = 0,
}) {
  const asset = assertPersistentFrameAsset(capture?.asset);
  const sourcePosition = sourceNode?.position || { x: 0, y: 0 };
  const sourceWidth = Number(sourceNode?.width || sourceNode?.style?.width || 260);
  const width = Number(capture?.width || 0);
  const height = Number(capture?.height || 0);
  const ratio = width > 0 && height > 0 ? width / height : 4 / 3;
  const nodeWidth = 260;
  return {
    id,
    type: 'result',
    position: {
      x: Number(sourcePosition.x || 0) + sourceWidth + 80,
      y: Number(sourcePosition.y || 0) + Number(offsetIndex || 0) * 36,
    },
    selected: true,
    style: {
      width: nodeWidth,
      height: Math.max(146, Math.round(nodeWidth / ratio)),
    },
    data: {
      label: `视频${capture?.label || FRAME_LABELS[capture?.kind] || '截帧'}`,
      resultType: 'generateImage',
      imageUrl: asset.url,
      imageUrls: [asset.url],
      imageSource: 'video-frame',
      imageAssetId: String(asset.id || asset.assetId || ''),
      sourceVideoNodeId: String(sourceNode?.id || ''),
      sourceVideoUrl: String(capture?.sourceVideoUrl || ''),
      videoFrameKind: capture?.kind || 'current',
      videoFrameTime: Number(capture?.capturedAt || 0),
      imageSize: width > 0 && height > 0 ? `${width}×${height}` : '',
    },
  };
}
