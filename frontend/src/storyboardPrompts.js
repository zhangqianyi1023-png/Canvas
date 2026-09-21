// ===== 分镜 LLM 提示词模板 =====
// 一轮生成完整分镜卡片：基础分镜字段 + 单帧图片提示词字段

const ASPECT_RATIO_HINTS = {
  '1:1': '方图构图，主体居中，留白均衡，运镜可水平或垂直方向。',
  '3:4': '竖版构图，主体偏上，运镜可缓慢推近。',
  '4:3': '横版构图，运镜以中景平视为主。',
  '9:16': '竖屏构图，运镜强调垂直方向（推、拉、摇可上下方向）。',
  '16:9': '横屏构图，运镜强调水平延展（横移、航拍推进）。',
};

const STYLE_TEMPLATES = {
  '种草': '突出商品细节与氛围感，镜头节奏明快，色彩鲜明，激发购买欲。',
  '开箱': '从外到内层层展示包装与商品，节奏舒缓，强调质感与仪式感。',
  '产品测评': '客观展示产品功能、材质、使用场景，对比鲜明，节奏稳重。',
  '短广告': '开场抓眼球，中段讲卖点，结尾给行动号召，整体节奏紧凑、情绪饱满。',
};

/**
 * LLM 提示词：一轮生成资源包 + 完整分镜。
 * 关键约束：严格 JSON 输出，shotNo 从 "01" 递增，duration 用 "4s" 格式。
 */
export const buildBasicScriptPrompt = ({
  aspectRatio = '16:9',
  style = '种草',
  totalDuration = 30,
  shotCount = 6,
  brief = '',
  connectedPrompt = '',
  productInfo = '',
  hasProductImage = false,
} = {}) => {
  const avgDuration = Math.max(4, Math.min(15, Math.round(totalDuration / Math.max(1, shotCount))));
  const ratioHint = ASPECT_RATIO_HINTS[aspectRatio] || '';
  const styleHint = STYLE_TEMPLATES[style] || '';

  return [
    '你是资深电商短视频导演和 AI 视频工作流设计师，输出严格 JSON。',
    `【任务】生成一个可用于 Seedance 2.0 多段生视频的电商视频资源包和 ${shotCount} 个分镜，构成一条总时长约 ${totalDuration}s 的视频，建议每镜约 ${avgDuration}s。`,
    `【画幅】${aspectRatio}。${ratioHint}`,
    `【风格】${style}。${styleHint}`,
    productInfo ? `【商品信息】\n${productInfo}` : '',
    hasProductImage ? '【商品图】已通过图片传入（多模态），请解析商品外观、包装、材质、颜色、logo/文字布局和核心卖点，并把不可变细节写入资源包。' : '',
    connectedPrompt ? `【上游提示词】\n${connectedPrompt}` : '',
    brief ? `【用户补充要求】\n${brief}` : '',
    '【Seedance 2.0 约束】',
    '- 单个视频片段时长必须在 4-15 秒之间；总时长超过 15 秒时，必须拆成多个分镜片段。',
    '- 多段视频要靠同一个 resourcePackage 维持商品、场景、人物、光线、色调和镜头语言一致。',
    '- 口播建议先生成整条 voiceoverScript，再后期统一 TTS 和字幕；不要让每段视频各自随机生成声音。',
    '- 每个 seedancePrompt 只描述本镜头画面和运动，但必须继承资源包里的全局一致性约束。',
    '【输出格式】',
    '严格 JSON 对象，**不要**输出 Markdown 代码块、注释或任何额外文字。',
    '对象结构：{ "resourcePackage": { "productIdentity": "...", "sceneLock": "...", "characterLock": "...", "visualStyle": "...", "negativeConstraints": ["..."], "seedanceGlobalPrompt": "..." }, "voiceoverScript": "...", "cards": [ ... ] }',
    '每个 cards 元素字段：{ "shotNo": "01", "duration": "4s", "durationSeconds": 4, "cameraMovement": "...", "visualDescription": "...", "narration": "...", "imagePositivePrompt": "...", "imageNegativePrompt": "...", "seedancePrompt": "...", "continuityNotes": "...", "qualityChecklist": ["..."] }',
    '- resourcePackage.productIdentity：商品外观、包装、颜色、logo/文字、材质、尺寸比例等不可变描述。',
    '- resourcePackage.sceneLock：全片统一场景、空间结构、道具、光线、色调。',
    '- resourcePackage.characterLock：如出现人物，统一人设、年龄感、发型、服装色系、妆容、手部特征；没有人物则写“无固定人物”。',
    '- resourcePackage.visualStyle：全片摄影风格、画质、镜头质感、平台感。',
    '- resourcePackage.negativeConstraints：商品变形、错误文字、多余肢体、品牌串货、虚假功效等反向约束数组。',
    '- resourcePackage.seedanceGlobalPrompt：可复制到所有 Seedance 片段前面的全局一致性提示词。',
    '- voiceoverScript：把所有 narration 串成一条完整口播，语气统一，适合整条视频一次性 TTS。',
    '- shotNo：从 "01" 开始按顺序递增（"01", "02", ...），用 2 位字符串。',
    '- duration：用 "4s" / "8s" 这种格式，durationSeconds 必须是 4-15 之间的数字，时长之和尽量接近总时长。',
    '- cameraMovement：运镜方式（如：推、拉、摇、移、跟、升、俯拍、环绕、空镜转场等）。',
    '- visualDescription：详细画面描述，包含主体、构图、光线、色彩、关键动作。',
    '- narration：旁白/口播文案（中文，口语化，符合风格）。',
    '- imagePositivePrompt：根据当前这条分镜的 visualDescription、cameraMovement、narration 生成“分镜图片”的文生图正向提示词；必须描写单帧静态画面，不要写视频动作指令；包含主体、构图、光线、色彩、材质、镜头景别、画面氛围，并贴合画幅与风格。',
    '- imageNegativePrompt：根据当前这条分镜列出反向提示词，避免模糊、畸变、错误文字、低质纹理、画幅不匹配、无关物体等，关键词用逗号分隔。',
    '- seedancePrompt：用于 Seedance 2.0 的单镜头视频 prompt，包含本镜头动作、运镜、景别、光线和商品露出方式，不要写剪辑说明。',
    '- continuityNotes：说明本镜头如何延续上一镜头的商品、人物、场景、方向和情绪。',
    '- qualityChecklist：生成后质检要点数组，至少包含商品一致性、人物/手部稳定、场景连续、口播匹配。',
  ].filter(Boolean).join('\n\n');
};
