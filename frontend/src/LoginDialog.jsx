import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon';
import {
  buildLoginPayload,
  getLoginErrorMessage,
  getLoginValidationError,
} from './loginDialogModel';

function LoginDialog({ open, submitting = false, error = '', onClose, onSubmit }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const usernameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLocalError('');
    window.requestAnimationFrame(() => usernameRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, submitting]);

  const submit = useCallback(async (event) => {
    event?.preventDefault?.();
    const validationError = getLoginValidationError(username, password);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');
    await onSubmit(buildLoginPayload(username, password));
  }, [onSubmit, password, username]);

  if (!open) return null;

  const visibleError = localError || (error ? getLoginErrorMessage({ detail: error }) : '');

  return (
    <div
      className="login-dialog-overlay"
      onMouseDown={() => {
        if (!submitting) onClose();
      }}
    >
      <section
        className="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="login-dialog-header">
          <div>
            <span className="login-dialog-kicker">InUx Canvas</span>
            <h2 id="login-dialog-title">登录画布</h2>
          </div>
          <button
            type="button"
            className="login-dialog-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="关闭登录弹窗"
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <form className="login-dialog-form" onSubmit={submit}>
          <label>
            <span>用户名</span>
            <input
              ref={usernameRef}
              value={username}
              onChange={event => setUsername(event.target.value)}
              disabled={submitting}
              autoComplete="username"
              placeholder="输入用户名"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={submitting}
              autoComplete="current-password"
              placeholder="输入密码"
            />
          </label>
          {visibleError && (
            <p className="login-dialog-error" role="alert">{visibleError}</p>
          )}
          <div className="login-dialog-actions">
            <button
              type="button"
              className="login-dialog-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="login-dialog-primary"
              disabled={submitting}
            >
              {submitting && <Icon name="loader" size={16} />}
              {submitting ? '登录中' : '进入画布'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginDialog;
