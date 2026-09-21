export function collectNodeRemovalIds(nodes, pairMap, requestedIds) {
  const removeIds = new Set(requestedIds);
  let expanded = true;

  while (expanded) {
    expanded = false;

    nodes.forEach(node => {
      const shouldRemoveWithParent = node.parentNode && removeIds.has(node.parentNode);
      const shouldRemoveWithSource = node.data?.sourceResultId && removeIds.has(node.data.sourceResultId);
      if ((shouldRemoveWithParent || shouldRemoveWithSource) && !removeIds.has(node.id)) {
        removeIds.add(node.id);
        expanded = true;
      }
    });

    Object.entries(pairMap).forEach(([resultId, generatorId]) => {
      if (removeIds.has(resultId) && !removeIds.has(generatorId)) {
        removeIds.add(generatorId);
        expanded = true;
      }
      if (removeIds.has(generatorId) && !removeIds.has(resultId)) {
        removeIds.add(resultId);
        expanded = true;
      }
    });
  }

  return removeIds;
}
