import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const PREVIEW_MIN_SCALE = 0.5;
const PREVIEW_MAX_SCALE = 6;
const PREVIEW_ZOOM_SPEED = 0.0018;

const downloadImage = (url, name = 'canvas-image') => {
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.png`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function ImagePreviewOverlay({
  imageUrl,
  images = [],
  initialIndex = 0,
  historyImages = [],
  alt = '图片大图预览',
  nodeId,
  apiConfigs = [],
  apiProviders = [],
  onClose,
}) {
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  const draggingRef = useRef(false);
  const panDragRef = useRef(null);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [previewTransform, setPreviewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const previewImages = useMemo(() => {
    const list = (Array.isArray(images) && images.length > 0 ? images : [imageUrl]).filter(Boolean);
    return [...new Set(list)];
  }, [images, imageUrl]);
  const initialImageIndex = useMemo(() => {
    if (!imageUrl) return 0;
    const byUrl = previewImages.indexOf(imageUrl);
    if (byUrl >= 0) return byUrl;
    return Math.max(0, Math.min(initialIndex || 0, previewImages.length - 1));
  }, [imageUrl, initialIndex, previewImages]);
  const [activeIndex, setActiveIndex] = useState(initialImageIndex);
  const activeImageUrl = previewImages[activeIndex] || imageUrl;
  const hasMultipleImages = previewImages.length > 1;

  const availableHistoryImages = useMemo(() => (
    [...new Set((historyImages || []).filter(url => url && url !== activeImageUrl))]
  ), [historyImages, activeImageUrl]);
  const selectedHistoryImage = availableHistoryImages[selectedHistoryIndex] || '';

  useEffect(() => {
    if (!imageUrl) return;
    setActiveIndex(initialImageIndex);
    setCompareEnabled(false);
    setComparePosition(50);
    setSelectedHistoryIndex(0);
    setPreviewTransform({ scale: 1, x: 0, y: 0 });
    setIsPanning(false);
  }, [imageUrl, initialImageIndex]);

  useEffect(() => () => {
    panDragRef.current = null;
  }, []);

  useEffect(() => {
    if (selectedHistoryIndex < availableHistoryImages.length) return;
    setSelectedHistoryIndex(0);
  }, [availableHistoryImages.length, selectedHistoryIndex]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const updateFrameSize = () => {
      setFrameSize({
        width: frame.clientWidth,
        height: frame.clientHeight,
      });
    };
    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [activeImageUrl]);

  const resetPreviewTransform = useCallback(() => {
    setPreviewTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  const goToImage = useCallback((direction) => {
    if (!hasMultipleImages) return;
    setActiveIndex((current) => {
      const next = (current + direction + previewImages.length) % previewImages.length;
      return next;
    });
    setCompareEnabled(false);
    setComparePosition(50);
    setSelectedHistoryIndex(0);
    resetPreviewTransform();
  }, [hasMultipleImages, previewImages.length, resetPreviewTransform]);

  useEffect(() => {
    if (!imageUrl) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key === 'ArrowLeft' && hasMultipleImages) {
        event.preventDefault();
        goToImage(-1);
        return;
      }
      if (event.key === 'ArrowRight' && hasMultipleImages) {
        event.preventDefault();
        goToImage(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToImage, hasMultipleImages, imageUrl, onClose]);

  const setPositionFromPointer = useCallback((clientX) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const nextPosition = ((clientX - rect.left) / rect.width) * 100;
    setComparePosition(Math.max(0, Math.min(100, nextPosition)));
  }, []);

  const toggleCompare = useCallback(() => {
    if (availableHistoryImages.length === 0) return;
    setCompareEnabled(enabled => !enabled);
  }, [availableHistoryImages.length]);

  const handlePreviewWheel = useCallback((event) => {
    const content = contentRef.current;
    if (!content) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.image-preview-toolbar, .image-preview-history-panel, .image-preview-nav, .result-image-preview-close')) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = content.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };

    setPreviewTransform((current) => {
      const nextScale = Math.max(
        PREVIEW_MIN_SCALE,
        Math.min(PREVIEW_MAX_SCALE, current.scale * Math.exp(-event.deltaY * PREVIEW_ZOOM_SPEED))
      );

      if (Math.abs(nextScale - current.scale) < 0.001) return current;

      const imagePoint = {
        x: (pointer.x - current.x) / current.scale,
        y: (pointer.y - current.y) / current.scale,
      };

      return {
        scale: nextScale,
        x: pointer.x - imagePoint.x * nextScale,
        y: pointer.y - imagePoint.y * nextScale,
      };
    });
  }, []);

  const beginPanDrag = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.image-preview-compare-handle, .image-preview-history-panel')) return;

    event.preventDefault();
    event.stopPropagation();
    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewTransform.x,
      originY: previewTransform.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [previewTransform.x, previewTransform.y]);

  const handlePanMove = useCallback((event) => {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    setPreviewTransform(current => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }, []);

  const endPanDrag = useCallback((event) => {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panDragRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  if (!imageUrl) return null;

  return createPortal(
    <>
      <div
        className="modal-overlay result-image-preview-overlay nodrag nopan"
        onWheel={handlePreviewWheel}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="image-preview-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={compareEnabled ? 'active' : ''}
            disabled={availableHistoryImages.length === 0}
            title={availableHistoryImages.length === 0 ? '暂无历史图片' : '对比原图'}
            onClick={toggleCompare}
          >
            <Icon name="copy" size={14} />
            <span>对比原图</span>
          </button>
          <span className="image-preview-toolbar-divider" />
          <button
            type="button"
            title="复位视图"
            onClick={resetPreviewTransform}
          >
            <Icon name="refresh" size={14} />
            <span>复位</span>
          </button>
          <button type="button" onClick={() => downloadImage(activeImageUrl, `image-${nodeId || Date.now()}`)}>
            <Icon name="save" size={14} />
            <span>下载</span>
          </button>
        </div>

        <div
          ref={contentRef}
          className="image-preview-content"
        >
          {hasMultipleImages && (
            <>
              <button
                type="button"
                className="image-preview-nav image-preview-nav-prev"
                aria-label="上一张"
                onClick={(event) => {
                  event.stopPropagation();
                  goToImage(-1);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="image-preview-nav image-preview-nav-next"
                aria-label="下一张"
                onClick={(event) => {
                  event.stopPropagation();
                  goToImage(1);
                }}
              >
                ›
              </button>
              <div className="image-preview-counter">
                {activeIndex + 1} / {previewImages.length}
              </div>
            </>
          )}
          <div
            ref={frameRef}
            className={`image-preview-compare-frame ${compareEnabled && selectedHistoryImage ? 'compare-on' : ''} ${isPanning ? 'is-panning' : ''}`}
            style={{
              transform: `translate3d(${previewTransform.x}px, ${previewTransform.y}px, 0) scale(${previewTransform.scale})`,
            }}
            onPointerDown={beginPanDrag}
            onPointerMove={handlePanMove}
            onPointerUp={endPanDrag}
            onPointerCancel={endPanDrag}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resetPreviewTransform();
            }}
          >
            <img className="image-preview-current" src={activeImageUrl} alt={alt} draggable={false} />
            {selectedHistoryImage && (
              <div
                className="image-preview-history-layer"
                style={{ width: `${comparePosition}%` }}
              >
                <img
                  src={selectedHistoryImage}
                  alt={`历史版本 ${selectedHistoryIndex + 1}`}
                  draggable={false}
                  style={{
                    width: frameSize.width || undefined,
                    height: frameSize.height || undefined,
                  }}
                />
              </div>
            )}
            <div
              className="image-preview-compare-handle"
              style={{ left: `${comparePosition}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                draggingRef.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setPositionFromPointer(event.clientX);
              }}
              onPointerMove={(event) => {
                if (!draggingRef.current) return;
                event.preventDefault();
                setPositionFromPointer(event.clientX);
              }}
              onPointerUp={(event) => {
                draggingRef.current = false;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
              }}
            />

            {compareEnabled && availableHistoryImages.length > 0 && (
              <div className="image-preview-history-panel">
                <span>历史版本</span>
                <div className="image-preview-history-list">
                  {availableHistoryImages.map((url, index) => (
                    <button
                      type="button"
                      key={`${url.slice(0, 48)}_${index}`}
                      className={selectedHistoryIndex === index ? 'active' : ''}
                      title={`历史版本 ${index + 1}`}
                      onClick={() => setSelectedHistoryIndex(index)}
                    >
                      <img src={url} alt={`历史版本 ${index + 1}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="result-image-preview-close"
          aria-label="关闭预览"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <Icon name="x" size={18} />
        </button>
      </div>

    </>,
    document.body
  );
}

export default ImagePreviewOverlay;
