import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Icon from './Icon';
import VideoInputNode from '../nodes/VideoInputNode';
import RemovedNode from '../nodes/RemovedNode';
import ResultNode from '../nodes/ResultNode';
import GeneratorNode from '../nodes/GeneratorNode';
import SmartSplitterNode from '../nodes/SmartSplitterNode';
import SmartSplitterProcessor from '../nodes/SmartSplitterProcessor';
import StoryboardCardNode from '../nodes/StoryboardCardNode';
import { migrateLegacyPromptTemplate } from '../textNodeMigration';
import { migrateLegacyImageGraph, restoreImageNodePairs } from '../imageNodeModel';

const PROCESSOR_WIDTH = 600;
const PROCESSOR_MAX_HEIGHT = 440;

function PreviewGroupNode({ data }) {
  return (
    <div className="workflow-template-preview-group">
      <span>{data?.label || '未命名组合'}</span>
    </div>
  );
}

const previewNodeTypes = {
  videoInput: VideoInputNode,
  product: RemovedNode,
  ecommerceVideoPlanner: RemovedNode,
  competitorVideo: RemovedNode,
  shotDirector: RemovedNode,
  videoAssembler: RemovedNode,
  result: ResultNode,
  smartSplitter: SmartSplitterNode,
  storyboardCard: StoryboardCardNode,
  group: PreviewGroupNode,
};

function ProcessorOverlay({ node, generator, canvasRef, viewportRevision }) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const container = canvasRef.current;
    if (!container || !node) return;
    const measure = () => {
      const element = container.querySelector(`.react-flow__node[data-id="${node.id}"]`);
      if (!element) return setPosition(null);
      const containerRect = container.getBoundingClientRect();
      const nodeRect = element.getBoundingClientRect();
      const idealLeft = nodeRect.left - containerRect.left + nodeRect.width / 2 - PROCESSOR_WIDTH / 2;
      const left = Math.max(12, Math.min(idealLeft, containerRect.width - PROCESSOR_WIDTH - 12));
      const below = nodeRect.bottom - containerRect.top + 16;
      const top = below + PROCESSOR_MAX_HEIGHT <= containerRect.height
        ? below
        : Math.max(12, nodeRect.top - containerRect.top - PROCESSOR_MAX_HEIGHT - 16);
      setPosition({ left, top });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [canvasRef, generator, node, viewportRevision]);

  if (!position || !node) return null;

  return (
    <div className="workflow-template-processor-overlay" style={position}>
      <div className="workflow-template-readonly-badge">只读预览</div>
      <fieldset disabled>
        {node.type === 'smartSplitter' ? (
          <SmartSplitterProcessor
            id={node.id}
            data={{ ...node.data, overlayMode: true, status: 'idle', onRun: undefined, onDataChange: undefined }}
          />
        ) : generator ? (
          <GeneratorNode
            id={generator.id}
            data={{ ...generator.data, overlayMode: true, onGenerate: undefined, onRunImageGeneration: undefined, onRunVideoGeneration: undefined, onRunTextGeneration: undefined }}
          />
        ) : null}
      </fieldset>
    </div>
  );
}

function PreviewCanvas({ template, onClose, onEdit, onAdd, addLabel = '添加到当前画布' }) {
  const canvasRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [viewportRevision, setViewportRevision] = useState(0);

  const nodes = useMemo(() => [
    ...(template.group ? [{ ...template.group, selected: false, draggable: false, connectable: false }] : []),
    ...template.nodes
      .filter(node => node.type !== 'generator')
      .map(node => ({ ...node, selected: false, draggable: false, connectable: false })),
  ], [template]);
  const edges = useMemo(() => (template.edges || []).map(edge => ({
    ...edge,
    selectable: false,
    focusable: false,
  })), [template.edges]);
  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null;
  const pair = selectedNode?.type === 'result'
    ? (template.pairs || []).find(item => item.resultId === selectedNode.id)
    : null;
  const generator = pair
    ? template.nodes.find(node => node.id === pair.generatorId && node.type === 'generator')
    : null;
  const supportsProcessor = selectedNode?.type === 'result' || selectedNode?.type === 'smartSplitter';

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      if (selectedNodeId) setSelectedNodeId(null);
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedNodeId]);

  const handleNodeClick = useCallback((event, node) => {
    event.stopPropagation();
    if (!['result', 'smartSplitter'].includes(node.type)) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId(current => current === node.id ? null : node.id);
  }, []);

  return createPortal(
    <div className="modal-overlay workflow-template-preview-overlay" onMouseDown={onClose}>
      <section
        className="workflow-template-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-template-preview-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="workflow-template-preview-header">
          <div>
            <h2 id="workflow-template-preview-title">{template.name}</h2>
            <p>{template.description || '未填写模板说明'}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭模板预览">
            <Icon name="x" size={20} />
          </button>
        </header>
        <div ref={canvasRef} className="workflow-template-preview-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={previewNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            zoomOnDoubleClick={false}
            panOnDrag
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.15}
            maxZoom={1.6}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            onMove={() => setViewportRevision(value => value + 1)}
          >
            <Background color="var(--border-default)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {supportsProcessor && (
            <ProcessorOverlay
              node={selectedNode}
              generator={generator}
              canvasRef={canvasRef}
              viewportRevision={viewportRevision}
            />
          )}
        </div>
        <footer className="workflow-template-preview-footer">
          <span>{template.nodes.filter(node => node.type !== 'generator').length} 个节点 · {template.edges.length} 条连线</span>
          <div>
            {onEdit && <button type="button" className="modal-btn cancel" onClick={() => onEdit(template)}>编辑信息</button>}
            <button type="button" className="modal-btn confirm" onClick={() => onAdd(template)}>{addLabel}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}

export default function WorkflowTemplatePreview(props) {
  if (!props.template) return null;
  const promptTemplate = migrateLegacyPromptTemplate(props.template);
  const imageGraph = migrateLegacyImageGraph(promptTemplate.nodes, promptTemplate.edges);
  const pairKeys = new Set();
  const pairs = [
    ...(promptTemplate.pairs || []),
    ...Object.entries(restoreImageNodePairs(imageGraph.nodes)).map(([resultId, generatorId]) => ({
      resultId,
      generatorId,
    })),
  ].filter(pair => {
    const key = `${pair.resultId}:${pair.generatorId}`;
    if (pairKeys.has(key)) return false;
    pairKeys.add(key);
    return true;
  });
  const template = {
    ...promptTemplate,
    nodes: imageGraph.nodes,
    edges: imageGraph.edges,
    // Legacy image results keep their IDs, so existing group childIds remain valid.
    pairs,
  };
  return (
    <ReactFlowProvider>
      <PreviewCanvas {...props} template={template} />
    </ReactFlowProvider>
  );
}
