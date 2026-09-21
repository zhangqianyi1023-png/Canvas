import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export default function SaveWorkflowTemplateDialog({
  open,
  title = '收藏为模板',
  initialName = '',
  initialDescription = '',
  nodeCount = 0,
  edgeCount = 0,
  saving = false,
  error = '',
  confirmLabel = '保存模板',
  onClose,
  onConfirm,
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [validationError, setValidationError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, saving]);

  if (!open) return null;

  const submit = event => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setValidationError('请输入模板名称');
      inputRef.current?.focus();
      return;
    }
    setValidationError('');
    onConfirm?.({ name: cleanName, description: description.trim() });
  };

  return createPortal(
    <div className="modal-overlay workflow-template-dialog-overlay" onMouseDown={() => !saving && onClose?.()}>
      <form
        className="workflow-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-template-dialog-title"
        onMouseDown={event => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="workflow-template-dialog-header">
          <div>
            <h2 id="workflow-template-dialog-title">{title}</h2>
            <p>{nodeCount} 个节点 · {edgeCount} 条内部连线</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="workflow-template-dialog-body">
          <label>
            模板名称
            <input
              ref={inputRef}
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="例如：电商商品多方向出图"
              maxLength={80}
              disabled={saving}
            />
          </label>
          <label>
            模板说明
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="说明这个工作流适合什么场景、需要修改哪些部分"
              rows={4}
              maxLength={500}
              disabled={saving}
            />
          </label>
          {(validationError || error) && (
            <div className="workflow-template-dialog-error">{validationError || error}</div>
          )}
          {saving && (
            <div className="workflow-template-saving">
              正在保护图片和视频，并保存模板…
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn cancel" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="modal-btn confirm" disabled={saving || nodeCount === 0}>
            {saving ? '保存中…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
