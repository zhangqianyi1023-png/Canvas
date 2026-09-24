import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  COPILOT_MAX_ATTACHMENTS,
  formatCopilotAttachmentSize,
  getCopilotAttachmentKind,
  getCopilotFileValidationError,
} from '../copilotAttachments';
import Icon from './Icon';
import CopilotNodeReferences from './CopilotNodeReferences';

const COPILOT_FILE_ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.html', '.htm',
  '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.yaml', '.yml', '.xml', '.log',
].join(',');

const makeAttachmentId = () => `copilot_attachment_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function readAttachment(file, kind, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`无法读取文件：${file.name}`));
    if (kind === 'image') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function CopilotComposer({
  working = false,
  modelOptions = [],
  selectedModelId = 'auto',
  nodeTargets = [],
  pickingCanvasNode = false,
  onModelChange,
  onSubmit,
  onToggleCanvasPicker,
  onRemoveNodeTarget,
  onFocusNodeTarget,
}) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [inputError, setInputError] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const [voiceSendHover, setVoiceSendHover] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [showMoreModels, setShowMoreModels] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const modelMenuRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const speechBaseInputRef = useRef('');
  const voiceSubmitTimerRef = useRef(null);

  const selectedModel = useMemo(() => (
    selectedModelId === 'auto'
      ? null
      : modelOptions.find(model => model.id === selectedModelId && model.available) || null
  ), [modelOptions, selectedModelId]);
  const recommendedModels = useMemo(
    () => modelOptions.filter(model => model.available).slice(0, 3),
    [modelOptions],
  );
  const moreModels = useMemo(() => {
    const recommendedIds = new Set(recommendedModels.map(model => model.id));
    return modelOptions.filter(model => !recommendedIds.has(model.id));
  }, [modelOptions, recommendedModels]);
  const uploading = attachments.some(attachment => attachment.progress < 100);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(160, Math.max(76, textarea.scrollHeight))}px`;
  }, [input]);

  useEffect(() => () => {
    speechRecognitionRef.current?.abort?.();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(voiceSubmitTimerRef.current);
  }, []);

  useEffect(() => {
    if (selectedModelId === 'auto') return;
    if (!modelOptions.some(model => model.id === selectedModelId && model.available)) {
      onModelChange?.('auto');
    }
  }, [modelOptions, onModelChange, selectedModelId]);

  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!modelMenuRef.current?.contains(event.target)) setModelMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setModelMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [modelMenuOpen]);

  const updateAttachment = useCallback((attachmentId, patch) => {
    setAttachments(current => current.map(attachment => (
      attachment.id === attachmentId ? { ...attachment, ...patch } : attachment
    )));
  }, []);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const errors = [];
    let count = attachments.length;

    for (const file of files) {
      const validationError = getCopilotFileValidationError(file, count);
      if (validationError) {
        errors.push(`${file.name}：${validationError}`);
        continue;
      }

      const kind = getCopilotAttachmentKind(file);
      const attachmentId = makeAttachmentId();
      const draft = {
        id: attachmentId,
        name: file.name,
        mimeType: file.type || (kind === 'image' ? 'image/png' : 'text/plain'),
        size: file.size,
        kind,
        dataUrl: '',
        textContent: '',
        progress: 0,
      };
      setAttachments(current => [...current, draft].slice(0, COPILOT_MAX_ATTACHMENTS));
      count += 1;

      try {
        const content = await readAttachment(file, kind, progress => (
          updateAttachment(attachmentId, { progress })
        ));
        updateAttachment(attachmentId, {
          dataUrl: kind === 'image' ? content : '',
          textContent: kind === 'text' ? content : '',
          progress: 100,
        });
      } catch (error) {
        setAttachments(current => current.filter(item => item.id !== attachmentId));
        errors.push(error.message || `无法读取文件：${file.name}`);
      }
    }

    setInputError(errors[0] || '');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachments.length, updateAttachment]);

  const removeAttachment = useCallback((attachmentId) => {
    setAttachments(current => current.filter(item => item.id !== attachmentId));
    setInputError('');
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (voiceSubmitting) return;
    if (listening) {
      speechRecognitionRef.current?.abort?.();
      setInput(speechBaseInputRef.current);
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInputError('当前浏览器不支持语音输入，请使用最新版 Chrome 或 Edge。');
      return;
    }

    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;
    speechBaseInputRef.current = input.trimEnd();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setInputError('');
      setListening(true);
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript || '';
      }
      const prefix = speechBaseInputRef.current;
      setInput(`${prefix}${prefix && transcript ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      setInputError(event.error === 'not-allowed'
        ? '请允许浏览器使用麦克风后再试。'
        : '没有识别到语音，请重试。');
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setListening(false);
    };
    try {
      recognition.start();
    } catch (error) {
      speechRecognitionRef.current = null;
      setListening(false);
      setInputError(error.message || '语音输入启动失败，请重试。');
    }
  }, [input, listening, voiceSubmitting]);

  const confirmVoiceInput = useCallback(() => {
    if (voiceSubmitting) return;
    speechRecognitionRef.current?.stop?.();
    setListening(false);
    setVoiceSendHover(false);
    setVoiceSubmitting(true);
    window.clearTimeout(voiceSubmitTimerRef.current);
    voiceSubmitTimerRef.current = window.setTimeout(() => {
      setVoiceSubmitting(false);
    }, 2000);
  }, [voiceSubmitting]);

  const submit = useCallback(async () => {
    const typedText = input.trim();
    if (working || uploading || voiceSubmitting || (!typedText && attachments.length === 0)) return;
    if (listening) speechRecognitionRef.current?.stop?.();

    const submittedAttachments = attachments.map(attachment => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      dataUrl: attachment.dataUrl,
      textContent: attachment.textContent,
    }));
    const submittedInput = input;
    setInput('');
    setAttachments([]);
    setInputError('');
    const accepted = await onSubmit?.({
      text: typedText || '请阅读并总结这些附件。',
      displayText: typedText || `已添加 ${submittedAttachments.length} 个文件`,
      attachments: submittedAttachments,
      modelSelection: selectedModel,
      targetNodes: nodeTargets.map(target => ({ ...target })),
    });
    if (accepted === false) {
      setInput(submittedInput);
      setAttachments(attachments);
    }
  }, [attachments, input, listening, nodeTargets, onSubmit, selectedModel, uploading, voiceSubmitting, working]);

  const handleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    submit();
  }, [submit]);

  const handlePaste = useCallback((event) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    handleFiles(files);
  }, [handleFiles]);

  const handleDragEnter = useCallback((event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragOver = useCallback((event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    handleFiles(event.dataTransfer?.files);
  }, [handleFiles]);

  const selectModel = useCallback((modelId) => {
    onModelChange?.(modelId);
    setModelMenuOpen(false);
  }, [onModelChange]);

  const modelPicker = (
    <div className="canvas-copilot-model-picker" ref={modelMenuRef}>
      <button
        type="button"
        className={`canvas-copilot-model-trigger ${modelMenuOpen ? 'open' : ''}`}
        onClick={() => setModelMenuOpen(current => !current)}
        disabled={working}
        aria-haspopup="menu"
        aria-expanded={modelMenuOpen}
        title={selectedModel ? `${selectedModel.providerName} · ${selectedModel.modelName}` : '自动选择模型'}
      >
        <span>{selectedModel?.label || 'Auto'}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {modelMenuOpen && (
        <div className="canvas-copilot-model-menu" role="menu">
          <button
            type="button"
            className={`canvas-copilot-model-auto ${selectedModelId === 'auto' ? 'selected' : ''}`}
            onClick={() => selectModel('auto')}
            role="menuitemradio"
            aria-checked={selectedModelId === 'auto'}
          >
            <span>
              <strong>Auto</strong>
              <small>平衡速度、思考强度与可用性。</small>
            </span>
            {selectedModelId === 'auto' && <Icon name="check" size={16} />}
          </button>

          <div className="canvas-copilot-model-section-label">精选推荐</div>
          {recommendedModels.length > 0 ? recommendedModels.map(model => (
            <button
              type="button"
              className={`canvas-copilot-model-option ${selectedModelId === model.id ? 'selected' : ''}`}
              key={model.id}
              onClick={() => selectModel(model.id)}
              role="menuitemradio"
              aria-checked={selectedModelId === model.id}
            >
              <span className="canvas-copilot-model-icon"><Icon name="messageAi3" size={15} /></span>
              <span className="canvas-copilot-model-copy">
                <strong>{model.label}</strong>
                <small>{model.providerName}</small>
              </span>
              {selectedModelId === model.id && <Icon name="check" size={16} />}
            </button>
          )) : (
            <div className="canvas-copilot-model-empty">暂无可用文本模型</div>
          )}

          {moreModels.length > 0 && (
            <>
              <button
                type="button"
                className="canvas-copilot-model-more"
                onClick={() => setShowMoreModels(current => !current)}
                aria-expanded={showMoreModels}
              >
                <span>更多模型</span>
                <Icon name="chevronDown" size={14} />
              </button>
              {showMoreModels && moreModels.map(model => (
                <button
                  type="button"
                  className="canvas-copilot-model-option"
                  key={model.id}
                  onClick={() => model.available && selectModel(model.id)}
                  disabled={!model.available}
                  role="menuitemradio"
                  aria-checked={selectedModelId === model.id}
                >
                  <span className="canvas-copilot-model-icon"><Icon name="messageAi3" size={15} /></span>
                  <span className="canvas-copilot-model-copy">
                    <strong>{model.label}</strong>
                    <small>{model.providerName}</small>
                  </span>
                  {!model.available && <em>服务未启用</em>}
                  {selectedModelId === model.id && <Icon name="check" size={16} />}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`canvas-copilot-composer ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className="canvas-copilot-file-input"
        type="file"
        accept={COPILOT_FILE_ACCEPT}
        multiple
        onChange={event => handleFiles(event.target.files)}
      />
      {dragActive && <div className="canvas-copilot-drop-hint">松开即可添加文件</div>}
      <CopilotNodeReferences
        targets={nodeTargets}
        picking={pickingCanvasNode}
        showAdd
        addDisabled={working}
        onTogglePicker={onToggleCanvasPicker}
        onRemove={onRemoveNodeTarget}
        onFocus={onFocusNodeTarget}
      />
      {attachments.length > 0 && (
        <div className="canvas-copilot-attachments">
          {attachments.map(attachment => (
            <div
              className={`canvas-copilot-attachment ${attachment.progress < 100 ? 'uploading' : ''}`}
              key={attachment.id}
              title={`${attachment.name} · ${formatCopilotAttachmentSize(attachment.size)}`}
              style={{ '--attachment-progress': `${attachment.progress * 3.6}deg` }}
            >
              {attachment.kind === 'image' && attachment.dataUrl ? (
                <img src={attachment.dataUrl} alt={attachment.name} />
              ) : (
                <span className="canvas-copilot-attachment-file"><Icon name="fileText" size={19} /></span>
              )}
              <span className="canvas-copilot-attachment-name">{attachment.name}</span>
              {attachment.progress < 100 ? (
                <strong>{attachment.progress}%</strong>
              ) : (
                <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`移除 ${attachment.name}`}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {inputError && <div className="canvas-copilot-input-error" role="alert">{inputError}</div>}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="和 Copilot 聊天，或告诉它要创建什么..."
        rows={3}
      />
      <div className="canvas-copilot-composer-footer">
        <div className="canvas-copilot-composer-left">
          <button
            type="button"
            className="canvas-copilot-round-action"
            onClick={() => fileInputRef.current?.click()}
            disabled={working || attachments.length >= COPILOT_MAX_ATTACHMENTS}
            aria-label="添加文件"
            title="添加文件"
          >
            <Icon name="attachment" size={17} />
          </button>
        </div>
        <div className={`canvas-copilot-composer-actions${listening ? ' is-voice-listening' : ''}${voiceSubmitting ? ' is-voice-submitting' : ''}`}>
          {voiceSubmitting ? (
            <button
              type="button"
              className="canvas-copilot-voice-loading"
              disabled
              aria-label="正在确认语音输入"
              title="正在确认语音输入"
            >
              <Icon name="loader" size={18} />
            </button>
          ) : listening ? (
            <>
              <button
                type="button"
                className="canvas-copilot-voice-cancel"
                onClick={toggleVoiceInput}
                disabled={working}
                aria-label="取消语音输入"
                title="取消"
              >
                <Icon name="x" size={18} />
              </button>
              <button
                type="button"
                className={`canvas-copilot-voice-confirm ${voiceSendHover ? 'is-send-hover' : ''}`}
                onClick={confirmVoiceInput}
                onPointerLeave={() => setVoiceSendHover(false)}
                disabled={working}
                aria-label="确认语音输入"
                title="发送"
              >
                <span className="canvas-copilot-voice-dots left" aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span className="canvas-copilot-voice-label">发送</span>
                <span className="canvas-copilot-voice-dots right" aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span
                  className="canvas-copilot-voice-arrow"
                  aria-hidden="true"
                  onPointerEnter={() => setVoiceSendHover(true)}
                >
                  <Icon name="arrowUp" size={18} />
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="canvas-copilot-voice-btn"
                onClick={toggleVoiceInput}
                disabled={working}
                aria-label="开始语音输入"
                title="语音输入"
              >
                <Icon name="mic" size={17} />
              </button>
              {modelPicker}
              <button
                type="button"
                className="canvas-copilot-send-btn"
                onClick={submit}
                disabled={working || uploading || (!input.trim() && attachments.length === 0)}
                aria-label="发送"
                title={uploading ? '文件读取中' : '发送'}
              >
                <Icon name={working || uploading ? 'loader' : 'arrowUp'} size={17} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CopilotComposer;
