export const IMAGE_RATIO_PRESETS = Object.freeze([
  { id: 'auto', channel: '智能比例', value: 'auto', shape: 'square' },
  { id: 'douyin', channel: '抖音', value: '9:16', shape: 'portrait' },
  { id: 'xiaohongshu-portrait', channel: '小红书', value: '3:4', shape: 'portrait' },
  { id: 'xiaohongshu-square', channel: '小红书', value: '1:1', shape: 'square' },
  { id: 'wechat-square', channel: '公众号', value: '1:1', shape: 'square' },
  { id: 'wechat-portrait', channel: '公众号配图', value: '3:4', shape: 'portrait' },
  { id: 'wechat-wide', channel: '公众号横图', value: '16:9', shape: 'wide' },
]);

// 图片生成接口使用的完整比例集合。平台比例保留给素材拆分、裁剪等旧功能。
export const IMAGE_GENERATION_RATIO_PRESETS = Object.freeze([
  { id: 'image-1-1', label: '1:1', value: '1:1', shape: 'square' },
  { id: 'image-3-2', label: '3:2', value: '3:2', shape: '' },
  { id: 'image-2-3', label: '2:3', value: '2:3', shape: 'portrait' },
  { id: 'image-4-3', label: '4:3', value: '4:3', shape: '' },
  { id: 'image-3-4', label: '3:4', value: '3:4', shape: 'portrait' },
  { id: 'image-5-4', label: '5:4', value: '5:4', shape: '' },
  { id: 'image-4-5', label: '4:5', value: '4:5', shape: 'portrait' },
  { id: 'image-16-9', label: '16:9', value: '16:9', shape: 'wide' },
  { id: 'image-9-16', label: '9:16', value: '9:16', shape: 'portrait' },
  { id: 'image-2-1', label: '2:1', value: '2:1', shape: 'wide' },
  { id: 'image-1-2', label: '1:2', value: '1:2', shape: 'portrait' },
  { id: 'image-3-1', label: '3:1', value: '3:1', shape: 'wide' },
  { id: 'image-1-3', label: '1:3', value: '1:3', shape: 'portrait' },
  { id: 'image-21-9', label: '21:9', value: '21:9', shape: 'wide' },
  { id: 'image-9-21', label: '9:21', value: '9:21', shape: 'portrait' },
]);

export const getDefaultImageRatioPresetId = value => (
  IMAGE_RATIO_PRESETS.find(option => option.value === value)?.id || IMAGE_RATIO_PRESETS[0].id
);

export const getImageRatioPreset = presetId => (
  IMAGE_RATIO_PRESETS.find(option => option.id === presetId) || IMAGE_RATIO_PRESETS[0]
);

export const getImageRatioSummary = (value, presetId) => {
  const preset = presetId
    ? [...IMAGE_RATIO_PRESETS, ...IMAGE_GENERATION_RATIO_PRESETS]
      .find(option => option.id === presetId)
    : null;
  if (preset && preset.value === value) {
    if (preset.value === 'auto') return '智能比例';
    if (!preset.channel) return preset.value;
    return `${preset.channel} ${preset.value}`;
  }
  const valuePreset = IMAGE_RATIO_PRESETS.find(option => option.value === value);
  if (valuePreset) {
    if (valuePreset.value === 'auto') return '智能比例';
    return `${valuePreset.channel} ${valuePreset.value}`;
  }
  return value || '智能比例';
};

export const ratioToCssAspectRatio = value => (
  value && value !== 'auto' ? String(value).replace(':', ' / ') : '1 / 1'
);
