import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const BOUNDS_PADDING = 14;

const findNodeElement = (id) => {
  const expectedId = String(id);
  return Array.from(document.querySelectorAll('.react-flow__node[data-id]'))
    .find(el => el.getAttribute('data-id') === expectedId) || null;
};

export default function SelectionBoundsOverlay({ nodes, onDragCreate }) {
  const [bounds, setBounds] = useState(null);
  const [pull, setPull] = useState({ x: 0, y: 0 });
  const overlayRef = useRef(null);
  const lineRefsRef = useRef([]);
  const startPosRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const pullRef = useRef({ x: 0, y: 0 });

  const selectedNodes = useMemo(
    () => (nodes || []).filter(node => node.selected && node.type !== 'generator'),
    [nodes],
  );
  const isVisible = selectedNodes.length >= 2;
  const selectedNodeIds = useMemo(
    () => selectedNodes.map(node => node.id),
    [selectedNodes],
  );
  const selectedNodeIdsKey = useMemo(
    () => [...selectedNodeIds].sort().join('|'),
    [selectedNodeIds],
  );

  useEffect(() => {
    if (!isVisible) {
      setBounds(null);
      pullRef.current = { x: 0, y: 0 };
      setPull({ x: 0, y: 0 });
      return undefined;
    }

    const update = () => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let found = false;

      for (const node of selectedNodes) {
        const el = findNodeElement(node.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
        found = true;
      }

      if (!found) {
        setBounds(null);
        return;
      }

      const next = {
        left: minX - BOUNDS_PADDING,
        top: minY - BOUNDS_PADDING,
        width: maxX - minX + BOUNDS_PADDING * 2,
        height: maxY - minY + BOUNDS_PADDING * 2,
      };
      setBounds(prev => (
        prev
        && prev.left === next.left
        && prev.top === next.top
        && prev.width === next.width
        && prev.height === next.height
          ? prev
          : next
      ));
    };

    update();
    const id = window.setInterval(update, 120);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
    };
  }, [isVisible, selectedNodeIdsKey]);

  useEffect(() => {
    if (!isVisible || !bounds) {
      setPull({ x: 0, y: 0 });
      return undefined;
    }

    const handlePointerMove = (event) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
      const centerX = bounds.left + bounds.width;
      const centerY = bounds.top + bounds.height / 2;
      const dx = mouseRef.current.x - centerX;
      const dy = mouseRef.current.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let nextPull = { x: 0, y: 0 };
      if (dist <= 40) {
        nextPull = { x: dx, y: dy };
      } else if (dist < 60) {
        const strength = (1 - (dist - 40) / 20) * 60;
        nextPull = { x: (dx / dist) * strength, y: (dy / dist) * strength };
      }

      const previousPull = pullRef.current;
      if (
        Math.abs(previousPull.x - nextPull.x) > 0.5 ||
        Math.abs(previousPull.y - nextPull.y) > 0.5
      ) {
        pullRef.current = nextPull;
        setPull(nextPull);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    handlePointerMove(mouseRef.current);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [bounds, isVisible]);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!bounds || selectedNodeIds.length < 2) return;

    const startX = event.clientX;
    const startY = event.clientY;
    startPosRef.current = { x: startX, y: startY };
    const anchors = selectedNodeIds
      .map((nodeId) => {
        const el = findNodeElement(nodeId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.right,
          y: rect.top + rect.height / 2,
        };
      })
      .filter(Boolean);
    const connectorAnchors = anchors.length > 0 ? anchors : [{ x: startX, y: startY }];

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;pointer-events:none;';
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

    const createPathData = (anchor, endX, endY) => {
      const direction = endX >= anchor.x ? 1 : -1;
      const offset = Math.max(50, Math.abs(endX - anchor.x) * 0.4);
      return `M${anchor.x},${anchor.y} C${anchor.x + direction * offset},${anchor.y} ${endX - direction * offset},${endY} ${endX},${endY}`;
    };
    const paths = connectorAnchors.map((anchor) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--accent)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '6 4');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('d', createPathData(anchor, startX, startY));
      svg.appendChild(path);
      return path;
    });
    document.body.appendChild(svg);

    overlayRef.current = svg;
    lineRefsRef.current = paths;

    const handlePointerMove = (moveEvent) => {
      const endX = moveEvent.clientX;
      const endY = moveEvent.clientY;
      paths.forEach((path, index) => {
        path.setAttribute('d', createPathData(connectorAnchors[index], endX, endY));
      });
    };

    const cleanupDragPreview = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
        lineRefsRef.current = [];
      }
    };

    const handlePointerCancel = () => {
      cleanupDragPreview();
      startPosRef.current = null;
    };

    const handlePointerUp = (upEvent) => {
      cleanupDragPreview();
      const start = startPosRef.current;
      startPosRef.current = null;
      if (!start || !onDragCreate) return;
      if (Math.hypot(upEvent.clientX - start.x, upEvent.clientY - start.y) > 20) {
        onDragCreate(selectedNodeIds, 'right', upEvent.clientX, upEvent.clientY);
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }, [bounds, onDragCreate, selectedNodeIds]);

  useEffect(() => () => {
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
      lineRefsRef.current = [];
    }
  }, []);

  if (!isVisible || !bounds) return null;

  return createPortal(
    <>
      <div
        className="selection-bounds-overlay"
        style={{
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        }}
        aria-hidden="true"
      />
      <button
        type="button"
        className="selection-bounds-handle"
        style={{
          left: bounds.left + bounds.width,
          top: bounds.top + bounds.height / 2,
          '--selection-handle-pull-x': `${pull.x}px`,
          '--selection-handle-pull-y': `${pull.y}px`,
        }}
        aria-label="批量连接选中节点"
        onPointerDown={handlePointerDown}
      />
    </>,
    document.body,
  );
}
