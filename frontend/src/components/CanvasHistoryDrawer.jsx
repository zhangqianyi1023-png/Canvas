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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [viewMode, setViewMode] = useState('grid');

  const visibleMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return materials
      .filter(material => (activeTab === 'image' ? !['video', 'audio', '3d'].includes(material.type) : material.type === activeTab))
      .filter(material => !normalizedQuery || `${material.name || ''} ${material.prompt || ''}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [activeTab, materials, query]);

  if (!open) return null;

  const toggleSelected = (materialId) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handlePrototypeAction = (actionLabel) => {
    window.alert(`原型功能：${actionLabel} ${selectedIds.size} 个已选历史素材。`);
  };

  return (
    <div className="canvas-history-overlay" onClick={onClose}>
      <aside className="canvas-history-drawer nodrag nopan" onClick={event => event.stopPropagation()}>
        <header className="canvas-history-header">
          <h2>历史</h2>
          <div className="canvas-history-actions">
            <button
              type="button"
              className={selectionMode ? 'active' : ''}
              aria-label={selectionMode ? '退出选择' : '选择'}
              onClick={() => {
                if (selectionMode) {
                  exitSelectionMode();
                } else {
                  setSelectionMode(true);
                }
              }}
            >
              <span>{selectionMode ? '取消' : '选择'}</span>
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              aria-label={viewMode === 'list' ? '切换为卡片视图' : '切换为列表视图'}
              onClick={() => setViewMode(current => current === 'list' ? 'grid' : 'list')}
            >
              <Icon name={viewMode === 'list' ? 'grid' : 'batch'} size={18} />
            </button>
            <button type="button" aria-label="关闭历史" onClick={onClose}><Icon name="x" size={18} /></button>
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

        <div className={`canvas-history-grid ${viewMode === 'list' ? 'is-list-view' : ''} ${selectionMode ? 'is-selecting' : ''}`}>
          {visibleMaterials.length === 0 ? (
            <div className="canvas-history-empty"><Icon name="history" size={30} /><p>暂无历史记录</p></div>
          ) : visibleMaterials.map(material => {
            const selected = selectedIds.has(material.id);
            return (
            <article key={material.id} className={`canvas-history-card ${selected ? 'selected' : ''}`}>
              <button
                type="button"
                className="canvas-history-card-preview"
                onClick={() => {
                  if (selectionMode) {
                    toggleSelected(material.id);
                    return;
                  }
                  onAddMaterial?.(material);
                }}
              >
                {material.imageUrl ? <img src={material.imageUrl} alt={material.name || '历史图片'} /> : <Icon name="fileText" size={28} />}
                <span>已完成</span>
                {selectionMode && (
                  <span className={`canvas-history-select-check ${selected ? 'checked' : ''}`}>
                    {selected ? <Icon name="check" size={14} /> : null}
                  </span>
                )}
              </button>
              <div className="canvas-history-card-info">
                <strong>{material.type === 'video' ? '视频' : material.type === 'audio' ? '音频' : '图片'}</strong>
                <time>{formatHistoryDate(material.createdAt)}</time>
              </div>
            </article>
            );
          })}
        </div>
        {selectionMode && (
          <div className="canvas-history-bulk-bar">
            <button type="button" className="canvas-history-bulk-exit" onClick={exitSelectionMode} aria-label="退出批量操作">
              <Icon name="x" size={17} />
            </button>
            <span>已选 {selectedIds.size} 个</span>
            <i aria-hidden="true" />
            <button type="button" onClick={() => handlePrototypeAction('应用到画布')}>应用到画布</button>
            <button type="button" onClick={() => handlePrototypeAction('下载')}>下载</button>
          </div>
        )}
      </aside>
    </div>
  );
}
