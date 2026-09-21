import { memo, useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, useStore } from 'reactflow';
import Icon from '../components/Icon';
import ImageMentionTextarea from '../components/ImageMentionTextarea';
import QuickPromptControl from '../components/QuickPromptControl';
import useQuickPrompts from '../useQuickPrompts';
import { composeQuickPromptText, findQuickPrompt } from '../quickPrompts';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import {
  STORYBOARD_FIELD_DEFAULTS,
  parseStoryboardPayload,
} from '../storyboardUtils';
import { buildBasicScriptPrompt } from '../storyboardPrompts';
import { uploadImageFile } from '../uploadImage';
import { API_BASE } from '../apiBase';
import { buildPromptWithImageMentions } from '../imagePromptReferences';
import {
  IMAGE_GENERATION_RATIO_PRESETS,
  getDefaultImageRatioPresetId,
  getImageRatioSummary,
} from '../imageRatioPresets';
import {
  composeImageGenerationPrompt,
  resolveImageNegativePrompt,
} from '../imageNegativePrompt';
import {
  getTalentPackageCertifiedAssetUrlsByType,
  getTalentPackageReferenceAudioUrls,
  getVideoRoleAssetsFromAvatarAsset,
} from '../talentPackage';
import {
  buildCapabilityOptions,
  buildImageRatioOptions,
  normalizeImageModelCapabilities,
  resolveCapabilityValue,
} from '../apimartModelSupport';

const MAX_REFERENCE_IMAGES = 10;
const TEXT_REFERENCE_POPOVER_WIDTH = 360;
const TEXT_REFERENCE_POPOVER_HEIGHT = 220;
const TEXT_REFERENCE_POPOVER_GAP = 8;
const TEXT_REFERENCE_POPOVER_MARGIN = 12;
const REFERENCE_IMAGE_PREVIEW_MAX_SIZE = 220;
const REFERENCE_IMAGE_PREVIEW_GAP = 8;
const REFERENCE_IMAGE_PREVIEW_MARGIN = 12;
const DEFAULT_MAX_TEXT_TOKENS = 8192;
const VIDEO_GENERATION_MODE_OMNI = 'omni_reference';
const VIDEO_GENERATION_MODE_FIRST_LAST = 'first_last_frame';
const VIDEO_GENERATION_MODE_LABELS = {
  [VIDEO_GENERATION_MODE_OMNI]: '全能参考',
  [VIDEO_GENERATION_MODE_FIRST_LAST]: '首尾帧',
};
const normalizePrompt = (value) => (value || '').replace(/\s+/g, ' ').trim();
const uniqueList = (values = []) => [...new Set((values || []).filter(Boolean))];
const isSeedance2VideoModel = (model = '') => {
  const normalized = String(model || '').toLowerCase().replace(/[\s_.-]+/g, '');
  return normalized.includes('seedance20') || normalized.includes('seedance25');
};
const VIDEO_FORM_DATA_KEYS = {
  prompt: 'video_prompt',
  model: 'video_model',
  aspect_ratio: 'video_aspect_ratio',
  duration: 'video_duration',
  resolution: 'video_resolution',
  generation_mode: 'video_generation_mode',
  first_frame_url: 'video_first_frame_url',
  last_frame_url: 'video_last_frame_url',
  generate_audio: 'video_generate_audio',
};

const getAvatarPackageKey = (asset = {}) => (
  asset.packageKey || asset.talentPackageKey || asset.groupId || asset.assetUrl || asset.assetId || ''
);

const getAvatarAssetPreviewUrl = (asset = {}) => {
  const packageAssets = Array.isArray(asset.talentPackage?.assets) ? asset.talentPackage.assets : [];
  const mainVisualAsset = packageAssets.find(item => (
    ['main_visual', 'mainVisual'].includes(item?.role || item?.assetRole || item?.asset_role)
  ));
  const candidates = [
    asset.imageUrl,
    asset.image_url,
    asset.previewUrl,
    asset.preview_url,
    asset.thumbnailUrl,
    asset.thumbnail_url,
    mainVisualAsset?.sourceUrl,
    mainVisualAsset?.publicUrl,
    mainVisualAsset?.localUrl,
    mainVisualAsset?.imageUrl,
    ...packageAssets.flatMap(item => [item?.sourceUrl, item?.publicUrl, item?.localUrl, item?.imageUrl]),
  ];
  return String(candidates.find(url => url && !String(url).startsWith('asset://')) || '').trim();
};

const formatAvatarAssetLabel = (asset = {}, index = 0) => {
  const name = asset.name || asset.characterName || asset.groupName || `角色 ${index + 1}`;
  const imageCount = Number(asset.imageAssetCount || asset.certifiedAssetCount || 0);
  const videoCount = Number(asset.videoAssetCount || 0);
  const audioCount = Number(asset.audioReferenceCount || 0);
  const parts = [];
  if (imageCount > 0) parts.push(`${imageCount}图`);
  if (videoCount > 0) parts.push(`${videoCount}视频`);
  if (audioCount > 0) parts.push(`${audioCount}音频`);
  return [name, ...parts].filter(Boolean).join(' · ');
};

const avatarPackageMatchesSelection = (asset = {}, selection = '') => {
  const value = String(selection || '').trim();
  if (!value) return false;
  if (getAvatarPackageKey(asset) === value || asset.assetUrl === value || asset.assetId === value) return true;
  return getVideoRoleAssetsFromAvatarAsset(asset).some(roleAsset => (
    roleAsset.url === value || roleAsset.assetId === value
  ));
};

function buildSeedanceMediaPrompt(prompt, { imageUrls = [], imageWithRoles = [], videoUrls = [], audioUrls = [] } = {}) {
  const orderedImages = uniqueList([
    ...imageUrls,
    ...imageWithRoles.map(item => item?.url).filter(Boolean),
  ]);
  const orderedVideos = uniqueList(videoUrls);
  const orderedAudios = uniqueList(audioUrls);
  if (orderedImages.length === 0 && orderedVideos.length === 0 && orderedAudios.length === 0) {
    return prompt;
  }
  const lines = [
    ...orderedImages.map((_, index) => `- 图片${index + 1}：第${index + 1}张参考图片`),
    ...orderedVideos.map((_, index) => `- 视频${index + 1}：第${index + 1}段参考视频`),
    ...orderedAudios.map((_, index) => `- 音频${index + 1}：第${index + 1}段参考音频`),
  ];
  return [
    '参考素材编号（编号顺序与本次提交的媒体素材严格一致）：',
    ...lines,
    '请只使用“图片1”“视频1”“音频1”这类编号引用素材，不要在提示词中复述素材地址。',
    prompt ? `用户提示词：\n${prompt}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeMaxTextTokens(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TEXT_TOKENS;
  return Math.max(1024, Math.min(parsed, 32768));
}

/**
 * 把 data URL 转为 HTTP URL：调后端 /api/uploads/images 上传。
 * 跳过已经是 HTTP(S) URL 的项。
 * 转换失败的项会被忽略，不抛错（避免一个图就阻塞整个流程）。
 */
async function resolveImageUrlsForLLM(urls) {
  const valid = (urls || []).filter(Boolean);
  const result = [];
  for (const url of valid) {
    if (/^https?:\/\//i.test(url)) {
      result.push(url);
      continue;
    }
    if (!url.startsWith('data:')) continue;
    try {
      const blob = await (await fetch(url)).blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const filename = `ref_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const file = new File([blob], filename, { type: blob.type });
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch(`${API_BASE}/api/uploads/images`, {
        method: 'POST',
        body: formData,
      });
      const payload = await resp.json();
      if (resp.ok && payload?.success && payload?.asset?.url) {
        result.push(payload.asset.url);
      } else {
        console.warn('参考图 data URL 上传失败，已跳过:', payload?.detail || resp.status);
      }
    } catch (e) {
      console.warn('参考图 data URL 转换失败，已跳过:', e);
    }
  }
  return result;
}

function isLocalReferenceUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function buildFallbackStoryboardImagePrompts(card, aspectRatio, style) {
  const positive = [
    `分镜图片，镜号 ${card.shotNo || ''}`,
    card.visualDescription ? `画面内容：${card.visualDescription}` : '',
    card.cameraMovement ? `参考运镜形成静态构图：${card.cameraMovement}` : '',
    card.narration ? `口播氛围：${card.narration}` : '',
    `画幅：${aspectRatio}`,
    `风格：${style}`,
    '单帧静态画面，主体明确，构图清晰，光线和色彩贴合分镜内容，保留商品和场景关键细节',
  ].filter(Boolean).join('，');

  return {
    imagePositivePrompt: positive,
    imageNegativePrompt: '模糊，畸变，低清晰度，错误文字，多余肢体，主体缺失，构图混乱，低质纹理，画幅不匹配，无关物体',
  };
}

function buildFallbackSeedancePrompt(card, aspectRatio, style) {
  return [
    `Seedance 2.0 单镜头视频，镜号 ${card.shotNo || ''}`,
    card.visualDescription ? `画面：${card.visualDescription}` : '',
    card.cameraMovement ? `运镜：${card.cameraMovement}` : '',
    card.narration ? `口播情绪：${card.narration}` : '',
    `画幅：${aspectRatio}`,
    `风格：${style}`,
    '商品主体清晰稳定，保持包装、颜色、材质、logo 和比例一致，镜头运动自然，画面真实，避免错误文字和主体变形',
  ].filter(Boolean).join('，');
}

/**
 * 识别"当前 provider/model 不支持 vision/多模态"类错误。
 * 用于在第一轮 LLM 失败时自动降级为纯文本模式重试。
 */
function isVisionUnsupportedError(error) {
  if (!error) return false;
  const msg = String(error).toLowerCase();
  return (
    msg.includes('image input') ||
    msg.includes('no endpoints found') ||
    msg.includes('vision') ||
    msg.includes('multimodal') ||
    msg.includes('does not support') ||
    msg.includes('unsupported image') ||
    msg.includes('image_url') ||
    msg.includes('image url') ||
    msg.includes('getting file base64') ||
    msg.includes('count_token_failed') ||
    msg.includes('port 8000 is not allowed') ||
    msg.includes('localhost') ||
    msg.includes('127.0.0.1')
  );
}

const useFixedScaleStyle = () => {
  const zoom = useStore((state) => state.transform[2]);
  return useMemo(() => ({
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  }), [zoom]);
};

// 比例图标卡片
const RatioCard = ({ label, channel, value, shape, active, onClick }) => (
  <div className={`ratio-card ${active ? 'active' : ''}`} onClick={onClick}>
    <div className={`ratio-card-icon ${shape}`} />
    {channel ? (
      <span className="ratio-card-text">
        <span className="ratio-card-channel">{channel}</span>
        {value !== 'auto' && <span className="ratio-card-value">{value}</span>}
      </span>
    ) : (
      <span>{label}</span>
    )}
  </div>
);

// 横排选项按钮
const OptionRow = ({ options, value, onChange }) => (
  <div className="option-row">
    {options.map(opt => (
      <div
        key={opt.value}
        className={`option-btn ${value === opt.value ? 'active' : ''}`}
        onClick={() => onChange(opt.value)}
      >
        {opt.label}
      </div>
    ))}
  </div>
);

const DurationSlider = ({
  value,
  min,
  max,
  supportsAuto = false,
  onChange,
}) => {
  const numericValue = Number(value);
  const sliderValue = Number.isFinite(numericValue) && numericValue >= min && numericValue <= max
    ? numericValue
    : Math.min(Math.max(8, min), max);
  const isAuto = value === -1;

  return (
    <div className="duration-slider-control">
      <div className="duration-slider-head">
        {supportsAuto && (
          <button
            type="button"
            className={`duration-auto-toggle ${isAuto ? 'active' : ''}`}
            onClick={() => onChange(isAuto ? sliderValue : -1)}
          >
            自动
          </button>
        )}
        <strong>{isAuto ? '自动' : `${sliderValue}s`}</strong>
      </div>
      <div className="duration-slider-row">
        <span>{min}s</span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={sliderValue}
          onChange={event => onChange(Number(event.target.value))}
        />
        <span>{max}s</span>
      </div>
    </div>
  );
};

const ProcessorModelDropdown = ({
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder = '未配置',
  menuPortal = false,
  menuClassName = '',
  menuMinWidth = 220,
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const normalizedOptions = useMemo(() => (
    options
      .map(option => (typeof option === 'string' ? { value: option, label: option } : option))
      .filter(option => option && option.value !== undefined)
  ), [options]);
  const selectedOption = normalizedOptions.find(option => option.value === value);
  const displayLabel = selectedOption?.label || value || placeholder;
  const hasEnabledOptions = normalizedOptions.some(option => !option.disabled);
  const isDisabled = disabled || !hasEnabledOptions;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    if (!menuPortal) return;
    const trigger = wrapRef.current?.querySelector('.processor-model-trigger');
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 400;
    const width = Math.min(
      Math.max(rect.width, Number(menuMinWidth) || 220),
      Math.max(160, viewportWidth - 16),
    );
    const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
    const below = viewportHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const openUp = below < 220 && above > below;
    setMenuStyle({
      position: 'fixed',
      left,
      top: openUp ? 'auto' : rect.bottom + 6,
      bottom: openUp ? viewportHeight - rect.top + 6 : 'auto',
      width,
      maxHeight: Math.max(120, Math.min(320, openUp ? above : below)),
      zIndex: 20080,
    });
  }, [menuMinWidth, menuPortal]);

  useLayoutEffect(() => {
    if (!open || !menuPortal) return undefined;
    updateMenuPosition();
    const handlePositionChange = () => updateMenuPosition();
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    return () => {
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
    };
  }, [menuPortal, open, updateMenuPosition]);

  const handleToggle = useCallback((event) => {
    event.stopPropagation();
    if (isDisabled) return;
    setOpen(prev => !prev);
  }, [isDisabled]);

  const handleSelect = useCallback((option) => {
    if (option.disabled || option.value === value) {
      setOpen(false);
      return;
    }
    onChange?.(option.value);
    setOpen(false);
  }, [onChange, value]);

  const menu = open ? (
    <div
      ref={menuRef}
      className={`processor-model-menu ${menuClassName}`.trim()}
      style={menuPortal ? menuStyle || undefined : undefined}
      role="listbox"
    >
      {normalizedOptions.map(option => {
        const active = option.value === value;
        return (
          <button
            key={`${option.value}-${option.label}`}
            type="button"
            className={`processor-model-option ${active ? 'active' : ''}`}
            onClick={() => handleSelect(option)}
            disabled={option.disabled}
            role="option"
            aria-selected={active}
            title={option.label || option.value}
          >
            {option.imageUrl ? (
              <span className="processor-model-option-content">
                <img src={option.imageUrl} alt="" />
                <span>{option.label || option.value}</span>
              </span>
            ) : (
              <span>{option.label || option.value}</span>
            )}
            {active && <Icon name="check" size={14} />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      className={`processor-model-dropdown nodrag ${open ? 'open' : ''}`}
      ref={wrapRef}
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="processor-model-trigger"
        onClick={handleToggle}
        disabled={isDisabled}
        title={displayLabel}
      >
        <span>{displayLabel}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {menuPortal && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu}
    </div>
  );
};

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
  const defaultModel = type === 'text'
    ? api?.defaultTextModel
    : type === 'image'
      ? api?.defaultImageModel
      : api?.defaultVideoModel;
  return models.includes(defaultModel) ? defaultModel : models[0];
};

const filterModelsByAllowed = (models, allowed) => {
  if (!Array.isArray(allowed) || allowed.length === 0) return models;
  const allowedSet = new Set(allowed);
  const filtered = models.filter(m => allowedSet.has(m));
  return filtered.length > 0 ? filtered : models;
};

const buildModelProviders = (apiProviders, flattenedApis, type, allowedModels) => {
  const allowed = allowedModels?.[type] || [];
  const providerList = Array.isArray(apiProviders) ? apiProviders : [];

  // 从 provider 自身的模型字段构建列表
  const providers = providerList
    .filter(api => api?.enabled !== false && getProviderModels(api, type).length > 0)
    .map(api => {
      const rawModels = getProviderModels(api, type);
      const models = filterModelsByAllowed(rawModels, allowed);
      return {
        id: api.id,
        name: api.name || api.id,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        protocol: api.protocol || 'openai',
        textApiMode: api.textApiMode || 'auto',
        modelCapabilities: type === 'image'
          ? normalizeImageModelCapabilities(api.imageModelCapabilities)
          : type === 'video'
            ? normalizeImageModelCapabilities(api.videoModelCapabilities)
            : {},
        models,
        defaultModel: getProviderDefaultModel(api, type, models),
      };
    })
    .filter(p => p.models.length > 0);

  if (providers.length > 0) return providers;

  // 兜底：全局 allowedModels（运行设置未配置 per-provider 模型时）
  if (allowed.length > 0) {
    return providerList
      .filter(api => api?.baseUrl)
      .map(api => ({
        id: api.id,
        name: api.name || api.id,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        protocol: api.protocol || 'openai',
        textApiMode: api.textApiMode || 'auto',
        modelCapabilities: type === 'image'
          ? normalizeImageModelCapabilities(api.imageModelCapabilities)
          : type === 'video'
            ? normalizeImageModelCapabilities(api.videoModelCapabilities)
            : {},
        models: allowed,
        defaultModel: allowed[0] || '',
      }))
      .filter(p => p.models.length > 0);
  }

  // 最终兜底：扁平化的旧格式 apiConfigs
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
        protocol: api.protocol || 'openai',
        textApiMode: api.textApiMode || 'auto',
        modelCapabilities: type === 'image'
          ? normalizeImageModelCapabilities(api.imageModelCapabilities)
          : type === 'video'
            ? normalizeImageModelCapabilities(api.videoModelCapabilities)
            : {},
        models: [...new Set(nextModels)],
        defaultModel: existing?.defaultModel || api.model || '',
      });
    });

  return [...groups.values()];
};

function GeneratorNode({ id, data }) {
  const { prompts: quickPrompts } = useQuickPrompts();
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCopied, setErrorCopied] = useState(false);
  const [models, setModels] = useState([]);
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState(uniqueList(data?.uploadedReferenceImages || []));
  const [referenceUploads, setReferenceUploads] = useState([]);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);
  const [selectedTextApiId, setSelectedTextApiId] = useState(data?.text_api_id || data?.activeProviderId || '');
  const [selectedImageApiId, setSelectedImageApiId] = useState(data?.image_api_id || data?.activeProviderId || '');
  const [selectedVideoApiId, setSelectedVideoApiId] = useState(data?.video_api_id || data?.activeProviderId || '');
  const referenceInputRef = useRef(null);
  const settingsWrapRef = useRef(null);
  const textReferenceCardRef = useRef(null);
  const textReferencePopoverRef = useRef(null);
  const previousConnectedImageCountRef = useRef(Array.isArray(data?.connectedImages) ? data.connectedImages.length : 0);
  const generatorType = data?.generatorType || 'generateText';
  const fallbackMaxTextTokens = normalizeMaxTextTokens(data?.maxTextTokens);
  const fixedScaleStyle = useFixedScaleStyle();
  const processorStyle = data?.overlayMode ? undefined : fixedScaleStyle;
  const [showSettings, setShowSettings] = useState(false);
  const [showTextReferencePopover, setShowTextReferencePopover] = useState(false);
  const [textReferencePopoverPosition, setTextReferencePopoverPosition] = useState(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState(null);
  const [quickPromptOpenRequest, setQuickPromptOpenRequest] = useState(0);
  const hasConnectedTextReference = Boolean(
    data?.connectedPrompt || (Array.isArray(data?.connectedTextReferences) && data.connectedTextReferences.length > 0)
  );

  const [form, setForm] = useState({
    api_base_url: '',
    api_key: '',
    model_name: data?.model_name || '',
    system_prompt: data?.system_prompt || '你是一个专业的文本生成助手。',
    user_prompt: data?.user_prompt || data?.promptDraft || '',
    temperature: data?.temperature ?? 0.7,
    image_prompt: data?.image_prompt || (hasConnectedTextReference ? '' : data?.promptDraft || ''),
    image_negative_prompt: resolveImageNegativePrompt(data?.image_negative_prompt),
    image_model: data?.image_model || '',
    image_size: data?.image_size || '3:4',
    image_size_preset: data?.image_size_preset || getDefaultImageRatioPresetId(data?.image_size || '3:4'),
    image_resolution: data?.image_resolution || '1k',
    image_quality: data?.image_quality || 'auto',
    image_background: data?.image_background || 'auto',
    image_output_format: data?.image_output_format || 'png',
    image_count: data?.image_count || data?.image_n || 1,
    image_quick_prompt_id: data?.image_quick_prompt_id || '',
    image_quick_prompt_title: data?.image_quick_prompt_title || '',
    image_quick_prompt_snapshot: data?.image_quick_prompt_snapshot || '',
    storyboard_script_prompt: data?.storyboard_script_prompt || data?.storyboard_prompt || data?.script_prompt || '',
    storyboard_script_card_count: data?.storyboard_script_card_count || data?.storyboard_card_count || 6,
    storyboard_aspect_ratio: data?.storyboard_aspect_ratio || '16:9',
    storyboard_style: data?.storyboard_style || '种草',
    storyboard_total_duration: data?.storyboard_total_duration || 30,
    storyboard_temperature: data?.storyboard_temperature ?? 0.7,
    audio_text: data?.audio_text || data?.promptDraft || '',
    audio_voice: data?.audio_voice || '冰糖',
    audio_style: data?.audio_style || '',
  });

  const apiConfigs = useMemo(() => data?.apiConfigs || [], [data?.apiConfigs]);
  const textApiConfigs = useMemo(
    () => buildModelProviders(data?.apiProviders, apiConfigs, 'text', data?.allowedModels),
    [data?.apiProviders, apiConfigs]
  );
  const imageApiConfigs = useMemo(
    () => buildModelProviders(data?.apiProviders, apiConfigs, 'image', data?.allowedModels),
    [data?.apiProviders, apiConfigs]
  );
  const videoApiConfigs = useMemo(
    () => buildModelProviders(data?.apiProviders, apiConfigs, 'video', data?.allowedModels),
    [data?.apiProviders, apiConfigs]
  );
  const selectedTextApi = textApiConfigs.find(api => api.id === selectedTextApiId) || textApiConfigs[0];
  const maxTextTokens = normalizeMaxTextTokens(selectedTextApi?.maxTextTokens ?? fallbackMaxTextTokens);
  const textModelOptions = selectedTextApi?.models || [];
  const hasTextModelOptions = textModelOptions.length > 0;
  const selectedTextModel = textModelOptions.includes(form.model_name)
    ? form.model_name
    : selectedTextApi?.defaultModel || textModelOptions[0] || form.model_name || '';
  const selectedImageApi = imageApiConfigs.find(api => api.id === selectedImageApiId) || imageApiConfigs[0];
  const imageModelOptions = selectedImageApi?.models || [];
  const hasImageModelOptions = imageModelOptions.length > 0;
  const selectedImageModel = imageModelOptions.includes(form.image_model)
    ? form.image_model
    : selectedImageApi?.defaultModel || imageModelOptions[0] || form.image_model || 'gpt-image-2';
  const selectedImageModelSupport = selectedImageApi?.modelCapabilities?.[selectedImageModel] || null;
  const selectedImageCapabilities = selectedImageModelSupport?.adapted === true
    ? selectedImageModelSupport.capabilities || {}
    : null;
  const imageRatioOptions = useMemo(
    () => buildImageRatioOptions(selectedImageCapabilities, IMAGE_GENERATION_RATIO_PRESETS),
    [selectedImageCapabilities],
  );
  const imageResolutionOptions = useMemo(
    () => buildCapabilityOptions(
      selectedImageCapabilities?.resolutions,
      [{ value: '1k', label: '1K' }, { value: '2k', label: '2K' }, { value: '4k', label: '4K' }],
    ),
    [selectedImageCapabilities],
  );
  const imageQualityOptions = useMemo(() => {
    const values = selectedImageCapabilities?.qualityOptions;
    if (!Array.isArray(values)) {
      return [
        { value: 'auto', label: '自动' },
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' },
      ];
    }
    const labels = { auto: '自动', low: '低', medium: '中', high: '高' };
    return values.map(value => ({ value, label: labels[value] || String(value).toUpperCase() }));
  }, [selectedImageCapabilities]);
  const imageBackgroundOptions = useMemo(() => {
    const values = selectedImageCapabilities?.backgroundOptions;
    if (!Array.isArray(values)) return [];
    const labels = { auto: '自动', opaque: '不透明', transparent: '透明' };
    return values.map(value => ({ value, label: labels[value] || String(value) }));
  }, [selectedImageCapabilities]);
  const imageOutputFormatOptions = useMemo(() => {
    const values = selectedImageCapabilities?.outputFormats;
    if (!Array.isArray(values)) return [];
    return values.map(value => ({ value, label: String(value).toUpperCase() }));
  }, [selectedImageCapabilities]);
  const resolvedImageSize = resolveCapabilityValue(
    form.image_size,
    imageRatioOptions,
    selectedImageCapabilities?.defaultRatio,
  ) || form.image_size;
  const resolvedImageRatioOption = imageRatioOptions.find(option => option.value === resolvedImageSize);
  const resolvedImageResolution = resolveCapabilityValue(
    form.image_resolution,
    imageResolutionOptions,
    selectedImageCapabilities?.defaultResolution,
  );
  const resolvedImageQuality = resolveCapabilityValue(
    form.image_quality,
    imageQualityOptions,
    imageQualityOptions[0]?.value,
  );
  const resolvedImageBackground = resolveCapabilityValue(
    form.image_background,
    imageBackgroundOptions,
    imageBackgroundOptions[0]?.value,
  );
  const resolvedImageOutputFormat = resolveCapabilityValue(
    form.image_output_format,
    imageOutputFormatOptions,
    imageOutputFormatOptions[0]?.value || 'png',
  ) || 'png';
  const imageSettingsSummary = [
    getImageRatioSummary(resolvedImageSize, resolvedImageRatioOption?.id || form.image_size_preset),
    imageResolutionOptions.length > 0 ? String(resolvedImageResolution || '').toUpperCase() : '',
    imageQualityOptions.find(option => option.value === resolvedImageQuality)?.label || '',
    imageBackgroundOptions.find(option => option.value === resolvedImageBackground)?.label || '',
    imageOutputFormatOptions.length > 1 ? String(resolvedImageOutputFormat).toUpperCase() : '',
    `${form.image_count}张`,
  ].filter(Boolean).join(' · ');
  const [videoForm, setVideoForm] = useState({
    prompt: data?.video_prompt || '',
    model: data?.video_model || data?.model || '',
    aspect_ratio: data?.video_aspect_ratio || data?.aspect_ratio || '16:9',
    duration: data?.video_duration || data?.duration || 8,
    resolution: data?.video_resolution || data?.resolution || '720p',
    generation_mode: data?.video_generation_mode || VIDEO_GENERATION_MODE_OMNI,
    first_frame_url: data?.video_first_frame_url || '',
    last_frame_url: data?.video_last_frame_url || '',
    generate_audio: data?.video_generate_audio ?? true,
  });
  const selectedVideoApi = videoApiConfigs.find(api => api.id === selectedVideoApiId) || videoApiConfigs[0];
  const videoModelOptions = selectedVideoApi?.models || [];
  const hasVideoModelOptions = videoModelOptions.length > 0;
  const selectedVideoModel = videoModelOptions.includes(videoForm.model)
    ? videoForm.model
    : selectedVideoApi?.defaultModel || videoModelOptions[0] || videoForm.model || 'sora-2';
  const textApiOptions = textApiConfigs.length > 0
    ? textApiConfigs.map(api => ({ value: api.id, label: api.name || 'API' }))
    : [{ value: '', label: '未配置 API', disabled: true }];
  const imageApiOptions = imageApiConfigs.length > 0
    ? imageApiConfigs.map(api => ({ value: api.id, label: api.name || 'API' }))
    : [{ value: '', label: '未配置 API', disabled: true }];
  const videoApiOptions = videoApiConfigs.length > 0
    ? videoApiConfigs.map(api => ({ value: api.id, label: api.name || 'API' }))
    : [{ value: '', label: '未配置 API', disabled: true }];
  const textModelSelectOptions = hasTextModelOptions
    ? textModelOptions
    : models.length > 0
      ? models
      : [{ value: '', label: '未配置文本模型', disabled: true }];
  const imageModelSelectOptions = hasImageModelOptions
    ? imageModelOptions
    : ['gpt-image-2'];
  const videoModelSelectOptions = hasVideoModelOptions
    ? videoModelOptions
    : [{ value: '', label: '未配置视频模型', disabled: true }];
  const selectedVideoModelSupport = selectedVideoApi?.modelCapabilities?.[selectedVideoModel] || null;
  const selectedVideoCapabilities = selectedVideoModelSupport?.adapted === true
    ? selectedVideoModelSupport.capabilities || {}
    : null;
  const selectedVideoUsesSeedance2 = isSeedance2VideoModel(selectedVideoModel);
  const selectedVideoSupportsReferenceModes = Boolean(
    selectedVideoCapabilities?.supportsOmniReference || selectedVideoCapabilities?.supportsFirstLastFrame
  );
  const videoGenerationModeOptions = useMemo(() => {
    const modes = Array.isArray(selectedVideoCapabilities?.generationModes)
      ? selectedVideoCapabilities.generationModes
      : [];
    const normalizedModes = modes.filter(mode => VIDEO_GENERATION_MODE_LABELS[mode]);
    return (normalizedModes.length > 0 ? normalizedModes : [VIDEO_GENERATION_MODE_OMNI])
      .map(mode => ({ value: mode, label: VIDEO_GENERATION_MODE_LABELS[mode] || mode }));
  }, [selectedVideoCapabilities]);
  const videoRatioOptions = useMemo(
    () => buildImageRatioOptions(
      selectedVideoCapabilities,
      [
        { id: 'adaptive', value: 'adaptive', label: '自适应', shape: 'square' },
        { id: '21:9', value: '21:9', label: '21:9', shape: 'wide' },
        { id: '1:1', value: '1:1', label: '1:1', shape: 'square' },
        { id: '3:4', value: '3:4', label: '3:4', shape: 'portrait' },
        { id: '4:3', value: '4:3', label: '4:3', shape: '' },
        { id: '9:16', value: '9:16', label: '9:16', shape: 'portrait' },
        { id: '16:9', value: '16:9', label: '16:9', shape: 'wide' },
      ],
    ),
    [selectedVideoCapabilities],
  );
  const videoDurationOptions = useMemo(() => {
    const minDuration = Number(selectedVideoCapabilities?.minDuration);
    const maxDuration = Number(selectedVideoCapabilities?.maxDuration);
    const defaults = [{ value: 4, label: '4s' }, { value: 8, label: '8s' }, { value: 12, label: '12s' }, { value: 16, label: '16s' }, { value: 20, label: '20s' }];
    if (!Number.isFinite(minDuration) || !Number.isFinite(maxDuration) || maxDuration < minDuration) return defaults;
    const options = Array.from({ length: maxDuration - minDuration + 1 }, (_, index) => {
      const value = minDuration + index;
      return { value, label: `${value}s` };
    });
    return selectedVideoCapabilities?.defaultDuration === -1
      ? [{ value: -1, label: '自动' }, ...options]
      : options;
  }, [selectedVideoCapabilities]);
  const videoDurationRange = useMemo(() => {
    const minDuration = Number(selectedVideoCapabilities?.minDuration);
    const maxDuration = Number(selectedVideoCapabilities?.maxDuration);
    if (!Number.isFinite(minDuration) || !Number.isFinite(maxDuration) || maxDuration < minDuration) {
      return { min: 4, max: 20 };
    }
    return { min: minDuration, max: maxDuration };
  }, [selectedVideoCapabilities]);
  const supportsVideoAutoDuration = selectedVideoCapabilities?.defaultDuration === -1;
  const videoResolutionOptions = useMemo(
    () => buildCapabilityOptions(
      selectedVideoCapabilities?.resolutions,
      [{ value: '720p', label: '720P' }, { value: '1080p', label: '1080P' }],
    ),
    [selectedVideoCapabilities],
  );
  const resolvedVideoAspectRatio = resolveCapabilityValue(
    videoForm.aspect_ratio,
    videoRatioOptions,
    selectedVideoCapabilities?.defaultRatio,
  ) || videoForm.aspect_ratio;
  const resolvedVideoDuration = resolveCapabilityValue(
    videoForm.duration,
    videoDurationOptions,
    selectedVideoCapabilities?.defaultDuration,
  ) || videoForm.duration;
  const resolvedVideoResolution = resolveCapabilityValue(
    videoForm.resolution,
    videoResolutionOptions,
    selectedVideoCapabilities?.defaultResolution,
  ) || videoForm.resolution;
  const avatarAssets = useMemo(() => {
    const source = Array.isArray(data?.avatarPackages) && data.avatarPackages.length > 0
      ? data.avatarPackages
      : (Array.isArray(data?.avatarAssets) ? data.avatarAssets : []);
    return source
      .filter(asset => getAvatarPackageKey(asset))
      .map(asset => ({
        ...asset,
        packageKey: getAvatarPackageKey(asset),
        assetUrl: String(asset.assetUrl || '').trim(),
      }));
  }, [data]);
  const [selectedAvatarSelection, setSelectedAvatarSelection] = useState(
    data?.video_avatar_package_key
    || data?.video_avatar_asset_url
    || ''
  );
  const selectedAvatarAsset = useMemo(
    () => avatarAssets.find(asset => avatarPackageMatchesSelection(asset, selectedAvatarSelection)) || null,
    [avatarAssets, selectedAvatarSelection]
  );
  const selectedAvatarPackageKey = selectedAvatarAsset ? getAvatarPackageKey(selectedAvatarAsset) : selectedAvatarSelection;
  const selectedAvatarAssetUrl = selectedAvatarAsset?.assetUrl || '';
  const selectedAvatarVideoRoleAssets = useMemo(
    () => selectedAvatarAsset ? getVideoRoleAssetsFromAvatarAsset(selectedAvatarAsset) : [],
    [selectedAvatarAsset]
  );
  const selectedAvatarAudioAssetUrls = useMemo(
    () => selectedAvatarAsset
      ? uniqueList([
        ...getTalentPackageCertifiedAssetUrlsByType(selectedAvatarAsset.talentPackage, 'audio'),
        ...getTalentPackageReferenceAudioUrls(selectedAvatarAsset.talentPackage),
      ])
      : [],
    [selectedAvatarAsset]
  );
  const selectedAvatarVideoAssetUrls = useMemo(
    () => selectedAvatarAsset
      ? getTalentPackageCertifiedAssetUrlsByType(selectedAvatarAsset.talentPackage, 'video')
      : [],
    [selectedAvatarAsset]
  );
  const connectedImages = useMemo(() => uniqueList(data?.connectedImages || []), [data?.connectedImages]);
  const connectedReferences = useMemo(
    () => Array.isArray(data?.connectedReferences) ? data.connectedReferences : [],
    [data?.connectedReferences]
  );
  const connectedVideos = useMemo(() => data?.connectedVideos || [], [data?.connectedVideos]);
  const visibleUploadedReferenceImages = useMemo(
    () => uploadedReferenceImages.filter(src => src && !connectedImages.includes(src)),
    [connectedImages, uploadedReferenceImages]
  );
  const referenceImages = useMemo(
    () => uniqueList([...connectedImages, ...visibleUploadedReferenceImages]).slice(0, MAX_REFERENCE_IMAGES),
    [connectedImages, visibleUploadedReferenceImages]
  );
  const resolvedVideoGenerationMode = videoGenerationModeOptions.some(option => option.value === videoForm.generation_mode)
    ? videoForm.generation_mode
    : videoGenerationModeOptions[0]?.value || VIDEO_GENERATION_MODE_OMNI;
  const isVideoFirstLastFrameMode = resolvedVideoGenerationMode === VIDEO_GENERATION_MODE_FIRST_LAST;
  const resolvedVideoFirstFrameUrl = referenceImages.includes(videoForm.first_frame_url)
    ? videoForm.first_frame_url
    : referenceImages[0] || '';
  const resolvedVideoLastFrameUrl = referenceImages.includes(videoForm.last_frame_url)
    ? videoForm.last_frame_url
    : referenceImages.find(src => src !== resolvedVideoFirstFrameUrl) || '';
  const remainingReferenceSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);
  const connectedTextReferences = Array.isArray(data?.connectedTextReferences)
    ? data.connectedTextReferences.filter(Boolean)
    : data?.connectedPrompt ? [data.connectedPrompt] : [];
  const connectedPrompt = connectedTextReferences
    .map(prompt => prompt.trim())
    .filter(Boolean)
    .join('\n\n');
  const connectedTextReferenceKey = connectedTextReferences.join('\n\n');
  const selectedQuickPrompt = findQuickPrompt(quickPrompts, form.image_quick_prompt_id);
  const selectedQuickPromptTitle = selectedQuickPrompt?.title || form.image_quick_prompt_title;
  const selectedQuickPromptContent = selectedQuickPrompt?.content || form.image_quick_prompt_snapshot;
  const selectedQuickPromptToken = form.image_quick_prompt_id && selectedQuickPromptTitle
    ? { id: form.image_quick_prompt_id, title: selectedQuickPromptTitle }
    : null;
  const combinedTextPrompt = [connectedPrompt, form.user_prompt]
    .map(prompt => prompt.trim())
    .filter(Boolean)
    .join('\n\n');
  const combinedImagePrompt = composeQuickPromptText(
    connectedPrompt,
    selectedQuickPromptContent,
    form.image_prompt,
  );
  const combinedVideoPrompt = [connectedPrompt, videoForm.prompt]
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n\n');
  const combinedAudioText = [connectedPrompt, form.audio_text]
    .map(prompt => prompt.trim())
    .filter(Boolean)
    .join('\n\n');
  const combinedStoryboardScriptPrompt = [connectedPrompt, form.storyboard_script_prompt]
    .map(prompt => prompt.trim())
    .filter(Boolean)
    .join('\n\n');
  const generationTask = data?.generationTask;
  const supportsCancelableGeneration = ['generateText', 'generateImage', 'generateVideo', 'generateAudio'].includes(generatorType);
  const isCurrentGenerationRunning = supportsCancelableGeneration
    && ['running', 'saving'].includes(generationTask?.status);
  const isImageGenerationRunning = generatorType === 'generateImage' && isCurrentGenerationRunning;
  const isTextGenerationRunning = generatorType === 'generateText' && isCurrentGenerationRunning;
  const isVideoGenerationRunning = generatorType === 'generateVideo' && isCurrentGenerationRunning;
  const isAudioGenerationRunning = generatorType === 'generateAudio' && isCurrentGenerationRunning;
  const isGenerationLocked = isCurrentGenerationRunning;
  useEffect(() => {
    if (generatorType !== 'generateImage') return;
    const currentPrompt = normalizePrompt(form.image_prompt);
    if (!currentPrompt || connectedTextReferences.length === 0) return;
    const referencePrompts = [connectedPrompt, ...connectedTextReferences]
      .map(normalizePrompt)
      .filter(Boolean);
    if (!referencePrompts.includes(currentPrompt)) return;
    setForm(prev => ({ ...prev, image_prompt: '' }));
  }, [connectedPrompt, connectedTextReferenceKey, connectedTextReferences, form.image_prompt, generatorType]);

  useEffect(() => {
    fetch(`${API_BASE}/api/models`)
      .then(r => r.json())
      .then(d => {
        const llm = d.nodes.find(n => n.type === 'LLM');
        if (llm) setModels(llm.inputs.model_name?.options || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTextApi?.id && selectedTextApi.id !== selectedTextApiId) {
      setSelectedTextApiId(selectedTextApi.id);
    }
  }, [selectedTextApi?.id, selectedTextApiId]);

  useEffect(() => {
    if (selectedImageApi?.id && selectedImageApi.id !== selectedImageApiId) {
      setSelectedImageApiId(selectedImageApi.id);
    }
  }, [selectedImageApi?.id, selectedImageApiId]);

  useEffect(() => {
    if (selectedVideoApi?.id && selectedVideoApi.id !== selectedVideoApiId) {
      setSelectedVideoApiId(selectedVideoApi.id);
    }
  }, [selectedVideoApi?.id, selectedVideoApiId]);

  useEffect(() => {
    if (!selectedTextModel || form.model_name === selectedTextModel) return;
    setForm(prev => ({ ...prev, model_name: selectedTextModel }));
  }, [form.model_name, selectedTextModel]);

  useEffect(() => {
    if (!selectedImageModel || form.image_model === selectedImageModel) return;
    setForm(prev => ({ ...prev, image_model: selectedImageModel }));
  }, [form.image_model, selectedImageModel]);

  useEffect(() => {
    if (!selectedVideoModel || videoForm.model === selectedVideoModel) return;
    setVideoForm(prev => ({ ...prev, model: selectedVideoModel }));
  }, [videoForm.model, selectedVideoModel]);

  useEffect(() => {
    if (generatorType !== 'generateVideo' || selectedVideoUsesSeedance2 || !selectedAvatarAsset) return;
    setSelectedAvatarSelection('');
    data?.onGeneratorDataChange?.(id, {
      video_avatar_package_key: '',
      video_avatar_group_id: '',
      video_avatar_asset_url: '',
      video_avatar_asset_urls: [],
      video_avatar_assets: [],
      video_avatar_audio_asset_urls: [],
      video_avatar_video_asset_urls: [],
    });
  }, [data, generatorType, id, selectedAvatarAsset, selectedVideoUsesSeedance2]);

  useEffect(() => {
    if (generatorType !== 'generateVideo') return;
    const previousCount = previousConnectedImageCountRef.current;
    previousConnectedImageCountRef.current = connectedImages.length;
    if (
      connectedImages.length > 2
      && previousCount <= 2
      && resolvedVideoGenerationMode !== VIDEO_GENERATION_MODE_OMNI
      && videoGenerationModeOptions.some(option => option.value === VIDEO_GENERATION_MODE_OMNI)
    ) {
      setVideoForm(prev => ({ ...prev, generation_mode: VIDEO_GENERATION_MODE_OMNI }));
      data?.onGeneratorDataChange?.(id, { video_generation_mode: VIDEO_GENERATION_MODE_OMNI });
    }
  }, [connectedImages.length, data, generatorType, id, resolvedVideoGenerationMode, videoGenerationModeOptions]);

  useEffect(() => {
    if (videoGenerationModeOptions.some(option => option.value === videoForm.generation_mode)) return;
    const nextMode = videoGenerationModeOptions[0]?.value || VIDEO_GENERATION_MODE_OMNI;
    setVideoForm(prev => ({ ...prev, generation_mode: nextMode }));
    data?.onGeneratorDataChange?.(id, { video_generation_mode: nextMode });
  }, [data, id, videoForm.generation_mode, videoGenerationModeOptions]);

  useEffect(() => {
    if (!showSettings) return;

    const handleOutsidePointerDown = (event) => {
      if (settingsWrapRef.current?.contains(event.target)) return;
      setShowSettings(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [showSettings]);

  useEffect(() => {
    if (!showTextReferencePopover) return;

    const handleOutsidePointerDown = (event) => {
      if (textReferenceCardRef.current?.contains(event.target)) return;
      if (textReferencePopoverRef.current?.contains(event.target)) return;
      setShowTextReferencePopover(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowTextReferencePopover(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showTextReferencePopover]);

  const updateTextReferencePopoverPosition = useCallback(() => {
    const card = textReferenceCardRef.current;
    if (!card || typeof window === 'undefined') return;

    const rect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const top = Math.max(
      TEXT_REFERENCE_POPOVER_MARGIN,
      rect.top - TEXT_REFERENCE_POPOVER_HEIGHT - TEXT_REFERENCE_POPOVER_GAP
    );
    const maxLeft = Math.max(
      TEXT_REFERENCE_POPOVER_MARGIN,
      viewportWidth - TEXT_REFERENCE_POPOVER_WIDTH - TEXT_REFERENCE_POPOVER_MARGIN
    );
    const left = Math.min(
      Math.max(TEXT_REFERENCE_POPOVER_MARGIN, rect.left),
      maxLeft
    );

    setTextReferencePopoverPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!showTextReferencePopover) {
      setTextReferencePopoverPosition(null);
      return;
    }

    updateTextReferencePopoverPosition();
    window.addEventListener('resize', updateTextReferencePopoverPosition);
    window.addEventListener('scroll', updateTextReferencePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateTextReferencePopoverPosition);
      window.removeEventListener('scroll', updateTextReferencePopoverPosition, true);
    };
  }, [showTextReferencePopover, updateTextReferencePopoverPosition]);

  useEffect(() => {
    if (!selectedVideoCapabilities) return;
    setVideoForm(prev => ({
      ...prev,
      aspect_ratio: resolvedVideoAspectRatio,
      duration: resolvedVideoDuration,
      resolution: resolvedVideoResolution,
    }));
  }, [resolvedVideoAspectRatio, resolvedVideoDuration, resolvedVideoResolution, selectedVideoCapabilities]);

  const handleChange = useCallback((key, value) => {
    if (isGenerationLocked) return;
    setForm(prev => ({ ...prev, [key]: value }));
    // 实时同步到节点数据，确保草稿不丢失
    data?.onGeneratorDataChange?.(id, { [key]: value });
    // 图片比例需单独同步到结果节点占位框
    if (key === 'image_size' && data?.onGeneratorDataChange) {
      data.onGeneratorDataChange(id, { image_size: value });
    }
  }, [id, isGenerationLocked, data?.onGeneratorDataChange]);

  const handleQuickPromptSelect = useCallback(prompt => {
    if (isGenerationLocked) return;
    const patch = prompt ? {
      image_quick_prompt_id: prompt.id,
      image_quick_prompt_title: prompt.title,
      image_quick_prompt_snapshot: prompt.content,
    } : {
      image_quick_prompt_id: '',
      image_quick_prompt_title: '',
      image_quick_prompt_snapshot: '',
    };
    setForm(current => ({ ...current, ...patch }));
    data?.onGeneratorDataChange?.(id, patch);
  }, [data, id, isGenerationLocked]);

  const handleTextApiChange = useCallback((value) => {
    if (isGenerationLocked) return;
    setSelectedTextApiId(value);
    data?.onGeneratorDataChange?.(id, { text_api_id: value });
  }, [id, isGenerationLocked, data?.onGeneratorDataChange]);

  const handleImageApiChange = useCallback((value) => {
    if (isGenerationLocked) return;
    setSelectedImageApiId(value);
    data?.onGeneratorDataChange?.(id, { image_api_id: value });
  }, [id, isGenerationLocked, data?.onGeneratorDataChange]);

  const handleVideoApiChange = useCallback((value) => {
    if (isGenerationLocked) return;
    setSelectedVideoApiId(value);
    data?.onGeneratorDataChange?.(id, { video_api_id: value });
  }, [id, isGenerationLocked, data?.onGeneratorDataChange]);

  const handleImageRatioChange = useCallback((preset) => {
    if (isGenerationLocked) return;
    setForm(prev => ({
      ...prev,
      image_size: preset.value,
      image_size_preset: preset.id,
    }));
    data?.onGeneratorDataChange?.(id, {
      image_size: preset.value,
      image_size_preset: preset.id,
    });
  }, [data, id, isGenerationLocked]);

  const resetError = useCallback(() => {
    setErrorMessage('');
    setErrorCopied(false);
  }, []);

  const showError = useCallback((message) => {
    setStatus('error');
    setErrorMessage(message);
    setErrorCopied(false);
  }, []);

  const buildCommonGenerationConfig = useCallback(() => ({
    connectedPrompt: data?.connectedPrompt || '',
    connectedTextReferences: [...connectedTextReferences],
    connectedImages: [...connectedImages],
    connectedVideos: [...connectedVideos],
    uploadedReferenceImages: [...visibleUploadedReferenceImages],
  }), [
    connectedImages,
    connectedTextReferences,
    connectedVideos,
    data?.connectedPrompt,
    visibleUploadedReferenceImages,
  ]);

  useEffect(() => {
    if (!supportsCancelableGeneration || !generationTask?.status) return;
    if (generationTask.status === 'running' || generationTask.status === 'saving') {
      setStatus('running');
      return;
    }
    if (['success', 'completed', 'save_failed', 'partial_error'].includes(generationTask.status)) {
      setStatus('success');
      return;
    }
    if (generationTask.status === 'canceled' || generationTask.status === 'cancelled') {
      setStatus('idle');
      return;
    }
    if (['error', 'failed', 'query_failed'].includes(generationTask.status)) {
      setStatus('idle');
      if (data?.lastGenerationError) {
        showError(data.lastGenerationError);
      }
    }
  }, [data?.lastGenerationError, generationTask?.status, showError, supportsCancelableGeneration]);

  const appendUploadedReference = useCallback((imageUrl) => {
    setUploadedReferenceImages(prev => uniqueList([...prev, imageUrl]).slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length)));
  }, [connectedImages.length]);

  const getConnectedReferenceEdgeId = useCallback((kind, value) => (
    connectedReferences.find(reference => (
      reference?.kind === kind && reference?.value === value
    ))?.edgeId || ''
  ), [connectedReferences]);

  const disconnectReference = useCallback((event, edgeId) => {
    event.stopPropagation();
    if (!edgeId || isGenerationLocked) return;
    data?.onDeleteEdge?.(edgeId);
  }, [data, isGenerationLocked]);

  const handleReferenceUpload = useCallback((e) => {
    const allFiles = Array.from(e.target.files || []);
    if (isGenerationLocked) {
      e.target.value = '';
      return;
    }
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
  }, [appendUploadedReference, isGenerationLocked, remainingReferenceSlots, showError]);

  const removeUploadedReference = useCallback((url) => {
    if (isGenerationLocked) return;
    setUploadedReferenceImages(prev => prev.filter(item => item !== url));
  }, [isGenerationLocked]);

  const handleCopyError = useCallback(async (event) => {
    event.stopPropagation();
    if (!errorMessage) return;

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = errorMessage;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    };

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(errorMessage);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = fallbackCopy();
    }

    setErrorCopied(copied ? 'success' : 'failed');
    window.setTimeout(() => setErrorCopied(false), 1400);
  }, [errorMessage]);

  // ===== 生成处理 =====
  const handleTextGenerate = useCallback(async () => {
    if (isTextGenerationRunning) {
      data?.onCancelGeneration?.(id);
      setStatus('idle');
      resetError();
      return;
    }
    setStatus('running');
    resetError();
    const userPrompt = buildPromptWithImageMentions(combinedTextPrompt, referenceImages);
    const generationConfig = {
      ...buildCommonGenerationConfig(),
      user_prompt: form.user_prompt,
      system_prompt: form.system_prompt,
      model_name: selectedTextModel,
      text_api_id: selectedTextApi?.id || '',
      temperature: form.temperature,
    };
    data?.onRunTextGeneration?.(id, {
      provider_id: selectedTextApi?.providerId || selectedTextApi?.id || '',
      api_base_url: selectedTextApi?.baseUrl || form.api_base_url,
      api_protocol: selectedTextApi?.protocol || 'openai',
      text_api_mode: selectedTextApi?.textApiMode || 'auto',
      api_key: selectedTextApi?.apiKey || form.api_key,
      model_name: selectedTextModel,
      system_prompt: form.system_prompt,
      user_prompt: userPrompt,
      temperature: form.temperature,
      max_tokens: maxTextTokens,
      image_urls: referenceImages,
      video_urls: connectedVideos,
    }, generationConfig);
  }, [buildCommonGenerationConfig, combinedTextPrompt, connectedVideos, data, form.api_base_url, form.api_key, form.system_prompt, form.temperature, form.user_prompt, id, isTextGenerationRunning, maxTextTokens, referenceImages, resetError, selectedTextApi, selectedTextModel]);

  const handleImageGenerate = useCallback(async () => {
    if (isImageGenerationRunning) {
      data?.onCancelGeneration?.(id);
      setStatus('idle');
      resetError();
      return;
    }

    if (selectedImageCapabilities && referenceImages.length > 0 && !selectedImageCapabilities.imageToImage) {
      showError('当前图片模型仅支持文生图，请移除参考图或切换模型');
      return;
    }
    const maxReferenceImages = Number(selectedImageCapabilities?.maxReferenceImages) || 0;
    if (maxReferenceImages > 0 && referenceImages.length > maxReferenceImages) {
      showError(`当前图片模型最多支持 ${maxReferenceImages} 张参考图，请减少后再运行`);
      return;
    }

    const imagePrompt = composeImageGenerationPrompt(
      buildPromptWithImageMentions(combinedImagePrompt, referenceImages),
      form.image_negative_prompt,
    );
    const generationConfig = {
      ...buildCommonGenerationConfig(),
      image_prompt: form.image_prompt,
      image_negative_prompt: form.image_negative_prompt,
      image_model: selectedImageModel,
      image_api_id: selectedImageApi?.id || '',
      image_size: resolvedImageSize,
      image_resolution: resolvedImageResolution,
      image_quality: resolvedImageQuality,
      image_background: resolvedImageBackground,
      image_output_format: resolvedImageOutputFormat,
      image_count: form.image_count,
      image_quick_prompt_id: form.image_quick_prompt_id,
      image_quick_prompt_title: selectedQuickPromptTitle,
      image_quick_prompt_snapshot: selectedQuickPromptContent,
    };

    setStatus('running');
    resetError();
    data?.onRunImageGeneration?.(id, {
      provider_id: selectedImageApi?.providerId || selectedImageApi?.id || '',
      api_protocol: selectedImageApi?.protocol || 'openai',
      api_base_url: selectedImageApi?.baseUrl || '',
      api_key: selectedImageApi?.apiKey || form.api_key,
      prompt: imagePrompt,
      model: selectedImageModel,
      size: resolvedImageSize,
      resolution: resolvedImageResolution,
      quality: resolvedImageQuality,
      background: resolvedImageBackground,
      output_format: resolvedImageOutputFormat,
      n: 1,
      image_urls: referenceImages,
      video_urls: connectedVideos,
    }, generationConfig);
  }, [buildCommonGenerationConfig, combinedImagePrompt, connectedVideos, data, form.api_key, form.image_count, form.image_negative_prompt, form.image_prompt, form.image_quick_prompt_id, id, isImageGenerationRunning, referenceImages, resetError, resolvedImageBackground, resolvedImageOutputFormat, resolvedImageQuality, resolvedImageResolution, resolvedImageSize, selectedImageApi, selectedImageCapabilities, selectedImageModel, selectedQuickPromptContent, selectedQuickPromptTitle, showError]);

  const handleStoryboardScriptGenerate = useCallback(async () => {
    setStatus('running');
    resetError();
    if (data?.setGenerating) data.setGenerating(id, true);

    // 从上游 product 节点取商品信息（若可获取）
    const productInfo = '';
    const userProductInfo = data?.productInfoForGenerator;
    const resolvedProductInfo = typeof userProductInfo === 'string' ? userProductInfo : productInfo;

    try {
      // ========== 一轮：完整分镜 + 单帧图片提示词 ==========
      // 把上游传过来的 data URL 转成 HTTP URL；后端 llm.py 会自动处理本地图片上传
      const resolvedImageUrls = await resolveImageUrlsForLLM(referenceImages);
      const hasResolvedImages = resolvedImageUrls.length > 0;

      const userPrompt1 = buildBasicScriptPrompt({
        aspectRatio: form.storyboard_aspect_ratio,
        style: form.storyboard_style,
        totalDuration: form.storyboard_total_duration,
        shotCount: form.storyboard_script_card_count,
        brief: form.storyboard_script_prompt,
        connectedPrompt,
        productInfo: resolvedProductInfo,
        hasProductImage: hasResolvedImages,
      });
      const llmRequestPayload = {
        api_base_url: selectedTextApi?.baseUrl || form.api_base_url,
        provider_id: selectedTextApi?.providerId || selectedTextApi?.id || '',
        api_protocol: selectedTextApi?.protocol || 'openai',
        text_api_mode: selectedTextApi?.textApiMode || 'auto',
        api_key: selectedTextApi?.apiKey || form.api_key,
        model_name: selectedTextModel,
        system_prompt: '你是资深广告导演、分镜师。严格输出可解析 JSON，不要输出 Markdown 或额外解释。',
        user_prompt: userPrompt1,
        temperature: form.storyboard_temperature,
        max_tokens: maxTextTokens,
        image_urls: resolvedImageUrls,
        video_urls: connectedVideos,
      };

      let res1;
      let visionDowngraded = false;
      const tryRequest = async (payload) => {
        const resp = await fetch(`${API_BASE}/api/llm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await resp.text();
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          return {
            success: false,
            error: text ? `后端返回的不是 JSON：${text.slice(0, 300)}` : '后端返回空响应',
          };
        }
        if (!resp.ok) {
          return {
            success: false,
            error: parsed?.error || parsed?.detail || `后端请求失败（HTTP ${resp.status}）`,
          };
        }
        return parsed;
      };

      res1 = await tryRequest(llmRequestPayload);

      // 如果失败且当前带了 image_urls，识别为 vision 不支持则自动降级重试
      if (!res1.success && llmRequestPayload.image_urls.length > 0 && isVisionUnsupportedError(res1.error)) {
        console.warn('当前 provider/model 不支持 vision 输入，自动降级为纯文本模式');
        visionDowngraded = true;
        const fallbackPayload = { ...llmRequestPayload, image_urls: [] };
        const fallbackUserPrompt = buildBasicScriptPrompt({
          aspectRatio: form.storyboard_aspect_ratio,
          style: form.storyboard_style,
          totalDuration: form.storyboard_total_duration,
          shotCount: form.storyboard_script_card_count,
          brief: form.storyboard_script_prompt,
          connectedPrompt,
          productInfo: resolvedProductInfo,
          hasProductImage: false,
        });
        fallbackPayload.user_prompt = fallbackUserPrompt;
        res1 = await tryRequest(fallbackPayload);
      }

      if (!res1.success) {
        throw new Error(res1.error || '分镜脚本生成失败');
      }

      const storyboardPayload = parseStoryboardPayload(res1.response);
      const basicCards = storyboardPayload.cards;
      if (basicCards.length === 0) {
        const message = '分镜脚本生成结果不是有效的 JSON，请调整提示词或换模型。';
        showError(`${message}\n\n原始返回：\n${res1.response || ''}`);
        return;
      }

      // 补齐 8 字段默认值，规范化 shotNo
      const fullCards = basicCards.map((card, index) => {
        const normalized = { ...STORYBOARD_FIELD_DEFAULTS, ...card };
        normalized.shotNo = String(index + 1).padStart(2, '0');
        const fallbackPrompts = buildFallbackStoryboardImagePrompts(
          normalized,
          form.storyboard_aspect_ratio,
          form.storyboard_style
        );
        if (!normalized.imagePositivePrompt) {
          normalized.imagePositivePrompt = fallbackPrompts.imagePositivePrompt;
        }
        if (!normalized.imageNegativePrompt) {
          normalized.imageNegativePrompt = fallbackPrompts.imageNegativePrompt;
        }
        if (!normalized.seedancePrompt) {
          normalized.seedancePrompt = buildFallbackSeedancePrompt(
            normalized,
            form.storyboard_aspect_ratio,
            form.storyboard_style
          );
        }
        if (!Array.isArray(normalized.qualityChecklist) || normalized.qualityChecklist.length === 0) {
          normalized.qualityChecklist = ['商品外观一致', '人物/手部稳定', '场景光线连续', '口播与画面匹配'];
        }
        return normalized;
      });

      const summary = fullCards
        .map(card => `${card.shotNo}. ${card.visualDescription ? card.visualDescription.slice(0, 40) : ''}`)
        .join('\n');
      const voiceoverScript = storyboardPayload.voiceoverScript || fullCards.map(card => card.narration).filter(Boolean).join('\n');

      // 立即写回 result（首屏可见，5 字段基础版）
      // 注意：不在这里 spawn 独立 storyboardCard 节点，
      // 分镜卡片只显示在 ResultNode 内部列表中，避免重复。
      if (data?.onGenerate) {
        const generationConfig = {
          ...buildCommonGenerationConfig(),
          storyboard_script_prompt: form.storyboard_script_prompt,
          storyboard_script_card_count: form.storyboard_script_card_count,
          storyboard_aspect_ratio: form.storyboard_aspect_ratio,
          storyboard_style: form.storyboard_style,
          storyboard_total_duration: form.storyboard_total_duration,
          storyboard_temperature: form.storyboard_temperature,
          model_name: selectedTextModel,
          text_api_id: selectedTextApi?.id || '',
        };
        data.onGenerate(id, {
          result: summary,
          storyboardCards: fullCards,
          storyboardResourcePackage: storyboardPayload.resourcePackage,
          storyboardVoiceoverScript: voiceoverScript,
          storyboardPromptStatus: 'done',
          storyboardVisionDowngraded: visionDowngraded,
          spawnStoryboardCards: false,
          generationConfig,
        });
      }

      setStatus('success');
    } catch (e) {
      let message = e.message || '分镜脚本生成失败';
      if (e.name === 'TypeError' && message === 'Failed to fetch') {
        message = '无法连接到后端 API。请确认后端服务正在运行，并刷新前端后重试。';
      }
      showError(message);
    } finally {
      if (data?.setGenerating) data.setGenerating(id, false);
    }
  }, [
    connectedPrompt,
    connectedVideos,
    buildCommonGenerationConfig,
    data,
    form.api_base_url,
    form.api_key,
    form.storyboard_aspect_ratio,
    form.storyboard_script_card_count,
    form.storyboard_script_prompt,
    form.storyboard_style,
    form.storyboard_temperature,
    form.storyboard_total_duration,
    id,
    maxTextTokens,
    referenceImages,
    resetError,
    selectedTextApi?.apiKey,
    selectedTextApi?.baseUrl,
    selectedTextModel,
    showError,
  ]);

  const handleVideoChange = useCallback((key, value) => {
    if (isGenerationLocked) return;
    setVideoForm(prev => ({ ...prev, [key]: value }));
    const dataKey = VIDEO_FORM_DATA_KEYS[key] || key;
    // 实时同步到节点数据，确保草稿不丢失
    data?.onGeneratorDataChange?.(id, { [dataKey]: value });
  }, [id, isGenerationLocked, data?.onGeneratorDataChange]);

  const handleVideoGenerationModeChange = useCallback((value) => {
    if (isGenerationLocked) return;
    const nextMode = videoGenerationModeOptions.some(option => option.value === value)
      ? value
      : VIDEO_GENERATION_MODE_OMNI;
    const patch = { video_generation_mode: nextMode };
    setVideoForm(prev => {
      const nextState = { ...prev, generation_mode: nextMode };
      if (nextMode === VIDEO_GENERATION_MODE_FIRST_LAST) {
        const first = referenceImages.includes(prev.first_frame_url)
          ? prev.first_frame_url
          : referenceImages[0] || '';
        const lastCandidates = referenceImages.filter(src => src !== first);
        const last = lastCandidates.includes(prev.last_frame_url)
          ? prev.last_frame_url
          : lastCandidates[0] || '';
        nextState.first_frame_url = first;
        nextState.last_frame_url = last;
        patch.video_first_frame_url = first;
        patch.video_last_frame_url = last;
      }
      return nextState;
    });
    data?.onGeneratorDataChange?.(id, patch);
  }, [data, id, isGenerationLocked, referenceImages, videoGenerationModeOptions]);

  const handleVideoGenerate = useCallback(async () => {
    if (isVideoGenerationRunning) {
      data?.onCancelGeneration?.(id);
      setStatus('idle');
      resetError();
      return;
    }
    setStatus('running');
    resetError();
    if (isVideoFirstLastFrameMode && (!resolvedVideoFirstFrameUrl || !resolvedVideoLastFrameUrl)) {
      setStatus('idle');
      showError('首尾帧模式需要同时提供首帧和尾帧图片。');
      return;
    }
    const maxReferenceImages = Number(selectedVideoCapabilities?.maxReferenceImages) || 0;
    const maxReferenceVideos = Number(selectedVideoCapabilities?.maxReferenceVideos) || 0;
    if (!isVideoFirstLastFrameMode && maxReferenceImages > 0 && referenceImages.length > maxReferenceImages) {
      setStatus('idle');
      showError(`当前视频模型最多支持 ${maxReferenceImages} 张参考图，请减少后再运行`);
      return;
    }
    if (!isVideoFirstLastFrameMode && maxReferenceVideos > 0 && connectedVideos.length > maxReferenceVideos) {
      setStatus('idle');
      showError(`当前视频模型最多支持 ${maxReferenceVideos} 个参考视频，请减少后再运行`);
      return;
    }
    const videoReferenceImages = selectedVideoModel?.toLowerCase().includes('sora')
      ? referenceImages.slice(0, 1)
      : referenceImages;
    const avatarImageWithRoles = !isVideoFirstLastFrameMode && selectedVideoUsesSeedance2 && selectedAvatarAsset
      ? selectedAvatarVideoRoleAssets.slice(0, MAX_REFERENCE_IMAGES)
      : [];
    const imageWithRoles = isVideoFirstLastFrameMode
      ? [
        { url: resolvedVideoFirstFrameUrl, role: 'first_frame', assetRole: 'first_frame', name: '首帧' },
        { url: resolvedVideoLastFrameUrl, role: 'last_frame', assetRole: 'last_frame', name: '尾帧' },
      ]
      : avatarImageWithRoles;
    const remainingImageSlots = Math.max(0, MAX_REFERENCE_IMAGES - imageWithRoles.length);
    const payloadImageUrls = isVideoFirstLastFrameMode ? [] : videoReferenceImages.slice(0, remainingImageSlots);
    const payloadVideoUrls = isVideoFirstLastFrameMode
      ? []
      : uniqueList([...selectedAvatarVideoAssetUrls, ...connectedVideos]);
    const payloadAudioUrls = isVideoFirstLastFrameMode ? [] : selectedAvatarAudioAssetUrls;
    const videoPromptBase = buildPromptWithImageMentions(combinedVideoPrompt, payloadImageUrls);
    const videoPrompt = selectedVideoSupportsReferenceModes
      ? buildSeedanceMediaPrompt(videoPromptBase, {
        imageUrls: payloadImageUrls,
        imageWithRoles,
        videoUrls: payloadVideoUrls,
        audioUrls: payloadAudioUrls,
      })
      : videoPromptBase;
    const generationConfig = {
      ...buildCommonGenerationConfig(),
      video_prompt: videoForm.prompt,
      video_model: selectedVideoModel,
      video_api_id: selectedVideoApi?.id || '',
      video_aspect_ratio: resolvedVideoAspectRatio,
      video_duration: resolvedVideoDuration,
      video_resolution: resolvedVideoResolution,
      video_generation_mode: resolvedVideoGenerationMode,
      video_first_frame_url: resolvedVideoFirstFrameUrl,
      video_last_frame_url: resolvedVideoLastFrameUrl,
      video_generate_audio: videoForm.generate_audio !== false,
      video_avatar_package_key: selectedAvatarAsset ? selectedAvatarPackageKey : '',
      video_avatar_group_id: selectedAvatarAsset?.groupId || '',
      video_avatar_asset_url: selectedAvatarAssetUrl,
      video_avatar_asset_urls: selectedAvatarVideoRoleAssets.map(asset => asset.url).filter(Boolean),
      video_avatar_assets: selectedAvatarVideoRoleAssets,
      video_avatar_audio_asset_urls: selectedAvatarAudioAssetUrls,
      video_avatar_video_asset_urls: selectedAvatarVideoAssetUrls,
    };
    data?.onRunVideoGeneration?.(id, {
      provider_id: selectedVideoApi?.providerId || selectedVideoApi?.id || '',
      api_protocol: selectedVideoApi?.protocol || 'openai',
      api_base_url: selectedVideoApi?.baseUrl || '',
      api_key: selectedVideoApi?.apiKey || form.api_key,
      prompt: videoPrompt,
      model: selectedVideoModel,
      duration: resolvedVideoDuration,
      aspect_ratio: resolvedVideoAspectRatio,
      resolution: resolvedVideoResolution,
      generation_mode: resolvedVideoGenerationMode,
      generate_audio: videoForm.generate_audio !== false,
      image_urls: payloadImageUrls,
      image_with_roles: imageWithRoles,
      video_urls: payloadVideoUrls,
      reference_video_urls: payloadVideoUrls,
      audio_urls: payloadAudioUrls,
    }, generationConfig);
  }, [buildCommonGenerationConfig, combinedVideoPrompt, connectedVideos, data, form.api_key, id, isVideoFirstLastFrameMode, isVideoGenerationRunning, referenceImages, resetError, resolvedVideoAspectRatio, resolvedVideoDuration, resolvedVideoFirstFrameUrl, resolvedVideoGenerationMode, resolvedVideoLastFrameUrl, resolvedVideoResolution, selectedAvatarAsset, selectedAvatarAssetUrl, selectedAvatarAudioAssetUrls, selectedAvatarPackageKey, selectedAvatarVideoAssetUrls, selectedAvatarVideoRoleAssets, selectedVideoApi, selectedVideoCapabilities, selectedVideoModel, selectedVideoSupportsReferenceModes, selectedVideoUsesSeedance2, showError, videoForm.generate_audio, videoForm.prompt]);

  const handleAudioGenerate = useCallback(async () => {
    if (isAudioGenerationRunning) {
      data?.onCancelGeneration?.(id);
      setStatus('idle');
      resetError();
      return;
    }
    const audioText = combinedAudioText.trim();
    if (!audioText) return;
    setStatus('running');
    resetError();
    const generationConfig = {
      ...buildCommonGenerationConfig(),
      audio_text: form.audio_text,
      audio_voice: form.audio_voice,
      audio_style: form.audio_style,
      text_api_id: selectedTextApi?.id || '',
    };
    data?.onRunAudioGeneration?.(id, {
      api_base_url: selectedTextApi?.baseUrl || form.api_base_url,
      api_key: selectedTextApi?.apiKey || form.api_key,
      model: selectedTextModel,
      text: audioText,
      voice: form.audio_voice,
      style: form.audio_style,
    }, generationConfig);
  }, [buildCommonGenerationConfig, combinedAudioText, data, form.api_base_url, form.api_key, form.audio_style, form.audio_text, form.audio_voice, id, isAudioGenerationRunning, resetError, selectedTextApi, selectedTextModel]);

  // ===== 通用：文本参考卡片 =====
  const renderTextReferenceCard = () => connectedTextReferences.length > 0 ? (
    <button
      ref={textReferenceCardRef}
      type="button"
      className={`reference-text-card ${showTextReferencePopover ? 'active' : ''}`}
      onClick={() => {
        if (!showTextReferencePopover) updateTextReferencePopoverPosition();
        setShowTextReferencePopover(prev => !prev);
      }}
      aria-expanded={showTextReferencePopover}
      aria-label={`查看 ${connectedTextReferences.length} 条文本参考`}
      title="查看文本参考"
    >
      <Icon name="quoteText" size={16} strokeWidth={2.2} />
      <span>文本</span>
      <strong>{connectedTextReferences.length}</strong>
    </button>
  ) : null;

  const renderTextReferencePopover = () => connectedTextReferences.length > 0
    && showTextReferencePopover
    && textReferencePopoverPosition
    && typeof document !== 'undefined'
    ? createPortal((
    <div
      ref={textReferencePopoverRef}
      className="text-reference-popover"
      role="dialog"
      aria-label="文本参考"
      style={{
        left: `${textReferencePopoverPosition.left}px`,
        top: `${textReferencePopoverPosition.top}px`,
      }}
    >
      <div className="text-reference-popover-header">
        <strong>文本参考</strong>
        <span>{connectedTextReferences.length}</span>
      </div>
      <div className="text-reference-popover-body">
        {connectedTextReferences.map((prompt, index) => (
          <div className="text-reference-item" key={`text_ref_${index}`}>
            <span>文本参考 {index + 1}</span>
            <p>{prompt}</p>
          </div>
        ))}
      </div>
    </div>
  ), document.body) : null;

  // The generator body is scrollable, so a preview rendered inside a thumbnail
  // would be clipped by that scroll container. Render it at the document level.
  const showReferenceImagePreview = useCallback((event, src) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const availableAbove = rect.top - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const availableBelow = window.innerHeight - rect.bottom - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const placeAbove = availableAbove >= REFERENCE_IMAGE_PREVIEW_MAX_SIZE || availableAbove >= availableBelow;
    const previewHalfSize = REFERENCE_IMAGE_PREVIEW_MAX_SIZE / 2;
    const left = Math.max(
      REFERENCE_IMAGE_PREVIEW_MARGIN + previewHalfSize,
      Math.min(window.innerWidth - REFERENCE_IMAGE_PREVIEW_MARGIN - previewHalfSize, rect.left + rect.width / 2)
    );
    setReferenceImagePreview({
      src,
      left,
      top: placeAbove ? rect.top - REFERENCE_IMAGE_PREVIEW_GAP : rect.bottom + REFERENCE_IMAGE_PREVIEW_GAP,
      placement: placeAbove ? 'above' : 'below',
    });
  }, []);

  const hideReferenceImagePreview = useCallback(() => {
    setReferenceImagePreview(null);
  }, []);

  const renderReferenceImagePreview = () => referenceImagePreview && typeof document !== 'undefined'
    ? createPortal((
      <div
        className={`reference-image-preview reference-image-preview-portal ${referenceImagePreview.placement}`}
        aria-hidden="true"
        style={{
          left: `${referenceImagePreview.left}px`,
          top: `${referenceImagePreview.top}px`,
        }}
      >
        <img src={referenceImagePreview.src} alt="" />
      </div>
    ), document.body)
    : null;

  const renderVideoReferences = () => connectedVideos.length > 0 ? (
    <div className="video-reference-list">
      {connectedVideos.map((src, index) => (
        <div className="video-reference-item" key={`video_ref_${src.slice(0, 32)}_${index}`}>
          <video src={src} controls muted />
          <span>视频 {index + 1}</span>
        </div>
      ))}
    </div>
  ) : null;

  const handleSwapVideoFirstLastFrames = () => {
    if (isGenerationLocked) return;
    const nextFirst = resolvedVideoLastFrameUrl;
    const nextLast = resolvedVideoFirstFrameUrl;
    setVideoForm(prev => ({
      ...prev,
      first_frame_url: nextFirst,
      last_frame_url: nextLast,
    }));
    data?.onGeneratorDataChange?.(id, {
      video_first_frame_url: nextFirst,
      video_last_frame_url: nextLast,
    });
  };

  const handleAvatarAssetChange = useCallback((value) => {
    if (isGenerationLocked) return;
    const nextAvatarAsset = avatarAssets.find(asset => getAvatarPackageKey(asset) === value) || null;
    const nextRoleAssets = nextAvatarAsset ? getVideoRoleAssetsFromAvatarAsset(nextAvatarAsset) : [];
    const nextAudioUrls = nextAvatarAsset
      ? uniqueList([
        ...getTalentPackageCertifiedAssetUrlsByType(nextAvatarAsset.talentPackage, 'audio'),
        ...getTalentPackageReferenceAudioUrls(nextAvatarAsset.talentPackage),
      ])
      : [];
    const nextVideoUrls = nextAvatarAsset
      ? getTalentPackageCertifiedAssetUrlsByType(nextAvatarAsset.talentPackage, 'video')
      : [];
    setSelectedAvatarSelection(value);
    data?.onGeneratorDataChange?.(id, {
      video_avatar_package_key: value,
      video_avatar_group_id: nextAvatarAsset?.groupId || '',
      video_avatar_asset_url: nextAvatarAsset?.assetUrl || '',
      video_avatar_asset_urls: nextRoleAssets.map(asset => asset.url).filter(Boolean),
      video_avatar_assets: nextRoleAssets,
      video_avatar_audio_asset_urls: nextAudioUrls,
      video_avatar_video_asset_urls: nextVideoUrls,
    });
  }, [avatarAssets, data, id, isGenerationLocked]);

  const renderVideoAvatarReferencePicker = () => {
    if (generatorType !== 'generateVideo' || isVideoFirstLastFrameMode) return null;
    const avatarOptions = avatarAssets.map((asset, index) => ({
      value: getAvatarPackageKey(asset),
      label: formatAvatarAssetLabel(asset, index),
      imageUrl: getAvatarAssetPreviewUrl(asset),
    }));
    const canUseAvatar = selectedVideoUsesSeedance2;
    const avatarPreviewUrl = selectedAvatarAsset ? getAvatarAssetPreviewUrl(selectedAvatarAsset) : '';
    const disabled = isGenerationLocked || avatarAssets.length === 0 || !canUseAvatar;
    const title = avatarAssets.length === 0
      ? '暂无可用认证角色'
      : !canUseAvatar
        ? '当前模型不支持角色参考'
        : selectedAvatarAsset
          ? '更换角色'
          : '选择角色';
    return (
      <>
        <div className={`video-avatar-reference-card ${selectedAvatarAsset ? 'has-avatar' : ''}`.trim()} title={title}>
          {avatarPreviewUrl ? (
            <img className="video-avatar-reference-preview" src={avatarPreviewUrl} alt="" />
          ) : (
            <Icon name="user" size={20} strokeWidth={2.2} />
          )}
          <ProcessorModelDropdown
            value={selectedAvatarAsset ? selectedAvatarPackageKey : ''}
            options={avatarOptions.length > 0 ? avatarOptions : [{ value: '', label: '暂无角色', disabled: true }]}
            onChange={handleAvatarAssetChange}
            disabled={disabled}
            placeholder="角色"
            menuPortal
            menuClassName="video-avatar-reference-menu"
            menuMinWidth={260}
          />
          {selectedAvatarAsset && (
            <button
              type="button"
              className="thumb-remove"
              onClick={(event) => {
                event.stopPropagation();
                handleAvatarAssetChange('');
              }}
              disabled={isGenerationLocked}
              aria-label="移除角色"
              title="移除角色"
            >
              <Icon name="x" size={12} strokeWidth={2.4} />
            </button>
          )}
        </div>
        <span className="video-reference-divider" aria-hidden="true" />
      </>
    );
  };

  const renderVideoFirstLastReferenceCards = () => {
    const renderFrameSlot = (label, src) => {
      const connectedEdgeId = getConnectedReferenceEdgeId('image', src);
      const isUploaded = src && visibleUploadedReferenceImages.includes(src);
      const canRemove = Boolean(connectedEdgeId || isUploaded);
      const removeFrame = (event) => {
        event.stopPropagation();
        if (isGenerationLocked || !canRemove) return;
        if (connectedEdgeId) {
          disconnectReference(event, connectedEdgeId);
        } else {
          removeUploadedReference(src);
        }
      };

      return (
        <button
          type="button"
          className={`video-frame-slot ${src ? 'has-frame reference-image-card' : ''}`}
          onClick={() => !src && referenceInputRef.current?.click()}
          disabled={isGenerationLocked && !src}
          title={src ? label : `添加${label}`}
        >
          {src ? (
            <>
              <img src={src} alt={label} />
              <span className="video-frame-slot-label">{label}</span>
              {canRemove && (
                <span
                  role="button"
                  tabIndex={0}
                  className="thumb-remove"
                  aria-label={`删除${label}`}
                  onClick={removeFrame}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    removeFrame(event);
                  }}
                >
                  <Icon name="x" size={12} strokeWidth={2.4} />
                </span>
              )}
            </>
          ) : (
            <>
              <Icon name="add" size={18} />
              <span className="video-frame-slot-label">{label}</span>
            </>
          )}
        </button>
      );
    };

    return (
      <div className="video-first-last-reference">
        {renderFrameSlot('首帧', resolvedVideoFirstFrameUrl)}
        <button
          type="button"
          className="video-frame-swap"
          onClick={handleSwapVideoFirstLastFrames}
          disabled={isGenerationLocked || !resolvedVideoFirstFrameUrl || !resolvedVideoLastFrameUrl}
          title="交换首尾帧"
          aria-label="交换首尾帧"
        >
          <Icon name="refresh" size={14} />
        </button>
        {renderFrameSlot('尾帧', resolvedVideoLastFrameUrl)}
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
    );
  };

  const renderReferenceMaterialsField = () => {
    const referenceImageCount = referenceImages.length + referenceUploads.length;
    return (
      <div className="node-field reference-materials-field">
        {generatorType === 'generateVideo' && isVideoFirstLastFrameMode
          ? renderVideoFirstLastReferenceCards()
          : renderImageReferenceCards(referenceImageCount)}
        {renderReferenceImagePreview()}
        {renderTextReferencePopover()}
        {generatorType === 'generateVideo' && isVideoFirstLastFrameMode ? null : renderVideoReferences()}
        <input ref={referenceInputRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple onChange={handleReferenceUpload} style={{ display: 'none' }} />
      </div>
    );
  };

  const renderImageReferenceCards = (referenceImageCount) => (
    <div className="reference-card-row">
      {renderVideoAvatarReferencePicker()}
      <button
        type="button"
        className="reference-add-card"
        onClick={() => referenceInputRef.current?.click()}
        disabled={remainingReferenceSlots === 0 || isGenerationLocked}
        title={isGenerationLocked ? '生成中不可修改参考素材' : remainingReferenceSlots === 0 ? '参考素材已满' : '上传图片'}
        aria-label={`上传参考图片，已添加 ${referenceImageCount} 张，最多 ${MAX_REFERENCE_IMAGES} 张`}
      >
        <Icon name="add" size={18} strokeWidth={2.3} />
        <span className="reference-add-count">{referenceImageCount}/{MAX_REFERENCE_IMAGES}</span>
      </button>
      {renderTextReferenceCard()}
      {connectedImages.slice(0, MAX_REFERENCE_IMAGES).map((src, index) => (
        <div
          className="reference-card reference-image-card"
          key={`connected_${src.slice(0, 32)}_${index}`}
          tabIndex={0}
          onMouseEnter={event => showReferenceImagePreview(event, src)}
          onMouseLeave={hideReferenceImagePreview}
          onFocus={event => showReferenceImagePreview(event, src)}
          onBlur={hideReferenceImagePreview}
        >
          <img src={src} alt={`连接素材 ${index + 1}`} />
          {getConnectedReferenceEdgeId('image', src) && (
            <button
              type="button"
              className="thumb-remove"
              onClick={event => disconnectReference(event, getConnectedReferenceEdgeId('image', src))}
              disabled={isGenerationLocked}
              aria-label={`删除上游图片参考 ${index + 1}`}
            >
              <Icon name="x" size={12} strokeWidth={2.4} />
            </button>
          )}
        </div>
      ))}
      {visibleUploadedReferenceImages.slice(0, Math.max(0, MAX_REFERENCE_IMAGES - connectedImages.length)).map((src, index) => (
        <div
          className="reference-card reference-image-card"
          key={`uploaded_${src.slice(0, 32)}_${index}`}
          tabIndex={0}
          onMouseEnter={event => showReferenceImagePreview(event, src)}
          onMouseLeave={hideReferenceImagePreview}
          onFocus={event => showReferenceImagePreview(event, src)}
          onBlur={hideReferenceImagePreview}
        >
          <img src={src} alt={`上传素材 ${index + 1}`} />
          <span className="reference-index-badge">图 {connectedImages.length + index + 1}</span>
          <button className="thumb-remove" onClick={() => removeUploadedReference(src)} disabled={isGenerationLocked} aria-label="删除">
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
  );

  const renderErrorMessage = () => status === 'error' && errorMessage ? (
    <div className="processor-error-message">
      <div className="processor-error-text">{errorMessage}</div>
      <button className="processor-error-copy" type="button" onClick={handleCopyError}>
        {errorCopied === 'success' ? '已复制' : errorCopied === 'failed' ? '失败' : '复制'}
      </button>
    </div>
  ) : null;

  // ===== 分镜脚本生成器（处理器，不是节点） =====
  // generatorType === 'generateStoryboardScript'，CSS class: storyboard-script-processor-node
  if (generatorType === 'generateStoryboardScript') {
    const hasStoryboardScriptInput = combinedStoryboardScriptPrompt.trim() || referenceImages.length > 0 || connectedVideos.length > 0;
    return (
      <div
        className={`custom-node processor-node storyboard-script-processor-node ${status}`}
        style={processorStyle}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {data?.storyboardVisionDowngraded && (
          <div className="storyboard-vision-warning">
            <Icon name="help" size={13} />
            <span>当前模型不支持 vision，已自动忽略商品图，仅按文本生成。</span>
          </div>
        )}
        {renderErrorMessage()}
        <div className="node-body">
          {renderReferenceMaterialsField()}
          <div className="node-field">
            <ImageMentionTextarea
              value={form.storyboard_script_prompt}
              onChange={nextValue => handleChange('storyboard_script_prompt', nextValue)}
              referenceImages={referenceImages}
              placeholder="输入影片主题、卖点强调、镜头节奏、目标人群等..."
              rows={4}
              disabled={isGenerationLocked}
            />
          </div>

        </div>
        <div className="processor-footer-wrap" ref={settingsWrapRef}>
          {showSettings && (
            <div className="processor-settings-panel">
              <div className="settings-section">
                <div className="settings-label">画幅</div>
                <div className="ratio-grid">
                  <RatioCard label="1:1" shape="square" active={form.storyboard_aspect_ratio === '1:1'} onClick={() => handleChange('storyboard_aspect_ratio', '1:1')} />
                  <RatioCard label="3:4" shape="portrait" active={form.storyboard_aspect_ratio === '3:4'} onClick={() => handleChange('storyboard_aspect_ratio', '3:4')} />
                  <RatioCard label="4:3" shape="" active={form.storyboard_aspect_ratio === '4:3'} onClick={() => handleChange('storyboard_aspect_ratio', '4:3')} />
                  <RatioCard label="9:16" shape="portrait" active={form.storyboard_aspect_ratio === '9:16'} onClick={() => handleChange('storyboard_aspect_ratio', '9:16')} />
                  <RatioCard label="16:9" shape="" active={form.storyboard_aspect_ratio === '16:9'} onClick={() => handleChange('storyboard_aspect_ratio', '16:9')} />
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-label">风格模板</div>
                <OptionRow
                  options={[
                    { value: '种草', label: '种草' },
                    { value: '开箱', label: '开箱' },
                    { value: '产品测评', label: '测评' },
                    { value: '短广告', label: '短广告' },
                  ]}
                  value={form.storyboard_style}
                  onChange={v => handleChange('storyboard_style', v)}
                />
              </div>
              <div className="settings-section">
                <div className="settings-label">视频总时长</div>
                <OptionRow
                  options={[{ value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 45, label: '45s' }, { value: 60, label: '60s' }, { value: 90, label: '90s' }]}
                  value={form.storyboard_total_duration}
                  onChange={v => handleChange('storyboard_total_duration', v)}
                />
              </div>
              <div className="settings-section">
                <div className="settings-label">分镜数量</div>
                <OptionRow
                  options={[{ value: 4, label: '4' }, { value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }, { value: 12, label: '12' }]}
                  value={form.storyboard_script_card_count}
                  onChange={v => handleChange('storyboard_script_card_count', v)}
                />
              </div>
              <div className="settings-section">
                <div className="settings-label">温度</div>
                <OptionRow
                  options={[{ value: 0.3, label: '0.3' }, { value: 0.5, label: '0.5' }, { value: 0.7, label: '0.7' }, { value: 1.0, label: '1.0' }]}
                  value={form.storyboard_temperature}
                  onChange={v => handleChange('storyboard_temperature', v)}
                />
              </div>
            </div>
          )}
          <div className="processor-footer">
            <div className="processor-model-group">
              <ProcessorModelDropdown
                value={selectedTextApi?.id || ''}
                options={textApiOptions}
                onChange={handleTextApiChange}
                disabled={isGenerationLocked}
                placeholder="未配置 API"
              />
              <ProcessorModelDropdown
                value={selectedTextModel}
                options={textModelSelectOptions}
                onChange={value => handleChange('model_name', value)}
                disabled={isGenerationLocked || (!selectedTextApi && !hasTextModelOptions)}
                placeholder="未配置文本模型"
              />
            </div>
            <button className="processor-settings-btn" onClick={() => setShowSettings(!showSettings)}>
              <span className="processor-settings-summary">{form.storyboard_aspect_ratio} · {form.storyboard_style} · {form.storyboard_script_card_count}镜 · {form.storyboard_total_duration}s</span>
            </button>
            <button className="processor-run-btn" onClick={handleStoryboardScriptGenerate} disabled={status === 'running' || !hasStoryboardScriptInput}>
              <Icon name={status === 'running' ? 'loader' : 'play'} size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 视频处理器（处理器，不是节点） =====
  // generatorType === 'generateVideo'，CSS class: video-processor-node
  if (generatorType === 'generateVideo') {
    return (
      <div
        className={`custom-node processor-node video-processor-node ${status}`}
        style={processorStyle}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {renderErrorMessage()}
        <div className="node-body">
          {renderReferenceMaterialsField()}
          <div className="node-field">
            <ImageMentionTextarea
              value={videoForm.prompt}
              onChange={nextValue => handleVideoChange('prompt', nextValue)}
              referenceImages={referenceImages}
              placeholder="输入视频提示词..."
              rows={4}
              disabled={isGenerationLocked}
            />
          </div>
        </div>
        <div className="processor-footer-wrap" ref={settingsWrapRef}>
          {showSettings && (
            <div className="processor-settings-panel">
              {videoGenerationModeOptions.length > 1 && (
                <div className="settings-section">
                  <div className="settings-label">生成方式</div>
                  <OptionRow
                    options={videoGenerationModeOptions}
                    value={resolvedVideoGenerationMode}
                    onChange={handleVideoGenerationModeChange}
                  />
                </div>
              )}
              <div className="settings-section">
                <div className="settings-label">比例</div>
                <div className="ratio-grid">
                  {videoRatioOptions.map(option => (
                    <RatioCard
                      key={option.id || option.value}
                      label={option.label}
                      shape={option.shape}
                      active={resolvedVideoAspectRatio === option.value}
                      onClick={() => handleVideoChange('aspect_ratio', option.value)}
                    />
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-label">时长</div>
                <DurationSlider
                  value={resolvedVideoDuration}
                  min={videoDurationRange.min}
                  max={videoDurationRange.max}
                  supportsAuto={supportsVideoAutoDuration}
                  onChange={v => handleVideoChange('duration', v)}
                />
              </div>
              <div className="settings-section">
                <div className="settings-label">分辨率</div>
                <OptionRow
                  options={videoResolutionOptions}
                  value={resolvedVideoResolution}
                  onChange={v => handleVideoChange('resolution', v)}
                />
              </div>
            </div>
          )}
          <div className="processor-footer">
            <div className="processor-model-group">
              <ProcessorModelDropdown
                value={selectedVideoApi?.id || ''}
                options={videoApiOptions}
                onChange={handleVideoApiChange}
                disabled={isGenerationLocked}
                placeholder="未配置 API"
              />
              <ProcessorModelDropdown
                value={selectedVideoModel}
                options={videoModelSelectOptions}
                onChange={value => handleVideoChange('model', value)}
                disabled={isGenerationLocked || (!selectedVideoApi && !hasVideoModelOptions)}
                placeholder="未配置视频模型"
              />
            </div>
            <button className="processor-settings-btn" onClick={() => setShowSettings(!showSettings)}>
              <Icon name="settings" size={15} />
              <span className="processor-settings-summary">{VIDEO_GENERATION_MODE_LABELS[resolvedVideoGenerationMode] || '全能参考'},{resolvedVideoAspectRatio},{resolvedVideoDuration === -1 ? '自动' : `${resolvedVideoDuration}s`},{resolvedVideoResolution}</span>
            </button>
            <button
              className={`processor-run-btn ${isVideoGenerationRunning ? 'cancel' : ''}`}
              onClick={handleVideoGenerate}
              disabled={isUploadingReferences || (!isVideoGenerationRunning && !(combinedVideoPrompt.trim() || (isVideoFirstLastFrameMode && resolvedVideoFirstFrameUrl && resolvedVideoLastFrameUrl)))}
              title={isVideoGenerationRunning ? '放弃本次生成结果' : '生成视频'}
            >
              <Icon name={isVideoGenerationRunning ? 'stop' : isUploadingReferences ? 'loader' : 'play'} size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 图片处理器（处理器，不是节点） =====
  // generatorType === 'generateImage'，CSS class: image-processor-node
  if (generatorType === 'generateImage') {
    return (
      <div
        className={`custom-node processor-node image-processor-node ${status}`}
        style={processorStyle}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {renderErrorMessage()}
        <div className="node-body">
          {renderReferenceMaterialsField()}
          <div className="node-field">
            <label>正向提示词</label>
            <ImageMentionTextarea
              value={form.image_prompt}
              onChange={nextValue => handleChange('image_prompt', nextValue)}
              referenceImages={referenceImages}
              placeholder="输入图片提示词..."
              rows={4}
              disabled={isGenerationLocked}
              leadingToken={selectedQuickPromptToken}
              onLeadingTokenClick={() => setQuickPromptOpenRequest(value => value + 1)}
              onLeadingTokenRemove={() => handleQuickPromptSelect(null)}
            />
          </div>
          <div className="node-field">
            <label>负面提示词</label>
            <textarea
              value={form.image_negative_prompt}
              onChange={event => handleChange('image_negative_prompt', event.target.value)}
              placeholder="输入不希望出现在图片里的内容..."
              rows={3}
              disabled={isGenerationLocked}
            />
          </div>
        </div>
        <div className="processor-footer-wrap" ref={settingsWrapRef}>
          {showSettings && (
            <div className="processor-settings-panel">
              <div className="settings-section">
                <div className="settings-label">比例</div>
                <div className="ratio-grid image-ratio-grid">
                  {imageRatioOptions.map(option => (
                    <RatioCard
                      key={option.id}
                      label={option.label}
                      value={option.value}
                      shape={option.shape}
                      active={resolvedImageRatioOption?.id === option.id}
                      onClick={() => handleImageRatioChange(option)}
                    />
                  ))}
                </div>
              </div>
              {imageResolutionOptions.length > 0 && <div className="settings-section">
                <div className="settings-label">分辨率</div>
                <OptionRow
                  options={imageResolutionOptions}
                  value={resolvedImageResolution}
                  onChange={v => handleChange('image_resolution', v)}
                />
              </div>}
              {imageQualityOptions.length > 0 && <div className="settings-section">
                <div className="settings-label">质量</div>
                <OptionRow
                  options={imageQualityOptions}
                  value={resolvedImageQuality}
                  onChange={v => handleChange('image_quality', v)}
                />
              </div>}
              {imageBackgroundOptions.length > 0 && <div className="settings-section">
                <div className="settings-label">背景</div>
                <OptionRow
                  options={imageBackgroundOptions}
                  value={resolvedImageBackground}
                  onChange={v => handleChange('image_background', v)}
                />
              </div>}
              {imageOutputFormatOptions.length > 1 && <div className="settings-section">
                <div className="settings-label">输出格式</div>
                <OptionRow
                  options={imageOutputFormatOptions}
                  value={resolvedImageOutputFormat}
                  onChange={v => handleChange('image_output_format', v)}
                />
              </div>}
              <div className="settings-section">
                <div className="settings-label">生成张数</div>
                <OptionRow
                  options={[{ value: 1, label: '1 张' }, { value: 2, label: '2 张' }, { value: 3, label: '3 张' }, { value: 4, label: '4 张' }]}
                  value={form.image_count}
                  onChange={v => handleChange('image_count', v)}
                />
              </div>
            </div>
          )}
          <div className="processor-footer">
            <div className="processor-model-group">
              <ProcessorModelDropdown
                value={selectedImageApi?.id || ''}
                options={imageApiOptions}
                onChange={handleImageApiChange}
                disabled={isGenerationLocked}
                placeholder="未配置 API"
              />
              <ProcessorModelDropdown
                value={selectedImageModel}
                options={imageModelSelectOptions}
                onChange={value => handleChange('image_model', value)}
                disabled={isGenerationLocked || (!selectedImageApi && !hasImageModelOptions)}
                placeholder="未配置图片模型"
              />
              <QuickPromptControl
                selectedPromptId={form.image_quick_prompt_id}
                disabled={isGenerationLocked}
                openRequest={quickPromptOpenRequest}
                onSelect={handleQuickPromptSelect}
              />
            </div>
            <button className="processor-settings-btn" onClick={() => setShowSettings(!showSettings)}>
              <span className="processor-settings-summary">{imageSettingsSummary}</span>
            </button>
            <button
              className={`processor-run-btn ${isImageGenerationRunning ? 'cancel' : ''}`}
              onClick={handleImageGenerate}
              disabled={isUploadingReferences || (!isImageGenerationRunning && !combinedImagePrompt.trim())}
              title={isImageGenerationRunning ? '放弃本次生成结果' : '生成图片'}
            >
              <Icon name={isImageGenerationRunning ? 'stop' : isUploadingReferences ? 'loader' : 'play'} size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 音频处理器（处理器，不是节点） =====
  // generatorType === 'generateAudio'，CSS class: audio-processor-node
  if (generatorType === 'generateAudio') {
    const audioVoiceOptions = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];
    return (
      <div
        className={`custom-node processor-node audio-processor-node ${status}`}
        style={processorStyle}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {renderErrorMessage()}
        <div className="node-body">
          {renderReferenceMaterialsField()}
          <div className="node-field">
            <label>朗读文本</label>
            <textarea
              value={form.audio_text}
              onChange={event => handleChange('audio_text', event.target.value)}
              placeholder="输入要生成成音频的文本..."
              rows={4}
              disabled={isGenerationLocked}
            />
          </div>
          <div className="node-field">
            <label>声音风格</label>
            <textarea
              value={form.audio_style}
              onChange={event => handleChange('audio_style', event.target.value)}
              placeholder="例如：自然、清晰、温柔、年轻女性、适合短视频口播"
              rows={2}
              disabled={isGenerationLocked}
            />
          </div>
        </div>
        <div className="processor-footer-wrap">
          {showSettings && (
            <div className="processor-settings-panel">
              <div className="settings-section">
                <div className="settings-label">音色</div>
                <OptionRow
                  options={audioVoiceOptions.map(value => ({ value, label: value }))}
                  value={form.audio_voice}
                  onChange={value => handleChange('audio_voice', value)}
                />
              </div>
            </div>
          )}
          <div className="processor-footer">
            <div className="processor-model-group">
              <ProcessorModelDropdown
                value={selectedTextApi?.id || ''}
                options={textApiOptions}
                onChange={handleTextApiChange}
                disabled={isGenerationLocked}
                placeholder="未配置 API"
              />
            </div>
            <button className="processor-settings-btn" onClick={() => setShowSettings(!showSettings)}>
              <Icon name="settings" size={15} />
              <span className="processor-settings-summary">音色 {form.audio_voice}</span>
            </button>
            <button
              className={`processor-run-btn ${isAudioGenerationRunning ? 'cancel' : ''}`}
              onClick={handleAudioGenerate}
              disabled={!isAudioGenerationRunning && !combinedAudioText.trim()}
              title={isAudioGenerationRunning ? '放弃本次生成结果' : '生成音频'}
            >
              <Icon name={isAudioGenerationRunning ? 'stop' : 'play'} size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 文本处理器（处理器，不是节点） =====
  // generatorType === 'generateText'，CSS class: text-processor-node
  return (
    <div
      className={`custom-node processor-node text-processor-node ${status}`}
      style={processorStyle}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {renderErrorMessage()}
      <div className="node-body">
        {renderReferenceMaterialsField()}
        <div className="node-field">
          <ImageMentionTextarea
            value={form.user_prompt}
            onChange={nextValue => handleChange('user_prompt', nextValue)}
            referenceImages={referenceImages}
            placeholder="输入文本提示词..."
            rows={4}
            disabled={isGenerationLocked}
          />
        </div>
      </div>
      <div className="processor-footer-wrap">
        <div className="processor-footer">
          <div className="processor-model-group">
            <ProcessorModelDropdown
              value={selectedTextApi?.id || ''}
              options={textApiOptions}
              onChange={handleTextApiChange}
              disabled={isGenerationLocked}
              placeholder="未配置 API"
            />
            <ProcessorModelDropdown
              value={selectedTextModel}
              options={textModelSelectOptions}
              onChange={value => handleChange('model_name', value)}
              disabled={isGenerationLocked || (!selectedTextApi && !hasTextModelOptions)}
              placeholder="未配置文本模型"
            />
          </div>
          <button
            className={`processor-run-btn ${isTextGenerationRunning ? 'cancel' : ''}`}
            onClick={handleTextGenerate}
            disabled={isUploadingReferences || (!isTextGenerationRunning && !(combinedTextPrompt.trim() || referenceImages.length > 0))}
            title={isTextGenerationRunning ? '放弃本次生成结果' : '生成文本'}
          >
            <Icon name={isTextGenerationRunning ? 'stop' : isUploadingReferences ? 'loader' : 'play'} size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(GeneratorNode);
