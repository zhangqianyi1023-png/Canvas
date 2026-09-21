const RESULT_NODE_DEFAULT_LABELS = {
  generateText: '文本',
  generateImage: '图片',
  generateVideo: '视频',
  generateAudio: '音频',
  generateStoryboardScript: '分镜工作台',
};

export const resolveResultNodeLabel = (resultType, label) => {
  return String(label || '').trim() || RESULT_NODE_DEFAULT_LABELS[resultType] || '结果';
};
