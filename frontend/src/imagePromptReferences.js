export const buildPromptWithImageMentions = (prompt, imageUrls = [], options = {}) => {
  const validImages = (imageUrls || []).filter(Boolean);
  const body = (prompt || '')
    .replace(/\[\[image_ref:(\d+)]]/g, (_, index) => `图 ${Number(index) + 1}`)
    .trim();
  if (validImages.length === 0) return body;

  const referenceLabel = options.referenceLabel || '参考图片';
  const requiredReferenceLines = options.requireReferences
    ? [
        '',
        `这些${referenceLabel}是本次生成必须继承的核心素材。`,
        '请基于这些图片中的主体、商品、包装、造型、颜色和可识别特征进行创作，不要忽略、替换成无关主体，除非用户提示词明确要求改变。',
      ]
    : [];
  const mentionGuide = [
    `你会收到 ${validImages.length} 张${referenceLabel}。`,
    `${referenceLabel}编号如下：`,
    ...validImages.map((_, index) => `- 图 ${index + 1}：第 ${index + 1} 张${referenceLabel}。用户提示词中的“图 ${index + 1}”指向这张图。`),
    ...requiredReferenceLines,
    '',
    '请严格按这些编号理解用户提示词中的图片引用。',
  ].join('\n');
  return [mentionGuide, body].filter(Boolean).join('\n\n用户提示词：\n');
};
