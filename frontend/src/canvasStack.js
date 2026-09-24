const uniqueIds = (values = []) => [...new Set(values.filter(Boolean))];

const isStackableNode = (node) => (
  node
  && !node.hidden
  && !node.parentNode
  && !['group', 'stack', 'generator'].includes(node.type)
);

export const createCanvasStackGraph = ({
  nodes = [],
  selectedIds = [],
  stackId = `stack_${Date.now()}`,
  label = '素材堆',
} = {}) => {
  const ids = new Set(uniqueIds(selectedIds));
  const children = nodes.filter(node => ids.has(node.id) && isStackableNode(node));
  if (children.length < 2) return null;

  const minX = Math.min(...children.map(node => node.position?.x || 0));
  const minY = Math.min(...children.map(node => node.position?.y || 0));
  const maxX = Math.max(...children.map(node => (node.position?.x || 0) + (node.width || node.style?.width || 280)));
  const maxY = Math.max(...children.map(node => (node.position?.y || 0) + (node.height || node.style?.height || 220)));
  const childIds = children.map(node => node.id);

  return {
    stack: {
      id: stackId,
      type: 'stack',
      position: { x: minX, y: minY },
      style: { width: Math.max(220, maxX - minX), height: Math.max(150, maxY - minY) },
      data: { label, childIds, count: childIds.length },
      selected: true,
      zIndex: 0,
    },
    childIds,
    nodes: nodes.map(node => (
      childIds.includes(node.id)
        ? { ...node, hidden: true, selected: false }
        : { ...node, selected: false }
    )),
  };
};

export const unstackCanvasNodes = (nodes = [], stackId) => {
  const stack = nodes.find(node => node.id === stackId && node.type === 'stack');
  if (!stack) return nodes;
  const childIds = new Set(stack.data?.childIds || []);
  return nodes
    .filter(node => node.id !== stackId)
    .map(node => childIds.has(node.id)
      ? { ...node, hidden: false, selected: true }
      : { ...node, selected: false });
};

export const addNodeToCanvasStack = (nodes = [], stackId, nodeId) => {
  if (!stackId || !nodeId || stackId === nodeId) return nodes;
  const stack = nodes.find(node => node.id === stackId && node.type === 'stack');
  const child = nodes.find(node => node.id === nodeId);
  if (!stack || !isStackableNode(child)) return nodes;
  const childIds = uniqueIds([...(stack.data?.childIds || []), nodeId]);

  return nodes.map(node => {
    if (node.id === stackId) {
      return {
        ...node,
        data: {
          ...node.data,
          childIds,
          count: childIds.length,
          coverNodeId: nodeId,
        },
      };
    }
    if (node.id === nodeId) {
      return { ...node, hidden: true, selected: false };
    }
    return node;
  });
};

export const removeNodeFromCanvasStack = (nodes = [], stackId, nodeId, position) => {
  if (!stackId || !nodeId) return nodes;
  const stack = nodes.find(node => node.id === stackId && node.type === 'stack');
  if (!stack) return nodes;
  const childIds = stack.data?.childIds || [];
  if (!childIds.includes(nodeId)) return nodes;

  const remainingIds = childIds.filter(childId => childId !== nodeId);
  const shouldDissolve = remainingIds.length < 2;
  const restoreIds = shouldDissolve ? new Set(childIds) : new Set([nodeId]);

  return nodes
    .filter(node => !(shouldDissolve && node.id === stackId))
    .map(node => {
      if (!restoreIds.has(node.id)) {
        if (node.id === stackId) {
          return {
            ...node,
            data: {
              ...node.data,
              childIds: remainingIds,
              count: remainingIds.length,
              coverNodeId: remainingIds[remainingIds.length - 1] || '',
            },
          };
        }
        return node;
      }

      const nextPosition = node.id === nodeId && position
        ? { x: position.x, y: position.y }
        : node.position;
      return {
        ...node,
        hidden: false,
        selected: node.id === nodeId,
        parentNode: undefined,
        extent: undefined,
        position: nextPosition,
      };
    });
};
