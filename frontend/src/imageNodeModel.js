import { resolveImageNegativePrompt } from './imageNegativePrompt.js';

const DEFAULT_RESULT_WIDTH = 280;
const DEFAULT_RESULT_HEIGHT = 373;
const PROCESSOR_WIDTH = 600;
const PROCESSOR_GAP_Y = 16;

const validImages = value => (
  Array.isArray(value) ? value.filter(Boolean) : []
);

const numericOr = (value, fallback) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createUniqueId = (baseId, occupiedIds) => {
  if (!occupiedIds.has(baseId)) {
    occupiedIds.add(baseId);
    return baseId;
  }

  let suffix = 1;
  while (occupiedIds.has(`${baseId}_${suffix}`)) suffix += 1;
  const uniqueId = `${baseId}_${suffix}`;
  occupiedIds.add(uniqueId);
  return uniqueId;
};

export function normalizeImageResultData(data = {}) {
  const imageUrls = validImages(data.imageUrls);
  const urls = imageUrls.length > 0
    ? imageUrls
    : data.imageUrl ? [data.imageUrl] : [];
  const coverIndex = Number.isInteger(data.coverIndex)
    && data.coverIndex >= 0
    && data.coverIndex < urls.length
    ? data.coverIndex
    : 0;

  return {
    imageUrl: urls[coverIndex] || '',
    imageUrls: urls,
    coverIndex,
  };
}

export function replaceImageResultCover(data = {}, nextUrl) {
  const normalized = normalizeImageResultData(data);
  if (!nextUrl) return normalized;

  const imageUrls = [...normalized.imageUrls];
  const coverIndex = imageUrls.length > 0 ? normalized.coverIndex : 0;

  if (imageUrls.length === 0) imageUrls.push(nextUrl);
  else imageUrls[coverIndex] = nextUrl;

  return {
    imageUrl: nextUrl,
    imageUrls,
    coverIndex,
  };
}

export function appendImageResultImages(data = {}, nextUrls = [], options = {}) {
  const normalized = normalizeImageResultData(data);
  const incomingUrls = validImages(Array.isArray(nextUrls) ? nextUrls : [nextUrls]);
  if (incomingUrls.length === 0) return normalized;

  const imageUrls = [...normalized.imageUrls];
  incomingUrls.forEach(url => {
    if (!imageUrls.includes(url)) imageUrls.push(url);
  });

  const firstIncomingIndex = imageUrls.findIndex(url => incomingUrls.includes(url));
  const coverIndex = options.preserveCover
    ? normalized.coverIndex
    : firstIncomingIndex >= 0 ? firstIncomingIndex : normalized.coverIndex;

  return {
    imageUrl: imageUrls[coverIndex] || '',
    imageUrls,
    coverIndex,
  };
}

export function migrateLegacyImageGraph(nodes = [], edges = []) {
  if (!nodes.some(node => node?.type === 'imageInput')) {
    return { nodes, edges };
  }

  const occupiedIds = new Set(nodes.map(node => node?.id).filter(Boolean));
  const migratedNodes = [];

  nodes.forEach(node => {
    if (node?.type !== 'imageInput') {
      migratedNodes.push(node);
      return;
    }

    const data = node.data || {};
    const normalizedImages = normalizeImageResultData(data);
    const generatorId = createUniqueId(`generator_${node.id}`, occupiedIds);
    const resultWidth = numericOr(node.style?.width, DEFAULT_RESULT_WIDTH);
    const resultHeight = numericOr(node.style?.height, DEFAULT_RESULT_HEIGHT);
    const resultX = numericOr(node.position?.x, 0);
    const resultY = numericOr(node.position?.y, 0);
    const promptDraft = data.materialPrompt || '';

    migratedNodes.push({
      ...node,
      type: 'result',
      data: {
        ...data,
        ...normalizedImages,
        label: '图片',
        resultType: 'generateImage',
        pairedGeneratorId: generatorId,
      },
    });
    migratedNodes.push({
      id: generatorId,
      type: 'generator',
      position: {
        x: resultX + (resultWidth - PROCESSOR_WIDTH) / 2,
        y: resultY + resultHeight + PROCESSOR_GAP_Y,
      },
      hidden: true,
      data: {
        generatorType: 'generateImage',
        pairedResultId: node.id,
        promptDraft,
        image_prompt: promptDraft,
        image_negative_prompt: resolveImageNegativePrompt(data.image_negative_prompt),
        connectedPrompt: '',
        connectedTextReferences: [],
        connectedImages: [],
        connectedVideos: [],
        uploadedReferenceImages: [],
      },
    });
  });

  return {
    nodes: migratedNodes,
    edges,
  };
}

export function restoreImageNodePairs(nodes = []) {
  const generators = new Map(
    nodes
      .filter(node => node?.type === 'generator' && node.id)
      .map(node => [node.id, node]),
  );
  const generatorsByResult = new Map();

  generators.forEach(generator => {
    const resultId = generator.data?.pairedResultId;
    if (resultId && !generatorsByResult.has(resultId)) {
      generatorsByResult.set(resultId, generator.id);
    }
  });

  return nodes.reduce((pairs, node) => {
    if (node?.type !== 'result' || !node.id) {
      return pairs;
    }

    const explicitGeneratorId = node.data?.pairedGeneratorId;
    const reverseExplicitGeneratorId = generatorsByResult.get(node.id);
    const legacyGeneratorId = node.id.startsWith('result_')
      ? node.id.replace(/^result_/, 'generator_')
      : '';

    const generatorId = explicitGeneratorId
      && generators.has(explicitGeneratorId)
      ? explicitGeneratorId
      : reverseExplicitGeneratorId
        && generators.has(reverseExplicitGeneratorId)
        ? reverseExplicitGeneratorId
        : legacyGeneratorId
          && generators.has(legacyGeneratorId)
          ? legacyGeneratorId
          : '';

    if (generatorId) pairs[node.id] = generatorId;
    return pairs;
  }, {});
}
