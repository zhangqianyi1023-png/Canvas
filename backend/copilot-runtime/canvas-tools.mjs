import { defineTool } from '@deepseek-ai/dsh-tools';

const NODE_TYPES = [
  'generateText',
  'generateImage',
  'generateVideo',
  'generateStoryboardScript',
];

const nodeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ref: {
      type: 'string',
      required: true,
      description: 'A unique short reference for this new node, such as copy_1.',
    },
    node_type: {
      type: 'string',
      enum: NODE_TYPES,
      required: true,
      description: 'The semantic Canvas generator type.',
    },
    label: {
      type: 'string',
      required: true,
      description: 'A concise user-facing node name.',
    },
    content: {
      type: 'string',
      description: 'Finished text to place in a text result node.',
    },
    prompt: {
      type: 'string',
      description: 'The generation instruction stored on the node.',
    },
    image_prompt: {
      type: 'string',
      description: 'The positive image prompt for an image node.',
    },
    upstream_refs: {
      type: 'array',
      items: { type: 'string' },
      description: 'Existing Canvas node ids or earlier new-node refs to connect into this node.',
    },
    run: {
      type: 'boolean',
      description: 'True only when the user explicitly asked to run or generate now.',
    },
  },
};

const planSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', required: true },
    nodes: {
      type: 'array',
      required: true,
      items: nodeSchema,
    },
  },
};

const EDIT_OPERATIONS = [
  'replace_text',
  'update_prompt',
  'rename',
];

const editSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    node_id: {
      type: 'string',
      required: true,
      description: 'The exact id of one node from target_nodes.',
    },
    operation: {
      type: 'string',
      enum: EDIT_OPERATIONS,
      required: true,
      description: 'replace_text changes finished text, update_prompt changes its generator prompt, and rename changes only the node title.',
    },
    value: {
      type: 'string',
      required: true,
      description: 'The complete replacement value. Do not return a partial diff.',
    },
  },
};

const editPlanSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', required: true },
    edits: {
      type: 'array',
      required: true,
      items: editSchema,
    },
  },
};

const choiceOptionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      required: true,
      description: 'A unique short option id.',
    },
    label: {
      type: 'string',
      required: true,
      description: 'A concise user-facing option title.',
    },
    description: {
      type: 'string',
      description: 'One short sentence explaining this option.',
    },
    submit_text: {
      type: 'string',
      required: true,
      description: 'The complete natural-language user message sent when this option is selected.',
    },
  },
};

const choiceSetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: { type: 'string', required: true },
    options: {
      type: 'array',
      required: true,
      items: choiceOptionSchema,
    },
  },
};

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

function normalizePlan(args) {
  if (!Array.isArray(args.nodes) || args.nodes.length < 1 || args.nodes.length > 12) {
    throw new Error('A Canvas plan must contain between 1 and 12 nodes.');
  }

  const refs = new Set();
  const nodes = args.nodes.map((node) => {
    const ref = cleanText(node.ref, 80);
    if (!ref || refs.has(ref)) throw new Error('Every Canvas node needs a unique non-empty ref.');
    refs.add(ref);

    if (!NODE_TYPES.includes(node.node_type)) throw new Error(`Unsupported Canvas node type: ${node.node_type}`);

    const label = cleanText(node.label, 120);
    if (!label) throw new Error('Every Canvas node needs a label.');

    return {
      ref,
      node_type: node.node_type,
      label,
      content: cleanText(node.content, 12000),
      prompt: cleanText(node.prompt, 8000),
      image_prompt: cleanText(node.image_prompt, 8000),
      upstream_refs: [...new Set((node.upstream_refs || []).map(value => cleanText(value, 160)).filter(Boolean))],
      run: node.run === true,
    };
  });

  return {
    summary: cleanText(args.summary, 500) || `创建 ${nodes.length} 个画布节点`,
    nodes,
  };
}

function normalizeEditPlan(args) {
  if (!Array.isArray(args.edits) || args.edits.length < 1 || args.edits.length > 8) {
    throw new Error('A Canvas edit plan must contain between 1 and 8 edits.');
  }

  const keys = new Set();
  const edits = args.edits.map((edit) => {
    const nodeId = cleanText(edit.node_id, 160);
    const operation = cleanText(edit.operation, 60);
    if (!nodeId || !EDIT_OPERATIONS.includes(operation)) {
      throw new Error('Every Canvas edit needs a valid target node and operation.');
    }
    const key = `${nodeId}:${operation}`;
    if (keys.has(key)) throw new Error('A Canvas edit plan cannot repeat the same operation for one node.');
    keys.add(key);

    const maxLength = operation === 'replace_text' ? 12000 : operation === 'update_prompt' ? 8000 : 120;
    const value = cleanText(edit.value, maxLength);
    if (!value) throw new Error('Every Canvas edit needs a non-empty replacement value.');
    return { node_id: nodeId, operation, value };
  });

  return {
    summary: cleanText(args.summary, 500) || `修改 ${edits.length} 项节点内容`,
    edits,
  };
}

function normalizeChoices(args) {
  if (!Array.isArray(args.options) || args.options.length < 2 || args.options.length > 6) {
    throw new Error('A choice prompt must contain between 2 and 6 options.');
  }
  const question = cleanText(args.question, 300);
  if (!question) throw new Error('A choice prompt needs a question.');

  const ids = new Set();
  const options = args.options.map((option) => {
    const id = cleanText(option.id, 80);
    const label = cleanText(option.label, 60);
    const submitText = cleanText(option.submit_text, 600);
    if (!id || ids.has(id)) throw new Error('Every choice needs a unique non-empty id.');
    if (!label || !submitText) throw new Error('Every choice needs a label and submit_text.');
    ids.add(id);
    return {
      id,
      label,
      description: cleanText(option.description, 180),
      submit_text: submitText,
    };
  });
  return { question, options };
}

export const name = 'inux-canvas-tools';
export const inject = ['tools'];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'apply_canvas_plan',
    description: [
      'Prepare a structured InUx Canvas change plan.',
      'Call this only when the latest user message clearly asks to create, add, connect, or run Canvas content.',
      'Never call it for greetings, ordinary conversation, questions, analysis, brainstorming, explanations, or ambiguous wishes.',
      'If the request is ambiguous, answer normally and ask one concise clarifying question instead.',
      'Use run=true only when the user explicitly asks to run, execute, or generate now.',
    ].join(' '),
    parameters: {
      summary: {
        type: 'string',
        required: true,
        description: 'A short Chinese summary of the planned Canvas change.',
      },
      nodes: {
        type: 'array',
        required: true,
        items: nodeSchema,
        description: 'New nodes and their upstream relationships.',
      },
    },
    output: {
      schema: planSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `Canvas plan prepared: ${value.summary}. The host application will validate and apply it.`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'inux-canvas-plan',
        plan: value,
      }),
    },
    async execute(args) {
      return normalizePlan(args);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'apply_canvas_edits',
    description: [
      'Prepare controlled edits for existing InUx Canvas nodes.',
      'Call this only when the latest user message explicitly asks to modify nodes listed in target_nodes.',
      'Use replace_text only for a target whose can_edit_content is true.',
      'Use update_prompt only for a target whose can_edit_prompt is true, and do not claim that updating a prompt regenerates media.',
      'Use rename only when the user explicitly asks to rename a node.',
      'Never target a node outside target_nodes and never invent a node id.',
      'For a requested image or video variation, use apply_canvas_plan to create a downstream node instead of overwriting existing media.',
      'Do not call this tool for questions, analysis, feedback, or ambiguous requests.',
    ].join(' '),
    parameters: {
      summary: {
        type: 'string',
        required: true,
        description: 'A short Chinese summary of the proposed edits.',
      },
      edits: {
        type: 'array',
        required: true,
        items: editSchema,
        description: 'One to eight controlled edits, all targeting target_nodes.',
      },
    },
    output: {
      schema: editPlanSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `Canvas edits prepared: ${value.summary}. The host application will validate and apply them.`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'inux-canvas-edit-plan',
        editPlan: value,
      }),
    },
    async execute(args) {
      return normalizeEditPlan(args);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'present_choices',
    description: [
      'Present 2 to 6 structured single-select option cards when the user needs to choose among concrete alternatives.',
      'Use this instead of writing a plain bullet list of choices.',
      'Do not use it for open-ended questions or ordinary informational lists.',
      'Each submit_text must be the complete natural-language user reply that should continue the conversation.',
      'When continuing a Canvas creation request, submit_text must preserve the explicit creation intent so the host can authorize the next action.',
      'This tool only presents choices and never changes the Canvas.',
    ].join(' '),
    parameters: {
      question: {
        type: 'string',
        required: true,
        description: 'The concise question shown above the option cards.',
      },
      options: {
        type: 'array',
        required: true,
        items: choiceOptionSchema,
        description: 'Two to six mutually exclusive options.',
      },
    },
    output: {
      schema: choiceSetSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `Choice cards prepared: ${value.question}`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'inux-copilot-choices',
        choices: value,
      }),
    },
    async execute(args) {
      return normalizeChoices(args);
    },
  }));
}
