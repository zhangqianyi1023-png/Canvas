const GRID_GAP = 12;
const GRID_PADDING = 28;
const VIEWPORT_MARGIN_X = 48;
const VIEWPORT_MARGIN_Y = 96;
const LARGE_VIEW_MIN_CARD_WIDTH = 128;
const MOBILE_MIN_CARD_WIDTH = 112;
const MAX_CARD_WIDTH = 360;

export function getExpandedImageGridClass(imageCount) {
  if (imageCount <= 2) return 'is-grid-two';
  if (imageCount <= 4) return 'is-grid-four';
  return 'is-grid-many';
}

export function calculateExpandedImageLayout({
  imageCount = 1,
  aspectRatio = 1,
  nodeWidth = 0,
  fallbackCardWidth = 220,
  viewportWidth = 1280,
  viewportHeight = 800,
} = {}) {
  const safeImageCount = Math.max(1, Number(imageCount) || 1);
  const columns = safeImageCount <= 4 ? 2 : 3;
  const rows = Math.ceil(safeImageCount / columns);
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1280;
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const minCardWidth = safeViewportWidth <= 720 ? MOBILE_MIN_CARD_WIDTH : LARGE_VIEW_MIN_CARD_WIDTH;

  const preferredBaseWidth = Math.round(nodeWidth || fallbackCardWidth);
  const preferredCardWidth = Math.max(minCardWidth, preferredBaseWidth + 100);
  const availableWidth = Math.max(minCardWidth * columns + GRID_PADDING + GRID_GAP * (columns - 1), safeViewportWidth - VIEWPORT_MARGIN_X);
  const availableHeight = Math.max(minCardWidth / safeAspectRatio + GRID_PADDING, safeViewportHeight - VIEWPORT_MARGIN_Y);
  const widthLimitedCard = Math.floor((availableWidth - GRID_PADDING - GRID_GAP * (columns - 1)) / columns);
  const heightLimitedCard = Math.floor(((availableHeight - GRID_PADDING - GRID_GAP * (rows - 1)) / rows) * safeAspectRatio);
  const cardWidth = Math.max(
    minCardWidth,
    Math.min(preferredCardWidth, widthLimitedCard, heightLimitedCard, MAX_CARD_WIDTH),
  );

  return {
    cardWidth,
    columns,
    rows,
    gridClass: getExpandedImageGridClass(safeImageCount),
    maxHeight: Math.round(availableHeight),
    shouldScroll: safeImageCount > 4,
  };
}
