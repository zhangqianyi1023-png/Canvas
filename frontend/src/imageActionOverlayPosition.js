const TOOLBAR_HEIGHT = 44;
const VIEWPORT_MARGIN = 8;
export const IMAGE_ACTION_TOOLBAR_GAP = 6;

export const resolveImageActionPortalPosition = (rect, viewport = {}) => {
  const viewportWidth = Number(viewport.width) > 0 ? Number(viewport.width) : 1280;
  const viewportHeight = Number(viewport.height) > 0 ? Number(viewport.height) : 800;
  if (!rect?.width || !rect?.height) return null;

  const isOutsideViewport = (
    rect.right <= 0
    || rect.left >= viewportWidth
    || rect.bottom <= 0
    || rect.top >= viewportHeight
  );
  if (isOutsideViewport) return null;

  const centerX = rect.left + rect.width / 2;
  const abovePosition = rect.top - IMAGE_ACTION_TOOLBAR_GAP;
  const minimumTopPoint = TOOLBAR_HEIGHT + VIEWPORT_MARGIN;
  const belowPosition = rect.bottom + IMAGE_ACTION_TOOLBAR_GAP + TOOLBAR_HEIGHT;
  const top = abovePosition >= minimumTopPoint
    ? abovePosition
    : belowPosition <= viewportHeight - VIEWPORT_MARGIN
      ? belowPosition
      : minimumTopPoint;

  return {
    left: Math.round(Math.min(
      Math.max(centerX, VIEWPORT_MARGIN),
      viewportWidth - VIEWPORT_MARGIN,
    ) * 10) / 10,
    top: Math.round(top * 10) / 10,
  };
};
