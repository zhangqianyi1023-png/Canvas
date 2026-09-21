export const DEFAULT_IMAGE_NEGATIVE_PROMPT = [
  '低清晰度、模糊、噪点、畸变、低质量、过曝、欠曝、构图混乱、重复主体、主体残缺、比例错误',
  '文字错误、错别字、水印、Logo 变形、无关品牌、边缘撕裂、手指异常、肢体异常、脸部崩坏、商品包装变形、商品文字错乱',
].join('，');

export const normalizeImageNegativePrompt = (value) => (
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

export const resolveImageNegativePrompt = (value) => (
  value === undefined || value === null
    ? DEFAULT_IMAGE_NEGATIVE_PROMPT
    : normalizeImageNegativePrompt(value)
);

export const mergeDefaultImageNegativePrompt = (value) => {
  const custom = normalizeImageNegativePrompt(value);
  if (!custom) return DEFAULT_IMAGE_NEGATIVE_PROMPT;
  if (custom.includes(DEFAULT_IMAGE_NEGATIVE_PROMPT)) return custom;
  return `${DEFAULT_IMAGE_NEGATIVE_PROMPT}\n${custom}`;
};

export const composeImageGenerationPrompt = (positivePrompt, negativePrompt) => {
  const positive = String(positivePrompt || '').trim();
  const negative = normalizeImageNegativePrompt(negativePrompt);
  return [
    positive,
    negative ? `负面提示词：\n${negative}` : '',
  ].filter(Boolean).join('\n\n');
};
