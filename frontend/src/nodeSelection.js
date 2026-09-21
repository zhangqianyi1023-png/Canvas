export const isSelectableCanvasNode = (node) => Boolean(node?.id) && node.type !== 'generator';

export const isManualResultNode = (node) => (
  node?.type === 'result'
  && (
    node.data?.imageSource === 'upload'
    || node.data?.imageSource === 'annotation'
    || node.data?.videoSource === 'upload'
    || node.data?.audioSource === 'upload'
    || node.data?.textSource === 'manual'
  )
);

export const shouldOpenResultComposer = (node) => (
  node?.type === 'result'
  && !isManualResultNode(node)
);

export const NODE_SELECTION_SUPPRESS_SELECTOR = [
  '.image-action-toolbar',
  '.image-action-layer',
  '.result-image-upload-control',
  '.result-image-upload-status',
  '.result-image-upload-error',
  '.result-image-expanded',
  '.result-image-expanded-card',
  '.canvas-node-resize-handle',
  '.editable-node-title',
  '.node-hover-toolbar',
  '.node-hover-toolbar-anchor',
  '.node-hover-toolbar-portal',
  '.node-interactive-handle',
  '.react-flow__handle',
].join(', ');

export const shouldSuppressNodeSelectionTarget = (target) => (
  Boolean(target?.closest?.(NODE_SELECTION_SUPPRESS_SELECTOR))
);

export const getSelectableSelectedNodeIds = (nodes = []) => new Set(
  nodes
    .filter(node => node.selected && isSelectableCanvasNode(node))
    .map(node => node.id),
);

export const resolveOptionDragSelectedNodeIds = ({
  nodes = [],
  draggedNodeId,
  selectedIdsBeforeDrag,
}) => {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const draggedNode = nodesById.get(draggedNodeId);
  if (!isSelectableCanvasNode(draggedNode)) return new Set();

  const snapshotIds = new Set(
    Array.from(selectedIdsBeforeDrag || [])
      .filter(id => isSelectableCanvasNode(nodesById.get(id))),
  );
  if (snapshotIds.has(draggedNodeId) && snapshotIds.size > 1) {
    return snapshotIds;
  }

  const currentSelectedIds = getSelectableSelectedNodeIds(nodes);
  if (currentSelectedIds.has(draggedNodeId)) {
    return currentSelectedIds;
  }

  return new Set([draggedNodeId]);
};

export const computeShiftNodeSelection = ({
  nodes = [],
  clickedNodeId,
  selectedIdsBeforeClick,
}) => {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const clickedNode = nodesById.get(clickedNodeId);
  const nextSelectedIds = new Set(
    Array.from(selectedIdsBeforeClick || [])
      .filter(id => isSelectableCanvasNode(nodesById.get(id))),
  );

  if (!isSelectableCanvasNode(clickedNode)) {
    return nextSelectedIds;
  }

  if (nextSelectedIds.has(clickedNode.id)) {
    nextSelectedIds.delete(clickedNode.id);
  } else {
    nextSelectedIds.add(clickedNode.id);
  }

  return nextSelectedIds;
};
