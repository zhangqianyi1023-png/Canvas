import { useMemo, useState } from 'react';
import Icon from './Icon';

const HISTORY_TABS = [
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: '3d', label: '3D' },
];

const formatHistoryDate = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function CanvasHistoryDrawer({ open, materials = [], onClose, onAddMaterial }) {
  const [activeTab, setActiveTab] = useState('image');
  const [query, setQuery] = useState('');

  const visibleMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return materials
      .filter(material => (activeTab === 'image' ? !['video', 'audio', '3d'].includes(material.type) : material.type === activeTab))
      .filter(material => !normalizedQuery || `${material.name || ''} ${material.prompt || ''}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [activeTab, materials, query]);

  if (!open) return null;

  return (
    <div className="canvas-history-overlay" onClick={onClose}>
      <aside className="canvas-history-drawer nodrag nopan" onClick={event => event.stopPropagation()}>
        <header className="canvas-history-header">
          <button type="button" className="canvas-history-back" onClick={onClose} aria-label="返回画布"><Icon name="arrowLeft" size={26} /></button>
          <h2>历史</h2>
          <div className="canvas-history-actions">
            <button type="button" aria-label="选择"><span>选择</span></button>
            <button type="button" aria-label="列表视图"><Icon name="batch" size={18} /></button>
            <button type="button" aria-label="展开"><Icon name="expandDiagonal" size={18} /></button>
          </div>
        </header>

        <div className="canvas-history-tabs" role="tablist" aria-label="历史类型">
          {HISTORY_TABS.map(tab => {
            const count = materials.filter(material => (tab.id === 'image' ? !['video', 'audio', '3d'].includes(material.type) : material.type === tab.id)).length;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
                <span>{tab.label}</span><small>{count}</small>
              </button>
            );
          })}
        </div>

        <div className="canvas-history-search">
          <Icon name="search" size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索历史" />
        </div>

        <div className="canvas-history-grid">
          {visibleMaterials.length === 0 ? (
            <div className="canvas-history-empty"><Icon name="history" size={30} /><p>暂无历史记录</p></div>
          ) : visibleMaterials.map(material => (
            <article key={material.id} className="canvas-history-card">
              <button type="button" className="canvas-history-card-preview" onClick={() => onAddMaterial?.(material)}>
                {material.imageUrl ? <img src={material.imageUrl} alt={material.name || '历史图片'} /> : <Icon name="fileText" size={28} />}
                <span>已完成</span>
              </button>
              <div className="canvas-history-card-info">
                <strong>{material.type === 'video' ? '视频' : material.type === 'audio' ? '音频' : '图片'}</strong>
                <time>{formatHistoryDate(material.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
