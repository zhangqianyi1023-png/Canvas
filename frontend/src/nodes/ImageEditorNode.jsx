import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import ImageEditorWorkbench from './ImageEditorWorkbench';
import Icon from '../components/Icon';

const getLayerStyle = (layer, canvasSize) => {
  const width = Number(canvasSize?.width) || 760;
  const height = Number(canvasSize?.height) || 428;
  return {
    left: `${(Number(layer.x) || 0) / width * 100}%`,
    top: `${(Number(layer.y) || 0) / height * 100}%`,
    width: `${(Number(layer.width) || 80) / width * 100}%`,
    height: `${(Number(layer.height) || 48) / height * 100}%`,
    '--layer-color': layer.color || '#3b82f6',
    '--layer-font-size': `${Math.max(10, Math.min(24, Number(layer.fontSize) || 18))}px`,
    '--layer-stroke-size': `${Math.max(2, Math.min(8, Number(layer.strokeSize) || 4))}px`,
  };
};

function ImageEditorNodePreview({ state, title }) {
  const canvasSize = state?.canvasSize || { width: 760, height: 428 };
  const layers = Array.isArray(state?.layers) ? state.layers : [];
  const backgroundColor = state?.backgroundColor || '#ffffff';

  return (
    <div className="image-editor-node-artboard" aria-label={`${title}预览`} style={{ background: backgroundColor }}>
      <div className="image-editor-node-grid" aria-hidden="true" />
      {layers.slice().reverse().map(layer => (
        <div
          key={layer.id}
          className={`image-editor-node-layer ${layer.type || 'rect'}`}
          style={getLayerStyle(layer, canvasSize)}
        >
          {layer.type === 'image' && layer.imageUrl ? (
            <img src={layer.imageUrl} alt="" draggable={false} />
          ) : layer.type === 'image' ? (
            <div className="image-editor-node-generated">
              <Icon name="imageGenFill" size={18} />
            </div>
          ) : layer.type === 'text' ? (
            <span>{layer.text || '文本'}</span>
          ) : ['brush', 'pen', 'arrow'].includes(layer.type) ? (
            <svg viewBox="0 0 140 64" aria-hidden="true">
              {layer.type === 'arrow' ? (
                <>
                  <path d="M10 46 C46 14 90 18 124 20" />
                  <path d="M112 10 L126 20 L112 31" />
                </>
              ) : layer.type === 'pen' ? (
                <path d="M8 50 C26 8 57 8 70 32 S111 55 132 16" />
              ) : (
                <path d="M10 38 C28 22 39 58 58 35 S93 10 128 30" />
              )}
            </svg>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}

function ImageEditorNode({ id, selected, data }) {
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);
  const title = data?.label || '图片编辑器';
  const editorState = data?.imageEditorState || {};
  const layerCount = Array.isArray(editorState.layers) ? editorState.layers.length : 0;
  const hasSavedContent = layerCount > 0;

  const openEditor = () => setWorkbenchOpen(true);
  const createPreviewDataUrl = () => {
    const backgroundColor = editorState?.backgroundColor || '#ffffff';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
        <rect width="640" height="420" rx="28" fill="#18191d"/>
        <rect x="72" y="72" width="496" height="276" rx="18" fill="${backgroundColor}"/>
        <path d="M72 118H568M72 164H568M72 210H568M72 256H568M72 302H568M118 72V348M164 72V348M210 72V348M256 72V348M302 72V348M348 72V348M394 72V348M440 72V348M486 72V348M532 72V348" stroke="#e5e7eb" stroke-width="1"/>
        <rect x="180" y="150" width="160" height="96" rx="12" fill="#3b82f6"/>
        <text x="386" y="212" fill="#111827" font-size="28" font-family="Arial, sans-serif" font-weight="700">图片编辑器</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  const saveToMaterialLibrary = () => {
    data?.onImageAction?.('favorite', {
      imageUrl: createPreviewDataUrl(),
      nodeId: id,
      sourceType: 'imageEditor',
      mediaType: 'image',
    });
  };
  const downloadEditorPrototype = () => {
    const blob = new Blob([
      JSON.stringify({ title, imageEditorState: editorState }, null, 2),
    ], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || '图片编辑器'}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`custom-node image-editor-node ${selected ? 'selected' : ''}${hasSavedContent ? ' has-saved-content' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <div className="node-header">
        <EditableNodeTitle
          icon={<Icon name="imageGenFill" size={16} />}
          value={title}
          fallback="图片编辑器"
          tagColors={data?.tagColors}
          onChange={(nextLabel) => data?.onNodeTitleChange?.(id, nextLabel)}
          onEditingChange={setIsTitleEditing}
        />
      </div>

      <div className="image-editor-node-body">
        <div className="image-editor-node-preview">
          {hasSavedContent ? (
            <ImageEditorNodePreview state={editorState} title={title} />
          ) : (
            <>
              <Icon name="imageGenFill" size={30} />
              <span>空白画布</span>
            </>
          )}
        </div>
        {!hasSavedContent ? (
          <button
            type="button"
            className="image-editor-node-open nodrag nopan"
            onClick={(event) => {
              event.stopPropagation();
              openEditor();
            }}
          >
            点击编辑
          </button>
        ) : null}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <NodeHoverToolbar
        hidden={isNodeDragging || isMultiSelected || !selected || isTitleEditing}
        portal
        forceVisible={!isNodeDragging && selected}
        variant="image-editor"
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        tagPlacement="start"
        tagLabel="添加标记"
        actions={[
          {
            id: 'edit-image-editor',
            label: '编辑',
            title: '编辑',
            icon: 'edit',
            compact: true,
            separatorBefore: true,
            onClick: openEditor,
          },
          {
            id: 'save-image-editor-material',
            label: '保存到素材库',
            title: '保存到素材库',
            icon: 'folder',
            compact: true,
            separatorBefore: true,
            onClick: saveToMaterialLibrary,
          },
          {
            id: 'download-image-editor',
            label: '下载',
            title: '下载',
            icon: 'download',
            compact: true,
            onClick: downloadEditorPrototype,
          },
          {
            id: 'fullscreen-image-editor',
            label: '全屏查看',
            title: '全屏查看',
            icon: 'fullscreen',
            compact: true,
            onClick: openEditor,
          },
        ]}
      />

      {workbenchOpen ? (
        <ImageEditorWorkbench
          title={title}
          initialState={editorState}
          onClose={() => setWorkbenchOpen(false)}
          onSave={(nextState) => data?.onImageEditorStateChange?.(id, nextState)}
        />
      ) : null}
    </div>
  );
}

export default memo(ImageEditorNode);
