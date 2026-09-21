import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getMentionLabel = (index) => `图 ${index + 1}`;
const getMentionToken = (index) => `[[image_ref:${index}]]`;
const CARET_MARKER = '\u200b';

const buildTokenHtml = (item) => (
  `<span class="image-mention-token" contenteditable="false" data-index="${item.index}" data-label="${escapeHtml(item.label)}" data-url="${escapeHtml(item.url)}">`
  + `<img src="${escapeHtml(item.url)}" alt="">`
  + `<span>${escapeHtml(item.label)}</span>`
  + '</span>'
);

const valueToHtml = (value, items) => {
  const text = String(value || '');
  if (!text) return '';
  let html = '';
  let index = 0;
  const tokenRegex = /\[\[image_ref:(\d+)]]|@图\s*(\d+)/g;
  let match = tokenRegex.exec(text);
  while (match) {
    html += escapeHtml(text.slice(index, match.index));
    const imageIndex = match[1] !== undefined ? Number(match[1]) : Number(match[2]) - 1;
    const item = items.find(candidate => candidate.index === imageIndex);
    html += item ? buildTokenHtml(item) : escapeHtml(match[0]);
    index = match.index + match[0].length;
    match = tokenRegex.exec(text);
  }
  html += escapeHtml(text.slice(index)).replace(/\n/g, '<br>');
  return html;
};

const plainTextFromEditor = (editor) => {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList?.contains('image-mention-token')) {
      const index = Number(node.dataset.index);
      parts.push(Number.isFinite(index) ? getMentionToken(index) : `@${node.dataset.label || '图 1'}`);
      return;
    }
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    node.childNodes.forEach(walk);
    if (node !== editor && ['DIV', 'P'].includes(node.tagName)) {
      parts.push('\n');
    }
  };
  editor.childNodes.forEach(walk);
  return parts.join('').replace(/\u00a0/g, ' ').replaceAll(CARET_MARKER, '');
};

function ImageMentionTextarea({
  value,
  onChange,
  referenceImages = [],
  placeholder,
  rows = 4,
  disabled = false,
  leadingToken = null,
  onLeadingTokenClick,
  onLeadingTokenRemove,
}) {
  const fieldRef = useRef(null);
  const editorRef = useRef(null);
  const mentionRangeRef = useRef(null);
  const focusedRef = useRef(false);
  const selectedTokenRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState(null);
  const [query, setQuery] = useState('');

  const mentionableImages = useMemo(() => (
    referenceImages
      .map((url, index) => ({ url, index, label: getMentionLabel(index) }))
      .filter(item => item.url)
  ), [referenceImages]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focusedRef.current) return;
    const nextHtml = valueToHtml(value, mentionableImages);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
      editor.dataset.empty = String(!String(value || '').trim());
    }
  }, [mentionableImages, value]);

  const syncValue = () => {
    if (disabled) return value || '';
    const editor = editorRef.current;
    if (!editor) return '';
    const nextValue = plainTextFromEditor(editor);
    editor.dataset.empty = String(!nextValue.trim());
    onChange(nextValue);
    return nextValue;
  };

  const clearSelectedToken = () => {
    selectedTokenRef.current?.classList?.remove('selected');
    selectedTokenRef.current = null;
  };

  const selectTokenForDeletion = (token) => {
    if (!token) return;
    clearSelectedToken();
    selectedTokenRef.current = token;
    token.classList.add('selected');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(token);
    selection?.removeAllRanges();
    selection?.addRange(range);
    setPickerOpen(false);
    setPickerPosition(null);
  };

  const removeSelectedToken = () => {
    const token = selectedTokenRef.current;
    if (!token) return;
    const marker = token.nextSibling?.nodeType === Node.TEXT_NODE && token.nextSibling.textContent === CARET_MARKER
      ? token.nextSibling
      : null;
    const range = document.createRange();
    range.setStartBefore(token);
    range.collapse(true);
    token.remove();
    marker?.remove();
    clearSelectedToken();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    syncValue();
  };

  const getTokenBeforeCaret = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) {
      return null;
    }

    let previous = null;
    const { anchorNode, anchorOffset } = selection;
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      const beforeCaret = (anchorNode.textContent || '').slice(0, anchorOffset);
      if (beforeCaret.replaceAll(CARET_MARKER, '').length > 0) return null;
      previous = anchorNode.previousSibling;
    } else if (anchorNode.nodeType === Node.ELEMENT_NODE) {
      previous = anchorNode.childNodes[Math.max(0, anchorOffset - 1)] || null;
    }

    while (previous?.nodeType === Node.TEXT_NODE && (previous.textContent || '').replaceAll(CARET_MARKER, '') === '') {
      previous = previous.previousSibling;
    }
    return previous?.nodeType === Node.ELEMENT_NODE && previous.classList?.contains('image-mention-token')
      ? previous
      : null;
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (selectedTokenRef.current && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      removeSelectedToken();
      return;
    }

    if (event.key === 'Backspace') {
      const token = getTokenBeforeCaret();
      if (token) {
        event.preventDefault();
        selectTokenForDeletion(token);
        return;
      }
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key !== 'Shift') {
      clearSelectedToken();
    }
  };

  const saveMentionRange = () => {
    if (disabled) return null;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0).cloneRange();
    mentionRangeRef.current = range;
    return range;
  };

  const getRangeClientRect = (range) => {
    if (!range) return null;
    const rects = Array.from(range.getClientRects());
    const visibleRect = rects.find(rect => rect.width || rect.height);
    if (visibleRect) return visibleRect;

    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    marker.style.display = 'inline-block';
    marker.style.width = '0';
    marker.style.lineHeight = 'inherit';

    const markerRange = range.cloneRange();
    const selection = window.getSelection();
    markerRange.collapse(false);
    markerRange.insertNode(marker);
    const markerRect = marker.getBoundingClientRect();
    marker.remove();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return markerRect;
  };

  const updatePickerPosition = (range = mentionRangeRef.current) => {
    const field = fieldRef.current;
    if (!field || !range) {
      setPickerPosition(null);
      return;
    }

    const caretRect = getRangeClientRect(range);
    const fieldRect = field.getBoundingClientRect();
    if (!caretRect) {
      setPickerPosition(null);
      return;
    }

    const pickerWidth = Math.min(320, Math.max(0, fieldRect.width - 16));
    const maxLeft = Math.max(8, fieldRect.width - pickerWidth - 8);
    const left = Math.min(Math.max(8, caretRect.left - fieldRect.left), maxLeft);
    const top = Math.max(8, caretRect.bottom - fieldRect.top + 8);
    setPickerPosition({ left, top });
  };

  const textBeforeCaret = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return '';
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString();
  };

  const updatePickerState = () => {
    if (disabled) {
      setPickerOpen(false);
      setPickerPosition(null);
      setQuery('');
      return;
    }
    const range = saveMentionRange();
    const before = textBeforeCaret();
    const match = before.match(/@([^\s@]*)$/);
    if (!match || mentionableImages.length === 0) {
      setPickerOpen(false);
      setPickerPosition(null);
      setQuery('');
      return;
    }
    updatePickerPosition(range);
    setPickerOpen(true);
    setQuery(match[1] || '');
  };

  const insertMention = (item) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (mentionRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(mentionRangeRef.current);
    }
    const range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();

    if (range.startContainer?.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent || '';
      const before = text.slice(0, range.startOffset);
      const match = before.match(/@([^\s@]*)$/);
      if (match) {
        range.setStart(range.startContainer, range.startOffset - match[0].length);
        range.deleteContents();
      }
    }

    const wrapper = document.createElement('span');
    wrapper.innerHTML = buildTokenHtml(item);
    const token = wrapper.firstElementChild;
    range.insertNode(token);
    const marker = document.createTextNode(CARET_MARKER);
    token.after(marker);
    range.setStart(marker, marker.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    setPickerOpen(false);
    setPickerPosition(null);
    setQuery('');
    syncValue();
  };

  const filteredItems = mentionableImages.filter(item => (
    !query.trim() || item.label.replace(/\s/g, '').includes(query.replace(/\s/g, ''))
  ));

  const minHeight = Math.max(88, rows * 24 + 32);

  return (
    <div ref={fieldRef} className={`image-mention-field nodrag ${disabled ? 'disabled' : ''} ${leadingToken ? 'has-leading-token' : ''}`}>
      {leadingToken && (
        <div className="quick-prompt-input-token" contentEditable="false">
          <button type="button" className="quick-prompt-token-label" onClick={onLeadingTokenClick} disabled={disabled} title="重新选择快捷提示词">
            <Icon name="quoteText" size={13} />
            <span>{leadingToken.title}</span>
          </button>
          <button type="button" className="quick-prompt-token-remove" onClick={onLeadingTokenRemove} disabled={disabled} aria-label={`取消快捷提示词 ${leadingToken.title}`}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        className="image-mention-editor nowheel"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty={String(!String(value || '').trim())}
        style={{ minHeight }}
        onFocus={() => {
          if (disabled) return;
          focusedRef.current = true;
          const editor = editorRef.current;
          if (editor && editor.innerHTML !== valueToHtml(value, mentionableImages) && !plainTextFromEditor(editor).trim()) {
            editor.innerHTML = valueToHtml(value, mentionableImages);
          }
        }}
        onBlur={() => {
          focusedRef.current = false;
          clearSelectedToken();
          window.setTimeout(() => {
            setPickerOpen(false);
            setPickerPosition(null);
          }, 120);
        }}
        onKeyDown={handleKeyDown}
        onInput={() => {
          if (disabled) return;
          clearSelectedToken();
          syncValue();
          updatePickerState();
        }}
        onKeyUp={updatePickerState}
        onClick={() => {
          clearSelectedToken();
          updatePickerState();
        }}
      />
      {pickerOpen && (
        <div
          className="image-mention-picker"
          style={pickerPosition ? {
            left: `${pickerPosition.left}px`,
            top: `${pickerPosition.top}px`,
          } : undefined}
        >
          {filteredItems.length > 0 ? filteredItems.map(item => (
            <button
              key={`${item.url}_${item.index}`}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => insertMention(item)}
            >
              <img src={item.url} alt={item.label} />
              <span>{item.label}</span>
            </button>
          )) : (
            <div className="image-mention-empty">没有匹配的参考图</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageMentionTextarea;
