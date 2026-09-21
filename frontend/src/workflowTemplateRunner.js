import { normalizeWorkflowTemplate } from './workflowTemplates.js';

const getNodeLabel = (node, fallback = '输入') => (
  node?.data?.label
  || node?.data?.title
  || node?.data?.name
  || fallback
);

const getResultGenerator = (template, resultNode) => {
  const pair = (template.pairs || []).find(item => item.resultId === resultNode?.id);
  const generatorId = pair?.generatorId || resultNode?.data?.pairedGeneratorId;
  return generatorId
    ? template.nodes.find(node => node.id === generatorId && node.type === 'generator')
    : null;
};

const getIncomingCounts = (template) => {
  const counts = new Map();
  (template.nodes || []).forEach(node => {
    if (node?.id) counts.set(node.id, 0);
  });
  (template.edges || []).forEach(edge => {
    if (!counts.has(edge.target)) return;
    counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
  });
  return counts;
};

const getImageUrls = (node) => {
  const urls = Array.isArray(node?.data?.imageUrls)
    ? node.data.imageUrls
    : node?.data?.imageUrl
      ? [node.data.imageUrl]
      : [];
  return urls.filter(Boolean);
};

const isUploadImageResult = (node) => (
  node?.type === 'result'
  && node?.data?.resultType === 'generateImage'
  && (
    node.data?.imageSource === 'upload'
    || Boolean(node.data?.materialId)
    || Boolean(node.data?.materialName)
  )
);

export function getWorkflowTemplateRunInputs(template) {
  const normalizedTemplate = normalizeWorkflowTemplate(template);
  if (!normalizedTemplate?.group || !Array.isArray(normalizedTemplate.nodes)) {
    return [];
  }

  const incomingCounts = getIncomingCounts(normalizedTemplate);
  return normalizedTemplate.nodes
    .filter(node => node?.type !== 'generator')
    .filter(node => (incomingCounts.get(node.id) || 0) === 0)
    .flatMap(node => {
      if (node.type !== 'result') return [];
      const generator = getResultGenerator(normalizedTemplate, node);

      if (node.data?.resultType === 'generateText') {
        return [{
          id: node.id,
          nodeId: node.id,
          generatorId: generator?.id || node.data?.pairedGeneratorId || '',
          type: 'text',
          label: getNodeLabel(node, '文本输入'),
          defaultValue: generator?.data?.user_prompt
            || generator?.data?.promptDraft
            || node.data?.resultText
            || node.data?.result
            || '',
        }];
      }

      if (isUploadImageResult(node)) {
        return [{
          id: node.id,
          nodeId: node.id,
          generatorId: generator?.id || node.data?.pairedGeneratorId || '',
          type: 'image',
          label: getNodeLabel(node, '图片输入'),
          defaultImages: getImageUrls(node),
        }];
      }

      return [];
    });
}

export function applyWorkflowTemplateRunInputs(instance, inputs, valuesByInputId = {}) {
  const inputNodeIds = new Set();
  const inputGeneratorIds = new Set();
  const inputIdMap = instance?.idMap || {};
  const pairByResult = new Map((instance?.pairs || []).map(pair => [pair.resultId, pair.generatorId]));
  const textPatches = new Map();
  const imagePatches = new Map();

  (inputs || []).forEach(input => {
    const resultId = inputIdMap[input.nodeId];
    if (!resultId) return;
    inputNodeIds.add(resultId);
    const generatorId = inputIdMap[input.generatorId] || pairByResult.get(resultId);
    if (generatorId) inputGeneratorIds.add(generatorId);

    if (input.type === 'text') {
      const text = String(valuesByInputId[input.id]?.text ?? valuesByInputId[input.id] ?? input.defaultValue ?? '').trim();
      textPatches.set(resultId, {
        result: text,
        resultText: text,
        promptDraft: text,
        templateInputSource: 'manual',
      });
      if (generatorId) {
        textPatches.set(generatorId, {
          user_prompt: text,
          promptDraft: text,
        });
      }
    }

    if (input.type === 'image') {
      const supplied = valuesByInputId[input.id];
      const imageUrls = Array.isArray(supplied?.imageUrls) && supplied.imageUrls.length > 0
        ? supplied.imageUrls.filter(Boolean)
        : input.defaultImages || [];
      imagePatches.set(resultId, {
        imageUrl: imageUrls[0] || '',
        imageUrls,
        coverIndex: 0,
        imageSource: 'upload',
        templateInputSource: 'manual',
      });
    }
  });

  const nodes = (instance?.nodes || []).map(node => {
    const textPatch = textPatches.get(node.id);
    const imagePatch = imagePatches.get(node.id);
    if (!textPatch && !imagePatch) return node;
    return {
      ...node,
      data: {
        ...node.data,
        ...(textPatch || {}),
        ...(imagePatch || {}),
      },
    };
  });

  return {
    ...instance,
    nodes,
    inputNodeIds,
    inputGeneratorIds,
  };
}
