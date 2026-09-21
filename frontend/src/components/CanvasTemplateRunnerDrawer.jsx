import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { getWorkflowTemplateRunInputs } from '../workflowTemplateRunner';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import { uploadImageFile } from '../uploadImage';

const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getTemplateNodeCount = template => (
  Array.isArray(template?.nodes)
    ? template.nodes.filter(node => node?.type !== 'generator').length
    : 0
);

export default function CanvasTemplateRunnerDrawer({
  open,
  workflowTemplates = [],
  onClose,
  onRunTemplate,
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [values, setValues] = useState({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const fileInputRefs = useRef({});

  const templates = useMemo(() => (
    [...workflowTemplates].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  ), [workflowTemplates]);
  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );
  const inputs = useMemo(
    () => (selectedTemplate ? getWorkflowTemplateRunInputs(selectedTemplate) : []),
    [selectedTemplate],
  );

  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      setValues({});
      setRunning(false);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!selectedTemplate) {
      setValues({});
      setError('');
      return;
    }
    setError('');
    setValues(Object.fromEntries(inputs.map(input => [
      input.id,
      input.type === 'image'
        ? { imageUrls: input.defaultImages || [], uploadProgress: 0, uploading: false, error: '' }
        : { text: input.defaultValue || '' },
    ])));
  }, [inputs, selectedTemplate]);

  if (!open) return null;

  const setTextValue = (inputId, text) => {
    setValues(current => ({
      ...current,
      [inputId]: { ...(current[inputId] || {}), text },
    }));
  };

  const uploadImage = async (inputId, files) => {
    const allFiles = Array.from(files || []);
    const imageFiles = allFiles.filter(isSupportedImageFile);
    const unsupportedCount = allFiles.length - imageFiles.length;
    if (unsupportedCount > 0) {
      setValues(current => ({
        ...current,
        [inputId]: {
          ...(current[inputId] || {}),
          error: getUnsupportedImageMessage(unsupportedCount),
        },
      }));
      return;
    }
    if (imageFiles.length === 0) return;

    setValues(current => ({
      ...current,
      [inputId]: {
        ...(current[inputId] || {}),
        uploading: true,
        uploadProgress: 0,
        error: '',
      },
    }));

    try {
      const uploaded = [];
      for (const file of imageFiles) {
        const asset = await uploadImageFile(file, progress => {
          setValues(current => ({
            ...current,
            [inputId]: {
              ...(current[inputId] || {}),
              uploadProgress: progress,
            },
          }));
        });
        if (asset?.url) uploaded.push(asset.url);
      }
      setValues(current => ({
        ...current,
        [inputId]: {
          ...(current[inputId] || {}),
          imageUrls: uploaded,
          uploading: false,
          uploadProgress: 100,
          error: '',
        },
      }));
    } catch (uploadError) {
      setValues(current => ({
        ...current,
        [inputId]: {
          ...(current[inputId] || {}),
          uploading: false,
          error: uploadError?.message || '图片上传失败',
        },
      }));
    }
  };

  const missingInput = inputs.find(input => {
    const value = values[input.id] || {};
    if (input.type === 'text') return !String(value.text || '').trim();
    if (input.type === 'image') return !Array.isArray(value.imageUrls) || value.imageUrls.length === 0;
    return false;
  });
  const isUploading = Object.values(values).some(value => value?.uploading);

  const handleRun = async () => {
    if (!selectedTemplate || missingInput || running || isUploading) return;
    setRunning(true);
    setError('');
    try {
      await onRunTemplate?.(selectedTemplate, values);
    } catch (runError) {
      setError(runError?.message || '模板运行失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <aside
      className="canvas-template-runner-drawer nodrag nopan"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      {!selectedTemplate ? (
        <>
          <header className="canvas-template-runner-header">
            <div className="canvas-template-runner-title">
              <h2>应用</h2>
              <span>{templates.length} 个应用</span>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭应用">
              <Icon name="x" size={18} />
            </button>
          </header>

          {templates.length === 0 ? (
            <div className="canvas-template-runner-empty">
              <Icon name="shoppingBag" size={34} />
              <p>还没有可运行的应用</p>
            </div>
          ) : (
            <div className="canvas-template-runner-list" aria-label="应用列表">
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className="canvas-template-runner-item"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <span className="canvas-template-runner-item-icon">
                    <Icon name="shoppingBag" size={18} />
                  </span>
                  <span className="canvas-template-runner-item-body">
                    <strong>{template.name || '未命名应用'}</strong>
                    <em>{getTemplateNodeCount(template)} 节点 · {template.edges?.length || 0} 连线</em>
                  </span>
                  <Icon name="arrowLeft" size={16} className="canvas-template-runner-item-arrow" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <header className="canvas-template-runner-header detail">
            <button
              type="button"
              className="icon-button canvas-template-runner-back"
              onClick={() => setSelectedTemplateId('')}
              aria-label="返回应用列表"
            >
              <Icon name="arrowLeft" size={18} />
            </button>
            <div className="canvas-template-runner-title">
              <h2>{selectedTemplate.name || '未命名应用'}</h2>
              <span>{formatDate(selectedTemplate.updatedAt || selectedTemplate.createdAt)}</span>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭应用">
              <Icon name="x" size={18} />
            </button>
          </header>

          <section className="canvas-template-runner-detail">
            {selectedTemplate.description ? (
              <p className="canvas-template-runner-description">{selectedTemplate.description}</p>
            ) : null}

            <div className="canvas-template-runner-inputs">
              {inputs.length === 0 ? (
                <div className="canvas-template-runner-no-inputs">
                  <Icon name="play" size={18} />
                  <span>这个模板没有需要手动填写的起始输入。</span>
                </div>
              ) : inputs.map(input => {
                const value = values[input.id] || {};
                if (input.type === 'text') {
                  return (
                    <label className="template-runner-field" key={input.id}>
                      <span>{input.label}</span>
                      <textarea
                        value={value.text || ''}
                        onChange={event => setTextValue(input.id, event.target.value)}
                        placeholder="输入这一步的文本内容"
                      />
                    </label>
                  );
                }
                return (
                  <div className="template-runner-field" key={input.id}>
                    <span>{input.label}</span>
                    <button
                      type="button"
                      className={`template-runner-upload ${value.imageUrls?.length ? 'has-image' : ''}`}
                      onClick={() => fileInputRefs.current[input.id]?.click()}
                    >
                      {value.imageUrls?.[0] ? (
                        <img src={value.imageUrls[0]} alt={input.label} />
                      ) : (
                        <>
                          <Icon name="imageAdd" size={24} />
                          <em>{value.uploading ? `上传中 ${value.uploadProgress || 0}%` : '上传图片'}</em>
                        </>
                      )}
                    </button>
                    <input
                      ref={element => { fileInputRefs.current[input.id] = element; }}
                      type="file"
                      accept={SUPPORTED_IMAGE_ACCEPT}
                      hidden
                      onChange={event => {
                        uploadImage(input.id, event.target.files);
                        event.target.value = '';
                      }}
                    />
                    {value.error ? <small className="template-runner-error">{value.error}</small> : null}
                  </div>
                );
              })}
            </div>

            {error ? <div className="template-runner-error global">{error}</div> : null}

            <button
              type="button"
              className="template-runner-run-btn"
              onClick={handleRun}
              disabled={Boolean(missingInput) || running || isUploading}
            >
              <Icon name={running ? 'loader' : 'play'} size={16} />
              <span>{running ? '运行中...' : '生成'}</span>
            </button>
          </section>
        </>
      )}
    </aside>
  );
}
