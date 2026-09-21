export const HANDLE_HIT_OUTER_REACH = 72;
export const HANDLE_HIT_INNER_REACH = 8;
export const HANDLE_HIT_VERTICAL_REACH = 72;
export const HANDLE_HIT_WIDTH = HANDLE_HIT_OUTER_REACH + HANDLE_HIT_INNER_REACH;
export const HANDLE_HIT_HEIGHT = HANDLE_HIT_VERTICAL_REACH * 2;
export const HANDLE_VISUAL_SIZE = 24;
export const HANDLE_REST_GAP = 20;
export const HANDLE_REST_OFFSET = HANDLE_REST_GAP + HANDLE_VISUAL_SIZE / 2;

export function getHandleRestOffset(side) {
  const hitCenterFromBoundary = (HANDLE_HIT_OUTER_REACH - HANDLE_HIT_INNER_REACH) / 2;
  return side === 'right'
    ? HANDLE_REST_OFFSET - hitCenterFromBoundary
    : -HANDLE_REST_OFFSET + hitCenterFromBoundary;
}

export function resolveHandleFollowOffset(pointer, rect, zoom = 1, visualSize = HANDLE_VISUAL_SIZE) {
  const safeZoom = zoom || 1;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxOffsetX = Math.max(0, (rect.width / safeZoom - visualSize) / 2);
  const maxOffsetY = Math.max(0, (rect.height / safeZoom - visualSize) / 2);

  return {
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, (pointer.x - centerX) / safeZoom)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, (pointer.y - centerY) / safeZoom)),
  };
}
