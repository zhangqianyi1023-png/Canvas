import { memo, useMemo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import Icon from '../components/Icon';

function PlaylistNode({ id, data, selected }) {
  const [clips, setClips] = useState(() => Array.isArray(data?.clips) ? data.clips : []);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);
  const duration = useMemo(() => clips.reduce((sum, clip) => sum + (Number(clip.duration) || 0), 0), [clips]);
  const moveClip = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= clips.length) return;
    const next = [...clips];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setClips(next);
    data?.onPlaylistChange?.(id, next);
  };

  return (
    <div className={`custom-node playlist-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <div className="node-header">
        <EditableNodeTitle icon={<Icon name="playlist" size={16} />} value={data?.label || 'Playlist'} fallback="Playlist" tagColors={data?.tagColors} onChange={(value) => data?.onNodeTitleChange?.(id, value)} onEditingChange={setIsTitleEditing} />
        <span className="playlist-node-badge">{clips.length} 段</span>
      </div>
      <div className="playlist-node-body">
        {clips.length === 0 ? <div className="playlist-node-empty"><Icon name="playlist" size={22} /><span>连接视频后开始编排</span></div> : clips.map((clip, index) => (
          <div className="playlist-clip" key={clip.id || `${clip.url}-${index}`}>
            <span className="playlist-clip-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="playlist-clip-name">{clip.label || `片段 ${index + 1}`}</span>
            <span className="playlist-clip-duration">{Number(clip.duration || 0).toFixed(1)}s</span>
            <button type="button" onClick={() => moveClip(index, -1)} disabled={index === 0} aria-label="上移"><Icon name="chevronUp" size={12} /></button>
            <button type="button" onClick={() => moveClip(index, 1)} disabled={index === clips.length - 1} aria-label="下移"><Icon name="chevronDown" size={12} /></button>
          </div>
        ))}
      </div>
      <div className="playlist-node-footer"><span>总时长 {duration.toFixed(1)}s</span><span>可继续接入渲染器</span></div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar hidden={isNodeDragging || isMultiSelected || !selected || isTitleEditing} portal forceVisible={!isNodeDragging && selected} tagColors={data?.tagColors} onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)} onDelete={() => data?.onDeleteNode?.(id)} />
    </div>
  );
}

export default memo(PlaylistNode);
