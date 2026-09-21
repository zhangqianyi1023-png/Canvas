const LEGACY_PROMPT_TYPE = 'prompt';

const getLegacyPromptText = (node) => (
  node?.data?.defaultText
  || node?.data?.result
  || node?.data?.promptDraft
  || ''
);

const createPairIds = (legacyId, usedIds) => {
  const baseToken = legacyId || 'legacy_text';
  let suffix = '';
  let index = 1;

  while (
    usedIds.has(`result_${baseToken}${suffix}`)
    || usedIds.has(`generator_${baseToken}${suffix}`)
  ) {
    index += 1;
    suffix = `_${index}`;
  }

  const resultId = `result_${baseToken}${suffix}`;
  const generatorId = `generator_${baseToken}${suffix}`;
  usedIds.add(resultId);
  usedIds.add(generatorId);
  return { resultId, generatorId };
};

export function migrateLegacyPromptGraph(nodes = [], edges = [], pairs = []) {
  const legacyNodes = nodes.filter(node => node?.type === LEGACY_PROMPT_TYPE);
  if (legacyNodes.length === 0) return { nodes, edges, pairs };

  const usedIds = new Set(nodes.map(node => node.id));
  const idMap = new Map();
  legacyNodes.forEach(node => {
    idMap.set(node.id, createPairIds(node.id, usedIds));
  });

  const migratedNodes = [];
  nodes.forEach(node => {
    if (node?.type !== LEGACY_PROMPT_TYPE) {
      if (node?.type === 'group' && Array.isArray(node.data?.childIds)) {
        migratedNodes.push({
          ...node,
          data: {
            ...node.data,
            childIds: node.data.childIds.map(id => idMap.get(id)?.resultId || id),
          },
        });
      } else {
        migratedNodes.push(node);
      }
      return;
    }

    const { resultId, generatorId } = idMap.get(node.id);
    const text = getLegacyPromptText(node);
    const {
      defaultText,
      onTextChange,
      label,
      ...legacyData
    } = node.data || {};
    void defaultText;
    void onTextChange;
    void label;

    const width = Number.parseFloat(node.style?.width) || 280;
    const height = Number.parseFloat(node.style?.height) || 190;
    migratedNodes.push({
      ...node,
      id: resultId,
      type: 'result',
      style: { ...node.style, width, height },
      data: {
        ...legacyData,
        label: '文本',
        result: text,
        resultType: 'generateText',
        textSource: 'manual',
        promptDraft: legacyData.promptDraft || '',
        generating: false,
      },
    });
    migratedNodes.push({
      id: generatorId,
      type: 'generator',
      position: {
        x: (node.position?.x || 0) + (width - 600) / 2,
        y: (node.position?.y || 0) + height + 16,
      },
      data: {
        generatorType: 'generateText',
        promptDraft: '',
        connectedPrompt: '',
        connectedTextReferences: [],
        connectedImages: [],
        connectedVideos: [],
        uploadedReferenceImages: [],
      },
      hidden: true,
      selected: false,
    });
  });

  const migratedEdges = edges.map(edge => ({
    ...edge,
    source: idMap.get(edge.source)?.resultId || edge.source,
    target: idMap.get(edge.target)?.resultId || edge.target,
  }));
  const migratedPairs = [
    ...pairs,
    ...legacyNodes.map(node => {
      const ids = idMap.get(node.id);
      return { resultId: ids.resultId, generatorId: ids.generatorId };
    }),
  ];

  return {
    nodes: migratedNodes,
    edges: migratedEdges,
    pairs: migratedPairs,
  };
}

export function migrateLegacyPromptProject(project) {
  if (!project || !Array.isArray(project.nodes)) return project;
  const migrated = migrateLegacyPromptGraph(project.nodes, project.edges || []);
  if (migrated.nodes === project.nodes) return project;
  return {
    ...project,
    nodes: migrated.nodes,
    edges: migrated.edges,
  };
}

export function migrateLegacyPromptTemplate(template) {
  if (!template?.group || !Array.isArray(template.nodes)) return template;
  const needsMigration = template.nodes.some(node => node?.type === LEGACY_PROMPT_TYPE);
  if (!needsMigration) return template;

  const migrated = migrateLegacyPromptGraph(
    [template.group, ...template.nodes],
    template.edges || [],
    template.pairs || [],
  );

  const group = migrated.nodes.find(node => node.id === template.group.id) || template.group;
  return {
    ...template,
    group,
    nodes: migrated.nodes.filter(node => node.id !== group.id),
    edges: migrated.edges,
    pairs: migrated.pairs,
  };
}
