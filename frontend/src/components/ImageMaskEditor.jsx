import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const normalizeModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

const getProviderModels = (api, type) => {
  if (type === 'image') return normalizeModelList(api?.imageModels);
  return [];
};

const getProviderDefaultModel = (api, models) => (
  models.includes(api?.defaultImageModel) ? api.defaultImageModel : models[0]
);

const buildImageProviders = (apiProviders, flattenedApis) => {
  const providers = Array.isArray(apiProviders)
    ? apiProviders
        .filter(api => api?.enabled !== false && getProviderModels(api, 'image').length > 0)
        .map(api => {
          const models = getProviderModels(api, 'image');
          return {
            id: api.id,
            name: api.name,
            models,
            defaultModel: getProviderDefaultModel(api, models),
          };
        })
    : [];

  if (providers.length > 0) return providers;

  const groups = new Map();
  (Array.isArray(flattenedApis) ? flattenedApis : [])
    .filter(api => api?.type === 'image')
    .forEach(api => {
      const id = api.providerId || api.baseUrl || api.id;
      const existing = groups.get(id);
      const nextModels = [...(existing?.models || []), api.model].filter(Boolean);
      groups.set(id, {
        id,
        name: api.providerName || api.name || 'API',
        models: [...new Set(nextModels)],
        defaultModel: existing?.defaultModel || api.model || '',
      });
    });

  return [...groups.values()];
};

function ImageMaskEditor({
  open,
  imageUrl,
  apiConfigs = [],
  apiProviders = [],
  onClose,
  onSubmit,
}) {
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const undoStackRef = useRef([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [brushSize, setBrushSize] = useState(44);
  const [tool, setTool] = useState('brush');
  const [instruction, setInstruction] = useState('');
  const [hasMask, setHasMask] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const imageProviders = useMemo(
    () => buildImageProviders(apiProviders, apiConfigs),
    [apiProviders, apiConfigs]
  );
  const selectedProvider = imageProviders.find(api => api.id === selectedProviderId) || imageProviders[0];
  const modelOptions = selectedProvider?.models || [];
  const activeModel = modelOptions.includes(selectedModel)
    ? selectedModel
    : selectedProvider?.defaultModel || modelOptions[0] || selectedModel || 'gpt-image-2';

  useEffect(() => {
    if (!open) return;
    setInstruction('');
    setTool('brush');
    setHasMask(false);
    undoStackRef.current = [];
  }, [open, imageUrl]);

  useEffect(() => {
    if (selectedProvider?.id && selectedProvider.id !== selectedProviderId) {
      setSelectedProviderId(selectedProvider.id);
    }
  }, [selectedProvider?.id, selectedProviderId]);

  useEffect(() => {
    if (activeModel && activeModel !== selectedModel) {
      setSelectedModel(activeModel);
    }
  }, [activeModel, selectedModel]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
    undoStackRef.current = [];
  }, []);

  const handleImageLoad = useCallback((event) => {
    const img = event.currentTarget;
    const width = img.naturalWidth || 1024;
    const height = img.naturalHeight || 1024;
    setImageSize({ width, height });
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      canvas.style.aspectRatio = `${width} / ${height}`;
      clearCanvas();
    });
  }, [clearCanvas]);

  const getCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const drawAt = useCallback((point, fromPoint = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !point) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    if (fromPoint) {
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    setHasMask(true);
  }, [brushSize, tool]);

  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStackRef.current = [...undoStackRef.current.slice(-14), canvas.toDataURL('image/png')];
  }, []);

  const lastPointRef = useRef(null);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    if (!point) return;
    pushUndo();
    drawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawAt(point);
  }, [drawAt, getCanvasPoint, pushUndo]);

  const handlePointerMove = useCallback((event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    if (!point) return;
    drawAt(point, lastPointRef.current);
    lastPointRef.current = point;
  }, [drawAt, getCanvasPoint]);

  const finishPointer = useCallback((event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    const previous = undoStackRef.current.pop();
    if (!canvas || !previous) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHasMask(undoStackRef.current.length > 0 || previous !== canvas.toDataURL('image/png'));
    };
    img.src = previous;
  }, []);

  const buildMaskDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = '#000';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(canvas, 0, 0);
    return maskCanvas.toDataURL('image/png');
  }, []);

  const handleSubmit = useCallback(() => {
    const text = instruction.trim();
    if (!text || !hasMask) return;
    onSubmit?.({
      instruction: text,
      maskDataUrl: buildMaskDataUrl(),
      imageSize,
      providerId: selectedProvider?.id || '',
      providerName: selectedProvider?.name || '',
      model: activeModel,
    });
  }, [activeModel, buildMaskDataUrl, hasMask, imageSize, instruction, onSubmit, selectedProvider]);

  if (!open) return null;

  return createPortal(
    <div className="mask-editor-overlay nodrag nopan" onPointerDown={event => event.stopPropagation()}>
      <div className="mask-editor-shell" onClick={event => event.stopPropagation()}>
        <header className="mask-editor-header">
          <div>
            <h2>图片标记编辑器</h2>
            <span>{imageSize.width > 0 ? `${imageSize.width} x ${imageSize.height}` : '加载图片中...'}</span>
          </div>
          <button type="button" className="mask-editor-close" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </header>

        <main className="mask-editor-main">
          <section className="mask-editor-stage">
            <div className="mask-editor-canvas-wrap">
              <img
                ref={imageRef}
                src={imageUrl}
                alt="待标记图片"
                onLoad={handleImageLoad}
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className={`mask-editor-canvas ${tool}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
                onPointerLeave={finishPointer}
              />
            </div>
          </section>

          <aside className="mask-editor-panel">
            <div className="mask-tool-group">
              <span className="mask-panel-label">工具</span>
              <div className="mask-tool-row">
                <button type="button" className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')}>
                  <Icon name="edit" size={15} />
                  画笔
                </button>
                <button type="button" className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>
                  <Icon name="x" size={15} />
                  橡皮
                </button>
              </div>
            </div>

            <label className="mask-slider-field">
              <span>画笔大小 {brushSize}px</span>
              <input
                type="range"
                min="8"
                max="140"
                step="2"
                value={brushSize}
                onChange={event => setBrushSize(Number(event.target.value))}
              />
            </label>

            <div className="mask-tool-row">
              <button type="button" onClick={handleUndo} disabled={undoStackRef.current.length === 0}>
                撤销
              </button>
              <button type="button" onClick={clearCanvas} disabled={!hasMask}>
                清空
              </button>
            </div>

            <label className="mask-text-field">
              <span>修改要求</span>
              <textarea
                value={instruction}
                onChange={event => setInstruction(event.target.value)}
                placeholder="说明要把白色遮罩区域改成什么，黑色区域会作为保留区域。"
                rows={7}
              />
            </label>

            <div className="mask-model-fields">
              <span className="mask-panel-label">模型</span>
              <select value={selectedProvider?.id || ''} onChange={event => setSelectedProviderId(event.target.value)}>
                {imageProviders.length > 0
                  ? imageProviders.map(api => <option key={api.id} value={api.id}>{api.name || 'API'}</option>)
                  : <option value="">未配置图片 API</option>}
              </select>
              <select value={activeModel} onChange={event => setSelectedModel(event.target.value)}>
                {modelOptions.length > 0
                  ? modelOptions.map(model => <option key={model} value={model}>{model}</option>)
                  : <option value="gpt-image-2">gpt-image-2</option>}
              </select>
            </div>

            <button
              type="button"
              className="mask-submit-btn"
              onClick={handleSubmit}
              disabled={!instruction.trim() || !hasMask}
            >
              <Icon name="play" size={15} />
              发送
            </button>
          </aside>
        </main>
      </div>
    </div>,
    document.body
  );
}

export default ImageMaskEditor;
