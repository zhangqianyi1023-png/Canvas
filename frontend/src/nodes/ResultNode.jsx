// ===== 结果节点 =====
// nodeType === 'result'
// resultType === 'generateText' → 文本节点
// resultType === 'generateImage' → 生成图片节点
// resultType === 'generateVideo' → 生成视频节点
// resultType === 'generateStoryboardScript' → 生成分镜脚本节点
import { memo, useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Handle, NodeResizer, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import Icon from '../components/Icon';
import ImagePreviewOverlay from '../components/ImagePreviewOverlay';
import ImageActionOverlay from './ImageActionOverlay';
import VideoFrameCaptureControls from './VideoFrameCaptureControls.jsx';
import { normalizeQuickTrimContract } from './videoQuickTrim.js';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';
import {
  SUPPORTED_IMAGE_ACCEPT,
  getUnsupportedImageMessage,
  isSupportedImageFile,
} from '../imageFormats';
import { uploadImageFile } from '../uploadImage';
import { readLocalImageFileSize } from '../imageFileMetadata';
import { uploadAudioFile } from '../uploadAudio';
import {
  SUPPORTED_AUDIO_ACCEPT,
  getUnsupportedAudioMessage,
  isSupportedAudioFile,
} from '../audioFormats';
import {
  SUPPORTED_VIDEO_ACCEPT,
  getUnsupportedVideoMessage,
  isSupportedVideoFile,
} from '../videoFormats';
import { uploadVideoFile } from '../uploadVideo';
import { calculateExpandedImageLayout } from '../resultImageExpansionLayout';
import { preferCanvasServerUrls } from '../taskMedia';
import { shouldCloseExpandedImagesOnKeyDown } from '../resultImageExpansionInteraction';
import { copyImageToClipboard, downloadImages } from '../imageDownload';
import { getTaskDurationLabel, isTaskActive } from '../taskTiming';
import {
  DEFAULT_TEXT_FORMAT_STATE,
  TEXT_FORMAT_COLORS,
  applyTextFormat,
  getTextFormatState,
} from '../textFormatting';
import { formatImageDimensions, normalizeImageDimensions } from '../imageDimensions';

const IMAGE_POINTER_INTENT_THRESHOLD = 6;
const STORYBOARD_FRAME_POINTER_INTENT_THRESHOLD = 8;
const EXPANDED_IMAGE_CLOSE_MS = 180;
const IMAGE_TOOLBAR_CLOSE_MS = 180;
const RESULT_TOOLBAR_CLOSE_MS = 180;
const VIDEO_ENHANCEMENT_RESOLUTION_OPTIONS = ['1080P', '2K', '4K'];
const VIDEO_ENHANCEMENT_FPS_OPTIONS = ['自适应（原帧数）', '30fps', '60fps', '90fps'];
const VIDEO_ENHANCEMENT_SLOW_OPTIONS = ['自适应（原速）', '2x'];
const DEFAULT_VIDEO_ENHANCEMENT_SETTINGS = {
  resolution: '1080P',
  fps: '自适应（原帧数）',
  slow: '自适应（原速）',
};

const getViewportSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1280,
  height: typeof window !== 'undefined' ? window.innerHeight : 800,
});

const ImageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <path d="M938.666667 553.92V768c0 64.8-52.533333 117.333333-117.333334 117.333333H202.666667c-64.8 0-117.333333-52.533333-117.333334-117.333333V256c0-64.8 52.533333-117.333333 117.333334-117.333333h618.666666c64.8 0 117.333333 52.533333 117.333334 117.333333v297.92z m-64-74.624V256a53.333333 53.333333 0 0 0-53.333334-53.333333H202.666667a53.333333 53.333333 0 0 0-53.333334 53.333333v344.48A290.090667 290.090667 0 0 1 192 597.333333a286.88 286.88 0 0 1 183.296 65.845334C427.029333 528.384 556.906667 437.333333 704 437.333333c65.706667 0 126.997333 16.778667 170.666667 41.962667z m0 82.24c-5.333333-8.32-21.130667-21.653333-43.648-32.917333C796.768 511.488 753.045333 501.333333 704 501.333333c-121.770667 0-229.130667 76.266667-270.432 188.693334-2.730667 7.445333-7.402667 20.32-13.994667 38.581333-7.68 21.301333-34.453333 28.106667-51.370666 13.056-16.437333-14.634667-28.554667-25.066667-36.138667-31.146667A222.890667 222.890667 0 0 0 192 661.333333c-14.464 0-28.725333 1.365333-42.666667 4.053334V768a53.333333 53.333333 0 0 0 53.333334 53.333333h618.666666a53.333333 53.333333 0 0 0 53.333334-53.333333V561.525333zM320 480a96 96 0 1 1 0-192 96 96 0 0 1 0 192z m0-64a32 32 0 1 0 0-64 32 32 0 0 0 0 64z" fill="#b0b5be" />
  </svg>
);

function ResultPortalToolbar({
  open,
  actions,
  onPointerEnter,
  onPointerLeave,
}) {
  const layerRef = useRef(null);
  const toolbarRef = useRef(null);
  const [portalPosition, setPortalPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open || actions.length === 0) {
      setPortalPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = layerRef.current?.closest?.('.result-node-toolbar-anchor')
        || layerRef.current?.parentElement;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const nextPosition = {
        left: Math.round((rect.left + rect.width / 2) * 10) / 10,
        top: Math.round(Math.max(64, rect.top - 14) * 10) / 10,
      };
      setPortalPosition((current) => {
        if (current?.left === nextPosition.left && current?.top === nextPosition.top) {
          return current;
        }
        return nextPosition;
      });
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [actions.length, open]);

  useCanvasWheelHandoff(toolbarRef, {
    enabled: open && actions.length > 0 && Boolean(portalPosition),
  });

  const toolbar = (
    <div
      ref={toolbarRef}
      className="image-action-toolbar nodrag result-image-portal-toolbar result-node-portal-toolbar"
      style={portalPosition ? { left: portalPosition.left, top: portalPosition.top } : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map(item => (
        <button
          key={item.action}
          type="button"
          className={item.tone === 'danger' ? 'danger' : ''}
          onClick={(event) => {
            event.stopPropagation();
            item.onClick?.(event);
          }}
          data-tooltip={item.label}
          aria-label={item.label}
        >
          <Icon name={item.icon} size={14} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <span ref={layerRef} className="result-node-toolbar-layer">
      {open && portalPosition && typeof document !== 'undefined'
        ? createPortal(toolbar, document.body)
        : null}
    </span>
  );
}

function TextFormatToolbarPortal({
  open,
  anchorRef,
  fallbackAnchorRef,
  value,
  selection,
  formatState,
  expanded,
  onApply,
  onCommand,
}) {
  const toolbarRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const rect = (
        anchorRef.current?.getBoundingClientRect()
        || fallbackAnchorRef?.current?.getBoundingClientRect()
      );
      if (!rect) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }
      const nextPosition = {
        left: Math.round(Math.min(Math.max(rect.left + rect.width / 2, 168), window.innerWidth - 168) * 10) / 10,
        top: Math.round(Math.max(70, rect.top - 16) * 10) / 10,
      };
      setPosition(current => (
        current?.left === nextPosition.left && current?.top === nextPosition.top
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [anchorRef, fallbackAnchorRef, open]);

  useCanvasWheelHandoff(toolbarRef, {
    enabled: open && Boolean(position),
  });

  const state = formatState || getTextFormatState(value, selection.start, selection.end);

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const apply = (action, payload) => {
    onApply?.(action, payload);
  };

  if (!open || !position || typeof document === 'undefined') return null;

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`text-format-toolbar nodrag nopan ${expanded ? 'text-format-toolbar-expanded' : ''}`.trim()}
      style={{ left: position.left, top: position.top }}
      role="toolbar"
      aria-label="文本格式"
      onPointerDown={handlePointerDown}
      onMouseDown={handlePointerDown}
      onClick={(event) => event.stopPropagation()}
    >
      {[
        ['h1', 'H1', '标题 1'],
        ['h2', 'H2', '标题 2'],
        ['h3', 'H3', '标题 3'],
        ['p', 'P', '正文'],
      ].map(([action, label, title]) => (
        <button
          key={action}
          type="button"
          className="text-format-type-btn"
          aria-label={title}
          title={title}
          aria-pressed={state.block === action}
          onClick={() => apply(action)}
        >
          {label}
        </button>
      ))}
      <span className="text-format-divider" />
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="加粗"
        aria-pressed={state.bold}
        onClick={() => apply('bold')}
      >
        <strong>B</strong>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">加粗</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="斜体"
        aria-pressed={state.italic}
        onClick={() => apply('italic')}
      >
        <em>I</em>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">斜体</span>
      </button>
      <span className="text-format-divider" />
      <button
        type="button"
        className="text-format-icon-btn text-format-list-btn"
        aria-label="无序列表"
        aria-pressed={state.list === 'ul'}
        onClick={() => apply('ul')}
      >
        <span aria-hidden="true">•</span>
        <span aria-hidden="true">≡</span>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">无序列表</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn text-format-list-btn"
        aria-label="有序列表"
        aria-pressed={state.list === 'ol'}
        onClick={() => apply('ol')}
      >
        <span aria-hidden="true">1</span>
        <span aria-hidden="true">≡</span>
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">有序列表</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="插入分割线"
        onClick={() => apply('rule')}
      >
        <Icon name="subtract" size={16} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">插入分割线</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="复制提示词"
        onClick={() => onCommand?.('copyPrompt')}
      >
        <Icon name="copy" size={15} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">复制提示词</span>
      </button>
      <button
        type="button"
        className="text-format-icon-btn"
        aria-label="全屏编辑"
        disabled={expanded}
        onClick={() => onCommand?.('expand')}
      >
        <Icon name="fullscreen" size={15} />
        <span className="text-format-toolbar-tooltip" role="tooltip" aria-hidden="true">全屏编辑</span>
      </button>
    </div>
  );

  return createPortal(toolbar, document.body);
}

const isSafeColor = (value) => /^#[0-9a-fA-F]{3,8}$/.test(value || '');

const normalizeCssColor = (value) => {
  const color = String(value || '').trim();
  if (isSafeColor(color)) return color;
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return '';
  return `#${rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part)))
    .toString(16)
    .padStart(2, '0')).join('')}`;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const inlineMarkdownToHtml = (text) => {
  const source = String(text || '');
  const colorPattern = /\{color=(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/color\}/g;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = colorPattern.exec(source)) !== null) {
    html += inlineMarksToHtml(source.slice(lastIndex, match.index));
    const color = isSafeColor(match[1]) ? match[1] : TEXT_FORMAT_COLORS[0];
    html += `<span style="color: ${color};">${inlineMarksToHtml(match[2])}</span>`;
    lastIndex = match.index + match[0].length;
  }
  html += inlineMarksToHtml(source.slice(lastIndex));
  return html || '<br>';
};

const inlineMarksToHtml = (text) => {
  const source = String(text || '');
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    if (match[2]) html += `<strong>${escapeHtml(match[2])}</strong>`;
    else if (match[3]) html += `<em>${escapeHtml(match[3])}</em>`;
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
};

const markdownToRichTextHtml = (value) => {
  const text = String(value || '');
  if (!text.trim()) return '<p><br></p>';
  const lines = text.split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(`<li>${inlineMarkdownToHtml(itemMatch[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (olMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(`<li>${inlineMarkdownToHtml(itemMatch[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    blocks.push(`<p>${line.trim() ? inlineMarkdownToHtml(line) : '<br>'}</p>`);
    index += 1;
  }
  return blocks.join('');
};

const serializeInlineNode = (node) => {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'br') return '';
  const content = Array.from(element.childNodes).map(serializeInlineNode).join('');
  if (tag === 'strong' || tag === 'b') return content ? `**${content}**` : '';
  if (tag === 'em' || tag === 'i') return content ? `*${content}*` : '';
  if (tag === 'span') {
    const color = normalizeCssColor(element.style?.color);
    return color ? `{color=${color}}${content}{/color}` : content;
  }
  return content;
};

const serializeRichTextBlock = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'hr') return '---';
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(element.children)
      .filter(child => child.tagName?.toLowerCase() === 'li')
      .map((child, index) => {
        const content = serializeInlineNode(child).trim();
        return tag === 'ul' ? `- ${content}` : `${index + 1}. ${content}`;
      })
      .join('\n');
  }
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = Number(tag.slice(1));
    return `${'#'.repeat(level)} ${serializeInlineNode(element).trim()}`.trimEnd();
  }
  if (tag === 'div' || tag === 'p') return serializeInlineNode(element);
  return Array.from(element.childNodes).map(serializeRichTextBlock).join('\n');
};

const richTextHtmlToMarkdown = (root) => (
  Array.from(root?.childNodes || [])
    .map(serializeRichTextBlock)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
);

const selectionBelongsTo = (editor) => {
  if (!editor || typeof window === 'undefined') return false;
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  return Boolean(node && editor.contains(node));
};

const focusRichTextEditorEnd = (editor) => {
  if (!editor || typeof window === 'undefined') return;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const getRichTextFormatState = (editor) => {
  if (!selectionBelongsTo(editor)) return DEFAULT_TEXT_FORMAT_STATE;
  const selection = window.getSelection();
  let node = selection?.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : null;
  const closest = selector => element?.closest?.(selector);
  const block = closest('h1,h2,h3,p,div,li');
  const colorNode = closest('span[style*="color"]');
  return {
    ...DEFAULT_TEXT_FORMAT_STATE,
    block: ['h1', 'h2', 'h3'].includes(block?.tagName?.toLowerCase())
      ? block.tagName.toLowerCase()
      : 'p',
    bold: Boolean(closest('strong,b')),
    italic: Boolean(closest('em,i')),
    list: closest('ul') ? 'ul' : closest('ol') ? 'ol' : null,
    color: normalizeCssColor(colorNode?.style?.color)
      ? normalizeCssColor(colorNode?.style?.color)
      : DEFAULT_TEXT_FORMAT_STATE.color,
  };
};

const normalizeRichTextEditorDom = (editor) => {
  if (!editor) return;
  if (!editor.innerText.trim() && editor.querySelectorAll('img,video,audio').length === 0) {
    editor.innerHTML = '<p><br></p>';
  }
};

function renderInlineFormattedText(text, keyPrefix = 'inline') {
  const source = String(text || '');
  const colorPattern = /\{color=(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/color\}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = colorPattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderMarks(source.slice(lastIndex, match.index), `${keyPrefix}-${lastIndex}`));
    }
    const color = isSafeColor(match[1]) ? match[1] : 'currentColor';
    parts.push(
      <span key={`${keyPrefix}-color-${match.index}`} style={{ color }}>
        {renderMarks(match[2], `${keyPrefix}-color-${match.index}`)}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push(...renderMarks(source.slice(lastIndex), `${keyPrefix}-${lastIndex}`));
  }
  return parts.length ? parts : source;
}

function renderMarks(text, keyPrefix) {
  const source = String(text || '');
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
    if (match[2]) {
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={`${keyPrefix}-i-${match.index}`}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

function FormattedTextContent({ value, emptyText = '暂无文本内容' }) {
  const lines = String(value || '').split('\n');
  if (!String(value || '').trim()) return emptyText;

  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(<li key={`ul-${index}`}>{renderInlineFormattedText(itemMatch[1], `ul-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (olMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(<li key={`ol-${index}`}>{renderInlineFormattedText(itemMatch[1], `ol-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items}</ol>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const HeadingTag = `h${heading[1].length}`;
      blocks.push(
        <HeadingTag key={`h-${index}`}>
          {renderInlineFormattedText(heading[2], `h-${index}`)}
        </HeadingTag>
      );
      index += 1;
      continue;
    }
    blocks.push(
      <p key={`p-${index}`} className={line.trim() ? undefined : 'is-empty'}>
        {line.trim() ? renderInlineFormattedText(line, `p-${index}`) : '\u00a0'}
      </p>
    );
    index += 1;
  }

  return <div className="formatted-text-content">{blocks}</div>;
}

function RichTextEditor({
  editorRef,
  value,
  className,
  placeholder,
  onInput,
  onSelectionChange,
  onKeyDown,
  onBlur,
}) {
  const lastSyncedValueRef = useRef(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastSyncedValueRef.current === value) return;
    if (document.activeElement === editor && lastSyncedValueRef.current !== null) return;
    editor.innerHTML = markdownToRichTextHtml(value);
    lastSyncedValueRef.current = value;
  }, [editorRef, value]);

  const handleInput = useCallback((event) => {
    lastSyncedValueRef.current = richTextHtmlToMarkdown(event.currentTarget);
    onInput?.(event);
  }, [onInput]);

  const handleSelection = useCallback((event) => {
    onSelectionChange?.(event.currentTarget);
  }, [onSelectionChange]);

  const handlePaste = useCallback((event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    document.execCommand('insertText', false, text);
  }, []);

  return (
    <div
      ref={editorRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      spellCheck={false}
      onInput={handleInput}
      onSelect={handleSelection}
      onKeyUp={handleSelection}
      onMouseUp={handleSelection}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      onBlur={onBlur}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        if (event.metaKey || event.ctrlKey) return;
        event.stopPropagation();
      }}
      role="textbox"
      aria-multiline="true"
      aria-label="文本内容"
    />
  );
}

const parseImageAspect = (imageSize) => {
  if (imageSize === 'auto' || !imageSize || !imageSize.includes(':')) {
    return null;
  }
  const [w, h] = imageSize.split(':').map(n => Number.parseFloat(n));
  if (!w || !h) return null;
  return { cssValue: `${w} / ${h}`, ratio: w / h };
};

const hasStoryboardScriptShape = (data, cards) => (
  data?.resultType === 'generateStoryboardScript'
  || (
    Array.isArray(cards)
    && cards.length > 0
    && cards.some(card => (
      card?.shotNo
      || card?.title
      || card?.imagePositivePrompt
      || card?.imageUrl
      || card?.visual
      || card?.narration
    ))
  )
);

function ResultNode({ id, selected, data }) {
  const result = data?.result || '';
  const imageUrl = data?.imageUrl || '';
  const videoUrl = data?.videoUrl || '';
  const audioUrl = data?.audioUrl || '';
  const rawLabel = data?.label || '';
  const generating = data?.generating || false;
  const generationTask = data?.generationTask || null;
  const contentLocked = generating || ['running', 'saving'].includes(generationTask?.status);
  const smartSplitStatus = data?.smartSplitStatus || '';
  const imageSize = data?.imageSize || (
    data?.resultType === 'generateImage' && data?.imageSource === 'upload'
      ? 'auto'
      : '3:4'
  );
  const isImageResult = data?.resultType === 'generateImage';
  const isVideoResult = data?.resultType === 'generateVideo';
  const isEmptyVideoResult = isVideoResult && !videoUrl;
  const isAudioResult = data?.resultType === 'generateAudio';
  const isScriptResult = data?.resultType === 'generateScript';
  const isStoryboardResult = data?.resultType === 'generateStoryboard';
  const storyboardCards = Array.isArray(data?.storyboardCards) ? data.storyboardCards : [];
  const storyboardResourcePackage = data?.storyboardResourcePackage && typeof data.storyboardResourcePackage === 'object'
    ? data.storyboardResourcePackage
    : null;
  const storyboardVoiceoverScript = data?.storyboardVoiceoverScript || '';
  const isStoryboardScriptResult = hasStoryboardScriptShape(data, storyboardCards);
  const isTextResult = data?.resultType === 'generateText';
  const hasTextContent = isTextResult && typeof result === 'string' && Boolean(result.trim());
  const isComposerOpen = Boolean(data?.isComposerOpen);
  const isMultiSelected = Boolean(data?.isMultiSelected);
  const hasPendingTasks = Array.isArray(data?.taskIds) && data.taskIds.length > 0
    && !(Array.isArray(data?.imageUrls) && data.imageUrls.length > 0)
    && ['running', 'saving'].includes(data?.generationTask?.status);
  const onResultExpandStateChange = data?.onResultExpandStateChange;
  const label = isStoryboardScriptResult && ['生成分镜脚本', '分镜脚本生成器'].includes(rawLabel)
    ? '分镜工作台'
    : rawLabel;
  const displayLabel = label || (isStoryboardScriptResult ? '分镜工作台' : '结果');
  const storyboardBatchCoverTargets = storyboardCards.filter(card => (
    !card?.imageUrl
    && card?.imagePositivePrompt
    && !['running', 'saving'].includes(card?.imageGenerationTask?.status)
  ));
  const canBatchGenerateStoryboardCovers = isStoryboardScriptResult
    && storyboardCards.length > 0
    && typeof data?.onStoryboardCoverBatchGenerate === 'function';
  const titleIcon = isStoryboardScriptResult ? 'storyboardWorkbench' : isAudioResult ? 'audioGenFill' : isVideoResult ? 'videoGenFill' : isImageResult ? 'imageGenFill' : (isScriptResult || isStoryboardResult) ? 'barChartBoxAi' : 'inputMethodFill';
  const isResizableResult = isImageResult || isVideoResult || isAudioResult || isTextResult;
  const isSmartImageRatio = isImageResult && imageSize === 'auto';
  const keepResizeAspectRatio = isVideoResult || (isImageResult && !isSmartImageRatio);
  const nodeClassName = [
    'custom-node',
    'result-node',
    isImageResult || isVideoResult || isAudioResult ? 'result-media-node' : '',
    isImageResult ? 'result-image-node' : '',
    isVideoResult ? 'result-video-node' : '',
    isAudioResult ? 'result-audio-node' : '',
    isTextResult ? 'result-text-node' : '',
    isStoryboardScriptResult ? 'result-storyboard-node' : '',
    generating ? 'running' : '',
    data?.generationFailureFlashId ? 'generation-failure-flash' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  // ===== 多图结果（扇形堆叠） =====
  const allImageUrls = (() => {
    const normalizeDisplayUrls = urls => (
      data?.resultType === 'generateImage' ? preferCanvasServerUrls(urls) : urls
    );
    if (Array.isArray(data?.imageUrls) && data.imageUrls.length > 0) {
      return normalizeDisplayUrls(data.imageUrls.filter(Boolean));
    }
    if (data?.imageUrl) return normalizeDisplayUrls([data.imageUrl]);
    return [];
  })();
  const isMultiImage = allImageUrls.length > 1;
  const coverIndex = (typeof data?.coverIndex === 'number' && data.coverIndex >= 0 && data.coverIndex < allImageUrls.length)
    ? data.coverIndex
    : 0;
  const coverImageUrl = allImageUrls[coverIndex] || imageUrl;
  const imageDimensionsByUrl = data?.imageDimensionsByUrl || {};
  const hasMappedImageDimensions = Object.keys(imageDimensionsByUrl).length > 0;
  const imageResolution = normalizeImageDimensions(
    imageDimensionsByUrl[coverImageUrl]
      || (!isMultiImage || !hasMappedImageDimensions
        ? data?.imageDimensions
          || (data?.imageWidth && data?.imageHeight
            ? { width: data.imageWidth, height: data.imageHeight }
            : null)
        : null),
  );
  const imageResolutionLabel = formatImageDimensions(imageResolution);
  const videoResolution = normalizeImageDimensions(
    data?.videoDimensions
      || (data?.videoWidth && data?.videoHeight
        ? { width: data.videoWidth, height: data.videoHeight }
        : null),
  );
  const videoResolutionLabel = formatImageDimensions(videoResolution);
  const mediaResolutionLabel = isImageResult ? imageResolutionLabel : isVideoResult ? videoResolutionLabel : '';
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandedClosing, setIsExpandedClosing] = useState(false);
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [taskNowMs, setTaskNowMs] = useState(() => Date.now());
  const shouldShowTaskTiming = (isImageResult || isVideoResult) && Boolean(generationTask);
  const taskDurationLabel = shouldShowTaskTiming ? getTaskDurationLabel(generationTask, taskNowMs) : '';
  const nodeTaskTimingLabel = taskDurationLabel
    ? `${isTaskActive(generationTask?.status) ? '正在生成 · ' : ''}${taskDurationLabel}`
    : '';
  useEffect(() => {
    if (!shouldShowTaskTiming || !isTaskActive(generationTask?.status)) return undefined;
    setTaskNowMs(Date.now());
    const interval = window.setInterval(() => setTaskNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [generationTask?.created_at, generationTask?.id, generationTask?.status, shouldShowTaskTiming]);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isTextExpandedEditing, setIsTextExpandedEditing] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [videoTrimRequestId, setVideoTrimRequestId] = useState(0);
  const [isVideoTrimming, setIsVideoTrimming] = useState(false);
  const [videoEnhancementOpen, setVideoEnhancementOpen] = useState(false);
  const [videoEnhancementSettings, setVideoEnhancementSettings] = useState(DEFAULT_VIDEO_ENHANCEMENT_SETTINGS);
  const [videoEnhancementPosition, setVideoEnhancementPosition] = useState(null);
  const [videoEnhancementStatus, setVideoEnhancementStatus] = useState('');
  const videoEnhancementPanelRef = useRef(null);
  const videoEnhancementStatusTimerRef = useRef(null);
  const isTextFormatEditing = isTextEditing || isTextExpandedEditing;
  const shouldShowTextFormatToolbar = isTextResult
    && !isMultiSelected
    && !contentLocked
    && !isTitleEditing
    && (
      isTextFormatEditing
      || (selected && !isTextExpanded)
    );
  const [hoveredImageIndex, setHoveredImageIndex] = useState(-1);
  const resultNodeRef = useRef(null);
  const resultVideoRef = useRef(null);
  const activeVideoTrim = useMemo(
    () => normalizeQuickTrimContract(data?.videoQuickTrims?.[videoUrl], videoUrl),
    [data?.videoQuickTrims, videoUrl],
  );
  const handleVideoQuickTrimConfirm = useCallback((contract) => {
    data?.onVideoQuickTrimChange?.(id, contract);
  }, [data, id]);
  const textEditorRef = useRef(null);
  const expandedTextEditorRef = useRef(null);
  const imageStackPointerStartRef = useRef(null);
  const storyboardFramePointerStartRef = useRef(null);
  const imageStackDragCleanupRef = useRef(null);
  const expandedCloseTimerRef = useRef(null);
  const expandedImageToolbarCloseTimerRef = useRef(null);
  const textToolbarCloseTimerRef = useRef(null);
  const uploadInputRef = useRef(null);
  const videoUploadInputRef = useRef(null);
  const audioUploadInputRef = useRef(null);
  const uploadObjectUrlRef = useRef('');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState('');
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');
  const [isTextToolbarOpen, setIsTextToolbarOpen] = useState(false);
  const [textSelection, setTextSelection] = useState({ start: 0, end: 0 });
  const [currentTextFormatState, setCurrentTextFormatState] = useState(DEFAULT_TEXT_FORMAT_STATE);
  const [previewState, setPreviewState] = useState({ imageUrl: '', images: [], index: 0 });
  const [imageContextMenu, setImageContextMenu] = useState(null);
  const imageContextMenuRef = useRef(null);
  const [expandedNodeSize, setExpandedNodeSize] = useState({ width: 0, height: 0 });
  const [expandedViewportSize, setExpandedViewportSize] = useState(getViewportSize);
  const videoEnhancementCredits = useMemo(() => {
    let credits = 12;
    if (videoEnhancementSettings.resolution === '2K') credits += 8;
    if (videoEnhancementSettings.resolution === '4K') credits += 18;
    if (videoEnhancementSettings.fps === '60fps') credits += 6;
    if (videoEnhancementSettings.fps === '90fps') credits += 12;
    if (videoEnhancementSettings.slow === '2x') credits += 8;
    return credits;
  }, [videoEnhancementSettings]);

  useCanvasWheelHandoff(resultNodeRef, {
    enabled: isTextResult,
  });

  useLayoutEffect(() => {
    if (!videoEnhancementOpen || !isVideoResult) {
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      const anchor = resultNodeRef.current?.querySelector?.('.result-video-wrap')
        || resultNodeRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(380, Math.max(300, rect.width + 28));
      const left = Math.max(12 + panelWidth / 2, Math.min(window.innerWidth - 12 - panelWidth / 2, rect.left + rect.width / 2));
      const top = Math.min(window.innerHeight - 16, rect.bottom + 10);
      const nextPosition = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width: Math.round(panelWidth),
      };
      setVideoEnhancementPosition(current => (
        current
        && current.left === nextPosition.left
        && current.top === nextPosition.top
        && current.width === nextPosition.width
          ? current
          : nextPosition
      ));
      frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [isVideoResult, videoEnhancementOpen]);

  useEffect(() => {
    if (!videoEnhancementOpen) return undefined;

    const closeOnOutsidePointer = event => {
      const target = event.target;
      if (videoEnhancementPanelRef.current?.contains(target)) return;
      if (target?.closest?.('.node-hover-toolbar-portal, .node-hover-toolbar-anchor')) return;
      if (resultNodeRef.current?.contains(target)) return;
      setVideoEnhancementOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setVideoEnhancementOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [videoEnhancementOpen]);

  useEffect(() => {
    if (selected && isVideoResult) return undefined;
    const timer = window.setTimeout(() => setVideoEnhancementOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [isVideoResult, selected]);

  useEffect(() => () => {
    window.clearTimeout(videoEnhancementStatusTimerRef.current);
  }, []);

  const expandedAspect = useMemo(() => parseImageAspect(imageSize), [imageSize]);
  const expandedAspectRatio = expandedAspect?.cssValue || '1 / 1';
  const expandedAspectNumber = expandedAspect?.ratio || 1;
  const expandedFallbackCardWidth = expandedAspectNumber >= 1.45
    ? 280
    : expandedAspectNumber <= 0.9
      ? 180
      : 220;
  const expandedLayout = useMemo(() => calculateExpandedImageLayout({
    imageCount: allImageUrls.length,
    aspectRatio: expandedAspectNumber,
    nodeWidth: expandedNodeSize.width,
    fallbackCardWidth: expandedFallbackCardWidth,
    viewportWidth: expandedViewportSize.width,
    viewportHeight: expandedViewportSize.height,
  }), [
    allImageUrls.length,
    expandedAspectNumber,
    expandedFallbackCardWidth,
    expandedNodeSize.width,
    expandedViewportSize.height,
    expandedViewportSize.width,
  ]);
  const expandedCardWidth = expandedLayout.cardWidth;
  const expandedGridClass = expandedLayout.gridClass;

  useLayoutEffect(() => {
    if (!isExpanded) return undefined;
    const measureNode = () => {
      const nextViewportSize = getViewportSize();
      setExpandedViewportSize(current => (
        current.width === nextViewportSize.width && current.height === nextViewportSize.height
          ? current
          : nextViewportSize
      ));
      const rect = resultNodeRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setExpandedNodeSize(current => (
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize
      ));
    };
    measureNode();
    window.addEventListener('resize', measureNode);
    return () => window.removeEventListener('resize', measureNode);
  }, [isExpanded]);

  useEffect(() => {
    if (!isTextEditing || !textEditorRef.current) return undefined;
    const frameId = requestAnimationFrame(() => {
      const editor = textEditorRef.current;
      if (!editor) return;
      focusRichTextEditorEnd(editor);
      setCurrentTextFormatState(getRichTextFormatState(editor));
    });
    return () => cancelAnimationFrame(frameId);
  }, [isTextEditing]);

  useEffect(() => {
    if (!isTextExpandedEditing || !expandedTextEditorRef.current) return undefined;
    const frameId = requestAnimationFrame(() => {
      const editor = expandedTextEditorRef.current;
      if (!editor) return;
      focusRichTextEditorEnd(editor);
      setCurrentTextFormatState(getRichTextFormatState(editor));
    });
    return () => cancelAnimationFrame(frameId);
  }, [isTextExpandedEditing]);

  const enterTextEditing = useCallback((event) => {
    if (!isTextResult || contentLocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(false);
    data?.onTextEditingChange?.(id, true);
    setIsTextEditing(true);
  }, [contentLocked, data, id, isTextResult]);

  const handleTextEditorBlur = useCallback(() => {
    setIsTextEditing(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  const syncTextSelection = useCallback((editor) => {
    if (!editor) return;
    setCurrentTextFormatState(getRichTextFormatState(editor));
  }, []);

  const getActiveTextEditor = useCallback(() => (
    isTextExpandedEditing ? expandedTextEditorRef.current : textEditorRef.current
  ), [isTextExpandedEditing]);

  const commitRichTextEditorValue = useCallback((editor) => {
    if (!editor) return;
    normalizeRichTextEditorDom(editor);
    data?.onResultTextChange?.(id, richTextHtmlToMarkdown(editor));
    setCurrentTextFormatState(getRichTextFormatState(editor));
  }, [data, id]);

  const applyTextEditorFormat = useCallback((action, payload) => {
    const editor = getActiveTextEditor();
    if (!editor) {
      const next = applyTextFormat(result, textSelection.start, textSelection.end, action, payload);
      data?.onResultTextChange?.(id, next.value);
      setTextSelection({ start: next.selectionStart, end: next.selectionEnd });
      return;
    }

    if (!selectionBelongsTo(editor)) focusRichTextEditorEnd(editor);
    editor.focus();
    if (action === 'h1' || action === 'h2' || action === 'h3' || action === 'p') {
      document.execCommand('formatBlock', false, action === 'p' ? 'p' : action);
    } else if (action === 'bold') {
      document.execCommand('bold', false);
    } else if (action === 'italic') {
      document.execCommand('italic', false);
    } else if (action === 'ul') {
      document.execCommand('insertUnorderedList', false);
    } else if (action === 'ol') {
      document.execCommand('insertOrderedList', false);
    } else if (action === 'rule') {
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
    }
    commitRichTextEditorValue(editor);
  }, [commitRichTextEditorValue, data, getActiveTextEditor, id, result, textSelection.end, textSelection.start]);

  const handleTextEditorKeyDown = useCallback((event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'i') return;
    event.preventDefault();
    event.stopPropagation();
    applyTextEditorFormat(key === 'b' ? 'bold' : 'italic');
  }, [applyTextEditorFormat]);

  const openTextExpandedEditor = useCallback((event) => {
    if (!isTextResult) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextEditing(false);
    setIsTextExpanded(true);
    setIsTextExpandedEditing(true);
    data?.onTextEditingChange?.(id, true);
  }, [data, id, isTextResult]);

  const handleTextFormatCommand = useCallback((command) => {
    if (command === 'expand') {
      openTextExpandedEditor();
      return;
    }
    if (command === 'copyPrompt') {
      const copyPrompt = async () => {
        if (!result) return;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(result);
            return;
          }
          const textarea = document.createElement('textarea');
          textarea.value = result;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        } catch {
          // ignore clipboard failures
        }
      };
      copyPrompt();
      return;
    }
  }, [openTextExpandedEditor, result]);

  const openTextExpanded = useCallback((event) => {
    if (!isTextResult) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpanded(true);
  }, [isTextResult]);

  const closeTextExpanded = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpandedEditing(false);
    setIsTextExpanded(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  const enterTextExpandedEditing = useCallback((event) => {
    if (!isTextResult || contentLocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsTextExpandedEditing(true);
    data?.onTextEditingChange?.(id, true);
  }, [contentLocked, data, id, isTextResult]);

  const handleTextExpandedEditorBlur = useCallback(() => {
    setIsTextExpandedEditing(false);
    data?.onTextEditingChange?.(id, false);
  }, [data, id]);

  useEffect(() => {
    if (!isTextExpanded) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeTextExpanded(event);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeTextExpanded, isTextExpanded]);

  const requestCloseExpandedImages = useCallback(() => {
    if (!isExpanded) return;
    window.clearTimeout(expandedCloseTimerRef.current);
    setIsExpandedClosing(true);
    expandedCloseTimerRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      setIsExpandedClosing(false);
      setHoveredImageIndex(-1);
    }, EXPANDED_IMAGE_CLOSE_MS);
  }, [isExpanded]);

  const openExpandedImages = useCallback(() => {
    window.clearTimeout(expandedCloseTimerRef.current);
    setExpandedViewportSize(getViewportSize());
    setIsExpandedClosing(false);
    setIsExpanded(true);
  }, []);

  const openImageContextMenu = useCallback((event, contextImageUrl, imageIndexAt = 0) => {
    if (!contextImageUrl) return;
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('pplai:close-pane-context-menu'));
    const menuWidth = 184;
    const menuHeight = 84;
    const viewportPadding = 8;
    setImageContextMenu({
      imageUrl: contextImageUrl,
      imageIndex: imageIndexAt,
      x: Math.max(viewportPadding, Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)),
      y: Math.max(viewportPadding, Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)),
    });
  }, []);

  const closeImageContextMenu = useCallback(() => {
    setImageContextMenu(null);
  }, []);

  const copyContextMenuImage = useCallback(async () => {
    const contextImageUrl = imageContextMenu?.imageUrl;
    closeImageContextMenu();
    if (!contextImageUrl) return;
    try {
      await copyImageToClipboard(contextImageUrl);
    } catch (error) {
      window.alert(error?.message || '复制图片失败，请重试');
    }
  }, [closeImageContextMenu, imageContextMenu?.imageUrl]);

  const downloadContextMenuImage = useCallback(async () => {
    const contextImageUrl = imageContextMenu?.imageUrl;
    const contextImageIndex = imageContextMenu?.imageIndex || 0;
    closeImageContextMenu();
    if (!contextImageUrl) return;
    const result = await downloadImages([{
      url: contextImageUrl,
      filename: `image-${id}-${contextImageIndex + 1}`,
    }], 'image');
    if (result.downloaded === 0) {
      window.alert('图片下载失败，请重试');
    }
  }, [closeImageContextMenu, id, imageContextMenu]);

  useEffect(() => {
    if (!imageContextMenu) return undefined;
    const handlePointerDown = event => {
      if (imageContextMenuRef.current?.contains(event.target)) return;
      closeImageContextMenu();
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') closeImageContextMenu();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', closeImageContextMenu);
    window.addEventListener('blur', closeImageContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', closeImageContextMenu);
      window.removeEventListener('blur', closeImageContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeImageContextMenu, imageContextMenu]);

  // 失焦自动收起
  useEffect(() => {
    if (!isExpanded) return undefined;
    const handler = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      // 节点本身 + 它的处理器（generator）都不算"外部"
      const insideResult = target.closest(`[data-id="${id}"]`);
      if (insideResult) return;
      // InteractiveHandle 是 fixed 浮层，菜单也是 fixed 浮层 → 都不算外部
      if (target.closest('.node-interactive-handle, .canvas-context-menu, .image-preview-overlay, .image-action-toolbar, .storyboard-script-overlay, .result-image-set-cover-btn, .result-image-expanded-card, .result-image-expanded-close, .result-image-stack-toggle')) return;
      requestCloseExpandedImages();
    };
    // 用 mousedown 抢在 click 之前，但延迟 0ms 让当前点击的冒泡完成
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handler, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handler, true);
    };
  }, [isExpanded, id, requestCloseExpandedImages]);

  useEffect(() => {
    if (!isExpanded) return undefined;

    const handleKeyDown = (event) => {
      if (!shouldCloseExpandedImagesOnKeyDown({
        key: event.key,
        target: event.target,
        previewOpen: Boolean(previewState.imageUrl),
      })) return;

      event.preventDefault();
      requestCloseExpandedImages();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, previewState.imageUrl, requestCloseExpandedImages]);

  useEffect(() => () => {
    window.clearTimeout(expandedCloseTimerRef.current);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(textToolbarCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selected) return;
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(false);
  }, [selected]);

  const handleImageActionEditingChange = useCallback((editing) => {
    data?.onImageActionEditingChange?.(id, editing);
  }, [data, id]);

  const openTextToolbar = useCallback(() => {
    if (isMultiSelected || hasTextContent || isVideoResult || (selected && !isStoryboardScriptResult)) return;
    window.clearTimeout(textToolbarCloseTimerRef.current);
    setIsTextToolbarOpen(true);
  }, [hasTextContent, isMultiSelected, isStoryboardScriptResult, isVideoResult, selected]);

  const scheduleCloseTextToolbar = useCallback(() => {
    window.clearTimeout(textToolbarCloseTimerRef.current);
    textToolbarCloseTimerRef.current = window.setTimeout(() => {
      setIsTextToolbarOpen(false);
    }, RESULT_TOOLBAR_CLOSE_MS);
  }, []);

  const releaseUploadPreview = useCallback(() => {
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = '';
    }
    setUploadPreviewUrl('');
  }, []);

  useEffect(() => () => {
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = '';
    }
  }, []);

  const openUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isImageResult || isUploadingImage || contentLocked) return;
    setUploadError('');
    uploadInputRef.current?.click();
  }, [contentLocked, isImageResult, isUploadingImage]);

  const handleUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedImageFile);
    if (!file) {
      setUploadError(getUnsupportedImageMessage(files.length || 1));
      return;
    }

    releaseUploadPreview();
    const objectUrl = URL.createObjectURL(file);
    uploadObjectUrlRef.current = objectUrl;
    setUploadPreviewUrl(objectUrl);
    setUploadProgress(0);
    setUploadError('');
    setIsUploadingImage(true);

    try {
      const [asset, imageSize] = await Promise.all([
        uploadImageFile(file, setUploadProgress),
        readLocalImageFileSize(file),
      ]);
      if (!asset?.url) throw new Error('图片上传成功但未返回图片地址');
      data?.onResultImageUpload?.(id, asset.url, {
        width: imageSize?.width || asset.width,
        height: imageSize?.height || asset.height,
      });
    } catch (error) {
      setUploadError(error?.message || '图片上传失败，请重试');
    } finally {
      setIsUploadingImage(false);
      releaseUploadPreview();
    }
  }, [contentLocked, data, id, releaseUploadPreview]);

  const openVideoUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isVideoResult || isUploadingVideo || contentLocked) return;
    setVideoUploadError('');
    videoUploadInputRef.current?.click();
  }, [contentLocked, isUploadingVideo, isVideoResult]);

  const handleVideoUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedVideoFile);
    if (!file) {
      setVideoUploadError(getUnsupportedVideoMessage(files.length || 1));
      return;
    }

    setVideoUploadProgress(0);
    setVideoUploadError('');
    setIsUploadingVideo(true);
    try {
      const asset = await uploadVideoFile(file, setVideoUploadProgress);
      if (!asset?.url) throw new Error('视频上传成功但未返回视频地址');
      data?.onResultVideoUpload?.(id, asset.url);
    } catch (error) {
      setVideoUploadError(error?.message || '视频上传失败，请重试');
    } finally {
      setIsUploadingVideo(false);
    }
  }, [contentLocked, data, id]);

  const openAudioUploadPicker = useCallback((event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isAudioResult || isUploadingAudio || contentLocked) return;
    setAudioUploadError('');
    audioUploadInputRef.current?.click();
  }, [contentLocked, isAudioResult, isUploadingAudio]);

  const handleAudioUploadInputChange = useCallback(async (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (contentLocked) return;
    const file = files.find(isSupportedAudioFile);
    if (!file) {
      setAudioUploadError(getUnsupportedAudioMessage());
      return;
    }

    setAudioUploadProgress(0);
    setAudioUploadError('');
    setIsUploadingAudio(true);
    try {
      const asset = await uploadAudioFile(file, setAudioUploadProgress);
      if (!asset?.url) throw new Error('音频上传成功但未返回音频地址');
      data?.onResultAudioUpload?.(id, asset.url);
    } catch (error) {
      setAudioUploadError(error?.message || '音频上传失败，请重试');
    } finally {
      setIsUploadingAudio(false);
    }
  }, [contentLocked, data, id]);

  const displayedImageUrls = useMemo(() => {
    if (!uploadPreviewUrl) return allImageUrls;
    if (allImageUrls.length === 0) return [uploadPreviewUrl];
    return allImageUrls.map((url, index) => (
      index === coverIndex ? uploadPreviewUrl : url
    ));
  }, [allImageUrls, coverIndex, uploadPreviewUrl]);
  const displayedCoverUrl = displayedImageUrls[coverIndex] || uploadPreviewUrl || coverImageUrl;

  // 展开时把节点 zIndex 顶到最高，避免被旁边节点遮住；收起时复位
  useEffect(() => {
    if (onResultExpandStateChange) {
      onResultExpandStateChange(id, isExpanded);
    }
    return () => {
      if (isExpanded && onResultExpandStateChange) {
        onResultExpandStateChange(id, false);
      }
    };
  }, [id, isExpanded, onResultExpandStateChange]);

  // 切换封面
  const handleSetCover = useCallback((index, event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (index < 0 || index >= allImageUrls.length) return;
    if (index === coverIndex) return;
    if (data?.onResultDataChange) {
      data.onResultDataChange(id, {
        coverIndex: index,
        imageUrl: allImageUrls[index],
        manualCoverRunId: data.currentRunId || data.generationTask?.runId || '',
        manualCoverUpdatedAt: Date.now(),
      });
    }
  }, [allImageUrls, coverIndex, data, id]);

  // 拖出图片到画布
  const handleImageDragStart = useCallback((event, imageUrlAt, index) => {
    if (!imageUrlAt) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ai-canvas-material', JSON.stringify({
      type: 'image',
      imageUrl: imageUrlAt,
      name: `生成图 ${index + 1}`,
      id: `result_image_${id}_${index}`,
    }));
  }, [id]);

  // 打开全屏预览（双击图片）
  const openPreview = useCallback((imageUrlAt, event, previewImages = [], previewIndex = 0) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!imageUrlAt) return;
    const images = (previewImages && previewImages.length > 0 ? previewImages : [imageUrlAt]).filter(Boolean);
    const safeIndex = Math.max(0, Math.min(previewIndex, images.length - 1));
    setPreviewState({
      imageUrl: images[safeIndex] || imageUrlAt,
      images,
      index: safeIndex,
    });
  }, []);

  useEffect(() => () => {
    imageStackDragCleanupRef.current?.();
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
    }
  }, []);

  const openExpandedImageToolbar = useCallback((index) => {
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
      expandedImageToolbarCloseTimerRef.current = null;
    }
    setHoveredImageIndex(index);
  }, []);

  const scheduleCloseExpandedImageToolbar = useCallback((index) => {
    if (expandedImageToolbarCloseTimerRef.current) {
      window.clearTimeout(expandedImageToolbarCloseTimerRef.current);
    }
    expandedImageToolbarCloseTimerRef.current = window.setTimeout(() => {
      setHoveredImageIndex(prev => prev === index ? -1 : prev);
      expandedImageToolbarCloseTimerRef.current = null;
    }, IMAGE_TOOLBAR_CLOSE_MS);
  }, []);

  const beginImageStackDrag = useCallback((event) => {
    if (event.button !== 0 || event.target.closest('.result-image-stack-toggle')) return;

    imageStackDragCleanupRef.current?.();

    const pointerStart = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    imageStackPointerStartRef.current = pointerStart;

    let lastX = event.clientX;
    let lastY = event.clientY;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;

      const totalDx = moveEvent.clientX - pointerStart.x;
      const totalDy = moveEvent.clientY - pointerStart.y;
      const moved = Math.sqrt(totalDx * totalDx + totalDy * totalDy) > IMAGE_POINTER_INTENT_THRESHOLD;

      if (!moved) return;

      pointerStart.moved = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      const delta = {
        x: moveEvent.clientX - lastX,
        y: moveEvent.clientY - lastY,
      };

      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      data?.onResultNodeDragByScreenDelta?.(id, delta);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', cleanup, true);
      window.removeEventListener('pointercancel', cleanup, true);
      imageStackDragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', cleanup, true);
    window.addEventListener('pointercancel', cleanup, true);
    imageStackDragCleanupRef.current = cleanup;
  }, [data, id]);

  const didMoveImageStackPointer = useCallback((event) => {
    const start = imageStackPointerStartRef.current;
    imageStackPointerStartRef.current = null;
    if (!start) return false;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    return start.moved || Math.sqrt(dx * dx + dy * dy) > IMAGE_POINTER_INTENT_THRESHOLD;
  }, []);

  const isImagePreviewExcludedTarget = useCallback((target) => (
    target?.closest?.('.image-action-toolbar, .image-action-layer, .result-image-upload-control, .result-image-upload-status, .result-image-upload-error, .canvas-node-resize-handle, .node-interactive-handle, .react-flow__handle')
  ), []);

  // 不同 result 类型的最小尺寸
  const resizeMinWidth = isImageResult || isVideoResult
    ? 160
    : isStoryboardScriptResult
      ? 340
      : 220;
  const resizeMinHeight = isImageResult || isVideoResult
    ? 100
    : isStoryboardScriptResult
      ? 220
      : 140;

  // 将 imageSize (如 '16:9' 或 'auto') 转为 CSS aspect-ratio
  const getAspectStyle = () => {
    return expandedAspect ? { aspectRatio: expandedAspect.cssValue } : {};
  };

  const [expandedCardIndex, setExpandedCardIndex] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState(null);
  const [editForm, setEditForm] = useState({});
  const handleImageLoad = useCallback((event, loadedImageUrl = coverImageUrl) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      data?.onResultImageDimensionsChange?.(id, loadedImageUrl, {
        width: naturalWidth,
        height: naturalHeight,
      });
      data?.onResultMediaAspectChange?.(id, naturalWidth / naturalHeight);
    }
  }, [coverImageUrl, data, id]);

  const handleVideoLoadedMetadata = useCallback((event) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0) {
      data?.onResultVideoDimensionsChange?.(id, videoUrl, {
        width: videoWidth,
        height: videoHeight,
      });
      data?.onResultMediaAspectChange?.(id, videoWidth / videoHeight);
    }
  }, [data, id, videoUrl]);

  const captureVideoFrame = useCallback(async (kind = 'current') => {
    const video = resultVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const originalTime = video.currentTime;
    const targetTime = kind === 'first'
      ? 0
      : kind === 'last'
        ? Math.max(0, (video.duration || 0) - 0.05)
        : originalTime;
    if (Math.abs(targetTime - originalTime) > 0.01) {
      await new Promise((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('视频定位失败')); };
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.currentTime = targetTime;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    data?.onCaptureVideoFrame?.(id, canvas.toDataURL('image/png'), {
      width: canvas.width,
      height: canvas.height,
      kind,
      time: targetTime,
    });
    if (Math.abs(targetTime - originalTime) > 0.01) video.currentTime = originalTime;
  }, [data, id]);

  const requestVideoFullscreen = useCallback(() => {
    const video = resultVideoRef.current;
    const requestFullscreen = video?.requestFullscreen
      || video?.webkitRequestFullscreen
      || video?.webkitEnterFullscreen;
    requestFullscreen?.call(video);
  }, []);

  const updateVideoEnhancementSetting = useCallback((key, value) => {
    setVideoEnhancementSettings(current => ({ ...current, [key]: value }));
  }, []);

  const runVideoEnhancementPrototype = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!isVideoResult || !videoUrl) return;

    // Prototype only: this creates a connected downstream video node for flow
    // feedback, but it never calls the backend, starts a task, or spends credits.
    const result = data?.onCreateVideoEnhancementPrototype?.(id, {
      ...videoEnhancementSettings,
      credits: videoEnhancementCredits,
      videoUrl,
    });
    if (result?.ok) {
      setVideoEnhancementOpen(false);
      return;
    }

    setVideoEnhancementStatus('仅原型展示，暂未接入真实增强');
    window.clearTimeout(videoEnhancementStatusTimerRef.current);
    videoEnhancementStatusTimerRef.current = window.setTimeout(() => {
      setVideoEnhancementStatus('');
    }, 1800);
  }, [data, id, isVideoResult, videoEnhancementCredits, videoEnhancementSettings, videoUrl]);

  const toggleCard = useCallback((index) => {
    setExpandedCardIndex(prev => prev === index ? null : index);
  }, []);

  const openStoryboardFrameGenerator = useCallback((event, cardIndex, card) => {
    if (!isStoryboardScriptResult) return;
    event?.stopPropagation();
    if (data?.onStoryboardCardClickPlaceholder) {
      data.onStoryboardCardClickPlaceholder(id, cardIndex, card);
    }
  }, [data, id, isStoryboardScriptResult]);

  const handleStoryboardFramePointerDown = useCallback((event) => {
    event.stopPropagation();
    storyboardFramePointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const handleStoryboardFramePointerUp = useCallback((event, cardIndex, card) => {
    event.stopPropagation();
    const start = storyboardFramePointerStartRef.current;
    storyboardFramePointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) <= STORYBOARD_FRAME_POINTER_INTENT_THRESHOLD) {
      openStoryboardFrameGenerator(event, cardIndex, card);
    }
  }, [openStoryboardFrameGenerator]);

  const handleStoryboardFramePointerCancel = useCallback((event) => {
    event.stopPropagation();
    storyboardFramePointerStartRef.current = null;
  }, []);

  const renderUploadFeedback = () => {
    if (isUploadingImage) {
      return (
        <div
          className="result-image-upload-status nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span>正在上传 {uploadProgress}%</span>
          <span className="result-image-upload-progress-track">
            <span style={{ width: `${uploadProgress}%` }} />
          </span>
        </div>
      );
    }
    if (!uploadError) return null;
    return (
      <div
        className="result-image-upload-error nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span>{uploadError}</span>
        <button type="button" onClick={openUploadPicker}>重试</button>
      </div>
    );
  };

  // 图片结果区域：单图 / 多图堆叠 / 多图展开
  const renderImageResult = () => {
    const aspectStyle = getAspectStyle();

    // 多图：堆叠 + 展开
    if (isMultiImage) {
      if (isExpanded) {
        return (
          <div
            className={`result-image-expanded nodrag ${expandedGridClass} ${isExpandedClosing ? 'is-closing' : 'is-opening'}`}
            style={{
              '--result-expanded-aspect': expandedAspectRatio,
              '--result-expanded-card-width': `${expandedCardWidth}px`,
              '--result-expanded-max-height': `${expandedLayout.maxHeight}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="result-image-expanded-close nodrag"
              onClick={(e) => {
                e.stopPropagation();
                requestCloseExpandedImages();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="收起"
              aria-label="收起图片"
            >
              ✕
            </button>
            {displayedImageUrls.map((url, index) => {
              const isCover = index === coverIndex;
              const isHover = hoveredImageIndex === index;
              return (
                <div
                  className={`result-image-expanded-card canvas-image-preview-trigger ${isCover ? 'is-cover' : ''}`}
                  key={`expanded_${index}_${url.slice(-12)}`}
                  onContextMenu={(event) => openImageContextMenu(event, url, index)}
                  onMouseEnter={() => openExpandedImageToolbar(index)}
                  onMouseLeave={() => scheduleCloseExpandedImageToolbar(index)}
                  onDoubleClick={(e) => {
                    if (e.target.closest('.image-action-toolbar, .image-action-layer, .result-image-set-cover-btn')) return;
                    openPreview(url, e, allImageUrls, index);
                  }}
                  onDragStart={(e) => handleImageDragStart(e, url, index)}
                  draggable
                >
                  <img
                    src={url}
                    alt={`生成图 ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    onLoad={event => handleImageLoad(event, url)}
                    draggable={false}
                  />
                  <ImageActionOverlay
                    imageUrl={url}
                    imageIndex={index}
                    sourceHandle={`img-${index}`}
                    nodeId={id}
                    sourceType="result"
                    onAction={data?.onImageAction}
                    onUpload={openUploadPicker}
                    onDelete={() => data?.onDeleteNode?.(id)}
                    forceVisible={!isMultiSelected && isHover}
                    onToolbarPointerEnter={() => openExpandedImageToolbar(index)}
                    onToolbarPointerLeave={() => scheduleCloseExpandedImageToolbar(index)}
                    portalToolbar
                    apiConfigs={data?.apiConfigs}
                    apiProviders={data?.apiProviders}
                    rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
                    onEditingChange={handleImageActionEditingChange}
                    enableCropEditor
                    suppressToolbar={isMultiSelected}
                    hasPendingTasks={hasPendingTasks}
                  />{/* multi-card */}
                  {isCover && <span className="result-image-cover-badge">封面</span>}
                  {isHover && (
                    <button
                      type="button"
                      className="result-image-set-cover-btn nodrag"
                      onClick={(e) => handleSetCover(index, e)}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      设为封面
                    </button>
                  )}
                </div>
              );
            })}
            {renderUploadFeedback()}
          </div>
        );
      }
      // 收起：deck 堆叠
      return (
        <div
          className="result-image-stack result-image-toolbar-anchor canvas-image-preview-trigger"
          onContextMenu={(event) => openImageContextMenu(event, coverImageUrl, coverIndex)}
          onDoubleClick={(e) => {
            // 点 toggle 按钮、工具栏就别触发大图
            if (e.target.closest('.result-image-stack-toggle, .image-action-toolbar, .image-action-layer')) return;
            if (didMoveImageStackPointer(e)) return;
            e.stopPropagation();
            openPreview(coverImageUrl, e, allImageUrls, coverIndex);
          }}
          onPointerDown={beginImageStackDrag}
          title="双击查看大图，点击右上角「N张」展开"
        >
          <img
            className="result-image-stack-card is-cover"
            src={displayedCoverUrl}
            alt="生成图封面"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            draggable={false}
          />
          <button
            type="button"
            className="result-image-stack-toggle nodrag"
            onClick={(e) => {
              e.stopPropagation();
              openExpandedImages();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="展开查看全部图片"
          >
            <span>{allImageUrls.length} 张</span>
            <span className="chevron">▾</span>
          </button>
          <ImageActionOverlay
            imageUrl={coverImageUrl}
            imageIndex={coverIndex}
            nodeId={id}
            sourceType="result"
            onAction={data?.onImageAction}
            onUpload={openUploadPicker}
            onDelete={() => data?.onDeleteNode?.(id)}
            forceVisible={!isMultiSelected && selected}
            portalToolbar
            apiConfigs={data?.apiConfigs}
            apiProviders={data?.apiProviders}
            rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
            onEditingChange={handleImageActionEditingChange}
            enableCropEditor
            suppressToolbar={isMultiSelected}
            hasPendingTasks={hasPendingTasks}
          />{/* multi-collapsed */}
          {renderUploadFeedback()}
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }

    // 单图：维持现有样式
    if (displayedCoverUrl) {
      return (
        <div
          className="result-image-wrap result-image-toolbar-anchor canvas-image-preview-trigger"
          style={aspectStyle}
          onContextMenu={(event) => openImageContextMenu(event, coverImageUrl, coverIndex)}
          onDoubleClick={(event) => {
            if (isImagePreviewExcludedTarget(event.target)) return;
            openPreview(coverImageUrl, event, allImageUrls, coverIndex);
          }}
        >
          <img
            src={displayedCoverUrl}
            alt="生成图片结果"
            title="双击预览大图，拖动移动节点"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            draggable={false}
          />
          <ImageActionOverlay
            imageUrl={coverImageUrl}
            imageIndex={coverIndex}
            nodeId={id}
            sourceType="result"
            onAction={data?.onImageAction}
            onUpload={openUploadPicker}
            onDelete={() => data?.onDeleteNode?.(id)}
            forceVisible={!isMultiSelected && selected}
            portalToolbar
            apiConfigs={data?.apiConfigs}
            apiProviders={data?.apiProviders}
            rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
            onEditingChange={handleImageActionEditingChange}
            enableCropEditor
            suppressToolbar={isMultiSelected}
            hasPendingTasks={hasPendingTasks}
          />{/* single-image */}
          {renderUploadFeedback()}
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }
    if (generating || smartSplitStatus) {
      return (
        <div className="result-skeleton shimmer" style={aspectStyle}>
          {smartSplitStatus && (
            <div className="result-image-status-bar">
              <span className="result-image-status-text">{smartSplitStatus}</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="result-skeleton result-image-empty result-image-toolbar-anchor"
        style={aspectStyle}
      >
        <ImageIcon />
        <span>点击节点打开生成器，或从上方工具栏上传图片</span>
        <ImageActionOverlay
          imageUrl=""
          nodeId={id}
          sourceType="result"
          onUpload={openUploadPicker}
          onDelete={() => data?.onDeleteNode?.(id)}
          forceVisible={!isMultiSelected && selected}
          portalToolbar
          apiConfigs={data?.apiConfigs}
          apiProviders={data?.apiProviders}
          rotationAutoOpenToken={data?.imageRotationAutoOpenToken}
          onEditingChange={handleImageActionEditingChange}
          suppressToolbar={isMultiSelected}
          hasPendingTasks={hasPendingTasks}
        />
        {renderUploadFeedback()}
      </div>
    );
  };

  const renderVideoResult = () => {
    if (videoUrl) {
      return (
        <div className="result-video-wrap">
          <video ref={resultVideoRef} src={videoUrl} controls onLoadedMetadata={handleVideoLoadedMetadata} />
          <VideoFrameCaptureControls
            sourceNodeId={id}
            sourceVideoUrl={videoUrl}
            getVideoElement={() => resultVideoRef.current}
            initialTrim={activeVideoTrim}
            onTrimConfirm={handleVideoQuickTrimConfirm}
            trimRequestId={videoTrimRequestId}
            onTrimOpenChange={setIsVideoTrimming}
            hideActions
            variant="result-video"
          />
          {isUploadingVideo && <span className="result-video-upload-status">正在上传 {videoUploadProgress}%</span>}
          {videoUploadError && <span className="result-video-upload-error">{videoUploadError}</span>}
        </div>
      );
    }

    return (
      <div className={`result-video-placeholder ${generating ? 'shimmer' : ''}`}>
        <span>{isUploadingVideo ? `正在上传 ${videoUploadProgress}%` : '点击节点打开生成器，或从工具栏上传视频'}</span>
        {videoUploadError && <span className="result-video-upload-error">{videoUploadError}</span>}
      </div>
    );
  };

  const renderAudioResult = () => {
    if (audioUrl) {
      return (
        <div className="result-audio-wrap">
          <div className="result-audio-card">
            <Icon name="audioGenFill" size={24} />
            <div>
              <strong>{data?.audioName || '音频'}</strong>
              <span>{data?.audioSource === 'upload' ? '上传音频素材' : '生成音频'}</span>
            </div>
          </div>
          <audio
            className="result-audio-player nodrag"
            src={audioUrl}
            controls
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
          {isUploadingAudio && <span className="result-video-upload-status">正在上传 {audioUploadProgress}%</span>}
          {audioUploadError && <span className="result-video-upload-error">{audioUploadError}</span>}
        </div>
      );
    }

    return (
      <div className={`result-audio-placeholder ${generating ? 'shimmer' : ''}`}>
        <Icon name="audioGenFill" size={30} />
        <span>{isUploadingAudio ? `正在上传 ${audioUploadProgress}%` : '点击节点打开生成器，或从工具栏上传音频'}</span>
        {audioUploadError && <span className="result-video-upload-error">{audioUploadError}</span>}
      </div>
    );
  };

  const renderScriptResult = () => {
    if (generating) {
      return (
        <div className="result-skeleton shimmer">
          <span className="skeleton-icon"><Icon name={isStoryboardScriptResult ? 'storyboardWorkbench' : 'barChartBoxAi'} size={32} /></span>
        </div>
      );
    }

    if (storyboardCards.length > 0) {
      return (
        <div className="storyboard-list">
          {(storyboardResourcePackage || storyboardVoiceoverScript) && (
            <details className="storyboard-resource-package nodrag">
              <summary>
                <span>资源包</span>
                <strong>{storyboardCards.length} 镜 · Seedance 4-15s</strong>
              </summary>
              <div className="storyboard-resource-grid">
                {storyboardResourcePackage?.productIdentity && (
                  <div><span>商品</span><p>{storyboardResourcePackage.productIdentity}</p></div>
                )}
                {storyboardResourcePackage?.sceneLock && (
                  <div><span>场景</span><p>{storyboardResourcePackage.sceneLock}</p></div>
                )}
                {storyboardResourcePackage?.characterLock && (
                  <div><span>人物</span><p>{storyboardResourcePackage.characterLock}</p></div>
                )}
                {storyboardResourcePackage?.visualStyle && (
                  <div><span>风格</span><p>{storyboardResourcePackage.visualStyle}</p></div>
                )}
                {storyboardResourcePackage?.seedanceGlobalPrompt && (
                  <div className="wide"><span>Seedance 全局</span><p>{storyboardResourcePackage.seedanceGlobalPrompt}</p></div>
                )}
                {Array.isArray(storyboardResourcePackage?.negativeConstraints) && storyboardResourcePackage.negativeConstraints.length > 0 && (
                  <div className="wide"><span>负面约束</span><p>{storyboardResourcePackage.negativeConstraints.join('，')}</p></div>
                )}
                {storyboardVoiceoverScript && (
                  <div className="wide"><span>整条口播</span><p>{storyboardVoiceoverScript}</p></div>
                )}
              </div>
            </details>
          )}
          {storyboardCards.map((card, index) => {
            const isExpanded = expandedCardIndex === index;
            const isFrameGenerating = ['running', 'saving'].includes(card.imageGenerationTask?.status);
            return (
              <div
                className={`storyboard-card ${isExpanded ? 'storyboard-card-expanded' : ''}`}
                key={`storyboard_${index}`}
                onClick={() => isStoryboardScriptResult && toggleCard(index)}
                style={{ cursor: isStoryboardScriptResult ? 'pointer' : 'default' }}
              >
                {isStoryboardScriptResult && (
                  <InteractiveHandle
                    side="right"
                    nodeId={id}
                    onDragCreate={data?.onInteractiveDragCreate}
                    extra={{ kind: 'storyboardCard', cardIndex: index }}
                  />
                )}
                <div
                  className={`storyboard-card-visual nodrag ${card.imageUrl ? 'has-image' : 'placeholder-clickable'} ${isFrameGenerating ? 'is-generating' : ''}`}
                  onPointerDown={handleStoryboardFramePointerDown}
                  onPointerUp={(e) => handleStoryboardFramePointerUp(e, index, card)}
                  onPointerCancel={handleStoryboardFramePointerCancel}
                  onClick={(e) => e.stopPropagation()}
                  title={isFrameGenerating ? '本帧图片生成中' : '点击生成本帧图片'}
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.shotNo || `分镜 ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', borderRadius: '4px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="storyboard-card-placeholder">
                      <Icon name="imageGen" size={22} />
                      <span>{isFrameGenerating ? '本帧生成中...' : card.imagePositivePrompt ? '点击生成本帧' : '绘图提示词生成中...'}</span>
                    </div>
                  )}
                  {isFrameGenerating && (
                    <div className="storyboard-frame-loading" aria-label="本帧图片生成中">
                      <span className="storyboard-frame-loading-spinner" />
                      <strong>生成中</strong>
                    </div>
                  )}
                </div>
                <div className="storyboard-card-main">
                  <div className="storyboard-card-body">
                    <div className="storyboard-card-title">
                      <span>{card.shotNo || String(index + 1).padStart(2, '0')}</span>
                      <strong>{card.cameraMovement || `分镜 ${index + 1}`}</strong>
                    </div>
                    {card.duration && (
                      <div className="storyboard-card-time">
                        <span>时间</span>
                        <p>{card.duration}</p>
                      </div>
                    )}
                  {card.visualDescription && (
                    <div className="storyboard-field">
                      <span>画面</span>
                      <p>{card.visualDescription}</p>
                    </div>
                  )}
                    {card.narration && (
                    <div className="storyboard-field">
                      <span>旁白</span>
                      <p>{card.narration}</p>
                    </div>
                  )}
                    {isExpanded && card.seedancePrompt && (
                      <div className="storyboard-field">
                        <span>Seedance</span>
                        <p>{card.seedancePrompt}</p>
                      </div>
                    )}
                    {isExpanded && card.continuityNotes && (
                      <div className="storyboard-field">
                        <span>连续性</span>
                        <p>{card.continuityNotes}</p>
                      </div>
                    )}
                    {isExpanded && Array.isArray(card.qualityChecklist) && card.qualityChecklist.length > 0 && (
                      <div className="storyboard-card-meta">
                        {card.qualityChecklist.map(item => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isStoryboardScriptResult && (
                  <button
                    type="button"
                    className="storyboard-card-edit-btn nodrag"
                    aria-label="编辑分镜卡片"
                    title="编辑"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCardIndex(index);
                      setEditForm({
                        duration: card.duration || '',
                        cameraMovement: card.cameraMovement || '',
                        visualDescription: card.visualDescription || '',
                        narration: card.narration || '',
                      });
                    }}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="storyboard-list" style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--fg-tertiary)',
        fontSize: 'var(--fs-xs)',
      }}>
        等待生成...
      </div>
    );
  };

  return (
    <div
      ref={resultNodeRef}
      className={nodeClassName}
      onMouseEnter={() => { setIsHovering(true); if (!hasTextContent) openTextToolbar(); }}
      onMouseLeave={() => { setIsHovering(false); scheduleCloseTextToolbar(); }}
    >
      {isTextResult && (
        <TextFormatToolbarPortal
          open={shouldShowTextFormatToolbar}
          anchorRef={isTextExpandedEditing ? expandedTextEditorRef : textEditorRef}
          fallbackAnchorRef={resultNodeRef}
          value={result}
          selection={textSelection}
          formatState={currentTextFormatState}
          expanded={isTextExpandedEditing}
          onApply={applyTextEditorFormat}
          onCommand={handleTextFormatCommand}
        />
      )}
      {isResizableResult && (
        <NodeResizer
          isVisible={!isMultiSelected && (selected || (!isComposerOpen && isHovering))}
          minWidth={resizeMinWidth}
          minHeight={resizeMinHeight}
          keepAspectRatio={keepResizeAspectRatio}
          handleClassName="canvas-node-resize-handle"
          lineClassName="canvas-node-resize-line"
          onResize={(_, params) => {
            if (!data?.onNodeResize) return;
            data.onNodeResize(id, { width: params.width, height: params.height });
          }}
          onResizeEnd={(_, params) => {
            if (!data?.onNodeResize) return;
            data.onNodeResize(id, { width: params.width, height: params.height });
          }}
        />
      )}
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      {isImageResult && (
        <input
          ref={uploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          onChange={handleUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isVideoResult && (
        <input
          ref={videoUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_VIDEO_ACCEPT}
          onChange={handleVideoUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {isAudioResult && (
        <input
          ref={audioUploadInputRef}
          className="result-image-upload-input"
          type="file"
          accept={SUPPORTED_AUDIO_ACCEPT}
          onChange={handleAudioUploadInputChange}
          onClick={(event) => event.stopPropagation()}
        />
      )}

      <div className="node-header">
        <div className="result-node-title-row">
          <EditableNodeTitle
            icon={<Icon name={titleIcon} size={16} />}
            value={displayLabel}
            fallback={isStoryboardScriptResult ? '分镜工作台' : '结果'}
            onChange={(nextLabel) => data?.onResultDataChange?.(id, { label: nextLabel })}
            onEditingChange={setIsTitleEditing}
          />
          {(isImageResult || isVideoResult) && mediaResolutionLabel && (
            <span className="result-image-dimensions">{mediaResolutionLabel}</span>
          )}
        </div>
        {isStoryboardScriptResult && (
          <button
            type="button"
            className="storyboard-workbench-open-btn nodrag"
            title="打开视频工作台"
            aria-label="打开视频工作台"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data?.onOpenVideoWorkbench?.(id);
            }}
          >
            ↗
          </button>
        )}
        {nodeTaskTimingLabel && (
          <span className="result-task-timing">{nodeTaskTimingLabel}</span>
        )}
      </div>

      <div className="node-body">
        {isTextResult && !generating && !isTextEditing && (
          <button
            type="button"
            className="result-text-expand-btn nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openTextExpanded}
            aria-label="放大文本节点"
            title="放大"
          >
            <Icon name="expandDiagonal" size={13} />
          </button>
        )}
        {isAudioResult ? (
          renderAudioResult()
        ) : isVideoResult ? (
          renderVideoResult()
        ) : (isScriptResult || isStoryboardResult || isStoryboardScriptResult) ? (
          renderScriptResult()
        ) : isImageResult ? (
          renderImageResult()
        ) : generating ? (
          <div className="result-skeleton result-text-skeleton shimmer" aria-label="正在生成文本">
            <span className="text-skeleton-line text-skeleton-line-wide" />
            <span className="text-skeleton-line" />
            <span className="text-skeleton-line text-skeleton-line-short" />
            <span className="text-skeleton-line text-skeleton-line-medium" />
          </div>
        ) : isTextResult && isTextEditing ? (
          <RichTextEditor
            editorRef={textEditorRef}
            className="node-output result-text-output result-text-editor rich-text-editor nodrag nopan nowheel"
            value={result}
            placeholder="输入文本内容..."
            onInput={(event) => commitRichTextEditorValue(event.currentTarget)}
            onSelectionChange={syncTextSelection}
            onKeyDown={handleTextEditorKeyDown}
            onBlur={handleTextEditorBlur}
          />
        ) : isTextResult && result ? (
          <div
            className="node-output result-text-output result-text-display result-node-toolbar-anchor nowheel"
            onDoubleClick={enterTextEditing}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              enterTextEditing(event);
            }}
            aria-label="文本内容，双击编辑"
          >
            <FormattedTextContent value={result} />
          </div>
        ) : isTextResult ? (
          <div
            className="result-empty result-text-edit-prompt result-node-toolbar-anchor"
            role="button"
            tabIndex={0}
            onDoubleClick={enterTextEditing}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              enterTextEditing(event);
            }}
          >
            <strong>双击输入文本</strong>
            <span>也可以打开生成器生成内容</span>
          </div>
        ) : (
          <div className="result-empty">
            等待生成...
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <NodeHoverToolbar
        hidden={isMultiSelected || isTextResult || isImageResult || isVideoTrimming || (isVideoResult && !selected) || (selected && !isStoryboardScriptResult && !isVideoResult) || isTitleEditing || isTextEditing || isTextExpanded}
        portal
        forceVisible={!isMultiSelected && !isTextExpanded && (isVideoResult ? selected : (isTextToolbarOpen || (isEmptyVideoResult && selected)))}
        variant={isVideoResult ? 'video' : ''}
        onToolbarPointerEnter={openTextToolbar}
        onToolbarPointerLeave={scheduleCloseTextToolbar}
        actions={[
          ...(isTextResult ? [{
            id: 'edit-text',
            label: '编辑提示词',
            title: '编辑提示词',
            icon: 'edit',
            onClick: enterTextEditing,
          }] : []),
          ...(isVideoResult ? (videoUrl ? [
            {
              id: 'edit-video',
              label: '剪辑',
              title: '剪辑视频',
              icon: 'edit',
              onClick: () => setVideoTrimRequestId(current => current + 1),
            },
            {
              id: 'enhance-video',
              label: '增强',
              title: '视频增强',
              icon: 'aed',
              active: videoEnhancementOpen,
              onClick: (event) => {
                event.stopPropagation();
                setVideoEnhancementOpen(current => !current);
              },
            },
            {
              id: 'capture-video-frame',
              label: '截取画面帧',
              title: '截取画面帧',
              icon: 'scissors',
              menuItems: [
                { id: 'current', label: '截取当前帧', onClick: () => { void captureVideoFrame('current'); } },
                { id: 'first', label: '截取首帧', onClick: () => { void captureVideoFrame('first'); } },
                { id: 'last', label: '截取尾帧', onClick: () => { void captureVideoFrame('last'); } },
              ],
            },
            {
              id: 'download-video',
              label: '下载视频',
              title: '下载视频',
              icon: 'download',
              compact: true,
              separatorBefore: true,
              onClick: () => data?.onDownloadVideo?.(id),
            },
            {
              id: 'favorite-video',
              label: '收藏',
              title: '收藏视频',
              icon: 'folder',
              compact: true,
              onClick: () => data?.onImageAction?.('favorite', {
                imageUrl: videoUrl,
                nodeId: id,
                sourceType: 'video',
                mediaType: 'video',
              }),
            },
            {
              id: 'fullscreen-video',
              label: '全屏播放',
              title: '全屏播放',
              icon: 'fullscreen',
              compact: true,
              onClick: requestVideoFullscreen,
            },
          ] : [{
            id: 'upload-video',
            label: '上传视频',
            title: '上传视频',
            icon: 'upload',
            onClick: openVideoUploadPicker,
          }]) : []),
          ...(isAudioResult ? [{
            id: 'upload-audio',
            label: audioUrl ? '替换音频' : '上传音频',
            title: audioUrl ? '替换音频' : '上传音频',
            icon: 'upload',
            onClick: openAudioUploadPicker,
          }] : []),
          ...(canBatchGenerateStoryboardCovers ? [{
            id: 'batch-storyboard-covers',
            label: '批量生成封面',
            title: storyboardBatchCoverTargets.length > 0
              ? `批量生成 ${storyboardBatchCoverTargets.length} 张分镜封面`
              : '批量生成分镜封面',
            icon: 'imageGen',
            onClick: () => data?.onStoryboardCoverBatchGenerate?.(id),
          }] : []),
        ]}
        onDelete={!isVideoResult ? () => data?.onDeleteNode?.(id) : undefined}
      />
      {isVideoResult && videoEnhancementOpen && videoEnhancementPosition && typeof document !== 'undefined' && createPortal(
        <section
          ref={videoEnhancementPanelRef}
          className="video-enhancement-prototype-panel nodrag nopan"
          style={{
            left: videoEnhancementPosition.left,
            top: videoEnhancementPosition.top,
            width: videoEnhancementPosition.width,
          }}
          role="dialog"
          aria-label="视频增强"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="video-enhancement-prototype-header">
            <strong>视频增强</strong>
            <button
              type="button"
              className="video-enhancement-prototype-close"
              onClick={() => setVideoEnhancementOpen(false)}
              aria-label="关闭视频增强"
              title="关闭"
            >
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="video-enhancement-prototype-body">
            {[
              { key: 'resolution', label: '视频高清分辨率', options: VIDEO_ENHANCEMENT_RESOLUTION_OPTIONS },
              { key: 'fps', label: '视频帧数（可选）', options: VIDEO_ENHANCEMENT_FPS_OPTIONS },
              { key: 'slow', label: '视频放慢倍率（可选）', options: VIDEO_ENHANCEMENT_SLOW_OPTIONS },
            ].map(group => (
              <div className="video-enhancement-prototype-field" key={group.key}>
                <span>{group.label}</span>
                <div className="video-enhancement-prototype-options" role="radiogroup" aria-label={group.label}>
                  {group.options.map(option => (
                    <button
                      key={option}
                      type="button"
                      className={videoEnhancementSettings[group.key] === option ? 'active' : ''}
                      role="radio"
                      aria-checked={videoEnhancementSettings[group.key] === option}
                      onClick={() => updateVideoEnhancementSetting(group.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <footer className="video-enhancement-prototype-footer">
            <span className="video-enhancement-prototype-status" role="status">{videoEnhancementStatus}</span>
            <div className="video-enhancement-prototype-action-pill" aria-label={`需要消耗 ${videoEnhancementCredits} 积分`}>
              <span className="video-enhancement-prototype-credit-icon" aria-hidden="true">
                <Icon name="aed" size={18} />
              </span>
              <strong>{videoEnhancementCredits}</strong>
            </div>
            <button
              type="button"
              className="video-enhancement-prototype-generate"
              onClick={runVideoEnhancementPrototype}
              aria-label="生成视频增强原型"
              title="生成"
            >
              <Icon name="arrowUp" size={20} />
            </button>
          </footer>
        </section>,
        document.body,
      )}
      {/* 多图展开时：单图 handle 仍然可用，但用户也可以从每张图右侧的小 dot 拖出（指向特定图） */}
      {isImageResult && isMultiImage && allImageUrls.map((url, index) => (
        <Handle
          key={`handle_img_${index}`}
          id={`img-${index}`}
          type="source"
          position={Position.Right}
          style={{
            top: `${20 + index * 24}%`,
            background: index === coverIndex ? 'var(--accent)' : 'var(--success-alt)',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      ))}
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      {isTextResult && isTextExpanded && createPortal(
        <div className="canvas-processor-expanded-backdrop result-text-expanded-overlay nodrag nopan" onClick={closeTextExpanded}>
          <section
            className="canvas-processor-expanded-dialog result-text-expanded-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="文本节点内容"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="canvas-processor-expanded-header result-text-expanded-header">
              <button
                type="button"
                className="canvas-processor-expanded-close result-text-collapse-btn"
                onClick={closeTextExpanded}
                aria-label="缩小文本节点"
                title="缩小"
              >
                <Icon name="collapseDiagonal" size={16} />
              </button>
            </header>
            <div className="canvas-processor-expanded-body result-text-expanded-body">
              {isTextExpandedEditing ? (
                <RichTextEditor
                  editorRef={expandedTextEditorRef}
                  className="result-text-expanded-content result-text-expanded-editor rich-text-editor nodrag nopan nowheel"
                  value={result}
                  placeholder="输入文本内容..."
                  onInput={(event) => commitRichTextEditorValue(event.currentTarget)}
                  onSelectionChange={syncTextSelection}
                  onKeyDown={handleTextEditorKeyDown}
                  onBlur={handleTextExpandedEditorBlur}
                />
              ) : (
                <div
                  className="result-text-expanded-content nowheel"
                  onDoubleClick={enterTextExpandedEditing}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    enterTextExpandedEditing(event);
                  }}
                  aria-label="文本内容，双击编辑"
                >
                  <FormattedTextContent value={result} />
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}

      <ImagePreviewOverlay
        imageUrl={previewState.imageUrl}
        images={previewState.images}
        initialIndex={previewState.index}
        historyImages={data?.previewHistoryImages || []}
        alt="生成图片大图预览"
        nodeId={id}
        sourceType="result"
        apiConfigs={data?.apiConfigs}
        apiProviders={data?.apiProviders}
        onAction={data?.onImageAction}
        onClose={() => setPreviewState({ imageUrl: '', images: [], index: 0 })}
      />

      {imageContextMenu && createPortal(
        <div
          ref={imageContextMenuRef}
          className="context-menu pane-context-menu result-node-context-menu nodrag nopan"
          role="menu"
          aria-label="图片操作"
          style={{
            position: 'fixed',
            left: imageContextMenu.x,
            top: imageContextMenu.y,
            zIndex: 10001,
          }}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div className="context-menu-item" role="menuitem" tabIndex={0} onClick={copyContextMenuImage}>
            <span className="menu-icon"><Icon name="copy" size={16} /></span>
            <span className="menu-label">复制图片</span>
          </div>
          <div className="context-menu-item" role="menuitem" tabIndex={0} onClick={downloadContextMenuImage}>
            <span className="menu-icon"><Icon name="download" size={16} /></span>
            <span className="menu-label">下载原图</span>
          </div>
        </div>,
        document.body,
      )}

      {editingCardIndex != null && createPortal(
        <div className="storyboard-edit-overlay" onClick={() => setEditingCardIndex(null)}>
          <div className="storyboard-edit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="storyboard-edit-header">
              <h3>编辑分镜 {storyboardCards[editingCardIndex]?.shotNo || String(editingCardIndex + 1).padStart(2, '0')}</h3>
              <button type="button" className="storyboard-edit-close" onClick={() => setEditingCardIndex(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="storyboard-edit-body">
              <label className="storyboard-edit-field">
                <span>时长</span>
                <input
                  type="text"
                  value={editForm.duration || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="如 5s"
                />
              </label>
              <label className="storyboard-edit-field">
                <span>运镜效果</span>
                <input
                  type="text"
                  value={editForm.cameraMovement || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, cameraMovement: e.target.value }))}
                  placeholder="如：推、拉、摇、移、跟..."
                />
              </label>
              <label className="storyboard-edit-field">
                <span>画面描述</span>
                <textarea
                  value={editForm.visualDescription || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, visualDescription: e.target.value }))}
                  placeholder="描述画面内容、构图、光线..."
                  rows={4}
                />
              </label>
              <label className="storyboard-edit-field">
                <span>旁白</span>
                <textarea
                  value={editForm.narration || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, narration: e.target.value }))}
                  placeholder="旁白/口播文案..."
                  rows={3}
                />
              </label>
            </div>
            <div className="storyboard-edit-footer">
              <button type="button" className="storyboard-edit-cancel" onClick={() => setEditingCardIndex(null)}>取消</button>
              <button type="button" className="storyboard-edit-save" onClick={() => {
                data?.onResultCardUpdate?.(id, editingCardIndex, editForm);
                setEditingCardIndex(null);
              }}>保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default memo(ResultNode);
