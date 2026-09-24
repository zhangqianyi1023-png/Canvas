import Icon from './Icon';

const SHORTCUT_GROUPS = [
  {
    title: 'Basic',
    items: [
      ['undo', 'Undo', ['⌘', 'Z']],
      ['redo', 'Redo', ['⌘', '⇧', 'Z']],
      ['move', 'Pan', ['Space']],
      ['copy', 'Copy', ['⌘', 'C']],
      ['paste', 'Paste', ['⌘', 'V']],
      ['select', 'Select All', ['⌘', 'A']],
      ['add', 'Add node', ['Tab', 'or', 'Double-click']],
      ['start', 'Start Generation', ['Enter']],
      ['comment', 'Comment mode', ['C']],
    ],
  },
  {
    title: 'Zoom',
    items: [
      ['zoomIn', 'Zoom in', ['⌘', '+']],
      ['zoomOut', 'Zoom out', ['⌘', '−']],
    ],
  },
  {
    title: 'Timeline',
    items: [
      ['cut', 'Cut', ['S']],
      ['leftCut', 'Left cut', ['Q']],
      ['rightCut', 'Right cut', ['E']],
    ],
  },
  {
    title: 'Agent',
    items: [
      ['agent', 'Agent', ['⌘', 'J']],
    ],
  },
];

const ICONS = {
  undo: 'undo', redo: 'redo', move: 'focus', copy: 'copy', paste: 'fileText', select: 'focus', add: 'add', start: 'arrowUp',
  comment: 'comment', zoomIn: 'zoomIn', zoomOut: 'zoomOut', cut: 'split', leftCut: 'split', rightCut: 'split', agent: 'messageAi3',
};

function ShortcutKeys({ keys }) {
  return (
    <span className="shortcut-keys">
      {keys.map((key, index) => key === 'or' ? <span key={`${key}-${index}`} className="shortcut-or">or</span> : <kbd key={`${key}-${index}`}>{key}</kbd>)}
    </span>
  );
}

export default function KeyboardShortcutsDialog({ open, onClose }) {
  if (!open) return null;
  return (
    <section className="keyboard-shortcuts-dialog" role="dialog" aria-labelledby="keyboard-shortcuts-title">
      <header className="keyboard-shortcuts-header">
        <h2 id="keyboard-shortcuts-title">Keyboard Shortcuts</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭快捷键"><Icon name="x" size={18} /></button>
      </header>
      <div className="keyboard-shortcuts-grid">
        {SHORTCUT_GROUPS.map(group => (
          <section key={group.title} className={`keyboard-shortcuts-group keyboard-shortcuts-${group.title.toLowerCase()}`}>
            <h3>{group.title}</h3>
            <div className="keyboard-shortcuts-list">
              {group.items.map(([id, label, keys]) => (
                <div className="keyboard-shortcut-row" key={id}>
                  <span className="keyboard-shortcut-label"><Icon name={ICONS[id]} size={16} /><span>{label}</span></span>
                  <ShortcutKeys keys={keys} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
