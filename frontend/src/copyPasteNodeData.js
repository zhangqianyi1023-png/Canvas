export function buildPastedGeneratorDraft(entry = {}) {
  const gen = entry.generator || {};
  const isTextResult = entry.resultType === 'generateText';
  const generationConfig = entry.generationConfig && typeof entry.generationConfig === 'object'
    ? entry.generationConfig
    : {};

  return {
    connectedPrompt: isTextResult ? '' : gen.connectedPrompt || '',
    connectedTextReferences: isTextResult ? [] : gen.connectedTextReferences || [],
    connectedImages: isTextResult ? [] : gen.connectedImages || [],
    connectedVideos: isTextResult ? [] : gen.connectedVideos || [],
    uploadedReferenceImages: gen.uploadedReferenceImages || [],
    generatorType: entry.resultType,
    promptDraft: gen.promptDraft ?? entry.promptDraft ?? '',
    model_name: gen.model_name ?? entry.text_model_name ?? '',
    system_prompt: gen.system_prompt ?? entry.text_system_prompt ?? '你是一个专业的电商文案策划师。',
    user_prompt: gen.user_prompt ?? generationConfig.user_prompt ?? '',
    temperature: gen.temperature ?? entry.text_temperature ?? 0.7,
    max_tokens: gen.max_tokens ?? entry.text_max_tokens ?? 2048,
    image_prompt: gen.image_prompt ?? entry.image_prompt ?? '',
    image_negative_prompt: gen.image_negative_prompt ?? entry.image_negative_prompt,
    image_model: gen.image_model ?? entry.image_model ?? '',
    image_size: gen.image_size ?? entry.image_size ?? '3:4',
    image_resolution: gen.image_resolution ?? entry.image_resolution ?? '1k',
    image_count: gen.image_count ?? entry.image_count ?? 1,
    image_api_id: gen.image_api_id ?? entry.image_api_id ?? '',
    storyboard_script_prompt: gen.storyboard_script_prompt ?? entry.storyboard_script_prompt ?? '',
    storyboard_script_card_count: gen.storyboard_script_card_count ?? entry.storyboard_script_card_count,
    storyboard_aspect_ratio: gen.storyboard_aspect_ratio ?? entry.storyboard_aspect_ratio,
    storyboard_style: gen.storyboard_style ?? entry.storyboard_style,
    storyboard_total_duration: gen.storyboard_total_duration ?? entry.storyboard_total_duration,
    storyboard_temperature: gen.storyboard_temperature ?? entry.storyboard_temperature,
    video_prompt: gen.video_prompt ?? entry.video_prompt ?? '',
    video_model: gen.video_model ?? entry.video_model ?? '',
    video_aspect_ratio: gen.video_aspect_ratio ?? entry.video_aspect_ratio ?? '',
    video_duration: gen.video_duration ?? entry.video_duration,
    video_resolution: gen.video_resolution ?? entry.video_resolution ?? '',
    video_api_id: gen.video_api_id ?? entry.video_api_id ?? '',
    audio_text: gen.audio_text ?? entry.audio_text ?? '',
    audio_voice: gen.audio_voice ?? entry.audio_voice ?? '冰糖',
    audio_style: gen.audio_style ?? entry.audio_style ?? '',
    text_api_id: gen.text_api_id ?? entry.text_api_id ?? '',
  };
}
