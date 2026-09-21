import { useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export default function PromptStylePicker({
  styles = [],
  onSelect,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const categories = useMemo(() => {
    const grouped = new Map();
    styles
      .filter(style => style?.enabled !== false && String(style?.prompt || '').trim())
      .forEach(style => {
        const category = style.category || '其他';
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push(style);
      });
    return [...grouped.entries()].map(([category, items]) => ({ category, items }));
  }, [styles]);

  const hasStyles = categories.some(group => group.items.length > 0);

  return (
    <div className={`prompt-style-picker ${className}`.trim()} ref={wrapperRef}>
      <button
        type="button"
        className="processor-settings-btn prompt-style-trigger"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        title="选择图片风格"
      >
        <Icon name="palette" size={15} />
        <span className="processor-settings-summary">图片风格</span>
      </button>
      {open && (
        <div className="prompt-style-popover">
          <header>
            <strong>选择风格</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭">
              <Icon name="x" size={14} />
            </button>
          </header>
          {hasStyles ? (
            <div className="prompt-style-groups">
              {categories.map(group => (
                <section className="prompt-style-group" key={group.category}>
                  <h4>{group.category}</h4>
                  <div className="prompt-style-card-list">
                    {group.items.map(style => (
                      <button
                        type="button"
                        className="prompt-style-card"
                        key={style.id}
                        onClick={() => {
                          onSelect?.(style);
                          setOpen(false);
                        }}
                      >
                        <span className="prompt-style-thumb">
                          {style.coverUrl ? <img src={style.coverUrl} alt="" loading="lazy" /> : <Icon name="palette" size={22} />}
                        </span>
                        <span className="prompt-style-info">
                          <strong>{style.name}</strong>
                          <small>{style.prompt}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="prompt-style-empty">暂无可用风格</div>
          )}
        </div>
      )}
    </div>
  );
}
