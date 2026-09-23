import Icon from './Icon';
import { NODE_TAG_COLORS, normalizeNodeTagColors } from '../nodeTagColors';

export const getNodeTagPickerTitle = (tagColors) => {
  const normalizedTagColors = normalizeNodeTagColors(tagColors);
  if (normalizedTagColors.length === 0) return '添加标记';
  const labels = normalizedTagColors
    .map(colorId => NODE_TAG_COLORS.find(color => color.id === colorId)?.label)
    .filter(Boolean);
  return labels.length > 0 ? `已 Pin：${labels.join('、')}` : '添加标记';
};

export function NodeTagDots({ tagColors, className = '', max = 3 }) {
  const normalizedTagColors = normalizeNodeTagColors(tagColors);
  if (normalizedTagColors.length === 0) return null;

  return (
    <span className={`node-tag-picker-dots${className ? ` ${className}` : ''}`} aria-hidden="true">
      {normalizedTagColors.slice(0, max).map(colorId => {
        const color = NODE_TAG_COLORS.find(option => option.id === colorId);
        return color ? <span key={colorId} style={{ '--node-tag-color': color.value }} /> : null;
      })}
    </span>
  );
}

export function NodeTagPickerButtonContent({
  tagColors,
  label = '标记',
  iconSize = 15,
  iconClassName = '',
  labelClassName = '',
  dotsClassName = '',
  tooltipClassName = '',
  tooltipTitle,
  showLabel = true,
}) {
  const title = tooltipTitle || getNodeTagPickerTitle(tagColors);
  return (
    <>
      {iconClassName ? (
        <span className={iconClassName} aria-hidden="true">
          <Icon name="tag" size={iconSize} />
        </span>
      ) : (
        <Icon name="tag" size={iconSize} />
      )}
      {showLabel ? <span className={labelClassName}>{label}</span> : null}
      <NodeTagDots tagColors={tagColors} className={dotsClassName} />
      {tooltipClassName ? <span className={tooltipClassName} role="tooltip" aria-hidden="true">{title}</span> : null}
    </>
  );
}

export function NodeTagColorMenuItems({ tagColors, onToggle, onAfterToggle }) {
  const normalizedTagColors = normalizeNodeTagColors(tagColors);

  return NODE_TAG_COLORS.map(color => {
    const active = normalizedTagColors.includes(color.id);
    return (
      <button
        key={color.id}
        type="button"
        role="menuitemcheckbox"
        aria-checked={active}
        className={active ? 'is-active' : ''}
        onClick={(event) => {
          event.stopPropagation();
          onToggle?.(color.id);
          onAfterToggle?.(event);
        }}
      >
        <span className="node-tag-picker-color" style={{ '--node-tag-color': color.value }}>
          <span className="node-tag-picker-color-dot" aria-hidden="true" />
          {active ? <Icon name="check" size={13} /> : null}
        </span>
        <span>{color.label}</span>
      </button>
    );
  });
}
