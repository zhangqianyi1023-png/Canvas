import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import Icon from './Icon';
import { createOfficialTemplateSnapshot } from '../officialTemplateGraph';
import {
  getAdminTemplate,
  listAdminTemplateCategories,
  publishAdminTemplate,
  saveAdminTemplateDraft,
  unpublishAdminTemplate,
  updateAdminTemplate,
} from '../officialTemplates';

const emptyViewport = { x: 0, y: 0, zoom: 1 };

const isLikelyImage = url => (
  /^data:image\//i.test(url)
  || /\.(avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url)
);

export default function OfficialTemplateEditor({
  templateId,
  CanvasComponent,
  apiConfigs,
  materials,
  setMaterials,
  materialGroups,
  workflowTemplates,
  setWorkflowTemplates,
  officialTemplates,
  officialPromptStyles,
  runtimeSettings,
}) {
  const [template, setTemplate] = useState(null);
  const [categories, setCategories] = useState([]);
  const [graph, setGraph] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState([]);
  const canvasStateRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAdminTemplate(templateId),
      listAdminTemplateCategories(),
    ]).then(([detail, categoryList]) => {
      if (cancelled) return;
      const workflow = detail.draft?.workflowData || {};
      setTemplate(detail);
      setCategories(categoryList);
      setGraph({
        nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
        edges: Array.isArray(workflow.edges) ? workflow.edges : [],
        viewport: workflow.viewport || emptyViewport,
      });
    }).catch(error => {
      if (!cancelled) setMessage(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const readSnapshot = useCallback(() => {
    const current = canvasStateRef.current?.() || graph || {};
    return createOfficialTemplateSnapshot({
      templateId,
      versionId: template?.currentPublishedVersionId || null,
      nodes: current.nodes || [],
      edges: current.edges || [],
      viewport: current.viewport || graph?.viewport || emptyViewport,
      pairMap: current.pairMap || {},
    });
  }, [graph, template?.currentPublishedVersionId, templateId]);

  const saveDraft = useCallback(async ({ silent = false } = {}) => {
    if (!template) return null;
    setSaving(true);
    if (!silent) setMessage('正在保存草稿...');
    try {
      const snapshot = readSnapshot();
      await saveAdminTemplateDraft(templateId, snapshot);
      if (!silent) setMessage(`草稿已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`);
      return snapshot;
    } catch (error) {
      setMessage(error.message);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [readSnapshot, template, templateId]);

  const publish = useCallback(async () => {
    try {
      await saveDraft({ silent: true });
      const payload = await publishAdminTemplate(templateId);
      setTemplate(current => ({ ...current, ...(payload.template || {}), status: 'published' }));
      setMessage(`已发布版本 V${payload.version?.versionNumber || ''}`);
    } catch (error) {
      setMessage(error.message);
    }
  }, [saveDraft, templateId]);

  const unpublish = useCallback(async () => {
    if (!window.confirm('下架后首页与官方模板素材库将停止展示，用户已创建的画布不受影响。确定下架吗？')) return;
    try {
      const payload = await unpublishAdminTemplate(templateId);
      setTemplate(current => ({ ...current, ...(payload.template || {}), status: 'unpublished' }));
      setMessage('模板已下架');
    } catch (error) {
      setMessage(error.message);
    }
  }, [templateId]);

  const updateMeta = useCallback(async patch => {
    try {
      const next = await updateAdminTemplate(templateId, patch);
      setTemplate(current => ({ ...current, ...next }));
      setMessage('模板信息已保存');
    } catch (error) {
      setMessage(error.message);
    }
  }, [templateId]);

  const handleCanvasChange = useCallback((nodes, edges) => {
    setGraph(current => (
      current?.nodes === nodes && current?.edges === edges
        ? current
        : { ...current, nodes, edges }
    ));
  }, []);

  const openCoverPicker = useCallback(() => {
    setCoverCandidates(readSnapshot().mediaUrls.filter(isLikelyImage));
    setCoverPickerOpen(true);
  }, [readSnapshot]);

  const uploadCover = useCallback(async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const response = await fetch('/api/uploads/images', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || '封面上传失败');
      const coverUrl = payload.asset?.url;
      if (!coverUrl) throw new Error('封面上传成功，但没有返回图片地址');
      await updateMeta({ coverUrl });
      setCoverPickerOpen(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = '';
    }
  }, [updateMeta]);

  if (!template || !graph) {
    return (
      <div className="official-template-editor-loading">
        <Icon name="refresh" size={24} />
        <span>{message || '正在加载模板画布...'}</span>
      </div>
    );
  }

  return (
    <div className="canvas-page official-template-editor">
      <div className="canvas-topbar official-template-editor-bar">
        <button className="back-button" type="button" onClick={() => { window.location.href = '/'; }} aria-label="返回首页">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="official-template-editor-heading">
          <input
            className="canvas-title-input"
            value={template.name || ''}
            onChange={event => setTemplate(current => ({ ...current, name: event.target.value }))}
            onBlur={event => updateMeta({ name: event.target.value.trim() })}
            aria-label="模板名称"
          />
          <span>{template.status === 'published' ? '已发布' : template.status === 'unpublished' ? '已下架' : '草稿'}</span>
        </div>
        <select
          className="official-template-category-select"
          value={template.categoryId || ''}
          onChange={event => updateMeta({ categoryId: event.target.value })}
          aria-label="类型分组"
        >
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <button type="button" className="official-template-toolbar-btn" onClick={openCoverPicker}>
          <Icon name="image" size={16} />
          <span>封面</span>
        </button>
        <button type="button" className="official-template-toolbar-btn" disabled={saving} onClick={() => saveDraft()}>
          <Icon name="save" size={16} />
          <span>{saving ? '保存中' : '保存草稿'}</span>
        </button>
        {template.status === 'published' ? (
          <button type="button" className="official-template-toolbar-btn warning" onClick={unpublish}>下架</button>
        ) : (
          <button type="button" className="official-template-toolbar-btn primary" onClick={publish}>发布</button>
        )}
        <span className="official-template-save-message">{message}</span>
      </div>

      <ReactFlowProvider key={templateId}>
        <CanvasComponent
          initialNodes={graph.nodes}
          initialEdges={graph.edges}
          initialViewport={graph.viewport}
          apiConfigs={apiConfigs}
          apiProviders={runtimeSettings.providers}
          onCanvasChange={handleCanvasChange}
          materials={materials}
          setMaterials={setMaterials}
          materialGroups={materialGroups}
          workflowTemplates={workflowTemplates}
          setWorkflowTemplates={setWorkflowTemplates}
          officialTemplates={officialTemplates}
          officialPromptStyles={officialPromptStyles}
          runtimeSettings={runtimeSettings}
          canvasStateRef={canvasStateRef}
        />
      </ReactFlowProvider>

      {coverPickerOpen && (
        <div className="modal-overlay" onMouseDown={() => setCoverPickerOpen(false)}>
          <section className="official-template-cover-dialog" onMouseDown={event => event.stopPropagation()}>
            <header>
              <div>
                <h2>选择模板封面</h2>
                <p>从画布已有结果中选择，或上传一张新图片。</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setCoverPickerOpen(false)} aria-label="关闭">
                <Icon name="x" size={18} />
              </button>
            </header>
            <div className="official-template-cover-grid">
              {coverCandidates.map(url => (
                <button type="button" key={url} onClick={async () => {
                  await updateMeta({ coverUrl: url });
                  setCoverPickerOpen(false);
                }}>
                  <img src={url} alt="画布图片" />
                </button>
              ))}
              {!coverCandidates.length && <p>当前画布还没有可用图片。</p>}
            </div>
            <footer>
              <label className="official-template-toolbar-btn primary">
                <Icon name="upload" size={16} />
                <span>上传封面</span>
                <input type="file" accept="image/*" hidden onChange={uploadCover} />
              </label>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
