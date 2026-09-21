import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import Icon from '../components/Icon';

function RemovedNode({ data, selected }) {
  return (
    <div className={`custom-node removed-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border-strong)' }} />
      <div className="node-header">
        <span className="node-title">
          <Icon name="x" size={15} />
          {data?.label || '已移除节点'}
        </span>
        <span className="category">已移除</span>
      </div>
      <div className="node-body">
        <p className="removed-node-message">这个节点类型已下线，仅保留历史画布占位。</p>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border-strong)' }} />
    </div>
  );
}

export default memo(RemovedNode);
