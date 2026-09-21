export const DEFAULT_QUICK_PROMPT_CATEGORIES = Object.freeze([
  { id: 'all', name: '全部', system: true },
  { id: 'product', name: '商品电商', system: true },
  { id: 'character', name: '人物角色', system: true },
  { id: 'scene', name: '场景空间', system: true },
  { id: 'poster', name: '海报设计', system: true },
  { id: 'storyboard', name: '镜头分镜', system: true },
  { id: 'view', name: '镜头视角', system: true },
  { id: 'lighting', name: '光影风格', system: true },
  { id: 'custom', name: '我的提示词', system: true },
]);

export const DEFAULT_QUICK_PROMPTS = Object.freeze([
  {
    id: 'builtin_multi_camera_grid',
    title: '多机位九宫格',
    categoryId: 'view',
    content: 'A multi-camera angle reference sheet in 3x3 grid layout, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent lighting across all 9 frames, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional studio photography, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 10,
  },
  {
    id: 'builtin_multi_camera_grid_4k',
    title: '多机位九宫格4K',
    categoryId: 'view',
    content: 'Ultra high resolution multi-camera angle reference sheet in 3x3 grid layout, 4K quality, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent cinematic lighting across all 9 frames, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional studio photography with medium format film aesthetic, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, fine organic film grain, zero digital sharpening, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 20,
  },
  {
    id: 'builtin_story_four_grid',
    title: '剧情推演四宫格',
    categoryId: 'storyboard',
    content: 'A 4-panel storyboard sequence in 2x2 grid, showing narrative progression of [事件/场景]: top-left [阶段1描述], top-right [阶段2描述], bottom-left [阶段3描述], bottom-right [阶段4描述]. Consistent character design across all panels, coherent lighting and color palette, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, cinematic composition, emotional arc from [情绪A] to [情绪B], film grain texture, clean thin white grid dividers, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 30,
  },
  {
    id: 'builtin_character_face_three_view',
    title: '角色脸部三视图',
    categoryId: 'character',
    content: 'Character face reference sheet, three views side by side in single row: left panel front view straight-on, center panel 3/4 angle view, right panel side profile view. [角色面部详细描述]. Consistent lighting from 45-degree top-side across all three views, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, neutral clean backdrop, professional character design sheet, clean linework, subtle skin texture, identical facial features maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 40,
  },
  {
    id: 'builtin_product_three_view',
    title: '产品三视图',
    categoryId: 'product',
    content: 'Product design reference sheet, three orthographic views in single row: front view, side view, top view. [产品详细描述]. Light warm gray background color F0EDE8, products softly blending with background with natural edge transition, no hard edges no white halo no light bleed, studio lighting with soft shadows, technical drawing aesthetic, precise proportions, material texture visible, no perspective distortion, professional product photography, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 50,
  },
  {
    id: 'builtin_storyboard_25_grid',
    title: '25宫格连贯分镜',
    categoryId: 'storyboard',
    content: 'A 5x5 cinematic storyboard grid, 25 sequential frames showing continuous narrative flow of [主体/场景/动作], naturally divided into 9 story beats progressing through beginning, development, escalation, twist, climax, and resolution. Scene transitions conveyed purely through visual continuity and character motion, absolutely no visible numbers, text, labels, frame counters, corner marks, or annotations anywhere on the image. Consistent character and environment across all 25 frames, smooth motion continuity between adjacent frames, uniform cinematic lighting and color palette, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, varied shot progression from wide to close-up, professional film storyboard aesthetic, subtle film grain, clean thin white grid dividers',
    source: 'builtin',
    sortOrder: 60,
  },
  {
    id: 'builtin_cinematic_lighting',
    title: '电影级光影校正',
    categoryId: 'lighting',
    content: 'Cinematic lighting comparison sheet, 6 panels showing the same [主体/场景] under different lighting conditions: top-left golden hour warm backlight, top-center overcast soft diffused light, top-right neon night city light, bottom-left harsh midday direct sun, bottom-center Rembrandt 45-degree side light with triangle shadow, bottom-right dramatic low-key chiaroscuro. Consistent composition and subject across all panels, only lighting changes, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional cinematography reference, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 70,
  },
  {
    id: 'builtin_character_design_sheet',
    title: '角色设定参考表',
    categoryId: 'character',
    content: 'Character reference sheet, left-right split layout: left one-third area is chest-up close-up front view portrait (shoulder-up framing, extreme facial detail clarity, gentle natural expression, bright eyes looking straight at camera, realistic skin texture with visible pores and subtle imperfections, refined classical makeup); right two-thirds area is three full-body views in horizontal row, from left to right: full-body front standing pose (arms hanging naturally, feet together, complete front costume and body proportions), full-body side profile view (weight slightly shifted, waist-hip curve and silhouette visible, complete side costume and footwear), full-body back view (complete back neckline, hairstyle from behind, back costume details). Consistent front-top-side lighting across all panels, soft diffused light quality, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, identical character design, costume, hairstyle and accessories across all panels, professional character design sheet style, clean edges, accurate proportions, material texture visible from all angles, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 80,
  },
  {
    id: 'builtin_expression_six_grid',
    title: '6种基础表情胸像',
    categoryId: 'character',
    content: 'Character expression reference sheet in 2x3 grid layout, six basic expressions of the same character: top row from left to right: calm neutral expression (relaxed face, eyes looking straight ahead, lips naturally closed), gentle smile (corners of mouth slightly raised, eyes with smile lines, warm and approachable), joyful laugh (eyebrows and eyes curved upward, mouth open showing teeth, exuberant happiness); bottom row from left to right: sad tearful expression (slight furrow between brows, downturned outer eye corners, tears welling in eyes about to fall), angry stern expression (brows tightly locked, sharp piercing eyes with pressure, jaw slightly set), surprised astonished expression (eyes wide open, eyebrows raised high, mouth slightly open in O shape). All six expressions are chest-up close-up portraits of the same character, shoulder-up framing, extreme facial detail clarity, realistic skin texture preserved, no additional light source, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, identical character styling, hairstyle, makeup and accessories across all six panels, only facial expression changes, professional character expression sheet style, clean edges, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image',
    source: 'builtin',
    sortOrder: 90,
  },
  {
    id: 'builtin_360_panorama',
    title: '360全景图',
    categoryId: 'scene',
    content: '生成一个720度的全景VR图，左右边缘100%像素级无缝衔接，可无限循环拼接；上下极点(南北极)自然过渡，无明显断层或拉伸，场景一致性，以及场景的逻辑性，封闭场景需要有门',
    source: 'builtin',
    sortOrder: 100,
  },
]);

const cloneCategory = category => ({ ...category });
const clonePrompt = prompt => ({ ...prompt });

export const createDefaultQuickPromptState = () => ({
  categories: DEFAULT_QUICK_PROMPT_CATEGORIES.map(cloneCategory),
  prompts: DEFAULT_QUICK_PROMPTS.map(clonePrompt),
});

export const normalizeQuickPromptState = value => {
  const storedCategories = Array.isArray(value?.categories) ? value.categories : [];
  const customCategories = storedCategories.filter(category => (
    category?.id
    && category.id !== 'all'
    && !DEFAULT_QUICK_PROMPT_CATEGORIES.some(item => item.id === category.id)
  ));
  const categories = [
    ...DEFAULT_QUICK_PROMPT_CATEGORIES.map(cloneCategory),
    ...customCategories.map(category => ({
      id: String(category.id),
      name: String(category.name || '新分类').trim() || '新分类',
      system: false,
    })),
  ];
  const validCategoryIds = new Set(categories.map(category => category.id));
  const storedPrompts = Array.isArray(value?.prompts) ? value.prompts : [];
  const storedById = new Map(storedPrompts.filter(item => item?.id).map(item => [item.id, item]));
  const builtinPrompts = DEFAULT_QUICK_PROMPTS.map(defaultPrompt => {
    const stored = storedById.get(defaultPrompt.id);
    return {
      ...clonePrompt(defaultPrompt),
      ...(stored ? {
        title: String(stored.title || defaultPrompt.title).trim() || defaultPrompt.title,
        content: String(stored.content || defaultPrompt.content).trim() || defaultPrompt.content,
        categoryId: validCategoryIds.has(stored.categoryId) ? stored.categoryId : defaultPrompt.categoryId,
        updatedAt: stored.updatedAt || '',
      } : {}),
      source: 'builtin',
    };
  });
  const builtinIds = new Set(DEFAULT_QUICK_PROMPTS.map(prompt => prompt.id));
  const customPrompts = storedPrompts
    .filter(prompt => prompt?.id && !builtinIds.has(prompt.id))
    .map((prompt, index) => ({
      id: String(prompt.id),
      title: String(prompt.title || '未命名提示词').trim() || '未命名提示词',
      content: String(prompt.content || '').trim(),
      categoryId: validCategoryIds.has(prompt.categoryId) ? prompt.categoryId : 'custom',
      source: 'custom',
      sortOrder: Number(prompt.sortOrder) || 1000 + index,
      createdAt: prompt.createdAt || '',
      updatedAt: prompt.updatedAt || '',
    }))
    .filter(prompt => prompt.content);
  return { categories, prompts: [...builtinPrompts, ...customPrompts] };
};

export const composeQuickPromptText = (...parts) => (
  parts.map(part => String(part || '').trim()).filter(Boolean).join('\n\n')
);

export const findQuickPrompt = (prompts, promptId) => (
  (Array.isArray(prompts) ? prompts : []).find(prompt => prompt.id === promptId) || null
);

export const resetBuiltinQuickPrompt = promptId => (
  DEFAULT_QUICK_PROMPTS.find(prompt => prompt.id === promptId) || null
);
