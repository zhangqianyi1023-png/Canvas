import { memo, useCallback, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import Icon from '../components/Icon';
import EditableNodeTitle from './EditableNodeTitle';
import { summarizePrompt } from '../smartSplitter';
import { getSmartSplitterPhaseLabel, normalizeSmartSplitterPhase } from '../smartSplitterLifecycle';

const TOOLBAR_CLOSE_MS = 180;

function SmartSplitterNode({ id, selected, data }) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const toolbarTimerRef = useRef(null);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);

  const openToolbar = useCallback(() => {
    if (isNodeDragging || selected || isMultiSelected) return;
    window.clearTimeout(toolbarTimerRef.current);
    setToolbarOpen(true);
  }, [isMultiSelected, isNodeDragging, selected]);

  const closeToolbar = useCallback(() => {
    window.clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = window.setTimeout(() => setToolbarOpen(false), TOOLBAR_CLOSE_MS);
  }, []);
  const status = normalizeSmartSplitterPhase(data?.status);
  const phaseLabel = getSmartSplitterPhaseLabel(status);
  const label = data?.label || '智能拆分器';
  const prompt = data?.local_prompt || data?.connectedPrompt || '';
  const batches = Array.isArray(data?.batches) ? data.batches : [];
  const latestBatch = batches[batches.length - 1];
  const referenceCount = Number(data?.referenceImageCount ?? (
    [...new Set([
      ...(data?.connected_images || []),
      ...(data?.uploaded_reference_images || []),
    ].filter(Boolean))]
  ).length);
  const directionLabel = data?.direction_count === 'auto'
    ? '智能方向'
    : `${data?.direction_count || 3} 个方向`;

  return (
    <div className={`custom-node smart-splitter-node ${selected ? 'selected' : ''} ${status}`}
      onMouseEnter={openToolbar}
      onMouseLeave={closeToolbar}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <div className="node-header">
        <EditableNodeTitle
          icon={<Icon name="smartSplitter" size={16} />}
          value={label}
          fallback="智能拆分器"
          tagColors={data?.tagColors}
          onChange={(nextLabel) => data?.onNodeTitleChange?.(id, nextLabel)}
          onEditingChange={setIsTitleEditing}
        />
        {phaseLabel && <span className="smart-splitter-status">{phaseLabel}</span>}
      </div>
      <div className="smart-splitter-summary">{summarizePrompt(prompt)}</div>
      <div className="smart-splitter-meta">
        <span>{referenceCount} 张参考图</span>
        <span>{directionLabel}</span>
        <span>每方向 {data?.images_per_direction || 1} 张</span>
      </div>
      {latestBatch && (
        <div className="smart-splitter-batch">
          批次 {latestBatch.batch_index} · {latestBatch.result_node_ids?.length || 0} 个方向
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar
        hidden={isNodeDragging || isMultiSelected || selected || isTitleEditing}
        portal
        forceVisible={!isNodeDragging && !isMultiSelected && toolbarOpen}
        onToolbarPointerEnter={openToolbar}
        onToolbarPointerLeave={closeToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        onDelete={() => data?.onDeleteNode?.(id)}
      />
    </div>
  );
}

export default memo(SmartSplitterNode);
