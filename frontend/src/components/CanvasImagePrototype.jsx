import { useMemo, useState } from 'react';
import Icon from './Icon';

const OPERATION_COPY = {
  outpaint: { title: '扩图', description: '扩展画布边界，保留主体并为新增区域预留生成空间。' },
  erase: { title: '擦除', description: '用笔刷标记需要移除的区域，原型阶段以标记层模拟结果。' },
  cutout: { title: '抠图', description: '提取主体并预览透明背景，后续可接入真实分割模型。' },
  enhance: { title: '增强', description: '选择清晰度和细节等级，原型阶段沿用源图作为预览。' },
  split: { title: 'Quick Split', description: '把图片按网格切成多个画布节点，保留每块的裁剪区域。' },
};

const OUTPAINT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

function CanvasImagePrototype({ operation, imageUrl, onCancel, onConfirm }) {
  const [outpaintRatio, setOutpaintRatio] = useState('16:9');
  const [brushSize, setBrushSize] = useState(42);
  const [grid, setGrid] = useState('2x2');
  const [enhanceLevel, setEnhanceLevel] = useState('2x');
  const [busy, setBusy] = useState(false);
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

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.({
        operation,
        outpaintRatio,
        brushSize,
        enhanceLevel,
        grid,
        cells: operation === 'split' ? gridCells : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

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
        {imageUrl ? <img src={imageUrl} alt="原图预览" /> : <div className="canvas-image-prototype-empty">等待图片</div>}
        {operation === 'outpaint' && <div className="canvas-image-prototype-frame" data-ratio={outpaintRatio} />}
        {operation === 'erase' && <div className="canvas-image-prototype-mask"><span style={{ width: `${brushSize}px`, height: `${brushSize}px` }} /></div>}
        {operation === 'cutout' && <div className="canvas-image-prototype-cutout-label"><Icon name="check" size={13} />透明背景预览</div>}
        {operation === 'split' && <div className={`canvas-image-prototype-grid grid-${grid.replace('x', '-')}`}>
          {gridCells.map(cell => <span key={cell.index} />)}
        </div>}
      </div>
      <p className="canvas-image-prototype-description">{copy.description}</p>
      <div className="canvas-image-prototype-controls">
        {operation === 'outpaint' && (
          <label>目标比例
            <select value={outpaintRatio} onChange={event => setOutpaintRatio(event.target.value)}>
              {OUTPAINT_RATIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}
        {operation === 'erase' && (
          <label>笔刷大小 <input type="range" min="16" max="96" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} /></label>
        )}
        {operation === 'enhance' && (
          <label>增强等级
            <select value={enhanceLevel} onChange={event => setEnhanceLevel(event.target.value)}>
              <option value="2x">2× 清晰度</option><option value="4x">4× 细节</option>
            </select>
          </label>
        )}
        {operation === 'split' && (
          <label>切分网格
            <select value={grid} onChange={event => setGrid(event.target.value)}>
              <option value="2x2">2 × 2</option><option value="3x3">3 × 3</option><option value="4x4">4 × 4</option>
            </select>
          </label>
        )}
        {operation === 'cutout' && <span className="canvas-image-prototype-chip">主体保留 · 背景移除</span>}
      </div>
      <div className="canvas-image-prototype-actions">
        <button type="button" className="canvas-image-prototype-secondary" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="canvas-image-prototype-primary" onClick={confirm} disabled={busy}>
          <Icon name={busy ? 'loader' : 'spark'} size={14} />{busy ? '处理中…' : operation === 'split' ? '切分到画布' : '生成原型结果'}
        </button>
      </div>
    </div>
  );
}

export default CanvasImagePrototype;
