import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';
import { NodeTagColorMenuItems, NodeTagPickerButtonContent, getNodeTagPickerTitle } from '../components/NodeTagPicker';
import { useCanvasWheelHandoff } from '../canvasWheelHandoff';

function NodeHoverToolbar({ actions = [], tagColors, onTagToggle, tagInsertAfterId = '', tagPlacement = 'end', tagLabel = '标记', hidden = false, portal = false, forceVisible = false, variant = '', onToolbarPointerEnter, onToolbarPointerLeave }) {
  const layerRef = useRef(null);
  const toolbarRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [openMenuId, setOpenMenuId] = useState('');
  const tagItem = typeof onTagToggle === 'function' ? {
    id: 'node-tags',
    label: tagLabel,
    title: getNodeTagPickerTitle(tagColors),
    icon: 'tag',
    compact: true,
    nodeTagPicker: true,
    menuLabel: '节点标记颜色',
  } : null;
  const items = tagItem
    ? tagPlacement === 'start'
      ? [tagItem, ...actions]
      : tagInsertAfterId
      ? actions.reduce((nextItems, action) => {
        nextItems.push(action);
        if (tagInsertAfterId && action.id === tagInsertAfterId) {
          nextItems.push(tagItem);
        }
        return nextItems;
      }, [])
      : [...actions, tagItem]
    : actions;
  if (tagItem && tagInsertAfterId && !items.some(item => item.id === tagItem.id)) {
    items.push(tagItem);
  }

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && toolbarRef.current?.contains(event.target)) return;
      setOpenMenuId('');
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [openMenuId]);

  // Portal 模式：跟踪节点位置，渲染到 document.body
  useLayoutEffect(() => {
    if (!portal || hidden || !forceVisible) {
      return;
    }
    let frameId;
    const track = () => {
      const anchor = layerRef.current?.closest?.('.custom-node') || layerRef.current?.closest?.('.canvas-group-node');
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        const nextPos = {
          left: Math.round((r.left + r.width / 2) * 10) / 10,
          top: Math.round(Math.max(8, r.top - 64) * 10) / 10,
        };
        setPos(current => (
          current
          && current.left === nextPos.left
          && current.top === nextPos.top
            ? current
            : nextPos
        ));
      }
      frameId = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frameId);
  }, [forceVisible, hidden, portal]);

  useCanvasWheelHandoff(toolbarRef, {
    enabled: !hidden && items.length > 0 && (!portal || Boolean(pos)),
  });

  if (items.length === 0 || hidden) return null;

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`${portal ? 'node-hover-toolbar-portal' : 'node-hover-toolbar'}${variant ? ` is-${variant}` : ''} nodrag nopan`}
      style={portal && pos ? { left: pos.left, top: pos.top, opacity: forceVisible ? 1 : 0, visibility: forceVisible ? 'visible' : 'hidden', pointerEvents: forceVisible ? 'auto' : 'none' } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onPointerEnter={onToolbarPointerEnter}
      onPointerLeave={onToolbarPointerLeave}
    >
      {items.map(item => {
        const menuOpen = openMenuId === item.id;
        const active = menuOpen || Boolean(item.active);
        const hasMenu = item.nodeTagPicker || (Array.isArray(item.menuItems) && item.menuItems.length > 0);
        const iconOnly = Boolean(item.compact || item.iconOnly || variant === 'video');
        return (
          <div
            key={item.id}
            className={`node-hover-toolbar-item${hasMenu ? ' has-menu' : ''}${item.compact ? ' is-compact-item' : ''}`}
          >
            <button
              type="button"
              className={`node-hover-toolbar-btn ${item.tone || ''}${iconOnly ? ' is-compact' : ''}${item.separatorBefore ? ' has-separator' : ''}${active ? ' is-active' : ''}`.trim()}
              title={iconOnly ? undefined : (item.title || item.label)}
              data-tooltip={iconOnly ? (item.title || item.label) : undefined}
              aria-label={item.title || item.label}
              aria-haspopup={hasMenu ? 'menu' : undefined}
              aria-expanded={hasMenu ? menuOpen : undefined}
              aria-pressed={!hasMenu && item.active ? true : undefined}
              disabled={Boolean(item.disabled)}
              onClick={(event) => {
                if (hasMenu) {
                  event.stopPropagation();
                  setOpenMenuId(current => current === item.id ? '' : item.id);
                  return;
                }
                item.onClick?.(event);
              }}
            >
              {item.id === 'node-tags' ? (
                <NodeTagPickerButtonContent
                  tagColors={tagColors}
                  label={item.label}
                  iconSize={14}
                  labelClassName="node-hover-toolbar-label"
                  dotsClassName="node-hover-toolbar-tag-dots"
                />
              ) : (
                <>
                  {item.iconSrc
                    ? <img className="node-hover-toolbar-icon" src={item.iconSrc} alt="" aria-hidden="true" />
                    : <Icon name={item.icon} size={14} />}
                  <span className="node-hover-toolbar-label">{item.label}</span>
                </>
              )}
              {iconOnly ? <span className="node-hover-toolbar-tooltip" role="tooltip" aria-hidden="true">{item.title || item.label}</span> : null}
            </button>
            {menuOpen && (
              <div className={`node-hover-toolbar-menu ${item.menuClassName || ''}`.trim()} role="menu" aria-label={item.menuLabel || item.label}>
                {item.nodeTagPicker ? (
                  <NodeTagColorMenuItems
                    tagColors={tagColors}
                    onToggle={onTagToggle}
                    onAfterToggle={() => setOpenMenuId('')}
                  />
                ) : item.menuItems.map(menuItem => (
                  <button
                    key={menuItem.id}
                    type="button"
                    role="menuitem"
                    className={menuItem.active ? 'is-active' : ''}
                    title={menuItem.title || menuItem.label}
                    disabled={Boolean(menuItem.disabled)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId('');
                      menuItem.onClick?.(event);
                    }}
                  >
                    {menuItem.color ? (
                      <span className="node-hover-toolbar-menu-color" style={{ '--node-tag-color': menuItem.color }}>
                        {menuItem.active ? <Icon name="check" size={13} /> : null}
                      </span>
                    ) : menuItem.icon ? <Icon name={menuItem.icon} size={15} /> : null}
                    <span>{menuItem.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={layerRef} className="node-hover-toolbar-anchor">
      {!portal ? toolbar : null}
      {portal && pos && typeof document !== 'undefined'
        ? createPortal(toolbar, document.body)
        : null}
    </div>
  );
}

export default NodeHoverToolbar;
