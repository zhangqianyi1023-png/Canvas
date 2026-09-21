import { API_BASE } from './apiBase.js';

export const MIN_CROP_SIZE = 0.06;
export const DEFAULT_CROP = Object.freeze({
  x: 0.12,
  y: 0.12,
  width: 0.76,
  height: 0.76,
});

export const CROP_RATIO_OPTIONS = Object.freeze([
  { id: 'free', label: '自由' },
  { id: 'original', label: '原图' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
]);

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const normalizeRotation = rotation => (
  ((Math.round(Number(rotation) / 90) * 90) % 360 + 360) % 360
);

export const normalizeFreeRotation = rotation => {
  const parsed = Number(rotation);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = ((parsed % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
};

export const getRotatedSize = (width, height, rotation) => (
  normalizeRotation(rotation) % 180 === 90
    ? { width: height, height: width }
    : { width, height }
);

export const getFreeRotatedSize = (width, height, rotation) => {
  const radians = normalizeFreeRotation(rotation) * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const ceilPixel = value => Math.max(1, Math.ceil(value - 1e-8));
  return {
    width: ceilPixel(width * cos + height * sin),
    height: ceilPixel(width * sin + height * cos),
  };
};

const parseRatio = value => {
  const [width, height] = String(value || '').split(':').map(Number);
  return width > 0 && height > 0 ? width / height : null;
};

export const resolveCropRatio = (preset, width, height, rotation) => {
  if (preset === 'free') return null;
  if (preset !== 'original') return parseRatio(preset);
  const rotated = getRotatedSize(width, height, rotation);
  return rotated.width > 0 && rotated.height > 0
    ? rotated.width / rotated.height
    : null;
};

const normalizedRatio = (pixelRatio, imageSize) => (
  pixelRatio * imageSize.height / imageSize.width
);

export const fitCropToRatio = (crop, pixelRatio, imageSize) => {
  if (!pixelRatio || !imageSize.width || !imageSize.height) return { ...crop };

  const ratio = normalizedRatio(pixelRatio, imageSize);
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const maxWidth = Math.min(1, 2 * Math.min(centerX, 1 - centerX));
  const maxHeight = Math.min(1, 2 * Math.min(centerY, 1 - centerY));

  let width = Math.min(crop.width, maxWidth);
  let height = width / ratio;
  if (height > crop.height || height > maxHeight) {
    height = Math.min(crop.height, maxHeight);
    width = height * ratio;
  }
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }

  return {
    x: clamp(centerX - width / 2, 0, 1 - width),
    y: clamp(centerY - height / 2, 0, 1 - height),
    width,
    height,
  };
};

export const createInitialCrop = (preset, width, height, rotation) => {
  const rotated = getRotatedSize(width, height, rotation);
  const ratio = resolveCropRatio(preset, width, height, rotation);
  return ratio
    ? fitCropToRatio(DEFAULT_CROP, ratio, rotated)
    : { ...DEFAULT_CROP };
};

export const moveCrop = (crop, dx, dy) => ({
  ...crop,
  x: clamp(crop.x + dx, 0, 1 - crop.width),
  y: clamp(crop.y + dy, 0, 1 - crop.height),
});

const fitLockedResize = ({
  crop,
  proposed,
  handle,
  pixelRatio,
  imageSize,
  dx,
  dy,
}) => {
  const ratio = normalizedRatio(pixelRatio, imageSize);
  const isHorizontal = handle === 'e' || handle === 'w';
  const isVertical = handle === 'n' || handle === 's';
  const useWidth = isHorizontal
    || (!isVertical && Math.abs(dx) >= Math.abs(dy * ratio));

  let width = useWidth ? proposed.width : proposed.height * ratio;
  let height = width / ratio;

  const anchorX = handle.includes('w')
    ? crop.x + crop.width
    : handle.includes('e')
      ? crop.x
      : crop.x + crop.width / 2;
  const anchorY = handle.includes('n')
    ? crop.y + crop.height
    : handle.includes('s')
      ? crop.y
      : crop.y + crop.height / 2;

  const maxWidth = handle.includes('w')
    ? anchorX
    : handle.includes('e')
      ? 1 - anchorX
      : 2 * Math.min(anchorX, 1 - anchorX);
  const maxHeight = handle.includes('n')
    ? anchorY
    : handle.includes('s')
      ? 1 - anchorY
      : 2 * Math.min(anchorY, 1 - anchorY);

  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const minWidth = Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE * ratio);
  width = clamp(width, Math.min(minWidth, maxWidth), maxWidth);
  height = width / ratio;

  const x = handle.includes('w')
    ? anchorX - width
    : handle.includes('e')
      ? anchorX
      : anchorX - width / 2;
  const y = handle.includes('n')
    ? anchorY - height
    : handle.includes('s')
      ? anchorY
      : anchorY - height / 2;

  return {
    x: clamp(x, 0, 1 - width),
    y: clamp(y, 0, 1 - height),
    width,
    height,
  };
};

export const resizeCrop = ({
  crop,
  dx,
  dy,
  handle,
  pixelRatio,
  imageSize,
}) => {
  const next = { ...crop };
  if (handle.includes('e')) next.width += dx;
  if (handle.includes('s')) next.height += dy;
  if (handle.includes('w')) {
    next.x += dx;
    next.width -= dx;
  }
  if (handle.includes('n')) {
    next.y += dy;
    next.height -= dy;
  }

  next.width = clamp(next.width, MIN_CROP_SIZE, 1);
  next.height = clamp(next.height, MIN_CROP_SIZE, 1);
  next.x = clamp(next.x, 0, 1 - next.width);
  next.y = clamp(next.y, 0, 1 - next.height);

  if (!pixelRatio) return next;
  return fitLockedResize({
    crop,
    proposed: next,
    handle,
    pixelRatio,
    imageSize,
    dx,
    dy,
  });
};

export const resolvePixelCrop = (crop, imageSize) => {
  const maxX = Math.max(0, imageSize.width - 1);
  const maxY = Math.max(0, imageSize.height - 1);
  const x = clamp(Math.floor(crop.x * imageSize.width), 0, maxX);
  const y = clamp(Math.floor(crop.y * imageSize.height), 0, maxY);
  const width = clamp(
    Math.round(crop.width * imageSize.width),
    1,
    imageSize.width - x,
  );
  const height = clamp(
    Math.round(crop.height * imageSize.height),
    1,
    imageSize.height - y,
  );
  return { x, y, width, height };
};

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.max(1, a));

export const formatRatio = (width, height) => {
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
};

export const resolveRotationDraw = (width, height, rotation) => {
  const normalized = normalizeRotation(rotation);
  const rotated = getRotatedSize(width, height, normalized);
  const transforms = {
    0: { translateX: 0, translateY: 0, radians: 0 },
    90: { translateX: rotated.width, translateY: 0, radians: Math.PI / 2 },
    180: { translateX: rotated.width, translateY: rotated.height, radians: Math.PI },
    270: { translateX: 0, translateY: rotated.height, radians: Math.PI * 1.5 },
  };
  return {
    canvasWidth: rotated.width,
    canvasHeight: rotated.height,
    ...transforms[normalized],
  };
};

const loadImageElement = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片读取失败，无法裁剪'));
  image.src = source;
});

export const resolveCropImageFetchUrl = imageUrl => {
  const value = String(imageUrl || '').trim();
  if (!value) return value;
  if (value.startsWith('/uploads/')) {
    return API_BASE ? `${API_BASE}${value}` : value;
  }

  if (!API_BASE || typeof window === 'undefined') return value;

  try {
    const parsed = new URL(value, window.location.origin);
    if (
      parsed.pathname.startsWith('/uploads/')
      && parsed.origin === window.location.origin
    ) {
      return `${API_BASE}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* keep the original value */
  }

  return value;
};

const fetchImageBlob = async imageUrl => {
  const fetchUrl = resolveCropImageFetchUrl(imageUrl);
  try {
    const response = await fetch(fetchUrl, { mode: 'cors' });
    if (response.ok) return response.blob();
  } catch {
    // Cross-origin images fall back to the same-origin download proxy.
  }

  if (
    String(imageUrl || '').startsWith('/uploads/')
    || String(fetchUrl || '').includes('/uploads/')
  ) {
    throw new Error('本地图片读取失败，请确认后端服务已启动');
  }

  const response = await fetch(
    `${API_BASE}/api/proxy/download?url=${encodeURIComponent(imageUrl)}`,
  );
  if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
  return response.blob();
};

export const loadCropImage = async imageUrl => {
  if (!imageUrl) throw new Error('图片地址为空');
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return {
      image: await loadImageElement(imageUrl),
      sourceUrl: imageUrl,
      release() {},
    };
  }

  const blob = await fetchImageBlob(imageUrl);
  const objectUrl = URL.createObjectURL(blob);
  try {
    return {
      image: await loadImageElement(objectUrl),
      sourceUrl: objectUrl,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export const drawRotatedImage = (image, rotation, canvas) => {
  const draw = resolveRotationDraw(
    image.naturalWidth,
    image.naturalHeight,
    rotation,
  );
  canvas.width = draw.canvasWidth;
  canvas.height = draw.canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片画布');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(draw.translateX, draw.translateY);
  context.rotate(draw.radians);
  context.drawImage(image, 0, 0);
  context.restore();
  return draw;
};

export const resolveFreeRotationDraw = (width, height, rotation) => {
  const normalized = normalizeFreeRotation(rotation);
  const rotated = getFreeRotatedSize(width, height, normalized);
  return {
    canvasWidth: rotated.width,
    canvasHeight: rotated.height,
    translateX: rotated.width / 2,
    translateY: rotated.height / 2,
    radians: normalized * Math.PI / 180,
    rotation: normalized,
  };
};

export const drawFreeRotatedImage = (image, rotation, canvas, options = {}) => {
  const flipX = Boolean(options.flipX);
  const flipY = Boolean(options.flipY);
  const draw = resolveFreeRotationDraw(
    image.naturalWidth,
    image.naturalHeight,
    rotation,
  );
  canvas.width = draw.canvasWidth;
  canvas.height = draw.canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片画布');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(draw.translateX, draw.translateY);
  context.rotate(draw.radians);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  return draw;
};

const canvasToBlob = canvas => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('裁剪图片生成失败'));
  }, 'image/png');
});

export const renderImageCrop = async ({ image, crop, rotation }) => {
  const rotatedCanvas = document.createElement('canvas');
  const draw = drawRotatedImage(image, rotation, rotatedCanvas);
  const pixelCrop = resolvePixelCrop(crop, {
    width: draw.canvasWidth,
    height: draw.canvasHeight,
  });

  const output = document.createElement('canvas');
  output.width = pixelCrop.width;
  output.height = pixelCrop.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('浏览器无法创建裁剪画布');
  outputContext.drawImage(
    rotatedCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return {
    blob: await canvasToBlob(output),
    width: pixelCrop.width,
    height: pixelCrop.height,
    ratioLabel: formatRatio(pixelCrop.width, pixelCrop.height),
  };
};

export const renderImageRotation = async ({ image, rotation, flipX = false, flipY = false }) => {
  const output = document.createElement('canvas');
  const draw = drawFreeRotatedImage(image, rotation, output, { flipX, flipY });
  return {
    blob: await canvasToBlob(output),
    width: draw.canvasWidth,
    height: draw.canvasHeight,
    ratioLabel: formatRatio(draw.canvasWidth, draw.canvasHeight),
  };
};

export const getCroppedNodeStyle = (width, height) => {
  const ratio = width / height;
  const nodeWidth = ratio >= 1.6 ? 320 : ratio <= 0.7 ? 240 : 280;
  return {
    width: nodeWidth,
    height: Math.round(nodeWidth / ratio),
  };
};
