import { Fragment } from 'react';
import Icon from './Icon';
import { CANVAS_ADD_MENU_SECTIONS, CANVAS_ADD_MENU_UPLOAD } from '../paneContextMenu';

export function toolbarLabel(id, labels = {}) {
  const map = {
    'tool-add': labels.toolAdd || '添加',
    'tool-node-search': labels.toolNodeSearch || 'Node search',
    'tool-upload-file': labels.toolUploadFile || '上传文件',
    'tool-character': labels.toolCharacter || '角色',
    'tool-text-gen': labels.toolText || '文本',
    'tool-image-gen': labels.toolImage || '图片',
    'tool-audio-gen': labels.toolAudio || '音频',
    'tool-video-editor': labels.toolVideoEditor || '视频编辑器',
    'tool-three-d': labels.toolThreeD || '3D',
    'tool-smart-splitter': labels.toolSmartSplitter || '智能拆分器',
    'tool-video-gen': labels.toolVideo || '视频',
    'tool-storyboard': labels.toolStoryboard || '分镜工作台',
    'tool-image-editor': labels.toolImageEditor || '图片编辑器',
    'tool-materials': labels.toolMaterials || '素材库',
    'tool-characters': labels.toolCharacters || '角色',
    'tool-comments': labels.toolComments || '评论',
    'tool-history': labels.toolHistory || '历史',
    'tool-apps': labels.toolTemplates || labels.toolApps || '模板库',
    'tool-shortcuts': labels.toolShortcuts || 'Keyboard shortcuts',
    'tool-clear': labels.toolClear || '清空画布',
  };
  return map[id] || '';
}

const TOOLBAR_ID_BY_NODE_TYPE = {
  generateText: 'tool-text-gen',
  generateImage: 'tool-image-gen',
  generateVideo: 'tool-video-gen',
  generateAudio: 'tool-audio-gen',
  smartSplitter: 'tool-smart-splitter',
  generateStoryboardScript: 'tool-storyboard',
  videoEditor: 'tool-video-editor',
  imageEditor: 'tool-image-editor',
  threeD: 'tool-three-d',
};

function getToolbarItemId(item) {
  return item.toolbarId || TOOLBAR_ID_BY_NODE_TYPE[item.nodeType] || item.id || '';
}

function descriptionLabel(id, labels = {}) {
  const map = {
    'tool-upload-file': labels.uploadFileDescription || '支持图片、视频、音频和3D模型',
    'tool-text-gen': labels.toolTextDescription || '脚本、广告词、品牌文案',
    'tool-image-gen': labels.toolImageDescription || '宣传图、海报、封面',
    'tool-video-gen': labels.toolVideoDescription || '宣传视频、动画、电影',
    'tool-three-d': labels.toolThreeDDescription || '生成3D场景与对象',
    'tool-audio-gen': labels.toolAudioDescription || '音乐、配音、音效',
    'tool-character': labels.toolCharacterDescription || '角色设定、形象、声音',
    'tool-smart-splitter': labels.toolSmartSplitterDescription || '拆分素材与镜头',
    'tool-storyboard': labels.toolStoryboardDescription || '分镜脚本和镜头规划',
    'tool-video-editor': labels.toolVideoEditorDescription || '剪辑和处理视频',
    'tool-image-editor': labels.toolImageEditorDescription || '编辑和处理图片',
  };
  return map[id] || '';
}

export function CanvasAddMenuItem({ item, labels, onClick }) {
  const itemId = getToolbarItemId(item);
  const description = descriptionLabel(itemId, labels);

  return (
    <button
      type="button"
      className={`canvas-toolbar-panel-item ${description ? 'has-description' : ''}`}
      onClick={event => onClick(item, event)}
    >
      <Icon name={item.icon} size={18} />
      <span className="canvas-toolbar-panel-item-copy">
        <span className="canvas-toolbar-panel-item-label">{toolbarLabel(itemId, labels) || item.label}</span>
        {description ? <span className="canvas-toolbar-panel-item-description">{description}</span> : null}
      </span>
    </button>
  );
}

export default function CanvasAddMenuPanel({
  labels = {},
  onItemClick,
  className = '',
  style,
  panelRef,
  role = 'toolbar',
  ariaLabel,
}) {
  return (
    <div
      ref={panelRef}
      className={`canvas-toolbar-panel ${className}`.trim()}
      style={style}
      role={role}
      aria-label={ariaLabel || labels.addNode || '添加节点'}
    >
      <div className="canvas-toolbar-panel-group">
        <CanvasAddMenuItem item={CANVAS_ADD_MENU_UPLOAD} labels={labels} onClick={onItemClick} />
      </div>
      {CANVAS_ADD_MENU_SECTIONS.map(section => (
        <Fragment key={section.label}>
          <section className="canvas-toolbar-panel-section" aria-label={section.label}>
            <div className="canvas-toolbar-panel-section-title">{section.label}</div>
            <div className="canvas-toolbar-panel-group">
              {section.items.map(item => (
                <CanvasAddMenuItem
                  item={item}
                  labels={labels}
                  onClick={onItemClick}
                  key={item.toolbarId || item.nodeType || item.action || item.label}
                />
              ))}
            </div>
          </section>
        </Fragment>
      ))}
    </div>
  );
}
