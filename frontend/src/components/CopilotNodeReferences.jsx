import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

import Icon from './Icon';

const REFERENCE_IMAGE_PREVIEW_MAX_SIZE = 220;
const REFERENCE_IMAGE_PREVIEW_GAP = 8;
const REFERENCE_IMAGE_PREVIEW_MARGIN = 12;

const TARGET_KIND_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  node: '节点',
};

const TARGET_KIND_ICONS = {
  image: 'image',
  video: 'video',
  audio: 'audioGenFill',
  text: 'quoteText',
  node: 'focus',
};

function CopilotNodeReferences({
  targets = [],
  picking = false,
  showAdd = false,
  addDisabled = false,
  compact = false,
  onTogglePicker,
  onRemove,
  onFocus,
}) {
  const [imagePreview, setImagePreview] = useState(null);

  const showImagePreview = useCallback((event, target) => {
    if (!target.thumbnailUrl) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const availableAbove = rect.top - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const availableBelow = window.innerHeight - rect.bottom - REFERENCE_IMAGE_PREVIEW_MARGIN - REFERENCE_IMAGE_PREVIEW_GAP;
    const placeAbove = availableAbove >= REFERENCE_IMAGE_PREVIEW_MAX_SIZE || availableAbove >= availableBelow;
    const previewHalfSize = REFERENCE_IMAGE_PREVIEW_MAX_SIZE / 2;
    const left = Math.max(
      REFERENCE_IMAGE_PREVIEW_MARGIN + previewHalfSize,
      Math.min(window.innerWidth - REFERENCE_IMAGE_PREVIEW_MARGIN - previewHalfSize, rect.left + rect.width / 2),
    );
    setImagePreview({
      targetId: target.id,
      src: target.thumbnailUrl,
      left,
      top: placeAbove ? rect.top - REFERENCE_IMAGE_PREVIEW_GAP : rect.bottom + REFERENCE_IMAGE_PREVIEW_GAP,
      placement: placeAbove ? 'above' : 'below',
    });
  }, []);

  const hideImagePreview = useCallback(() => {
    setImagePreview(null);
  }, []);

  const activeImagePreview = imagePreview
    && targets.some(target => target.id === imagePreview.targetId && target.thumbnailUrl === imagePreview.src)
    ? imagePreview
    : null;

  const focusTarget = (event, target) => {
    if (event.key && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.key) event.preventDefault();
    onFocus?.(target.id);
  };

  if (!showAdd && targets.length === 0) return null;

  return (
    <>
      <div className={`canvas-copilot-node-references ${compact ? 'compact' : ''}`}>
        {showAdd && (
          <button
            type="button"
            className={`canvas-copilot-node-reference-add ${picking ? 'active' : ''}`}
            onClick={onTogglePicker}
            disabled={addDisabled}
            aria-label={picking ? '取消添加' : '添加'}
            aria-pressed={picking}
            title={picking ? '取消添加' : '添加'}
          >
            <Icon name="add" size={22} />
          </button>
        )}
        {targets.map(target => (
          <div
            className={`canvas-copilot-node-reference ${target.kind}`}
            key={target.id}
            role={onFocus ? 'button' : undefined}
            tabIndex={onFocus ? 0 : undefined}
            onClick={event => focusTarget(event, target)}
            onKeyDown={event => focusTarget(event, target)}
            onMouseEnter={event => showImagePreview(event, target)}
            onMouseLeave={hideImagePreview}
            onFocus={event => showImagePreview(event, target)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) hideImagePreview();
            }}
            title={`${TARGET_KIND_LABELS[target.kind] || '节点'} · ${target.label}`}
          >
            {target.thumbnailUrl ? (
              <img src={target.thumbnailUrl} alt="" />
            ) : (
              <span className="canvas-copilot-node-reference-icon">
                <Icon name={TARGET_KIND_ICONS[target.kind] || 'focus'} size={compact ? 16 : 20} />
              </span>
            )}
            <span className="canvas-copilot-node-reference-label">{target.label}</span>
            {onRemove && (
              <button
                type="button"
                className="canvas-copilot-node-reference-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(target.id);
                }}
                aria-label={`移除 ${target.label}`}
                title="移除引用"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {activeImagePreview && typeof document !== 'undefined' && createPortal((
        <div
          className={`reference-image-preview reference-image-preview-portal ${activeImagePreview.placement}`}
          aria-hidden="true"
          style={{
            left: `${activeImagePreview.left}px`,
            top: `${activeImagePreview.top}px`,
          }}
        >
          <img src={activeImagePreview.src} alt="" />
        </div>
      ), document.body)}
    </>
  );
}

export default CopilotNodeReferences;
