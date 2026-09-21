import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import { deleteEdge } from '../edgeRegistry';
import Icon from '../components/Icon';

// 自定义 ReactFlow edge：
// - hover 时线条变粗变高亮 + 中点浮现 X 删除按钮
// - 选中时线条持续高亮（用于键盘选中态可见），但 X 按钮只在 hover 时出现
// - 保持端点拖拽重连、Backspace 删除等 ReactFlow 默认行为
//
// Hover bridge：线条的 hit-area（12px）比按钮（28px）窄得多，从线条斜着
// 移到按钮必然先离开 hit-area。为避免按钮在用户移过去的过程中消失，
// (1) 按钮常驻 DOM，用 CSS class 切显隐；(2) 离开线条/按钮都延迟 100ms
// 才关 hover，期间对方的 pointerenter 可以取消关闭。
function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}) {
  const [hovered, setHovered] = useState(false);
  const leaveTimerRef = useRef(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isStrokeActive = hovered || selected;
  const pathStyle = isStrokeActive
    ? { ...style, stroke: 'var(--accent)', strokeWidth: 2.5 }
    : style;

  const cancelHide = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHovered(true);
  }, []);

  const scheduleHide = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setHovered(false);
    }, 100);
  }, []);

  useEffect(() => () => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
    }
  }, []);

  return (
    <>
      <BaseEdge path={edgePath} style={pathStyle} markerEnd={markerEnd} />
      {/* 透明加粗 hit-area，12px stroke 方便 hover 但不压住端点重连 handle */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        className="edge-hit-area"
        onPointerEnter={cancelHide}
        onPointerLeave={scheduleHide}
      />
      <EdgeLabelRenderer>
        {/*
          按钮常驻 DOM：避免鼠标从线条移向按钮时，按钮因短暂 unmount
          收不到 pointerenter 而闪烁。显隐用 CSS class 控制。
        */}
        <button
          type="button"
          className={`edge-delete-btn nodrag nopan ${hovered ? 'is-visible' : ''}`.trim()}
          aria-label="删除连线"
          tabIndex={-1}
          style={{
            '--edge-btn-x': `${labelX}px`,
            '--edge-btn-y': `${labelY}px`,
            position: 'absolute',
            zIndex: 1000,
          }}
          onPointerEnter={cancelHide}
          onPointerLeave={scheduleHide}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            deleteEdge(id);
          }}
          title="断开连线"
        >
          <Icon name="x" size={12} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(DeletableEdge);
