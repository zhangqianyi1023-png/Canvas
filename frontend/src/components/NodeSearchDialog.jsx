import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'search' },
  { id: 'text', label: 'Text', icon: 'inputMethodFill' },
  { id: 'image', label: 'Image', icon: 'imageGenFill' },
  { id: 'video', label: 'Video', icon: 'videoGenFill' },
  { id: 'audio', label: 'Audio', icon: 'audioGenFill' },
  { id: 'world', label: '3D', icon: 'grid' },
  { id: 'group', label: 'Group', icon: 'apps' },
];

const SEARCHABLE_NODES = [
  { type: 'generateImage', label: 'Image', category: 'image', icon: 'imageGenFill', description: 'Setting up scenes, characters, and shots', keywords: ['image', '图片', '生成图片'] },
  { type: 'generateVideo', label: 'Video', category: 'video', icon: 'videoGenFill', description: 'Create motion from prompts and references', keywords: ['video', '视频', '生成视频'] },
  { type: 'generateText', label: 'Text', category: 'text', icon: 'inputMethodFill', description: 'Write and structure creative direction', keywords: ['text', '文本', '文字'] },
  { type: 'generateAudio', label: 'Audio', category: 'audio', icon: 'audioGenFill', description: 'Create sound, voice, and music', keywords: ['audio', '音频', '声音'] },
  { type: 'character', label: 'Character', category: 'world', icon: 'user', description: 'Build a consistent character reference', keywords: ['character', '角色', '人物'] },
  { type: 'threeD', label: '3D Viewfinder', category: 'world', icon: 'grid', description: 'Explore space, depth, and camera angles', keywords: ['3d', 'world', 'viewfinder', '三维', '世界'] },
  { type: 'smartSplitter', label: 'Quick Split', category: 'image', icon: 'smartSplitter', description: 'Break one image into useful directions', keywords: ['quick split', 'split', '拆分器', '智能拆分'] },
  { type: 'generateStoryboardScript', label: 'Storyboard', category: 'text', icon: 'storyboardWorkbench', description: 'Turn an idea into scenes and shots', keywords: ['storyboard', '分镜', '脚本'] },
  { type: 'videoEditor', label: 'Video editor', category: 'video', icon: 'movieAi', description: 'Arrange and refine a sequence', keywords: ['video editor', '编辑器', '剪辑'] },
  { type: 'playlist', label: 'Playlist', category: 'group', icon: 'apps', description: 'Collect clips into a playable sequence', keywords: ['playlist', '播放列表', '片段'] },
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
        <div className="node-search-results" role="listbox" aria-label="Search results">
          {results.length > 0 ? results.map(node => (
            <button
              key={node.type}
              type="button"
              className={`node-search-result ${node.type === 'generateImage' && !query.trim() && category === 'all' ? 'featured' : ''}`}
              onClick={() => onSelectNode?.(node.type)}
            >
              <span className="node-search-result-icon"><Icon name={node.icon} size={20} /></span>
              <span className="node-search-result-copy">
                <strong>{node.label}</strong>
                <small>{node.description}</small>
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
