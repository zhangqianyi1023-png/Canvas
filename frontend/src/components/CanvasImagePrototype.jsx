import { useCallback, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

const OPERATION_COPY = {
  outpaint: { title: '扩图', description: '扩展画布边界，保留主体并为新增区域预留生成空间。' },
  erase: { title: '擦除', description: '用笔刷标记需要移除的区域，原型阶段以标记层模拟结果。' },
  cutout: { title: '抠图', description: '提取主体并预览透明背景，后续可接入真实分割模型。' },
  enhance: { title: '增强', description: '选择清晰度和细节等级，原型阶段沿用源图作为预览。' },
  split: { title: 'Quick Split', description: '把图片按网格切成多个画布节点，保留每块的裁剪区域。' },
};

const OUTPAINT_RATIOS = [
  { id: 'free', label: '自由' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

const OUTPAINT_RESOLUTIONS = [
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
];

const OUTPAINT_QUALITIES = [
  { id: 'auto', label: '自动' },
  { id: 'standard', label: '标准' },
  { id: 'high', label: '高清' },
];

const OUTPAINT_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2' },
  { id: 'flux-fill', label: 'FLUX Fill' },
  { id: 'seedream-outpaint', label: 'Seedream' },
];

const OUTPAINT_COUNT_OPTIONS = [1, 2, 4];
const PROTOTYPE_RESOLUTIONS = [
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
];
const PROTOTYPE_QUALITIES = [
  { id: 'auto', label: '自动' },
  { id: 'standard', label: '标准' },
  { id: 'high', label: '高清' },
];
const PROTOTYPE_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2' },
  { id: 'flux-fill', label: 'FLUX Fill' },
  { id: 'seedream', label: 'Seedream' },
];
const PROTOTYPE_COUNT_OPTIONS = [1, 2, 4];
const PIXEL_SIZE_LIMIT = 16384;
const ENHANCE_TABS = [
  { id: 'upscale', label: '高清放大' },
  { id: 'skin', label: '皮肤编辑器' },
];
const ENHANCE_STYLES = [
  { id: 'general', label: '通用' },
  { id: 'low-resolution', label: '低分辨率' },
  { id: '3d-animation', label: '3D动画' },
  { id: 'high-fidelity', label: '高保真' },
  { id: 'text-optimized', label: '文字优化' },
];
const ENHANCE_SCALES = [
  { id: '2x', label: '2倍' },
  { id: '4x', label: '4倍' },
  { id: '6x', label: '6倍' },
];
const SKIN_MODES = [
  { id: 'detail', label: '细节增强' },
  { id: 'standard', label: '标准增强' },
  { id: 'heavy', label: '重度增强' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getGridCellIndices = (value) => {
  const [columns, rows] = String(value).split('x').map(Number);
  return Array.from({ length: (columns || 1) * (rows || 1) }, (_, index) => index);
};

function PrototypeMaskCanvas({ imageUrl, operation, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const undoStackRef = useRef([]);
  const [brushSize, setBrushSize] = useState(36);
  const [tool, setTool] = useState('brush');
  const [hasMask, setHasMask] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [imageRatio, setImageRatio] = useState('1 / 1');

  const notifyChange = useCallback((nextHasMask, canvas = canvasRef.current) => {
    onChange?.({
      hasMask: nextHasMask,
      maskDataUrl: nextHasMask && canvas ? canvas.toDataURL('image/png') : '',
    });
  }, [onChange]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    undoStackRef.current = [];
    setCanUndo(false);
    setHasMask(false);
    notifyChange(false, canvas);
  }, [notifyChange]);

  const handleImageLoad = useCallback((event) => {
    const image = event.currentTarget;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = image.naturalWidth || 1024;
    const height = image.naturalHeight || 1024;
    canvas.width = width;
    canvas.height = height;
    setImageRatio(`${width} / ${height}`);
    undoStackRef.current = [];
    setCanUndo(false);
    setHasMask(false);
    notifyChange(false, canvas);
  }, [notifyChange]);

  const getPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
    };
  }, []);

  const drawAt = useCallback((point, fromPoint = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !point) return;
    const context = canvas.getContext('2d');
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = operation === 'cutout' ? 'rgba(92, 224, 157, 0.72)' : 'rgba(255, 106, 126, 0.72)';
    context.fillStyle = context.strokeStyle;
    if (fromPoint) {
      context.beginPath();
      context.moveTo(fromPoint.x, fromPoint.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    const nextHasMask = tool === 'brush' || hasMask;
    setHasMask(nextHasMask);
    notifyChange(nextHasMask, canvas);
  }, [brushSize, hasMask, notifyChange, operation, tool]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    undoStackRef.current = [...undoStackRef.current.slice(-14), canvas.toDataURL('image/png')];
    setCanUndo(true);
    drawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawAt(point);
  }, [drawAt, getPoint]);

  const handlePointerMove = useCallback((event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = getPoint(event);
    if (!point) return;
    drawAt(point, lastPointRef.current);
    lastPointRef.current = point;
  }, [drawAt, getPoint]);

  const finishPointer = useCallback((event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const previous = undoStackRef.current.pop();
    if (!canvas || !previous) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const nextHasMask = undoStackRef.current.length > 0;
      setCanUndo(undoStackRef.current.length > 0);
      setHasMask(nextHasMask);
      notifyChange(nextHasMask, canvas);
    };
    image.src = previous;
  }, [notifyChange]);

  return (
    <div className={`canvas-image-prototype-mask-editor is-${operation}`}>
      <div className="canvas-image-prototype-mask-stage">
        <div className="canvas-image-prototype-mask-media" style={{ aspectRatio: imageRatio }}>
          <img src={imageUrl} alt={operation === 'cutout' ? '抠图原图' : '擦除原图'} onLoad={handleImageLoad} draggable={false} />
          <canvas
            ref={canvasRef}
            className="canvas-image-prototype-mask-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
          />
        </div>
        {!hasMask ? (
          <span className="canvas-image-prototype-mask-hint">
            {operation === 'cutout' ? '涂抹要保留的主体' : '涂抹要擦除的区域'}
          </span>
        ) : null}
      </div>
      <div className="canvas-image-prototype-mask-toolbar">
        <div className="canvas-image-prototype-mask-tools">
          <button type="button" className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')}>
            <Icon name="edit" size={14} />画笔
          </button>
          <button type="button" className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>
            <Icon name="eraser" size={14} />橡皮
          </button>
          <label>
            <span>大小</span>
            <input type="range" min="8" max="120" step="2" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} />
          </label>
        </div>
        <div className="canvas-image-prototype-mask-actions">
          <button type="button" onClick={undo} disabled={!canUndo} aria-label="撤销">
            <Icon name="undo" size={14} />
          </button>
          <button type="button" onClick={clearMask} disabled={!hasMask}>清空</button>
          <span>{hasMask ? '已选择' : '未选择'}</span>
        </div>
      </div>
    </div>
  );
}

function CanvasImagePrototype({ operation, imageUrl, onCancel, onConfirm }) {
  const [outpaintRatio, setOutpaintRatio] = useState('16:9');
  const [outpaintResolution, setOutpaintResolution] = useState('1K');
  const [outpaintQuality, setOutpaintQuality] = useState('auto');
  const [outpaintCount, setOutpaintCount] = useState(1);
  const [outpaintModel, setOutpaintModel] = useState('gpt-image-2');
  const [outpaintMargins, setOutpaintMargins] = useState({
    top: 0.16,
    right: 0.32,
    bottom: 0.16,
    left: 0.32,
  });
  const [grid, setGrid] = useState('2x2');
  const [enhanceLevel, setEnhanceLevel] = useState('2x');
  const [prototypeResolution, setPrototypeResolution] = useState('2K');
  const [prototypeQuality, setPrototypeQuality] = useState('auto');
  const [prototypeCount, setPrototypeCount] = useState(1);
  const [prototypeModel, setPrototypeModel] = useState('gpt-image-2');
  const [enhanceTab, setEnhanceTab] = useState('upscale');
  const [enhanceModel, setEnhanceModel] = useState('gpt-image-2');
  const [enhanceStyle, setEnhanceStyle] = useState('general');
  const [enhanceScale, setEnhanceScale] = useState('2x');
  const [skinMode, setSkinMode] = useState('standard');
  const [pixelWidth, setPixelWidth] = useState('1024');
  const [pixelHeight, setPixelHeight] = useState('1024');
  const [maskDataUrl, setMaskDataUrl] = useState('');
  const [maskHasMarks, setMaskHasMarks] = useState(false);
  const [selectedSplitCells, setSelectedSplitCells] = useState(() => (
    operation === 'split' ? getGridCellIndices('2x2') : []
  ));
  const [prototypeError, setPrototypeError] = useState('');
  const [busy, setBusy] = useState(false);
  const outpaintRootRef = useRef(null);
  const dragRef = useRef(null);
  const copy = OPERATION_COPY[operation] || OPERATION_COPY.enhance;
  const gridCells = useMemo(() => {
    const [columns, rows] = grid.split('x').map(Number);
    return Array.from({ length: columns * rows }, (_, index) => ({
      index,
      x: (index % columns) / columns,
      y: Math.floor(index / columns) / rows,
      width: 1 / columns,
      height: 1 / rows,
    }));
  }, [grid]);
  const outpaintCanvas = useMemo(() => {
    const widthRatio = 1 + outpaintMargins.left + outpaintMargins.right;
    const heightRatio = 1 + outpaintMargins.top + outpaintMargins.bottom;
    return {
      widthRatio,
      heightRatio,
      ratio: widthRatio / heightRatio,
      original: {
        left: outpaintMargins.left / widthRatio,
        top: outpaintMargins.top / heightRatio,
        width: 1 / widthRatio,
        height: 1 / heightRatio,
      },
    };
  }, [outpaintMargins]);
  const outpaintCredits = 20 * outpaintCount;
  const prototypeCredits = operation === 'split'
    ? Math.max(1, selectedSplitCells.length) * 8
    : operation === 'enhance'
      ? 18 * prototypeCount
      : 24 * prototypeCount;
  const enhanceCredits = enhanceTab === 'upscale'
    ? ({ '2x': 20, '4x': 30, '6x': 45 }[enhanceScale] || 20)
    : ({ detail: 20, standard: 24, heavy: 30 }[skinMode] || 24);

  const applyOutpaintRatio = useCallback((nextRatio) => {
    setOutpaintRatio(nextRatio);
    if (nextRatio === 'free') return;
    const [ratioWidth, ratioHeight] = String(nextRatio).split(':').map(Number);
    if (!(ratioWidth > 0 && ratioHeight > 0)) return;
    const anchor = outpaintRootRef.current?.parentElement;
    const rect = anchor?.getBoundingClientRect();
    const imageRatio = rect?.width && rect?.height ? rect.width / rect.height : 1;
    const targetRatio = ratioWidth / ratioHeight;
    let widthRatio = outpaintCanvas.widthRatio;
    let heightRatio = (imageRatio * widthRatio) / targetRatio;
    if (heightRatio < 1) {
      heightRatio = outpaintCanvas.heightRatio;
      widthRatio = targetRatio * heightRatio / imageRatio;
    }
    setOutpaintMargins({
      left: clamp((widthRatio - 1) / 2, 0, 1.4),
      right: clamp((widthRatio - 1) / 2, 0, 1.4),
      top: clamp((heightRatio - 1) / 2, 0, 1.4),
      bottom: clamp((heightRatio - 1) / 2, 0, 1.4),
    });
  }, [outpaintCanvas.heightRatio, outpaintCanvas.widthRatio]);

  const beginOutpaintResize = useCallback((event, handle) => {
    if (event.button !== 0) return;
    const anchor = outpaintRootRef.current?.parentElement;
    const rect = anchor?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startMargins: { ...outpaintMargins },
      width: rect.width,
      height: rect.height,
    };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (moveEvent.clientX - drag.startX) / drag.width;
      const dy = (moveEvent.clientY - drag.startY) / drag.height;
      setOutpaintRatio('free');
      setOutpaintMargins({
        top: drag.handle.includes('n') ? clamp(drag.startMargins.top - dy, 0, 1.4) : drag.startMargins.top,
        right: drag.handle.includes('e') ? clamp(drag.startMargins.right + dx, 0, 1.4) : drag.startMargins.right,
        bottom: drag.handle.includes('s') ? clamp(drag.startMargins.bottom + dy, 0, 1.4) : drag.startMargins.bottom,
        left: drag.handle.includes('w') ? clamp(drag.startMargins.left - dx, 0, 1.4) : drag.startMargins.left,
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      dragRef.current = null;
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', cleanup, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
  }, [outpaintMargins]);

  const confirm = async () => {
    if (operation === 'resize') {
      const width = Number(pixelWidth);
      const height = Number(pixelHeight);
      if (!Number.isInteger(width) || width < 1 || width > PIXEL_SIZE_LIMIT
        || !Number.isInteger(height) || height < 1 || height > PIXEL_SIZE_LIMIT) {
        setPrototypeError(`请输入 1-${PIXEL_SIZE_LIMIT} 之间的整数`);
        return;
      }
    }
    if (operation === 'erase' || operation === 'cutout') {
      if (!maskHasMarks) {
        setPrototypeError(operation === 'cutout' ? '请先涂抹需要保留的主体' : '请先涂抹需要擦除的区域');
        return;
      }
    }
    if (operation === 'split' && selectedSplitCells.length === 0) {
      setPrototypeError('请至少选择一个切分区域');
      return;
    }
    setPrototypeError('');
    setBusy(true);
    try {
      await onConfirm?.({
        operation,
        outpaintRatio,
        outpaintResolution,
        outpaintQuality,
        outpaintCount,
        outpaintModel,
        outpaintMargins,
        outpaintCanvas,
        outpaintCredits,
        enhanceLevel,
        resolution: prototypeResolution,
        quality: prototypeQuality,
        count: prototypeCount,
        model: prototypeModel,
        enhanceTab,
        enhanceModel,
        enhanceStyle,
        enhanceScale,
        skinMode,
        enhanceCredits,
        pixelWidth: Number(pixelWidth),
        pixelHeight: Number(pixelHeight),
        maskDataUrl,
        maskHasMarks,
        grid,
        cells: operation === 'split'
          ? gridCells.filter(cell => selectedSplitCells.includes(cell.index))
          : undefined,
        selectedCells: operation === 'split' ? selectedSplitCells : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  if (operation === 'outpaint') {
    return (
      <div
        ref={outpaintRootRef}
        className="canvas-outpaint-prototype nodrag nopan"
        aria-label="扩图原型"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div
          className="canvas-outpaint-stage"
          style={{
            left: `${-outpaintMargins.left * 100}%`,
            top: `${-outpaintMargins.top * 100}%`,
            width: `${outpaintCanvas.widthRatio * 100}%`,
            height: `${outpaintCanvas.heightRatio * 100}%`,
          }}
        >
          <button
            type="button"
            className="canvas-outpaint-close canvas-flow-hover-target"
            onClick={onCancel}
            disabled={busy}
            data-tooltip="关闭"
            aria-label="关闭扩图"
          >
            <Icon name="x" size={17} />
          </button>
          <div className="canvas-outpaint-empty-region" aria-hidden="true" />
          {imageUrl ? (
            <img
              className="canvas-outpaint-source-image"
              src={imageUrl}
              alt="扩图原图"
              draggable={false}
              style={{
                left: `${outpaintCanvas.original.left * 100}%`,
                top: `${outpaintCanvas.original.top * 100}%`,
                width: `${outpaintCanvas.original.width * 100}%`,
                height: `${outpaintCanvas.original.height * 100}%`,
              }}
            />
          ) : null}
          <span
            className="canvas-outpaint-original-frame"
            style={{
              left: `${outpaintCanvas.original.left * 100}%`,
              top: `${outpaintCanvas.original.top * 100}%`,
              width: `${outpaintCanvas.original.width * 100}%`,
              height: `${outpaintCanvas.original.height * 100}%`,
            }}
            aria-hidden="true"
          />
          {['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map(handle => (
            <button
              key={handle}
              type="button"
              className={`canvas-outpaint-handle is-${handle}`}
              aria-label={`拖拽调整扩图区域 ${handle}`}
              onPointerDown={event => beginOutpaintResize(event, handle)}
            />
          ))}
        </div>

        <div
          className="canvas-outpaint-generator"
          style={{ top: `calc(${outpaintCanvas.heightRatio * 100}% + 18px)` }}
        >
          <div className="canvas-outpaint-generator-row">
            <label>
              <span>宽高比</span>
              <select value={outpaintRatio} onChange={event => applyOutpaintRatio(event.target.value)}>
                {OUTPAINT_RATIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>分辨率</span>
              <select value={outpaintResolution} onChange={event => setOutpaintResolution(event.target.value)}>
                {OUTPAINT_RESOLUTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>质量</span>
              <select value={outpaintQuality} onChange={event => setOutpaintQuality(event.target.value)}>
                {OUTPAINT_QUALITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="canvas-outpaint-generator-row">
            <label>
              <span>数量</span>
              <select value={outpaintCount} onChange={event => setOutpaintCount(Number(event.target.value))}>
                {OUTPAINT_COUNT_OPTIONS.map(item => <option key={item} value={item}>{item} 张</option>)}
              </select>
            </label>
            <label className="canvas-outpaint-model-field">
              <span>模型</span>
              <select value={outpaintModel} onChange={event => setOutpaintModel(event.target.value)}>
                {OUTPAINT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <div className="canvas-outpaint-actions">
              <div className="canvas-outpaint-cost" aria-label={`需要消耗 ${outpaintCredits} 积分`}>
                <Icon name="aed" size={15} />
                <span>{outpaintCredits}</span>
              </div>
              <button type="button" className="canvas-outpaint-generate" onClick={confirm} disabled={busy} aria-label="生成扩图原型结果">
                <Icon name={busy ? 'loader' : 'arrowUp'} size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (operation === 'enhance') {
    return (
      <div
        className="canvas-image-prototype canvas-enhance-prototype nodrag nopan"
        role="dialog"
        aria-label="增强"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <header className="inline-perspective-header canvas-enhance-header">
          <div className="inline-perspective-title">
            <Icon name="spark" size={18} />
            <span>增强</span>
          </div>
          <button type="button" className="inline-perspective-close canvas-flow-hover-target" onClick={onCancel} disabled={busy} data-tooltip="关闭" aria-label="关闭增强">
            <Icon name="x" size={20} />
          </button>
        </header>

        <div className="inline-perspective-presets canvas-enhance-tabs" role="tablist" aria-label="增强模式">
          {ENHANCE_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={enhanceTab === tab.id ? 'active' : ''}
              onClick={() => setEnhanceTab(tab.id)}
              role="tab"
              aria-selected={enhanceTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`canvas-enhance-fields ${enhanceTab === 'skin' ? 'is-skin-editor' : ''}`}>
          {enhanceTab === 'upscale' ? (
            <>
              <label>
                <span>选择模型</span>
                <select value={enhanceModel} onChange={event => setEnhanceModel(event.target.value)}>
                  {PROTOTYPE_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>放大风格</span>
                <select value={enhanceStyle} onChange={event => setEnhanceStyle(event.target.value)}>
                  {ENHANCE_STYLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>放大倍数</span>
                <select value={enhanceScale} onChange={event => setEnhanceScale(event.target.value)}>
                  {ENHANCE_SCALES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label>
              <span>模式</span>
              <select value={skinMode} onChange={event => setSkinMode(event.target.value)}>
                {SKIN_MODES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          )}
        </div>

        <footer className="inline-perspective-footer canvas-enhance-footer">
          <span />
          <div className="inline-perspective-generation-controls">
            <div className="canvas-image-prototype-cost" aria-label={`需要消耗 ${enhanceCredits} 积分`}>
              <Icon name="aed" size={14} />
              <span>{enhanceCredits}</span>
            </div>
            <button type="button" className="canvas-enhance-generate" onClick={confirm} disabled={busy}>
              <Icon name={busy ? 'loader' : 'arrowUp'} size={16} />
              <span>{busy ? '生成中' : '生成'}</span>
            </button>
          </div>
        </footer>
      </div>
    );
  }

  if (operation === 'resize') {
    return (
      <div
        className="canvas-image-prototype canvas-resize-prototype nodrag nopan"
        role="dialog"
        aria-label="调整像素"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div className="canvas-image-prototype-header">
          <strong>调整像素</strong>
          <button type="button" className="icon-button" onClick={onCancel} disabled={busy} aria-label="关闭调整像素">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="canvas-resize-fields">
          <label>
            <span>宽度（px）</span>
            <input
              type="number"
              min="1"
              max={PIXEL_SIZE_LIMIT}
              step="1"
              value={pixelWidth}
              onChange={event => {
                setPixelWidth(event.target.value);
                setPrototypeError('');
              }}
              inputMode="numeric"
            />
          </label>
          <label>
            <span>高度（px）</span>
            <input
              type="number"
              min="1"
              max={PIXEL_SIZE_LIMIT}
              step="1"
              value={pixelHeight}
              onChange={event => {
                setPixelHeight(event.target.value);
                setPrototypeError('');
              }}
              inputMode="numeric"
            />
          </label>
        </div>

        {prototypeError ? <div className="canvas-image-prototype-error" role="alert">{prototypeError}</div> : null}

        <div className="canvas-resize-footer">
          <button type="button" className="canvas-resize-generate" onClick={confirm} disabled={busy}>
            <Icon name={busy ? 'loader' : 'arrowUp'} size={16} />
            <span>{busy ? '生成中' : '生成'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-image-prototype nodrag nopan" role="dialog" aria-label={copy.title}>
      <div className="canvas-image-prototype-header">
        <div>
          <strong>{copy.title}</strong>
          <span>原型预览 · 待接真实模型</span>
        </div>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="canvas-image-prototype-preview">
        {['erase', 'cutout'].includes(operation) ? (
          <PrototypeMaskCanvas
            key={`${operation}-${imageUrl}`}
            imageUrl={imageUrl}
            operation={operation}
            onChange={({ hasMask, maskDataUrl: nextMaskDataUrl }) => {
              setMaskHasMarks(hasMask);
              setMaskDataUrl(nextMaskDataUrl);
              setPrototypeError('');
            }}
          />
        ) : imageUrl ? <img src={imageUrl} alt="原图预览" /> : <div className="canvas-image-prototype-empty">等待图片</div>}
        {operation === 'outpaint' && <div className="canvas-image-prototype-frame" data-ratio={outpaintRatio} />}
        {operation === 'cutout' && <div className="canvas-image-prototype-cutout-label"><Icon name="check" size={13} />透明背景预览</div>}
        {operation === 'split' && <div className={`canvas-image-prototype-grid grid-${grid.replace('x', '-')}`}>
          {gridCells.map(cell => (
            <button
              type="button"
              key={cell.index}
              className={selectedSplitCells.includes(cell.index) ? 'active' : ''}
              style={{
                left: `${cell.x * 100}%`,
                top: `${cell.y * 100}%`,
                width: `${cell.width * 100}%`,
                height: `${cell.height * 100}%`,
              }}
              onClick={() => {
                setSelectedSplitCells(current => current.includes(cell.index)
                  ? current.filter(index => index !== cell.index)
                  : [...current, cell.index].sort((a, b) => a - b));
                setPrototypeError('');
              }}
              aria-label={`选择第 ${cell.index + 1} 块`}
              aria-pressed={selectedSplitCells.includes(cell.index)}
            >
              <span>{cell.index + 1}</span>
            </button>
          ))}
        </div>}
      </div>
      <p className="canvas-image-prototype-description">{copy.description}</p>
      <div className="canvas-image-prototype-controls">
        {operation === 'split' && (
          <>
            <span className="canvas-image-prototype-chip">已选 {selectedSplitCells.length} 块</span>
            <button type="button" className="canvas-image-prototype-inline-button" onClick={() => setSelectedSplitCells(gridCells.map(cell => cell.index))}>全选</button>
            <button type="button" className="canvas-image-prototype-inline-button" onClick={() => setSelectedSplitCells([])}>清空</button>
          </>
        )}
        {operation === 'outpaint' && (
          <label>目标比例
            <select value={outpaintRatio} onChange={event => setOutpaintRatio(event.target.value)}>
              {OUTPAINT_RATIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}
        {operation === 'enhance' && (
          <>
            <label>增强等级
              <select value={enhanceLevel} onChange={event => setEnhanceLevel(event.target.value)}>
                <option value="2x">2× 清晰度</option><option value="4x">4× 细节</option>
              </select>
            </label>
            <label>分辨率
              <select value={prototypeResolution} onChange={event => setPrototypeResolution(event.target.value)}>
                {PROTOTYPE_RESOLUTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </>
        )}
        {operation === 'split' && (
          <label>切分网格
            <select
              value={grid}
              onChange={event => {
                const nextGrid = event.target.value;
                setGrid(nextGrid);
                setSelectedSplitCells(getGridCellIndices(nextGrid));
              }}
            >
              <option value="2x2">2 × 2</option><option value="3x3">3 × 3</option><option value="4x4">4 × 4</option>
            </select>
          </label>
        )}
        {operation === 'cutout' && <span className="canvas-image-prototype-chip">主体保留 · 背景移除</span>}
      </div>
      {['erase', 'cutout', 'enhance'].includes(operation) ? (
        <div className="canvas-image-prototype-generator-row">
          <label>质量
            <select value={prototypeQuality} onChange={event => setPrototypeQuality(event.target.value)}>
              {PROTOTYPE_QUALITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>数量
            <select value={prototypeCount} onChange={event => setPrototypeCount(Number(event.target.value))}>
              {PROTOTYPE_COUNT_OPTIONS.map(item => <option key={item} value={item}>{item} 张</option>)}
            </select>
          </label>
          <label className="canvas-image-prototype-model-field">模型
            <select value={prototypeModel} onChange={event => setPrototypeModel(event.target.value)}>
              {PROTOTYPE_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {prototypeError ? <div className="canvas-image-prototype-error" role="alert">{prototypeError}</div> : null}
      <div className="canvas-image-prototype-actions">
        <button type="button" className="canvas-image-prototype-secondary" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="canvas-image-prototype-primary" onClick={confirm} disabled={busy}>
          <Icon name={busy ? 'loader' : 'spark'} size={14} />{busy ? '处理中…' : operation === 'split' ? '切分到画布' : '生成原型结果'}
        </button>
        <span className="canvas-image-prototype-cost" aria-label={`需要消耗 ${prototypeCredits} 积分`}>
          <Icon name="aed" size={13} />{prototypeCredits}
        </span>
      </div>
    </div>
  );
}

export default CanvasImagePrototype;
