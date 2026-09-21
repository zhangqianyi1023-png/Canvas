export const HOME_MAX_REFERENCE_IMAGES = 9;

export const normalizeHomeReferenceImages = (values = []) => (
  [...new Set((Array.isArray(values) ? values : []).filter(Boolean))]
    .slice(0, HOME_MAX_REFERENCE_IMAGES)
);

export const appendHomeReferenceImages = (current = [], additions = []) => (
  normalizeHomeReferenceImages([...current, ...additions])
);

export const buildHomeCreationRequest = (request = {}) => {
  const source = request && typeof request === 'object' ? request : {};

  return {
    prompt: typeof source.prompt === 'string' ? source.prompt.trim() : '',
    type: source.type === 'generateVideo' ? 'generateVideo' : 'generateImage',
    apiId: source.apiId || '',
    model: source.model || '',
    uploadedReferenceImages: normalizeHomeReferenceImages(source.uploadedReferenceImages),
  };
};

export const buildHomeGeneratorOptions = (request = {}) => {
  const normalized = buildHomeCreationRequest(request);
  const isVideo = normalized.type === 'generateVideo';

  return {
    promptDraft: normalized.prompt,
    imageModel: isVideo ? '' : normalized.model,
    imageApiId: isVideo ? '' : normalized.apiId,
    videoModel: isVideo ? normalized.model : '',
    videoApiId: isVideo ? normalized.apiId : '',
    uploadedReferenceImages: normalized.uploadedReferenceImages,
  };
};
