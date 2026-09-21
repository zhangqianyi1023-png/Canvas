const stableStringify = (value) => {
  if (typeof value === 'function') return '[function]';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`;
};

const uniqueValues = (values = []) => [...new Set((values || []).filter(Boolean))];

const pickField = (data, payload, key, fallback = '') => (
  Object.prototype.hasOwnProperty.call(data || {}, key)
    ? data[key] ?? fallback
    : payload?.[key] ?? fallback
);

export const resolveCharacterPayloadName = (data = {}) => {
  const payloadName = String(data?.characterPayload?.characterName || '').trim();
  const dataName = String(data?.characterName || '').trim();
  const labelName = String(data?.label || '').trim();
  return payloadName || dataName || (labelName && labelName !== '角色' ? labelName : '') || '未命名角色';
};

export const buildCharacterPrompt = (payload = {}) => ([
  payload.characterName ? `角色名称：${payload.characterName}` : '',
  payload.description ? `角色设定：${payload.description}` : '',
  payload.mainVisualPrompt ? `主视觉提示：${payload.mainVisualPrompt}` : '',
  payload.threeViewPrompt ? `三视图提示：${payload.threeViewPrompt}` : '',
  payload.voiceDescription ? `声音设定：${payload.voiceDescription}` : '',
  payload.audioUrl ? '声音参考：已提供音频 URL，后续配音或视频生成应继承其音色、语速、情绪和说话方式。' : '',
  payload.images?.length > 0 ? `角色参考图：${payload.images.length} 张。生成时保持五官、发型、服装、年龄感、气质和角色身份一致。` : '',
]).filter(Boolean).join('\n');

export const buildCharacterPayloadFromData = (data = {}) => {
  const payload = data?.characterPayload || {};
  const images = uniqueValues([
    ...(Array.isArray(payload.images) ? payload.images : []),
    ...(Array.isArray(data.images) ? data.images : []),
    payload.mainVisualImageUrl,
    data.mainVisualImageUrl,
    payload.threeViewImageUrl,
    data.threeViewImageUrl,
    payload.imageUrl,
    data.imageUrl,
  ]);
  const nextPayload = {
    characterName: resolveCharacterPayloadName(data),
    description: pickField(data, payload, 'description'),
    voiceDescription: pickField(data, payload, 'voiceDescription'),
    mainVisualPrompt: pickField(data, payload, 'mainVisualPrompt'),
    threeViewPrompt: pickField(data, payload, 'threeViewPrompt'),
    mainVisualImageUrl: pickField(data, payload, 'mainVisualImageUrl', data.imageUrl || ''),
    threeViewImageUrl: pickField(data, payload, 'threeViewImageUrl'),
    audioUrl: pickField(data, payload, 'audioUrl'),
    images,
  };
  const characterPrompt = Object.prototype.hasOwnProperty.call(data, 'characterPrompt')
    ? data.characterPrompt || buildCharacterPrompt(nextPayload)
    : payload.characterPrompt || buildCharacterPrompt(nextPayload);
  return {
    ...nextPayload,
    imageUrl: nextPayload.mainVisualImageUrl || images[0] || '',
    characterPrompt,
  };
};

export const areCharacterPayloadsEqual = (left = null, right = null) => (
  stableStringify(left || null) === stableStringify(right || null)
);
