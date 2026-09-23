import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import ImageActionOverlay from './ImageActionOverlay';
import Icon from '../components/Icon';
import ImagePreviewOverlay from '../components/ImagePreviewOverlay';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import { uploadImageFile } from '../uploadImage';
import { uploadAudioFile } from '../uploadAudio';
import {
  buildAvatarCertificationSubmitAssets,
  buildTalentPackageFromCharacterPayload,
  getAvatarCertificationPackageStatus,
  getAvatarCertificationSlotStatus,
  getAvatarCertificationSubmitActionState,
  getTalentPackageCertifiedAssets,
} from '../talentPackage';

const AUDIO_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/webm,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.webm,.m4a,.aac,.ogg';
const MAIN_VISUAL_CLICK_DELAY_MS = 220;
const CHARACTER_NODE_THREE_VIEW_MIN_WIDTH = 1240;

const CERTIFICATION_LABELS = {
  unverified: '未认证',
  processing: '认证中',
  verified: '已认证',
  failed: '认证失败',
};

const ASSET_TYPE_LABELS = {
  image: '图片',
  audio: '声音',
  video: '视频',
};

const ASSET_ROLE_LABELS = {
  main_visual: '主视觉',
  three_view: '三视图',
  voice: '声音',
  reference: '参考素材',
  certified_reference: '认证参考',
};

const GENERIC_CHARACTER_NAMES = new Set(['角色', '虚拟角色', '达人', '虚拟达人', '未命名角色']);

const uniqueList = (values = []) => [...new Set((values || []).filter(Boolean))];

const stopInnerInteraction = (event) => {
  event.stopPropagation();
};

const isVoiceInteractionTarget = (target) => Boolean(
  target?.closest?.('.character-voice-slot-wrap, .character-voice-popover, .character-voice-slot, .character-audio-preview')
);

const areListsEqual = (left = [], right = []) => (
  left.length === right.length && left.every((item, index) => item === right[index])
);

const stableStringify = (value) => {
  if (value === undefined) return 'undefined';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`;
};

const normalizeCertification = (value) => {
  const usableAssets = Array.isArray(value?.usableAssets)
    ? value.usableAssets
    : Array.isArray(value?.usable_assets)
      ? value.usable_assets
      : [];
  const failedAssets = Array.isArray(value?.failedAssets)
    ? value.failedAssets
    : Array.isArray(value?.failed_assets)
      ? value.failed_assets
      : [];
  const submittedAssets = Array.isArray(value?.submittedAssets)
    ? value.submittedAssets
    : Array.isArray(value?.submitted_assets)
      ? value.submitted_assets
      : [];
  const status = getAvatarCertificationPackageStatus({
    ...value,
    usableAssets,
    failedAssets,
    submittedAssets,
  });
  return {
    status: ['processing', 'verified', 'failed'].includes(status) ? status : 'unverified',
    taskId: value?.taskId || value?.task_id || '',
    groupId: value?.groupId || value?.group_id || value?.providerGroupId || value?.provider_group_id || '',
    groupName: value?.groupName || value?.group_name || value?.group?.name || '',
    usableAssets,
    failedAssets,
    submittedAssets,
    errorMessage: value?.errorMessage || '',
    updatedAt: value?.updatedAt || '',
  };
};

const buildCharacterPrompt = ({ name, description, images, audioUrl, voiceDescription }) => ([
  name ? `角色名称：${name}` : '',
  description ? `角色描述：${description}` : '',
  images.length > 0 ? `角色参考图：${images.length} 张。生成时必须保持人物五官、发型、服装、年龄感、气质和镜头中的角色身份一致。` : '',
  voiceDescription ? `声音描述：${voiceDescription}` : '',
  audioUrl ? '角色音频：已提供声音参考素材，后续配音或支持音频参考的视频模型应继承其音色、语速、情绪和说话方式。' : '',
]).filter(Boolean).join('\n');

const resolveCharacterName = (data) => {
  const payloadName = String(data?.characterPayload?.characterName || '').trim();
  const dataName = String(data?.characterName || '').trim();
  const labelName = String(data?.label || '').trim();
  if (payloadName) return payloadName;
  if (dataName && !(GENERIC_CHARACTER_NAMES.has(dataName) && labelName && !GENERIC_CHARACTER_NAMES.has(labelName))) {
    return dataName;
  }
  if (labelName && !GENERIC_CHARACTER_NAMES.has(labelName)) return labelName;
  return '未命名角色';
};

const isMeaningfulCharacterName = value => {
  const name = String(value || '').trim();
  return Boolean(name) && !GENERIC_CHARACTER_NAMES.has(name);
};

const getAssetTypeLabel = asset => ASSET_TYPE_LABELS[String(asset?.type || 'image').toLowerCase()] || '素材';
const getAssetRoleLabel = asset => ASSET_ROLE_LABELS[asset?.role] || asset?.role || '素材';

function InlineEditableField({
  className = '',
  label,
  value,
  placeholder,
  multiline = false,
  onCommit,
  onEditingChange,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    if (editing) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setDraft(value || '');
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editing, value]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const confirm = useCallback((event) => {
    event?.stopPropagation?.();
    onCommit?.(draft.trim());
    setEditing(false);
  }, [draft, onCommit]);

  const cancel = useCallback((event) => {
    event?.stopPropagation?.();
    setDraft(value || '');
    setEditing(false);
  }, [value]);

  if (editing) {
    const Control = multiline ? 'textarea' : 'input';
    return (
      <div className={`character-inline-editor ${className}`} onClick={event => event.stopPropagation()}>
        <span>{label}</span>
        <Control
          className="nodrag"
          rows={multiline ? 3 : undefined}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') cancel(event);
            if (!multiline && event.key === 'Enter') confirm(event);
          }}
          autoFocus
          placeholder={placeholder}
        />
        <div className="character-inline-actions">
          <button type="button" onClick={cancel}>取消</button>
          <button type="button" className="primary" onClick={confirm}>确定</button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`character-inline-display nodrag ${className}`}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      title="点击编辑"
    >
      <span>{label}</span>
      <strong className={!value ? 'is-placeholder' : ''}>{value || placeholder}</strong>
    </button>
  );
}

function CharacterNode({ id, data, selected }) {
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const [characterName, setCharacterName] = useState(resolveCharacterName(data));
  const [description, setDescription] = useState(data?.description || '');
  const [voiceDescription, setVoiceDescription] = useState(data?.voiceDescription || '');
  const [mainVisualPrompt, setMainVisualPrompt] = useState(data?.mainVisualPrompt || data?.characterPayload?.mainVisualPrompt || '');
  const [threeViewPrompt, setThreeViewPrompt] = useState(data?.threeViewPrompt || data?.characterPayload?.threeViewPrompt || '');
  const [images, setImages] = useState(uniqueList(data?.images || data?.characterPayload?.images || (data?.imageUrl ? [data.imageUrl] : [])));
  const [mainVisualImageUrl, setMainVisualImageUrl] = useState(data?.mainVisualImageUrl || data?.characterPayload?.mainVisualImageUrl || data?.imageUrl || images[0] || '');
  const [mainVisualPublicImageUrl, setMainVisualPublicImageUrl] = useState(data?.mainVisualPublicImageUrl || data?.characterPayload?.mainVisualPublicImageUrl || data?.publicImageUrl || data?.imageSourceUrl || '');
  const [threeViewImageUrl, setThreeViewImageUrl] = useState(data?.threeViewImageUrl || data?.characterPayload?.threeViewImageUrl || '');
  const [threeViewPublicImageUrl, setThreeViewPublicImageUrl] = useState(data?.threeViewPublicImageUrl || data?.characterPayload?.threeViewPublicImageUrl || '');
  const [audioUrl, setAudioUrl] = useState(data?.audioUrl || data?.characterPayload?.audioUrl || '');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voicePromptDraft, setVoicePromptDraft] = useState(data?.voicePrompt || data?.characterPayload?.voicePrompt || data?.voiceDescription || '');
  const [voiceText, setVoiceText] = useState(data?.voiceText || data?.characterPayload?.voiceText || `你好，我是${data?.characterName || data?.label || '这个角色'}，很高兴认识你。`);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(null);
  const [uploadingAudio, setUploadingAudio] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [activeSlot, setActiveSlot] = useState('');
  const [mainVisualPreview, setMainVisualPreview] = useState({ imageUrl: '', images: [], index: 0 });
  const imageInputRef = useRef(null);
  const imageUploadTargetRef = useRef('mainVisual');
  const audioInputRef = useRef(null);
  const voicePanelRef = useRef(null);
  const mainVisualClickTimerRef = useRef(null);
  const lastPublishedPayloadSignatureRef = useRef('');
  const skipPublishDuringExternalSyncRef = useRef(false);
  const onCharacterChange = data?.onCharacterChange;
  const onCharacterChangeRef = useRef(onCharacterChange);

  useEffect(() => {
    onCharacterChangeRef.current = onCharacterChange;
  }, [onCharacterChange]);

  const avatarCertification = normalizeCertification(data?.avatarCertification || data?.characterPayload?.avatarCertification);
  const certificationStatus = avatarCertification.status;
  const certificationLabel = CERTIFICATION_LABELS[certificationStatus] || CERTIFICATION_LABELS.unverified;
  const primaryAssetUrl = avatarCertification.usableAssets?.[0]?.assetUrl || avatarCertification.usableAssets?.[0]?.asset_url || '';
  const primaryImageUrl = mainVisualImageUrl || images[0] || '';
  const mainVisualCertification = getAvatarCertificationSlotStatus(avatarCertification, {
    type: 'image',
    role: 'main_visual',
    hasSource: Boolean(primaryImageUrl),
  });
  const threeViewCertification = getAvatarCertificationSlotStatus(avatarCertification, {
    type: 'image',
    role: 'three_view',
    hasSource: Boolean(threeViewImageUrl),
  });
  const avatarAssetUrl = data?.avatarAssetUrl || data?.characterPayload?.avatarAssetUrl || '';
  const avatarAssetId = data?.avatarAssetId || data?.characterPayload?.avatarAssetId || '';
  const virtualAvatarAssetUrl = data?.virtualAvatarAssetUrl || data?.characterPayload?.virtualAvatarAssetUrl || avatarAssetUrl;
  const virtualAvatarAssetId = data?.virtualAvatarAssetId || data?.characterPayload?.virtualAvatarAssetId || avatarAssetId;
  const talentPackage = buildTalentPackageFromCharacterPayload({
    ...(data?.characterPayload || {}),
    characterName,
    description,
    voiceDescription,
    mainVisualImageUrl,
    mainVisualPublicImageUrl,
    threeViewImageUrl,
    threeViewPublicImageUrl,
    audioUrl,
    avatarAssetUrl,
    avatarAssetId,
    virtualAvatarAssetUrl,
    virtualAvatarAssetId,
    avatarCertification,
    talentPackage: data?.talentPackage || data?.characterPayload?.talentPackage || null,
  }, { id, data });
  const providerGroupId = talentPackage.providerGroupId || avatarCertification.groupId || '';
  const pendingCertificationAssets = buildAvatarCertificationSubmitAssets([
    { url: mainVisualPublicImageUrl, type: 'image', role: 'main_visual' },
    { url: primaryImageUrl, type: 'image', role: 'main_visual' },
    { url: threeViewPublicImageUrl, type: 'image', role: 'three_view' },
    { url: threeViewImageUrl, type: 'image', role: 'three_view' },
    ...(talentPackage.assets || [])
      .map(asset => ({
        url: asset.sourceUrl || asset.publicUrl || asset.localUrl,
        name: asset.name,
        type: asset.type || 'image',
        role: asset.role || 'reference',
      })),
  ], { avatarCertification });
  const certificationActionState = getAvatarCertificationSubmitActionState({
    slotStatuses: [
      mainVisualCertification,
      threeViewCertification,
    ],
    submitAssets: pendingCertificationAssets,
    hasPrimaryImage: Boolean(primaryImageUrl),
    groupId: providerGroupId,
  });
  const certifiedPackageAssets = getTalentPackageCertifiedAssets(talentPackage);
  const submittedAssetCount = avatarCertification.submittedAssets.length;
  const failedAssetCount = avatarCertification.failedAssets.length;
  const imageGenerationTask = data?.imageGenerationTask || data?.characterPayload?.imageGenerationTask || null;
  const imageGenerationTarget = data?.imageGenerationTarget
    || data?.characterPayload?.imageGenerationTarget
    || data?.characterImageGeneratorConfig?.characterImageTarget
    || data?.characterPayload?.characterImageGeneratorConfig?.characterImageTarget
    || 'mainVisual';
  const dataImagesSignature = stableStringify(data?.images || []);
  const characterPayloadImagesSignature = stableStringify(data?.characterPayload?.images || []);
  const imageGenerationStatus = imageGenerationTask?.status || '';
  const isMainVisualGenerating = ['running', 'saving'].includes(imageGenerationStatus)
    && imageGenerationTarget !== 'threeView';
  const isThreeViewGenerating = ['running', 'saving'].includes(imageGenerationStatus)
    && imageGenerationTarget === 'threeView';
  const isMainVisualBusy = isMainVisualGenerating || uploadingImage?.target === 'mainVisual';
  const isThreeViewBusy = isThreeViewGenerating || uploadingImage?.target === 'threeView';
  const mainVisualStatusText = imageGenerationStatus === 'saving' ? '正在保存主视觉...' : '正在生成主视觉...';
  const threeViewStatusText = imageGenerationStatus === 'saving' ? '正在保存三视图...' : '正在生成三视图...';
  const canOpenThreeViewGenerator = Boolean(primaryImageUrl);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      skipPublishDuringExternalSyncRef.current = true;
      setCharacterName(resolveCharacterName(data));
      setDescription(data?.characterPayload?.description || data?.description || '');
      setVoiceDescription(data?.characterPayload?.voiceDescription || data?.voiceDescription || '');
      setMainVisualPrompt(data?.characterPayload?.mainVisualPrompt || data?.mainVisualPrompt || '');
      setThreeViewPrompt(data?.characterPayload?.threeViewPrompt || data?.threeViewPrompt || '');
      setAudioUrl(data?.characterPayload?.audioUrl || data?.audioUrl || '');
      setVoicePromptDraft(data?.characterPayload?.voicePrompt || data?.voicePrompt || data?.voiceDescription || '');
      setVoiceText(data?.characterPayload?.voiceText || data?.voiceText || `你好，我是${data?.characterPayload?.characterName || data?.characterName || '这个角色'}，很高兴认识你。`);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    data,
    data?.audioUrl,
    data?.characterName,
    data?.label,
    data?.characterPayload?.audioUrl,
    data?.characterPayload?.characterName,
    data?.characterPayload?.description,
    data?.characterPayload?.mainVisualPrompt,
    data?.characterPayload?.threeViewPrompt,
    data?.characterPayload?.voiceDescription,
    data?.characterPayload?.voicePrompt,
    data?.characterPayload?.voiceText,
    data?.description,
    data?.mainVisualPrompt,
    data?.threeViewPrompt,
    data?.voiceDescription,
    data?.voicePrompt,
    data?.voiceText,
  ]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      skipPublishDuringExternalSyncRef.current = true;
      const nextImages = uniqueList(data?.images || data?.characterPayload?.images || (data?.imageUrl ? [data.imageUrl] : []));
      setImages(current => (areListsEqual(current, nextImages) ? current : nextImages));
      const nextMainVisual = data?.characterPayload?.mainVisualImageUrl || data?.mainVisualImageUrl || data?.characterPayload?.imageUrl || data?.imageUrl || nextImages[0] || '';
      const nextMainPublic = data?.characterPayload?.mainVisualPublicImageUrl || data?.mainVisualPublicImageUrl || data?.characterPayload?.publicImageUrl || data?.publicImageUrl || data?.imageSourceUrl || '';
      const nextThreeView = data?.characterPayload?.threeViewImageUrl || data?.threeViewImageUrl || '';
      const nextThreePublic = data?.characterPayload?.threeViewPublicImageUrl || data?.threeViewPublicImageUrl || '';
      setMainVisualImageUrl(current => (current === nextMainVisual ? current : nextMainVisual));
      setMainVisualPublicImageUrl(current => (current === nextMainPublic ? current : nextMainPublic));
      setThreeViewImageUrl(current => (current === nextThreeView ? current : nextThreeView));
      setThreeViewPublicImageUrl(current => (current === nextThreePublic ? current : nextThreePublic));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    data?.characterPayload?.images,
    data?.characterPayload?.imageUrl,
    characterPayloadImagesSignature,
    data?.characterPayload?.mainVisualImageUrl,
    data?.characterPayload?.mainVisualPublicImageUrl,
    data?.characterPayload?.publicImageUrl,
    data?.characterPayload?.threeViewImageUrl,
    data?.characterPayload?.threeViewPublicImageUrl,
    data?.imageSourceUrl,
    data?.imageUrl,
    data?.images,
    dataImagesSignature,
    data?.mainVisualImageUrl,
    data?.mainVisualPublicImageUrl,
    data?.publicImageUrl,
    data?.threeViewImageUrl,
    data?.threeViewPublicImageUrl,
  ]);

  useEffect(() => {
    if (!voicePanelOpen) return undefined;
    const handlePointerDown = (event) => {
      if (voicePanelRef.current?.contains(event.target)) return;
      setVoicePanelOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [voicePanelOpen]);

  useEffect(() => () => {
    if (mainVisualClickTimerRef.current) {
      window.clearTimeout(mainVisualClickTimerRef.current);
      mainVisualClickTimerRef.current = null;
    }
  }, []);

  const avatarCertificationPayload = data?.avatarCertification || data?.characterPayload?.avatarCertification || null;
  const characterProfileGeneratorPayload = data?.characterProfileGeneratorConfig || data?.characterPayload?.characterProfileGeneratorConfig || null;
  const characterMainVisualGeneratorPayload = data?.characterMainVisualGeneratorConfig || data?.characterPayload?.characterMainVisualGeneratorConfig || null;
  const characterThreeViewGeneratorPayload = data?.characterThreeViewGeneratorConfig || data?.characterPayload?.characterThreeViewGeneratorConfig || null;
  const characterImageGeneratorPayload = data?.characterImageGeneratorConfig || data?.characterPayload?.characterImageGeneratorConfig || null;
  const imageGenerationTaskPayload = data?.imageGenerationTask || data?.characterPayload?.imageGenerationTask || null;
  const imageGenerationErrorPayload = data?.imageGenerationError || data?.characterPayload?.imageGenerationError || '';
  const imageTaskIdsPayload = useMemo(() => (
    data?.imageTaskIds || data?.characterPayload?.imageTaskIds || []
  ), [data?.characterPayload?.imageTaskIds, data?.imageTaskIds]);
  const imageGenerationTargetPayload = data?.imageGenerationTarget || data?.characterPayload?.imageGenerationTarget || data?.characterImageGeneratorConfig?.characterImageTarget || 'mainVisual';
  const avatarCertificationSignature = stableStringify(avatarCertificationPayload);
  const characterProfileGeneratorSignature = stableStringify(characterProfileGeneratorPayload);
  const characterMainVisualGeneratorSignature = stableStringify(characterMainVisualGeneratorPayload);
  const characterThreeViewGeneratorSignature = stableStringify(characterThreeViewGeneratorPayload);
  const characterImageGeneratorSignature = stableStringify(characterImageGeneratorPayload);
  const imageGenerationTaskSignature = stableStringify(imageGenerationTaskPayload);
  const imageTaskIdsSignature = stableStringify(imageTaskIdsPayload);

  useEffect(() => {
    const normalizedImages = primaryImageUrl ? [primaryImageUrl] : [];
    const hasMeaningfulContent = Boolean(
      isMeaningfulCharacterName(characterName)
      || description.trim()
      || voiceDescription.trim()
      || mainVisualPrompt.trim()
      || threeViewPrompt.trim()
      || normalizedImages.length > 0
      || threeViewImageUrl
      || audioUrl
      || avatarAssetUrl
      || avatarAssetId
      || virtualAvatarAssetUrl
      || virtualAvatarAssetId
      || avatarCertificationPayload
      || characterProfileGeneratorPayload
      || characterMainVisualGeneratorPayload
      || characterThreeViewGeneratorPayload
      || characterImageGeneratorPayload
      || imageGenerationTaskPayload
      || imageGenerationErrorPayload
      || imageTaskIdsPayload.length > 0
    );
    const payload = {
      characterName,
      description,
      voiceDescription,
      mainVisualPrompt,
      threeViewPrompt,
      mainVisualImageUrl: primaryImageUrl,
      mainVisualPublicImageUrl,
      threeViewImageUrl,
      threeViewPublicImageUrl,
      images: normalizedImages,
      imageUrl: primaryImageUrl,
      publicImageUrl: mainVisualPublicImageUrl,
      imageSourceUrl: mainVisualPublicImageUrl,
      audioUrl,
      voicePrompt: voicePromptDraft,
      voiceText,
      avatarAssetUrl,
      avatarAssetId,
      virtualAvatarAssetUrl,
      virtualAvatarAssetId,
      avatarCertification: avatarCertificationPayload,
      characterProfileGeneratorConfig: characterProfileGeneratorPayload,
      characterMainVisualGeneratorConfig: characterMainVisualGeneratorPayload,
      characterThreeViewGeneratorConfig: characterThreeViewGeneratorPayload,
      characterImageGeneratorConfig: characterImageGeneratorPayload,
      imageGenerationTask: imageGenerationTaskPayload,
      imageGenerationError: imageGenerationErrorPayload,
      imageTaskIds: imageTaskIdsPayload,
      imageGenerationTarget: imageGenerationTargetPayload,
      characterPrompt: buildCharacterPrompt({
        name: characterName,
        description,
        images: normalizedImages,
        audioUrl,
        voiceDescription,
      }),
    };
    const nextPayload = hasMeaningfulContent ? payload : null;
    const nextSignature = stableStringify(nextPayload || null);
    if (skipPublishDuringExternalSyncRef.current) {
      skipPublishDuringExternalSyncRef.current = false;
      lastPublishedPayloadSignatureRef.current = nextSignature;
      return;
    }
    if (lastPublishedPayloadSignatureRef.current === nextSignature) return;
    lastPublishedPayloadSignatureRef.current = nextSignature;
    onCharacterChangeRef.current?.(id, nextPayload);
  }, [
    audioUrl,
    avatarAssetId,
    avatarAssetUrl,
    avatarCertificationPayload,
    avatarCertificationSignature,
    characterName,
    characterImageGeneratorPayload,
    characterImageGeneratorSignature,
    characterMainVisualGeneratorPayload,
    characterMainVisualGeneratorSignature,
    characterProfileGeneratorPayload,
    characterProfileGeneratorSignature,
    characterThreeViewGeneratorPayload,
    characterThreeViewGeneratorSignature,
    description,
    id,
    imageGenerationErrorPayload,
    imageGenerationTargetPayload,
    imageGenerationTaskPayload,
    imageGenerationTaskSignature,
    imageTaskIdsPayload,
    imageTaskIdsSignature,
    mainVisualPrompt,
    mainVisualPublicImageUrl,
    primaryImageUrl,
    threeViewImageUrl,
    threeViewPrompt,
    threeViewPublicImageUrl,
    virtualAvatarAssetId,
    virtualAvatarAssetUrl,
    voiceDescription,
    voicePromptDraft,
    voiceText,
  ]);

  const openProfileGenerator = useCallback((event) => {
    event?.stopPropagation?.();
    if (isVoiceInteractionTarget(event?.target)) return;
    setActiveSlot('profile');
    setUploadError('');
    const result = data?.onOpenCharacterProfileGenerator?.(id);
    if (!result?.ok) setUploadError(result?.reason || '角色设定生成器打开失败');
  }, [data, id]);

  const openMainVisualUploadPicker = useCallback((event, target = 'mainVisual') => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const nextTarget = target === 'threeView' ? 'threeView' : 'mainVisual';
    setActiveSlot(nextTarget);
    if ((nextTarget === 'threeView' ? isThreeViewBusy : isMainVisualBusy)) return;
    if (nextTarget === 'threeView' && !primaryImageUrl) {
      setUploadError('请先生成主角色视觉图，再上传三视图');
      return;
    }
    imageUploadTargetRef.current = nextTarget;
    setUploadError('');
    imageInputRef.current?.click();
  }, [isMainVisualBusy, isThreeViewBusy, primaryImageUrl]);

  const handleMainVisualUploadChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const target = imageUploadTargetRef.current === 'threeView' ? 'threeView' : 'mainVisual';
    if (target === 'threeView' ? isThreeViewBusy : isMainVisualBusy) return;
    const file = files.find(isSupportedImageFile);
    if (!file) {
      setUploadError(getUnsupportedImageMessage(files.length || 1));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUploadingImage({ target, previewUrl, progress: 0, error: '' });
    setUploadError('');
    try {
      const asset = await uploadImageFile(file, progress => {
        setUploadingImage(current => current ? { ...current, progress } : current);
      });
      if (!asset?.url) throw new Error('图片上传成功但未返回图片地址');
      const result = data?.onCharacterMainVisualUpload?.(id, {
        target,
        imageUrl: asset.url,
        publicImageUrl: asset.publicUrl || asset.url,
      });
      if (result && !result.ok) throw new Error(result.reason || (target === 'threeView' ? '三视图上传失败' : '主视觉上传失败'));
      if (!data?.onCharacterMainVisualUpload) {
        if (target === 'threeView') {
          setThreeViewImageUrl(asset.url);
          setThreeViewPublicImageUrl(asset.url);
        } else {
          setImages(prev => uniqueList([asset.url, ...prev]));
          setMainVisualImageUrl(asset.url);
          setMainVisualPublicImageUrl(asset.url);
        }
      }
    } catch (error) {
      setUploadError(error?.message || (target === 'threeView' ? '三视图上传失败，请重试' : '主视觉上传失败，请重试'));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingImage(null);
    }
  }, [data, id, isMainVisualBusy, isThreeViewBusy]);

  const uploadAudio = useCallback((files) => {
    const file = Array.from(files || []).find(item => item.type.startsWith('audio/') || /\.(mp3|wav|webm|m4a|aac|ogg)$/i.test(item.name || ''));
    if (!file) {
      setUploadError('请选择 MP3、WAV、WebM、M4A、AAC 或 OGG 音频');
      return;
    }
    setUploadError('');
    setActiveSlot('voice');
    setUploadingAudio({ name: file.name || '声音参考', progress: 0, error: '' });
    uploadAudioFile(file, progress => {
      setUploadingAudio(current => current ? { ...current, progress } : current);
    }).then((asset) => {
      setAudioUrl(asset.url);
      setVoicePanelOpen(false);
      setUploadingAudio(null);
    }).catch((error) => {
      setUploadingAudio(current => current ? { ...current, error: error.message || '上传失败' } : current);
      window.setTimeout(() => setUploadingAudio(null), 1800);
    });
  }, []);

  const openImageGenerator = useCallback((event, target = 'mainVisual') => {
    event?.stopPropagation?.();
    if (!data?.onOpenCharacterImageGenerator) return;
    if (target === 'threeView' && !primaryImageUrl) {
      setUploadError('请先生成主角色视觉图，再生成三视图');
      return;
    }
    setActiveSlot(target === 'threeView' ? 'threeView' : 'mainVisual');
    setUploadError('');
    const result = data.onOpenCharacterImageGenerator(id, {
      target,
      characterName,
      description,
      voiceDescription,
      mainVisualPrompt,
      threeViewPrompt,
      imageUrl: primaryImageUrl,
      publicImageUrl: mainVisualPublicImageUrl || primaryImageUrl,
      mainVisualImageUrl: primaryImageUrl,
      mainVisualPublicImageUrl,
      threeViewImageUrl,
      threeViewPublicImageUrl,
    });
    if (!result?.ok) setUploadError(result?.reason || '角色图生成器打开失败');
  }, [characterName, data, description, id, mainVisualPrompt, mainVisualPublicImageUrl, primaryImageUrl, threeViewImageUrl, threeViewPrompt, threeViewPublicImageUrl, voiceDescription]);

  const clearMainVisualClickTimer = useCallback(() => {
    if (!mainVisualClickTimerRef.current) return;
    window.clearTimeout(mainVisualClickTimerRef.current);
    mainVisualClickTimerRef.current = null;
  }, []);

  const isMainVisualPreviewExcludedTarget = useCallback((target) => (
    target?.closest?.('.image-action-toolbar, .image-action-layer, .character-visual-generation-status, .character-visual-upload-status, .result-image-upload-status')
  ), []);

  const openMainVisualGeneratorAfterClick = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    clearMainVisualClickTimer();
    mainVisualClickTimerRef.current = window.setTimeout(() => {
      mainVisualClickTimerRef.current = null;
      openImageGenerator(null, 'mainVisual');
    }, MAIN_VISUAL_CLICK_DELAY_MS);
  }, [clearMainVisualClickTimer, openImageGenerator]);

  const openMainVisualPreview = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    clearMainVisualClickTimer();
    if (isMainVisualPreviewExcludedTarget(event?.target)) return;
    if (!primaryImageUrl) {
      openImageGenerator(null, 'mainVisual');
      return;
    }
    setMainVisualPreview({
      imageUrl: primaryImageUrl,
      images: [primaryImageUrl],
      index: 0,
    });
  }, [clearMainVisualClickTimer, isMainVisualPreviewExcludedTarget, openImageGenerator, primaryImageUrl]);

  const handleMainVisualAction = useCallback((action, payload) => {
    data?.onImageAction?.(action, payload);
  }, [data]);

  const handleThreeViewAction = useCallback((action, payload) => {
    data?.onImageAction?.(action, payload);
  }, [data]);

  const submitCertification = async (event) => {
    event?.stopPropagation?.();
    if (!primaryImageUrl || !data?.onSubmitAvatarCertification) return;
    setUploadError('');
    const result = await data.onSubmitAvatarCertification(id, {
      characterName,
      imageUrl: primaryImageUrl,
      publicImageUrl: mainVisualPublicImageUrl || primaryImageUrl,
      avatarCertification,
    });
    if (!result?.ok) setUploadError(result?.reason || '提交认证失败');
  };

  const toggleVoicePanel = useCallback((event) => {
    event?.stopPropagation?.();
    setActiveSlot('voice');
    setUploadError('');
    setVoicePromptDraft(current => current || voiceDescription || '');
    setVoicePanelOpen(open => !open);
  }, [voiceDescription]);

  const generateVoice = useCallback(async (event) => {
    event?.stopPropagation?.();
    if (!data?.onGenerateCharacterVoice) {
      setUploadError('当前角色节点还不能生成声音');
      return;
    }
    if (!voicePromptDraft.trim() && !voiceDescription.trim()) {
      setUploadError('请输入声音描述');
      return;
    }
    if (!voiceText.trim()) {
      setUploadError('请输入用于试听的文本');
      return;
    }
    if (voiceText.trim().length > 500) {
      setUploadError('试听文本不能超过 500 个字符');
      return;
    }
    setGeneratingVoice(true);
    setUploadError('');
    const result = await data.onGenerateCharacterVoice(id, {
      text: voiceText.trim(),
      style: voicePromptDraft.trim() || voiceDescription.trim(),
    });
    setGeneratingVoice(false);
    if (!result?.ok) {
      setUploadError(result?.reason || '声音生成失败');
      return;
    }
    if (result.audioUrl) {
      setAudioUrl(result.audioUrl);
      setVoicePanelOpen(false);
    }
  }, [data, id, voiceDescription, voicePromptDraft, voiceText]);

  const openVoiceUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    setActiveSlot('voice');
    setUploadError('');
    audioInputRef.current?.click();
  }, []);

  const renderSlotCertificationBadge = (slotCertification) => {
    if (!slotCertification || slotCertification.status === 'none') return null;
    const title = slotCertification.title || slotCertification.assetUrl || slotCertification.assetId || slotCertification.label;
    return (
      <span
        className={`character-slot-certification-badge character-slot-certification-${slotCertification.status} nodrag nopan`}
        title={title}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        {slotCertification.label}
      </span>
    );
  };

  const renderMainVisualCard = () => {
    const displayImageUrl = uploadingImage?.target === 'mainVisual' ? uploadingImage.previewUrl : primaryImageUrl;
    return (
      <div
        role="button"
        tabIndex={0}
        className={`character-visual-card character-main-visual-card nodrag ${displayImageUrl ? 'has-image' : ''} ${isMainVisualGenerating ? 'is-generating' : ''}`}
        onClick={openMainVisualGeneratorAfterClick}
        onDoubleClick={openMainVisualPreview}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') openImageGenerator(event, 'mainVisual');
        }}
        title={!primaryImageUrl ? '生成主视觉' : undefined}
      >
        {displayImageUrl ? (
          <>
            <img src={displayImageUrl} alt="主视觉" loading="lazy" decoding="async" />
            <span className="character-visual-badge">主视觉</span>
            {renderSlotCertificationBadge(mainVisualCertification)}
          </>
        ) : (
          <div className="character-visual-placeholder">
            <Icon name="imageGen" size={28} />
            <strong>主视觉</strong>
            <span>点击生成主角色视觉图</span>
          </div>
        )}
        <ImageActionOverlay
          imageUrl={primaryImageUrl}
          nodeId={id}
          sourceType="characterMainVisual"
          onAction={handleMainVisualAction}
          onUpload={isMainVisualBusy ? undefined : openMainVisualUploadPicker}
          apiConfigs={data?.apiConfigs}
          apiProviders={data?.apiProviders}
          allowedActions={['upload']}
          suppressToolbar={isMultiSelected}
        />
        {isMainVisualGenerating && (
          <div className="character-visual-generation-status">
            <Icon name="refresh" size={18} />
            <strong>{mainVisualStatusText}</strong>
            <span>任务完成后会自动回显</span>
          </div>
        )}
        {uploadingImage?.target === 'mainVisual' && (
          <div className="result-image-upload-status character-visual-upload-status nodrag nopan">
            <span>{uploadingImage.error || `正在上传 ${uploadingImage.progress}%`}</span>
            <span className="result-image-upload-progress-track">
              <span style={{ width: `${Math.max(0, Math.min(uploadingImage.progress || 0, 100))}%` }} />
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderThreeViewCard = () => {
    const displayImageUrl = uploadingImage?.target === 'threeView' ? uploadingImage.previewUrl : threeViewImageUrl;
    const handleOpenThreeViewGenerator = (event) => {
      event?.stopPropagation?.();
      event?.preventDefault?.();
      if (!canOpenThreeViewGenerator) {
        setUploadError('请先生成主角色视觉图，再生成三视图');
        return;
      }
      openImageGenerator(event, 'threeView');
    };
    return (
      <div
        role="button"
        tabIndex={0}
        aria-disabled={!canOpenThreeViewGenerator}
        className={`character-visual-card character-three-view-card nodrag ${displayImageUrl ? 'has-image' : ''} ${isThreeViewGenerating ? 'is-generating' : ''} ${canOpenThreeViewGenerator ? '' : 'is-disabled'}`}
        onClick={handleOpenThreeViewGenerator}
        onDoubleClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (!canOpenThreeViewGenerator) {
            setUploadError('请先生成主角色视觉图，再生成三视图');
            return;
          }
          if (!threeViewImageUrl) {
            openImageGenerator(null, 'threeView');
            return;
          }
          setMainVisualPreview({
            imageUrl: threeViewImageUrl,
            images: [threeViewImageUrl],
            index: 0,
          });
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') handleOpenThreeViewGenerator(event);
        }}
        title={!canOpenThreeViewGenerator ? '请先生成主视觉' : threeViewImageUrl ? '打开三视图生成器' : '生成三视图'}
      >
        {displayImageUrl ? (
          <>
            <img src={displayImageUrl} alt="三视图" loading="lazy" decoding="async" />
            <span className="character-visual-badge">三视图</span>
            {renderSlotCertificationBadge(threeViewCertification)}
          </>
        ) : (
          <div className="character-visual-placeholder">
            <Icon name="grid" size={28} />
            <strong>三视图</strong>
            <span>{canOpenThreeViewGenerator ? '点击生成角色三视图' : '先生成主视觉'}</span>
          </div>
        )}
        <ImageActionOverlay
          imageUrl={threeViewImageUrl}
          nodeId={id}
          sourceType="characterThreeView"
          onAction={handleThreeViewAction}
          onUpload={canOpenThreeViewGenerator && !isThreeViewBusy ? event => openMainVisualUploadPicker(event, 'threeView') : undefined}
          apiConfigs={data?.apiConfigs}
          apiProviders={data?.apiProviders}
          allowedActions={canOpenThreeViewGenerator ? ['upload'] : []}
          suppressToolbar={isMultiSelected}
        />
        {isThreeViewGenerating && (
          <div className="character-visual-generation-status">
            <Icon name="refresh" size={18} />
            <strong>{threeViewStatusText}</strong>
            <span>任务完成后会自动回显</span>
          </div>
        )}
        {uploadingImage?.target === 'threeView' && (
          <div className="result-image-upload-status character-visual-upload-status nodrag nopan">
            <span>{uploadingImage.error || `正在上传 ${uploadingImage.progress}%`}</span>
            <span className="result-image-upload-progress-track">
              <span style={{ width: `${Math.max(0, Math.min(uploadingImage.progress || 0, 100))}%` }} />
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderVoiceCard = () => (
    <div
      className="character-voice-slot-wrap nodrag nopan"
      ref={voicePanelRef}
      onPointerDownCapture={stopInnerInteraction}
      onMouseDownCapture={stopInnerInteraction}
      onPointerDown={stopInnerInteraction}
      onMouseDown={stopInnerInteraction}
      onClick={stopInnerInteraction}
      onDoubleClick={stopInnerInteraction}
    >
      <div
        role="button"
        tabIndex={0}
        className={`character-voice-slot ${audioUrl ? 'has-audio' : ''} ${voicePanelOpen ? 'active' : ''} ${uploadingAudio ? 'is-uploading' : ''}`}
        onClick={toggleVoicePanel}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') toggleVoicePanel(event);
        }}
        title={audioUrl ? '打开声音生成器' : '生成声音'}
      >
        <div className="character-voice-toolbar">
          <button type="button" onClick={openVoiceUploadPicker}>
            <Icon name="upload" size={14} />
            <span>{audioUrl ? '替换声音' : '上传声音'}</span>
          </button>
        </div>
        {audioUrl ? (
          <div className="character-voice-player">
            <div className="character-voice-player-title">
              <Icon name="volume" size={16} />
              <div>
                <strong>声音</strong>
                <span>普通声音参考</span>
              </div>
            </div>
            <audio
              className="character-audio-preview nodrag"
              controls
              src={audioUrl}
              onClick={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
            />
          </div>
        ) : (
          <div className="character-voice-placeholder">
            <Icon name="volume" size={22} />
            <strong>声音</strong>
            <span>点击生成角色声音，或上传本地音频</span>
          </div>
        )}
        {uploadingAudio && (
          <div className="character-voice-upload-status">
            <span>{uploadingAudio.error || `正在上传 ${uploadingAudio.progress}%`}</span>
            <span className="result-image-upload-progress-track">
              <span style={{ width: `${Math.max(0, Math.min(uploadingAudio.progress || 0, 100))}%` }} />
            </span>
          </div>
        )}
      </div>
      {voicePanelOpen && (
        <div
          className="character-voice-popover nodrag nopan"
          onPointerDownCapture={stopInnerInteraction}
          onMouseDownCapture={stopInnerInteraction}
          onPointerDown={stopInnerInteraction}
          onMouseDown={stopInnerInteraction}
          onClick={stopInnerInteraction}
          onDoubleClick={stopInnerInteraction}
        >
          <div className="character-voice-popover-head">
            <div>
              <strong>音色设计</strong>
              <span>根据声音描述生成试听音频</span>
            </div>
            <button type="button" onClick={() => setVoicePanelOpen(false)} aria-label="关闭声音生成器">
              <Icon name="x" size={14} />
            </button>
          </div>
          <label className="character-field">
            <span>音色描述</span>
            <textarea rows={3} value={voicePromptDraft} onChange={event => setVoicePromptDraft(event.target.value)} placeholder="由角色设定生成器产出的声音描述，可继续编辑。" />
          </label>
          <label className="character-field">
            <span>试听文本</span>
            <textarea rows={3} value={voiceText} onChange={event => setVoiceText(event.target.value)} placeholder="输入用于生成这段声音的文本。" />
          </label>
          <div className="character-voice-actions">
            <button type="button" onClick={openVoiceUploadPicker}>
              <Icon name="upload" size={15} />
              <span>{audioUrl ? '替换本地音频' : '上传本地音频'}</span>
            </button>
            <button type="button" className="primary" disabled={generatingVoice} onClick={generateVoice}>
              <Icon name={generatingVoice ? 'refresh' : 'play'} size={15} />
              <span>{generatingVoice ? '生成中' : audioUrl ? '重新生成' : '生成声音'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`custom-node canvas-character-node has-three-view-slot ${selected ? 'selected' : ''} ${activeSlot && activeSlot !== 'profile' ? 'inner-slot-active' : ''}`}
      style={{ minWidth: `${CHARACTER_NODE_THREE_VIEW_MIN_WIDTH}px` }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <div className="node-header" onClick={event => event.stopPropagation()}>
        <span className="node-title character-node-fixed-title">
          <Icon name="user" size={16} />
          <span className="node-title-text">角色</span>
        </span>
      </div>

      <div
        className="character-card"
        role="button"
        tabIndex={0}
        onClick={openProfileGenerator}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') openProfileGenerator(event);
        }}
      >
        <div className="character-copy-panel">
          <div className="character-heading-row">
            <span className={`character-status-pill character-status-${certificationStatus}`}>{certificationLabel}</span>
          </div>

          <InlineEditableField
            className="character-name-field"
            label="名称"
            value={characterName}
            placeholder="未命名角色"
            onEditingChange={setIsInlineEditing}
            onCommit={(nextValue) => {
              setCharacterName(nextValue || '未命名角色');
            }}
          />
          <InlineEditableField
            className="character-description-field"
            label="角色描述"
            value={description}
            placeholder="点击填写角色身份、外貌、气质、服装和行为特点"
            multiline
            onEditingChange={setIsInlineEditing}
            onCommit={setDescription}
          />
          <InlineEditableField
            className="character-voice-field"
            label="声音描述"
            value={voiceDescription}
            placeholder="点击填写音色、语速、情绪、口音和说话方式"
            multiline
            onEditingChange={setIsInlineEditing}
            onCommit={(nextValue) => {
              setVoiceDescription(nextValue);
              setVoicePromptDraft(current => current || nextValue);
            }}
          />

          <div className={`character-certification character-certification-${certificationStatus}`}>
            <div>
              <span className="character-certification-label">{certificationLabel}</span>
              {primaryAssetUrl ? (
                <code title={primaryAssetUrl}>{primaryAssetUrl}</code>
              ) : avatarCertification.taskId ? (
                <small>任务 {avatarCertification.taskId.slice(-8)}</small>
              ) : (
                <small>{primaryImageUrl ? (mainVisualPublicImageUrl ? '将使用公网主视觉提交' : '提交时会转为公网图') : '需先生成主视觉'}</small>
              )}
              {avatarCertification.errorMessage && <small>{avatarCertification.errorMessage}</small>}
            </div>
          </div>

          <div className="character-package-summary">
            <div className="character-package-summary-head">
              <span>角色资料包</span>
              <strong>{providerGroupId ? '已关联 Group' : '待创建 Group'}</strong>
            </div>
            <div className="character-package-meta">
              <span title={providerGroupId || '提交认证后由接口返回 Group ID'}>
                Group：{providerGroupId ? providerGroupId.slice(-10) : '待生成'}
              </span>
              <span>认证 Asset：{certifiedPackageAssets.length}</span>
              <span>提交素材：{submittedAssetCount}</span>
              {failedAssetCount > 0 && <span className="is-danger">失败素材：{failedAssetCount}</span>}
            </div>
            {certifiedPackageAssets.length > 0 && (
              <div className="character-package-assets">
                {certifiedPackageAssets.slice(0, 4).map((asset, index) => (
                  <span key={`${asset.assetUrl || asset.assetId || index}_${asset.role || 'asset'}`} title={asset.assetUrl}>
                    {getAssetRoleLabel(asset)} · {getAssetTypeLabel(asset)}
                  </span>
                ))}
                {certifiedPackageAssets.length > 4 && (
                  <span>+{certifiedPackageAssets.length - 4}</span>
                )}
              </div>
            )}
          </div>

          <div className="character-actions">
            <button
              type="button"
              className="character-asset-btn primary nodrag"
              disabled={certificationActionState.disabled}
              onClick={submitCertification}
            >
              <Icon name="check" size={16} />
              <span>{certificationActionState.label}</span>
            </button>
          </div>
        </div>

        <div className="character-visual-panel">
          <div className="character-main-visual-stack">
            {renderMainVisualCard()}
            {renderVoiceCard()}
          </div>
          {renderThreeViewCard()}
        </div>

        {uploadError && <div className="upload-format-error character-node-error">{uploadError}</div>}

        <input
          ref={imageInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          onChange={handleMainVisualUploadChange}
          style={{ display: 'none' }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(event) => {
            uploadAudio(event.target.files);
            event.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar
        hidden={data?.isNodeDragging || isMultiSelected || selected || isInlineEditing}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        onDelete={() => data?.onDeleteNode?.(id)}
      />
      <ImagePreviewOverlay
        imageUrl={mainVisualPreview.imageUrl}
        images={mainVisualPreview.images}
        initialIndex={mainVisualPreview.index}
        alt="主视觉大图预览"
        nodeId={id}
        sourceType="characterMainVisual"
        apiConfigs={data?.apiConfigs}
        apiProviders={data?.apiProviders}
        onAction={data?.onImageAction}
        onClose={() => setMainVisualPreview({ imageUrl: '', images: [], index: 0 })}
      />
    </div>
  );
}

export default memo(CharacterNode);
