export const PANE_CONTEXT_MENU = [
  { label: '上传文件', icon: 'upload', action: 'upload-media', dividerBefore: false },
  { label: '文本', icon: 'inputMethodFill', nodeType: 'generateText', dividerBefore: true },
  { label: '图片', icon: 'imageGenFill', nodeType: 'generateImage' },
  { label: '视频', icon: 'videoGenFill', nodeType: 'generateVideo' },
  { label: '音频', icon: 'audioGenFill', nodeType: 'generateAudio' },
  { label: '角色', icon: 'user', nodeType: 'character' },
  { label: '智能拆分器', icon: 'smartSplitter', nodeType: 'smartSplitter', dividerBefore: true },
  { label: '分镜工作台', icon: 'storyboardWorkbench', nodeType: 'generateStoryboardScript', dividerBefore: true },
  { label: '视频编辑器', icon: 'movieAi', nodeType: 'videoEditor' },
];
