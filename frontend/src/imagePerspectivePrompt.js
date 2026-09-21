export const IMAGE_PERSPECTIVE_PRESETS = Object.freeze([
  {
    id: 'custom',
    label: '自定义',
    horizontalAngle: 0,
    pitchAngle: 0,
    distance: 4,
    description: '自由调整相机位置',
  },
  {
    id: 'side90',
    label: '正侧面',
    horizontalAngle: 90,
    pitchAngle: 0,
    distance: 4,
    description: '主体右侧 90 度视角',
  },
  {
    id: 'side75',
    label: '近侧面75°',
    horizontalAngle: 75,
    pitchAngle: 0,
    distance: 4,
    description: '接近正侧面的 75 度视角',
  },
  {
    id: 'side45',
    label: '斜侧面45°',
    horizontalAngle: 45,
    pitchAngle: 0,
    distance: 4,
    description: '右前方 45 度视角',
  },
  {
    id: 'frontLeft15',
    label: '近正侧15°',
    horizontalAngle: -15,
    pitchAngle: 0,
    distance: 4,
    description: '正面向左偏转 15 度视角',
  },
  {
    id: 'frontHigh',
    label: '正面俯拍',
    horizontalAngle: 0,
    pitchAngle: -30,
    distance: 4,
    description: '正面上方俯拍',
  },
  {
    id: 'frontLow',
    label: '正面仰拍',
    horizontalAngle: 0,
    pitchAngle: 30,
    distance: 4,
    description: '正面下方仰拍',
  },
  {
    id: 'sideHigh',
    label: '侧面俯拍',
    horizontalAngle: 90,
    pitchAngle: -30,
    distance: 4,
    description: '主体右侧上方俯拍',
  },
  {
    id: 'sideLow',
    label: '侧面仰拍',
    horizontalAngle: 90,
    pitchAngle: 30,
    distance: 4,
    description: '主体右侧下方仰拍',
  },
]);

export const getImagePerspectivePreset = presetId => (
  IMAGE_PERSPECTIVE_PRESETS.find(preset => preset.id === presetId)
  || IMAGE_PERSPECTIVE_PRESETS[0]
);

const describeDirection = ({ presetLabel, horizontalAngle, pitchAngle }) => {
  const horizontal = Number(horizontalAngle) || 0;
  const pitch = Number(pitchAngle) || 0;
  const yawText = horizontal === 0
    ? '相机保持在主体正前方观察'
    : horizontal > 0
      ? `相机绕主体向右移动到约 ${Math.abs(horizontal)} 度位置，从主体右侧方向观察`
      : `相机绕主体向左移动到约 ${Math.abs(horizontal)} 度位置，从主体左侧方向观察`;
  const pitchText = pitch === 0
    ? '保持平视'
    : pitch > 0
      ? `相机降低形成仰视约 ${Math.abs(pitch)} 度`
      : `相机升高形成俯视约 ${Math.abs(pitch)} 度`;
  return `${presetLabel || '目标视角'}：${yawText}，${pitchText}；主体自身不要旋转、不要改变姿态`;
};

export const getImagePerspectiveDistanceLabel = distance => {
  const value = Math.min(Math.max(Number(distance) || 4, 1), 8);
  if (value <= 2.5) return '特写';
  if (value >= 6) return '远景';
  return '中景';
};

export const buildImagePerspectivePrompt = ({
  presetId = 'front',
  presetLabel = '',
  horizontalAngle,
  pitchAngle,
  distance,
  instruction = '',
  imageSize = {},
} = {}) => {
  const preset = getImagePerspectivePreset(presetId);
  const label = presetLabel || preset.label;
  const resolvedHorizontal = Number.isFinite(Number(horizontalAngle))
    ? Number(horizontalAngle)
    : preset.horizontalAngle;
  const resolvedPitch = Number.isFinite(Number(pitchAngle))
    ? Number(pitchAngle)
    : preset.pitchAngle;
  const resolvedDistance = Number.isFinite(Number(distance))
    ? Math.min(Math.max(Number(distance), 1), 8)
    : preset.distance;
  const distanceLabel = getImagePerspectiveDistanceLabel(resolvedDistance);
  const trimmedInstruction = String(instruction || '').trim();

  return [
    '请基于参考图生成同一主体的新视角图片。',
    '参考图说明：第一张图片是原始主体，请把它作为身份、结构、材质、服装、颜色、风格和光照的主要依据。',
    `目标视角：${describeDirection({
      presetLabel: label,
      horizontalAngle: resolvedHorizontal,
      pitchAngle: resolvedPitch,
    })}。`,
    `镜头距离：${distanceLabel}，距离控制值 ${resolvedDistance.toFixed(1)}。`,
    imageSize?.width && imageSize?.height ? `参考图原始尺寸：${imageSize.width}x${imageSize.height}。` : '',
    trimmedInstruction ? `补充要求：${trimmedInstruction}` : '',
    '一致性要求：保持同一个主体，不要改变主体类型、脸部/物体特征、服饰、材质、主色、图案和整体美术风格。',
    '补全要求：当目标视角出现原图不可见区域时，请合理推断背面、侧面、顶部或底部结构，保持与参考图逻辑一致。',
    '构图要求：单主体清晰居中，背景尽量贴近参考图或保持干净，不要新增无关主体、文字、水印、边框或多余装饰。',
  ].filter(Boolean).join('\n');
};
