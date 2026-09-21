// ===== 分镜卡片字段集 =====
// 分镜卡片字段：镜号 / 时长 / 运镜 / 画面说明 / 旁白 / 正 prompt / 反 prompt / Seedance prompt / 一致性 / 质检 / 图片 URL
// 图片 URL 由用户手动生图后回填，其余字段由一轮 LLM 产出。

export const STORYBOARD_BASIC_FIELDS = [
  'shotNo',
  'duration',
  'cameraMovement',
  'visualDescription',
  'narration',
];

export const STORYBOARD_PROMPT_FIELDS = [
  'imagePositivePrompt',
  'imageNegativePrompt',
  'seedancePrompt',
];

export const STORYBOARD_FIELD_DEFAULTS = {
  shotNo: '',
  duration: '',
  durationSeconds: 5,
  segmentId: '',
  segmentTitle: '',
  shots: [],
  resourceRefs: [],
  globalStylePrompt: '',
  cameraMovement: '',
  visualDescription: '',
  narration: '',
  subtitleScript: '',
  resourceReferencePrompt: '',
  imagePositivePrompt: '',
  imageNegativePrompt: '',
  videoNegativePrompt: '',
  seedancePrompt: '',
  continuityNotes: '',
  qualityChecklist: [],
  imageUrl: '',
};

export const STORYBOARD_RESOURCE_PACKAGE_DEFAULTS = {
  productIdentity: '',
  sceneLock: '',
  characterLock: '',
  visualStyle: '',
  negativeConstraints: [],
  seedanceGlobalPrompt: '',
};

// 旧 13 字段 → 新 8 字段 字段名映射（兼容历史项目数据）
const LEGACY_FIELD_ALIASES = {
  shotNo: ['shotNo', 'shot_no', 'sceneNo', 'scene_no', '镜号'],
  duration: ['duration', 'shotDuration', 'shot_duration', 'singleShotDuration', '时长'],
  cameraMovement: ['cameraMovement', 'camera_movement', 'movement', 'shotType', '运镜'],
  visualDescription: [
    'visualDescription', 'visual_description', 'picture', 'sceneDescription',
    'storyboardDescription', 'storyboard_description', 'description', '画面', '画面说明',
  ],
  narration: ['narration', 'voiceover', 'voiceOver', 'voice_over', 'dialogue', 'subtitle', '旁白'],
  imagePositivePrompt: [
    'imagePositivePrompt', 'image_positive_prompt', 'positivePrompt', 'imagePrompt',
    'visualPrompt', 'image', '正向prompt', '正向提示词',
  ],
  imageNegativePrompt: [
    'imageNegativePrompt', 'image_negative_prompt', 'negativePrompt', 'reversePrompt',
    '反向prompt', '反向提示词', '避坑提示词',
  ],
  seedancePrompt: [
    'seedancePrompt', 'seedance_prompt', 'videoPrompt', 'video_prompt',
    'motionPrompt', 'motion_prompt', 'seedance', '视频prompt', '视频提示词',
  ],
  continuityNotes: ['continuityNotes', 'continuity_notes', 'continuity', 'consistencyNotes', '一致性说明', '连续性说明'],
  qualityChecklist: ['qualityChecklist', 'quality_checklist', 'checklist', 'qualityChecks', '质检清单'],
  imageUrl: ['imageUrl', 'image_url', 'image', '分镜图片url', '图片URL'],
  segmentId: ['segmentId', 'segment_id', '片段ID', '片段编号'],
  segmentTitle: ['segmentTitle', 'segment_title', 'title', '片段标题'],
  globalStylePrompt: ['globalStylePrompt', 'global_style_prompt', 'visualStylePrompt', '全局风格提示词', '片段全局风格'],
  subtitleScript: ['subtitleScript', 'subtitle_script', '字幕汇总'],
  resourceReferencePrompt: ['resourceReferencePrompt', 'resource_reference_prompt', '资源引用提示词', '资料引用提示词'],
  videoNegativePrompt: ['videoNegativePrompt', 'video_negative_prompt', '视频负面提示词'],
};

const pickFirstAvailable = (rawCard, candidateKeys) => {
  if (!rawCard || typeof rawCard !== 'object') return '';
  for (const key of candidateKeys) {
    const value = rawCard[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const pickFirstRawAvailable = (rawCard, candidateKeys) => {
  if (!rawCard || typeof rawCard !== 'object') return undefined;
  for (const key of candidateKeys) {
    const value = rawCard[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
};

const parseDurationSeconds = (value, fallback = 5) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = String(raw ?? '').match(/(\d+(?:\.\d+)?)/);
  const parsed = match ? Number.parseFloat(match[1]) : Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(4, Math.min(15, parsed));
};

const parseShotDurationSeconds = (value, fallback = 3) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = String(raw ?? '').match(/(\d+(?:\.\d+)?)/);
  const parsed = match ? Number.parseFloat(match[1]) : Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0.5, Math.min(15, parsed));
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|；|;|，|,/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeResourceRefs = (value) => {
  if (!value) return [];
  const rawRefs = Array.isArray(value) ? value : normalizeStringArray(value);
  return rawRefs.map((item) => {
    if (item && typeof item === 'object') {
      const id = String(item.id || item.value || item.key || item.label || '').trim();
      if (!id) return null;
      const type = String(item.type || item.kind || '').trim() || (id.includes('talent') ? 'talent' : id.includes('product') ? 'product' : 'scene');
      return {
        type,
        id,
        label: String(item.label || item.name || id).trim(),
      };
    }
    const id = String(item || '').trim();
    if (!id) return null;
    return {
      type: id.includes('talent') ? 'talent' : id.includes('product') ? 'product' : 'scene',
      id,
      label: id,
    };
  }).filter(Boolean);
};

const normalizeSegmentShot = (shot, index) => {
  const source = shot && typeof shot === 'object' ? shot : {};
  const durationSeconds = parseShotDurationSeconds(source.durationSeconds ?? source.duration_seconds ?? source.duration, 3);
  const dialogue = String(source.dialogue ?? source.narration ?? source.voiceover ?? '').trim();
  const subtitle = String(source.subtitle ?? source.caption ?? '').trim();
  const hasDialogue = typeof source.hasDialogue === 'boolean'
    ? source.hasDialogue
    : Boolean(dialogue || subtitle);
  return {
    shotId: String(source.shotId || source.shot_id || `shot_${String(index + 1).padStart(2, '0')}`).trim(),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
    durationSeconds,
    cameraMovement: String(source.cameraMovement || source.camera_movement || source.movement || '').trim(),
    visualContent: String(source.visualContent || source.visual_content || source.visualDescription || source.visual_description || source.description || '').trim(),
    resourceRefs: normalizeResourceRefs(source.resourceRefs || source.resource_refs || source.resources),
    hasDialogue,
    dialogue,
    subtitle,
    soundDesign: String(source.soundDesign || source.sound_design || '').trim(),
    transition: String(source.transition || '').trim(),
  };
};

const normalizeSegmentShots = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeSegmentShot).filter(shot => (
    shot.durationSeconds || shot.cameraMovement || shot.visualContent || shot.dialogue || shot.subtitle
  ));
};

export const normalizeStoryboardResourcePackage = (resourcePackage = {}) => {
  const source = resourcePackage && typeof resourcePackage === 'object' ? resourcePackage : {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  };

  return {
    productIdentity: pick('productIdentity', 'product_identity', 'productLock', '商品一致性', '商品身份'),
    sceneLock: pick('sceneLock', 'scene_lock', 'sceneConsistency', '场景锁定', '场景一致性'),
    characterLock: pick('characterLock', 'character_lock', 'personLock', '人物锁定', '人物一致性'),
    visualStyle: pick('visualStyle', 'visual_style', 'styleLock', '视觉风格'),
    negativeConstraints: normalizeStringArray(source.negativeConstraints || source.negative_constraints || source.guardrails || source['负面约束']),
    seedanceGlobalPrompt: pick('seedanceGlobalPrompt', 'seedance_global_prompt', 'globalPrompt', '全局Seedance提示词', '全局提示词'),
  };
};

/**
 * 将任意形态的原始 card 对象标准化为新 8 字段结构。
 * 自动从旧 13 字段（order/title/imagePrompt/videoPrompt 等）回退取值。
 */
export const normalizeStoryboardCard = (card, index) => {
  const fallbackShotNo = String(index + 1).padStart(2, '0');
  const legacy = LEGACY_FIELD_ALIASES;
  const duration = pickFirstAvailable(card, legacy.duration);
  const rawDurationSeconds = pickFirstRawAvailable(card, ['durationSeconds', 'duration_seconds', 'seconds', '时长秒数']);
  const durationSeconds = parseDurationSeconds(rawDurationSeconds ?? duration);
  const rawChecklist = pickFirstRawAvailable(card, legacy.qualityChecklist);
  const shots = normalizeSegmentShots(card?.shots || card?.segmentShots || card?.segment_shots || card?.分镜头);

  // 旧结构里 "title" 也可作为 shotNo 兜底（有时模型把镜号放进 title）
  const titleFallback = (card && typeof card === 'object' && card.title) ? String(card.title).trim() : '';

  return {
    shotNo: pickFirstAvailable(card, legacy.shotNo) || titleFallback || fallbackShotNo,
    duration: `${durationSeconds}s`,
    durationSeconds,
    segmentId: pickFirstAvailable(card, legacy.segmentId) || '',
    segmentTitle: pickFirstAvailable(card, legacy.segmentTitle) || titleFallback || '',
    shots,
    resourceRefs: normalizeResourceRefs(card?.resourceRefs || card?.resource_refs || card?.resources),
    globalStylePrompt: pickFirstAvailable(card, legacy.globalStylePrompt),
    cameraMovement: pickFirstAvailable(card, legacy.cameraMovement) || '',
    visualDescription:
      pickFirstAvailable(card, legacy.visualDescription)
      || pickFirstAvailable(card, ['shotDescription', 'shot_description', 'camera', 'shot'])
      || pickFirstAvailable(card, ['actionDescription', 'action_description', 'action'])
      || '',
    narration: pickFirstAvailable(card, legacy.narration) || '',
    subtitleScript: pickFirstAvailable(card, legacy.subtitleScript),
    resourceReferencePrompt: pickFirstAvailable(card, legacy.resourceReferencePrompt),
    imagePositivePrompt:
      pickFirstAvailable(card, legacy.imagePositivePrompt)
      // 旧 videoPrompt 也可作为正向 prompt 兜底
      || pickFirstAvailable(card, ['videoPrompt', 'video_prompt', 'motionPrompt', 'motion_prompt', 'video']),
    imageNegativePrompt: pickFirstAvailable(card, legacy.imageNegativePrompt),
    videoNegativePrompt: pickFirstAvailable(card, legacy.videoNegativePrompt),
    seedancePrompt: pickFirstAvailable(card, legacy.seedancePrompt),
    continuityNotes: pickFirstAvailable(card, legacy.continuityNotes),
    qualityChecklist: normalizeStringArray(rawChecklist),
    imageUrl: pickFirstAvailable(card, legacy.imageUrl),
  };
};

export const parseStoryboardPayload = (rawText) => {
  const text = (rawText || '').trim();
  const empty = {
    cards: [],
    resourcePackage: { ...STORYBOARD_RESOURCE_PACKAGE_DEFAULTS },
    voiceoverScript: '',
    rawPayload: null,
  };
  if (!text) return empty;

  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
  ];
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const cards = Array.isArray(parsed)
        ? parsed
        : parsed.cards || parsed.storyboardCards || parsed.storyboards || parsed.scenes || [];
      if (Array.isArray(cards) && cards.length > 0) {
        return {
          cards: cards.map(normalizeStoryboardCard),
          resourcePackage: normalizeStoryboardResourcePackage(parsed.resourcePackage || parsed.resource_package || parsed.assetPackage || parsed.assets || {}),
          voiceoverScript: String(parsed.voiceoverScript || parsed.voiceover_script || parsed.fullNarration || parsed.narration || '').trim(),
          rawPayload: parsed,
        };
      }
    } catch {
      // Try the next JSON candidate.
    }
  }

  return empty;
};

/**
 * 解析 LLM 返回的原始文本 → 标准化的 cards 数组。
 * 兼容两种 JSON 形态：
 *   1) 8 字段全量（直接 normalize）
 *   2) 旧 5 字段基础版（只含基础字段，prompt 字段留空）
 * 同时兼容：纯数组、对象包 cards、Markdown ```json``` 代码块。
 */
export const parseStoryboardResponse = (rawText) => {
  return parseStoryboardPayload(rawText).cards;
};

/**
 * 兼容旧流程：解析「{imagePositivePrompt, imageNegativePrompt}」JSON。
 * 容错：尝试提取第一个 {...} JSON 对象。
 */
export const parseImagePromptResponse = (rawText) => {
  const text = (rawText || '').trim();
  if (!text) return { imagePositivePrompt: '', imageNegativePrompt: '', error: '' };

  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
  ];
  const objectMatch = text.match(/\{[\s\S]*?\}/);
  if (objectMatch) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return {
          imagePositivePrompt: String(parsed.imagePositivePrompt || parsed.positivePrompt || '').trim(),
          imageNegativePrompt: String(parsed.imageNegativePrompt || parsed.negativePrompt || '').trim(),
          error: '',
        };
      }
    } catch {
      // try next
    }
  }

  return { imagePositivePrompt: '', imageNegativePrompt: '', error: '未解析到 JSON' };
};

const formatResourceRefsForPrompt = (resourceRefs = []) => (
  normalizeResourceRefs(resourceRefs)
    .map(ref => `${ref.label || ref.id}${ref.type ? `(${ref.type})` : ''}`)
    .join('，')
);

const formatSegmentShotsForPrompt = (shots = []) => {
  const normalized = normalizeSegmentShots(shots);
  if (normalized.length === 0) return '';
  return normalized.map((shot, index) => [
    `  ${index + 1}. ${shot.durationSeconds}s`,
    shot.cameraMovement ? `运镜：${shot.cameraMovement}` : '',
    shot.visualContent ? `画面：${shot.visualContent}` : '',
    shot.resourceRefs.length > 0 ? `资料引用：${formatResourceRefsForPrompt(shot.resourceRefs)}` : '',
    shot.dialogue ? `台词：${shot.dialogue}` : '',
    shot.subtitle ? `字幕：${shot.subtitle}` : '',
    shot.soundDesign ? `声音：${shot.soundDesign}` : '',
    shot.transition ? `转场：${shot.transition}` : '',
  ].filter(Boolean).join('；')).join('\n');
};

/**
 * 把一张 card 格式化为给下游使用的纯文本（视频生成节点目前仍按字符串拼接）。
 * 基于新 8 字段拼装，对未填字段容错。
 */
export const formatStoryboardCardForPrompt = (card) => [
  `${card.segmentId || card.shotNo || ''}. ${card.segmentTitle || ''} ${card.duration || ''}`.trim(),
  card.resourceRefs?.length ? `片段资料引用：${formatResourceRefsForPrompt(card.resourceRefs)}` : '',
  card.globalStylePrompt ? `全局风格：${card.globalStylePrompt}` : '',
  card.resourceReferencePrompt ? `资料引用说明：${card.resourceReferencePrompt}` : '',
  card.cameraMovement ? `运镜：${card.cameraMovement}` : '',
  card.visualDescription ? `画面：${card.visualDescription}` : '',
  card.narration ? `旁白：${card.narration}` : '',
  card.subtitleScript ? `字幕：${card.subtitleScript}` : '',
  card.shots?.length ? `分镜头：\n${formatSegmentShotsForPrompt(card.shots)}` : '',
  card.imagePositivePrompt ? `正向提示词：${card.imagePositivePrompt}` : '',
  card.imageNegativePrompt ? `反向提示词：${card.imageNegativePrompt}` : '',
  card.videoNegativePrompt ? `视频负面提示词：${card.videoNegativePrompt}` : '',
  card.seedancePrompt ? `Seedance提示词：${card.seedancePrompt}` : '',
  card.continuityNotes ? `连续性：${card.continuityNotes}` : '',
].filter(Boolean).join('\n');

export const formatStoryboardResourcePackageForPrompt = (resourcePackage = {}) => {
  const normalized = normalizeStoryboardResourcePackage(resourcePackage);
  const lines = [
    '全片一致性资源包：',
    normalized.productIdentity ? `商品一致性：${normalized.productIdentity}` : '',
    normalized.sceneLock ? `场景一致性：${normalized.sceneLock}` : '',
    normalized.characterLock ? `人物一致性：${normalized.characterLock}` : '',
    normalized.visualStyle ? `视觉风格：${normalized.visualStyle}` : '',
    normalized.seedanceGlobalPrompt ? `Seedance全局提示词：${normalized.seedanceGlobalPrompt}` : '',
    normalized.negativeConstraints.length > 0 ? `负面约束：${normalized.negativeConstraints.join('，')}` : '',
  ].filter(Boolean);
  return lines.length > 1 ? lines.join('\n') : '';
};

/**
 * 第一轮 / 上游注入的「基础 5 字段」摘要。
 */
export const formatBasicCardForPrompt = (card) => [
  card.shotNo ? `镜号 ${card.shotNo}` : '',
  card.duration ? `时长 ${card.duration}` : '',
  card.cameraMovement ? `运镜 ${card.cameraMovement}` : '',
  card.visualDescription ? `画面 ${card.visualDescription}` : '',
  card.narration ? `旁白 ${card.narration}` : '',
].filter(Boolean).join('\n');

/**
 * 单卡基础信息摘要。
 */
export const formatCardForImagePrompt = (card) => [
  `镜号 ${card.shotNo} / 时长 ${card.duration}`,
  card.cameraMovement ? `运镜：${card.cameraMovement}` : '',
  card.visualDescription ? `画面：${card.visualDescription}` : '',
  card.narration ? `旁白：${card.narration}` : '',
].filter(Boolean).join('\n');
