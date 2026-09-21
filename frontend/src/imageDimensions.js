const toPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

export const normalizeImageDimensions = (value) => {
  const width = toPositiveInteger(value?.width);
  const height = toPositiveInteger(value?.height);
  return width > 0 && height > 0 ? { width, height } : null;
};

export const formatImageDimensions = (value) => {
  const dimensions = normalizeImageDimensions(value);
  return dimensions ? `${dimensions.width}×${dimensions.height}` : '';
};

export const mergeImageDimensions = (currentMap, url, dimensions) => {
  if (!url) return currentMap || {};
  const normalized = normalizeImageDimensions(dimensions);
  if (!normalized) return currentMap || {};
  return {
    ...(currentMap || {}),
    [url]: normalized,
  };
};
