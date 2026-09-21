import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';

const TOOLBAR_HEIGHT = 44;
const PADDING = 20;
const TOOLBAR_GAP = 8;

const escapeNodeId = (id) => {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(id);
  }
  return String(id).replace(/"/g, '\\"');
};

export default function SelectionToolbar({
  nodes,
  onRunSelected,
  onDownloadSelected,
  onGroupSelected,
  onDeleteSelected,
}) {
  const [pos, setPos] = useState(null);
  const toolbarRef = useRef(null);

  const selectedNodes = useMemo(
    () => (nodes || []).filter(n => n.selected && n.type !== 'generator'),
    [nodes],
  );

  const isVisible = selectedNodes.length >= 2;

  useEffect(() => {
    if (!isVisible) {
      setPos(null);
      return undefined;
    }

    const update = () => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let found = false;
      for (const node of selectedNodes) {
        const el = document.querySelector(`.react-flow__node[data-id="${escapeNodeId(node.id)}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
        found = true;
      }
      if (!found) return;
      setPos(prev => {
        const next = {
          left: (minX + maxX) / 2,
          top: Math.max(TOOLBAR_HEIGHT + PADDING, minY - TOOLBAR_GAP),
        };
        if (prev && prev.left === next.left && prev.top === next.top) return prev;
        return next;
      });
    };

    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [isVisible, selectedNodes]);

  useCanvasWheelHandoff(toolbarRef, { enabled: isVisible && Boolean(pos) });

  if (!isVisible || !pos) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="image-action-toolbar nodrag result-image-portal-toolbar selection-floating-toolbar"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="image-action-btn" title="运行选中" onClick={onRunSelected}>
        <Icon name="play" size={14} />
        <span>运行</span>
      </button>
      <span className="image-action-sep" aria-hidden="true" />
      <button type="button" className="image-action-btn" title="下载选中" onClick={onDownloadSelected}>
        <Icon name="save" size={14} />
        <span>下载</span>
      </button>
      <span className="image-action-sep" aria-hidden="true" />
      <button type="button" className="image-action-btn" title="组合选中" onClick={onGroupSelected}>
        <Icon name="layers" size={14} />
        <span>组合</span>
      </button>
      <span className="image-action-sep" aria-hidden="true" />
      <button type="button" className="image-action-btn danger" title="删除选中" onClick={onDeleteSelected}>
        <Icon name="trash" size={14} />
        <span>删除</span>
      </button>
    </div>,
    document.body,
  );
}
