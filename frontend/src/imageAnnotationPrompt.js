export const VISUAL_ANNOTATION_MODE = 'visual-markup';

export const buildVisualAnnotationPrompt = (instruction = '') => {
  const extraInstruction = String(instruction || '').trim();
  return [
    '请根据左侧原图和批注图修改图片。',
    '批注图中的标记用于指出需要处理的区域或内容。',
    extraInstruction ? `补充说明：${extraInstruction}` : '',
  ].filter(Boolean).join('\n');
};

export const buildVisualAnnotationReferences = (imageUrl, annotatedImageDataUrl) => ({
  connectedImages: [imageUrl].filter(Boolean),
  uploadedReferenceImages: [annotatedImageDataUrl].filter(Boolean),
});
