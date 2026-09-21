export const COPILOT_MAX_TARGET_NODES = 6;

const cleanText = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

const firstValue = (values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || '';

const getTargetPrompt = (resultType, data, generatorData) => {
  if (resultType === 'generateImage') {
    return firstValue([generatorData.image_prompt, generatorData.promptDraft, data.image_prompt, data.promptDraft]);
  }
  if (resultType === 'generateVideo') {
    return firstValue([generatorData.video_prompt, generatorData.promptDraft, data.video_prompt, data.promptDraft]);
  }
  if (resultType === 'generateAudio') {
    return firstValue([generatorData.audio_text, generatorData.promptDraft, data.audio_text, data.promptDraft]);
  }
  if (resultType === 'generateStoryboardScript') {
    return firstValue([
      generatorData.storyboard_script_prompt,
      generatorData.promptDraft,
      data.storyboard_script_prompt,
      data.promptDraft,
    ]);
  }
  return firstValue([generatorData.user_prompt, generatorData.promptDraft, data.promptDraft]);
};

const getTargetKind = (node, resultType) => {
  if (resultType === 'generateImage') return 'image';
  if (resultType === 'generateVideo' || node?.type === 'videoInput' || node?.type === 'videoEditor') return 'video';
  if (resultType === 'generateAudio') return 'audio';
  if (resultType === 'generateText' || resultType === 'generateStoryboardScript' || node?.type === 'prompt') return 'text';
  return 'node';
};

const hashTargetRevision = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export function buildCopilotNodeTarget(node, generatorNode = null) {
  if (!node?.id || node.type === 'generator') return null;

  const data = node.data || {};
  const generatorData = generatorNode?.data || {};
  const resultType = cleanText(data.resultType || generatorData.generatorType, 80);
  const kind = getTargetKind(node, resultType);
  const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls.filter(Boolean) : [];
  const coverIndex = Math.max(0, Math.min(Number(data.coverIndex) || 0, Math.max(0, imageUrls.length - 1)));
  const thumbnailUrl = kind === 'image'
    ? firstValue([data.imageUrl, imageUrls[coverIndex], imageUrls[0]])
    : kind === 'video'
      ? firstValue([data.thumbnailUrl, data.posterUrl, data.coverImageUrl])
      : '';
  const content = cleanText(
    data.result
      ?? data.defaultText
      ?? data.text
      ?? data.storyboardVoiceoverScript
      ?? '',
    12000,
  );
  const prompt = cleanText(getTargetPrompt(resultType, data, generatorData), 8000);
  const label = cleanText(data.label || data.title || node.id, 120) || node.id;
  const canEditContent = node.type === 'result' && resultType === 'generateText';
  const canEditPrompt = Boolean(generatorNode?.id && [
    'generateText',
    'generateImage',
    'generateVideo',
    'generateAudio',
    'generateStoryboardScript',
  ].includes(resultType));
  const revisionSource = JSON.stringify({ label, content, prompt, thumbnailUrl, resultType });

  return {
    id: node.id,
    nodeType: node.type,
    resultType,
    label,
    kind,
    thumbnailUrl,
    content,
    prompt,
    canEditContent,
    canEditPrompt,
    canRename: true,
    revision: hashTargetRevision(revisionSource),
  };
}

export function buildCopilotNodeTargets(nodes = [], targetNodeIds = [], pairMap = {}) {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  return [...new Set(targetNodeIds)]
    .slice(0, COPILOT_MAX_TARGET_NODES)
    .map((nodeId) => {
      const node = nodesById.get(nodeId);
      const generatorId = pairMap?.[nodeId] || node?.data?.pairedGeneratorId;
      return buildCopilotNodeTarget(node, generatorId ? nodesById.get(generatorId) : null);
    })
    .filter(Boolean);
}

export function getCopilotSelectedNodeIds(nodes = []) {
  return nodes
    .filter(node => node?.selected && node?.id && node.type !== 'generator')
    .map(node => node.id)
    .slice(0, COPILOT_MAX_TARGET_NODES);
}
