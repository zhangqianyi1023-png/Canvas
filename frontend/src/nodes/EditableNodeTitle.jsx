import { useEffect, useRef, useState } from 'react';
import { NODE_TAG_COLOR_MAP, normalizeNodeTagColors } from '../nodeTagColors';

function EditableNodeTitle({ icon, value, fallback, tagColors, titleAfterText, onChange, onEditingChange }) {
  const resolvedFallback = fallback || '未命名节点';
  const currentValue = String(value || '').trim() || resolvedFallback;
  const normalizedTagColors = normalizeNodeTagColors(tagColors);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue);
  const previousValueRef = useRef(currentValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frameId);
  }, [editing]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const setEditingState = (nextEditing) => {
    setEditing(nextEditing);
    // Notify in the same event tick so the node hover toolbar disappears before focus settles.
    onEditingChange?.(nextEditing);
  };

  const startEditing = () => {
    previousValueRef.current = currentValue;
    setDraft(currentValue);
    setEditingState(true);
  };

  const commit = () => {
    if (!editing) return;
    const nextValue = draft.trim() || previousValueRef.current || resolvedFallback;
    setEditingState(false);
    setDraft(nextValue);
    if (nextValue !== currentValue) onChange?.(nextValue);
  };

  const cancel = () => {
    setEditingState(false);
    setDraft(previousValueRef.current || currentValue);
  };

  return (
    <span
      className={`node-title editable-node-title nodrag nopan ${editing ? 'editing' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!editing) startEditing();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!editing) startEditing();
      }}
    >
      {icon}
      {editing ? (
        <input
          ref={inputRef}
          className="node-title-input nodrag nopan editing"
          value={draft}
          aria-label="节点标题"
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <>
          <span className="node-title-text" title={currentValue}>{currentValue}</span>
          {titleAfterText ? (
            <span className="node-title-after-text">{titleAfterText}</span>
          ) : null}
          <span className="node-title-flex-spacer" aria-hidden="true" />
          {normalizedTagColors.length > 0 && (
            <span className="node-title-tag-dots" aria-label={`标记：${normalizedTagColors.map(colorId => NODE_TAG_COLOR_MAP[colorId].label).join('、')}`}>
              {normalizedTagColors.map(colorId => {
                const color = NODE_TAG_COLOR_MAP[colorId];
                return <span key={colorId} style={{ '--node-tag-color': color.value }} title={color.label} />;
              })}
            </span>
          )}
        </>
      )}
    </span>
  );
}

export default EditableNodeTitle;
