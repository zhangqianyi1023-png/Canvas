import { buildCopilotNodeTarget } from './copilotNodeTargets.js';

export const COPILOT_EDIT_OPERATIONS = new Set([
  'replace_text',
  'update_prompt',
  'rename',
]);

const cleanText = (value, maxLength, { trim = true } = {}) => {
  const text = String(value ?? '').slice(0, maxLength);
  return trim ? text.trim() : text;
};

export function normalizeCopilotEditPlan(plan) {
  const rawEdits = plan?.edits;
  if (!plan || typeof plan !== 'object' || !Array.isArray(rawEdits)) {
    throw new Error('Copilot 没有返回有效的节点修改计划');
  }
  if (rawEdits.length < 1 || rawEdits.length > 8) {
    throw new Error('Copilot 单次只能修改 1 到 8 项节点内容');
  }

  const keys = new Set();
  const edits = rawEdits.map((edit) => {
    const nodeId = cleanText(edit?.node_id ?? edit?.nodeId, 160);
    const operation = cleanText(edit?.operation, 60);
    if (!nodeId || !COPILOT_EDIT_OPERATIONS.has(operation)) {
      throw new Error('Copilot 返回了不支持的节点修改操作');
    }
    const key = `${nodeId}:${operation}`;
    if (keys.has(key)) throw new Error('Copilot 返回了重复的节点修改操作');
    keys.add(key);

    const maxLength = operation === 'replace_text' ? 12000 : operation === 'update_prompt' ? 8000 : 120;
    const value = cleanText(edit?.value, maxLength, { trim: operation === 'rename' });
    if (operation === 'rename' && !value) throw new Error('节点名称不能为空');
    return { nodeId, operation, value };
  });

  return {
    summary: cleanText(plan.summary, 500) || `修改 ${edits.length} 项节点内容`,
    edits,
  };
}

export function copilotEditPlanNeedsConfirmation(plan, serverDecision = false) {
  return Boolean(serverDecision || plan.edits.length > 1);
}

const getGeneratorId = (node, pairMap) => pairMap?.[node.id] || node.data?.pairedGeneratorId || '';

const getPromptPatch = (generatorType, value) => {
  if (generatorType === 'generateImage') return { promptDraft: value, image_prompt: value };
  if (generatorType === 'generateVideo') return { promptDraft: value, video_prompt: value };
  if (generatorType === 'generateAudio') return { promptDraft: value, audio_text: value };
  if (generatorType === 'generateStoryboardScript') {
    return { promptDraft: value, storyboard_script_prompt: value };
  }
  return { promptDraft: value, user_prompt: value };
};

export function applyCopilotEditsToNodes(nodes = [], rawPlan, pairMap = {}) {
  const plan = normalizeCopilotEditPlan(rawPlan);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const targetEdits = new Map();
  const generatorPromptEdits = new Map();
  const inverseEdits = [];

  plan.edits.forEach((edit) => {
    const node = nodesById.get(edit.nodeId);
    if (!node || node.type === 'generator') throw new Error(`找不到要修改的节点：${edit.nodeId}`);
    const generatorId = getGeneratorId(node, pairMap);
    const generatorNode = generatorId ? nodesById.get(generatorId) : null;
    const target = buildCopilotNodeTarget(node, generatorNode);

    if (edit.operation === 'replace_text' && !target?.canEditContent) {
      throw new Error(`“${target?.label || edit.nodeId}”不是可直接改写的文本节点`);
    }
    if (edit.operation === 'update_prompt' && !target?.canEditPrompt) {
      throw new Error(`“${target?.label || edit.nodeId}”没有可修改的生成提示词`);
    }

    const currentValue = edit.operation === 'rename'
      ? target.label
      : edit.operation === 'replace_text'
        ? target.content
        : target.prompt;
    inverseEdits.push({ nodeId: edit.nodeId, operation: edit.operation, value: currentValue });

    const currentTargetEdits = targetEdits.get(edit.nodeId) || [];
    currentTargetEdits.push(edit);
    targetEdits.set(edit.nodeId, currentTargetEdits);
    if (edit.operation === 'update_prompt') {
      generatorPromptEdits.set(generatorId, {
        generatorType: generatorNode.data?.generatorType || node.data?.resultType || 'generateText',
        value: edit.value,
      });
    }
  });

  const nextNodes = nodes.map((node) => {
    const edits = targetEdits.get(node.id);
    const promptEdit = generatorPromptEdits.get(node.id);
    let nextNode = node;

    if (edits) {
      let nextData = node.data || {};
      edits.forEach((edit) => {
        if (edit.operation === 'rename') {
          nextData = { ...nextData, label: edit.value };
        } else if (edit.operation === 'replace_text') {
          nextData = { ...nextData, result: edit.value, textSource: 'copilot' };
        } else if (edit.operation === 'update_prompt') {
          nextData = {
            ...nextData,
            ...getPromptPatch(node.data?.resultType || 'generateText', edit.value),
          };
        }
      });
      nextNode = { ...node, data: nextData };
    }

    if (promptEdit) {
      nextNode = {
        ...nextNode,
        data: {
          ...nextNode.data,
          ...getPromptPatch(promptEdit.generatorType, promptEdit.value),
        },
      };
    }
    return nextNode;
  });

  return {
    nodes: nextNodes,
    updatedNodeIds: [...new Set(plan.edits.map(edit => edit.nodeId))],
    inversePlan: {
      summary: `撤销：${plan.summary}`,
      edits: inverseEdits.reverse(),
    },
  };
}

