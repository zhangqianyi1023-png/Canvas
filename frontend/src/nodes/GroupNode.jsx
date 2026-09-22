import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import NodeHoverToolbar from './NodeHoverToolbar';

const DEFAULT_GROUP_LABEL = '未命名组';
const TOOLBAR_CLOSE_MS = 180;

function GroupNode({ id, selected, data }) {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(data?.label || DEFAULT_GROUP_LABEL);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const toolbarTimerRef = useRef(null);
  const skipNextCommitRef = useRef(false);
  const nameInputRef = useRef(null);
  const isMultiSelected = Boolean(data?.isMultiSelected);

  const openToolbar = useCallback(() => {
    window.clearTimeout(toolbarTimerRef.current);
    setToolbarOpen(true);
  }, []);

  const closeToolbar = useCallback(() => {
    window.clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = window.setTimeout(() => setToolbarOpen(false), TOOLBAR_CLOSE_MS);
  }, []);

  useEffect(() => {
    if (!isEditingName) {
      setDraftName(data?.label || DEFAULT_GROUP_LABEL);
    }
  }, [data?.label, isEditingName]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const commitName = () => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      setIsEditingName(false);
      setDraftName(data?.label || DEFAULT_GROUP_LABEL);
      return;
    }
    const nextName = draftName.trim() || DEFAULT_GROUP_LABEL;
    setIsEditingName(false);
    setDraftName(nextName);
    data?.onGroupNameChange?.(id, nextName);
  };

  return (
    <div
      className={`canvas-group-node ${selected ? 'selected' : ''}`}
      onMouseEnter={() => { setIsHovering(true); openToolbar(); }}
      onMouseLeave={() => { setIsHovering(false); closeToolbar(); }}
    >
      <NodeResizer
        isVisible={!data?.isMultiSelected && (selected || isHovering)}
        minWidth={data?.minWidth || 220}
        minHeight={data?.minHeight || 140}
        handleClassName="canvas-node-resize-handle"
        lineClassName="canvas-node-resize-line"
        onResizeEnd={(_, params) => data?.onGroupResize?.(id, { width: params.width, height: params.height })}
      />
      {isEditingName ? (
        <input
          ref={nameInputRef}
          className="canvas-group-name canvas-group-name-input nodrag nopan"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              skipNextCommitRef.current = true;
              event.currentTarget.blur();
            }
          }}
          aria-label="组合名称"
        />
      ) : (
        <button
          type="button"
          className="canvas-group-name canvas-group-name-button nodrag nopan"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            setDraftName(data?.label || DEFAULT_GROUP_LABEL);
            setIsEditingName(true);
          }}
          aria-label="双击编辑组合名称"
        >
          {data?.label || DEFAULT_GROUP_LABEL}
        </button>
      )}
      <NodeHoverToolbar
        hidden={isMultiSelected}
        portal
        forceVisible={!isMultiSelected && (selected || toolbarOpen)}
        onToolbarPointerEnter={openToolbar}
        onToolbarPointerLeave={closeToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[
          {
            id: 'run-group',
            label: '运行',
            icon: 'play',
            onClick: () => data?.onRunGroup?.(id),
          },
          {
            id: 'save-template',
            label: '收藏模板',
            icon: 'layers',
            onClick: () => data?.onSaveTemplate?.(id),
          },
          {
            id: 'ungroup',
            label: '解除组合',
            icon: 'focus',
            onClick: () => data?.onUngroup?.(id),
          },
        ]}
        onDelete={() => data?.onDeleteNode?.(id)}
      />
    </div>
  );
}

export default memo(GroupNode);
