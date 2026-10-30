import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useUIStore, type MenuItem } from '../../stores/ui';
import { IconCheck, IconChevronRight } from '../common/icons';

export function ContextMenu() {
  const menu = useUIStore((s) => s.contextMenu);
  const close = useUIStore((s) => s.closeContextMenu);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.ctx-menu')) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const onScroll = (e: Event) => { if (!(e.target as Element).closest?.('.ctx-menu')) close(); };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, close]);
  if (!menu) return null;
  return <MenuList key={`${menu.x},${menu.y},${menu.tag}`} items={menu.items} x={menu.x} y={menu.y} width={menu.width} onDone={close} />;
}

function MenuList({ items, x, y, width, onDone, sub }: { items: MenuItem[]; x: number; y: number; width?: number; onDone: () => void; sub?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, visible: false });
  const [openSub, setOpenSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [focus, setFocus] = useState(-1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > window.innerWidth - 8) left = sub ? x - r.width - (width ?? 0) : window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left: Math.max(8, left), top, visible: true });
  }, [x, y, sub, width]);

  const actionable = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.separator && !it.disabled);
  const onKeyDown = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = actionable.findIndex((a) => a.i === focus);
      const next = e.key === 'ArrowDown' ? (idx + 1) % actionable.length : (idx - 1 + actionable.length) % actionable.length;
      setFocus(actionable[next]?.i ?? -1);
    } else if (e.key === 'Enter' && focus >= 0) {
      e.preventDefault();
      const it = items[focus];
      if (it.onClick) { onDone(); it.onClick(); }
    }
  };
  useEffect(() => { if (!sub) ref.current?.focus(); }, [sub]);

  return (
    <div
      ref={ref}
      className={'ctx-menu' + (sub ? ' ctx-sub' : '')}
      style={{ left: pos.left, top: pos.top, visibility: pos.visible ? 'visible' : 'hidden', minWidth: width && !sub ? Math.max(width, 188) : undefined }}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) {
          // avoid leading/trailing/double separators
          if (i === 0 || i === items.length - 1 || items[i - 1]?.separator) return null;
          return <div key={i} className="ctx-sep" role="separator" />;
        }
        const color = it.color === 'accent' ? 'var(--accent)' : undefined;
        return (
          <button
            key={i}
            role="menuitem"
            className={'ctx-item' + (it.danger ? ' danger' : '') + (focus === i ? ' focused' : '') + (color ? ' accent' : '')}
            disabled={it.disabled}
            onMouseEnter={(e) => { setFocus(i); setOpenSub(it.submenu ? { index: i, rect: e.currentTarget.getBoundingClientRect() } : null); }}
            onClick={(e) => {
              if (it.submenu) { setOpenSub({ index: i, rect: e.currentTarget.getBoundingClientRect() }); return; }
              if (it.checked !== undefined && !it.onClick) return;
              onDone();
              it.onClick?.();
            }}
          >
            {it.icon && <span className="ctx-icon">{it.icon}</span>}
            {it.color && it.color !== 'accent' && <span className="ctx-color" style={{ background: it.color }} />}
            <span className="ctx-label">
              <span>{it.label}</span>
              {it.hint && it.hint !== 'ID' && <small>{it.hint}</small>}
            </span>
            {it.hint === 'ID' && <span className="ctx-id">ID</span>}
            {it.checked !== undefined && <span className={'ctx-check' + (it.checked ? ' on' : '')}>{it.checked && <IconCheck size={12} strokeWidth={3} />}</span>}
            {it.submenu && <IconChevronRight size={14} />}
          </button>
        );
      })}
      {openSub && items[openSub.index]?.submenu && (
        <MenuList
          items={items[openSub.index].submenu!}
          x={openSub.rect.right + 4}
          y={openSub.rect.top - 6}
          width={openSub.rect.width + 8}
          onDone={onDone}
          sub
        />
      )}
    </div>
  );
}
