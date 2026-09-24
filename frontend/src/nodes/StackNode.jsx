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
      className={`canvas-group-node canvas-stack-node ${selected ? 'selected' : ''}${data?.isDropTarget ? ' is-drop-target' : ''}`}
      onMouseEnter={() => { openToolbar(); }}
      onMouseLeave={closeToolbar}
      onDoubleClick={(event) => {
        event.stopPropagation();
        data?.onOpenStack?.(id);
      }}
      onClick={(event) => {
        if (event.detail > 1) return;
        data?.onOpenStack?.(id);
      }}
    >
      <div className="canvas-stack-card" role="button" tabIndex={0} aria-label={`${data?.count || 0} 个节点的素材堆`}>
        <span className="canvas-stack-sheet sheet-back" aria-hidden="true" />
        <span className="canvas-stack-sheet sheet-mid" aria-hidden="true" />
        <span className="canvas-stack-sheet sheet-front" aria-hidden="true">
          <span className="canvas-stack-icon" aria-hidden="true" />
        </span>
        <span className="canvas-stack-count">{data?.count || 0}</span>
        <span className="canvas-stack-label">{data?.label || '素材堆'}</span>
      </div>
      <NodeHoverToolbar
        hidden={isNodeDragging}
        portal
        forceVisible={!isNodeDragging && (selected || toolbarOpen)}
        onToolbarPointerEnter={openToolbar}
        onToolbarPointerLeave={closeToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[
          {
            id: 'unstack',
            label: '取消堆叠',
            title: '取消堆叠',
            icon: 'layers',
            onClick: () => data?.onUnstack?.(id),
          },
          {
            id: 'save-stack',
            label: '添加到资源库',
            title: '添加到资源库',
            icon: 'folder',
            onClick: () => data?.onSaveStackToLibrary?.(id),
          },
          {
            id: 'download-stack',
            label: '下载',
            title: '下载',
            icon: 'download',
            onClick: () => data?.onDownloadStack?.(id),
          },
        ]}
      />
    </div>
  );
}

export default memo(StackNode);
