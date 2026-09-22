import { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';

function tooltipLabel(id) {
  const map = {
    'tool-add': '添加',
    'tool-node-search': 'Node search',
    'tool-upload-file': '上传文件',
    'tool-character': '角色',
    'tool-text-gen': '文本',
    'tool-image-gen': '图片',
    'tool-audio-gen': '音频',
    'tool-video-editor': '视频编辑器',
    'tool-smart-splitter': '智能拆分器',
    'tool-video-gen': '视频',
    'tool-storyboard': '分镜工作台',
    'tool-materials': '素材库',
    'tool-characters': '角色',
    'tool-history': '历史',
    'tool-apps': '应用',
    'tool-shortcuts': 'Keyboard shortcuts',
    'tool-clear': '清空画布',
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
  onToggleMaterials,
  onToggleCharacters,
  onToggleHistory,
  onToggleApps,
  onOpenShortcuts,
  onOpenNodeSearch,
}) {
  const wrapRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [tipY, setTipY] = useState(0);
  const [open, setOpen] = useState(false);

  const tipLabel = hovered ? tooltipLabel(hovered) : '';

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
    onOpenShortcuts?.();
  }, [onOpenShortcuts]);

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
      <div className="canvas-toolbar-rail" aria-label="画布快捷入口">
        <button
          type="button"
          className={`canvas-toolbar-toggle ${open ? 'active' : ''}`}
          aria-label={open ? '收起节点工具' : '展开节点工具'}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          onMouseEnter={() => setOpen(true)}
        >
          <Icon name="add" size={22} />
        </button>
        <RailButton id="tool-node-search" icon="search" hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleOpenNodeSearch} />
        <RailButton id="tool-materials" icon="folder" active={materialOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleMaterials} />
        <RailButton id="tool-apps" icon="aed" active={appsOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleApps} />
        <RailButton id="tool-characters" icon="user" active={characterOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleCharacters} />
        <RailButton id="tool-history" icon="history" active={historyOpen} hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleToggleHistory} />
        <Divider />
        <RailButton id="tool-shortcuts" icon="keyboard" hovered={hovered} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={handleOpenShortcuts} />
      </div>
      {open && (
        <div className="canvas-toolbar-panel" role="toolbar" aria-label="添加节点">
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
                    <span>{tooltipLabel(item.id)}</span>
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

function RailButton({ id, icon, text, active, hovered, onMouseEnter, onMouseLeave, onClick }) {
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
      aria-label={tooltipLabel(id)}
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
