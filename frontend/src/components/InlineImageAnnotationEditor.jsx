import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { IMAGE_ACTION_TOOLBAR_GAP } from '../imageActionOverlayPosition';

const colors = ['#ff3434', '#ffb020', '#28d17c', '#4aa3ff', '#ffffff'];
const tools = [
  { id: 'pen', label: '画笔', icon: 'edit' },
  { id: 'arrow', label: '箭头', icon: 'arrowRightUp' },
  { id: 'rect', label: '矩形', icon: 'square' },
  { id: 'circle', label: '圆形', icon: 'circleOutline' },
  { id: 'text', label: '文字', icon: 'text' },
  { id: 'eraser', label: '橡皮', icon: 'eraser' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getCanvasDpr = () => clamp(window.devicePixelRatio || 1, 1, 3);

const get2dContext = (canvas) => canvas.getContext('2d', { willReadFrequently: true });

const prepareContext = (canvas) => {
  const ctx = get2dContext(canvas);
  const dpr = Number(canvas.dataset.dpr || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
};

const clearCanvas = (canvas) => {
  const ctx = get2dContext(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  prepareContext(canvas);
};

const getCanvasPoint = (canvas, event) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = Number(canvas.dataset.dpr || 1);
  const logicalWidth = canvas.width / dpr || rect.width;
  const logicalHeight = canvas.height / dpr || rect.height;
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
  return {
    x: clamp((event.clientX - rect.left) * scaleX, 0, logicalWidth),
    y: clamp((event.clientY - rect.top) * scaleY, 0, logicalHeight),
  };
};

const drawLine = (canvas, from, to, options) => {
  const ctx = prepareContext(canvas);
  ctx.save();
  ctx.globalCompositeOperation = options.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.strokeWidth;
  if (from.x === to.x && from.y === to.y) {
    ctx.fillStyle = options.color;
    ctx.beginPath();
    ctx.arc(to.x, to.y, options.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawShape = (canvas, start, end, options) => {
  const ctx = prepareContext(canvas);
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.globalCompositeOperation = options.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.strokeWidth;
  if (options.tool === 'circle') {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(x, y, width, height);
  }
  ctx.restore();
};

const drawArrow = (canvas, start, end, options) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;

  const ctx = prepareContext(canvas);
  const angle = Math.atan2(dy, dx);
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const normalX = -directionY;
  const normalY = directionX;
  const headLength = Math.min(clamp(options.strokeWidth * 3.2, 14, 56), length * 0.5);
  const headWidth = Math.min(clamp(options.strokeWidth * 2.2, 10, 40), headLength * 0.9);
  const headBase = {
    x: end.x - directionX * headLength,
    y: end.y - directionY * headLength,
  };
  const shaftEnd = {
    x: headBase.x + directionX * Math.min(options.strokeWidth, headLength * 0.35),
    y: headBase.y + directionY * Math.min(options.strokeWidth, headLength * 0.35),
  };

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineWidth = options.strokeWidth;

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(shaftEnd.x, shaftEnd.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    headBase.x + normalX * headWidth / 2,
    headBase.y + normalY * headWidth / 2,
  );
  ctx.lineTo(
    headBase.x - normalX * headWidth / 2,
    headBase.y - normalY * headWidth / 2,
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawText = (canvas, text, point, options) => {
  const ctx = prepareContext(canvas);
  const fontSize = clamp(options.strokeWidth * 3.4, 16, 44);
  const lines = String(text || '').split('\n').map(line => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) return;

  ctx.save();
  ctx.fillStyle = options.color;
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => {
    ctx.fillText(line, point.x, point.y + index * fontSize * 1.28);
  });
  ctx.restore();
};

const restoreCanvasFromDataUrl = (canvas, dataUrl, onDone) => {
  const image = new Image();
  image.onload = () => {
    const ctx = get2dContext(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    prepareContext(canvas);
    onDone?.();
  };
  image.src = dataUrl;
};

const loadImageForCanvas = (imageUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败，无法导出批注图。'));
  image.src = imageUrl;
});

function InlineImageAnnotationEditor({
  imageUrl,
  onCancel,
  onDone,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const emptySnapshotRef = useRef('');
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const drawStateRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(colors[0]);
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasMarks, setHasMarks] = useState(false);
  const [textDraft, setTextDraft] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState(null);

  const updateHistoryState = useCallback(({ checkMarks = false } = {}) => {
    const canvas = canvasRef.current;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    if (checkMarks) {
      setHasMarks(Boolean(canvas && canvas.toDataURL('image/png') !== emptySnapshotRef.current));
    }
  }, []);

  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStackRef.current = [...undoStackRef.current.slice(-29), canvas.toDataURL('image/png')];
    redoStackRef.current = [];
    updateHistoryState();
  }, [updateHistoryState]);

  const resizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    // React Flow 会通过 transform 缩放整个节点。使用屏幕坐标尺寸会把缩放
    // 结果再写回 canvas，导致绘制层只占图片左上角的一部分。
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);
    const dpr = getCanvasDpr();
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    const previous = document.createElement('canvas');
    previous.width = canvas.width || nextWidth;
    previous.height = canvas.height || nextHeight;
    get2dContext(previous).drawImage(canvas, 0, 0);

    canvas.dataset.dpr = String(dpr);
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    clearCanvas(canvas);
    if (previous.width > 0 && previous.height > 0) {
      const ctx = get2dContext(canvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(previous, 0, 0, nextWidth, nextHeight);
      prepareContext(canvas);
    }
    emptySnapshotRef.current = (() => {
      const empty = document.createElement('canvas');
      empty.width = nextWidth;
      empty.height = nextHeight;
      return empty.toDataURL('image/png');
    })();
    updateHistoryState({ checkMarks: true });
  }, [updateHistoryState]);

  useLayoutEffect(() => {
    resizeCanvas();
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useLayoutEffect(() => {
    let frameId = 0;
    const updateToolbarPosition = () => {
      const wrap = wrapRef.current;
      const node = wrap?.closest?.('.custom-node');
      if (wrap) {
        const nodeRect = node?.getBoundingClientRect?.() || wrap.getBoundingClientRect();
        const titleRect = node?.querySelector?.('.node-header')?.getBoundingClientRect?.()
          || wrap.getBoundingClientRect();
        const next = {
          left: Math.round((nodeRect.left + nodeRect.width / 2) * 10) / 10,
          top: Math.round(Math.max(8, titleRect.top - IMAGE_ACTION_TOOLBAR_GAP) * 10) / 10,
        };
        setToolbarPosition(current => (
          current?.left === next.left && current?.top === next.top ? current : next
        ));
      }
      frameId = window.requestAnimationFrame(updateToolbarPosition);
    };

    updateToolbarPosition();
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearCanvas(canvas);
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateHistoryState({ checkMarks: true });
  }, [imageUrl, updateHistoryState]);

  const restoreSnapshot = useCallback((dataUrl) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    restoreCanvasFromDataUrl(canvas, dataUrl, () => updateHistoryState({ checkMarks: true }));
  }, [updateHistoryState]);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    const previous = undoStackRef.current.pop();
    if (!canvas || !previous) return;
    redoStackRef.current = [...redoStackRef.current.slice(-29), canvas.toDataURL('image/png')];
    restoreSnapshot(previous);
  }, [restoreSnapshot]);

  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    const next = redoStackRef.current.pop();
    if (!canvas || !next) return;
    undoStackRef.current = [...undoStackRef.current.slice(-29), canvas.toDataURL('image/png')];
    restoreSnapshot(next);
  }, [restoreSnapshot]);

  const restoreDraftBase = useCallback((draft) => {
    const canvas = canvasRef.current;
    if (!canvas || !draft?.imageData) return;
    const ctx = get2dContext(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(draft.imageData, 0, 0);
    prepareContext(canvas);
  }, []);

  const handlePointerDown = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) return;
    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPoint(canvas, event);
    if (tool === 'text') {
      setTextDraft({ x: point.x, y: point.y, value: '' });
      return;
    }

    pushUndo();
    const ctx = get2dContext(canvas);
    drawStateRef.current = {
      pointerId: event.pointerId,
      start: point,
      last: point,
      imageData: tool === 'arrow' || tool === 'rect' || tool === 'circle'
        ? ctx.getImageData(0, 0, canvas.width, canvas.height)
        : null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === 'pen' || tool === 'eraser') {
      drawLine(canvas, point, point, { tool, color, strokeWidth });
    }
  }, [color, isExporting, pushUndo, strokeWidth, tool]);

  const handlePointerMove = useCallback((event) => {
    const canvas = canvasRef.current;
    const draft = drawStateRef.current;
    if (!canvas || !draft || draft.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPoint(canvas, event);
    if (tool === 'pen' || tool === 'eraser') {
      drawLine(canvas, draft.last, point, { tool, color, strokeWidth });
      draft.last = point;
    } else if (tool === 'arrow' || tool === 'rect' || tool === 'circle') {
      restoreDraftBase(draft);
      if (tool === 'arrow') {
        drawArrow(canvas, draft.start, point, { color, strokeWidth });
      } else {
        drawShape(canvas, draft.start, point, { tool, color, strokeWidth });
      }
      draft.last = point;
    }
  }, [color, restoreDraftBase, strokeWidth, tool]);

  const finishPointer = useCallback((event) => {
    const draft = drawStateRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drawStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    updateHistoryState({ checkMarks: true });
  }, [updateHistoryState]);

  const commitTextDraft = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !textDraft) return;
    const text = textDraft.value.trim();
    setTextDraft(null);
    if (!text) return;
    pushUndo();
    drawText(canvas, text, textDraft, { color, strokeWidth });
    updateHistoryState({ checkMarks: true });
  }, [color, pushUndo, strokeWidth, textDraft, updateHistoryState]);

  const exportAnnotatedImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || isExporting) return;
    commitTextDraft();
    setIsExporting(true);
    try {
      const sourceImage = await loadImageForCanvas(imageUrl);
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const ctx = get2dContext(output);
      ctx.drawImage(sourceImage, 0, 0, output.width, output.height);
      ctx.drawImage(canvas, 0, 0);
      const annotatedImageDataUrl = output.toDataURL('image/png');
      await onDone?.({
        annotatedImageDataUrl,
        imageSize: {
          width: output.width,
          height: output.height,
        },
        hasMarks,
      });
    } catch (error) {
      console.error('批注图导出失败:', error);
      alert(error?.message || '批注图导出失败，请换一张允许导出的图片后再试。');
    } finally {
      setIsExporting(false);
    }
  }, [commitTextDraft, hasMarks, imageUrl, isExporting, onDone]);

  return (
    <div
      ref={wrapRef}
      className="inline-image-annotation nodrag nopan"
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      {toolbarPosition && typeof document !== 'undefined' && createPortal(
        <div
          className="inline-annotation-toolbar nodrag nopan"
          style={{ left: toolbarPosition.left, top: toolbarPosition.top }}
          role="toolbar"
          aria-label="图片批注工具栏"
        >
        <div className="inline-annotation-pill inline-annotation-cancel-pill">
          <button type="button" className="inline-annotation-labeled-button canvas-flow-hover-target" onClick={onCancel} aria-label="取消批注">
            <Icon name="x" size={16} />
            <span>取消</span>
          </button>
        </div>

        <div className="inline-annotation-pill inline-annotation-tools-pill">
          {tools.map(item => (
            <button
              key={item.id}
              type="button"
              className={`inline-annotation-tool canvas-flow-hover-target ${tool === item.id ? 'active' : ''}`}
              onClick={() => {
                commitTextDraft();
                setColorPanelOpen(false);
                setTool(item.id);
              }}
              data-tooltip={item.label}
              aria-label={item.label}
              aria-pressed={tool === item.id}
            >
              <Icon name={item.icon} size={16} />
            </button>
          ))}
          <span className="inline-annotation-divider" />
          <div className="inline-annotation-color-control">
            <button
              type="button"
              className="inline-annotation-color inline-annotation-tool canvas-flow-hover-target"
              onClick={() => setColorPanelOpen(current => !current)}
              data-tooltip="颜色"
              aria-label="颜色"
              aria-expanded={colorPanelOpen}
            >
              <span style={{ background: color }} />
            </button>
            {colorPanelOpen && (
              <div className="inline-annotation-color-panel" role="listbox" aria-label="批注颜色">
                {colors.map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`canvas-flow-hover-target ${color === item ? 'selected' : ''}`}
                    style={{ '--annotation-color': item }}
                    onClick={() => {
                      setColor(item);
                      setColorPanelOpen(false);
                    }}
                    aria-label={`颜色 ${item}`}
                    aria-selected={color === item}
                  />
                ))}
              </div>
            )}
          </div>
          <label className="inline-annotation-size canvas-flow-hover-target" data-tooltip="画笔粗细">
            <Icon name="batch" size={16} />
            <input
              type="range"
              min="3"
              max="28"
              step="1"
              value={strokeWidth}
              onChange={event => setStrokeWidth(Number(event.target.value))}
              aria-label="线宽"
            />
          </label>
          <span className="inline-annotation-divider" />
          <button type="button" className="inline-annotation-tool canvas-flow-hover-target" onClick={handleUndo} disabled={!canUndo} data-tooltip="撤销" aria-label="撤销">
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="inline-annotation-tool canvas-flow-hover-target" onClick={handleRedo} disabled={!canRedo} data-tooltip="重做" aria-label="重做">
            <Icon name="redo" size={16} />
          </button>
        </div>

        <div className="inline-annotation-pill inline-annotation-done-pill">
          <button
            type="button"
            className="inline-annotation-labeled-button inline-annotation-done canvas-flow-hover-target"
            onClick={exportAnnotatedImage}
            disabled={isExporting}
            aria-label="完成批注"
          >
            <Icon name="check" size={16} />
            <span>{isExporting ? '导出中' : '完成'}</span>
          </button>
        </div>
        </div>,
        document.body,
      )}

      <canvas
        ref={canvasRef}
        className={`inline-annotation-canvas tool-${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      />

      {textDraft && (
        <textarea
          className="inline-annotation-text-input nodrag nopan"
          value={textDraft.value}
          style={{
            left: textDraft.x,
            top: textDraft.y,
            color,
            fontSize: clamp(strokeWidth * 3.4, 16, 44),
          }}
          autoFocus
          rows={2}
          onChange={event => setTextDraft(current => current ? { ...current, value: event.target.value } : current)}
          onBlur={commitTextDraft}
          onPointerDown={event => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setTextDraft(null);
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitTextDraft();
            }
          }}
        />
      )}
    </div>
  );
}

export default InlineImageAnnotationEditor;
