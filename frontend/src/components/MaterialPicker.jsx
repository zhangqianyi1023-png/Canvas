import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';

function MaterialPicker({ materials, materialGroups, onSelect, onClose, multiSelect = false }) {
  const [activeGroupId, setActiveGroupId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const filteredMaterials = useMemo(() => {
    let result = materials || [];
    if (activeGroupId !== 'all') {
      result = result.filter(m => m.groupId === activeGroupId);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(m =>
        (m.name || '').toLowerCase().includes(query) ||
        (m.prompt || '').toLowerCase().includes(query)
      );
    }
    return [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [materials, activeGroupId, searchQuery]);

  const toggleSelect = (material) => {
    if (multiSelect) {
      setSelectedIds(prev => prev.includes(material.id)
        ? prev.filter(id => id !== material.id)
        : [...prev, material.id]
      );
    } else {
      onSelect([material]);
    }
  };

  const handleConfirm = () => {
    if (multiSelect && selectedIds.length > 0) {
      const selected = materials.filter(m => selectedIds.includes(m.id));
      onSelect(selected);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="material-picker-dialog" onClick={e => e.stopPropagation()}>
        <div className="material-picker-header">
          <h3>选择素材</h3>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="material-picker-search">
          <input
            type="text"
            placeholder="搜索素材..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="material-picker-body">
          <aside className="material-picker-groups">
            <button
              type="button"
              className={`materials-group-item ${activeGroupId === 'all' ? 'active' : ''}`}
              onClick={() => setActiveGroupId('all')}
            >
              <Icon name="layers" size={14} />
              <span>全部</span>
            </button>
            {(materialGroups || []).map(g => (
              <button
                key={g.id}
                type="button"
                className={`materials-group-item ${activeGroupId === g.id ? 'active' : ''}`}
                onClick={() => setActiveGroupId(g.id)}
              >
                <Icon name="folder" size={14} />
                <span>{g.name}</span>
              </button>
            ))}
          </aside>
          <div className="material-picker-grid">
            {filteredMaterials.length === 0 ? (
              <div className="material-picker-empty">
                <Icon name="image" size={32} />
                <p>{searchQuery ? '没有匹配的素材' : '这个分组还没有素材'}</p>
              </div>
            ) : (
              filteredMaterials.map(material => {
                const isSelected = multiSelect && selectedIds.includes(material.id);
                return (
                  <div
                    key={material.id}
                    className={`material-picker-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelect(material)}
                  >
                    <div className="material-picker-item-preview">
                      {material.type === 'video' ? (
                        <video src={material.imageUrl} muted preload="metadata" />
                      ) : (
                        <img src={material.imageUrl} alt={material.name || ''} loading="lazy" decoding="async" />
                      )}
                      {isSelected && (
                        <div className="material-picker-item-check">
                          <Icon name="check" size={14} />
                        </div>
                      )}
                    </div>
                    <span className="material-picker-item-name" title={material.name}>
                      {material.name || '未命名'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {multiSelect && (
          <div className="material-picker-footer">
            <span>已选 {selectedIds.length} 个</span>
            <div>
              <button className="modal-btn cancel" onClick={onClose}>取消</button>
              <button
                className="modal-btn confirm"
                onClick={handleConfirm}
                disabled={selectedIds.length === 0}
                style={{ marginLeft: 8 }}
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MaterialPicker;
