import test from 'node:test';
import assert from 'node:assert/strict';
import { PANE_CONTEXT_MENU } from './paneContextMenu.js';

test('blank canvas action menu contains exactly the requested node types', () => {
  assert.deepEqual(
    PANE_CONTEXT_MENU.map(({ label, nodeType, dividerBefore }) => ({ label, nodeType, dividerBefore: Boolean(dividerBefore) })),
    [
      { label: '上传文件', nodeType: undefined, dividerBefore: false },
      { label: '文本', nodeType: 'generateText', dividerBefore: true },
      { label: '图片', nodeType: 'generateImage', dividerBefore: false },
      { label: '视频', nodeType: 'generateVideo', dividerBefore: false },
      { label: '音频', nodeType: 'generateAudio', dividerBefore: false },
      { label: '角色', nodeType: 'character', dividerBefore: false },
      { label: '智能拆分器', nodeType: 'smartSplitter', dividerBefore: true },
      { label: '分镜工作台', nodeType: 'generateStoryboardScript', dividerBefore: true },
      { label: '视频编辑器', nodeType: 'videoEditor', dividerBefore: false },
      { label: 'Playlist', nodeType: 'playlist', dividerBefore: false },
      { label: '3D Viewfinder', nodeType: 'threeD', dividerBefore: false },
    ],
  );
});

test('blank canvas action menu exposes file upload before node creation', () => {
  assert.deepEqual(
    PANE_CONTEXT_MENU.slice(0, 2).map(({ label, action, dividerBefore }) => ({
      label,
      action,
      dividerBefore: Boolean(dividerBefore),
    })),
    [
      { label: '上传文件', action: 'upload-media', dividerBefore: false },
      { label: '文本', action: undefined, dividerBefore: true },
    ],
  );
});
