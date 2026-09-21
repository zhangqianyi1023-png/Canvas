const toPositiveNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.max(1, a));

const formatImageRatio = (width, height) => {
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
};

export const buildUploadedImageAssetMetadata = (asset = {}, imageSize = null) => {
  const width = toPositiveNumber(imageSize?.width) || toPositiveNumber(asset?.width);
  const height = toPositiveNumber(imageSize?.height) || toPositiveNumber(asset?.height);
  if (!width || !height) return {};
  return {
    width,
    height,
    imageSize: formatImageRatio(width, height),
    mediaAspectRatio: width / height,
  };
};

export const readLocalImageFileSize = file => new Promise((resolve) => {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || !file) {
    resolve(null);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  const cleanup = () => URL.revokeObjectURL(objectUrl);
  image.onload = () => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    cleanup();
    resolve(width > 0 && height > 0 ? { width, height } : null);
  };
  image.onerror = () => {
    cleanup();
    resolve(null);
  };
  image.src = objectUrl;
});
