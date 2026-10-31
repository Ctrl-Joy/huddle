import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LANGS, useLang, useT, type Lang } from './index';
import './langpicker.css';

const Globe = () => (
  <svg className="lp-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
  </svg>
);
const Chevron = () => (
  <svg className="lp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
);
const Check = () => (
  <svg className="lp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);

/**
 * Language dropdown (button + listbox). `glass` blends into the website footer; `app` matches the in-app settings.
 * Keyboard: Enter/Space/ArrowDown/ArrowUp open; arrows, Home, End and type-ahead move; Enter/Space pick; Escape/Tab close.
 */
export function LangPicker({ variant = 'glass', labelledBy, id }: { variant?: 'glass' | 'app'; labelledBy?: string; id?: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const selectedIndex = Math.max(0, LANGS.findIndex((l) => l.code === lang));

  const openList = (at = selectedIndex) => { setActive(at); setOpen(true); };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) btnRef.current?.focus();
  };
  const choose = (code: Lang) => { setLang(code); close(); };

  // Fixed to the viewport so clipping containers can't cut it off; opens upward when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current!.getBoundingClientRect();
    const panel = Math.min(260, LANGS.length * 48 + 16) + 8;
    const below = window.innerHeight - r.bottom;
    const goUp = below < panel && r.top > below;
    setUp(goUp);
    setPos(goUp
      ? { position: 'fixed', left: r.left, width: r.width, bottom: window.innerHeight - r.top + 8, top: 'auto', maxHeight: Math.min(260, r.top - 16) }
      : { position: 'fixed', left: r.left, width: r.width, top: r.bottom + 8, bottom: 'auto', maxHeight: Math.min(260, below - 16) });
    listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // scrolling or resizing moves the button away from a fixed panel: just close
  useEffect(() => {
    if (!open) return;
    const onMove = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open]);

  // keep the active option in view
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // click / tap outside closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const typeAhead = (ch: string) => {
    const nowMs = Date.now();
    const buf = nowMs - typed.current.at < 700 ? typed.current.text + ch : ch;
    typed.current = { text: buf, at: nowMs };
    const q = buf.toLowerCase();
    const i = LANGS.findIndex((l) => l.name.toLowerCase().startsWith(q) || l.code.toLowerCase().startsWith(q));
    if (i >= 0) setActive(i);
  };

  const onButtonKey = (e: ReactKeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList(e.key === 'ArrowUp' ? Math.max(0, selectedIndex - 1) : e.key === 'ArrowDown' ? Math.min(LANGS.length - 1, selectedIndex + 1) : selectedIndex);
    }
  };

  const onListKey = (e: ReactKeyboardEvent) => {
    const last = LANGS.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter': case ' ': e.preventDefault(); choose(LANGS[active].code); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break; // don't also close a surrounding dialog
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  };

  return (
    <div className={`lp lp-${variant}`} ref={rootRef} data-open={open ? 'true' : 'false'} data-up={up ? 'true' : 'false'}>
      <button
        ref={btnRef} id={id} type="button" className="lp-btn"
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-labelledby={labelledBy ? `${labelledBy} ${id ?? ''}`.trim() : undefined}
        onClick={() => (open ? close() : openList())} onKeyDown={onButtonKey}
      >
        <Globe />
        <span className="lp-current" lang={current.html}>{current.name}</span>
        <Chevron />
      </button>
      <ul
        ref={listRef} id={listId} className="lp-list" role="listbox" tabIndex={-1} hidden={!open} style={pos}
        aria-label={t('lang.choose')} aria-activedescendant={open ? `${listId}-${active}` : undefined} onKeyDown={onListKey}
      >
        {LANGS.map((l, i) => (
          <li
            key={l.code} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={l.code === lang} lang={l.html}
            className={'lp-opt' + (i === active ? ' active' : '')}
            onPointerMove={() => setActive(i)} onClick={() => choose(l.code)}
          >
            <span>{l.name}</span>
            {l.code === lang && <Check />}
          </li>
        ))}
      </ul>
    </div>
  );
}
