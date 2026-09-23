import { memo, useCallback, useEffect, useRef, useState } from 'react';
import NodeHoverToolbar from './NodeHoverToolbar';

function StackNode({ id, selected, data }) {
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const timerRef = useRef(null);
  const isNodeDragging = Boolean(data?.isNodeDragging);
  const openToolbar = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setToolbarOpen(true);
  }, []);
  const closeToolbar = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToolbarOpen(false), 180);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <div
      className={`canvas-group-node canvas-stack-node ${selected ? 'selected' : ''}`}
      onMouseEnter={() => { openToolbar(); }}
      onMouseLeave={closeToolbar}
    >
      <div className="canvas-stack-card" role="status" aria-label={`${data?.count || 0} 个节点的素材堆`}>
        <span className="canvas-stack-count">{data?.count || 0}</span>
        <span className="canvas-stack-label">{data?.label || '素材堆'}</span>
        <span className="canvas-stack-hint">点击工具栏展开内容</span>
      </div>
      <NodeHoverToolbar
        hidden={isNodeDragging}
        portal
        forceVisible={!isNodeDragging && (selected || toolbarOpen)}
        onToolbarPointerEnter={openToolbar}
        onToolbarPointerLeave={closeToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[{
          id: 'unstack',
          label: '展开',
          icon: 'layers',
          onClick: () => data?.onUnstack?.(id),
        }]}
      />
    </div>
  );
}

export default memo(StackNode);
