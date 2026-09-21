const GENERIC_CHARACTER_NAMES = new Set(['角色', '虚拟角色', '达人', '虚拟达人', '未命名角色']);
export const AVATAR_CERTIFICATION_REQUIRED_ASSETS = Object.freeze([
  { type: 'image', role: 'main_visual' },
  { type: 'image', role: 'three_view' },
]);

const AVATAR_CERTIFICATION_REQUIRED_KEYS = new Set(
  AVATAR_CERTIFICATION_REQUIRED_ASSETS.map(asset => `${asset.type}:${asset.role}`),
);
const FAILED_AVATAR_ASSET_STATUSES = new Set(['failed', 'failure', 'rejected', 'error', 'errored']);
const PASSING_AVATAR_ASSET_STATUSES = new Set(['active', 'success', 'succeeded', 'completed', 'verified', 'approved']);

export const isAvatarAssetUrl = value => String(value || '').trim().startsWith('asset://');

export const getAvatarAssetKey = (assetUrl = '', assetId = '') => (
  assetUrl || (assetId ? `asset://${assetId}` : '')
);

const normalizeAvatarAssetType = type => String(type || 'image').toLowerCase();
const normalizeAvatarAssetRole = role => String(role || '').trim();
const getAvatarCertificationRoleKey = asset => (
  `${normalizeAvatarAssetType(asset?.type || asset?.assetType || asset?.asset_type)}:${normalizeAvatarAssetRole(asset?.role || asset?.assetRole || asset?.asset_role)}`
);
const isRequiredAvatarCertificationAsset = asset => (
  AVATAR_CERTIFICATION_REQUIRED_KEYS.has(getAvatarCertificationRoleKey(asset))
);
const normalizeAvatarAssetStatus = status => String(status || '').trim().toLowerCase();

export const isFailedAvatarAssetStatus = status => FAILED_AVATAR_ASSET_STATUSES.has(normalizeAvatarAssetStatus(status));

export const isPassingAvatarAssetStatus = status => {
  const normalized = normalizeAvatarAssetStatus(status);
  return !normalized || PASSING_AVATAR_ASSET_STATUSES.has(normalized);
};

const isUsableAvatarAsset = asset => (
  isAvatarAssetUrl(asset?.assetUrl || asset?.asset_url || asset?.url || '')
  && isPassingAvatarAssetStatus(asset?.status)
);

export const hasRequiredAvatarCertificationAssets = (assets = []) => {
  const keys = new Set(
    (Array.isArray(assets) ? assets : [])
      .map(normalizeAvatarAsset)
      .filter(isUsableAvatarAsset)
      .map(getAvatarCertificationRoleKey),
  );
  return AVATAR_CERTIFICATION_REQUIRED_ASSETS.every(asset => (
    keys.has(`${asset.type}:${asset.role}`)
  ));
};

export const normalizeAvatarAsset = (asset = {}) => ({
  assetId: asset.assetId || asset.asset_id || asset.id || '',
  assetUrl: asset.assetUrl || asset.asset_url || asset.url || '',
  status: asset.status || '',
  name: asset.name || '',
  type: String(asset.type || asset.assetType || asset.asset_type || 'image').toLowerCase(),
  role: asset.role || asset.assetRole || asset.asset_role || '',
});

const normalizeSubmittedAvatarAsset = asset => ({
  url: asset?.url || asset?.asset_url || asset?.assetUrl || '',
  name: asset?.name || '',
  type: String(asset?.type || asset?.assetType || asset?.asset_type || 'image').toLowerCase(),
  role: asset?.role || asset?.assetRole || asset?.asset_role || '',
});

export const getAvatarCertificationPackageStatus = (value = {}) => {
  const rawStatus = String(value?.status || '').toLowerCase();
  const usableAssets = Array.isArray(value?.usableAssets)
    ? value.usableAssets.map(normalizeAvatarAsset).filter(isUsableAvatarAsset)
    : Array.isArray(value?.usable_assets)
      ? value.usable_assets.map(normalizeAvatarAsset).filter(isUsableAvatarAsset)
      : [];
  const failedAssets = Array.isArray(value?.failedAssets)
    ? value.failedAssets.map(normalizeAvatarAsset)
    : Array.isArray(value?.failed_assets)
      ? value.failed_assets.map(normalizeAvatarAsset)
      : [];
  const submittedAssets = Array.isArray(value?.submittedAssets)
    ? value.submittedAssets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url)
    : Array.isArray(value?.submitted_assets)
      ? value.submitted_assets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url)
      : [];

  const requiredFailedAssets = failedAssets.filter(isRequiredAvatarCertificationAsset);
  if (hasRequiredAvatarCertificationAssets(usableAssets)) return 'verified';
  if (rawStatus === 'processing') return 'processing';
  if (requiredFailedAssets.length > 0 || (rawStatus === 'failed' && failedAssets.length === 0)) return 'failed';
  if (!hasRequiredAvatarCertificationAssets(usableAssets)) return 'unverified';
  if (rawStatus === 'verified') return 'verified';
  if (usableAssets.length === 0) return rawStatus === 'processing' || rawStatus === 'failed' ? rawStatus : 'unverified';

  if (submittedAssets.length === 0) return 'verified';
  const usableKeys = new Set(usableAssets.map(asset => (
    `${asset.type || 'image'}:${asset.role || ''}:${asset.name || ''}`
  )));
  const allSubmittedAssetsPassed = submittedAssets.every(asset => (
    usableAssets.some(usable => (
      String(usable.type || 'image').toLowerCase() === String(asset.type || 'image').toLowerCase()
      && (!asset.role || !usable.role || usable.role === asset.role)
      && (!asset.name || !usable.name || usable.name === asset.name)
    ))
    || usableKeys.has(`${asset.type || 'image'}:${asset.role || ''}:${asset.name || ''}`)
  ));
  return allSubmittedAssetsPassed ? 'verified' : 'failed';
};

export const normalizeAvatarCertification = (value = {}) => {
  const usableAssets = Array.isArray(value?.usableAssets)
    ? value.usableAssets.map(normalizeAvatarAsset).filter(isUsableAvatarAsset)
    : Array.isArray(value?.usable_assets)
      ? value.usable_assets.map(normalizeAvatarAsset).filter(isUsableAvatarAsset)
      : [];
  const status = getAvatarCertificationPackageStatus(value);
  return {
    status,
    taskId: value?.taskId || value?.task_id || '',
    groupId: value?.groupId || value?.group_id || value?.providerGroupId || value?.provider_group_id || '',
    groupName: value?.groupName || value?.group_name || value?.group?.name || '',
    projectName: value?.projectName || value?.project_name || value?.providerProjectName || value?.provider_project_name || '',
    usableAssets,
    failedAssets: Array.isArray(value?.failedAssets)
      ? value.failedAssets.map(normalizeAvatarAsset).filter(isRequiredAvatarCertificationAsset)
      : Array.isArray(value?.failed_assets)
        ? value.failed_assets.map(normalizeAvatarAsset).filter(isRequiredAvatarCertificationAsset)
        : [],
    submittedAssets: Array.isArray(value?.submittedAssets)
      ? value.submittedAssets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url && isRequiredAvatarCertificationAsset(asset))
      : Array.isArray(value?.submitted_assets)
        ? value.submitted_assets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url && isRequiredAvatarCertificationAsset(asset))
        : [],
    processingAssets: Array.isArray(value?.processingAssets)
      ? value.processingAssets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url && isRequiredAvatarCertificationAsset(asset))
      : Array.isArray(value?.processing_assets)
        ? value.processing_assets.map(normalizeSubmittedAvatarAsset).filter(asset => asset.url && isRequiredAvatarCertificationAsset(asset))
        : [],
    errorMessage: value?.errorMessage || value?.error_message || '',
    submittedAt: value?.submittedAt || value?.submitted_at || '',
    updatedAt: value?.updatedAt || value?.updated_at || '',
  };
};

export const getAvatarCertificationSubmittedStatus = (value = {}) => {
  const normalized = normalizeAvatarCertification(value);
  const submittedRoleKeys = new Set(
    normalized.submittedAssets
      .filter(isRequiredAvatarCertificationAsset)
      .map(getAvatarCertificationRoleKey),
  );
  if (submittedRoleKeys.size === 0) {
    return getAvatarCertificationPackageStatus(value);
  }

  const usableRoleKeys = new Set(
    normalized.usableAssets
      .filter(isUsableAvatarAsset)
      .map(getAvatarCertificationRoleKey),
  );
  const failedRoleKeys = new Set(
    normalized.failedAssets
      .filter(isRequiredAvatarCertificationAsset)
      .map(getAvatarCertificationRoleKey),
  );
  const processingRoleKeys = new Set(
    normalized.processingAssets
      .filter(isRequiredAvatarCertificationAsset)
      .map(getAvatarCertificationRoleKey),
  );

  const submittedKeys = Array.from(submittedRoleKeys);
  if (submittedKeys.every(key => usableRoleKeys.has(key))) return 'verified';
  if (submittedKeys.some(key => failedRoleKeys.has(key))) return 'failed';
  if (normalized.status === 'processing' || submittedKeys.some(key => processingRoleKeys.has(key))) return 'processing';
  return 'unverified';
};

export const getAvatarCertificationSlotStatus = (certification = {}, slot = {}) => {
  const hasSource = Boolean(slot?.hasSource);
  if (!hasSource) {
    return {
      status: 'none',
      label: '',
      assetId: '',
      assetUrl: '',
      title: '',
    };
  }

  const type = normalizeAvatarAssetType(slot.type);
  const role = normalizeAvatarAssetRole(slot.role);
  const normalized = normalizeAvatarCertification(certification);
  const matchesSlot = asset => (
    normalizeAvatarAssetType(asset?.type || asset?.assetType || asset?.asset_type) === type
    && normalizeAvatarAssetRole(asset?.role || asset?.assetRole || asset?.asset_role) === role
  );
  const assetIdFromUrl = assetUrl => (
    isAvatarAssetUrl(assetUrl) ? assetUrl.replace('asset://', '') : ''
  );
  const certifiedAsset = normalized.usableAssets.find(matchesSlot);
  if (certifiedAsset) {
    const assetUrl = certifiedAsset.assetUrl || '';
    const assetId = certifiedAsset.assetId || assetIdFromUrl(assetUrl);
    return {
      status: 'verified',
      label: '认证成功',
      assetId,
      assetUrl,
      title: assetUrl ? `Asset ID：${assetId || assetUrl}` : '该素材已认证成功',
    };
  }

  const hasExplicitProcessingAssets = Array.isArray(certification?.processingAssets)
    || Array.isArray(certification?.processing_assets);
  const processingAsset = normalized.processingAssets.find(matchesSlot)
    || (!hasExplicitProcessingAssets ? normalized.submittedAssets.find(matchesSlot) : null);
  if (normalized.status === 'processing' && processingAsset) {
    return {
      status: 'processing',
      label: '认证中',
      assetId: '',
      assetUrl: '',
      title: processingAsset.name ? `${processingAsset.name}认证中` : '该素材认证中',
    };
  }

  const failedAsset = normalized.failedAssets.find(matchesSlot);
  if (failedAsset) {
    const assetUrl = failedAsset.assetUrl || '';
    const assetId = failedAsset.assetId || assetIdFromUrl(assetUrl);
    return {
      status: 'failed',
      label: '认证失败',
      assetId,
      assetUrl,
      title: failedAsset.name || failedAsset.status ? `${failedAsset.name || '该素材'}认证失败${failedAsset.status ? `：${failedAsset.status}` : ''}` : '该素材认证失败',
    };
  }

  return {
    status: 'unverified',
    label: '未认证',
    assetId: '',
    assetUrl: '',
    title: '该素材未认证',
  };
};

export const getAvatarCertificationSubmitActionState = ({
  slotStatuses = [],
  submitAssets = [],
  hasPrimaryImage = false,
  groupId = '',
} = {}) => {
  const statuses = (slotStatuses || []).map(item => (
    typeof item === 'string' ? item : item?.status
  )).filter(Boolean);
  const allRequiredSlotsVerified = statuses.length > 0 && statuses.every(status => status === 'verified');
  const hasProcessingSlot = statuses.includes('processing');
  const hasVerifiedSlot = statuses.includes('verified');
  const mainVisualStatus = statuses[0] || '';
  const submittableAssets = Array.isArray(submitAssets) ? submitAssets : [];
  const hasSubmitAsset = submittableAssets.length > 0;
  const hasSubmitImageAsset = submittableAssets.some(asset => (
    String(asset?.type || asset?.assetType || asset?.asset_type || '').toLowerCase() === 'image'
  ));
  const canSubmitAssets = hasSubmitAsset && (hasSubmitImageAsset || Boolean(groupId));
  const submitLabel = hasVerifiedSlot
    ? '补交认证'
    : mainVisualStatus === 'failed'
      ? '重新提交认证'
      : '提交认证';

  if (allRequiredSlotsVerified) {
    return {
      state: 'complete',
      label: '已全部认证',
      disabled: true,
      canSubmit: false,
    };
  }

  if (hasProcessingSlot) {
    return {
      state: 'processing',
      label: '认证中',
      disabled: true,
      canSubmit: false,
    };
  }

  if (!hasPrimaryImage || !canSubmitAssets) {
    return {
      state: 'blocked',
      label: submitLabel,
      disabled: true,
      canSubmit: false,
    };
  }

  return {
    state: hasVerifiedSlot ? 'partial' : 'ready',
    label: submitLabel,
    disabled: false,
    canSubmit: true,
  };
};

export const resolveCharacterPayloadName = (data = {}) => {
  const payloadName = String(data?.characterPayload?.characterName || '').trim();
  const dataName = String(data?.characterName || '').trim();
  const labelName = String(data?.label || '').trim();
  if (payloadName) return payloadName;
  if (dataName && !(GENERIC_CHARACTER_NAMES.has(dataName) && labelName && !GENERIC_CHARACTER_NAMES.has(labelName))) {
    return dataName;
  }
  if (labelName && !GENERIC_CHARACTER_NAMES.has(labelName)) return labelName;
  return '';
};

export const normalizeTalentPackageAsset = (asset = {}, fallback = {}) => {
  const rawAssetUrl = asset.assetUrl || asset.asset_url || fallback.assetUrl || '';
  const assetId = asset.assetId || asset.asset_id || fallback.assetId || (isAvatarAssetUrl(rawAssetUrl) ? rawAssetUrl.replace('asset://', '') : '');
  const assetUrl = rawAssetUrl || (assetId ? `asset://${assetId}` : '');
  const sourceUrl = asset.sourceUrl || asset.source_url || asset.publicUrl || asset.public_url || asset.url || fallback.sourceUrl || fallback.publicUrl || '';
  const type = String(asset.type || asset.assetType || asset.asset_type || fallback.type || 'image').toLowerCase();
  const role = asset.role || asset.assetRole || asset.asset_role || fallback.role || 'reference';
  return {
    id: asset.id || fallback.id || `${role}_${assetId || sourceUrl || 'asset'}`,
    type,
    role,
    name: asset.name || fallback.name || '',
    sourceUrl,
    publicUrl: asset.publicUrl || asset.public_url || sourceUrl,
    localUrl: asset.localUrl || asset.local_url || asset.imageUrl || asset.audioUrl || fallback.localUrl || '',
    assetId,
    assetUrl,
    status: asset.status || fallback.status || '',
    taskId: asset.taskId || asset.task_id || fallback.taskId || '',
  };
};

const normalizeAvatarSubmissionAsset = (asset = {}) => {
  const source = typeof asset === 'string' ? { url: asset } : asset || {};
  const url = String(source.url || source.assetUrl || source.asset_url || source.sourceUrl || source.source_url || source.publicUrl || source.public_url || source.localUrl || source.local_url || '').trim();
  if (!url || isAvatarAssetUrl(url)) return null;
  const type = normalizeAvatarAssetType(source.type || source.assetType || source.asset_type);
  const role = normalizeAvatarAssetRole(source.role || source.assetRole || source.asset_role || 'reference') || 'reference';
  const key = `${type}:${role}`;
  if (!AVATAR_CERTIFICATION_REQUIRED_KEYS.has(key)) return null;
  return {
    url,
    name: source.name || '',
    type,
    role,
  };
};

export const buildAvatarCertificationSubmitAssets = (items = [], options = {}) => {
  const certification = normalizeAvatarCertification(options.avatarCertification || options.certification || {});
  const certifiedRoleKeys = new Set(
    certification.usableAssets
      .filter(isUsableAvatarAsset)
      .map(getAvatarCertificationRoleKey),
  );
  const byUrl = new Set();
  const byRole = new Map();
  (items || []).forEach(item => {
    const normalized = normalizeAvatarSubmissionAsset(item);
    if (!normalized) return;
    const roleKey = getAvatarCertificationRoleKey(normalized);
    if (certifiedRoleKeys.has(roleKey) || byRole.has(roleKey) || byUrl.has(normalized.url)) return;
    byUrl.add(normalized.url);
    byRole.set(roleKey, normalized);
  });
  return AVATAR_CERTIFICATION_REQUIRED_ASSETS
    .map(asset => byRole.get(`${asset.type}:${asset.role}`))
    .filter(Boolean);
};

export const normalizeTalentPackage = (value = {}, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const fallbackName = fallback.characterName || fallback.name || fallback.label || '未命名角色';
  const packageId = source.packageId || source.package_id || fallback.packageId || fallback.id || '';
  const certification = normalizeAvatarCertification(source.avatarCertification || source.certification || fallback.avatarCertification || {});
  const rawAssets = Array.isArray(source.assets) ? source.assets : [];
  const byKey = new Map();
  rawAssets.forEach((asset, index) => {
    const normalized = normalizeTalentPackageAsset(asset, { id: `asset_${index}` });
    const key = normalized.assetUrl || normalized.sourceUrl || normalized.localUrl || normalized.id;
    if (key && !byKey.has(key)) byKey.set(key, normalized);
  });
  return {
    packageId: packageId || `talent_package_${fallback.sourceNodeId || fallbackName}`,
    name: source.name || source.characterName || fallbackName,
    providerGroupId: source.providerGroupId || source.provider_group_id || source.groupId || source.group_id || fallback.providerGroupId || fallback.groupId || certification.groupId || '',
    providerProjectName: source.providerProjectName || source.provider_project_name || source.projectName || source.project_name || fallback.providerProjectName || fallback.projectName || certification.projectName || '',
    groupName: source.groupName || source.group_name || fallback.groupName || certification.groupName || fallbackName,
    description: source.description || fallback.description || '',
    certificationStatus: certification.status || source.certificationStatus || source.certification_status || fallback.certificationStatus || 'unverified',
    avatarCertification: certification,
    assets: Array.from(byKey.values()),
    updatedAt: source.updatedAt || source.updated_at || fallback.updatedAt || '',
  };
};

export const getCertifiedAvatarAssetsFromCertification = (certification = {}) => {
  const normalized = normalizeAvatarCertification(certification);
  if (normalized.status !== 'verified') return [];
  return normalized.usableAssets
    .filter(isUsableAvatarAsset)
    .map(asset => ({
      assetId: asset.assetId || asset.assetUrl.replace('asset://', ''),
      assetUrl: asset.assetUrl,
      status: asset.status || 'Active',
      name: asset.name || '',
      type: asset.type || 'image',
      role: asset.role || '',
    }));
};

export const buildTalentPackageFromCharacterPayload = (characterPayload = {}, sourceNode = null) => {
  const existingPackage = normalizeTalentPackage(
    characterPayload.talentPackage || sourceNode?.data?.talentPackage || sourceNode?.data?.characterPayload?.talentPackage || {},
    {
      id: characterPayload.id || sourceNode?.id || '',
      sourceNodeId: sourceNode?.id || '',
      characterName: characterPayload.characterName || sourceNode?.data?.label || '',
      description: characterPayload.description || '',
      avatarCertification: characterPayload.avatarCertification,
    },
  );
  const characterName = characterPayload.characterName || sourceNode?.data?.label || existingPackage.name || '未命名角色';
  const assets = [...existingPackage.assets];
  const pushAsset = (asset, fallback) => {
    const normalized = normalizeTalentPackageAsset(asset, fallback);
    const key = normalized.assetUrl || normalized.sourceUrl || normalized.localUrl || normalized.id;
    if (!key) return;
    const existingIndex = assets.findIndex(item => (
      (normalized.assetUrl && item.assetUrl === normalized.assetUrl)
      || (normalized.sourceUrl && item.sourceUrl === normalized.sourceUrl)
      || (normalized.localUrl && item.localUrl === normalized.localUrl)
      || item.id === normalized.id
    ));
    if (existingIndex >= 0) {
      assets[existingIndex] = { ...assets[existingIndex], ...normalized };
    } else {
      assets.push(normalized);
    }
  };

  if (characterPayload.mainVisualImageUrl || characterPayload.mainVisualPublicImageUrl || characterPayload.imageUrl || characterPayload.publicImageUrl) {
    pushAsset({}, {
      id: 'main_visual',
      type: 'image',
      role: 'main_visual',
      name: `${characterName} 主视觉`,
      localUrl: characterPayload.mainVisualImageUrl || characterPayload.imageUrl || '',
      sourceUrl: characterPayload.mainVisualPublicImageUrl || characterPayload.publicImageUrl || characterPayload.imageSourceUrl || characterPayload.mainVisualImageUrl || characterPayload.imageUrl || '',
    });
  }
  if (characterPayload.threeViewImageUrl || characterPayload.threeViewPublicImageUrl) {
    pushAsset({}, {
      id: 'three_view',
      type: 'image',
      role: 'three_view',
      name: `${characterName} 概念三视图`,
      localUrl: characterPayload.threeViewImageUrl || '',
      sourceUrl: characterPayload.threeViewPublicImageUrl || characterPayload.threeViewImageUrl || '',
    });
  }
  if (characterPayload.audioUrl) {
    pushAsset({}, {
      id: 'voice',
      type: 'audio',
      role: 'voice',
      name: `${characterName} 声音`,
      localUrl: characterPayload.audioUrl,
      sourceUrl: characterPayload.audioUrl,
    });
  }
  getCertifiedAvatarAssetsFromCertification(characterPayload.avatarCertification).forEach((asset, index) => {
    pushAsset(asset, {
      id: `certified_${index}`,
      type: asset.type || 'image',
      role: asset.role || (index === 0 ? 'main_visual' : 'certified_reference'),
      name: asset.name || `${characterName} 认证素材 ${index + 1}`,
      status: asset.status || 'Active',
    });
  });
  if (isAvatarAssetUrl(characterPayload.avatarAssetUrl || characterPayload.virtualAvatarAssetUrl || '')) {
    pushAsset({
      assetId: characterPayload.avatarAssetId || characterPayload.virtualAvatarAssetId || '',
      assetUrl: characterPayload.avatarAssetUrl || characterPayload.virtualAvatarAssetUrl || '',
    }, {
      id: 'legacy_avatar_asset',
      type: 'image',
      role: 'main_visual',
      name: `${characterName} 认证素材`,
      status: 'Active',
    });
  }

  const avatarCertification = normalizeAvatarCertification(characterPayload.avatarCertification || existingPackage.avatarCertification);
  return {
    ...existingPackage,
    name: characterName,
    providerGroupId: existingPackage.providerGroupId || avatarCertification.groupId || '',
    groupName: existingPackage.groupName || characterName,
    description: characterPayload.description || existingPackage.description || '',
    certificationStatus: avatarCertification.status || existingPackage.certificationStatus || 'unverified',
    avatarCertification,
    assets,
    updatedAt: existingPackage.updatedAt || '',
  };
};

export const getTalentPackageCertifiedAssets = (talentPackage = {}, options = {}) => {
  const hasCertificationContext = Boolean(talentPackage?.avatarCertification || talentPackage?.certification);
  if (hasCertificationContext && getAvatarCertificationPackageStatus(talentPackage.avatarCertification || talentPackage.certification) !== 'verified') {
    return [];
  }
  const normalized = normalizeTalentPackage(talentPackage, options.fallback || {});
  const types = Array.isArray(options.types) && options.types.length > 0
    ? new Set(options.types.map(type => String(type).toLowerCase()))
    : null;
  return normalized.assets
    .map(asset => normalizeTalentPackageAsset(asset))
    .filter(asset => isAvatarAssetUrl(asset.assetUrl))
    .filter(asset => !types || types.has(String(asset.type || '').toLowerCase()));
};

export const getTalentPackageCertifiedImageAssets = (talentPackage = {}, options = {}) => (
  getTalentPackageCertifiedAssets(talentPackage, {
    ...options,
    types: ['image'],
  })
);

export const getTalentPackageCertifiedAssetUrlsByType = (talentPackage = {}, type = 'image', options = {}) => (
  getTalentPackageCertifiedAssets(talentPackage, {
    ...options,
    types: [type],
  }).map(asset => asset.assetUrl).filter(isAvatarAssetUrl)
);

const isPublicHttpsUrl = value => /^https:\/\//i.test(String(value || '').trim());

export const getTalentPackageReferenceAudioUrls = (talentPackage = {}) => {
  const assets = Array.isArray(talentPackage?.assets) ? talentPackage.assets : [];
  return Array.from(new Set(
    assets
      .filter(asset => String(asset?.type || '').toLowerCase() === 'audio')
      .map(asset => asset.sourceUrl || asset.publicUrl || asset.localUrl || asset.url || '')
      .map(url => String(url || '').trim())
      .filter(url => url && !isAvatarAssetUrl(url) && isPublicHttpsUrl(url)),
  ));
};

export const toSeedanceVideoRoleAsset = (asset = {}) => ({
  url: asset.assetUrl || asset.url || '',
  role: 'reference_image',
  assetRole: asset.role || asset.assetRole || asset.asset_role || '',
  assetType: String(asset.type || asset.assetType || asset.asset_type || 'image').toLowerCase(),
  assetId: asset.assetId || asset.asset_id || '',
  name: asset.name || '',
});

export const getVideoRoleAssetsFromTalentPackage = (talentPackage = {}, fallbackAsset = null) => {
  const packageAssets = getTalentPackageCertifiedImageAssets(talentPackage)
    .map(toSeedanceVideoRoleAsset)
    .filter(asset => isAvatarAssetUrl(asset.url));
  const fallbackAssets = fallbackAsset?.assetUrl
    ? [toSeedanceVideoRoleAsset(fallbackAsset)].filter(asset => isAvatarAssetUrl(asset.url))
    : [];
  const byUrl = new Map();
  [...packageAssets, ...fallbackAssets].forEach(asset => {
    if (asset.url && !byUrl.has(asset.url)) byUrl.set(asset.url, asset);
  });
  return Array.from(byUrl.values());
};

export const getVideoRoleAssetsFromAvatarAsset = (asset = {}) => (
  getVideoRoleAssetsFromTalentPackage(asset.talentPackage || {}, asset)
);

export const getTalentPackageKey = (talentPackage = {}) => {
  const normalized = normalizeTalentPackage(talentPackage);
  const certifiedKey = getTalentPackageCertifiedAssets(normalized)
    .map(asset => asset.assetUrl)
    .sort()
    .join('|');
  return normalized.providerGroupId
    || normalized.packageId
    || certifiedKey
    || normalized.name;
};

export const getCertifiedAvatarAssetsFromCharacter = (character = {}, sourceNode = null) => (
  (() => {
    const certification = character?.avatarCertification || sourceNode?.data?.avatarCertification || sourceNode?.data?.characterPayload?.avatarCertification || null;
    const certificationIsVerified = certification ? getAvatarCertificationPackageStatus(certification) === 'verified' : false;
    const directUrl = character?.avatarAssetUrl || character?.virtualAvatarAssetUrl || sourceNode?.data?.avatarAssetUrl || sourceNode?.data?.characterPayload?.avatarAssetUrl || '';
    return Array.from(new Map([
      ...getTalentPackageCertifiedAssets(
        character?.talentPackage || sourceNode?.data?.talentPackage || sourceNode?.data?.characterPayload?.talentPackage,
        { fallback: character },
      ).map(asset => ({
        ...asset,
        talentPackage: character?.talentPackage || sourceNode?.data?.talentPackage || sourceNode?.data?.characterPayload?.talentPackage,
      })),
      ...(
        certificationIsVerified && isAvatarAssetUrl(directUrl)
          ? [{
              assetId: character?.avatarAssetId || character?.virtualAvatarAssetId || sourceNode?.data?.avatarAssetId || sourceNode?.data?.characterPayload?.avatarAssetId || '',
              assetUrl: directUrl,
              status: 'Active',
              name: character?.characterName || sourceNode?.data?.characterName || sourceNode?.data?.label || '认证角色',
              type: 'image',
            }]
          : []
      ),
      ...getCertifiedAvatarAssetsFromCertification(certification),
    ].map(asset => {
      const normalized = {
        ...asset,
        name: asset.name || character?.characterName || sourceNode?.data?.characterName || sourceNode?.data?.label || '认证角色',
        description: character?.description || sourceNode?.data?.description || '',
        imageUrl: character?.imageUrl || sourceNode?.data?.imageUrl || (Array.isArray(character?.images) ? character.images[0] : '') || '',
        nodeId: sourceNode?.id || '',
        talentPackage: asset.talentPackage || character?.talentPackage || sourceNode?.data?.talentPackage || sourceNode?.data?.characterPayload?.talentPackage || null,
      };
      return [getAvatarAssetKey(normalized.assetUrl, normalized.assetId), normalized];
    }).filter(([key]) => key)).values()).map(asset => ({ ...asset }));
  })()
);

export const getCertifiedAvatarAssetUrls = (character = {}, sourceNode = null) => (
  getCertifiedAvatarAssetsFromCharacter(character, sourceNode).map(asset => asset.assetUrl)
);

export const getCertifiedTalentPackageImageAssetUrls = (character = {}) => ([
  ...getTalentPackageCertifiedAssets(character?.talentPackage, {
    fallback: character,
    types: ['image'],
  }).map(asset => asset.assetUrl),
  ...(
    getAvatarCertificationPackageStatus(character?.avatarCertification || character?.talentPackage?.avatarCertification || {}) === 'verified'
      ? [character?.avatarAssetUrl, character?.virtualAvatarAssetUrl]
      : []
  ),
].filter(isAvatarAssetUrl).filter((value, index, list) => list.indexOf(value) === index));

export const getCertifiedAvatarAssetsFromMaterial = (material = {}) => {
  const payload = material?.talentPayload || {};
  const certification = payload.avatarCertification || material.avatarCertification || material.talentPackage?.avatarCertification || payload.talentPackage?.avatarCertification || null;
  const certificationIsVerified = certification ? getAvatarCertificationPackageStatus(certification) === 'verified' : false;
  const packageAssets = getTalentPackageCertifiedAssets(
    material.talentPackage || payload.talentPackage,
    { fallback: payload },
  ).map(asset => ({
    ...asset,
    name: asset.name || material.name || payload.characterName || payload.name || '认证角色',
    description: payload.description || material.prompt || '',
    imageUrl: material.imageUrl || payload.imageUrl || '',
    materialId: material.id || '',
    talentPackage: material.talentPackage || payload.talentPackage || null,
  }));
  const directUrl = material?.avatarAssetUrl || payload.avatarAssetUrl || payload.virtualAvatarAssetUrl || '';
  const directId = material?.avatarAssetId || payload.avatarAssetId || payload.virtualAvatarAssetId || '';
  const direct = certificationIsVerified && isAvatarAssetUrl(directUrl)
    ? [{
        assetId: directId || directUrl.replace('asset://', ''),
        assetUrl: directUrl,
        status: 'Active',
        name: material.name || payload.characterName || payload.name || '认证角色',
        description: payload.description || material.prompt || '',
        imageUrl: material.imageUrl || payload.imageUrl || '',
        materialId: material.id || '',
        type: 'image',
        talentPackage: material.talentPackage || payload.talentPackage || null,
      }]
    : [];
  const certified = getCertifiedAvatarAssetsFromCertification(certification)
    .map(asset => ({
      ...asset,
      name: asset.name || material.name || payload.characterName || payload.name || '认证角色',
      description: payload.description || material.prompt || '',
      imageUrl: material.imageUrl || payload.imageUrl || '',
      materialId: material.id || '',
      talentPackage: material.talentPackage || payload.talentPackage || null,
    }));
  const byKey = new Map();
  [...packageAssets, ...direct, ...certified].forEach(asset => {
    const key = getAvatarAssetKey(asset.assetUrl, asset.assetId);
    if (key && !byKey.has(key)) byKey.set(key, asset);
  });
  return Array.from(byKey.values());
};

export const createCertifiedAvatarMaterial = ({
  node,
  characterPayload,
  asset = null,
  groupId = '',
}) => {
  const talentPackage = buildTalentPackageFromCharacterPayload(characterPayload, node);
  const packageAssets = getTalentPackageCertifiedAssets(talentPackage, { types: ['image'] });
  const primaryAsset = asset || packageAssets[0] || {};
  const assetUrl = primaryAsset.assetUrl || '';
  const assetId = primaryAsset.assetId || assetUrl.replace('asset://', '');
  const now = new Date().toISOString();
  const characterName = characterPayload.characterName || node.data?.characterName || node.data?.label || primaryAsset.name || '认证角色';
  const imageUrl = characterPayload.imageUrl || (Array.isArray(characterPayload.images) ? characterPayload.images[0] : '') || node.data?.imageUrl || '';
  return {
    id: `material_avatar_${talentPackage.packageId || assetId || Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: 'talent',
    name: characterName,
    imageUrl,
    prompt: [
      characterPayload.description,
      characterPayload.voiceDescription ? `声音：${characterPayload.voiceDescription}` : '',
      `Seedance 认证素材：${assetUrl}`,
    ].filter(Boolean).join('\n\n'),
    avatarAssetUrl: assetUrl,
    avatarAssetId: assetId,
    talentPayload: {
      ...characterPayload,
      characterName,
      name: characterName,
      imageUrl,
      avatarAssetUrl: assetUrl,
      avatarAssetId: assetId,
      virtualAvatarAssetUrl: assetUrl,
      virtualAvatarAssetId: assetId,
      avatarCertification: characterPayload.avatarCertification,
      talentPackage,
    },
    talentPackage,
    source: 'avatarCertification',
    sourceId: node.id,
    groupId,
    createdAt: now,
    updatedAt: now,
  };
};
