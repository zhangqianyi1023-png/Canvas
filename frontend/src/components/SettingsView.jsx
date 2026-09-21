import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../apiBase';
import Icon from './Icon';
import {
  filterSelectableModels,
  getCapabilityLabel,
  getPulledImageModelSupport,
  isPulledModelSelectable,
  normalizeImageModelCapabilities,
  selectCapabilities,
} from '../apimartModelSupport';

const DEFAULT_MAX_TEXT_TOKENS = 8192;
const MODEL_TAG_MAX_CHARS = 36;

const PROVIDER_PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'apimart', label: 'APIMart' },
  { value: 'minimax', label: 'MiniMax 官方' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'volcengine', label: '火山引擎' },
  { value: 'runninghub', label: 'RunningHub' },
  { value: 'jimeng', label: '即梦' },
];

const TEXT_API_MODE_OPTIONS = [
  { value: 'auto', label: '自动选择' },
  { value: 'chat_completions', label: 'Chat Completions' },
  { value: 'responses', label: 'Responses API' },
];

const API_MODEL_GROUPS = [
  { key: 'text', title: '文本模型', field: 'textModels', defaultField: 'defaultTextModel' },
  { key: 'image', title: '图片模型', field: 'imageModels', defaultField: 'defaultImageModel' },
  { key: 'video', title: '视频模型', field: 'videoModels', defaultField: 'defaultVideoModel' },
];

const normalizeModelList = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map(item => String(item).trim()).filter(Boolean))]
    : [...new Set(String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean))]
);

const normalizeMaxTextTokens = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TEXT_TOKENS;
  return Math.max(1024, Math.min(parsed, 32768));
};

const makeId = (prefix = 'provider') => {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeProvider = (provider = {}) => {
  const textModels = normalizeModelList(provider.textModels);
  const imageModels = normalizeModelList(provider.imageModels);
  const videoModels = normalizeModelList(provider.videoModels);
  const fallbackMaxTextTokens = provider.maxTextTokens ?? provider.textMaxTokens ?? DEFAULT_MAX_TEXT_TOKENS;
  return {
    id: provider.id || makeId(),
    name: provider.name || '未命名中转站',
    protocol: provider.protocol || 'openai',
    textApiMode: provider.textApiMode || 'auto',
    maxTextTokens: normalizeMaxTextTokens(fallbackMaxTextTokens),
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey || '',
    enabled: provider.enabled !== false,
    textModels,
    imageModels,
    imageModelCapabilities: normalizeImageModelCapabilities(provider.imageModelCapabilities),
    videoModels,
    videoModelCapabilities: normalizeImageModelCapabilities(provider.videoModelCapabilities),
    defaultTextModel: textModels.includes(provider.defaultTextModel) ? provider.defaultTextModel : textModels[0] || '',
    defaultImageModel: imageModels.includes(provider.defaultImageModel) ? provider.defaultImageModel : imageModels[0] || '',
    defaultVideoModel: videoModels.includes(provider.defaultVideoModel) ? provider.defaultVideoModel : videoModels[0] || '',
  };
};

const normalizeSettings = (settings = {}) => ({
  activeProviderId: settings.activeProviderId || '',
  providers: Array.isArray(settings.providers)
    ? settings.providers.map(provider => normalizeProvider({
        ...provider,
        maxTextTokens: provider?.maxTextTokens ?? settings.maxTextTokens,
      }))
    : [],
  allowedModels: {
    text: normalizeModelList(settings.allowedModels?.text),
    image: normalizeModelList(settings.allowedModels?.image),
    video: normalizeModelList(settings.allowedModels?.video),
  },
  maxTextTokens: normalizeMaxTextTokens(settings.maxTextTokens),
});

const getModelCount = (provider) => (
  normalizeModelList(provider?.textModels).length +
  normalizeModelList(provider?.imageModels).length +
  normalizeModelList(provider?.videoModels).length
);

const getProtocolLabel = (protocol) => (
  PROVIDER_PROTOCOL_OPTIONS.find(option => option.value === protocol)?.label || 'OpenAI 兼容'
);

function ModelGroupEditor({
  title,
  models,
  defaultModel,
  onModelsChange,
  onDefaultChange,
  allowManualAdd = true,
  modelSupport = {},
}) {
  const modelOptions = useMemo(() => normalizeModelList(models), [models]);
  const [inputValue, setInputValue] = useState('');

  const addModel = useCallback((value) => {
    if (!allowManualAdd) return;
    const name = (value || inputValue).trim();
    if (!name || modelOptions.includes(name)) return;
    const nextModels = [...modelOptions, name];
    onModelsChange(nextModels);
    if (!defaultModel) onDefaultChange(name);
    setInputValue('');
  }, [allowManualAdd, defaultModel, inputValue, modelOptions, onDefaultChange, onModelsChange]);

  const removeModel = useCallback((name) => {
    const nextModels = modelOptions.filter(model => model !== name);
    onModelsChange(nextModels);
    if (defaultModel === name) onDefaultChange(nextModels[0] || '');
  }, [defaultModel, modelOptions, onDefaultChange, onModelsChange]);

  return (
    <div className="model-group-card">
      <div className="model-group-title">{title}</div>
      <div className="model-tags-input-wrap">
        <div className="model-tags-list">
          {modelOptions.map(model => (
            <span key={model} className="model-tag">
              <span className="model-tag-text" title={model}>
                {model.length > MODEL_TAG_MAX_CHARS ? `${model.slice(0, MODEL_TAG_MAX_CHARS)}...` : model}
              </span>
              {modelSupport[model] && (
                <span className={`model-tag-support ${modelSupport[model]?.adapted === true ? '' : 'unadapted'}`.trim()}>
                  {modelSupport[model]?.adapted === true ? '已适配' : '暂未适配'}
                </span>
              )}
              <button
                type="button"
                className="model-tag-remove"
                aria-label={`移除 ${model}`}
                onClick={() => removeModel(model)}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          {allowManualAdd ? (
            <input
              type="text"
              className="model-tag-input"
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                addModel();
              }}
              placeholder={modelOptions.length === 0 ? '输入模型名，按 Enter 添加' : '输入并回车添加'}
            />
          ) : (
            <span className="model-tag-input-hint">请通过“拉取模型”添加已适配的图片模型</span>
          )}
        </div>
      </div>
      <label>
        默认模型
        <select
          value={defaultModel || ''}
          onChange={event => onDefaultChange(event.target.value)}
          disabled={modelOptions.length === 0}
        >
          <option value="">{modelOptions.length === 0 ? '请先添加模型' : '选择默认模型'}</option>
          {modelOptions.map(model => (
            <option
              value={model}
              key={model}
              disabled={modelSupport[model]?.adapted === false}
            >
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ModelPickerModal({ data, onAppend, onOverwrite, onCancel }) {
  const [selected, setSelected] = useState(() => (
    API_MODEL_GROUPS.reduce((acc, group) => ({ ...acc, [group.key]: [] }), {})
  ));

  const toggleModel = useCallback((groupKey, model) => {
    if (!isPulledModelSelectable(data, groupKey, model)) return;
    setSelected(current => {
      const currentList = current[groupKey] || [];
      return {
        ...current,
        [groupKey]: currentList.includes(model)
          ? currentList.filter(item => item !== model)
          : [...currentList, model],
      };
    });
  }, [data]);

  const selectedCount = API_MODEL_GROUPS.reduce(
    (sum, group) => sum + (selected[group.key]?.length || 0),
    0,
  );
  const totalCount = API_MODEL_GROUPS.reduce(
    (sum, group) => sum + (data[group.key]?.length || 0),
    0,
  );
  const imageModels = data.image || [];
  const adaptedImageCount = filterSelectableModels(data, 'image', imageModels).length;

  return (
    <div className="model-picker-overlay" onClick={onCancel}>
      <section className="model-picker-modal" role="dialog" aria-modal="true" aria-label="选择模型" onClick={event => event.stopPropagation()}>
        <header className="model-picker-header">
          <div>
            <h3>选择模型</h3>
            <span className="model-picker-summary">
              已拉取 {totalCount} 个模型
              {data.enforceImageAdaptation ? ` · 图片模型已适配 ${adaptedImageCount}/${imageModels.length}` : ''}
              {` · 已选 ${selectedCount} 个`}
            </span>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭模型选择">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="model-picker-body">
          {API_MODEL_GROUPS.map(group => {
            const models = data[group.key] || [];
            const selectedModels = selected[group.key] || [];
            const selectableModels = filterSelectableModels(data, group.key, models);
            return (
              <div key={group.key} className="model-picker-group">
                <div className="model-picker-group-header">
                  <span className="model-picker-group-title">{group.title}</span>
                  <span className="model-picker-group-count">{selectedModels.length}/{selectableModels.length} 可选</span>
                </div>
                <div className="model-picker-list">
                  {models.length === 0 ? (
                    <div className="model-picker-empty">没有拉取到模型</div>
                  ) : models.map(model => {
                    const support = group.key === 'image'
                      ? getPulledImageModelSupport(data, model)
                      : group.key === 'video'
                        ? normalizeImageModelCapabilities(data?.videoSupport)[model] || null
                        : null;
                    const selectable = isPulledModelSelectable(data, group.key, model);
                    const reason = support?.reason || '当前版本尚未适配';
                    return (
                      <label
                        key={model}
                        className={`model-picker-item ${selectable ? '' : 'disabled'}`.trim()}
                        title={selectable ? model : `${model}：${reason}`}
                      >
                        <input
                          type="checkbox"
                          className="model-checkbox"
                          checked={selectedModels.includes(model)}
                          disabled={!selectable}
                          onChange={() => toggleModel(group.key, model)}
                        />
                        <span className="model-picker-copy">
                          <span className="model-picker-text">{model}</span>
                          {support?.adapted === true && getCapabilityLabel(support) && (
                            <span className="model-picker-capabilities">{getCapabilityLabel(support)}</span>
                          )}
                          {!selectable && <span className="model-picker-capabilities">{reason}</span>}
                        </span>
                        {group.key === 'image' && data.enforceImageAdaptation && (
                          <span className={`model-picker-status ${selectable ? 'adapted' : 'unadapted'}`}>
                            {selectable ? '已适配' : '暂未适配'}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <footer className="model-picker-footer">
          <button className="api-secondary-btn" type="button" onClick={() => onOverwrite(selected)}>
            覆盖选择
          </button>
          <button className="api-save-btn" type="button" onClick={() => onAppend(selected)} disabled={selectedCount === 0}>
            追加模型
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function SettingsView({
  runtimeSettings,
  loadState = { status: 'idle', error: '' },
  onSaveRuntimeSettings,
}) {
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [draftSettings, setDraftSettings] = useState(() => normalizeSettings(runtimeSettings));
  const [probeState, setProbeState] = useState({ type: '', message: '' });
  const [modelPickerData, setModelPickerData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = normalizeSettings(runtimeSettings);
    setDraftSettings(next);
    setSelectedProviderId(current => (
      current && next.providers.some(provider => provider.id === current)
        ? current
        : next.providers[0]?.id || ''
    ));
    setProbeState({ type: '', message: '' });
    setModelPickerData(null);
  }, [runtimeSettings]);

  const selectedProvider = useMemo(() => (
    draftSettings.providers.find(provider => provider.id === selectedProviderId) || null
  ), [draftSettings.providers, selectedProviderId]);

  const updateDraftSettings = useCallback((updater) => {
    setDraftSettings(current => normalizeSettings(
      typeof updater === 'function' ? updater(current) : { ...current, ...updater }
    ));
  }, []);

  const updateSelectedProvider = useCallback((patch) => {
    if (!selectedProviderId) return;
    updateDraftSettings(current => ({
      ...current,
      providers: current.providers.map(provider => (
        provider.id === selectedProviderId
          ? normalizeProvider({ ...provider, ...patch })
          : provider
      )),
    }));
  }, [selectedProviderId, updateDraftSettings]);

  const saveSettings = useCallback(async (settingsToSave = draftSettings, successMessage = '已保存设置') => {
    setSaving(true);
    setProbeState({ type: 'loading', message: '正在保存...' });
    try {
      const normalized = normalizeSettings(settingsToSave);
      const saved = await onSaveRuntimeSettings(normalized);
      const next = normalizeSettings(saved || normalized);
      setDraftSettings(next);
      setSelectedProviderId(current => (
        current && next.providers.some(provider => provider.id === current)
          ? current
          : next.providers[0]?.id || ''
      ));
      setProbeState({ type: 'success', message: successMessage });
      return next;
    } catch (error) {
      setProbeState({ type: 'error', message: error.message || '保存失败' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [draftSettings, onSaveRuntimeSettings]);

  const addProvider = useCallback(() => {
    const provider = normalizeProvider({
      id: makeId('provider'),
      name: '未命名中转站',
      protocol: 'openai',
      textApiMode: 'auto',
      enabled: true,
    });
    const nextSettings = normalizeSettings({
      ...draftSettings,
      activeProviderId: draftSettings.activeProviderId || provider.id,
      providers: [...draftSettings.providers, provider],
    });
    setDraftSettings(nextSettings);
    setSelectedProviderId(provider.id);
    setProbeState({ type: '', message: '' });
  }, [draftSettings]);

  const deleteProvider = useCallback(async () => {
    if (!selectedProvider) return;
    if (!window.confirm(`确定删除“${selectedProvider.name || '未命名中转站'}”吗？`)) return;
    const nextProviders = draftSettings.providers.filter(provider => provider.id !== selectedProvider.id);
    const nextSettings = normalizeSettings({
      ...draftSettings,
      providers: nextProviders,
      activeProviderId: draftSettings.activeProviderId === selectedProvider.id
        ? nextProviders[0]?.id || ''
        : draftSettings.activeProviderId,
    });
    setDraftSettings(nextSettings);
    setSelectedProviderId(nextProviders[0]?.id || '');
    await saveSettings(nextSettings, '已删除中转站');
  }, [draftSettings, saveSettings, selectedProvider]);

  const setActiveProvider = useCallback(async () => {
    if (!selectedProvider) return;
    const nextSettings = normalizeSettings({
      ...draftSettings,
      activeProviderId: selectedProvider.id,
    });
    setDraftSettings(nextSettings);
    await saveSettings(nextSettings, '已设为默认中转站');
  }, [draftSettings, saveSettings, selectedProvider]);

  const probeProvider = useCallback(async (endpoint) => {
    if (!selectedProvider) return null;
    setProbeState({ type: 'loading', message: endpoint === 'fetch-models' ? '正在拉取模型...' : '正在验证连接...' });
    try {
      const response = await fetch(`${API_BASE}/api/providers/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: selectedProvider.baseUrl,
          api_key: selectedProvider.apiKey,
          protocol: selectedProvider.protocol,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || payload.detail || `请求失败 (${response.status})`);
      }
      return payload;
    } catch (error) {
      setProbeState({ type: 'error', message: error.message || '无法连接服务' });
      return null;
    }
  }, [selectedProvider]);

  const testConnection = useCallback(async () => {
    const payload = await probeProvider('test-connection');
    if (payload) {
      setProbeState({ type: 'success', message: `连接可用，识别到 ${payload.model_count || 0} 个模型` });
    }
  }, [probeProvider]);

  const fetchModels = useCallback(async () => {
    const payload = await probeProvider('fetch-models');
    if (!payload || !selectedProvider) return;
    setModelPickerData({
      text: normalizeModelList(payload.text_models),
      image: normalizeModelList(payload.image_models),
      video: normalizeModelList(payload.video_models),
      enforceImageAdaptation: payload.enforce_image_adaptation === true,
      imageSupport: normalizeImageModelCapabilities(payload.image_model_support),
      videoSupport: normalizeImageModelCapabilities(payload.video_model_support),
    });
    const pulledImageModels = normalizeModelList(payload.image_models);
    const adaptedImageModels = pulledImageModels.filter(model => payload.image_model_support?.[model]?.adapted === true);
    const imageSummary = payload.enforce_image_adaptation
      ? `，图片模型已适配 ${adaptedImageModels.length}/${pulledImageModels.length} 个`
      : '';
    setProbeState({ type: 'success', message: `已拉取 ${payload.model_count || 0} 个模型${imageSummary}，请选择后写入列表` });
  }, [probeProvider, selectedProvider]);

  const applyModelSelection = useCallback((selected, mode) => {
    if (!selectedProvider) return;
    const patch = {};
    API_MODEL_GROUPS.forEach(group => {
      const selectedModels = filterSelectableModels(
        modelPickerData,
        group.key,
        normalizeModelList(selected?.[group.key]),
      );
      const currentModels = normalizeModelList(selectedProvider[group.field]);
      const nextModels = mode === 'append'
        ? normalizeModelList([...currentModels, ...selectedModels])
        : selectedModels;
      patch[group.field] = nextModels;
      patch[group.defaultField] = nextModels.includes(selectedProvider[group.defaultField])
        ? selectedProvider[group.defaultField]
        : nextModels[0] || '';
      if (group.key === 'image' && modelPickerData?.enforceImageAdaptation) {
        const selectedCapabilities = selectCapabilities(modelPickerData.imageSupport, selectedModels);
        patch.imageModelCapabilities = mode === 'append'
          ? { ...normalizeImageModelCapabilities(selectedProvider.imageModelCapabilities), ...selectedCapabilities }
          : selectedCapabilities;
      }
      if (group.key === 'video') {
        const selectedCapabilities = selectCapabilities(modelPickerData.videoSupport, selectedModels);
        patch.videoModelCapabilities = mode === 'append'
          ? { ...normalizeImageModelCapabilities(selectedProvider.videoModelCapabilities), ...selectedCapabilities }
          : selectedCapabilities;
      }
    });
    updateSelectedProvider(patch);
    setModelPickerData(null);
    setProbeState({
      type: 'success',
      message: mode === 'append' ? '已追加选中的模型，请保存设置' : '已覆盖为本次选择的模型，请保存设置',
    });
  }, [modelPickerData, selectedProvider, updateSelectedProvider]);

  return (
    <main className="workspace-page">
      <div className="page-header settings-page-header">
        <div>
          <h1>设置</h1>
          <p>配置中转站、模型列表和文本输出额度。</p>
        </div>
      </div>

      {loadState.status === 'error' && (
        <div className="provider-settings-error">设置加载失败：{loadState.error}</div>
      )}

      <section className="settings-layout">
        <aside className="api-list-pane">
          <div className="settings-pane-header">
            <h2>中转站</h2>
            <button className="small-action-btn" type="button" onClick={addProvider}>新增</button>
          </div>
          <div className="api-list">
            {loadState.status === 'loading' && (
              <div className="empty-settings">正在读取设置...</div>
            )}
            {loadState.status !== 'loading' && draftSettings.providers.length === 0 && (
              <div className="empty-settings">还没有中转站，点击“新增”开始配置。</div>
            )}
            {draftSettings.providers.map(provider => (
              <button
                key={provider.id}
                type="button"
                className={`api-list-item ${provider.id === selectedProviderId ? 'active' : ''}`}
                onClick={() => setSelectedProviderId(provider.id)}
              >
                <span className="api-list-name-row">
                  <span>{provider.name || '未命名中转站'}</span>
                  {provider.id === draftSettings.activeProviderId && <em>默认</em>}
                </span>
                <small className="api-list-meta">
                  <span className={`api-list-state ${provider.enabled === false ? 'disabled' : 'enabled'}`}>
                    {provider.enabled === false ? '未启用' : '已启用'}
                  </span>
                  {' · '}
                  {getProtocolLabel(provider.protocol)}
                  {' · '}
                  {getModelCount(provider)} 个模型
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="api-config-pane">
          {selectedProvider ? (
            <>
              <div className="settings-pane-header">
                <h2>{selectedProvider.name || '未命名中转站'}</h2>
                <span className={`api-status-pill ${selectedProvider.enabled === false ? 'disabled' : ''}`}>
                  {selectedProvider.enabled === false ? '未启用' : '已启用'}
                </span>
              </div>
              <div className="api-form">
                <div className="api-form-grid two-col">
                  <label>
                    中转站名称
                    <input value={selectedProvider.name} onChange={event => updateSelectedProvider({ name: event.target.value })} />
                  </label>
                  <label>
                    协议类型
                    <select value={selectedProvider.protocol} onChange={event => updateSelectedProvider({ protocol: event.target.value })}>
                      {PROVIDER_PROTOCOL_OPTIONS.map(option => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="api-form-grid two-col">
                  <label>
                    Base URL
                    <input
                      value={selectedProvider.baseUrl}
                      onChange={event => updateSelectedProvider({ baseUrl: event.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                  </label>
                  <label>
                    文本接口模式
                    <select value={selectedProvider.textApiMode || 'auto'} onChange={event => updateSelectedProvider({ textApiMode: event.target.value })}>
                      {TEXT_API_MODE_OPTIONS.map(option => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    最大文本 Token
                    <select
                      value={selectedProvider.maxTextTokens}
                      onChange={event => updateSelectedProvider({ maxTextTokens: Number(event.target.value) })}
                    >
                      {[4096, 8192, 16384, 32768].map(value => (
                        <option key={value} value={value}>{value / 1024}K</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="api-key-row">
                  <label>
                    API Key
                    <input
                      value={selectedProvider.apiKey}
                      onChange={event => updateSelectedProvider({ apiKey: event.target.value })}
                      placeholder="sk-..."
                      type="password"
                      autoComplete="off"
                    />
                  </label>
                  <button className="api-secondary-btn" type="button" onClick={() => updateSelectedProvider({ apiKey: '' })}>清除 Key</button>
                </div>
                <div className="api-probe-actions">
                  <button className="api-secondary-btn" type="button" onClick={testConnection}>验证连接</button>
                  <button className="api-secondary-btn" type="button" onClick={fetchModels}>拉取模型</button>
                  {probeState.message && <span className={`api-probe-message ${probeState.type}`}>{probeState.message}</span>}
                </div>
                <div className="model-groups">
                  {API_MODEL_GROUPS.map(group => (
                    <ModelGroupEditor
                      key={group.key}
                      title={group.title}
                      models={selectedProvider[group.field]}
                      defaultModel={selectedProvider[group.defaultField]}
                      onModelsChange={models => updateSelectedProvider({
                        [group.field]: models,
                        [group.defaultField]: models.includes(selectedProvider[group.defaultField])
                          ? selectedProvider[group.defaultField] : models[0] || '',
                      })}
                      onDefaultChange={model => updateSelectedProvider({ [group.defaultField]: model })}
                      allowManualAdd={selectedProvider.protocol !== 'apimart' || group.key !== 'image'}
                      modelSupport={group.key === 'image' ? selectedProvider.imageModelCapabilities : {}}
                    />
                  ))}
                </div>
                <div className="api-form-actions">
                  <label className="api-switch-control">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={selectedProvider.enabled !== false}
                      onChange={event => updateSelectedProvider({ enabled: event.target.checked })}
                    />
                    <span className="api-switch-track" aria-hidden="true"><span className="api-switch-thumb" /></span>
                    <span className="api-switch-label">{selectedProvider.enabled === false ? '未启用' : '已启用'}</span>
                  </label>
                  <div className="api-form-action-buttons">
                    {selectedProvider.id !== draftSettings.activeProviderId && (
                      <button className="api-secondary-btn" type="button" onClick={setActiveProvider}>
                        设为默认
                      </button>
                    )}
                    <button className="api-delete-btn" type="button" onClick={deleteProvider}>
                      <Icon name="trash" size={15} /> 删除
                    </button>
                    <button className="api-save-btn" type="button" onClick={() => saveSettings()} disabled={saving}>
                      <Icon name="save" size={15} /> {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-settings">选择或新增一个中转站。</div>
          )}
        </section>
      </section>
      {modelPickerData && (
        <ModelPickerModal
          data={modelPickerData}
          onCancel={() => setModelPickerData(null)}
          onAppend={selected => applyModelSelection(selected, 'append')}
          onOverwrite={selected => applyModelSelection(selected, 'overwrite')}
        />
      )}
    </main>
  );
}
