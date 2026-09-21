import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'search' },
  { id: 'image', label: 'Image', icon: 'imageGenFill' },
  { id: 'video', label: 'Video', icon: 'videoGenFill' },
  { id: 'text', label: 'Text', icon: 'inputMethodFill' },
  { id: 'audio', label: 'Audio', icon: 'audioGenFill' },
  { id: 'world', label: 'World', icon: 'grid' },
  { id: 'group', label: 'Group', icon: 'apps' },
];

const SEARCHABLE_NODES = [
  { type: 'generateImage', label: 'Image', category: 'image', icon: 'imageGenFill', keywords: ['image', '图片', '生成图片'] },
  { type: 'generateVideo', label: 'Video', category: 'video', icon: 'videoGenFill', keywords: ['video', '视频', '生成视频'] },
  { type: 'generateText', label: 'Text', category: 'text', icon: 'inputMethodFill', keywords: ['text', '文本', '文字'] },
  { type: 'generateAudio', label: 'Audio', category: 'audio', icon: 'audioGenFill', keywords: ['audio', '音频', '声音'] },
  { type: 'character', label: 'Character', category: 'world', icon: 'user', keywords: ['character', '角色', '人物'] },
  { type: 'threeD', label: '3D Viewfinder', category: 'world', icon: 'grid', keywords: ['3d', 'world', 'viewfinder', '三维', '世界'] },
  { type: 'smartSplitter', label: 'Quick Split', category: 'image', icon: 'smartSplitter', keywords: ['quick split', 'split', '拆分器', '智能拆分'] },
  { type: 'generateStoryboardScript', label: 'Storyboard', category: 'text', icon: 'storyboardWorkbench', keywords: ['storyboard', '分镜', '脚本'] },
  { type: 'videoEditor', label: 'Video editor', category: 'video', icon: 'movieAi', keywords: ['video editor', '编辑器', '剪辑'] },
  { type: 'playlist', label: 'Playlist', category: 'group', icon: 'apps', keywords: ['playlist', '播放列表', '片段'] },
];

export default function NodeSearchDialog({ open, onClose, onSelectNode }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setCategory('all');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return SEARCHABLE_NODES.filter(node => {
      const matchesCategory = category === 'all' || node.category === category;
      const matchesQuery = !normalizedQuery || [node.label, ...node.keywords]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="node-search-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="node-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Node search"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="node-search-input-row">
          <Icon name="search" size={26} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search nodes..."
            aria-label="Search nodes"
          />
          <button type="button" className="node-search-close" aria-label="Close node search" onClick={onClose}>
            <Icon name="x" size={22} />
          </button>
        </div>
        <div className="node-search-categories" role="tablist" aria-label="Node categories">
          {CATEGORIES.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={`node-search-category ${category === item.id ? 'active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="node-search-results">
          {results.length > 0 ? results.map(node => (
            <button
              key={node.type}
              type="button"
              className="node-search-result"
              onClick={() => onSelectNode?.(node.type)}
            >
              <span className="node-search-result-icon"><Icon name={node.icon} size={20} /></span>
              <span className="node-search-result-copy">
                <strong>{node.label}</strong>
                <small>{node.category}</small>
              </span>
            </button>
          )) : (
            <div className="node-search-empty">No searchable nodes</div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
