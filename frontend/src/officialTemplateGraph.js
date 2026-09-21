import { migrateLegacyImageGraph, restoreImageNodePairs } from './imageNodeModel.js';
import { migrateLegacyPromptTemplate } from './textNodeMigration.js';
import {
  collectTemplateMediaUrls,
  removeTransientProviderFrames,
  stripRuntimeNodeData,
} from './workflowTemplates.js';

export const OFFICIAL_TEMPLATE_SCHEMA_VERSION = 1;

const defaultTokenFactory = () => {
  let counter = 0;
  return () => `${Date.now()}_${counter++}_${Math.random().toString(16).slice(2)}`;
};

const numberValue = (value, fallback) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
};

const nodeSize = (node) => ({
  width: numberValue(node?.style?.width ?? node?.width, 260),
  height: numberValue(node?.style?.height ?? node?.height, 180),
});

const visibleNodes = nodes => nodes.filter(node => node?.type !== 'generator' && !node?.hidden);

const calculateBounds = (nodes) => {
  const candidates = visibleNodes(nodes);
  if (candidates.length === 0) return { x: 0, y: 0, width: 320, height: 220 };
  const left = Math.min(...candidates.map(node => numberValue(node.position?.x, 0)));
  const top = Math.min(...candidates.map(node => numberValue(node.position?.y, 0)));
  const right = Math.max(...candidates.map(node => (
    numberValue(node.position?.x, 0) + nodeSize(node).width
  )));
  const bottom = Math.max(...candidates.map(node => (
    numberValue(node.position?.y, 0) + nodeSize(node).height
  )));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const normalizeGraph = (snapshot) => {
  const promptMigrated = migrateLegacyPromptTemplate({
    ...snapshot,
    nodes: Array.isArray(snapshot?.nodes) ? snapshot.nodes : [],
    edges: Array.isArray(snapshot?.edges) ? snapshot.edges : [],
  });
  const imageMigrated = migrateLegacyImageGraph(promptMigrated.nodes, promptMigrated.edges);
  const explicitPairs = Array.isArray(promptMigrated.pairs) ? promptMigrated.pairs : [];
  const restoredPairs = Object.entries(restoreImageNodePairs(imageMigrated.nodes))
    .map(([resultId, generatorId]) => ({ resultId, generatorId }));
  const pairKeys = new Set();
  const pairs = [...explicitPairs, ...restoredPairs].filter(pair => {
    const key = `${pair.resultId}:${pair.generatorId}`;
    if (pairKeys.has(key)) return false;
    pairKeys.add(key);
    return true;
  });
  return {
    ...promptMigrated,
    nodes: imageMigrated.nodes,
    edges: imageMigrated.edges,
    pairs,
  };
};

export function createOfficialTemplateSnapshot({
  templateId = '',
  versionId = null,
  nodes = [],
  edges = [],
  viewport = { x: 0, y: 0, zoom: 1 },
  pairMap = {},
}) {
  const serialNodes = nodes.map(node => (
    removeTransientProviderFrames(stripRuntimeNodeData(node))
  ));
  const serialEdges = edges.map(edge => ({ ...edge, selected: false }));
  const pairs = Object.entries(pairMap)
    .filter(([resultId, generatorId]) => (
      serialNodes.some(node => node.id === resultId)
      && serialNodes.some(node => node.id === generatorId)
    ))
    .map(([resultId, generatorId]) => ({ resultId, generatorId }));
  const snapshot = {
    schemaVersion: OFFICIAL_TEMPLATE_SCHEMA_VERSION,
    templateId,
    versionId,
    nodes: serialNodes,
    edges: serialEdges,
    viewport: {
      x: numberValue(viewport?.x, 0),
      y: numberValue(viewport?.y, 0),
      zoom: numberValue(viewport?.zoom, 1),
    },
    pairs,
    bounds: calculateBounds(serialNodes),
  };
  return {
    ...snapshot,
    mediaUrls: [...collectTemplateMediaUrls(snapshot)],
  };
}

export function instantiateOfficialTemplate(snapshot, {
  mode = 'project',
  position,
  tokenFactory = defaultTokenFactory(),
  sourceTemplateId = snapshot?.templateId || '',
  sourceTemplateVersion = snapshot?.versionId || '',
} = {}) {
  const graph = normalizeGraph(snapshot || {});
  const idMap = new Map();
  const pairByResult = new Map(graph.pairs.map(pair => [pair.resultId, pair]));
  const pairByGenerator = new Map(graph.pairs.map(pair => [pair.generatorId, pair]));
  const outerGroupId = mode === 'group' ? `group_${tokenFactory()}` : null;

  graph.pairs.forEach(pair => {
    const token = tokenFactory();
    idMap.set(pair.resultId, `result_${token}`);
    idMap.set(pair.generatorId, `generator_${token}`);
  });
  graph.nodes.forEach(node => {
    if (!idMap.has(node.id)) {
      idMap.set(node.id, `${node.type || 'node'}_${tokenFactory()}`);
    }
  });

  const originalBounds = graph.bounds || calculateBounds(graph.nodes);
  const padding = 48;
  const groupWidth = Math.max(320, originalBounds.width + padding * 2);
  const groupHeight = Math.max(220, originalBounds.height + padding * 2);
  const groupPosition = mode === 'group'
    ? {
        x: numberValue(position?.x, 0) - groupWidth / 2,
        y: numberValue(position?.y, 0) - groupHeight / 2,
      }
    : null;

  const nodes = graph.nodes.map(node => {
    const cloned = stripRuntimeNodeData(node);
    const mappedParent = node.parentNode ? idMap.get(node.parentNode) : undefined;
    const isTopLevelVisible = mode === 'group' && !node.parentNode && node.type !== 'generator';
    let nextPosition = { ...node.position };
    if (isTopLevelVisible) {
      nextPosition = {
        x: numberValue(node.position?.x, 0) - originalBounds.x + padding,
        y: numberValue(node.position?.y, 0) - originalBounds.y + padding,
      };
    } else if (mode === 'group' && node.type === 'generator' && !node.parentNode) {
      nextPosition = {
        x: numberValue(node.position?.x, 0) - originalBounds.x + groupPosition.x,
        y: numberValue(node.position?.y, 0) - originalBounds.y + groupPosition.y + groupHeight + 40,
      };
    }
    const resultPair = pairByResult.get(node.id);
    const generatorPair = pairByGenerator.get(node.id);
    const mappedChildIds = Array.isArray(cloned.data?.childIds)
      ? cloned.data.childIds.map(id => idMap.get(id)).filter(Boolean)
      : undefined;
    const data = {
      ...cloned.data,
      ...(mappedChildIds ? { childIds: mappedChildIds } : {}),
      ...(resultPair || cloned.data?.pairedGeneratorId
        ? {
            pairedGeneratorId: idMap.get(
              resultPair?.generatorId || cloned.data.pairedGeneratorId,
            ) || cloned.data.pairedGeneratorId,
          }
        : {}),
      ...(generatorPair || cloned.data?.pairedResultId
        ? {
            pairedResultId: idMap.get(
              generatorPair?.resultId || cloned.data.pairedResultId,
            ) || cloned.data.pairedResultId,
          }
        : {}),
    };
    return {
      ...cloned,
      id: idMap.get(node.id),
      position: nextPosition,
      parentNode: mappedParent || (isTopLevelVisible ? outerGroupId : undefined),
      extent: mappedParent || isTopLevelVisible ? 'parent' : cloned.extent,
      selected: false,
      data,
    };
  });

  const edges = graph.edges
    .map(edge => ({
      ...edge,
      id: `edge_${tokenFactory()}`,
      source: idMap.get(edge.source),
      target: idMap.get(edge.target),
      selected: false,
    }))
    .filter(edge => edge.source && edge.target);

  const pairMap = Object.fromEntries(
    graph.pairs
      .map(pair => [idMap.get(pair.resultId), idMap.get(pair.generatorId)])
      .filter(([resultId, generatorId]) => resultId && generatorId),
  );

  const topLevelChildIds = nodes
    .filter(node => node.parentNode === outerGroupId && node.type !== 'generator')
    .map(node => node.id);
  const group = mode === 'group'
    ? {
        id: outerGroupId,
        type: 'group',
        position: groupPosition,
        style: { width: groupWidth, height: groupHeight },
        selected: true,
        data: {
          label: snapshot?.name || '官方模板',
          childIds: topLevelChildIds,
          sourceTemplateId,
          sourceTemplateVersion,
        },
      }
    : null;

  return {
    nodes,
    edges,
    group,
    pairMap,
    viewport: { ...(graph.viewport || { x: 0, y: 0, zoom: 1 }) },
    sourceTemplateId,
    sourceTemplateVersion,
  };
}

const intersects = (a, b, gap = 0) => !(
  a.right + gap <= b.left
  || a.left >= b.right + gap
  || a.bottom + gap <= b.top
  || a.top >= b.bottom + gap
);

export function findOpenCanvasPosition({
  nodes = [],
  preferred = { x: 0, y: 0 },
  width = 320,
  height = 220,
  gap = 80,
}) {
  const occupied = visibleNodes(nodes).map(node => {
    const size = nodeSize(node);
    const left = numberValue(node.position?.x, 0);
    const top = numberValue(node.position?.y, 0);
    return { left, top, right: left + size.width, bottom: top + size.height };
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const offset = attempt * gap;
    const center = {
      x: preferred.x + offset,
      y: preferred.y + offset,
    };
    const candidate = {
      left: center.x - width / 2,
      top: center.y - height / 2,
      right: center.x + width / 2,
      bottom: center.y + height / 2,
    };
    if (!occupied.some(rect => intersects(candidate, rect, gap / 2))) {
      return center;
    }
  }
  return {
    x: preferred.x + 50 * gap,
    y: preferred.y + 50 * gap,
  };
}
