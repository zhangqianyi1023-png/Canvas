import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { getShortcutModifierLabel } from '../platformShortcut';

const ZOOM_PRESETS = [
  { label: '800%', value: 8 },
  { label: '100%', value: 1 },
  { label: '50%', value: 0.5 },
  { label: '20%', value: 0.2 },
];

const ZOOM_STEP_FACTOR = 1.2;

function ZoomShortcutButton({ label, shortcutKey, modifier, icon, onClick }) {
  const tooltipId = useId();
  return (
    <span className="canvas-zoom-tooltip-trigger">
      <button
        type="button"
        className="canvas-zoom-btn canvas-zoom-step-btn"
        onClick={onClick}
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <Icon name={icon} size={16} />
      </button>
      <span id={tooltipId} className="canvas-zoom-shortcut-tooltip" role="tooltip">
        <span className="canvas-zoom-shortcut-label">{label}</span>
        <kbd className="canvas-zoom-shortcut-keycap">
          <span>{modifier}</span>
          <span>{shortcutKey}</span>
        </kbd>
      </span>
    </span>
  );
}

export default function CanvasZoomControls({
  scale,
  onScaleChange,
  onFitView,
  miniMapOpen,
  miniMapAvailable = true,
  onToggleMiniMap,
  snapEnabled,
  onToggleSnap,
  minZoom = 0.05,
  maxZoom = 8,
  labels = {},
}) {
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const pct = Math.round(scale * 100);
  const activePreset = ZOOM_PRESETS.find(preset => Math.abs(preset.value - scale) < 0.01);
  const shortcutModifier = getShortcutModifierLabel(globalThis.navigator);
  const miniMapLabel = miniMapOpen ? (labels.miniMapClose || '关闭小地图') : (labels.miniMapOpen || '打开小地图');
  const snapAriaLabel = snapEnabled ? (labels.snapOff || '关闭自动对齐') : (labels.snapOn || '开启自动对齐');
  const snapTitle = snapEnabled ? (labels.snapEnabled || '自动对齐：开') : (labels.snapDisabled || '自动对齐：关');
  const fitScreenLabel = labels.fitScreen || '适合屏幕';
  const runZoomAction = (nextZoom) => {
    onScaleChange?.(Math.min(maxZoom, Math.max(minZoom, nextZoom)));
    setZoomMenuOpen(false);
  };

  useEffect(() => {
    if (!zoomMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setZoomMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setZoomMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [zoomMenuOpen]);

  return (
    <div
      className="canvas-zoom-controls"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {miniMapAvailable && (
        <button
          type="button"
          className={`canvas-zoom-btn ${miniMapOpen ? 'active' : ''}`}
          onClick={onToggleMiniMap}
          aria-label={miniMapLabel}
          title={miniMapLabel}
        >
          <Icon name="compass" size={18} />
        </button>
      )}

      <button
        type="button"
        className="canvas-zoom-btn"
        onClick={onFitView}
        aria-label={fitScreenLabel}
        title={fitScreenLabel}
      >
        <Icon name="focus" size={18} />
      </button>

      <button
        type="button"
        className={`canvas-zoom-btn ${snapEnabled ? 'active' : ''}`}
        onClick={onToggleSnap}
        aria-label={snapAriaLabel}
        title={snapTitle}
      >
        <Icon name="magnetLock" size={18} />
      </button>

      <span className="canvas-zoom-divider" aria-hidden="true" />

      <ZoomShortcutButton
        label={labels.zoomOutCanvas || '缩小画布'}
        shortcutKey="-"
        modifier={shortcutModifier}
        icon="subtract"
        onClick={() => runZoomAction(scale / ZOOM_STEP_FACTOR)}
      />

      <div className="canvas-zoom-menu-wrap" ref={menuRef}>
        <button
          type="button"
          className={`canvas-zoom-pct ${zoomMenuOpen ? 'active' : ''}`}
          onClick={() => setZoomMenuOpen(open => !open)}
          aria-label={(labels.currentZoom || '当前缩放 {pct}%，点击选择缩放比例').replace('{pct}', pct)}
          aria-haspopup="menu"
          aria-expanded={zoomMenuOpen}
        >
          <span>{pct}%</span>
          <Icon name="chevronDown" size={13} />
        </button>

        {zoomMenuOpen ? (
          <div className="canvas-zoom-menu" role="menu" aria-label={labels.zoomMenu || '缩放比例'}>
            {ZOOM_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                className={`canvas-zoom-menu-item ${activePreset?.value === preset.value ? 'active' : ''}`}
                onClick={() => {
                  runZoomAction(preset.value);
                }}
                role="menuitem"
              >
                {preset.label}
              </button>
            ))}
            <span className="canvas-zoom-menu-divider" aria-hidden="true" />
            <button
              type="button"
              className="canvas-zoom-menu-item canvas-zoom-menu-action"
              onClick={() => runZoomAction(scale * ZOOM_STEP_FACTOR)}
              role="menuitem"
            >
              <span>{labels.zoomIn || '放大'}</span>
              <kbd>{shortcutModifier}+</kbd>
            </button>
            <button
              type="button"
              className="canvas-zoom-menu-item canvas-zoom-menu-action"
              onClick={() => runZoomAction(scale / ZOOM_STEP_FACTOR)}
              role="menuitem"
            >
              <span>{labels.zoomOut || '缩小'}</span>
              <kbd>{shortcutModifier}-</kbd>
            </button>
            <button
              type="button"
              className="canvas-zoom-menu-item canvas-zoom-menu-action"
              onClick={() => {
                onFitView?.();
                setZoomMenuOpen(false);
              }}
              role="menuitem"
            >
              <span>{fitScreenLabel}</span>
              <kbd>{shortcutModifier}0</kbd>
            </button>
          </div>
        ) : null}
      </div>

      <ZoomShortcutButton
        label={labels.zoomInCanvas || '放大画布'}
        shortcutKey="+"
        modifier={shortcutModifier}
        icon="add"
        onClick={() => runZoomAction(scale * ZOOM_STEP_FACTOR)}
      />
    </div>
  );
}
