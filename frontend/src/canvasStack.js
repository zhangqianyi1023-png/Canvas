const uniqueIds = (values = []) => [...new Set(values.filter(Boolean))];

export const createCanvasStackGraph = ({
  nodes = [],
  selectedIds = [],
  stackId = `stack_${Date.now()}`,
  label = '素材堆',
} = {}) => {
  const ids = new Set(uniqueIds(selectedIds));
  const children = nodes.filter(node => (
    ids.has(node.id)
    && !node.hidden
    && !node.parentNode
    && !['group', 'stack', 'generator'].includes(node.type)
  ));
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

