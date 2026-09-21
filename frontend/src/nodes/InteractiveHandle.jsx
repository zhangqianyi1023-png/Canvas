import { memo, useCallback, useEffect, useRef } from 'react';
import { useStore } from 'reactflow';
import {
  HANDLE_HIT_HEIGHT,
  HANDLE_HIT_OUTER_REACH,
  HANDLE_HIT_WIDTH,
  HANDLE_VISUAL_SIZE,
  getHandleRestOffset,
  resolveHandleFollowOffset,
} from '../interactiveHandleGeometry.js';
import './InteractiveHandle.css';

const HIDE_DELAY = 180;
const ELASTIC_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const RESET_EVENT = 'interactive-handle-reset';

/**
 * 节点两侧连接抓手。
 *
 * 透明命中带负责捕获节点外侧的鼠标，内部图标在命中带内二维跟随。
 * 离开后弹性回到节点边缘的静止位置；拖拽期间锁定显隐状态。
 */
function InteractiveHandle({ side, nodeId, onDragCreate, extra }) {
  const reactFlowTransform = useStore(state => state.transform);
  const startPosRef = useRef(null);
  const overlayRef = useRef(null);
  const handleRef = useRef(null);
  const visualRef = useRef(null);
  const hideTimerRef = useRef(0);
  const draggingRef = useRef(false);
  const pointerOverHandleRef = useRef(false);

  const setVisualPosition = useCallback((offsetX, offsetY, scale, elastic = false) => {
    const visual = visualRef.current;
    if (!visual) return;
    visual.style.setProperty('--handle-pull-x', `${offsetX}px`);
    visual.style.setProperty('--handle-pull-y', `${offsetY}px`);
    visual.style.setProperty('--handle-scale', String(scale));
    visual.style.transition = elastic
      ? `transform 400ms ${ELASTIC_EASE}, opacity 200ms ease`
      : 'opacity 200ms ease';
  }, []);

  const restOffset = getHandleRestOffset(side);

  const resetMagnet = useCallback(() => {
    setVisualPosition(restOffset, 0, 1, true);
  }, [restOffset, setVisualPosition]);

  const getSiblingHandles = useCallback(() => {
    const node = handleRef.current?.closest('.react-flow__node');
    return node ? [...node.querySelectorAll('.node-interactive-handle')] : [];
  }, []);

  const followPointer = useCallback((event) => {
    if (draggingRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const zoom = reactFlowTransform?.[2] || 1;
    const offset = resolveHandleFollowOffset(
      { x: event.clientX, y: event.clientY },
      rect,
      zoom,
      HANDLE_VISUAL_SIZE,
    );
    setVisualPosition(offset.x, offset.y, 1, false);
  }, [reactFlowTransform, setVisualPosition]);

  const show = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    getSiblingHandles().forEach(handle => handle.classList.add('is-visible'));
  }, [getSiblingHandles]);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const handles = getSiblingHandles();
      const node = handleRef.current?.closest('.react-flow__node');
      const shouldStayVisible = node?.matches(':hover') || handles.some(handle => (
        handle.matches(':hover') || handle.classList.contains('is-dragging')
      ));
      if (shouldStayVisible) return;
      handles.forEach(handle => {
        handle.classList.remove('is-visible');
        handle.dispatchEvent(new Event(RESET_EVENT));
      });
    }, HIDE_DELAY);
  }, [getSiblingHandles]);

  useEffect(() => {
    const handle = handleRef.current;
    const node = handle?.closest('.react-flow__node');
    if (!handle || !node) return undefined;

    node.addEventListener('pointerenter', show);
    node.addEventListener('pointerleave', hide);
    handle.addEventListener(RESET_EVENT, resetMagnet);

    return () => {
      node.removeEventListener('pointerenter', show);
      node.removeEventListener('pointerleave', hide);
      handle.removeEventListener(RESET_EVENT, resetMagnet);
      window.clearTimeout(hideTimerRef.current);
    };
  }, [hide, resetMagnet, show]);

  const handlePointerDown = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();
    draggingRef.current = true;
    handleRef.current?.classList.add('is-dragging');
    const startX = event.clientX;
    const startY = event.clientY;
    startPosRef.current = { x: startX, y: startY };

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('canvas-pending-connection');
    svg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;pointer-events:none;';
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('d', `M${startX},${startY} C${startX},${startY} ${startX},${startY} ${startX},${startY}`);
    svg.appendChild(path);
    document.body.appendChild(svg);

    overlayRef.current = svg;
    const isRight = side === 'right';
    const onPointerMove = (moveEvent) => {
      const endX = moveEvent.clientX;
      const endY = moveEvent.clientY;
      const offset = Math.max(50, Math.abs(endX - startX) * 0.4);
      const cp1x = isRight ? startX + offset : startX - offset;
      const cp2x = isRight ? endX - offset : endX + offset;
      path.setAttribute('d', `M${startX},${startY} C${cp1x},${startY} ${cp2x},${endY} ${endX},${endY}`);
    };

    const finishDrag = (upEvent, cancelled = false) => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
      draggingRef.current = false;
      handleRef.current?.classList.remove('is-dragging');
      resetMagnet();
      if (pointerOverHandleRef.current) show();
      else hide();

      const start = startPosRef.current;
      startPosRef.current = null;
      if (!cancelled && start && Math.hypot(upEvent.clientX - start.x, upEvent.clientY - start.y) > 20) {
        onDragCreate?.(
          nodeId,
          side,
          upEvent.clientX,
          upEvent.clientY,
          extra,
          { x: start.x, y: start.y },
        );
      }
    };

    const onPointerUp = (upEvent) => finishDrag(upEvent);
    const onPointerCancel = (cancelEvent) => finishDrag(cancelEvent, true);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  }, [extra, hide, nodeId, onDragCreate, resetMagnet, show, side]);

  return (
    <div
      ref={handleRef}
      className={`node-interactive-handle ${side}`}
      data-canvas-interactive-handle={side}
      data-node-id={nodeId}
      aria-label={side === 'left' ? '从左侧连接节点' : '从右侧连接节点'}
      onPointerEnter={() => {
        pointerOverHandleRef.current = true;
        show();
      }}
      onPointerLeave={() => {
        pointerOverHandleRef.current = false;
        if (!draggingRef.current) resetMagnet();
        hide();
      }}
      onPointerMove={followPointer}
      onPointerDown={handlePointerDown}
      style={{
        width: HANDLE_HIT_WIDTH,
        height: `min(${HANDLE_HIT_HEIGHT}px, 100%)`,
        [side]: 0,
        [side === 'left' ? 'marginLeft' : 'marginRight']: -HANDLE_HIT_OUTER_REACH,
      }}
    >
      <span
        ref={visualRef}
        className="node-interactive-handle-visual"
        aria-hidden="true"
        style={{ '--handle-pull-x': `${restOffset}px` }}
      />
    </div>
  );
}

export default memo(InteractiveHandle);
