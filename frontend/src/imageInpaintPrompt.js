export const buildImageInpaintPrompt = ({ instruction = '', imageSize = {} } = {}) => [
  '请基于参考原图进行局部重绘。',
  '系统会提供与原图尺寸一致的遮罩；遮罩透明区域允许重绘，其余区域必须保持原图不变。',
  imageSize?.width && imageSize?.height ? `遮罩尺寸：${imageSize.width}x${imageSize.height}，与原图一致。` : '',
  `重绘要求：${instruction || ''}`,
  '输出要求：保持原图主体、构图、透视、光线和整体风格，只重绘遮罩覆盖区域。',
].filter(Boolean).join('\n');
