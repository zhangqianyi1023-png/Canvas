import { memo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from 'reactflow';
import GenerateCreditButton from '../components/GenerateCreditButton';
import Icon from '../components/Icon';
import ModelSelect from '../components/ModelSelect';
import EditableNodeTitle from './EditableNodeTitle';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';

const MATERIAL_OPTIONS = [
  { id: 'geometry', label: '几何' },
  { id: 'texture', label: '纹理' },
  { id: 'pbr', label: 'PBR' },
];

const MODEL_OPTIONS = [
  { value: 'tripo-3d', label: 'Tripo 3D' },
  { value: 'hunyuan3d', label: 'Hunyuan3D' },
];

const MAX_THREE_D_REFERENCE_ASSETS = 10;

const createGeneratedModel = ({ prompt, material, model }) => ({
  id: `three_d_model_${Date.now()}`,
  name: prompt ? `${prompt.slice(0, 18)}.glb` : '生成的 3D 模型.glb',
  source: 'generated',
  material,
  model,
  createdAt: Date.now(),
});

function ThreeDModelPreview({ model, material }) {
  const label = model?.source === 'uploaded' ? '已上传模型' : '生成模型';
  return (
    <div className={`three-d-model-preview is-${model?.source || 'empty'}`}>
      <div className="three-d-model-stage" aria-hidden="true">
        <span className="three-d-orbit orbit-outer" />
        <span className="three-d-orbit orbit-inner" />
        <span className="three-d-object">
          <span />
        </span>
      </div>
      <div className="three-d-model-meta">
        <strong>{label}</strong>
        <span>{model?.name || '3D 模型'}</span>
        <em>{MATERIAL_OPTIONS.find(option => option.id === material)?.label || 'PBR'} 材质</em>
      </div>
    </div>
  );
}

function ThreeDGenerator({
  prompt,
  model,
  material,
  generating,
  upstreamAssets,
  onPromptChange,
  onModelChange,
  onMaterialChange,
  onUploadAsset,
  onGenerate,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const assetCount = upstreamAssets.length;
  const isAssetFull = assetCount >= MAX_THREE_D_REFERENCE_ASSETS;

  return (
    <section className="three-d-generator nodrag nopan" aria-label="3D 生成器">
      <div className="three-d-generator-assets">
        <div className="reference-card-row three-d-reference-card-row">
          <button
            type="button"
            className="reference-add-card three-d-reference-add-card"
            onClick={onUploadAsset}
            disabled={isAssetFull}
            title={isAssetFull ? '参考素材已满' : '添加素材'}
            aria-label={`添加 3D 参考素材，已添加 ${assetCount} 个，最多 ${MAX_THREE_D_REFERENCE_ASSETS} 个`}
          >
            <Icon name="add" size={18} strokeWidth={2.3} />
            <span className="reference-add-count">{assetCount}/{MAX_THREE_D_REFERENCE_ASSETS}</span>
          </button>
          {upstreamAssets.map((asset, index) => (
            <div key={asset.id || asset.name || index} className="reference-card three-d-reference-card" title={asset.name || `素材 ${index + 1}`}>
              <Icon name="cube" size={13} />
              <span>{asset.name || '上游素材'}</span>
              {asset.onRemove ? (
                <button type="button" className="thumb-remove" onClick={asset.onRemove} aria-label={`删除素材 ${index + 1}`}>
                  <Icon name="x" size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <textarea
        value={prompt}
        placeholder="描述你想生成的 3D 模型"
        onChange={event => onPromptChange(event.target.value)}
      />

      <footer className="three-d-generator-footer">
        <ModelSelect
          value={model}
          options={MODEL_OPTIONS}
          onChange={onModelChange}
          placeholder="选择 3D 模型"
          menuPortal
          className="three-d-model-select"
          menuMinWidth={260}
        />

        <div className="three-d-parameter-control">
          <button type="button" onClick={() => setSettingsOpen(open => !open)}>
            <Icon name="settings" size={14} />
            <span>参数</span>
          </button>
          {settingsOpen ? (
            <div className="three-d-parameter-popover">
              <span className="three-d-parameter-title">材质</span>
              <div className="three-d-material-options">
                {MATERIAL_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={material === option.id ? 'active' : ''}
                    onClick={() => {
                      onMaterialChange(option.id);
                      setSettingsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.id === 'pbr' ? (
                      <span className="three-d-pbr-help" data-tooltip="基于物理的材质，在合适的光照设置下表现更真实。">
                        <Icon name="help" size={12} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <button type="button" className="three-d-voice-button" aria-label="语音输入">
          <Icon name="mic" size={15} />
        </button>

        <GenerateCreditButton
          cost={20}
          loading={generating}
          disabled={generating}
          onClick={onGenerate}
          runLabel="生成 3D 模型"
          className="three-d-generate-button"
        />
      </footer>
    </section>
  );
}

function ThreeDNode({ id, data, selected }) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const fileInputRef = useRef(null);
  const assetInputRef = useRef(null);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const isNodeDragging = Boolean(data?.isNodeDragging);
  const modelContent = data?.threeDModel || null;
  const hasContent = Boolean(modelContent);
  const material = data?.threeDMaterial || modelContent?.material || 'pbr';
  const prompt = data?.threeDPrompt || '';
  const model = data?.threeDModelId || 'tripo-3d';
  const generating = Boolean(data?.threeDGenerating);
  const contentSource = modelContent?.source || '';
  const showGenerator = selected && (!hasContent || contentSource === 'generated');
  const upstreamAssets = Array.isArray(data?.threeDAssets) ? data.threeDAssets : [];

  const patchNode = (patch) => data?.onThreeDNodeChange?.(id, patch);

  const openUploadPicker = () => fileInputRef.current?.click();
  const openAssetPicker = () => assetInputRef.current?.click();

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    patchNode({
      threeDModel: {
        id: `three_d_uploaded_${Date.now()}`,
        name: file.name,
        source: 'uploaded',
        material,
        createdAt: Date.now(),
      },
      threeDGenerating: false,
    });
  };

  const handleAssetUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || upstreamAssets.length >= MAX_THREE_D_REFERENCE_ASSETS) return;
    patchNode({
      threeDAssets: [
        ...upstreamAssets,
        { id: `three_d_asset_${Date.now()}`, name: file.name },
      ],
    });
  };

  const removeThreeDAsset = (assetIndex) => {
    patchNode({
      threeDAssets: upstreamAssets.filter((_, index) => index !== assetIndex),
    });
  };

  const handleGenerate = () => {
    patchNode({ threeDGenerating: true });
    window.setTimeout(() => {
      patchNode({
        threeDGenerating: false,
        threeDModel: createGeneratedModel({ prompt, material, model }),
      });
    }, 900);
  };

  const handleDownload = () => {
    const payload = {
      name: modelContent?.name || '3D 模型.glb',
      source: modelContent?.source || 'prototype',
      prompt,
      material,
      model,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(payload.name || '3d-model').replace(/\.[^.]+$/, '')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFullscreen = () => {
    patchNode({ threeDFullscreenOpen: true });
  };

  return (
    <div className={`custom-node three-d-node ${selected ? 'selected' : ''}${hasContent ? ' has-content' : ' is-empty'}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <input ref={fileInputRef} type="file" accept=".glb,.gltf,.obj,.fbx,.stl,.usdz,.dae,.ply,.zip,model/*" hidden onChange={handleUpload} />
      <input ref={assetInputRef} type="file" accept="image/*,.glb,.gltf,.obj,.fbx,.stl,.usdz,.dae,.ply,.zip,model/*" hidden onChange={handleAssetUpload} />

      <div className="node-header">
        <div className="three-d-node-title-row">
          <EditableNodeTitle
            icon={<Icon name="cube" size={16} />}
            value={data?.label || '3D'}
            fallback="3D"
            tagColors={data?.tagColors}
            onChange={(value) => data?.onNodeTitleChange?.(id, value)}
            onEditingChange={setIsTitleEditing}
          />
        </div>
      </div>

      <div className="node-body three-d-node-body">
        <div className="three-d-node-preview">
          {hasContent ? (
            <>
              <button type="button" className="three-d-replace-button nodrag nopan" onClick={openUploadPicker}>
                <Icon name="upload" size={13} />
                <span>替换</span>
              </button>
              <ThreeDModelPreview model={modelContent} material={material} />
            </>
          ) : (
            <div className="three-d-empty-state">
              <Icon name="cube" size={34} />
              <strong>空白 3D 节点</strong>
              <span>上传模型，或使用下方生成器创建</span>
            </div>
          )}
        </div>
      </div>

      {showGenerator ? (
        <ThreeDGenerator
          prompt={prompt}
          model={model}
          material={material}
          generating={generating}
          upstreamAssets={upstreamAssets.map((asset, index) => ({
            ...asset,
            onRemove: () => removeThreeDAsset(index),
          }))}
          onPromptChange={(value) => patchNode({ threeDPrompt: value })}
          onModelChange={(value) => patchNode({ threeDModelId: value })}
          onMaterialChange={(value) => patchNode({ threeDMaterial: value })}
          onUploadAsset={openAssetPicker}
          onGenerate={handleGenerate}
        />
      ) : null}

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <NodeHoverToolbar
        hidden={isNodeDragging || isMultiSelected || !selected || isTitleEditing}
        portal
        forceVisible={!isNodeDragging && selected}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        tagPlacement={hasContent ? 'start' : 'end'}
        tagLabel="添加标记"
        tagSeparatorBefore={!hasContent}
        actions={hasContent ? [
          {
            id: 'save-three-d-material',
            label: '添加到素材库',
            title: '添加到素材库',
            icon: 'folder',
            compact: true,
            separatorBefore: true,
            onClick: () => patchNode({ threeDStatus: '已添加到素材库' }),
          },
          {
            id: 'download-three-d',
            label: '下载模型',
            title: '下载模型',
            icon: 'download',
            compact: true,
            onClick: handleDownload,
          },
          {
            id: 'fullscreen-three-d',
            label: '全屏查看',
            title: '全屏查看',
            icon: 'fullscreen',
            compact: true,
            onClick: handleFullscreen,
          },
        ] : [
          {
            id: 'upload-three-d',
            label: '上传',
            title: '上传',
            icon: 'upload',
            compact: true,
            onClick: openUploadPicker,
          },
        ]}
      />

      {data?.threeDFullscreenOpen && typeof document !== 'undefined' ? createPortal(
        <div className="three-d-fullscreen-viewer nodrag nopan" role="dialog" aria-modal="true" aria-label="全屏查看 3D 模型">
          <button type="button" className="three-d-fullscreen-close" onClick={() => patchNode({ threeDFullscreenOpen: false })} aria-label="关闭全屏查看">
            <Icon name="x" size={20} />
          </button>
          <ThreeDModelPreview model={modelContent} material={material} />
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export default memo(ThreeDNode);
