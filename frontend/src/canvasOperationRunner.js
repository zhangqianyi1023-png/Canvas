import {
  createCanvasOperation,
  withCanvasContract,
} from './canvasNodeContract.js';

const uniqueStrings = (values = []) => [...new Set(
  values
    .map(value => String(value || '').trim())
    .filter(Boolean),
)];

const edgeKey = (source, target) => `${source}\u0000${target}`;

/**
 * Creates a serializable operation request for the backend or an Agent plan.
 * It intentionally does not call a provider; execution stays in App/backend.
 */
export const createCanvasOperationRequest = (options = {}) => {
  const operation = createCanvasOperation(options);
  return {
    ...operation,
    status: 'queued',
  };
};

/**
 * Adds a generated result to the graph without mutating its source nodes.
 * Existing source→result edges are preserved and not duplicated.
 */
export const applyCanvasOperationResult = ({
  nodes = [],
  edges = [],
  resultNode,
  operation,
  sourceNodeIds = [],
  references = [],
  taskId = '',
  parentVersion = '',
} = {}) => {
  if (!resultNode?.id) throw new Error('Canvas 结果节点必须包含 id');

  const sourceIds = uniqueStrings(sourceNodeIds);
  const nextOperation = createCanvasOperation({
    ...operation,
    sourceNodeIds: sourceIds,
    references,
    taskId,
    parentVersion,
    operation: operation?.operation || 'generate',
  });
  const nextResultNode = withCanvasContract(resultNode, {
    ...nextOperation,
    status: 'completed',
  });
  const existingEdges = new Set(edges.map(edge => edgeKey(edge.source, edge.target)));
  const nextEdges = sourceIds.reduce((result, sourceId) => {
    if (!nodes.some(node => node.id === sourceId)) return result;
    const key = edgeKey(sourceId, resultNode.id);
    if (existingEdges.has(key)) return result;
    result.push({
      id: `canvas_${sourceId}_${resultNode.id}`,
      source: sourceId,
      target: resultNode.id,
      data: { canvasOperation: nextOperation.operation },
    });
    existingEdges.add(key);
    return result;
  }, []);

  return {
    nodes: [...nodes, nextResultNode],
    edges: [...edges, ...nextEdges],
    operation: nextOperation,
  };
};

