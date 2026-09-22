import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import AngleCameraPreview from '../components/AngleCameraPreview';
import Icon from '../components/Icon';

function ThreeDNode({ id, data, selected }) {
  const [camera, setCamera] = useState({ yaw: 0, pitch: 0, distance: 4 });
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  return (
    <div className={`custom-node three-d-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <div className="node-header">
        <EditableNodeTitle icon={<Icon name="cube" size={16} />} value={data?.label || '3D Viewfinder'} fallback="3D Viewfinder" tagColors={data?.tagColors} onChange={(value) => data?.onNodeTitleChange?.(id, value)} onEditingChange={setIsTitleEditing} />
        <span className="three-d-node-badge">3D</span>
      </div>
      <div className="three-d-node-preview">
        <AngleCameraPreview yaw={camera.yaw} pitch={camera.pitch} distance={camera.distance} onChange={setCamera} />
        <div className="three-d-node-overlay"><span>拖拽调整视角</span><span>Yaw {camera.yaw}° · Pitch {camera.pitch}°</span></div>
      </div>
      <button type="button" className="three-d-capture-button" onClick={() => data?.onCaptureViewfinder?.(id, camera)}><Icon name="camera" size={14} /> 截图到画布</button>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar hidden={isMultiSelected || !selected || isTitleEditing} portal forceVisible={selected} tagColors={data?.tagColors} onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)} onDelete={() => data?.onDeleteNode?.(id)} />
    </div>
  );
}

export default memo(ThreeDNode);
