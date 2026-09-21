export function snapshotSmartSplitterCandidates(imageUrls = [], taskIds = []) {
  return {
    imageUrls: [...imageUrls],
    taskIds: [...taskIds],
  };
}

export function getNextSmartSplitterBatchIndex(batches = []) {
  return Math.max(
    0,
    ...batches.map(batch => Number(batch?.batch_index) || 0),
  ) + 1;
}

export function appendSmartSplitterBatch(batches = [], batchRecord) {
  return batchRecord ? [...batches, batchRecord] : [...batches];
}
