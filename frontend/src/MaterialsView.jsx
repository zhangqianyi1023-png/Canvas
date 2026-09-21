import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon';
import SaveWorkflowTemplateDialog from './components/SaveWorkflowTemplateDialog';
import WorkflowTemplatePreview from './components/WorkflowTemplatePreview';
import {
  filterLibraryItems,
  mergeMaterialSources,
} from './materialLibrary';

const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getMaterialTypeLabel = (material) => {
  if (material?.type === 'talent') return '角色';
  if (material?.type === 'video') return '视频';
  if (material?.type === 'text') return '文本';
  return '图片';
};

const MATERIAL_LIBRARY_CATEGORIES = [
  { id: 'images', label: '生成历史', icon: 'image' },
  { id: 'characters', label: '角色库', icon: 'user' },
  { id: 'templates', label: '模板库', icon: 'apps' },
];

const getAvatarCertification = (material) => (
  material?.avatarCertification
  || material?.talentPackage?.avatarCertification
  || material?.characterPayload?.avatarCertification
  || null
);

const isCharacterMaterial = (material) => (
  material?.type === 'talent'
  || material?.source === 'character-node'
  || Boolean(material?.talentPackage)
  || Boolean(material?.characterPayload)
);

const isVerifiedCharacterMaterial = (material) => {
  if (!isCharacterMaterial(material)) return false;
  const status = String(getAvatarCertification(material)?.status || '').toLowerCase();
  return !status || status === 'verified';
};

function MaterialsView({
  libraryMode = 'materials',
  materials = [],
  localAssets = [],
  setMaterials,
  workflowTemplates = [],
  onUpdateTemplate,
  onDeleteTemplate,
  onUseMaterial,
  onUseTemplate,
}) {
  const initialCategory = libraryMode === 'templates' ? 'templates' : 'images';
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const isTemplateLibrary = activeCategory === 'templates';
  const isImageLibrary = activeCategory === 'images';
  const isCharacterLibrary = activeCategory === 'characters';
  const [searchQuery, setSearchQuery] = useState('');
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [materialMenuOpenId, setMaterialMenuOpenId] = useState(null);
  const [templateMenuOpenId, setTemplateMenuOpenId] = useState(null);
  const materialMenuRef = useRef(null);
  const templateMenuRef = useRef(null);

  useEffect(() => {
    setActiveCategory(libraryMode === 'templates' ? 'templates' : 'images');
  }, [libraryMode]);

  const displayMaterials = useMemo(
    () => mergeMaterialSources(materials, localAssets),
    [localAssets, materials]
  );

  const imageMaterials = useMemo(
    () => displayMaterials.filter(material => !isCharacterMaterial(material)),
    [displayMaterials]
  );

  const characterMaterials = useMemo(
    () => displayMaterials.filter(isVerifiedCharacterMaterial),
    [displayMaterials]
  );

  const filteredMaterials = useMemo(() => (
    [...filterLibraryItems(imageMaterials, searchQuery, ['name', 'prompt'])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [imageMaterials, searchQuery]);

  const filteredCharacters = useMemo(() => (
    [...filterLibraryItems(characterMaterials, searchQuery, ['name', 'prompt'])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [characterMaterials, searchQuery]);

  const filteredTemplates = useMemo(() => (
    [...filterLibraryItems(workflowTemplates, searchQuery, ['name', 'description'])]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  ), [searchQuery, workflowTemplates]);

  const updateMaterial = useCallback((materialId, patch) => {
    if (String(materialId || '').startsWith('asset_')) return;
    setMaterials(prev => prev.map(material => (
      material.id === materialId
        ? { ...material, ...patch, updatedAt: new Date().toISOString() }
        : material
    )));
  }, [setMaterials]);

  const deleteMaterial = useCallback((materialId) => {
    if (String(materialId || '').startsWith('asset_')) {
      window.alert('本地生成历史素材不能在这里删除，可以从任务历史或本地文件中清理。');
      return;
    }
    if (!window.confirm('确定要删除这个素材吗？')) return;
    setMaterials(prev => prev.filter(material => material.id !== materialId));
    if (previewMaterial?.id === materialId) setPreviewMaterial(null);
  }, [previewMaterial, setMaterials]);

  const canEditMaterial = material => material?.source !== 'local-asset';
  const closeMenus = () => {
    setMaterialMenuOpenId(null);
    setTemplateMenuOpenId(null);
  };
  const searchPlaceholder = activeCategory === 'templates'
    ? '搜索模板...'
    : activeCategory === 'characters'
      ? '搜索角色...'
      : '搜索图片...';

  return (
    <main
      className={`workspace-page materials-page ${isTemplateLibrary ? 'templates-mode' : 'materials-mode'}`}
      onClick={closeMenus}
    >
      <div className="page-header materials-page-header">
        <div>
          <h1>素材库</h1>
          <p>管理生成历史、角色库和模板库</p>
        </div>
        <input
          type="text"
          className="materials-search"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="materials-category-tabs" role="tablist" aria-label="素材库分类">
        {MATERIAL_LIBRARY_CATEGORIES.map(category => {
          const count = category.id === 'templates'
            ? workflowTemplates.length
            : category.id === 'characters'
              ? characterMaterials.length
              : imageMaterials.length;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === category.id}
              className={activeCategory === category.id ? 'active' : ''}
              onClick={() => {
                setActiveCategory(category.id);
                setSearchQuery('');
                closeMenus();
              }}
            >
              <Icon name={category.icon} size={16} />
              <span>{category.label}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="materials-layout without-groups">
        <section className="materials-content-pane">
          {isImageLibrary && (
            filteredMaterials.length === 0 ? (
              <div className="materials-empty">
                <Icon name="image" size={42} />
                <p>{searchQuery.trim() ? '没有匹配的图片' : '还没有图片'}</p>
                <span>画布生成的本地图片会自动出现在这里，也可以手动收藏常用素材</span>
              </div>
            ) : (
              <div className="materials-grid">
                {filteredMaterials.map(material => (
                  <article key={material.id} className="material-card">
                    <button
                      type="button"
                      className="material-card-preview"
                      onClick={() => setPreviewMaterial(material)}
                    >
                      {material.type === 'video' ? (
                        <video src={material.imageUrl} muted loop preload="metadata" />
                      ) : material.imageUrl ? (
                        <img src={material.imageUrl} alt={material.name || '素材'} loading="lazy" decoding="async" />
                      ) : (
                        <span className="material-card-text-preview">{material.prompt || material.name || '文本素材'}</span>
                      )}
                      <span className="material-card-type">
                        <Icon name={material.type === 'video' ? 'video' : material.type === 'text' ? 'fileText' : 'image'} size={12} />
                      </span>
                    </button>
                    <div className="material-card-info">
                      <div className="material-card-title-row">
                        <button type="button" className="material-card-title" onClick={() => setPreviewMaterial(material)}>
                          {material.name || '未命名素材'}
                        </button>
                        <button
                          type="button"
                          className="material-card-menu-trigger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMaterialMenuOpenId(current => current === material.id ? null : material.id);
                          }}
                          aria-label={`管理素材 ${material.name || '未命名素材'}`}
                        >
                          <Icon name="more" size={14} />
                        </button>
                        {materialMenuOpenId === material.id && (
                          <div ref={materialMenuRef} className="project-dropdown material-card-menu" onClick={event => event.stopPropagation()}>
                            {canEditMaterial(material) ? (
                              <>
                                <button className="dropdown-item" onClick={() => { setEditingMaterial(material); setMaterialMenuOpenId(null); }}>
                                  <Icon name="edit" size={14} /> 编辑信息
                                </button>
                              <button className="dropdown-item danger" onClick={() => { deleteMaterial(material.id); setMaterialMenuOpenId(null); }}>
                                <Icon name="trash" size={14} /> 删除素材
                              </button>
                              </>
                            ) : (
                              <button className="dropdown-item" onClick={() => { setPreviewMaterial(material); setMaterialMenuOpenId(null); }}>
                                <Icon name="image" size={14} /> 查看素材
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {material.prompt && <p className="material-card-prompt">{material.prompt}</p>}
                      <div className="material-card-meta">
                        <span>{getMaterialTypeLabel(material)}</span>
                        <span>{formatDate(material.createdAt)}</span>
                      </div>
                      <button type="button" className="material-use-button" onClick={() => onUseMaterial?.(material)}>
                        使用素材
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}

          {isCharacterLibrary && (
            filteredCharacters.length === 0 ? (
              <div className="materials-empty">
                <Icon name="user" size={42} />
                <p>{searchQuery.trim() ? '没有匹配的角色' : '还没有角色素材'}</p>
                <span>画布中创建并保存的角色会出现在这里</span>
              </div>
            ) : (
              <div className="materials-grid">
                {filteredCharacters.map(material => (
                  <article key={material.id} className="material-card material-character-card">
                    <button
                      type="button"
                      className="material-card-preview"
                      onClick={() => setPreviewMaterial(material)}
                    >
                      {material.imageUrl ? (
                        <img src={material.imageUrl} alt={material.name || '角色'} loading="lazy" decoding="async" />
                      ) : (
                        <span className="material-card-text-preview">{material.prompt || material.name || '角色素材'}</span>
                      )}
                      <span className="material-card-type">
                        <Icon name="user" size={12} />
                      </span>
                    </button>
                    <div className="material-card-info">
                      <div className="material-card-title-row">
                        <button type="button" className="material-card-title" onClick={() => setPreviewMaterial(material)}>
                          {material.name || '未命名角色'}
                        </button>
                        <button
                          type="button"
                          className="material-card-menu-trigger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMaterialMenuOpenId(current => current === material.id ? null : material.id);
                          }}
                          aria-label={`管理角色 ${material.name || '未命名角色'}`}
                        >
                          <Icon name="more" size={14} />
                        </button>
                        {materialMenuOpenId === material.id && (
                          <div ref={materialMenuRef} className="project-dropdown material-card-menu" onClick={event => event.stopPropagation()}>
                            {canEditMaterial(material) ? (
                              <>
                                <button className="dropdown-item" onClick={() => { setEditingMaterial(material); setMaterialMenuOpenId(null); }}>
                                  <Icon name="edit" size={14} /> 编辑信息
                                </button>
                                <button className="dropdown-item danger" onClick={() => { deleteMaterial(material.id); setMaterialMenuOpenId(null); }}>
                                  <Icon name="trash" size={14} /> 删除角色
                                </button>
                              </>
                            ) : (
                              <button className="dropdown-item" onClick={() => { setPreviewMaterial(material); setMaterialMenuOpenId(null); }}>
                                <Icon name="user" size={14} /> 查看角色
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {material.prompt && <p className="material-card-prompt">{material.prompt}</p>}
                      <div className="material-card-meta">
                        <span>角色</span>
                        <span>{formatDate(material.createdAt)}</span>
                      </div>
                      <button type="button" className="material-use-button" onClick={() => onUseMaterial?.(material)}>
                        使用角色
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}

          {isTemplateLibrary && (
            filteredTemplates.length === 0 ? (
              <div className="materials-empty">
                <Icon name="apps" size={42} />
                <p>{searchQuery.trim() ? '没有匹配的模板' : '还没有收藏的模板'}</p>
                <span>在画布中组合节点后，可以将组合收藏为模板</span>
              </div>
            ) : (
              <div className="materials-grid materials-template-grid">
                {filteredTemplates.map(template => {
                  const visibleNodeCount = template.nodes?.filter(node => node.type !== 'generator').length || 0;
                  return (
                    <article key={template.id} className="material-card material-template-card">
                      <button type="button" className="material-template-preview" onClick={() => setPreviewTemplate(template)}>
                        <Icon name="apps" size={34} />
                        <strong>{visibleNodeCount} 个节点</strong>
                        <span>{template.edges?.length || 0} 条内部连线</span>
                      </button>
                      <div className="material-card-info">
                        <div className="material-card-title-row">
                          <button type="button" className="material-card-title" onClick={() => setPreviewTemplate(template)}>
                            {template.name || '未命名模板'}
                          </button>
                          <button
                            type="button"
                            className="material-card-menu-trigger"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTemplateMenuOpenId(current => current === template.id ? null : template.id);
                            }}
                            aria-label={`管理模板 ${template.name || '未命名模板'}`}
                          >
                            <Icon name="more" size={14} />
                          </button>
                          {templateMenuOpenId === template.id && (
                            <div ref={templateMenuRef} className="project-dropdown material-card-menu" onClick={event => event.stopPropagation()}>
                              <button className="dropdown-item" onClick={() => { setEditingTemplate(template); setTemplateMenuOpenId(null); }}>
                                <Icon name="edit" size={14} /> 编辑信息
                              </button>
                              <button
                                className="dropdown-item danger"
                                onClick={() => {
                                  setTemplateMenuOpenId(null);
                                  if (window.confirm(`确定删除模板“${template.name}”吗？`)) onDeleteTemplate?.(template.id);
                                }}
                              >
                                <Icon name="trash" size={14} /> 删除模板
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="material-card-prompt">{template.description || '未填写模板说明'}</p>
                        <div className="material-card-meta">
                          <span>{visibleNodeCount} 节点</span>
                          <span>{formatDate(template.updatedAt)}</span>
                        </div>
                        <button type="button" className="material-use-button" onClick={() => onUseTemplate?.(template)}>
                          使用模板
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          )}
        </section>
      </div>

      {previewMaterial && (
        <div className="modal-overlay" onClick={() => setPreviewMaterial(null)}>
          <div className="material-preview-dialog" onClick={event => event.stopPropagation()}>
            <div className="material-preview-header">
              <h3>{previewMaterial.name || '未命名素材'}</h3>
              <button type="button" className="icon-button" onClick={() => setPreviewMaterial(null)} aria-label="关闭素材详情">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="material-preview-body">
              <div className="material-preview-media">
                {previewMaterial.type === 'video' ? (
                  <video src={previewMaterial.imageUrl} controls autoPlay />
                ) : previewMaterial.imageUrl ? (
                  <img src={previewMaterial.imageUrl} alt={previewMaterial.name || '素材'} decoding="async" />
                ) : (
                  <div className="material-text-detail">{previewMaterial.prompt || previewMaterial.name || '文本素材'}</div>
                )}
              </div>
              <div className="material-preview-info">
                <div className="material-preview-section">
                  <label>提示词</label>
                  <div className="material-preview-prompt">{previewMaterial.prompt || '（无提示词）'}</div>
                </div>
                <div className="material-preview-section">
                  <label>创建时间</label>
                  <div>{formatDate(previewMaterial.createdAt)}</div>
                </div>
                <button type="button" className="material-use-button" onClick={() => onUseMaterial?.(previewMaterial)}>
                  使用素材
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingMaterial && (
        <div className="modal-overlay" onClick={() => setEditingMaterial(null)}>
          <div className="material-edit-dialog" onClick={event => event.stopPropagation()}>
            <div className="material-edit-header">
              <h3>编辑素材信息</h3>
              <button type="button" className="icon-button" onClick={() => setEditingMaterial(null)} aria-label="关闭编辑">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="material-edit-body">
              <label>
                素材名称
                <input
                  type="text"
                  value={editingMaterial.name || ''}
                  onChange={event => setEditingMaterial(current => ({ ...current, name: event.target.value }))}
                  placeholder="给素材起个名字"
                />
              </label>
              <label>
                提示词
                <textarea
                  rows={5}
                  value={editingMaterial.prompt || ''}
                  onChange={event => setEditingMaterial(current => ({ ...current, prompt: event.target.value }))}
                  placeholder="为这个素材添加提示词描述..."
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setEditingMaterial(null)}>取消</button>
              <button
                className="modal-btn confirm"
                onClick={() => {
                  updateMaterial(editingMaterial.id, {
                    name: editingMaterial.name,
                    prompt: editingMaterial.prompt,
                  });
                  setEditingMaterial(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <WorkflowTemplatePreview
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onEdit={template => setEditingTemplate(template)}
        onAdd={template => {
          onUseTemplate?.(template);
          setPreviewTemplate(null);
        }}
        addLabel="使用模板"
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
            onUpdateTemplate?.(editingTemplate.id, patch);
            setPreviewTemplate(current => (
              current?.id === editingTemplate.id
                ? { ...current, ...patch, updatedAt: new Date().toISOString() }
                : current
            ));
            setEditingTemplate(null);
          }}
        />
      )}
    </main>
  );
}

export default MaterialsView;
