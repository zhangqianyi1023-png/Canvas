import { useEffect, useRef } from 'react';

const DOT_SIZE = 2;
const DOT_GAP = 15;
const PROXIMITY = 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getDpr = () => clamp(window.devicePixelRatio || 1, 1, 2);

const parseHexColor = (value, fallback) => {
  const normalized = String(value || '').trim().replace(/^#/, '');
  const hex = normalized.length === 3
    ? normalized.split('').map(character => character.repeat(2)).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

function CanvasDotGrid({ viewportTransform = [0, 0, 1] }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef({ x: -9999, y: -9999 });
  const viewportRef = useRef(viewportTransform);
  const frameRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scheduleDrawRef = useRef(() => {});

  useEffect(() => {
    viewportRef.current = viewportTransform;
    scheduleDrawRef.current();
  }, [viewportTransform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.parentElement;
    if (!root || !canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    let canvasWidth = 0;
    let canvasHeight = 0;
    let dpr = getDpr();

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const nextDpr = getDpr();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const pixelWidth = Math.round(nextWidth * nextDpr);
      const pixelHeight = Math.round(nextHeight * nextDpr);
      dpr = nextDpr;
      canvasWidth = nextWidth;
      canvasHeight = nextHeight;
      if (canvas.width === pixelWidth && canvas.height === pixelHeight) return false;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      return true;
    };

    const draw = () => {
      frameRef.current = 0;
      resize();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      const [viewportX = 0, viewportY = 0, zoom = 1] = viewportRef.current || [];
      const safeZoom = Math.max(zoom, 0.1);
      const dotRadius = DOT_SIZE * safeZoom / 2;
      const cell = (DOT_SIZE + DOT_GAP) * safeZoom;
      if (dotRadius < 0.3 || cell < 1) return;

      const offsetX = ((viewportX % cell) + cell) % cell;
      const offsetY = ((viewportY % cell) + cell) % cell;
      const columns = Math.ceil(canvasWidth / cell) + 2;
      const rows = Math.ceil(canvasHeight / cell) + 2;
      const pointer = pointerRef.current;
      const styles = getComputedStyle(root);
      const baseColor = parseHexColor(styles.getPropertyValue('--rf-dots'), { r: 51, g: 51, b: 51 });
      const activeColor = parseHexColor(styles.getPropertyValue('--rf-dots-active'), { r: 255, g: 255, b: 255 });
      const baseFillStyle = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
      const proximity = PROXIMITY * safeZoom;
      const proximitySquared = proximity * proximity;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (isDraggingRef.current) {
        context.fillStyle = baseFillStyle;
        for (let row = -1; row < rows; row += 1) {
          const y = offsetY + row * cell;
          for (let column = -1; column < columns; column += 1) {
            const x = offsetX + column * cell;
            context.beginPath();
            context.arc(x, y, dotRadius, 0, Math.PI * 2);
            context.fill();
          }
        }
        return;
      }

      for (let row = -1; row < rows; row += 1) {
        const y = offsetY + row * cell;
        for (let column = -1; column < columns; column += 1) {
          const x = offsetX + column * cell;
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          const intensity = distanceSquared <= proximitySquared
            ? 1 - Math.sqrt(distanceSquared) / proximity
            : 0;
          const radius = dotRadius * (1 + intensity * 0.7);
          const red = Math.round(baseColor.r + (activeColor.r - baseColor.r) * intensity);
          const green = Math.round(baseColor.g + (activeColor.g - baseColor.g) * intensity);
          const blue = Math.round(baseColor.b + (activeColor.b - baseColor.b) * intensity);

          context.beginPath();
          context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const scheduleDraw = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(draw);
    };
    scheduleDrawRef.current = scheduleDraw;

    const handlePointerMove = (event) => {
      const rect = root.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      scheduleDraw();
    };

    const handlePointerDown = () => {
      isDraggingRef.current = true;
      scheduleDraw();
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      scheduleDraw();
    };

    const clearPointer = () => {
      pointerRef.current = { x: -9999, y: -9999 };
      isDraggingRef.current = false;
      scheduleDraw();
    };

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleDraw);
    observer?.observe(root);
    root.addEventListener('pointerdown', handlePointerDown, { passive: true });
    root.addEventListener('pointerup', handlePointerUp, { passive: true });
    root.addEventListener('pointermove', handlePointerMove, { passive: true });
    root.addEventListener('pointerleave', clearPointer);
    root.addEventListener('pointercancel', clearPointer);
    window.addEventListener('resize', scheduleDraw);
    draw();

    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      scheduleDrawRef.current = () => {};
      observer?.disconnect();
      root.removeEventListener('pointerdown', handlePointerDown);
      root.removeEventListener('pointerup', handlePointerUp);
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', clearPointer);
      root.removeEventListener('pointercancel', clearPointer);
      window.removeEventListener('resize', scheduleDraw);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  return <canvas ref={canvasRef} className="canvas-dot-grid-layer" aria-hidden="true" />;
}

export default CanvasDotGrid;
