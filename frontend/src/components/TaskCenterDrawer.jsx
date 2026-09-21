import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { API_BASE } from '../apiBase';
import { parseJsonResponse } from '../apiResponse';
import {
  getTaskMediaAddresses,
  toDisplayMediaUrl,
} from '../taskMedia';
import { getTaskDurationLabel, isTaskActive } from '../taskTiming';

const STATUS_LABELS = {
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  query_failed: '状态查询失败',
  saving: '保存中',
  save_failed: '已生成 · 保存失败',
  cancelled: '已取消',
};

const STATUS_COLORS = {
  running: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--danger)',
  query_failed: 'var(--warning, #d97706)',
  saving: 'var(--accent)',
  save_failed: 'var(--warning, #d97706)',
  cancelled: 'var(--fg-tertiary)',
};

function summarizeTasks(tasks) {
  return {
    total: tasks.length,
    running: tasks.filter(task => ['running', 'saving'].includes(task.status)).length,
    completed: tasks.filter(task => task.status === 'completed').length,
    failed: tasks.filter(task => task.status === 'failed').length,
    query_failed: tasks.filter(task => task.status === 'query_failed').length,
    save_failed: tasks.filter(task => task.status === 'save_failed').length,
    cancelled: tasks.filter(task => task.status === 'cancelled').length,
  };
}

function TaskCenterDrawer({ open, onClose, projectId, onLocateNode }) {
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
    query_failed: 0,
    save_failed: 0,
    cancelled: 0,
  });
  const [retryingTaskId, setRetryingTaskId] = useState('');
  const [copiedValue, setCopiedValue] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applyTaskList = useCallback((data) => {
    const nextTasks = [...data.tasks].sort((a, b) => b.created_at - a.created_at);
    setTasks(nextTasks);
    setCounts(summarizeTasks(nextTasks));
    setNowMs(Date.now());
    return nextTasks;
  }, []);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (projectId) {
      params.set('project_id', projectId);
    }
    const qs = params.toString();
    try {
      const response = await fetch(`${API_BASE}/api/tasks${qs ? '?' + qs : ''}`);
      const data = await parseJsonResponse(response, '获取任务列表失败');
      if (!data.success) return;
      applyTaskList(data);
    } catch (error) {
      console.warn('获取任务列表失败', error);
    }
  }, [applyTaskList, projectId]);

  useEffect(() => {
    if (!open) return;
    const initialTimer = window.setTimeout(fetchTasks, 0);
    const interval = setInterval(fetchTasks, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchTasks, open]);

  useEffect(() => {
    if (!open || !tasks.some(task => isTaskActive(task.status))) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [open, tasks]);

  const handleClearHistory = () => {
    if (!window.confirm('确定清除所有已完成、已失败或已取消的历史任务记录吗？')) return;
    fetch(`${API_BASE}/api/tasks/history`, { method: 'DELETE' })
      .then(r => parseJsonResponse(r, '清理任务历史失败'))
      .then(data => {
        if (data.ok) {
          fetchTasks();
        }
      })
      .catch(err => console.warn('清理任务历史失败', err));
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(toDisplayMediaUrl(value));
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(''), 1200);
    } catch {
      window.prompt('复制地址', toDisplayMediaUrl(value));
    }
  };

  const handleRetryPersistence = async (task) => {
    setRetryingTaskId(task.task_id);
    try {
      const response = await fetch(`${API_BASE}/api/task/${encodeURIComponent(task.task_id)}/persist`, {
        method: 'POST',
      });
      const data = await parseJsonResponse(response, '重新保存失败');
      if (!data.success && data.error) {
        window.alert(`重新保存失败：${data.error}`);
      }
      fetchTasks();
    } catch (error) {
      window.alert(`重新保存失败：${error.message || '无法连接服务器'}`);
    } finally {
      setRetryingTaskId('');
    }
  };

  if (!open) return null;

  return (
    <aside className="canvas-task-drawer nodrag nopan">
      <div className="canvas-task-drawer-header">
        <h2>任务中心</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {tasks.length > 0 && (
            <button
              className="canvas-task-clear-btn"
              onClick={handleClearHistory}
              title="清除已完成/已取消/已失败的历史记录"
            >
              <Icon name="trash" size={14} /> 清理历史
            </button>
          )}
          <button className="canvas-task-drawer-close" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <div className="canvas-task-stats">
        <span>共 {counts.total} 个任务</span>
        <span className="stat-running">{counts.running} 进行中</span>
        <span className="stat-completed">{counts.completed} 已完成</span>
        <span className="stat-failed">{counts.failed} 失败</span>
        {counts.query_failed > 0 && (
          <span className="stat-save-failed">{counts.query_failed} 查询异常</span>
        )}
        <span className="stat-save-failed">{counts.save_failed} 保存失败</span>
      </div>
      <div className="canvas-task-list">
        {tasks.length === 0 && <div className="canvas-task-empty">暂无任务</div>}
        {tasks.map(task => {
          const { sourceUrls, serverUrls } = getTaskMediaAddresses(task);
          const durationLabel = getTaskDurationLabel(task, nowMs);
          const canRetry = sourceUrls.length > serverUrls.length
            && !['running', 'saving'].includes(task.status);
          return (
            <div
              key={task.task_id}
              className={`canvas-task-item ${task.node_id ? 'clickable' : ''}`}
              onClick={() => task.node_id && onLocateNode?.(task.node_id)}
              title={task.node_id ? '点击在画布中定位此节点' : ''}
            >
              <div className="task-summary">
                <span className="task-status-dot" style={{ background: STATUS_COLORS[task.status] || 'var(--fg-tertiary)' }} />
                <div className="task-info">
                  <span className="task-title" title={task.prompt_summary || task.task_id}>
                    {task.prompt_summary ? task.prompt_summary : `任务 ${task.task_id?.slice(-8)}`}
                  </span>
                  <span className="task-meta">
                    {task.type === 'video' ? '视频生成' : '图片生成'}
                    {task.node_id && ' · 点击定位节点'}
                    {durationLabel && <span className="task-duration-label"> · {durationLabel}</span>}
                  </span>
                </div>
                <span className="task-status" style={{ color: STATUS_COLORS[task.status] || 'var(--fg-tertiary)' }}>
                  {STATUS_LABELS[task.status] || task.status}
                </span>
              </div>
              {(sourceUrls.length > 0 || serverUrls.length > 0) && (
                <div className="task-media-addresses" onClick={event => event.stopPropagation()}>
                  {sourceUrls.map((url, index) => (
                    <div className="task-media-address" key={`source_${url}_${index}`}>
                      <span className="task-media-address-label">中转站地址</span>
                      <code title={url}>{url}</code>
                      <div className="task-media-actions">
                        <a href={url} target="_blank" rel="noreferrer">打开原始结果</a>
                        <button type="button" onClick={() => handleCopy(url)}>
                          {copiedValue === url ? '已复制' : '复制'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {serverUrls.map((url, index) => (
                    <div className="task-media-address server" key={`server_${url}_${index}`}>
                      <span className="task-media-address-label">本站服务器地址</span>
                      <code title={toDisplayMediaUrl(url)}>{toDisplayMediaUrl(url)}</code>
                      <div className="task-media-actions">
                        <a href={toDisplayMediaUrl(url)} target="_blank" rel="noreferrer">打开本站结果</a>
                        <button type="button" onClick={() => handleCopy(url)}>
                          {copiedValue === url ? '已复制' : '复制'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {task.save_error && <div className="task-media-error">{task.save_error}</div>}
                  {canRetry && (
                    <button
                      type="button"
                      className="task-media-retry"
                      disabled={retryingTaskId === task.task_id}
                      onClick={() => handleRetryPersistence(task)}
                    >
                      {retryingTaskId === task.task_id ? '正在保存…' : '重新保存到服务器'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export default TaskCenterDrawer;
