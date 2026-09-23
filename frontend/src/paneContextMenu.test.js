import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_ADD_MENU,
  CANVAS_ADD_NODE_MENU,
  CANVAS_ASSISTANT_TOOL_MENU,
  CANVAS_NODE_CREATE_MENU,
  PANE_CONTEXT_MENU,
} from './paneContextMenu.js';

test('basic node submenu contains only core node types', () => {
  assert.deepEqual(
    CANVAS_NODE_CREATE_MENU.map(({ label, nodeType }) => ({ label, nodeType })),
    [
      { label: '文本', nodeType: 'generateText' },
      { label: '图片', nodeType: 'generateImage' },
      { label: '视频', nodeType: 'generateVideo' },
      { label: '音频', nodeType: 'generateAudio' },
    ],
  );
});

test('double-click canvas add menu matches the grouped creation menu', () => {
  assert.deepEqual(
    CANVAS_ADD_MENU.map(({ kind, label, action, nodeType }) => ({ kind, label, action, nodeType })),
    [
      { kind: undefined, label: '上传文件', action: 'upload-media', nodeType: undefined },
      { kind: 'divider', label: undefined, action: undefined, nodeType: undefined },
      { kind: 'section-title', label: '添加节点', action: undefined, nodeType: undefined },
      { kind: undefined, label: '文本', action: undefined, nodeType: 'generateText' },
      { kind: undefined, label: '图片', action: undefined, nodeType: 'generateImage' },
      { kind: undefined, label: '视频', action: undefined, nodeType: 'generateVideo' },
      { kind: undefined, label: '音频', action: undefined, nodeType: 'generateAudio' },
      { kind: undefined, label: '角色', action: undefined, nodeType: 'character' },
      { kind: 'divider', label: undefined, action: undefined, nodeType: undefined },
      { kind: 'section-title', label: '辅助工具', action: undefined, nodeType: undefined },
      { kind: undefined, label: '智能拆分器', action: undefined, nodeType: 'smartSplitter' },
      { kind: undefined, label: '分镜工作台', action: undefined, nodeType: 'generateStoryboardScript' },
      { kind: undefined, label: '视频编辑器', action: undefined, nodeType: 'videoEditor' },
      { kind: undefined, label: '图片编辑器', action: undefined, nodeType: 'imageEditor' },
    ],
  );
});

test('large add menu node group includes character after media nodes', () => {
  assert.deepEqual(
    CANVAS_ADD_NODE_MENU.map(({ label, nodeType }) => ({ label, nodeType })),
    [
      { label: '文本', nodeType: 'generateText' },
      { label: '图片', nodeType: 'generateImage' },
      { label: '视频', nodeType: 'generateVideo' },
      { label: '音频', nodeType: 'generateAudio' },
      { label: '角色', nodeType: 'character' },
    ],
  );
});

test('assistant tool submenu contains the requested tools', () => {
  assert.deepEqual(
    CANVAS_ASSISTANT_TOOL_MENU.map(({ label, nodeType }) => ({ label, nodeType })),
    [
      { label: '智能拆分器', nodeType: 'smartSplitter' },
      { label: '分镜工作台', nodeType: 'generateStoryboardScript' },
      { label: '视频编辑器', nodeType: 'videoEditor' },
      { label: '图片编辑器', nodeType: 'imageEditor' },
    ],
  );
});

test('right-click canvas menu exposes upload, assets, grouped creation, history, and paste', () => {
  assert.deepEqual(
    PANE_CONTEXT_MENU.map(({ label, action, shortcut, children, dividerBefore }) => ({
      label,
      action,
      shortcut,
      hasChildren: Array.isArray(children),
      dividerBefore: Boolean(dividerBefore),
    })),
    [
      { label: '上传', action: 'upload-media', shortcut: undefined, hasChildren: false, dividerBefore: false },
      { label: '添加资产', action: 'open-materials', shortcut: undefined, hasChildren: false, dividerBefore: false },
      { label: '添加节点', action: undefined, shortcut: undefined, hasChildren: true, dividerBefore: true },
      { label: '添加辅助工具', action: undefined, shortcut: undefined, hasChildren: true, dividerBefore: false },
      { label: '撤销', action: 'undo-canvas', shortcut: '⌘Z', hasChildren: false, dividerBefore: true },
      { label: '重做', action: 'redo-canvas', shortcut: '⇧⌘Z', hasChildren: false, dividerBefore: false },
      { label: '粘贴', action: 'paste-nodes', shortcut: '⌘V', hasChildren: false, dividerBefore: true },
    ],
  );
});
