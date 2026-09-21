import { API_BASE } from './apiBase.js';

export const SMART_SPLITTER_MAX_DIRECTIONS = 8;
export const SMART_SPLITTER_MAX_REFERENCE_IMAGES = 10;

export const normalizeModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

const extractImageUrl = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['url', 'imageUrl', 'image_url']) {
      const found = extractImageUrl(value[key]);
      if (found) return found;
    }
  }
  return '';
};

const cleanTextList = (values) => (
  (values || []).map(value => String(value || '').trim()).filter(Boolean)
);

export const normalizeImageList = (values) => (
  [...new Set((values || []).map(extractImageUrl).filter(Boolean))]
);

export function mergeSplitterInputs({
  localPrompt,
  upstreamTexts = [],
  upstreamImages = [],
  uploadedImages = [],
  maxImages = SMART_SPLITTER_MAX_REFERENCE_IMAGES,
}) {
  const local = String(localPrompt || '').trim();
  const texts = cleanTextList(upstreamTexts);
  return {
    request: local || texts.join('\n\n'),
    context: local ? texts.join('\n\n') : '',
    referenceImages: [...new Set([
      ...normalizeImageList(upstreamImages),
      ...normalizeImageList(uploadedImages),
    ])].slice(0, maxImages),
  };
}

export function parseSplitResponse(text) {
  const value = String(text || '').trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('提示词分析结果格式异常');
  }
  const candidate = value.slice(start, end + 1);
  return repairJson(candidate);
}

function repairJson(raw) {
  // 1) try as-is
  try { return JSON.parse(raw); } catch (_) { /* continue */ }

  // 2) strip trailing commas before ] or }
  let fixed = raw.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(fixed); } catch (_) { /* continue */ }

  // 3) balance unmatched brackets
  fixed = balanceBrackets(fixed);
  try { return JSON.parse(fixed); } catch (_) { /* continue */ }

  // 4) also strip trailing commas after balancing
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(fixed); } catch (_) {
    // give up — throw the original error
    JSON.parse(raw);
  }
}

function balanceBrackets(raw) {
  const stack = [];
  const pairs = { '{': '}', '[': ']' };
  const rev = { '}': '{', ']': '[' };
  let result = '';
  for (const ch of raw) {
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      result += ch;
    } else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === rev[ch]) {
        stack.pop();
        result += ch;
      }
      // else skip — stray closer
    } else {
      result += ch;
    }
  }
  // close any remaining open brackets in reverse order
  while (stack.length > 0) {
    const opener = stack.pop();
    result += pairs[opener];
  }
  return result;
}

export function normalizeSplitDirections(parsed, directionCount) {
  const unique = [];
  for (const item of parsed?.prompts || []) {
    const prompt = String(item?.prompt || '').trim();
    if (prompt && !unique.includes(prompt)) unique.push(prompt);
  }
  if (directionCount === 'auto') {
    return unique;
  }
  const expected = Number(directionCount);
  if (unique.length < expected) {
    throw new Error(`需要 ${expected} 个方向，但模型只返回 ${unique.length} 个有效方向`);
  }
  return unique.slice(0, expected);
}

export function normalizeSplitterImageSize(value) {
  const text = String(value || '').trim();
  return text && text !== 'auto' && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(text)
    ? text
    : '';
}

export function buildImageRatioInstruction(imageSize) {
  const normalized = normalizeSplitterImageSize(imageSize);
  if (!normalized) return '';
  return [
    `硬性画幅比例：所有方向和最终生图都必须是 ${normalized}。`,
    `不要输出或暗示任何与 ${normalized} 冲突的比例、横竖屏或尺寸要求。`,
  ].join('\n');
}

export function enforceImageRatioInPrompt(prompt, imageSize) {
  const normalized = normalizeSplitterImageSize(imageSize);
  const text = String(prompt || '').trim();
  if (!normalized) return text;
  const ratioPattern = /(?:^|[，,。；;、\s])(?:比例|画幅|画面比例|aspect[_\s-]*ratio)?\s*[:：]?\s*\d+(?:\.\d+)?\s*[:：]\s*\d+(?:\.\d+)?\s*(?:横屏|竖屏|横版|竖版)?/gi;
  const screenPattern = /\b(?:横屏|竖屏|横版|竖版)\b|(?:横屏|竖屏|横版|竖版)/g;
  const cleaned = text
    .replace(ratioPattern, ' ')
    .replace(screenPattern, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const ratioInstruction = `画幅比例必须为 ${normalized}，不得使用其他比例。`;
  return [ratioInstruction, cleaned].filter(Boolean).join('\n\n');
}

export function buildSplitPrompt({ request, context, directionCount, referenceImageCount = 0, imageSize = '' }) {
  const countRule = directionCount === 'auto'
    ? [
        '拆分方向数量规则（按优先级）：',
        '1. 如果拆分要求中明确用编号列出了多张图片（如「图1」「图2」「第一张图」「第二张图」「图片一」「图片二」等），则必须为每一张被编号的图片生成一个独立方向，且方向数量必须与编号图片数量一致，不受任何上限限制。',
        '2. 如果拆分要求中没有明确编号的图片，请自行判断 2 到 8 个最有价值、差异明显的创意方向。',
      ].join('\n')
    : `必须返回恰好 ${directionCount} 个创意方向。`;
  const referenceRule = Number(referenceImageCount) > 0
    ? [
        `本次有 ${referenceImageCount} 张参考图片，后续生图时会作为图 1 到图 ${referenceImageCount} 传入。`,
        '拆分出的每个方向都必须基于这些参考图，保留参考图中的主体、商品、包装、造型、颜色和可识别特征。',
        '不要把主体替换成无关物品；可以改变的是场景、构图、光线、风格、卖点表达和视觉方向。',
      ].join('\n')
    : '';
  return [
    '你是一个专业的生图提示词拆分器。请把用户需求拆成多个彼此独立、可直接用于文生图的创意方向。',
    countRule,
    '每个方向都必须包含完整的主体、场景、构图、光线、色彩、风格、比例和约束；不要只输出短标题。',
    buildImageRatioInstruction(imageSize),
    '每个方向之间要确保有明确的差异性，避免方向之间雷同或只是换个说法。',
    '所有方向提示词必须使用中文输出。',
    referenceRule,
    context ? `背景上下文：\n${context}` : '',
    `拆分要求：\n${request}`,
    '严格输出 JSON，不要 Markdown，不要解释。格式：{"prompts":[{"prompt":"完整方向提示词"}]}',
  ].filter(Boolean).join('\n\n');
}

export async function requestSplitDirections({
  provider,
  model,
  request,
  context,
  directionCount,
  referenceImageCount = 0,
  imageSize = '',
}) {
  const basePayload = {
    api_base_url: provider.baseUrl,
    api_protocol: provider.protocol || 'openai',
    text_api_mode: provider.textApiMode || 'auto',
    api_key: provider.apiKey,
    model_name: model,
    temperature: 0.3,
    max_tokens: 4096,
  };

  const makeRequest = async (systemPrompt) => {
    const resp = await fetch(`${API_BASE}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...basePayload,
        system_prompt: systemPrompt,
        user_prompt: buildSplitPrompt({ request, context, directionCount, referenceImageCount, imageSize }),
      }),
    });
    const body = await resp.json();
    if (!body.success || !body.response) {
      throw new Error(body.error || '提示词分析失败');
    }
    return body.response;
  };

  // first attempt
  try {
    const text = await makeRequest('你是提示词拆分器，只输出严格 JSON。');
    return normalizeSplitDirections(parseSplitResponse(text), directionCount);
  } catch (err) {
    console.warn('[SmartSplitter] first parse failed, retrying:', err.message);
  }

  // retry with stronger JSON instruction
  try {
    const text = await makeRequest('你是提示词拆分器。必须输出合法 JSON，数组元素之间用逗号分隔，最后一个元素后面不要加逗号。不要输出不完整的 JSON。');
    return normalizeSplitDirections(parseSplitResponse(text), directionCount);
  } catch (err) {
    throw new Error(`提示词分析失败（已重试）: ${err.message}`);
  }
}

export function getProviderModels(provider, type) {
  if (type === 'text') return normalizeModelList(provider?.textModels);
  if (type === 'image') return normalizeModelList(provider?.imageModels);
  if (type === 'video') return normalizeModelList(provider?.videoModels);
  return [];
}

export function getDefaultProviderModel(provider, type) {
  const models = getProviderModels(provider, type);
  const defaultModel = type === 'text'
    ? provider?.defaultTextModel
    : type === 'image'
      ? provider?.defaultImageModel
      : provider?.defaultVideoModel;
  return models.includes(defaultModel) ? defaultModel : models[0] || '';
}

export function getEnabledProvidersWithModels(apiProviders, type) {
  return (apiProviders || [])
    .filter(provider => provider?.enabled !== false && getProviderModels(provider, type).length > 0);
}

export function summarizePrompt(value, maxLength = 54) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '等待输入拆分需求';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
