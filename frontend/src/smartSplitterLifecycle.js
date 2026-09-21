export const SMART_SPLITTER_PHASES = new Set(['analyzing', 'creating']);

const SMART_SPLITTER_PHASE_LABELS = {
  analyzing: '分析提示词',
  creating: '产生下游节点',
};

export const normalizeSmartSplitterPhase = (status) => (
  SMART_SPLITTER_PHASES.has(status) ? status : ''
);

export const getSmartSplitterPhaseLabel = (status) => (
  SMART_SPLITTER_PHASE_LABELS[normalizeSmartSplitterPhase(status)] || ''
);

export const isSmartSplitterBusy = (status) => (
  SMART_SPLITTER_PHASES.has(status)
);

export const buildSmartSplitterDirectionLaunches = ({
  directionPrompts = [],
  generatorIds = [],
  provider = {},
  model = '',
  imageSize = '3:4',
  imageResolution = '1k',
  imagesPerDirection = 1,
  referenceImages = [],
  displayPrompts = [],
  negativePrompt = '',
  splitterId = '',
  batchId = '',
}) => directionPrompts.map((prompt, index) => ({
  generatorId: generatorIds[index] || '',
  payload: {
    api_base_url: provider.baseUrl || '',
    api_key: provider.apiKey || '',
    prompt,
    model,
    size: imageSize,
    resolution: imageResolution,
    n: 1,
    image_urls: [...referenceImages],
    parent_id: splitterId,
    batch_id: batchId,
  },
  generationConfig: {
    image_prompt: displayPrompts[index] || prompt,
    image_negative_prompt: negativePrompt,
    image_model: model,
    image_api_id: provider.id || '',
    image_size: imageSize,
    image_resolution: imageResolution,
    image_count: imagesPerDirection,
    splitter_direction_index: index,
  },
}));
