import { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import { CANVAS_ADD_MENU_SECTIONS, CANVAS_ADD_MENU_UPLOAD } from '../paneContextMenu';

function tooltipLabel(id, labels = {}) {
  const map = {
    'tool-add': labels.toolAdd || '添加',
    'tool-node-search': labels.toolNodeSearch || 'Node search',
    'tool-upload-file': labels.toolUploadFile || '上传文件',
    'tool-character': labels.toolCharacter || '角色',
    'tool-text-gen': labels.toolText || '文本',
    'tool-image-gen': labels.toolImage || '图片',
    'tool-audio-gen': labels.toolAudio || '音频',
    'tool-video-editor': labels.toolVideoEditor || '视频编辑器',
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
};

function getToolbarItemId(item) {
  return item.toolbarId || TOOLBAR_ID_BY_NODE_TYPE[item.nodeType] || item.id || '';
}

export default function CanvasBottomToolbar({
  onAddNode,
  onUploadFiles,
  materialOpen = false,
  characterOpen = false,
  commentMode = false,
  historyOpen = false,
  appsOpen = false,
  shortcutsOpen = false,
  onToggleMaterials,
  onToggleCharacters,
  onToggleComments,
  onToggleHistory,
  onToggleApps,
  onToggleShortcuts,
  onOpenNodeSearch,
  labels = {},
}) {
  const wrapRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [tipY, setTipY] = useState(0);
  const [open, setOpen] = useState(false);

  const tipLabel = hovered ? tooltipLabel(hovered, labels) : '';

  const getTipY = useCallback((el) => {
    if (!wrapRef.current || !el) return 0;
    const wrapBox = wrapRef.current.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.top - wrapBox.top + box.height / 2;
  }, []);

  const onMouseEnter = useCallback((id, el) => {
    setHovered(id);
    setTipY(getTipY(el));
  }, [getTipY]);

  const onMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelScheduledClose]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const handleClick = useCallback((item, e) => {
    e.stopPropagation();
    if (item.action === 'upload-media') {
      onUploadFiles?.();
      return;
    }
    onAddNode(item.nodeType);
  }, [onAddNode, onUploadFiles]);

  const handleToggleMaterials = useCallback((event) => {
    event.stopPropagation();
    onToggleMaterials?.();
  }, [onToggleMaterials]);

  const handleToggleCharacters = useCallback((event) => {
    event.stopPropagation();
    onToggleCharacters?.();
  }, [onToggleCharacters]);

  const handleToggleHistory = useCallback((event) => {
    event.stopPropagation();
    onToggleHistory?.();
  }, [onToggleHistory]);

  const handleToggleComments = useCallback((event) => {
    event.stopPropagation();
    onToggleComments?.();
  }, [onToggleComments]);

  const handleToggleApps = useCallback((event) => {
    event.stopPropagation();
    onToggleApps?.();
  }, [onToggleApps]);

  const handleOpenShortcuts = useCallback((event) => {
    event.stopPropagation();
    onToggleShortcuts?.();
  }, [onToggleShortcuts]);

  const handleOpenNodeSearch = useCallback((event) => {
    event.stopPropagation();
    setOpen(false);
    onOpenNodeSearch?.();
  }, [onOpenNodeSearch]);

  return (
    <div
      ref={wrapRef}
      className={`canvas-toolbar-wrap ${open ? 'is-open' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={scheduleClose}
    >
      {tipLabel && (
        <span
          className="canvas-toolbar-tip"
          style={{ top: tipY }}
        >
          {tipLabel}
        </span>
      )}
      <div className="canvas-toolbar-rail" aria-label={labels.canvasQuickActions || '画布快捷入口'}>
        <button
          type="button"
          className={`canvas-toolbar-toggle ${open ? 'active' : ''}`}
          aria-label={open ? (labels.collapseNodeTools || '收起节点工具') : (labels.expandNodeTools || '展开节点工具')}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          onMouseEnter={() => setOpen(true)}
        >
          <Icon name="add" size={22} />
        </button>
        <RailButton id="tool-node-search" icon="search" labels={labels} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleOpenNodeSearch} />
        <RailButton id="tool-materials" icon="folder" labels={labels} active={materialOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleMaterials} />
        <RailButton id="tool-apps" icon="grid" labels={labels} active={appsOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleApps} />
        <RailButton id="tool-characters" icon="user" labels={labels} active={characterOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleCharacters} />
        <RailButton id="tool-comments" icon="comment" labels={labels} active={commentMode} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleComments} />
        <RailButton id="tool-history" icon="history" labels={labels} active={historyOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleHistory} />
        <Divider />
        <RailButton id="tool-shortcuts" icon="keyboard" labels={labels} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleOpenShortcuts} />
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => onToggleShortcuts?.(false)} />
      {open && (
        <div className="canvas-toolbar-panel" role="toolbar" aria-label={labels.addNode || '添加节点'}>
          <div className="canvas-toolbar-panel-group">
            <ToolbarPanelItem item={CANVAS_ADD_MENU_UPLOAD} labels={labels} onClick={handleClick} />
          </div>
          {CANVAS_ADD_MENU_SECTIONS.map((section) => (
            <Fragment key={section.label}>
              <Divider />
              <section className="canvas-toolbar-panel-section" aria-label={section.label}>
                <div className="canvas-toolbar-panel-section-title">{section.label}</div>
                <div className="canvas-toolbar-panel-group">
                  {section.items.map(item => (
                    <ToolbarPanelItem
                      item={item}
                      labels={labels}
                      onClick={handleClick}
                      key={item.toolbarId || item.nodeType || item.action || item.label}
                    />
                  ))}
                </div>
              </section>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarPanelItem({ item, labels, onClick }) {
  return (
    <button
      type="button"
      className="canvas-toolbar-panel-item"
      onClick={event => onClick(item, event)}
    >
      <Icon name={item.icon} size={18} />
      <span>{tooltipLabel(getToolbarItemId(item), labels) || item.label}</span>
    </button>
  );
}

function RailButton({ id, icon, text, active, hovered, onMouseEnter, onMouseLeave, onClick, labels = {} }) {
  const cls = [
    'canvas-toolbar-rail-btn',
    text && 'canvas-toolbar-text-btn',
    active && 'active',
    hovered === id && 'hovered',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      aria-label={tooltipLabel(id, labels)}
      onMouseEnter={(e) => onMouseEnter(id, e.currentTarget)}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {text ? <span>{text}</span> : <Icon name={icon} size={18} />}
    </button>
  );
}

function Divider() {
  return <span className="canvas-toolbar-divider" aria-hidden="true" />;
}
