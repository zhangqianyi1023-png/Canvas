import { memo, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import ModelSelect from '../components/ModelSelect';
import { SUPPORTED_IMAGE_ACCEPT, isSupportedImageFile, getUnsupportedImageMessage } from '../imageFormats';
import { uploadImageFile } from '../uploadImage';
import {
  getDefaultProviderModel,
  getEnabledProvidersWithModels,
  getProviderModels,
  normalizeImageList,
} from '../smartSplitter';
import {
  IMAGE_RATIO_PRESETS,
  getDefaultImageRatioPresetId,
  getImageRatioSummary,
} from '../imageRatioPresets';
import { getSmartSplitterPhaseLabel, isSmartSplitterBusy } from '../smartSplitterLifecycle';
import { resolveImageNegativePrompt } from '../imageNegativePrompt';

const IMAGE_RESOLUTION_OPTIONS = ['1k', '2k', '4k'];
const DIRECTION_OPTIONS = ['auto', 2, 3, 4, 5, 6, 7, 8];
const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4];
const MAX_REFERENCE_IMAGES = 10;

const getDirectionLabel = (value) => (
  value === 'auto' ? '智能方向' : `${value} 方向`
);

function OptionRow({ options, value, onChange, disabled = false }) {
  return (
    <div className="option-row">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`option-btn ${String(value) === String(option.value) ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RatioCard({ channel, value, shape, active, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`ratio-card ${active ? 'active' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={`ratio-card-icon ${shape || ''}`} />
      <span className="ratio-card-text">
        <span className="ratio-card-channel">{channel}</span>
        {value !== 'auto' && <span className="ratio-card-value">{value}</span>}
      </span>
    </button>
  );
}

function SmartSplitterProcessor({ id, data }) {
  const [form, setForm] = useState({
    local_prompt: data?.local_prompt || '',
    uploaded_reference_images: normalizeImageList(data?.uploaded_reference_images),
    direction_count: data?.direction_count || 'auto',
    images_per_direction: data?.images_per_direction || 1,
    text_api_id: data?.text_api_id || '',
    text_model: data?.text_model || '',
    image_api_id: data?.image_api_id || '',
    image_model: data?.image_model || '',
    image_negative_prompt: resolveImageNegativePrompt(data?.image_negative_prompt),
    image_size: data?.image_size || '3:4',
    image_size_preset: data?.image_size_preset || getDefaultImageRatioPresetId(data?.image_size || '3:4'),
    image_resolution: data?.image_resolution || '1k',
  });
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  const textProviders = useMemo(() => getEnabledProvidersWithModels(data?.apiProviders, 'text'), [data?.apiProviders]);
  const imageProviders = useMemo(() => getEnabledProvidersWithModels(data?.apiProviders, 'image'), [data?.apiProviders]);
  const selectedTextProvider = textProviders.find(provider => provider.id === form.text_api_id) || textProviders[0] || null;
  const selectedImageProvider = imageProviders.find(provider => provider.id === form.image_api_id) || imageProviders[0] || null;
  const textModels = getProviderModels(selectedTextProvider, 'text');
  const imageModels = getProviderModels(selectedImageProvider, 'image');
  const selectedTextModel = textModels.includes(form.text_model) ? form.text_model : getDefaultProviderModel(selectedTextProvider, 'text');
  const selectedImageModel = imageModels.includes(form.image_model) ? form.image_model : getDefaultProviderModel(selectedImageProvider, 'image');
  const isRunning = isSmartSplitterBusy(data?.status);
  const phaseLabel = getSmartSplitterPhaseLabel(data?.status);
  const connectedImages = useMemo(() => normalizeImageList(data?.connected_images), [data?.connected_images]);
  const uploadedReferenceImages = normalizeImageList(form.uploaded_reference_images);
  const visibleUploadedReferenceImages = uploadedReferenceImages.slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length));
  const totalReferenceCount = Math.min(MAX_REFERENCE_IMAGES, connectedImages.length + uploadedReferenceImages.length);
  const remainingReferenceSlots = Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length - uploadedReferenceImages.length);

  const updateField = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    data?.onDataChange?.(id, { [key]: value });
  };

  const updateImageRatio = (preset) => {
    setForm(current => ({
      ...current,
      image_size: preset.value,
      image_size_preset: preset.id,
    }));
    data?.onDataChange?.(id, {
      image_size: preset.value,
      image_size_preset: preset.id,
    });
  };

  const handleFiles = async (files) => {
    const imageFiles = Array.from(files || []);
    const invalid = imageFiles.find(file => !isSupportedImageFile(file));
    if (invalid) {
      setLocalError(getUnsupportedImageMessage(invalid));
      return;
    }
    const remaining = remainingReferenceSlots;
    if (remaining <= 0 || imageFiles.length === 0) return;
    setUploading(true);
    setLocalError('');
    try {
      const urls = [];
      for (const file of imageFiles.slice(0, remaining)) {
        const asset = await uploadImageFile(file);
        if (asset?.url) urls.push(asset.url);
      }
      const next = [...new Set([...uploadedReferenceImages, ...urls])].slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length));
      updateField('uploaded_reference_images', next);
    } catch (error) {
      setLocalError(error?.message || '参考图上传失败');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setSettingsOpen(false);
    setModelMenuOpen(false);
    data?.onRun?.(id, {
      ...form,
      uploaded_reference_images: uploadedReferenceImages,
      direction_count: form.direction_count === 'auto' ? 'auto' : Number(form.direction_count),
      images_per_direction: Number(form.images_per_direction),
      text_api_id: selectedTextProvider?.id || '',
      text_model: selectedTextModel || '',
      image_api_id: selectedImageProvider?.id || '',
      image_model: selectedImageModel || '',
    });
  };

  const directionOptions = DIRECTION_OPTIONS.map(value => ({
    value,
    label: value === 'auto' ? '智能' : `${value} 个`,
  }));
  const imageCountOptions = IMAGE_COUNT_OPTIONS.map(value => ({ value, label: `${value} 张` }));
  const resolutionOptions = IMAGE_RESOLUTION_OPTIONS.map(value => ({ value, label: value.toUpperCase() }));
  const settingsSummary = `${getDirectionLabel(form.direction_count)} · 每方向 ${form.images_per_direction} 张 · ${getImageRatioSummary(form.image_size, form.image_size_preset)} · ${form.image_resolution.toUpperCase()}`;
  const modelSummary = `${selectedTextProvider?.name || '文本'} / ${selectedImageProvider?.name || '图片'}`;
  return (
    <div className={`custom-node processor-node smart-splitter-processor ${data?.status || 'idle'}`}>
      <div className="processor-header">
        <span><Icon name="smartSplitter" size={16} /> 智能拆分器</span>
        <span className="processor-subtitle">{phaseLabel || '保留原始需求，生成多个下游方向'}</span>
      </div>
      <div className="node-body">
        {(localError || data?.errorMessage) && (
          <div className="processor-error">{localError || data.errorMessage}</div>
        )}
        <div className="node-field">
          <label>本次拆分要求</label>
          <textarea
            value={form.local_prompt}
            disabled={isRunning}
            rows={5}
            placeholder="例如：基于商品信息拆成 3 套差异明显的广告视觉方向"
            onChange={event => updateField('local_prompt', event.target.value)}
          />
        </div>
        <div className="node-field">
          <label>负面提示词</label>
          <textarea
            value={form.image_negative_prompt}
            disabled={isRunning}
            rows={3}
            placeholder="输入不希望出现在图片里的内容..."
            onChange={event => updateField('image_negative_prompt', event.target.value)}
          />
        </div>
        {data?.connectedPrompt && (
          <div className="smart-splitter-context">
            <div className="settings-label">上游背景</div>
            <p>{data.connectedPrompt}</p>
          </div>
        )}
        <div className="node-field">
          <label>
            参考素材 <span className="field-counter">{totalReferenceCount}/{MAX_REFERENCE_IMAGES}</span>
          </label>
          <div className="smart-splitter-ref-list">
            {connectedImages.slice(0, MAX_REFERENCE_IMAGES).map((url, index) => (
              <div key={`connected_${url}_${index}`} className="smart-splitter-ref smart-splitter-ref-connected">
                <img src={url} alt={`上游参考图 ${index + 1}`} />
                <span className="smart-splitter-ref-index">图 {index + 1}</span>
                <span className="smart-splitter-ref-badge">上游</span>
              </div>
            ))}
            {visibleUploadedReferenceImages.map((url, index) => (
              <div key={`uploaded_${url}_${index}`} className="smart-splitter-ref smart-splitter-ref-local">
                <img src={url} alt={`本地参考图 ${index + 1}`} />
                <span className="smart-splitter-ref-index">图 {connectedImages.length + index + 1}</span>
                <span className="smart-splitter-ref-badge">本地</span>
                <button
                  type="button"
                  onClick={() => updateField('uploaded_reference_images', uploadedReferenceImages.filter(item => item !== url))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="smart-splitter-ref-add"
              disabled={isRunning || uploading || remainingReferenceSlots <= 0}
              title={remainingReferenceSlots <= 0 ? '参考素材已满' : '上传本地参考图'}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '上传中...' : '添加参考图'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_IMAGE_ACCEPT}
            multiple
            hidden
            onChange={event => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="processor-footer-wrap smart-splitter-footer-wrap">
        {modelMenuOpen && (
          <div className="processor-settings-panel smart-splitter-model-panel">
            <div className="settings-section">
              <div className="settings-label">文本模型</div>
              <div className="smart-splitter-model-fields">
                <select value={selectedTextProvider?.id || ''} disabled={isRunning} onChange={event => updateField('text_api_id', event.target.value)}>
                  {textProviders.length ? textProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name || 'LLM'}</option>) : <option value="">未配置文本模型</option>}
                </select>
                <ModelSelect
                  value={selectedTextModel || ''}
                  options={textModels.length ? textModels : [{ value: '', label: '未配置', disabled: true }]}
                  onChange={value => updateField('text_model', value)}
                  disabled={isRunning || textModels.length === 0}
                  placeholder="未配置"
                  menuPortal
                  className="smart-splitter-model-select"
                  menuMinWidth={280}
                />
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">图片模型</div>
              <div className="smart-splitter-model-fields">
                <select value={selectedImageProvider?.id || ''} disabled={isRunning} onChange={event => updateField('image_api_id', event.target.value)}>
                  {imageProviders.length ? imageProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name || '图片 API'}</option>) : <option value="">未配置图片模型</option>}
                </select>
                <ModelSelect
                  value={selectedImageModel || ''}
                  options={imageModels.length ? imageModels : [{ value: '', label: '未配置', disabled: true }]}
                  onChange={value => updateField('image_model', value)}
                  disabled={isRunning || imageModels.length === 0}
                  placeholder="未配置"
                  menuPortal
                  className="smart-splitter-model-select"
                  menuMinWidth={280}
                />
              </div>
            </div>
          </div>
        )}
        {settingsOpen && (
          <div className="processor-settings-panel smart-splitter-settings-panel">
            <div className="settings-section">
              <div className="settings-label">比例</div>
              <div className="ratio-grid image-ratio-grid">
                {IMAGE_RATIO_PRESETS.map(option => (
                  <RatioCard
                    key={option.id}
                    channel={option.channel}
                    value={option.value}
                    shape={option.shape}
                    active={(form.image_size_preset || getDefaultImageRatioPresetId(form.image_size)) === option.id}
                    disabled={isRunning}
                    onClick={() => updateImageRatio(option)}
                  />
                ))}
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">方向数量</div>
              <OptionRow
                options={directionOptions}
                value={form.direction_count}
                disabled={isRunning}
                onChange={value => updateField('direction_count', value === 'auto' ? 'auto' : Number(value))}
              />
            </div>
            <div className="settings-section">
              <div className="settings-label">每方向候选</div>
              <OptionRow
                options={imageCountOptions}
                value={form.images_per_direction}
                disabled={isRunning}
                onChange={value => updateField('images_per_direction', Number(value))}
              />
            </div>
            <div className="settings-section smart-splitter-settings-row">
              <div>
                <div className="settings-label">分辨率</div>
                <OptionRow
                  options={resolutionOptions}
                  value={form.image_resolution}
                  disabled={isRunning}
                  onChange={value => updateField('image_resolution', value)}
                />
              </div>
            </div>
          </div>
        )}
        <div className="processor-footer">
          <button
            type="button"
            className="processor-settings-btn smart-splitter-model-trigger"
            disabled={isRunning}
            onClick={() => {
              setModelMenuOpen(open => !open);
              setSettingsOpen(false);
            }}
          >
            <Icon name="settings" size={15} />
            <span className="processor-settings-summary">{modelSummary}</span>
          </button>
          <button
            type="button"
            className="processor-settings-btn"
            onClick={() => {
              setSettingsOpen(open => !open);
              setModelMenuOpen(false);
            }}
          >
            <span className="processor-settings-summary">{settingsSummary}</span>
          </button>
          <button
            type="button"
            className={`processor-run-btn ${isRunning ? 'cancel' : ''}`}
            disabled={false}
            title={isRunning ? '停止运行' : '新增一批结果'}
            aria-label={isRunning ? '停止运行' : '新增一批结果'}
            onClick={isRunning ? () => data?.onCancel?.(id) : submit}
          >
            <Icon name={isRunning ? 'stop' : 'play'} size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(SmartSplitterProcessor);
