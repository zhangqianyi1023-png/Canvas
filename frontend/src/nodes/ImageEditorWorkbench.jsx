import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';

const ASPECT_PRESETS = [
  { id: '9:16', label: '9:16', width: 9, height: 16 },
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '3:2', label: '3:2', width: 3, height: 2 },
  { id: '2:3', label: '2:3', width: 2, height: 3 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '3:4', label: '3:4', width: 3, height: 4 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: 'custom', label: '自定义', width: 4, height: 3 },
];

const TOOL_ITEMS = [
  { id: 'select', label: '鼠标', icon: 'cursor' },
  { id: 'brush', label: '画笔', icon: 'edit' },
  { id: 'rect', label: '矩形', icon: 'square' },
  { id: 'arrow', label: '箭头', icon: 'arrowRightUp' },
  { id: 'pen', label: '钢笔', icon: 'edit' },
  { id: 'text', label: '文本', icon: 'text' },
  { id: 'generateImage', label: '生成图片', icon: 'imageGenFill' },
];

const SIDE_TOOL_ITEMS = [
  { id: 'assets', label: '画布素材', icon: 'image', active: true },
  { id: 'history', label: '生成历史', icon: 'history' },
  { id: 'shapes', label: '形状', icon: 'square' },
  { id: 'pose', label: '姿势生成器', icon: 'user' },
  { id: 'insertImage', label: '插入图片', icon: 'imageAdd', action: 'insertImage' },
];

const COLOR_OPTIONS = ['#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
const COLOR_FORMATS = ['HEX', 'RGB', 'HSB'];
const INITIAL_LAYERS = [
  {
    id: 'shape-hero',
    type: 'rect',
    name: '矩形 1',
    x: 128,
    y: 104,
    width: 180,
    height: 116,
    color: '#3b82f6',
  },
  {
    id: 'text-title',
    type: 'text',
    name: '文本 1',
    x: 360,
    y: 158,
    width: 180,
    height: 48,
    color: '#111827',
    text: '图片编辑器',
    fontSize: 26,
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeHexColor = (value, fallback = '#ffffff') => {
  const raw = String(value || '').trim();
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
  }
  return fallback;
};

const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const hexToRgb = (value) => {
  const hex = normalizeHexColor(value).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
};

const rgbToHsb = ({ r, g, b }) => {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return {
    h: Math.round(hue),
    s: Math.round(max === 0 ? 0 : (delta / max) * 100),
    b: Math.round(max * 100),
  };
};

const hsbToRgb = ({ h, s, b }) => {
  const hue = ((Number(h) || 0) % 360 + 360) % 360;
  const saturation = clamp(Number(s) || 0, 0, 100) / 100;
  const brightness = clamp(Number(b) || 0, 0, 100) / 100;
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = brightness - chroma;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
};

const hexToHsb = (value) => rgbToHsb(hexToRgb(value));
const hsbToHex = (value) => rgbToHex(hsbToRgb(value));

const getAspectSize = (aspectId) => {
  const preset = ASPECT_PRESETS.find(item => item.id === aspectId) || ASPECT_PRESETS[1];
  const maxWidth = 760;
  const maxHeight = 520;
  const ratio = preset.width / preset.height;
  if (maxWidth / ratio <= maxHeight) {
    return { width: Math.round(maxWidth), height: Math.round(maxWidth / ratio) };
  }
  return { width: Math.round(maxHeight * ratio), height: Math.round(maxHeight) };
};

const normalizeState = (state) => ({
  aspectRatio: state?.aspectRatio || '16:9',
  canvasSize: state?.canvasSize || getAspectSize(state?.aspectRatio || '16:9'),
  backgroundColor: normalizeHexColor(state?.backgroundColor || '#ffffff'),
  activeTool: state?.activeTool || 'select',
  brushColor: state?.brushColor || '#3b82f6',
  brushSize: state?.brushSize || 8,
  strokeColor: state?.strokeColor || '#111827',
  strokeSize: state?.strokeSize || 4,
  textColor: state?.textColor || '#111827',
  textSize: state?.textSize || 28,
  prompt: state?.prompt || '',
  model: state?.model || 'Seedream 4.0',
  modelReference: state?.modelReference || '风格参考',
  layers: Array.isArray(state?.layers) && state.layers.length > 0 ? state.layers : INITIAL_LAYERS,
});

function ImageEditorWorkbench({ title = '图片编辑器', initialState, onClose, onSave }) {
  const [draft, setDraft] = useState(() => normalizeState(initialState));
  const [selectedLayerId, setSelectedLayerId] = useState(() => normalizeState(initialState).layers[0]?.id || '');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [layerMenuId, setLayerMenuId] = useState('');
  const [renamingLayerId, setRenamingLayerId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [draggingLayerId, setDraggingLayerId] = useState('');
  const [dragOverLayerId, setDragOverLayerId] = useState('');
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [isPanningStage, setIsPanningStage] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const stageRef = useRef(null);
  const imageInputRef = useRef(null);

  const selectedLayer = useMemo(
    () => draft.layers.find(layer => layer.id === selectedLayerId) || null,
    [draft.layers, selectedLayerId],
  );

  const patchDraft = useCallback((patch) => {
    setDraft(current => ({ ...current, ...patch }));
  }, []);

  const setAspectRatio = useCallback((aspectRatio) => {
    const canvasSize = aspectRatio === 'custom'
      ? draft.canvasSize
      : getAspectSize(aspectRatio);
    patchDraft({ aspectRatio, canvasSize });
  }, [draft.canvasSize, patchDraft]);

  const selectTool = useCallback((toolId) => {
    patchDraft({ activeTool: toolId });
    setGeneratorOpen(toolId === 'generateImage');
  }, [patchDraft]);

  const triggerImageUpload = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const patchLayer = useCallback((layerId, patch) => {
    setDraft(current => ({
      ...current,
      layers: current.layers.map(layer => (layer.id === layerId ? { ...layer, ...patch } : layer)),
    }));
  }, []);

  const deleteLayer = useCallback((layerId) => {
    setDraft(current => {
      const nextLayers = current.layers.filter(layer => layer.id !== layerId);
      if (selectedLayerId === layerId) setSelectedLayerId(nextLayers[0]?.id || '');
      return { ...current, layers: nextLayers };
    });
    setLayerMenuId('');
    setRenamingLayerId('');
  }, [selectedLayerId]);

  const beginRenameLayer = useCallback((layer) => {
    setLayerMenuId('');
    setRenamingLayerId(layer.id);
    setRenameDraft(layer.name || '未命名图层');
  }, []);

  const commitRenameLayer = useCallback((layerId) => {
    const nextName = renameDraft.trim();
    if (nextName) patchLayer(layerId, { name: nextName });
    setRenamingLayerId('');
    setRenameDraft('');
  }, [patchLayer, renameDraft]);

  const reorderLayer = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setDraft(current => {
      const sourceIndex = current.layers.findIndex(layer => layer.id === sourceId);
      const targetIndex = current.layers.findIndex(layer => layer.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextLayers = [...current.layers];
      const [moved] = nextLayers.splice(sourceIndex, 1);
      nextLayers.splice(targetIndex, 0, moved);
      return { ...current, layers: nextLayers };
    });
  }, []);

  const addLayer = useCallback((layer) => {
    setDraft(current => ({ ...current, layers: [layer, ...current.layers] }));
    setSelectedLayerId(layer.id);
  }, []);

  const addGeneratedLayer = useCallback(() => {
    const id = `generated-${Date.now()}`;
    addLayer({
      id,
      type: 'image',
      name: '生成图片',
      x: 220,
      y: 120,
      width: 260,
      height: 180,
      color: '#dbeafe',
      generated: true,
    });
  }, [addLayer]);

  const handleImageUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = `image-${Date.now()}`;
      addLayer({
        id,
        type: 'image',
        name: file.name || '本地图片',
        x: 180,
        y: 120,
        width: 260,
        height: 180,
        imageUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }, [addLayer]);

  const startCanvasResize = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: draft.canvasSize.width,
      height: draft.canvasSize.height,
    };
    const onMove = (moveEvent) => {
      patchDraft({
        aspectRatio: 'custom',
        canvasSize: {
          width: clamp(start.width + moveEvent.clientX - start.x, 280, 960),
          height: clamp(start.height + moveEvent.clientY - start.y, 220, 640),
        },
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [draft.canvasSize.height, draft.canvasSize.width, patchDraft]);

  const handleStagePointerDown = useCallback((event) => {
    if (event.target !== event.currentTarget && !event.target.classList?.contains('image-editor-stage-grid')) return;
    if (draft.activeTool === 'select') {
      setSelectedLayerId('');
      return;
    }
    if (draft.activeTool === 'insertImage') {
      imageInputRef.current?.click();
      return;
    }
    if (draft.activeTool === 'generateImage') {
      setGeneratorOpen(true);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left - 70, 0, Math.max(0, draft.canvasSize.width - 140));
    const y = clamp(event.clientY - rect.top - 32, 0, Math.max(0, draft.canvasSize.height - 64));
    const id = `${draft.activeTool}-${Date.now()}`;
    const base = {
      id,
      type: draft.activeTool,
      name: {
        brush: '画笔 1',
        rect: '矩形 1',
        arrow: '箭头 1',
        pen: '钢笔 1',
        text: '文本 1',
      }[draft.activeTool] || '图层',
      x,
      y,
      width: draft.activeTool === 'text' ? 160 : 140,
      height: draft.activeTool === 'text' ? 42 : 64,
      color: draft.activeTool === 'brush' ? draft.brushColor : draft.activeTool === 'text' ? draft.textColor : draft.strokeColor,
      strokeSize: draft.activeTool === 'brush' ? draft.brushSize : draft.strokeSize,
      fontSize: draft.textSize,
      text: '双击编辑文本',
    };
    addLayer(base);
  }, [
    addLayer,
    draft.activeTool,
    draft.brushColor,
    draft.brushSize,
    draft.canvasSize.height,
    draft.canvasSize.width,
    draft.strokeColor,
    draft.strokeSize,
    draft.textColor,
    draft.textSize,
  ]);

  const startLayerDrag = useCallback((event, layer) => {
    if (draft.activeTool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    const stageBox = stageRef.current?.getBoundingClientRect();
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: layer.x,
      top: layer.y,
      maxX: (stageBox?.width || draft.canvasSize.width) - layer.width,
      maxY: (stageBox?.height || draft.canvasSize.height) - layer.height,
    };
    const onMove = (moveEvent) => {
      patchLayer(layer.id, {
        x: clamp(start.left + moveEvent.clientX - start.x, 0, Math.max(0, start.maxX)),
        y: clamp(start.top + moveEvent.clientY - start.y, 0, Math.max(0, start.maxY)),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [draft.activeTool, draft.canvasSize.height, draft.canvasSize.width, patchLayer]);

  const startLayerResize = useCallback((event, layer) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: layer.width,
      height: layer.height,
    };
    const onMove = (moveEvent) => {
      patchLayer(layer.id, {
        width: clamp(start.width + moveEvent.clientX - start.x, 48, draft.canvasSize.width - layer.x),
        height: clamp(start.height + moveEvent.clientY - start.y, 32, draft.canvasSize.height - layer.y),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [draft.canvasSize.height, draft.canvasSize.width, patchLayer]);

  const startStagePan = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const start = {
      x: event.clientX,
      y: event.clientY,
      offsetX: viewportOffset.x,
      offsetY: viewportOffset.y,
    };
    setIsPanningStage(true);
    const onMove = (moveEvent) => {
      setViewportOffset({
        x: start.offsetX + moveEvent.clientX - start.x,
        y: start.offsetY + moveEvent.clientY - start.y,
      });
    };
    const onUp = () => {
      setIsPanningStage(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [viewportOffset.x, viewportOffset.y]);

  const saveAndClose = useCallback(() => {
    onSave?.(draft);
    onClose?.();
  }, [draft, onClose, onSave]);

  const secondaryToolbar = (
    ['brush', 'rect', 'arrow', 'pen', 'text'].includes(draft.activeTool) || generatorOpen
  );

  const content = (
    <div className="image-editor-workbench-overlay nodrag nopan" role="dialog" aria-modal="true" aria-label="图片编辑器">
      <div className="image-editor-workbench">
        <header className="image-editor-topbar">
          <div className="image-editor-titlebar">
            <button type="button" className="image-editor-ghost-btn" onClick={onClose}>
              <Icon name="arrowLeft" size={19} />
              <span>返回</span>
            </button>
            <strong>{title}</strong>
          </div>
          <div className="image-editor-top-center">
            <div className="image-editor-background-control">
              <button
                type="button"
                className={`image-editor-background-btn ${backgroundPickerOpen ? 'active' : ''}`}
                aria-expanded={backgroundPickerOpen}
                onClick={() => setBackgroundPickerOpen(open => !open)}
              >
                <span className="image-editor-background-swatch" style={{ '--background-color': draft.backgroundColor }} />
                <span>背景颜色</span>
              </button>
              {backgroundPickerOpen ? (
                <ColorPickerPopover
                  value={draft.backgroundColor}
                  onChange={color => patchDraft({ backgroundColor: color })}
                />
              ) : null}
            </div>
            <div className="image-editor-aspect-tabs" aria-label="画布比例">
              {ASPECT_PRESETS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={draft.aspectRatio === item.id ? 'active' : ''}
                  onClick={() => setAspectRatio(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="image-editor-actions">
            <button type="button" className="image-editor-ghost-btn">
              <Icon name="download" size={18} />
              <span>下载</span>
            </button>
            <button type="button" className="image-editor-primary-btn" onClick={saveAndClose}>
              <Icon name="save" size={18} />
              <span>保存</span>
            </button>
          </div>
        </header>

        <main className="image-editor-body">
          <aside className="image-editor-side-tools" aria-label="图片编辑入口">
            {SIDE_TOOL_ITEMS.map(item => (
              <button
                type="button"
                key={item.id}
                className={item.active ? 'active' : ''}
                aria-label={item.label}
                onClick={item.action === 'insertImage' ? triggerImageUpload : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </aside>

          <section
            className={`image-editor-stage-wrap ${isPanningStage ? 'is-panning' : ''}`}
            onPointerDown={startStagePan}
          >
            <div
              className="image-editor-stage-viewport"
              style={{ transform: `translate(${viewportOffset.x}px, ${viewportOffset.y}px)` }}
            >
              <div
                ref={stageRef}
                className="image-editor-stage"
                style={{ width: draft.canvasSize.width, height: draft.canvasSize.height, background: draft.backgroundColor }}
                onPointerDown={handleStagePointerDown}
              >
                <div className="image-editor-stage-grid" aria-hidden="true" />
                {draft.layers.slice().reverse().map(layer => (
                  <div
                    key={layer.id}
                    className={`image-editor-layer ${layer.type} ${selectedLayerId === layer.id ? 'selected' : ''}`}
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      '--layer-color': layer.color || draft.strokeColor,
                      '--layer-font-size': `${layer.fontSize || draft.textSize}px`,
                      '--layer-stroke-size': `${layer.strokeSize || draft.strokeSize}px`,
                    }}
                    onPointerDown={event => startLayerDrag(event, layer)}
                  >
                    {layer.type === 'image' && layer.imageUrl ? (
                      <img src={layer.imageUrl} alt="" draggable={false} />
                    ) : layer.type === 'image' ? (
                      <div className="image-editor-generated-preview">
                        <Icon name="imageGenFill" size={28} />
                        <span>{draft.prompt || 'AI 生成图片'}</span>
                      </div>
                    ) : layer.type === 'text' ? (
                      <span>{layer.text || '文本'}</span>
                    ) : ['brush', 'pen', 'arrow'].includes(layer.type) ? (
                      <svg viewBox="0 0 140 64" aria-hidden="true">
                        {layer.type === 'arrow' ? (
                          <>
                            <path d="M10 46 C46 14 90 18 124 20" />
                            <path d="M112 10 L126 20 L112 31" />
                          </>
                        ) : layer.type === 'pen' ? (
                          <path d="M8 50 C26 8 57 8 70 32 S111 55 132 16" />
                        ) : (
                          <path d="M10 38 C28 22 39 58 58 35 S93 10 128 30" />
                        )}
                      </svg>
                    ) : (
                      <span />
                    )}
                    {selectedLayerId === layer.id ? (
                      <button
                        type="button"
                        className="image-editor-layer-resize"
                        aria-label="调整图层大小"
                        onPointerDown={event => startLayerResize(event, layer)}
                      />
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="image-editor-canvas-resize"
                  aria-label="调整画布大小"
                  onPointerDown={startCanvasResize}
                />
              </div>
              <div className="image-editor-canvas-meta">
                {Math.round(draft.canvasSize.width)} × {Math.round(draft.canvasSize.height)}
              </div>
            </div>
          </section>

          <aside className={`image-editor-layers-panel ${layerMenuId ? 'has-open-menu' : ''}`} aria-label="图层">
            <div className="image-editor-panel-header">
              <strong>图层</strong>
              <span>{draft.layers.length}</span>
            </div>
            <div className="image-editor-layer-list">
              {draft.layers.map(layer => (
                <div
                  key={layer.id}
                  className={[
                    'image-editor-layer-row',
                    selectedLayerId === layer.id ? 'active' : '',
                    draggingLayerId === layer.id ? 'is-dragging' : '',
                    dragOverLayerId === layer.id && draggingLayerId !== layer.id ? 'is-drag-over' : '',
                  ].filter(Boolean).join(' ')}
                  draggable={renamingLayerId !== layer.id}
                  onDragStart={(event) => {
                    if (event.target?.closest?.('.image-editor-layer-more-wrap, input')) {
                      event.preventDefault();
                      return;
                    }
                    setDraggingLayerId(layer.id);
                    setSelectedLayerId(layer.id);
                    setLayerMenuId('');
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', layer.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverLayerId(layer.id);
                  }}
                  onDragLeave={() => {
                    setDragOverLayerId(current => (current === layer.id ? '' : current));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData('text/plain') || draggingLayerId;
                    reorderLayer(sourceId, layer.id);
                    setDraggingLayerId('');
                    setDragOverLayerId('');
                  }}
                  onDragEnd={() => {
                    setDraggingLayerId('');
                    setDragOverLayerId('');
                  }}
                >
                  <button
                    type="button"
                    className="image-editor-layer-main"
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    <span className={`image-editor-layer-thumb ${layer.type}`}>
                      {layer.imageUrl ? <img src={layer.imageUrl} alt="" /> : <Icon name={layer.type === 'text' ? 'text' : layer.type === 'image' ? 'image' : 'square'} size={18} />}
                    </span>
                    <span className="image-editor-layer-copy">
                      {renamingLayerId === layer.id ? (
                        <input
                          value={renameDraft}
                          autoFocus
                          onChange={event => setRenameDraft(event.target.value)}
                          onClick={event => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRenameLayer(layer.id);
                            if (event.key === 'Escape') {
                              setRenamingLayerId('');
                              setRenameDraft('');
                            }
                          }}
                          onBlur={() => commitRenameLayer(layer.id)}
                        />
                      ) : (
                        <strong>{layer.name}</strong>
                      )}
                      <small>{layer.type === 'image' ? '图片' : layer.type === 'text' ? '文本' : '形状'}</small>
                    </span>
                  </button>
                  <div className="image-editor-layer-more-wrap">
                    <button
                      type="button"
                      className="image-editor-layer-more"
                      aria-label={`${layer.name} 更多操作`}
                      aria-haspopup="menu"
                      aria-expanded={layerMenuId === layer.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedLayerId(layer.id);
                        setLayerMenuId(current => current === layer.id ? '' : layer.id);
                      }}
                    >
                      <Icon name="more" size={18} />
                    </button>
                    {layerMenuId === layer.id ? (
                      <div className="image-editor-layer-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => beginRenameLayer(layer)}>
                          <Icon name="edit" size={16} />
                          <span>编辑图层名称</span>
                        </button>
                        <button type="button" role="menuitem" className="danger" onClick={() => deleteLayer(layer.id)}>
                          <Icon name="trash" size={16} />
                          <span>删除图层</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>

        <footer className="image-editor-bottom-tools">
          {secondaryToolbar ? (
            <div className="image-editor-secondary-toolbar">
              {draft.activeTool === 'text' ? (
                <>
                  <label>字号 <input type="range" min="12" max="72" value={draft.textSize} onChange={event => patchDraft({ textSize: Number(event.target.value) })} /></label>
                  <ColorDots value={draft.textColor} onChange={color => patchDraft({ textColor: color })} />
                </>
              ) : generatorOpen ? (
                <div className="image-editor-generator-bar">
                  <button type="button" onClick={() => imageInputRef.current?.click()}>
                    <Icon name="upload" size={17} />
                    <span>上传参考图</span>
                  </button>
                  <input value={draft.prompt} placeholder="输入图片提示词" onChange={event => patchDraft({ prompt: event.target.value })} />
                  <select value={draft.model} onChange={event => patchDraft({ model: event.target.value })}>
                    <option>Seedream 4.0</option>
                    <option>GPT Image</option>
                    <option>即梦图片</option>
                  </select>
                  <select value={draft.modelReference} onChange={event => patchDraft({ modelReference: event.target.value })}>
                    <option>风格参考</option>
                    <option>角色参考</option>
                    <option>构图参考</option>
                  </select>
                  <span className="image-editor-credit">消耗 8 积分</span>
                  <button type="button" className="image-editor-primary-btn" onClick={addGeneratedLayer}>生成</button>
                </div>
              ) : (
                <>
                  <label>粗细 <input type="range" min="1" max="32" value={draft.activeTool === 'brush' ? draft.brushSize : draft.strokeSize} onChange={event => patchDraft(draft.activeTool === 'brush' ? { brushSize: Number(event.target.value) } : { strokeSize: Number(event.target.value) })} /></label>
                  <ColorDots value={draft.activeTool === 'brush' ? draft.brushColor : draft.strokeColor} onChange={color => patchDraft(draft.activeTool === 'brush' ? { brushColor: color } : { strokeColor: color })} />
                </>
              )}
            </div>
          ) : null}
          <div className="image-editor-main-toolbar">
            {TOOL_ITEMS.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={draft.activeTool === tool.id ? 'active' : ''}
                onClick={() => selectTool(tool.id)}
                aria-label={tool.label}
              >
                <Icon name={tool.icon} size={19} />
                <span className="image-editor-tool-tooltip">{tool.label}</span>
              </button>
            ))}
          </div>
        </footer>
        <input ref={imageInputRef} type="file" accept="image/*" className="image-editor-hidden-input" onChange={handleImageUpload} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function ColorDots({ value, onChange }) {
  return (
    <div className="image-editor-color-dots" aria-label="颜色">
      {COLOR_OPTIONS.map(color => (
        <button
          key={color}
          type="button"
          className={value === color ? 'active' : ''}
          style={{ '--color': color }}
          aria-label={color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

function ColorPickerPopover({ value, onChange }) {
  const [format, setFormat] = useState('HSB');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const hex = normalizeHexColor(value);
  const rgb = hexToRgb(hex);
  const hsb = hexToHsb(hex);

  const updateFromHsb = useCallback((nextHsb) => {
    onChange(hsbToHex({
      h: nextHsb.h ?? hsb.h,
      s: nextHsb.s ?? hsb.s,
      b: nextHsb.b ?? hsb.b,
    }));
  }, [hsb.b, hsb.h, hsb.s, onChange]);

  const updateSaturationBrightness = useCallback((event) => {
    event.preventDefault();
    const target = event.currentTarget;
    const update = (pointerEvent) => {
      const rect = target.getBoundingClientRect();
      const nextS = clamp((pointerEvent.clientX - rect.left) / rect.width * 100, 0, 100);
      const nextB = clamp(100 - ((pointerEvent.clientY - rect.top) / rect.height * 100), 0, 100);
      updateFromHsb({ s: Math.round(nextS), b: Math.round(nextB) });
    };
    update(event);
    const onMove = (moveEvent) => update(moveEvent);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [updateFromHsb]);

  const setRgbChannel = (channel, nextValue) => {
    onChange(rgbToHex({ ...rgb, [channel]: clamp(Number(nextValue) || 0, 0, 255) }));
  };

  const setHsbChannel = (channel, nextValue) => {
    const max = channel === 'h' ? 359 : 100;
    updateFromHsb({ [channel]: clamp(Number(nextValue) || 0, 0, max) });
  };

  const renderInputs = () => {
    if (format === 'HEX') {
      return (
        <input
          className="image-editor-color-hex-input"
          value={hex}
          onChange={event => onChange(normalizeHexColor(event.target.value, hex))}
          aria-label="HEX 色值"
        />
      );
    }
    if (format === 'RGB') {
      return (
        <>
          <input type="number" min="0" max="255" value={rgb.r} onChange={event => setRgbChannel('r', event.target.value)} aria-label="红色" />
          <input type="number" min="0" max="255" value={rgb.g} onChange={event => setRgbChannel('g', event.target.value)} aria-label="绿色" />
          <input type="number" min="0" max="255" value={rgb.b} onChange={event => setRgbChannel('b', event.target.value)} aria-label="蓝色" />
        </>
      );
    }
    return (
      <>
        <input type="number" min="0" max="359" value={hsb.h} onChange={event => setHsbChannel('h', event.target.value)} aria-label="色相" />
        <input type="number" min="0" max="100" value={hsb.s} onChange={event => setHsbChannel('s', event.target.value)} aria-label="饱和度" />
        <input type="number" min="0" max="100" value={hsb.b} onChange={event => setHsbChannel('b', event.target.value)} aria-label="亮度" />
      </>
    );
  };

  return (
    <div className="image-editor-color-picker" role="dialog" aria-label="选择背景颜色">
      <div
        className="image-editor-color-area"
        style={{ '--picker-hue-color': `hsl(${hsb.h} 100% 50%)` }}
        onPointerDown={updateSaturationBrightness}
      >
        <span
          className="image-editor-color-area-thumb"
          style={{ left: `${hsb.s}%`, top: `${100 - hsb.b}%` }}
        />
      </div>
      <div className="image-editor-color-slider-row">
        <input
          type="range"
          min="0"
          max="359"
          value={hsb.h}
          aria-label="色相"
          className="image-editor-color-hue-slider"
          onChange={event => updateFromHsb({ h: Number(event.target.value) })}
        />
      </div>
      <div className="image-editor-color-input-row">
        <div className="image-editor-color-format">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={formatMenuOpen}
            onClick={() => setFormatMenuOpen(open => !open)}
          >
            {format}
            <Icon name="chevronDown" size={14} />
          </button>
          {formatMenuOpen ? (
            <div className="image-editor-color-format-menu" role="menu">
              {COLOR_FORMATS.map(item => (
                <button
                  key={item}
                  type="button"
                  role="menuitemradio"
                  aria-checked={format === item}
                  className={format === item ? 'active' : ''}
                  onClick={() => {
                    setFormat(item);
                    setFormatMenuOpen(false);
                  }}
                >
                  <span>{format === item ? '✓' : ''}</span>
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {renderInputs()}
        {format === 'HSB' ? <span className="image-editor-color-percent">%</span> : null}
      </div>
    </div>
  );
}

export default ImageEditorWorkbench;
