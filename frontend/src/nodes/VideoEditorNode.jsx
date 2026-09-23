import { memo, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import Icon from '../components/Icon';

function VideoEditorNode({ id, data, selected }) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const pointerStartRef = useRef(null);
  const pointerMovedRef = useRef(false);
  const videoUrl = data?.videoUrl || '';
  const title = data?.label || '视频编辑器';
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);

  const handleBodyPointerDown = (event) => {
    pointerMovedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleBodyPointerMove = (event) => {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if ((dx * dx) + (dy * dy) > 16) {
      pointerMovedRef.current = true;
    }
  };

  const handleBodyPointerUp = () => {
    pointerStartRef.current = null;
  };

  const handleOpenEditor = (event) => {
    event.stopPropagation();
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    data?.onOpenVideoEditor?.(id);
  };

  return (
    <div
      className={`custom-node video-editor-node ${selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <div className="node-header">
        <EditableNodeTitle
          icon={<Icon name="movieAi" size={16} />}
          value={title}
          fallback="视频编辑器"
          tagColors={data?.tagColors}
          onChange={(nextLabel) => data?.onNodeTitleChange?.(id, nextLabel)}
          onEditingChange={setIsTitleEditing}
        />
      </div>

      <button
        type="button"
        className="video-editor-node-body"
        onPointerDown={handleBodyPointerDown}
        onPointerMove={handleBodyPointerMove}
        onPointerUp={handleBodyPointerUp}
        onPointerCancel={handleBodyPointerUp}
        onClick={handleOpenEditor}
      >
        {videoUrl ? (
          <video src={videoUrl} muted playsInline preload="metadata" />
        ) : (
          <div className="video-editor-node-empty">
            <Icon name="movieAi" size={30} />
            <span>打开视频编辑器</span>
          </div>
        )}
      </button>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar
        hidden={isNodeDragging || isMultiSelected || !selected || isTitleEditing}
        portal
        forceVisible={!isNodeDragging && selected}
        variant="video-editor"
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[
          {
            id: 'download-video',
            label: '下载视频',
            title: '下载视频',
            icon: 'save',
            disabled: !videoUrl,
            onClick: () => data?.onDownloadVideo?.(id),
          },
          {
            id: 'open-editor',
            label: '打开编辑器',
            title: '打开编辑器',
            tooltipLabel: '打开编辑器',
            icon: 'edit',
            compact: true,
            separatorBefore: true,
            onClick: () => data?.onOpenVideoEditor?.(id),
          },
        ]}
      />
    </div>
  );
}

export default memo(VideoEditorNode);
