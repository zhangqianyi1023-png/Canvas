// ===== 分镜卡片节点（纯展示） =====
// nodeType === 'storyboardCard'
// 由分镜脚本生成器生成后创建。
// 8 字段：镜号/时长/运镜/画面说明/旁白/正prompt/反prompt/图片URL
// 点击占位图 → 通过 onCardPlaceholderClick 回调触发父层弹出生图浮层
// （不允许节点自身自动生图，确保用户自主付费）

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import Icon from '../components/Icon';

const FRAME_POINTER_INTENT_THRESHOLD = 8;

function StoryboardCardNode({ id, selected, data }) {
  const [copiedField, setCopiedField] = useState('');
  const framePointerStartRef = useRef(null);
  const card = useMemo(() => data?.card || {}, [data?.card]);
  const borderColor = selected ? 'var(--accent)' : 'var(--border-default)';
  const hasPositivePrompt = Boolean(card.imagePositivePrompt);
  const promptErrorText = card.promptError ? `⚠ ${card.promptError}` : '';
  const isFrameGenerating = ['running', 'saving'].includes(card.imageGenerationTask?.status);
  const isMultiSelected = Boolean(data?.isMultiSelected);

  const handlePlaceholderClick = useCallback((event) => {
    event.stopPropagation();
    if (data?.onCardPlaceholderClick) {
      data.onCardPlaceholderClick(id, card);
    }
  }, [data, id, card]);

  const handleFramePointerDown = useCallback((event) => {
    event.stopPropagation();
    framePointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const handleFramePointerUp = useCallback((event) => {
    event.stopPropagation();
    const start = framePointerStartRef.current;
    framePointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) <= FRAME_POINTER_INTENT_THRESHOLD) {
      handlePlaceholderClick(event);
    }
  }, [handlePlaceholderClick]);

  const handleFramePointerCancel = useCallback((event) => {
    event.stopPropagation();
    framePointerStartRef.current = null;
  }, []);

  const handleCopy = useCallback(async (text, fieldKey) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedField(fieldKey);
      window.setTimeout(() => {
        setCopiedField(current => current === fieldKey ? '' : current);
      }, 1200);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="custom-node storyboard-card-node"
      style={{
        border: `2px solid ${borderColor}`,
        transition: 'border-color 0.2s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <div className="node-header">
        <span className="node-title">
          <Icon name="storyboardWorkbench" size={16} /> {card.shotNo || `分镜 ${String(card.order || 1).padStart(2, '0')}`}
        </span>
        <span className="category">{card.duration || ''}</span>
      </div>

      <div className="node-body">
        <div
          className={`storyboard-node-visual nodrag ${card.imageUrl ? 'has-image' : 'placeholder-clickable'} ${isFrameGenerating ? 'is-generating' : ''}`}
          onPointerDown={handleFramePointerDown}
          onPointerUp={handleFramePointerUp}
          onPointerCancel={handleFramePointerCancel}
          onClick={(event) => event.stopPropagation()}
          title={isFrameGenerating ? '本帧图片生成中' : card.imageUrl ? '点击重新生成本帧' : '点击生成本帧图片'}
        >
          {card.imageUrl ? (
            <img src={card.imageUrl} alt={card.shotNo || '分镜图'} loading="lazy" decoding="async" />
          ) : (
            <div className="storyboard-card-placeholder">
              <Icon name="imageGen" size={22} />
              <span>{isFrameGenerating ? '本帧生成中...' : hasPositivePrompt ? '点击生成本帧' : promptErrorText || '绘图提示词生成中...'}</span>
            </div>
          )}
          {isFrameGenerating && (
            <div className="storyboard-frame-loading" aria-label="本帧图片生成中">
              <span className="storyboard-frame-loading-spinner" />
              <strong>生成中</strong>
            </div>
          )}
        </div>

        {card.cameraMovement && (
          <div className="storyboard-node-field">
            <span>运镜</span>
            <p>{card.cameraMovement}</p>
          </div>
        )}
        {card.visualDescription && (
          <div className="storyboard-node-field">
            <span>画面</span>
            <p>{card.visualDescription}</p>
          </div>
        )}
        {card.narration && (
          <div className="storyboard-node-field">
            <span>旁白</span>
            <p>{card.narration}</p>
          </div>
        )}

        <div className="storyboard-prompt-block">
          <div className="storyboard-prompt-block-label">
            <span>正向 prompt</span>
            <button
              type="button"
              className="storyboard-prompt-copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(card.imagePositivePrompt, 'positive');
              }}
              disabled={!card.imagePositivePrompt}
            >
              {copiedField === 'positive' ? '已复制' : <><Icon name="copy" size={11} /> 复制</>}
            </button>
          </div>
          <p>{card.imagePositivePrompt || promptErrorText || '（生成中...）'}</p>
        </div>

        {card.imageNegativePrompt && (
          <div className="storyboard-prompt-block negative">
            <div className="storyboard-prompt-block-label">
              <span>反向 prompt</span>
              <button
                type="button"
                className="storyboard-prompt-copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(card.imageNegativePrompt, 'negative');
                }}
              >
                {copiedField === 'negative' ? '已复制' : <><Icon name="copy" size={11} /> 复制</>}
              </button>
            </div>
            <p>{card.imageNegativePrompt}</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar hidden={isMultiSelected || selected} onDelete={() => data?.onDeleteNode?.(id)} />
    </div>
  );
}

export default memo(StoryboardCardNode);
