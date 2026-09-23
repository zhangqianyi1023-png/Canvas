export const CANVAS_NODE_CREATE_MENU = [
  { label: '文本', icon: 'inputMethodFill', nodeType: 'generateText' },
  { label: '图片', icon: 'imageGenFill', nodeType: 'generateImage' },
  { label: '视频', icon: 'videoGenFill', nodeType: 'generateVideo' },
  { label: '音频', icon: 'audioGenFill', nodeType: 'generateAudio' },
];

export const CANVAS_ADD_NODE_MENU = [
  ...CANVAS_NODE_CREATE_MENU,
  { label: '角色', icon: 'user', nodeType: 'character', toolbarId: 'tool-character' },
];

export const CANVAS_ASSISTANT_TOOL_MENU = [
  { label: '智能拆分器', icon: 'smartSplitter', nodeType: 'smartSplitter' },
  { label: '分镜工作台', icon: 'storyboardWorkbench', nodeType: 'generateStoryboardScript' },
  { label: '视频编辑器', icon: 'movieAi', nodeType: 'videoEditor' },
  { label: '图片编辑器', icon: 'imageGenFill', nodeType: 'imageEditor' },
];

export const CANVAS_ADD_MENU_UPLOAD = {
  label: '上传文件',
  icon: 'upload',
  action: 'upload-media',
  toolbarId: 'tool-upload-file',
};

export const CANVAS_ADD_MENU_SECTIONS = [
  { label: '添加节点', items: CANVAS_ADD_NODE_MENU },
  { label: '辅助工具', items: CANVAS_ASSISTANT_TOOL_MENU },
];

export const CANVAS_ADD_MENU = [
  CANVAS_ADD_MENU_UPLOAD,
  { kind: 'divider' },
  { kind: 'section-title', label: '添加节点' },
  ...CANVAS_ADD_NODE_MENU,
  { kind: 'divider' },
  { kind: 'section-title', label: '辅助工具' },
  ...CANVAS_ASSISTANT_TOOL_MENU,
];

export const PANE_CONTEXT_MENU = [
  { label: '上传', icon: 'upload', action: 'upload-media' },
  { label: '添加资产', icon: 'folder', action: 'open-materials' },
  { label: '添加节点', icon: 'add', children: CANVAS_NODE_CREATE_MENU, dividerBefore: true },
  { label: '添加辅助工具', icon: 'apps', children: CANVAS_ASSISTANT_TOOL_MENU },
  { label: '撤销', icon: 'undo', action: 'undo-canvas', shortcut: '⌘Z', dividerBefore: true },
  { label: '重做', icon: 'redo', action: 'redo-canvas', shortcut: '⇧⌘Z' },
  { label: '粘贴', icon: 'copy', action: 'paste-nodes', shortcut: '⌘V', dividerBefore: true },
];
