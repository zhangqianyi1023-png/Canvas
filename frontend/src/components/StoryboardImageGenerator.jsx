// ===== 分镜卡片生图弹窗 =====
// 从分镜卡片占位图点击后弹出，预填上游正 prompt 和参考图。
// 用户在弹窗里修改/确认后点运行才真正调图 API。
// 复用 GeneratorNode 的 image 模式 UI（参考图、比例、分辨率、模型下拉）。

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import { uploadImageFile } from '../uploadImage';
import {
  IMAGE_RATIO_PRESETS,
  getDefaultImageRatioPresetId,
  getImageRatioPreset,
  getImageRatioSummary,
  ratioToCssAspectRatio,
} from '../imageRatioPresets';
import {
  composeImageGenerationPrompt,
  mergeDefaultImageNegativePrompt,
} from '../imageNegativePrompt';
const MAX_REFERENCE_IMAGES = 10;

const RESOLUTION_OPTIONS = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
];

const normalizeModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

const getProviderModels = (api, type) => {
  if (type === 'text') return normalizeModelList(api?.textModels);
  if (type === 'image') return normalizeModelList(api?.imageModels);
  if (type === 'video') return normalizeModelList(api?.videoModels);
  return [];
};

const getProviderDefaultModel = (api, type, models) => {
  const defaultModel = type === 'image' ? api?.defaultImageModel : api?.defaultVideoModel;
  return models.includes(defaultModel) ? defaultModel : models[0];
};

const buildModelProviders = (apiProviders, flattenedApis, type) => {
  const providers = Array.isArray(apiProviders)
    ? apiProviders
        .filter(api => api?.enabled !== false && getProviderModels(api, type).length > 0)
        .map(api => {
          const models = getProviderModels(api, type);
          return {
            id: api.id,
            name: api.name,
            baseUrl: api.baseUrl,
            apiKey: api.apiKey,
            models,
            defaultModel: getProviderDefaultModel(api, type, models),
          };
        })
    : [];
  if (providers.length > 0) return providers;

  const groups = new Map();
  (Array.isArray(flattenedApis) ? flattenedApis : [])
    .filter(api => api?.type === type)
    .forEach(api => {
      const id = api.providerId || api.baseUrl || api.id;
      const existing = groups.get(id);
      const nextModels = [...(existing?.models || []), api.model].filter(Boolean);
      groups.set(id, {
        id,
        name: api.providerName || api.name || 'API',
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        models: [...new Set(nextModels)],
        defaultModel: existing?.defaultModel || api.model || '',
      });
    });

  return [...groups.values()];
};

function StoryboardImageGenerator({
  initialPrompt = '',
  initialNegativePrompt = '',
  referenceImages: initialReferenceImages = [],
  apiConfigs = [],
  apiProviders = [],
  aspectRatio = '16:9',
  cardInfo = null,           // { shotNo, title } 顶部展示用
  onClose,
  onRun,                     // ({ payload, generationConfig }) => Promise<{ ok, reason? }>
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [negativePrompt, setNegativePrompt] = useState(() => mergeDefaultImageNegativePrompt(initialNegativePrompt));
  const [connectedImages] = useState(() => (initialReferenceImages || []).filter(Boolean));
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState([]);
  const [referenceUploads, setReferenceUploads] = useState([]);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [imageSize, setImageSize] = useState(aspectRatio);
  const [imageSizePreset, setImageSizePreset] = useState(getDefaultImageRatioPresetId(aspectRatio));
  const [imageResolution, setImageResolution] = useState('1k');
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [selectedImageApiId, setSelectedImageApiId] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const ratioMenuRef = useRef(null);

  useEffect(() => {
    if (!ratioMenuOpen) return;
    const handlePointerDown = (e) => {
      if (ratioMenuRef.current && !ratioMenuRef.current.contains(e.target)) {
        setRatioMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [ratioMenuOpen]);

  const referenceInputRef = useRef(null);

  // 上游参考图 + 上传参考图 合并后限流 MAX_REFERENCE_IMAGES
  const referenceImages = useMemo(
    () => [...connectedImages, ...uploadedReferenceImages].slice(0, MAX_REFERENCE_IMAGES),
    [connectedImages, uploadedReferenceImages]
  );
  const remainingReferenceSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);

  const imageApiConfigs = useMemo(
    () => buildModelProviders(apiProviders, apiConfigs, 'image'),
    [apiProviders, apiConfigs]
  );
  const selectedImageApi = imageApiConfigs.find(api => api.id === selectedImageApiId) || imageApiConfigs[0];
  const imageModelOptions = selectedImageApi?.models || [];
  const selectedImageModel = imageModelOptions.includes(imageModel)
    ? imageModel
    : selectedImageApi?.defaultModel || imageModelOptions[0] || imageModel;
  const selectedRatioPreset = getImageRatioPreset(imageSizePreset);

  useEffect(() => {
    if (selectedImageApi?.id && selectedImageApi.id !== selectedImageApiId) {
      setSelectedImageApiId(selectedImageApi.id);
    }
  }, [selectedImageApi?.id, selectedImageApiId]);

  useEffect(() => {
    if (!selectedImageModel || imageModel === selectedImageModel) return;
    setImageModel(selectedImageModel);
  }, [imageModel, selectedImageModel]);

  const resetError = useCallback(() => {
    setErrorMessage('');
  }, []);

  const showError = useCallback((message) => {
    setStatus('error');
    setErrorMessage(message);
  }, []);

  const appendUploadedReference = useCallback((imageUrl) => {
    setUploadedReferenceImages(prev => [...prev, imageUrl].slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length)));
  }, [connectedImages.length]);

  const handleReferenceUpload = useCallback((e) => {
    const allFiles = Array.from(e.target.files || []);
    const files = allFiles.filter(isSupportedImageFile);
    const unsupportedCount = allFiles.filter(file => file.type.startsWith('image/') && !isSupportedImageFile(file)).length;
    e.target.value = '';
    if (unsupportedCount > 0) {
      showError(getUnsupportedImageMessage(unsupportedCount));
    }
    if (files.length === 0 || remainingReferenceSlots === 0) return;
    setIsUploadingReferences(true);
    const selectedFiles = files.slice(0, remainingReferenceSlots);
    const queuedUploads = selectedFiles.map(file => ({
      id: `${file.name}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      error: '',
    }));
    setReferenceUploads(prev => [...prev, ...queuedUploads]);

    Promise.allSettled(selectedFiles.map((file, index) => {
      const uploadId = queuedUploads[index].id;
      return uploadImageFile(file, (progress) => {
        setReferenceUploads(prev => prev.map(item => (
          item.id === uploadId ? { ...item, progress } : item
        )));
      }).then((asset) => {
        appendUploadedReference(asset.url);
        setReferenceUploads(prev => prev.filter(item => {
          if (item.id === uploadId) URL.revokeObjectURL(item.previewUrl);
          return item.id !== uploadId;
        }));
      }).catch((error) => {
        setReferenceUploads(prev => prev.map(item => (
          item.id === uploadId ? { ...item, error: error.message || '上传失败' } : item
        )));
        throw error;
      });
    })).finally(() => setIsUploadingReferences(false));
  }, [appendUploadedReference, remainingReferenceSlots, showError]);

  const removeUploadedReference = useCallback((index) => {
    setUploadedReferenceImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleRun = useCallback(async () => {
    setStatus('running');
    resetError();
    try {
      if (!onRun) throw new Error('缺少分镜生图运行处理器');
      const result = await onRun({
        payload: {
          api_base_url: selectedImageApi?.baseUrl || '',
          api_key: selectedImageApi?.apiKey || '',
          prompt: composeImageGenerationPrompt(prompt, negativePrompt),
          model: selectedImageModel,
          size: imageSize,
          resolution: imageResolution,
          image_urls: referenceImages,
        },
        generationConfig: {
          image_api_id: selectedImageApi?.id || '',
          model: selectedImageModel,
          image_size: imageSize,
          image_size_preset: imageSizePreset,
          image_resolution: imageResolution,
          reference_image_count: referenceImages.length,
        },
      });
      if (result?.ok) {
        resetError();
        setStatus('success');
        onClose?.();
      } else {
        showError(result?.reason || '图片生成失败');
      }
    } catch (e) {
      let message = e.message || '图片生成失败';
      if (e.name === 'TypeError' && message === 'Failed to fetch') {
        message = '无法连接到后端 API。请确认后端服务是否启动。';
      }
      showError(message);
    }
  }, [imageResolution, imageSize, imageSizePreset, negativePrompt, onClose, onRun, prompt, referenceImages, resetError, selectedImageApi, selectedImageModel, showError]);

  const handleCopy = useCallback(async (text, fieldKey) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedField(fieldKey);
      window.setTimeout(() => {
        setCopiedField(current => current === fieldKey ? '' : current);
      }, 1200);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="modal-overlay storyboard-image-generator-overlay" onClick={onClose}>
      <div
        className="modal-dialog storyboard-image-generator-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="material-edit-header">
          <h3>
            {cardInfo?.shotNo ? `镜号 ${cardInfo.shotNo} · 生成本帧图片` : '生成本帧图片'}
          </h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="storyboard-image-generator-body">
          {errorMessage && (
            <div className="processor-error-message">
              <div className="processor-error-text">{errorMessage}</div>
            </div>
          )}

          <div className="node-field">
            <div className="reference-card-row">
              <button
                type="button"
                className="reference-add-card"
                onClick={() => referenceInputRef.current?.click()}
                disabled={remainingReferenceSlots === 0}
                title={remainingReferenceSlots === 0 ? '参考素材已满' : '上传图片'}
                aria-label={`上传参考图片，已添加 ${referenceImages.length + referenceUploads.length} 张，最多 ${MAX_REFERENCE_IMAGES} 张`}
              >
                <Icon name="add" size={18} strokeWidth={2.3} />
                <span className="reference-add-count">{referenceImages.length + referenceUploads.length}/{MAX_REFERENCE_IMAGES}</span>
              </button>
              {connectedImages.slice(0, MAX_REFERENCE_IMAGES).map((src, index) => (
                <div className="reference-card" key={`connected_${src.slice(0, 32)}_${index}`}>
                  <img src={src} alt={`连接素材 ${index + 1}`} />
                  <span className="reference-badge">连接</span>
                </div>
              ))}
              {uploadedReferenceImages.slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length)).map((src, index) => (
                <div className="reference-card" key={`uploaded_${src.slice(0, 32)}_${index}`}>
                  <img src={src} alt={`上传素材 ${index + 1}`} />
                  <button className="thumb-remove" onClick={() => removeUploadedReference(index)} aria-label="删除">
                    <Icon name="x" size={13} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
              {referenceUploads.map(item => (
                <div className="reference-card uploading" key={item.id}>
                  <img src={item.previewUrl} alt={item.name} />
                  <div className="upload-progress-overlay">
                    <div className="upload-progress-bar">
                      <span style={{ width: `${item.progress}%` }} />
                    </div>
                    <strong>{item.error ? '上传失败' : `${item.progress}%`}</strong>
                  </div>
                </div>
              ))}
            </div>
            <input
              ref={referenceInputRef}
              type="file"
              accept={SUPPORTED_IMAGE_ACCEPT}
              multiple
              onChange={handleReferenceUpload}
              style={{ display: 'none' }}
            />
          </div>

          <div className="node-field">
            <div className="storyboard-prompt-block-label">
              <label>正向提示词</label>
              <button
                type="button"
                className="storyboard-prompt-copy-btn"
                onClick={() => handleCopy(prompt, 'positive')}
                disabled={!prompt}
                title="复制正向 prompt"
              >
                {copiedField === 'positive' ? '已复制' : <><Icon name="copy" size={12} /> 复制</>}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="正向提示词：构图、光线、色彩、材质、主体、动作细节..."
              rows={5}
            />
          </div>

          <div className="node-field">
            <div className="storyboard-prompt-block-label">
              <label>反向提示词</label>
              <button
                type="button"
                className="storyboard-prompt-copy-btn"
                onClick={() => handleCopy(negativePrompt, 'negative')}
                disabled={!negativePrompt}
                title="复制反向 prompt"
              >
                {copiedField === 'negative' ? '已复制' : <><Icon name="copy" size={12} /> 复制</>}
              </button>
            </div>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="反向提示词：瑕疵、低质元素、与画幅/风格不匹配的元素..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-actions">
            <div className="storyboard-generator-inline-settings">
              <div className="storyboard-generator-ratio-dropdown" ref={ratioMenuRef}>
                <button
                  type="button"
                  className="storyboard-generator-ratio-trigger"
                  onClick={() => setRatioMenuOpen(v => !v)}
                >
                  {getImageRatioSummary(imageSize, imageSizePreset)}
                  <Icon name="chevronDown" size={10} />
                </button>
                {ratioMenuOpen && (
                  <div className="storyboard-generator-ratio-menu">
                    {IMAGE_RATIO_PRESETS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`storyboard-generator-ratio-menu-item ${selectedRatioPreset.id === opt.id ? 'active' : ''}`}
                        onClick={() => {
                          setImageSize(opt.value);
                          setImageSizePreset(opt.id);
                          setRatioMenuOpen(false);
                        }}
                      >
                        <span className={`storyboard-generator-ratio-shape ${opt.shape || ''}`} style={{ aspectRatio: ratioToCssAspectRatio(opt.value) }} />
                        <span className="storyboard-generator-ratio-text">
                          <span>{opt.channel}</span>
                          {opt.value !== 'auto' && <strong>{opt.value}</strong>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                className="storyboard-generator-res-select"
                value={imageResolution}
                onChange={(e) => setImageResolution(e.target.value)}
              >
                {RESOLUTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <select
            className="processor-model-select storyboard-generator-api-select"
            value={selectedImageApi?.id || ''}
            onChange={(e) => setSelectedImageApiId(e.target.value)}
          >
            {imageApiConfigs.length > 0
              ? imageApiConfigs.map(api => (
                <option key={api.id} value={api.id}>{api.name || 'API'}</option>
              ))
              : <option value="">未配置 API</option>}
          </select>
          <select
            className="processor-model-select storyboard-generator-model-select"
            value={selectedImageModel}
            onChange={(e) => setImageModel(e.target.value)}
            disabled={!selectedImageApi && imageModelOptions.length === 0}
          >
            {imageModelOptions.length > 0
              ? imageModelOptions.map(m => <option key={m} value={m}>{m}</option>)
              : <option value="gpt-image-2">gpt-image-2</option>}
          </select>
          <button className="modal-btn cancel" onClick={onClose}>取消</button>
          <button
            className="modal-btn confirm"
            onClick={handleRun}
            disabled={status === 'running' || isUploadingReferences || !prompt.trim()}
          >
            <Icon name={status === 'running' ? 'loader' : 'play'} size={14} />
            <span>{status === 'running' ? '生成中...' : '运行'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(StoryboardImageGenerator);
