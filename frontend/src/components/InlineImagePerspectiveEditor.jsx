import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'reactflow';
import Icon from './Icon';
import GenerateCreditButton from './GenerateCreditButton';
import { IMAGE_RATIO_PRESETS, getDefaultImageRatioPresetId, getImageRatioSummary } from '../imageRatioPresets';
import {
  IMAGE_PERSPECTIVE_PRESETS,
  getImagePerspectiveDistanceLabel,
  getImagePerspectivePreset,
} from '../imagePerspectivePrompt';
import {
  buildCapabilityOptions,
  buildImageRatioOptions,
  resolveCapabilityValue,
} from '../apimartModelSupport';
import {
  InpaintPopoverControl,
  buildInlineImageProviders,
  loadInlineImageSize,
  resolveInlineImageAnchorElement,
} from './InlineImageInpaintEditor';

const PANEL_WIDTH = 760;
const PANEL_GAP = 14;
const AngleCameraPreview = lazy(() => import('./AngleCameraPreview'));

function InlineImagePerspectiveEditor({
  imageUrl,
  anchorRef,
  apiConfigs = [],
  apiProviders = [],
  onCancel,
  onGenerate,
}) {
  const viewportTransform = useStore(state => state.transform);
  const panelRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [presetId, setPresetId] = useState('custom');
  const [horizontalAngle, setHorizontalAngle] = useState(0);
  const [pitchAngle, setPitchAngle] = useState(0);
  const [distance, setDistance] = useState(4);
  const [instruction, setInstruction] = useState('');
  const [imageSize, setImageSize] = useState('auto');
  const [imageSizePreset, setImageSizePreset] = useState(getDefaultImageRatioPresetId('auto'));
  const [resolution, setResolution] = useState('2k');
  const [count, setCount] = useState(1);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [openPopover, setOpenPopover] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const imageProviders = useMemo(
    () => buildInlineImageProviders(apiProviders, apiConfigs, 'imageToImage'),
    [apiConfigs, apiProviders],
  );
  const selectedProvider = imageProviders.find(api => api.id === selectedProviderId) || imageProviders[0];
  const modelOptions = selectedProvider?.models || [];
  const activeModel = modelOptions.includes(selectedModel)
    ? selectedModel
    : selectedProvider?.defaultModel || modelOptions[0] || selectedModel || 'gpt-image-2';
  const activeModelSupport = selectedProvider?.modelCapabilities?.[activeModel] || null;
  const activeCapabilities = useMemo(() => (
    activeModelSupport?.adapted === true ? activeModelSupport.capabilities || {} : null
  ), [activeModelSupport]);
  const ratioOptions = useMemo(
    () => buildImageRatioOptions(activeCapabilities, IMAGE_RATIO_PRESETS),
    [activeCapabilities],
  );
  const resolutionOptions = useMemo(
    () => buildCapabilityOptions(
      activeCapabilities?.resolutions,
      ['1k', '2k', '4k'].map(value => ({ value, label: value.toUpperCase() })),
    ),
    [activeCapabilities],
  );
  const resolvedImageSize = resolveCapabilityValue(
    imageSize,
    ratioOptions,
    activeCapabilities?.defaultRatio,
  ) || imageSize;
  const resolvedRatioOption = ratioOptions.find(option => option.value === resolvedImageSize);
  const resolvedRatioOptionId = resolvedRatioOption?.id || imageSizePreset;
  const resolvedResolution = resolveCapabilityValue(
    resolution,
    resolutionOptions,
    activeCapabilities?.defaultResolution,
  );
  const settingsSummary = [
    getImageRatioSummary(resolvedImageSize, resolvedRatioOptionId),
    resolutionOptions.length > 0 ? String(resolvedResolution).toUpperCase() : '',
    `${count}张`,
  ].filter(Boolean).join(' · ');
  const activePreset = getImagePerspectivePreset(presetId);
  const activePresetLabel = presetId === 'custom' ? '自定义' : activePreset.label;
  const distanceLabel = getImagePerspectiveDistanceLabel(distance);
  const hasAnchor = Boolean(anchorRect);

  useEffect(() => {
    let cancelled = false;
    loadInlineImageSize(imageUrl).then(size => {
      if (!cancelled) setSourceSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const updateAnchorRect = useCallback(() => {
    const anchor = resolveInlineImageAnchorElement(anchorRef.current);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const rounded = {
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    };
    setAnchorRect(current => (
      current?.left === rounded.left
      && current?.top === rounded.top
      && current?.width === rounded.width
      && current?.height === rounded.height
        ? current
        : rounded
    ));
  }, [anchorRef]);

  useLayoutEffect(() => {
    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateAnchorRect();
      });
    };
    updateAnchorRect();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('wheel', scheduleUpdate, { passive: true });
    window.addEventListener('pointermove', scheduleUpdate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('wheel', scheduleUpdate);
      window.removeEventListener('pointermove', scheduleUpdate);
    };
  }, [updateAnchorRect]);

  useLayoutEffect(() => {
    updateAnchorRect();
  }, [updateAnchorRect, viewportTransform]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return undefined;
    const updateSize = () => {
      const rect = panel.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      setPanelWidth(current => (current === nextWidth ? current : nextWidth));
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(panel);
    updateSize();
    return () => observer.disconnect();
  }, [hasAnchor]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (openPopover) {
        setOpenPopover(null);
        return;
      }
      onCancel?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, openPopover]);

  useEffect(() => {
    if (!openPopover) return undefined;
    const handleOutsidePointerDown = event => {
      const target = event.target;
      if (target instanceof Element && target.closest('.inline-inpaint-popover-control')) return;
      setOpenPopover(null);
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [openPopover]);

  const applyPreset = useCallback(preset => {
    setPresetId(preset.id);
    if (preset.id === 'custom') return;
    setHorizontalAngle(preset.horizontalAngle);
    setPitchAngle(preset.pitchAngle);
    setDistance(preset.distance);
  }, []);

  const setCustomAngles = useCallback(({ yaw, pitch }) => {
    setPresetId('custom');
    setHorizontalAngle(yaw);
    setPitchAngle(pitch);
  }, []);

  const reset = useCallback(() => {
    setPresetId('custom');
    setHorizontalAngle(0);
    setPitchAngle(0);
    setDistance(4);
    setInstruction('');
    setErrorMessage('');
  }, []);

  const togglePopover = useCallback(key => {
    setOpenPopover(current => (current === key ? null : key));
  }, []);

  const selectProvider = useCallback(provider => {
    setSelectedProviderId(provider.id);
    setSelectedModel(provider.defaultModel || provider.models?.[0] || '');
    setOpenPopover(null);
  }, []);

  const selectModel = useCallback(model => {
    setSelectedModel(model);
    setOpenPopover(null);
  }, []);

  const handleRatioChange = useCallback(preset => {
    setImageSize(preset.value);
    setImageSizePreset(preset.id);
  }, []);

  const submit = useCallback(async () => {
    if (isGenerating) return;
    if (!selectedProvider || !activeModel) {
      setErrorMessage('没有可用的参考图编辑模型，请先在设置里配置图片模型');
      return;
    }
    setErrorMessage('');
    setIsGenerating(true);
    try {
      await onGenerate?.({
        presetId,
        presetLabel: activePresetLabel,
        horizontalAngle,
        pitchAngle,
        distance,
        instruction: instruction.trim(),
        imageSize: { width: sourceSize.width, height: sourceSize.height },
        providerId: selectedProvider.id || '',
        model: activeModel,
        size: resolvedImageSize,
        sizePreset: resolvedRatioOptionId,
        resolution: resolvedResolution,
        count,
      });
      onCancel?.();
    } catch (error) {
      setErrorMessage(error?.message || '角度控制生成提交失败');
      setIsGenerating(false);
    }
  }, [activeModel, activePresetLabel, count, distance, horizontalAngle, instruction, isGenerating, onCancel, onGenerate, pitchAngle, presetId, resolvedImageSize, resolvedRatioOptionId, resolvedResolution, selectedProvider, sourceSize.height, sourceSize.width]);

  const panelPosition = useMemo(() => {
    if (!anchorRect) return null;
    return {
      left: anchorRect.left + anchorRect.width / 2 - panelWidth / 2,
      top: anchorRect.bottom + PANEL_GAP,
    };
  }, [anchorRect, panelWidth]);

  const panel = panelPosition && typeof document !== 'undefined'
    ? createPortal((
      <section
        ref={panelRef}
        className="inline-perspective-panel nodrag nopan"
        style={{ left: panelPosition.left, top: panelPosition.top }}
        aria-label="多角度编辑器"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <header className="inline-perspective-header">
          <div className="inline-perspective-title">
            <Icon name="compass" size={18} />
            <span>多角度编辑器</span>
          </div>
          <button type="button" className="inline-perspective-close canvas-flow-hover-target" onClick={onCancel} disabled={isGenerating} data-tooltip="关闭" aria-label="关闭多角度编辑器">
            <Icon name="x" size={20} />
          </button>
        </header>

        <div className="inline-perspective-presets" role="tablist" aria-label="快捷视角">
          {IMAGE_PERSPECTIVE_PRESETS.map(preset => (
            <button type="button" key={preset.id} className={presetId === preset.id ? 'active' : ''} onClick={() => applyPreset(preset)} disabled={isGenerating} role="tab" aria-selected={presetId === preset.id}>
              {preset.label}
            </button>
          ))}
        </div>

        <div className="inline-perspective-workspace">
          <div className="inline-perspective-preview-column">
            <Suspense fallback={<div className="angle-camera-preview angle-camera-loading">加载视角预览...</div>}>
              <AngleCameraPreview imageUrl={imageUrl} yaw={horizontalAngle} pitch={pitchAngle} distance={distance} disabled={isGenerating} onChange={setCustomAngles} />
            </Suspense>
          </div>

          <div className="inline-perspective-controls">
            <label className="inline-perspective-slider">
              <span>水平环绕</span>
              <input type="range" min="-180" max="180" step="1" value={horizontalAngle} disabled={isGenerating} onChange={event => { setPresetId('custom'); setHorizontalAngle(Number(event.target.value)); }} />
              <em>{horizontalAngle}°</em>
            </label>
            <label className="inline-perspective-slider">
              <span>垂直俯仰</span>
              <input type="range" min="-60" max="60" step="1" value={pitchAngle} disabled={isGenerating} onChange={event => { setPresetId('custom'); setPitchAngle(Number(event.target.value)); }} />
              <em>{pitchAngle}°</em>
            </label>
            <label className="inline-perspective-slider">
              <span>相机距离</span>
              <input type="range" min="1" max="8" step="0.1" value={distance} disabled={isGenerating} onChange={event => { setPresetId('custom'); setDistance(Number(event.target.value)); }} />
              <em>{distanceLabel}</em>
            </label>
            <label className="inline-perspective-prompt-field">
              <span>提示词</span>
              <textarea className="inline-perspective-prompt" value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="补充主体、背景或构图要求..." rows={4} disabled={isGenerating} />
            </label>
          </div>
        </div>

        {errorMessage ? <div className="inline-inpaint-error inline-perspective-error">{errorMessage}</div> : null}

        <footer className="inline-perspective-footer">
          <button type="button" className="inline-perspective-reset" onClick={reset} disabled={isGenerating}>
            <Icon name="refresh" size={17} />
            <span>重置参数</span>
          </button>
          <div className="inline-perspective-generation-controls">
            <InpaintPopoverControl label="图片 API" value={selectedProvider?.name || '未配置 API'} open={openPopover === 'provider'} disabled={isGenerating || imageProviders.length === 0} onToggle={() => togglePopover('provider')}>
              {imageProviders.length > 0
                ? imageProviders.map(provider => (
                  <button type="button" key={provider.id} className={provider.id === selectedProvider?.id ? 'active' : ''} onClick={() => selectProvider(provider)} role="menuitem">
                    <span>{provider.name}</span>
                    {provider.id === selectedProvider?.id ? <Icon name="check" size={14} /> : null}
                  </button>
                ))
                : <div className="inline-inpaint-popover-empty">未配置 API</div>}
            </InpaintPopoverControl>
            <InpaintPopoverControl label="图片模型" value={activeModel || '选择模型'} open={openPopover === 'model'} disabled={isGenerating || modelOptions.length === 0} onToggle={() => togglePopover('model')}>
              {modelOptions.length > 0
                ? modelOptions.map(model => (
                  <button type="button" key={model} className={model === activeModel ? 'active' : ''} onClick={() => selectModel(model)} role="menuitem">
                    <span>{model}</span>
                    {model === activeModel ? <Icon name="check" size={14} /> : null}
                  </button>
                ))
                : <div className="inline-inpaint-popover-empty">暂无模型</div>}
            </InpaintPopoverControl>
            <InpaintPopoverControl label="角度生成参数" value={settingsSummary} open={openPopover === 'settings'} disabled={isGenerating} wide onToggle={() => togglePopover('settings')}>
              <div className="inline-inpaint-settings-popover">
                <div className="inline-inpaint-setting-section">
                  <span>比例</span>
                  <div className="inline-inpaint-option-grid">
                    {ratioOptions.map(option => (
                      <button type="button" key={option.id} className={resolvedRatioOptionId === option.id ? 'active' : ''} onClick={() => handleRatioChange(option)}>
                        {option.value === 'auto' ? '智能' : option.value}
                      </button>
                    ))}
                  </div>
                </div>
                {resolutionOptions.length > 0 && <div className="inline-inpaint-setting-section">
                  <span>尺寸</span>
                  <div className="inline-inpaint-option-row">
                    {resolutionOptions.map(option => (
                      <button type="button" key={option.value} className={resolvedResolution === option.value ? 'active' : ''} onClick={() => setResolution(option.value)}>{option.label}</button>
                    ))}
                  </div>
                </div>}
                <div className="inline-inpaint-setting-section">
                  <span>张数</span>
                  <div className="inline-inpaint-option-row">
                    {[1, 2, 3, 4].map(value => (
                      <button type="button" key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>{value}张</button>
                    ))}
                  </div>
                </div>
              </div>
            </InpaintPopoverControl>
            <GenerateCreditButton
              cost={8}
              loading={isGenerating}
              disabled={isGenerating || !selectedProvider || !activeModel}
              onClick={submit}
              runLabel="生成新角度图片"
              className="inline-perspective-run-credit canvas-flow-hover-target"
            />
          </div>
        </footer>
      </section>
    ), document.body)
    : null;

  return (
    <div className="inline-image-perspective nodrag nopan" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      {panel}
    </div>
  );
}

export default InlineImagePerspectiveEditor;
