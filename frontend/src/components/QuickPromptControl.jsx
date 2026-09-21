import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import useQuickPrompts from '../useQuickPrompts';

const PICKER_WIDTH = 340;
const PICKER_HEIGHT = 430;
const VIEWPORT_MARGIN = 10;

const emptyDraft = categoryId => ({ id: '', title: '', content: '', categoryId: categoryId || 'custom', source: 'custom' });

function QuickPromptControl({
  selectedPromptId = '',
  disabled = false,
  openRequest = 0,
  onSelect,
}) {
  const {
    categories,
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    restorePrompt,
    createCategory,
    renameCategory,
    deleteCategory,
  } = useQuickPrompts();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerPurpose, setManagerPurpose] = useState('manage');
  const [managerCategory, setManagerCategory] = useState('all');
  const [managerQuery, setManagerQuery] = useState('');
  const [managerPromptId, setManagerPromptId] = useState('');
  const [draft, setDraft] = useState(emptyDraft('custom'));
  const [formError, setFormError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [categoryEditor, setCategoryEditor] = useState(null);

  const sortedPrompts = useMemo(() => (
    [...prompts].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
  ), [prompts]);

  const filterPrompts = useCallback((categoryId, search) => {
    const normalizedQuery = String(search || '').trim().toLowerCase();
    return sortedPrompts.filter(prompt => {
      if (categoryId !== 'all' && prompt.categoryId !== categoryId) return false;
      if (!normalizedQuery) return true;
      return `${prompt.title} ${prompt.content}`.toLowerCase().includes(normalizedQuery);
    });
  }, [sortedPrompts]);

  const pickerPrompts = useMemo(
    () => filterPrompts(activeCategory, query),
    [activeCategory, filterPrompts, query],
  );
  const managerPrompts = useMemo(
    () => filterPrompts(managerCategory, managerQuery),
    [filterPrompts, managerCategory, managerQuery],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 800;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, viewportWidth - PICKER_WIDTH - VIEWPORT_MARGIN),
    );
    const above = rect.top - PICKER_HEIGHT - 8;
    const top = above >= VIEWPORT_MARGIN
      ? above
      : Math.min(rect.bottom + 8, viewportHeight - PICKER_HEIGHT - VIEWPORT_MARGIN);
    setPosition({ left, top: Math.max(VIEWPORT_MARGIN, top) });
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    const frameId = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [openRequest]);

  useEffect(() => {
    if (!open) return undefined;
    const frameId = window.requestAnimationFrame(updatePosition);
    const handlePointerDown = event => {
      const target = event.target;
      if (target instanceof Element && target.closest('.quick-prompt-picker, .quick-prompt-trigger')) return;
      setOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!managerOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') setManagerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [managerOpen]);

  const selectManagerPrompt = useCallback(prompt => {
    setManagerPromptId(prompt.id);
    setDraft({ ...prompt });
    setFormError('');
    setPendingDeleteId('');
  }, []);

  const openManager = useCallback((purpose = 'manage') => {
    const selected = prompts.find(prompt => prompt.id === selectedPromptId) || prompts[0];
    setOpen(false);
    setManagerPurpose(purpose);
    setManagerOpen(true);
    setManagerQuery('');
    setFormError('');
    setPendingDeleteId('');
    setCategoryEditor(null);
    if (purpose === 'create-select') {
      const categoryId = activeCategory === 'all' ? 'custom' : activeCategory;
      setManagerCategory(categoryId);
      setManagerPromptId('');
      setDraft(emptyDraft(categoryId));
      return;
    }
    setManagerCategory('all');
    if (selected) selectManagerPrompt(selected);
    else setDraft(emptyDraft('custom'));
  }, [activeCategory, prompts, selectManagerPrompt, selectedPromptId]);

  const startNewPrompt = useCallback(() => {
    const categoryId = managerCategory === 'all' ? 'custom' : managerCategory;
    setManagerPromptId('');
    setDraft(emptyDraft(categoryId));
    setFormError('');
    setPendingDeleteId('');
  }, [managerCategory]);

  const saveDraft = useCallback(() => {
    const title = String(draft.title || '').trim();
    const content = String(draft.content || '').trim();
    if (!title || !content) {
      setFormError('标题和提示词内容不能为空');
      return;
    }
    if (draft.id) {
      updatePrompt(draft.id, { title, content, categoryId: draft.categoryId || 'custom' });
      setDraft(current => ({ ...current, title, content }));
      setFormError('');
      return;
    }
    const created = createPrompt({ title, content, categoryId: draft.categoryId || 'custom' });
    if (managerPurpose === 'create-select') {
      onSelect?.(created);
      setManagerOpen(false);
      return;
    }
    setManagerPromptId(created.id);
    setDraft(created);
    setFormError('');
  }, [createPrompt, draft, managerPurpose, onSelect, updatePrompt]);

  const removeDraft = useCallback(() => {
    if (!draft.id || draft.source === 'builtin') return;
    if (pendingDeleteId !== draft.id) {
      setPendingDeleteId(draft.id);
      return;
    }
    deletePrompt(draft.id);
    const remaining = managerPrompts.find(prompt => prompt.id !== draft.id);
    if (remaining) selectManagerPrompt(remaining);
    else {
      setManagerPromptId('');
      setDraft(emptyDraft(managerCategory === 'all' ? 'custom' : managerCategory));
    }
    setPendingDeleteId('');
  }, [deletePrompt, draft.id, draft.source, managerCategory, managerPrompts, pendingDeleteId, selectManagerPrompt]);

  const restoreDraft = useCallback(() => {
    const restored = restorePrompt(draft.id);
    if (restored) setDraft({ ...restored });
  }, [draft.id, restorePrompt]);

  const saveCategoryEditor = useCallback(() => {
    const name = String(categoryEditor?.value || '').trim();
    if (!name) return;
    if (categoryEditor.mode === 'create') {
      const category = createCategory(name);
      setManagerCategory(category.id);
    } else {
      renameCategory(categoryEditor.id, name);
    }
    setCategoryEditor(null);
  }, [categoryEditor, createCategory, renameCategory]);

  const categoryCounts = useMemo(() => (
    prompts.reduce((counts, prompt) => ({
      ...counts,
      all: (counts.all || 0) + 1,
      [prompt.categoryId]: (counts[prompt.categoryId] || 0) + 1,
    }), {})
  ), [prompts]);

  const picker = open && position && typeof document !== 'undefined'
    ? createPortal((
      <div className="quick-prompt-picker nodrag nopan" style={position} onPointerDown={event => event.stopPropagation()}>
        <div className="quick-prompt-picker-head">
          <strong>快捷提示词</strong>
          <span>{prompts.length}</span>
        </div>
        <input className="quick-prompt-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索提示词..." autoFocus />
        <div className="quick-prompt-category-tabs">
          {categories.map(category => (
            <button key={category.id} type="button" className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>{category.name}</button>
          ))}
        </div>
        <div className="quick-prompt-picker-list">
          {pickerPrompts.length > 0 ? pickerPrompts.map(prompt => (
            <button key={prompt.id} type="button" className={selectedPromptId === prompt.id ? 'selected' : ''} onClick={() => { onSelect?.(prompt); setOpen(false); }}>
              <span><strong>{prompt.title}</strong>{selectedPromptId === prompt.id ? <Icon name="check" size={14} /> : null}</span>
              <small>{prompt.content}</small>
            </button>
          )) : <div className="quick-prompt-empty">没有匹配的提示词</div>}
        </div>
        <div className="quick-prompt-picker-footer">
          <button type="button" onClick={() => openManager('create-select')}><Icon name="add" size={15} /><span>新增提示词</span></button>
          <button type="button" onClick={() => openManager('manage')}><Icon name="settings" size={15} /><span>管理提示词</span></button>
        </div>
      </div>
    ), document.body)
    : null;

  const manager = managerOpen && typeof document !== 'undefined'
    ? createPortal((
      <div className="quick-prompt-manager-overlay" onPointerDown={() => setManagerOpen(false)}>
        <section className="quick-prompt-manager" role="dialog" aria-modal="true" aria-label="提示词管理" onPointerDown={event => event.stopPropagation()}>
          <header className="quick-prompt-manager-header">
            <div><Icon name="quoteText" size={18} /><strong>提示词管理</strong></div>
            <div>
              <button type="button" onClick={startNewPrompt}><Icon name="add" size={16} /><span>新增</span></button>
              <button type="button" className="icon-only" onClick={() => setManagerOpen(false)} aria-label="关闭提示词管理"><Icon name="x" size={18} /></button>
            </div>
          </header>
          <div className="quick-prompt-manager-body">
            <aside className="quick-prompt-manager-categories">
              <div className="quick-prompt-manager-section-head">
                <span>分类</span>
                <button type="button" onClick={() => setCategoryEditor({ mode: 'create', id: '', value: '' })} aria-label="新增分类"><Icon name="add" size={14} /></button>
              </div>
              {categoryEditor?.mode === 'create' && (
                <div className="quick-prompt-category-editor">
                  <input value={categoryEditor.value} onChange={event => setCategoryEditor(current => ({ ...current, value: event.target.value }))} placeholder="分类名称" autoFocus onKeyDown={event => { if (event.key === 'Enter') saveCategoryEditor(); }} />
                  <button type="button" onClick={saveCategoryEditor}><Icon name="check" size={13} /></button>
                </div>
              )}
              <div className="quick-prompt-manager-category-list">
                {categories.map(category => (
                  <div key={category.id} className={managerCategory === category.id ? 'active' : ''}>
                    {categoryEditor?.mode === 'rename' && categoryEditor.id === category.id ? (
                      <div className="quick-prompt-category-editor">
                        <input value={categoryEditor.value} onChange={event => setCategoryEditor(current => ({ ...current, value: event.target.value }))} autoFocus onKeyDown={event => { if (event.key === 'Enter') saveCategoryEditor(); }} />
                        <button type="button" onClick={saveCategoryEditor}><Icon name="check" size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <button type="button" className="category-name" onClick={() => setManagerCategory(category.id)}><span>{category.name}</span><small>{categoryCounts[category.id] || 0}</small></button>
                        {!category.system && <span className="category-actions">
                          <button type="button" onClick={() => setCategoryEditor({ mode: 'rename', id: category.id, value: category.name })} aria-label={`重命名${category.name}`}><Icon name="edit" size={12} /></button>
                          <button type="button" onClick={() => { deleteCategory(category.id); if (managerCategory === category.id) setManagerCategory('custom'); }} aria-label={`删除${category.name}`}><Icon name="trash" size={12} /></button>
                        </span>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            <div className="quick-prompt-manager-list-pane">
              <input value={managerQuery} onChange={event => setManagerQuery(event.target.value)} placeholder="搜索提示词..." />
              <div className="quick-prompt-manager-list">
                {managerPrompts.length > 0 ? managerPrompts.map(prompt => (
                  <button key={prompt.id} type="button" className={managerPromptId === prompt.id ? 'active' : ''} onClick={() => selectManagerPrompt(prompt)}>
                    <strong>{prompt.title}</strong>
                    <small>{categories.find(category => category.id === prompt.categoryId)?.name || '我的提示词'}</small>
                  </button>
                )) : <div className="quick-prompt-empty">当前分类没有提示词</div>}
              </div>
            </div>

            <div className="quick-prompt-manager-editor">
              <label><span>标题</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="提示词标题" /></label>
              <label><span>分类</span><select value={draft.categoryId} onChange={event => setDraft(current => ({ ...current, categoryId: event.target.value }))}>{categories.filter(category => category.id !== 'all').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="content-field"><span>提示词内容</span><textarea value={draft.content} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} placeholder="输入完整提示词..." /></label>
              {formError && <div className="quick-prompt-form-error">{formError}</div>}
              <div className="quick-prompt-manager-editor-actions">
                {draft.source === 'builtin' ? <button type="button" onClick={restoreDraft}>恢复默认</button> : draft.id ? <button type="button" className={pendingDeleteId === draft.id ? 'danger active' : 'danger'} onClick={removeDraft}>{pendingDeleteId === draft.id ? '再次点击删除' : '删除'}</button> : <span />}
                <button type="button" className="primary" onClick={saveDraft}>保存</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    ), document.body)
    : null;

  return (
    <>
      <button ref={triggerRef} type="button" className={`quick-prompt-trigger ${selectedPromptId ? 'active' : ''}`} onClick={() => setOpen(current => !current)} disabled={disabled} title="快捷提示词" aria-label="快捷提示词">
        <Icon name="quoteText" size={15} />
      </button>
      {picker}
      {manager}
    </>
  );
}

export default QuickPromptControl;
