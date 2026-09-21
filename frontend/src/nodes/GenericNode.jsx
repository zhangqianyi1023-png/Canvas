import { memo, useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import Icon from '../components/Icon';
import { API_BASE } from '../apiBase';

function GenericNode({ id, data }) {
  const { meta, onUpdateOutputs } = data;
  const [values, setValues] = useState(() => {
    const init = {};
    for (const [key, cfg] of Object.entries(meta.inputs)) {
      init[key] = cfg.default ?? '';
    }
    return init;
  });
  const [outputs, setOutputs] = useState({});
  const [status, setStatus] = useState('idle'); // idle, running, success, error

  const handleChange = useCallback((key, value) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleRun = useCallback(async () => {
    setStatus('running');
    setOutputs({});
    try {
      const resp = await fetch(`${API_BASE}/api/${meta.type.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await resp.json();
      if (result.success) {
        setStatus('success');
        const out = {};
        for (const key of Object.keys(meta.outputs)) {
          if (result[key] !== undefined) out[key] = result[key];
        }
        setOutputs(out);
        if (onUpdateOutputs) onUpdateOutputs(id, out);
      } else {
        setStatus('error');
        setOutputs({ error: result.error });
      }
    } catch (e) {
      setStatus('error');
      setOutputs({ error: e.message });
    }
  }, [values, meta, id, onUpdateOutputs]);

  const nodeClass = `custom-node ${status}`;

  return (
    <div className={nodeClass}>
      {/* 输入 Handle */}
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />

      <div className="node-header">
        <span>{meta.display_name}</span>
        <span className="category">{meta.category}</span>
      </div>

      <div className="node-body">
        {Object.entries(meta.inputs).map(([key, cfg]) => (
          <div className="node-field" key={key}>
            <label>{cfg.label || key}</label>
            {cfg.type === 'select' ? (
              <select value={values[key]} onChange={e => handleChange(key, e.target.value)}>
                {cfg.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : cfg.multiline ? (
              <textarea
                value={values[key]}
                onChange={e => handleChange(key, e.target.value)}
                rows={3}
              />
            ) : (
              <input
                type={cfg.type === 'float' || cfg.type === 'int' ? 'number' : 'text'}
                value={values[key]}
                onChange={e => handleChange(key, cfg.type === 'float' ? parseFloat(e.target.value) : cfg.type === 'int' ? parseInt(e.target.value) : e.target.value)}
                step={cfg.type === 'float' ? 0.05 : 1}
                min={cfg.min}
                max={cfg.max}
              />
            )}
          </div>
        ))}

        <button className="run-btn" onClick={handleRun} disabled={status === 'running'}>
          <Icon name={status === 'running' ? 'loader' : 'play'} size={14} />
          {status === 'running' ? '执行中...' : '执行'}
        </button>

        {Object.keys(outputs).length > 0 && (
          <div className="node-output">
            {Object.entries(outputs).map(([key, val]) => (
              <div key={key}>
                {key === 'image_url' && val && val.startsWith('http') ? (
                  <div>
                    <strong>{key}:</strong>
                    <img src={val} alt="output" className="image-preview" />
                  </div>
                ) : key === 'video_url' && val && val.startsWith('http') ? (
                  <div>
                    <strong>{key}:</strong>
                    <video src={val} controls className="video-preview" />
                  </div>
                ) : (
                  <div><strong>{key}:</strong> {String(val).substring(0, 200)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输出 Handle */}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
    </div>
  );
}

export default memo(GenericNode);
