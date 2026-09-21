export const COPILOT_NODE_TYPES = new Set([
  'generateText',
  'generateImage',
  'generateVideo',
  'generateStoryboardScript',
]);

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export function createCopilotSessionId() {
  const token = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `canvas_copilot_${token}`;
}

export function normalizeCopilotPlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.nodes)) {
    throw new Error('Copilot 没有返回有效的画布计划');
  }
  if (plan.nodes.length < 1 || plan.nodes.length > 12) {
    throw new Error('Copilot 单次只能创建 1 到 12 个节点');
  }

  const refs = new Set();
  const nodes = plan.nodes.map((node) => {
    const ref = cleanText(node?.ref, 80);
    if (!ref || refs.has(ref)) throw new Error('Copilot 返回了重复或空的节点标识');
    refs.add(ref);
    const nodeType = node?.node_type ?? node?.nodeType;
    if (!COPILOT_NODE_TYPES.has(nodeType)) throw new Error('Copilot 返回了不支持的节点类型');

    const label = cleanText(node?.label, 120);
    if (!label) throw new Error('Copilot 返回了没有名称的节点');
    const upstreamValues = node.upstream_refs ?? node.upstreamRefs;
    return {
      ref,
      nodeType,
      label,
      content: cleanText(node.content, 12000),
      prompt: cleanText(node.prompt, 8000),
      imagePrompt: cleanText(node.image_prompt ?? node.imagePrompt, 8000),
      upstreamRefs: [...new Set((Array.isArray(upstreamValues) ? upstreamValues : [])
        .map(value => cleanText(value, 160))
        .filter(Boolean))],
      run: node.run === true,
    };
  });

  return {
    summary: cleanText(plan.summary, 500) || `创建 ${nodes.length} 个节点`,
    nodes,
  };
}

export function getCopilotPlanLayout(plan) {
  const nodeRefs = new Set(plan.nodes.map(node => node.ref));
  const depthCache = new Map();

  const getDepth = (ref, visiting = new Set()) => {
    if (depthCache.has(ref)) return depthCache.get(ref);
    if (visiting.has(ref)) throw new Error('Copilot 返回了循环连接，已阻止修改画布');
    const node = plan.nodes.find(item => item.ref === ref);
    if (!node) return 0;

    const nextVisiting = new Set(visiting).add(ref);
    const upstreamDepths = node.upstreamRefs
      .filter(upstreamRef => nodeRefs.has(upstreamRef))
      .map(upstreamRef => getDepth(upstreamRef, nextVisiting) + 1);
    const depth = upstreamDepths.length > 0 ? Math.max(...upstreamDepths) : 0;
    depthCache.set(ref, depth);
    return depth;
  };

  const columns = new Map();
  plan.nodes.forEach(node => {
    const depth = getDepth(node.ref);
    const column = columns.get(depth) || [];
    column.push(node.ref);
    columns.set(depth, column);
  });

  const layout = new Map();
  columns.forEach((refs, depth) => {
    refs.forEach((ref, row) => {
      layout.set(ref, {
        column: depth,
        row,
        rowCount: refs.length,
      });
    });
  });
  return layout;
}

export function copilotPlanNeedsConfirmation(plan, serverDecision = false) {
  return Boolean(serverDecision || plan.nodes.length >= 5 || plan.nodes.some(node => node.run));
}
