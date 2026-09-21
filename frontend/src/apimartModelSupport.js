export const normalizeImageModelCapabilities = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([model, detail]) => model && detail && typeof detail === 'object')
      .map(([model, detail]) => [String(model), { ...detail }])
  );
};

export const getPulledImageModelSupport = (data, model) => (
  normalizeImageModelCapabilities(data?.imageSupport)[model] || null
);

export const isPulledModelSelectable = (data, groupKey, model) => {
  if (groupKey !== 'image' || data?.enforceImageAdaptation !== true) return true;
  return getPulledImageModelSupport(data, model)?.adapted === true;
};

export const filterSelectableModels = (data, groupKey, models) => (
  (Array.isArray(models) ? models : [])
    .filter(model => isPulledModelSelectable(data, groupKey, model))
);

export const getCapabilityLabel = (detail) => {
  const labels = Array.isArray(detail?.capabilityLabels)
    ? detail.capabilityLabels.filter(Boolean)
    : [];
  return labels.join(' · ');
};

export const selectCapabilities = (supportMap, models) => {
  const normalized = normalizeImageModelCapabilities(supportMap);
  return Object.fromEntries(
    (Array.isArray(models) ? models : [])
      .filter(model => normalized[model]?.adapted === true)
      .map(model => [model, normalized[model]])
  );
};

const getRatioShape = (value) => {
  if (value === 'auto') return 'square';
  const [width, height] = String(value || '').split(':').map(Number);
  if (!width || !height) return '';
  const ratio = width / height;
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.15) return 'wide';
  return 'square';
};

export const buildImageRatioOptions = (capabilities, fallbackOptions = []) => {
  const values = Array.isArray(capabilities?.ratios) ? capabilities.ratios : [];
  if (values.length === 0) return fallbackOptions;
  return values.map(value => (
    fallbackOptions.find(option => option.value === value)
    || {
      id: `capability-${String(value).replace(/[^a-z0-9]+/gi, '-')}`,
      label: value === 'auto' ? '自动' : value === 'adaptive' ? '自适应' : value,
      value,
      shape: getRatioShape(value),
    }
  ));
};

export const buildCapabilityOptions = (values, fallbackOptions = []) => {
  if (!Array.isArray(values)) return fallbackOptions;
  return values.map(value => ({ value, label: String(value).toUpperCase() }));
};

export const resolveCapabilityValue = (currentValue, options, defaultValue = '') => {
  const normalizedCurrent = String(currentValue || '').toLowerCase();
  const match = (Array.isArray(options) ? options : []).find(option => (
    String(option.value).toLowerCase() === normalizedCurrent
  ));
  if (match) return match.value;
  const fallback = (Array.isArray(options) ? options : []).find(option => option.value === defaultValue);
  return fallback?.value || options?.[0]?.value || '';
};
