import { useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import WorkflowTemplatePreview from './WorkflowTemplatePreview';
import SaveWorkflowTemplateDialog from './SaveWorkflowTemplateDialog';

const TABS = [
  { id: 'images', label: '生成历史' },
  { id: 'characters', label: '我的角色' },
  { id: 'templates', label: '模板素材' },
];

const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getAvatarCertification = (material) => (
  material?.avatarCertification
  || material?.talentPackage?.avatarCertification
  || material?.characterPayload?.avatarCertification
  || null
);

const isVerifiedCharacterMaterial = (material) => {
  const isCharacterMaterial = (
    material?.type === 'talent'
    || material?.source === 'character-node'
    || Boolean(material?.talentPackage)
    || Boolean(material?.characterPayload)
  );
  if (!isCharacterMaterial) return false;
  return String(getAvatarCertification(material)?.status || '').toLowerCase() === 'verified';
};

const getMaterialKindLabel = (material) => {
  if (material?.type === 'talent') return '角色';
  if (material?.type === 'video') return '视频';
  if (material?.type === 'text') return '文本';
  return '图片';
};

const formatBytes = value => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getMaterialMeta = material => {
  const size = formatBytes(material?.size || material?.fileSize || material?.bytes);
  const mime = material?.mimeType || material?.contentType || (material?.type === 'video' ? 'video/mp4' : 'image/png');
  return `${size} · ${mime}`;
};

const ROLE_LIBRARY_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'ancient', label: 'Ancient History' },
  { id: 'contemporary', label: 'Contemporary Reality' },
  { id: 'scifi', label: 'Science Fiction Future' },
];

const MATERIAL_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: '3d', label: '3D' },
];

const MATERIAL_SCOPES = [
  { id: 'personal', label: '个人' },
  { id: 'team', label: '团队' },
];

const isTeamMaterial = material => (
  material?.scope === 'team'
  || material?.visibility === 'team'
  || material?.ownerType === 'team'
  || material?.source === 'team'
  || Boolean(material?.teamId || material?.workspaceId)
);

export default function CanvasMaterialDrawer({
  open,
  mode = 'materials',
  materials = [],
  workflowTemplates = [],
  onClose,
  onUploadFiles,
  onAddMaterial,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}) {
  const isCharacterMode = mode === 'characters';
  const tabs = isCharacterMode
    ? TABS.filter(tab => tab.id === 'characters')
    : TABS.filter(tab => tab.id !== 'characters');
  const [activeTab, setActiveTab] = useState(isCharacterMode ? 'characters' : 'images');
  const [activeMaterialScope, setActiveMaterialScope] = useState('personal');
  const [activeMaterialType, setActiveMaterialType] = useState('all');
  const [searchQueries, setSearchQueries] = useState({ images: '', characters: '', templates: '' });
  const [detailMaterial, setDetailMaterial] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateMenuId, setTemplateMenuId] = useState(null);
  const [roleCategory, setRoleCategory] = useState('all');
  const [roleSearchOpen, setRoleSearchOpen] = useState(false);
  const tabRefs = useRef([]);

  const searchQuery = searchQueries[activeTab] || '';
  const setSearchQuery = value => setSearchQueries(current => ({ ...current, [activeTab]: value }));
  const characterMaterials = useMemo(
    () => materials.filter(isVerifiedCharacterMaterial),
    [materials],
  );
  const imageMaterials = useMemo(
    () => materials.filter(material => !isVerifiedCharacterMaterial(material)),
    [materials],
  );
  const scopedImageMaterials = useMemo(
    () => imageMaterials.filter(material => (
      activeMaterialScope === 'team' ? isTeamMaterial(material) : !isTeamMaterial(material)
    )),
    [activeMaterialScope, imageMaterials],
  );
  const filteredMaterials = useMemo(() => {
    let result = scopedImageMaterials;
    if (activeMaterialType !== 'all') {
      result = result.filter(material => (
        activeMaterialType === '3d'
          ? material.type === '3d' || material.kind === '3d'
          : material.type === activeMaterialType
      ));
    }
    const query = searchQueries.images.trim().toLowerCase();
    if (query) {
      result = result.filter(material => (
        (material.name || '').toLowerCase().includes(query)
        || (material.prompt || '').toLowerCase().includes(query)
      ));
    }
    return [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [activeMaterialType, scopedImageMaterials, searchQueries.images]);
  const filteredCharacterMaterials = useMemo(() => {
    const query = searchQueries.characters.trim().toLowerCase();
    const result = query
      ? characterMaterials.filter(material => (
          (material.name || '').toLowerCase().includes(query)
          || (material.prompt || '').toLowerCase().includes(query)
        ))
      : characterMaterials;
    const hasCategorizedRoles = result.some(material => material.category || material.roleCategory);
    const categoryFiltered = roleCategory === 'all' || !hasCategorizedRoles
      ? result
      : result.filter(material => String(material.category || material.roleCategory || '').toLowerCase() === roleCategory);
    return [...categoryFiltered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [characterMaterials, roleCategory, searchQueries.characters]);
  const filteredTemplates = useMemo(() => {
    const query = searchQueries.templates.trim().toLowerCase();
    return [...workflowTemplates]
      .filter(template => !query || (
        (template.name || '').toLowerCase().includes(query)
        || (template.description || '').toLowerCase().includes(query)
      ))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [searchQueries.templates, workflowTemplates]);

  const materialFilterCounts = useMemo(() => MATERIAL_FILTERS.reduce((counts, filter) => {
    counts[filter.id] = filter.id === 'all'
      ? scopedImageMaterials.length
      : scopedImageMaterials.filter(material => (
        filter.id === '3d'
          ? material.type === '3d' || material.kind === '3d'
          : material.type === filter.id
      )).length;
    return counts;
  }, {}), [scopedImageMaterials]);

  if (!open) return null;

  const startMaterialDrag = (event, material) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ai-canvas-material', JSON.stringify(material));
  };
  const handleTabKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + MATERIAL_SCOPES.length) % MATERIAL_SCOPES.length;
    setActiveMaterialScope(MATERIAL_SCOPES[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };
  const currentCount = activeTab === 'images'
    ? scopedImageMaterials.length
    : activeTab === 'characters'
      ? characterMaterials.length
      : workflowTemplates.length;
  const currentCountLabel = activeTab === 'templates'
    ? '模板'
    : activeTab === 'characters'
      ? '角色'
      : '素材';
  const visibleMaterials = activeTab === 'characters' ? filteredCharacterMaterials : filteredMaterials;

  return (
    <>
      {isCharacterMode && <div className="canvas-role-library-overlay" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`canvas-material-drawer nodrag nopan ${activeTab === 'images' ? 'with-groups' : 'without-groups'} ${isCharacterMode ? `character-mode canvas-role-library${roleSearchOpen ? ' role-search-open' : ''}` : ''}`}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="canvas-material-drawer-header">
          <div className="canvas-material-drawer-title">
            <h2>{isCharacterMode ? 'Role Library' : '素材库'}</h2>
          </div>
          <div className="canvas-material-drawer-actions">
            {isCharacterMode && <button type="button" className="canvas-material-add-button" aria-label="添加角色"><Icon name="add" size={22} /></button>}
            <div className="canvas-material-drawer-actions-secondary">
            {isCharacterMode && (
              <button
                type="button"
                className={`icon-button canvas-role-search-toggle${roleSearchOpen ? ' active' : ''}`}
                onClick={() => setRoleSearchOpen(current => !current)}
                aria-label={roleSearchOpen ? '收起角色搜索' : '搜索角色'}
                aria-expanded={roleSearchOpen}
              >
                <Icon name="search" size={18} />
              </button>
            )}
            <span>{currentCount} 个{currentCountLabel}</span>
            <button type="button" className="icon-button" onClick={() => window.dispatchEvent(new Event('focus'))} aria-label="刷新素材库">
              <Icon name="refresh" size={20} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label={`关闭${isCharacterMode ? '角色' : '素材库'}`}>
              <Icon name="x" size={20} />
            </button>
            </div>
          </div>
        </div>

        {!isCharacterMode && (
          <div className="canvas-material-tabs" role="tablist" aria-label="素材归属">
            {MATERIAL_SCOPES.map((tab, index) => (
              <button
                key={tab.id}
                ref={element => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                aria-selected={activeMaterialScope === tab.id}
                tabIndex={activeMaterialScope === tab.id ? 0 : -1}
                className={activeMaterialScope === tab.id ? 'active' : ''}
                onClick={() => {
                  setActiveMaterialScope(tab.id);
                  setDetailMaterial(null);
                }}
                onKeyDown={event => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="canvas-material-search">
          <Icon name="search" size={18} />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder={isCharacterMode ? '搜索角色...' : '搜索素材...'}
          />
          {!isCharacterMode && <button type="button" className="canvas-material-upload-button" onClick={onUploadFiles}>上传</button>}
        </div>

        {isCharacterMode && (
          <div className="canvas-role-library-categories" role="tablist" aria-label="角色分类">
            {ROLE_LIBRARY_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                className={roleCategory === category.id ? 'active' : ''}
                onClick={() => setRoleCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
            <button type="button" className="canvas-role-library-filter" aria-label="筛选角色">
              <Icon name="filter" size={15} />
              <span>Filter</span>
            </button>
          </div>
        )}

        {activeTab === 'images' && !isCharacterMode && (
          <div className="canvas-material-groups">
            {MATERIAL_FILTERS.map(filter => (
              <button
                key={filter.id}
                type="button"
                className={`canvas-material-group ${activeMaterialType === filter.id ? 'active' : ''}`}
                onClick={() => setActiveMaterialType(filter.id)}
              >
                <span>{filter.label}</span><strong>{materialFilterCounts[filter.id] || 0}</strong>
              </button>
            ))}
          </div>
        )}

        <div className="canvas-material-list" role="tabpanel">
          {(activeTab === 'images' || activeTab === 'characters') && (
            visibleMaterials.length === 0 ? (
              <div className="canvas-material-empty">
                <Icon name={activeTab === 'characters' ? 'user' : 'image'} size={34} />
                <p>{activeTab === 'characters' ? '还没有已认证角色' : activeMaterialScope === 'team' ? '暂无团队素材' : '没有匹配的生成历史'}</p>
              </div>
            ) : visibleMaterials.map(material => (
              <article key={material.id} className={`canvas-material-card ${isCharacterMode ? 'canvas-role-card' : ''}`} draggable onDragStart={event => startMaterialDrag(event, material)}>
                <div
                  className="canvas-material-preview"
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailMaterial(material)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') setDetailMaterial(material);
                  }}
                >
                  {material.type === 'video' ? (
                    <video src={material.imageUrl} muted preload="metadata" />
                  ) : material.imageUrl ? (
                    <img src={material.imageUrl} alt={material.name || '素材'} loading="lazy" decoding="async" />
                  ) : <Icon name="fileText" size={30} />}
                  <span>{getMaterialKindLabel(material)}</span>
                  {isCharacterMode && (
                    <span className="canvas-role-card-actions" onClick={event => event.stopPropagation()}>
                      <button type="button" onClick={() => setDetailMaterial(material)}>View</button>
                      <button type="button" onClick={() => onAddMaterial(material)}>Add to canvas</button>
                    </span>
                  )}
                </div>
                <div className="canvas-material-card-info">
                  <button type="button" className="canvas-material-title" onClick={() => setDetailMaterial(material)}>
                    {material.name || '未命名素材'}
                  </button>
                  <p>{getMaterialMeta(material)}</p>
                  <button type="button" className="canvas-material-favorite" onClick={() => onAddMaterial(material)} aria-label={`添加${material.name || '素材'}到画布`}>
                    <Icon name="star" size={20} />
                  </button>
                </div>
              </article>
            ))
          )}

          {activeTab === 'templates' && (
            filteredTemplates.length === 0 ? (
              <div className="canvas-material-empty"><Icon name="apps" size={34} /><p>还没有收藏的模板</p></div>
            ) : filteredTemplates.map(template => (
              <article key={template.id} className="canvas-template-card">
                <button type="button" className="canvas-template-thumbnail" onClick={() => setPreviewTemplate(template)}>
                  <Icon name="apps" size={28} />
                  <span>{template.nodes.filter(node => node.type !== 'generator').length} 节点</span>
                </button>
                <div className="canvas-template-card-info">
                  <div className="canvas-template-card-title-row">
                    <button type="button" className="canvas-material-title" onClick={() => setPreviewTemplate(template)}>{template.name}</button>
                    <button
                      type="button"
                      className="canvas-template-menu-trigger"
                      onClick={() => setTemplateMenuId(current => current === template.id ? null : template.id)}
                      aria-label={`管理模板 ${template.name}`}
                    >
                      <Icon name="more" size={15} />
                    </button>
                    {templateMenuId === template.id && (
                      <div className="project-dropdown canvas-template-menu">
                        <button type="button" className="dropdown-item" onClick={() => { setEditingTemplate(template); setTemplateMenuId(null); }}>
                          <Icon name="edit" size={14} /> 编辑信息
                        </button>
                        <button
                          type="button"
                          className="dropdown-item danger"
                          onClick={() => {
                            setTemplateMenuId(null);
                            if (window.confirm(`确定删除模板“${template.name}”吗？`)) onDeleteTemplate(template.id);
                          }}
                        >
                          <Icon name="trash" size={14} /> 删除模板
                        </button>
                      </div>
                    )}
                  </div>
                  <p>{template.description || '未填写模板说明'}</p>
                  <div className="canvas-template-meta">
                    <span>{template.edges.length} 条连线</span>
                    <span>{formatDate(template.updatedAt)}</span>
                  </div>
                  <button type="button" className="canvas-material-add" onClick={() => onAddTemplate(template)}>添加到画布</button>
                </div>
              </article>
            ))
          )}
        </div>

        {detailMaterial && (
          <div className="canvas-material-detail">
            <div className="canvas-material-detail-header">
              <h3>{detailMaterial.name || '未命名素材'}</h3>
              <button type="button" className="icon-button" onClick={() => setDetailMaterial(null)} aria-label="关闭详情"><Icon name="x" size={17} /></button>
            </div>
            <div className="canvas-material-detail-media">
              {detailMaterial.type === 'video' ? <video src={detailMaterial.imageUrl} controls /> : detailMaterial.imageUrl ? <img src={detailMaterial.imageUrl} alt={detailMaterial.name || '素材'} /> : <Icon name="fileText" size={42} />}
            </div>
            <div className="canvas-material-detail-section"><label>提示词</label><p>{detailMaterial.prompt || '（无提示词）'}</p></div>
            <div className="canvas-material-detail-meta"><span>{getMaterialKindLabel(detailMaterial)}</span><span>{formatDate(detailMaterial.createdAt)}</span></div>
            <button type="button" className="canvas-material-detail-add" onClick={() => onAddMaterial(detailMaterial)}>添加到画布</button>
          </div>
        )}

      </aside>

      <WorkflowTemplatePreview
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onEdit={template => setEditingTemplate(template)}
        onAdd={template => {
          onAddTemplate(template);
          setPreviewTemplate(null);
        }}
        addLabel="添加到当前画布"
      />
      {editingTemplate && (
        <SaveWorkflowTemplateDialog
          key={editingTemplate.id}
          open
          title="编辑模板信息"
          initialName={editingTemplate.name || ''}
          initialDescription={editingTemplate.description || ''}
          nodeCount={editingTemplate.nodes?.filter(node => node.type !== 'generator').length || 0}
          edgeCount={editingTemplate.edges?.length || 0}
          confirmLabel="保存修改"
          onClose={() => setEditingTemplate(null)}
          onConfirm={patch => {
            onUpdateTemplate(editingTemplate.id, patch);
            setPreviewTemplate(current => current?.id === editingTemplate.id ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current);
            setEditingTemplate(null);
          }}
        />
      )}
    </>
  );
}
