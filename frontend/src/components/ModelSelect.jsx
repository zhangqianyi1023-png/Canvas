import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export const inferModelOptionMeta = (option = {}) => {
  const rawLabel = String(option.label || option.value || '');
  const normalized = rawLabel.toLowerCase();
  if (option.imageUrl) {
    return { icon: 'image', badges: [], tags: ['素材', '参考'] };
  }
  if (normalized.includes('seedance') || normalized.includes('video') || normalized.includes('kling') || normalized.includes('veo')) {
    const isNew = normalized.includes('2.5') || normalized.includes('2-5');
    const isLong = isNew || normalized.includes('30s') || normalized.includes('4-30');
    const resolution = normalized.includes('draft') ? '480P' : normalized.includes('mini') || normalized.includes('fast') ? '720P' : '1080P';
    return { icon: 'video', badges: isNew ? ['NEW'] : [], tags: [resolution, isLong ? '4-30S' : '4-15S', normalized.includes('face') ? '人像' : '有声'] };
  }
  if (normalized.includes('image') || normalized.includes('dall') || normalized.includes('flux') || normalized.includes('jimeng') || normalized.includes('gpt-image')) {
    return { icon: 'imageGen', badges: [], tags: ['图片', normalized.includes('edit') || normalized.includes('kontext') ? '编辑' : '生成'] };
  }
  if (normalized.includes('3d') || normalized.includes('tripo') || normalized.includes('hunyuan3d')) {
    return { icon: 'cube', badges: normalized.includes('h3') ? ['NEW'] : [], tags: [normalized.includes('scene') ? 'Scene' : 'Object', normalized.includes('mesh') ? 'Polygon Mesh' : 'Mesh'] };
  }
  if (normalized.includes('audio') || normalized.includes('music') || normalized.includes('tts') || normalized.includes('voice')) {
    return { icon: 'mic', badges: [], tags: ['音频', '生成'] };
  }
  if (normalized.includes('claude')) {
    return { icon: 'aiGenerateText', badges: [], tags: ['文本', 'Claude'] };
  }
  if (normalized.includes('gpt') || normalized.includes('chatgpt') || normalized.includes('o1') || normalized.includes('o3') || normalized.includes('o4')) {
    return { icon: 'aiGenerateText', badges: [], tags: ['文本', 'OpenAI'] };
  }
  if (normalized.includes('gemini')) {
    return { icon: 'aiGenerateText', badges: [], tags: ['文本', 'Gemini'] };
  }
  return { icon: 'lightning', badges: [], tags: ['模型', '生成'] };
};

export default function ModelSelect({
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder = '未配置',
  menuPortal = false,
  menuClassName = '',
  menuMinWidth = 220,
  className = '',
  triggerClassName = '',
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const normalizedOptions = useMemo(() => (
    options
      .map(option => (typeof option === 'string' ? { value: option, label: option } : option))
      .filter(option => option && option.value !== undefined)
  ), [options]);
  const selectedOption = normalizedOptions.find(option => option.value === value);
  const displayLabel = selectedOption?.label || value || placeholder;
  const hasEnabledOptions = normalizedOptions.some(option => !option.disabled);
  const isDisabled = disabled || !hasEnabledOptions;

  const setOpenState = useCallback((next) => {
    setOpen(current => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (resolved !== current) onOpenChange?.(resolved);
      return resolved;
    });
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpenState(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenState(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, setOpenState]);

  const updateMenuPosition = useCallback(() => {
    if (!menuPortal) return;
    const trigger = wrapRef.current?.querySelector('.processor-model-trigger');
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 400;
    const width = Math.min(
      Math.max(rect.width, Number(menuMinWidth) || 220),
      Math.max(160, viewportWidth - 16),
    );
    const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
    const below = viewportHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const openUp = below < 220 && above > below;
    setMenuStyle({
      position: 'fixed',
      left,
      top: openUp ? 'auto' : rect.bottom + 6,
      bottom: openUp ? viewportHeight - rect.top + 6 : 'auto',
      width,
      maxHeight: Math.max(120, Math.min(320, openUp ? above : below)),
      zIndex: 820,
    });
  }, [menuMinWidth, menuPortal]);

  useLayoutEffect(() => {
    if (!open || !menuPortal) return undefined;
    updateMenuPosition();
    const handlePositionChange = () => updateMenuPosition();
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    return () => {
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
    };
  }, [menuPortal, open, updateMenuPosition]);

  const handleToggle = useCallback((event) => {
    event.stopPropagation();
    if (isDisabled) return;
    setOpenState(current => !current);
  }, [isDisabled, setOpenState]);

  const handleSelect = useCallback((option) => {
    if (option.disabled || option.value === value) {
      setOpenState(false);
      return;
    }
    onChange?.(option.value, option);
    setOpenState(false);
  }, [onChange, setOpenState, value]);

  const menu = open ? (
    <div
      ref={menuRef}
      className={`processor-model-menu ${menuPortal ? 'is-portaled' : ''} ${menuClassName}`.trim()}
      style={menuPortal ? menuStyle || undefined : undefined}
      role="listbox"
    >
      {normalizedOptions.map(option => {
        const active = option.value === value;
        const meta = option.meta || inferModelOptionMeta(option);
        const label = option.label || option.value;
        return (
          <button
            key={`${option.value}-${option.label}`}
            type="button"
            className={`processor-model-option ${active ? 'active' : ''}`}
            onClick={() => handleSelect(option)}
            disabled={option.disabled}
            role="option"
            aria-selected={active}
            title={option.label || option.value}
          >
            <span className="processor-model-option-main">
              <span className="processor-model-option-head">
                <span className="processor-model-option-icon" aria-hidden="true">
                  {option.imageUrl ? (
                    <img src={option.imageUrl} alt="" />
                  ) : (
                    <Icon name={meta.icon} size={18} />
                  )}
                </span>
                <span className="processor-model-option-name">{label}</span>
                {(meta.badges || []).map(badge => (
                  <span key={`${option.value}-${badge}`} className="processor-model-option-badge">{badge}</span>
                ))}
              </span>
              <span className="processor-model-option-tags">
                {(meta.tags || []).map(tag => (
                  <span key={`${option.value}-${tag}`} className="processor-model-option-tag">{tag}</span>
                ))}
              </span>
            </span>
            {active && (
              <span className="processor-model-option-check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      className={`processor-model-dropdown nodrag ${open ? 'open' : ''} ${className}`.trim()}
      ref={wrapRef}
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`processor-model-trigger ${triggerClassName}`.trim()}
        onClick={handleToggle}
        disabled={isDisabled}
        title={displayLabel}
      >
        <span>{displayLabel}</span>
      </button>
      {menuPortal && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu}
    </div>
  );
}
