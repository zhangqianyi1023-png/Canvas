import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';
import CanvasAddMenuPanel, { toolbarLabel } from './CanvasAddMenuPanel';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';

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

  const tipLabel = hovered ? toolbarLabel(hovered, labels) : '';

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
        <CanvasAddMenuPanel labels={labels} onItemClick={handleClick} />
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
      aria-label={toolbarLabel(id, labels)}
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
