export function isTaskResultAcceptedForNode(task, node) {
  if (!task || !node) return false;
  if (task.status === 'cancelled') return false;
  if (task.node_id && task.node_id !== node.id) return false;
  const currentRunId = node.data?.currentRunId || '';
  if (task.run_id && currentRunId && task.run_id !== currentRunId) return false;
  if (task.run_id && !currentRunId) return false;
  return true;
}

export function isTaskMediaAcceptedForNode(task, node) {
  if (!task || !node) return false;
  if (task.status === 'cancelled') return false;
  if (task.node_id && task.node_id !== node.id) return false;

  const currentRunId = node.data?.currentRunId || '';
  const taskRunId = task.run_id || '';
  if (taskRunId && currentRunId && taskRunId !== currentRunId) return false;

  const nodeTaskIds = Array.isArray(node.data?.taskIds)
    ? node.data.taskIds.filter(Boolean)
    : [];
  if (task.task_id && nodeTaskIds.length > 0 && !nodeTaskIds.includes(task.task_id)) {
    return false;
  }

  const hasExistingMedia = Boolean(
    node.data?.imageUrl
    || node.data?.videoUrl
    || (Array.isArray(node.data?.imageUrls) && node.data.imageUrls.length > 0)
  );
  if (taskRunId && !currentRunId && nodeTaskIds.length === 0 && hasExistingMedia) {
    return false;
  }

  return true;
}

export function isTaskCenterGroupAcceptedForNode(tasks, node) {
  if (!Array.isArray(tasks) || tasks.length === 0 || !node) return false;
  if (tasks.some(task => task?.node_id && task.node_id !== node.id)) return false;

  const taskIds = tasks.map(task => task?.task_id).filter(Boolean);
  const taskRunId = tasks.find(task => task?.run_id)?.run_id || '';
  const currentRunId = node.data?.currentRunId || '';
  const nodeTaskIds = Array.isArray(node.data?.taskIds)
    ? node.data.taskIds.filter(Boolean)
    : [];

  if (currentRunId && taskRunId && currentRunId !== taskRunId) return false;
  if (nodeTaskIds.length > 0 && !taskIds.some(taskId => nodeTaskIds.includes(taskId))) {
    return false;
  }

  if (currentRunId || nodeTaskIds.length > 0) return true;

  const knownRunId = node.data?.generationTask?.runId || '';
  const knownTaskId = node.data?.generationTask?.id || '';
  if ((knownRunId && knownRunId === taskRunId) || (knownTaskId && taskIds.includes(knownTaskId))) {
    return true;
  }

  const hasExistingMedia = Boolean(
    node.data?.imageUrl
    || node.data?.videoUrl
    || (Array.isArray(node.data?.imageUrls) && node.data.imageUrls.length > 0)
  );
  return !hasExistingMedia;
}
