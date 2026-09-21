export const shouldCloseExpandedImagesOnKeyDown = ({
  key,
  target,
  previewOpen = false,
}) => {
  if (key !== 'Escape' || previewOpen) return false;

  const tagName = target?.tagName?.toLowerCase?.();
  return tagName !== 'input'
    && tagName !== 'textarea'
    && !target?.isContentEditable;
};
