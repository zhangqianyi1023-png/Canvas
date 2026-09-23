import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import NodeHoverToolbar from './NodeHoverToolbar';

const DEFAULT_GROUP_LABEL = '未命名组';
const TOOLBAR_CLOSE_MS = 180;
const GROUP_BACKGROUND_COLORS = [
  { id: 'none', label: '默认颜色', swatch: '#f4f4f4', background: '' },
  { id: 'red', label: '红色', swatch: '#a94b4d', background: 'rgba(169, 75, 77, 0.28)' },
  { id: 'orange', label: '橙色', swatch: '#9b5c18', background: 'rgba(155, 92, 24, 0.28)' },
  { id: 'yellow', label: '黄色', swatch: '#a89a36', background: 'rgba(168, 154, 54, 0.25)' },
  { id: 'green', label: '绿色', swatch: '#40824f', background: 'rgba(64, 130, 79, 0.25)' },
  { id: 'cyan', label: '青色', swatch: '#3d8394', background: 'rgba(61, 131, 148, 0.25)' },
  { id: 'blue', label: '蓝色', swatch: '#34639c', background: 'rgba(52, 99, 156, 0.28)' },
  { id: 'purple', label: '紫色', swatch: '#81409a', background: 'rgba(129, 64, 154, 0.28)' },
];
const GROUP_BACKGROUND_COLOR_MAP = new Map(GROUP_BACKGROUND_COLORS.map(color => [color.id, color]));

function GroupNode({ id, selected, data }) {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(data?.label || DEFAULT_GROUP_LABEL);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const toolbarTimerRef = useRef(null);
  const skipNextCommitRef = useRef(false);
  const nameInputRef = useRef(null);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);
  const selectedBackgroundColor = GROUP_BACKGROUND_COLOR_MAP.get(data?.groupBackgroundColor) || GROUP_BACKGROUND_COLORS[0];
  const groupStyle = selectedBackgroundColor.background
    ? { '--group-custom-bg-color': selectedBackgroundColor.background }
    : undefined;

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
      className={`canvas-group-node ${selected ? 'selected' : ''}${selectedBackgroundColor.background ? ' has-custom-background' : ''}`}
      style={groupStyle}
      onMouseEnter={() => { setIsHovering(true); openToolbar(); }}
      onMouseLeave={() => { setIsHovering(false); closeToolbar(); }}
    >
      <NodeResizer
        isVisible={!isNodeDragging && !data?.isMultiSelected && (selected || isHovering)}
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
        hidden={isNodeDragging || isMultiSelected}
        portal
        forceVisible={!isNodeDragging && !isMultiSelected && (selected || toolbarOpen)}
        onToolbarPointerEnter={openToolbar}
        onToolbarPointerLeave={closeToolbar}
        tagColors={data?.tagColors}
        actions={[
          {
            id: 'group-background-color',
            label: '背景颜色',
            title: '背景颜色',
            icon: 'palette',
            menuClassName: 'is-group-background-color-menu',
            menuItems: GROUP_BACKGROUND_COLORS.map(color => ({
              id: color.id,
              label: color.label,
              title: color.label,
              color: color.swatch,
              active: selectedBackgroundColor.id === color.id,
              onClick: () => data?.onGroupBackgroundChange?.(id, color.id),
            })),
          },
          {
            id: 'arrange-group',
            label: '整理',
            icon: 'grid',
            menuItems: ['宫格排列', '水平排列', '垂直排列'].map(label => ({
              id: label,
              label,
            })),
          },
          {
            id: 'run-group',
            label: '整组执行',
            icon: 'play',
            separatorBefore: true,
            onClick: () => data?.onRunGroup?.(id),
          },
          {
            id: 'save-template',
            label: '创建模板',
            icon: 'layers',
            onClick: () => data?.onSaveTemplate?.(id),
          },
          {
            id: 'ungroup',
            label: '解组',
            icon: 'focus',
            onClick: () => data?.onUngroup?.(id),
          },
          {
            id: 'download-group',
            label: '下载',
            icon: 'download',
            onClick: () => {},
          },
        ]}
      />
    </div>
  );
}

export default memo(GroupNode);
