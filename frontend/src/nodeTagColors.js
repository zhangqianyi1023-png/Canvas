export const NODE_TAG_COLORS = [
  { id: 'red', label: '红色', value: '#f45b69' },
  { id: 'orange', label: '橙色', value: '#ff9f43' },
  { id: 'yellow', label: '黄色', value: '#f4cf3b' },
  { id: 'green', label: '绿色', value: '#43d17a' },
  { id: 'blue', label: '蓝色', value: '#4aa3ff' },
  { id: 'purple', label: '紫色', value: '#9b5cf6' },
];

export const NODE_TAG_COLOR_MAP = Object.fromEntries(
  NODE_TAG_COLORS.map(color => [color.id, color])
);

export const normalizeNodeTagColors = (value) => (
  Array.isArray(value)
    ? value.filter(colorId => NODE_TAG_COLOR_MAP[colorId])
    : []
);
