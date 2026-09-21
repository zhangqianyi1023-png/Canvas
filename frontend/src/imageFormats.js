export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const SUPPORTED_IMAGE_ACCEPT = SUPPORTED_IMAGE_TYPES.join(',');

export const SUPPORTED_IMAGE_LABEL = 'JPEG、PNG、WebP、GIF';

export const isSupportedImageFile = (file) => SUPPORTED_IMAGE_TYPES.includes(file?.type);

export const isSupportedImageDataUrl = (value) => {
  if (typeof value !== 'string') return false;
  return SUPPORTED_IMAGE_TYPES.some(type => value.startsWith(`data:${type};`));
};

export const getUnsupportedImageMessage = (count = 1) => (
  count > 1
    ? `已忽略 ${count} 个不支持的图片格式，仅支持 ${SUPPORTED_IMAGE_LABEL}`
    : `图片格式不支持，仅支持 ${SUPPORTED_IMAGE_LABEL}`
);
