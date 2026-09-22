import { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';

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
    'tool-materials': labels.toolMaterials || '素材库',
    'tool-characters': labels.toolCharacters || '角色',
    'tool-history': labels.toolHistory || '历史',
    'tool-apps': labels.toolTemplates || labels.toolApps || '模板库',
    'tool-shortcuts': labels.toolShortcuts || 'Keyboard shortcuts',
    'tool-clear': labels.toolClear || '清空画布',
  };
  return map[id] || '';
}

const ADD_NODE_OPTIONS = [
  { id: 'tool-upload-file', icon: 'upload', action: 'upload-media' },
  { id: 'tool-text-gen', icon: 'inputMethodFill', type: 'generateText' },
  { id: 'tool-image-gen', icon: 'imageGenFill', type: 'generateImage' },
  { id: 'tool-video-gen', icon: 'videoGenFill', type: 'generateVideo' },
  { id: 'tool-audio-gen', icon: 'audioGenFill', type: 'generateAudio' },
  { id: 'tool-character', icon: 'user', type: 'character' },
  { id: 'tool-smart-splitter', icon: 'smartSplitter', type: 'smartSplitter' },
  { id: 'tool-storyboard', icon: 'storyboardWorkbench', type: 'generateStoryboardScript' },
  { id: 'tool-video-editor', icon: 'movieAi', type: 'videoEditor' },
];

const NODE_TOOL_GROUPS = [
  ADD_NODE_OPTIONS.slice(0, 1),
  ADD_NODE_OPTIONS.slice(1, 6),
  ADD_NODE_OPTIONS.slice(6),
];

export default function CanvasBottomToolbar({
  onAddNode,
  onUploadFiles,
  materialOpen = false,
  characterOpen = false,
  historyOpen = false,
  appsOpen = false,
  shortcutsOpen = false,
  onToggleMaterials,
  onToggleCharacters,
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
    onAddNode(item.type);
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
        <RailButton id="tool-history" icon="history" labels={labels} active={historyOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleHistory} />
        <Divider />
        <RailButton id="tool-shortcuts" icon="keyboard" labels={labels} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleOpenShortcuts} />
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => onToggleShortcuts?.(false)} />
      {open && (
        <div className="canvas-toolbar-panel" role="toolbar" aria-label={labels.addNode || '添加节点'}>
          {NODE_TOOL_GROUPS.map((group, groupIndex) => (
            <Fragment key={group[0].id}>
              {groupIndex > 0 && <Divider />}
              <div className="canvas-toolbar-panel-group">
                {group.map(item => (
                  <button
                    type="button"
                    className="canvas-toolbar-panel-item"
                    key={item.id}
                    onClick={event => handleClick(item, event)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{tooltipLabel(item.id, labels)}</span>
                  </button>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
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
