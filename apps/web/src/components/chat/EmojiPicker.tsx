import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_CATEGORIES, getRecentEmoji, pushRecentEmoji, searchEmoji, type EmojiEntry } from '../../lib/emoji';
import { IconClock, IconSearch } from '../common/icons';

export function EmojiPicker({ anchor, onPick, close, closeOnPick, placement = 'auto' }: {
  anchor: Element | null; onPick: (emoji: string) => void; close: () => void; closeOnPick?: boolean; placement?: 'auto' | 'above';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<EmojiEntry | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const recent = useMemo(() => getRecentEmoji(), []);
  const results = useMemo(() => (q ? searchEmoji(q, 120) : []), [q]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const r = anchor?.getBoundingClientRect() ?? { left: window.innerWidth / 2 - w / 2, right: window.innerWidth / 2 + w / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
    let left = r.right - w;
    let top = placement === 'above' ? r.top - h - 8 : r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setPos({ left, top });
  }, [anchor, placement]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [anchor, close]);

  const pick = (e: string, keepOpen = false) => {
    pushRecentEmoji(e);
    onPick(e);
    if (closeOnPick && !keepOpen) close();
  };

  const scrollTo = (id: string) => {
    const el = gridRef.current?.querySelector(`[data-cat="${id}"]`) as HTMLElement | null;
    if (el && gridRef.current) gridRef.current.scrollTop = el.offsetTop - 4;
  };

  return createPortal(
    <div ref={ref} className="emoji-picker" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} role="dialog" aria-label="Emoji picker">
      <div className="ep-search">
        <input autoFocus placeholder="Find the perfect emoji" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0].e, e.shiftKey); } }} />
        <IconSearch size={16} />
      </div>
      <div className="ep-body">
        {!q && (
          <div className="ep-nav">
            {recent.length > 0 && <button title="Frequently Used" onClick={() => scrollTo('recent')}><IconClock size={18} /></button>}
            {EMOJI_CATEGORIES.map((c) => <button key={c.id} title={c.label} onClick={() => scrollTo(c.id)}>{c.icon}</button>)}
          </div>
        )}
        <div className="ep-grid scroll-thin" ref={gridRef}>
          {q ? (
            results.length ? (
              <div className="ep-cells">{results.map((e) => <Cell key={e.e + e.n} e={e} onPick={pick} onHover={setHover} />)}</div>
            ) : <div className="ep-empty">No emoji match “{q}”</div>
          ) : (
            <>
              {recent.length > 0 && (
                <section data-cat="recent">
                  <h4>Frequently Used</h4>
                  <div className="ep-cells">{recent.map((e) => <Cell key={e} e={{ e, n: '', k: '' }} onPick={pick} onHover={setHover} />)}</div>
                </section>
              )}
              {EMOJI_CATEGORIES.map((c) => (
                <section key={c.id} data-cat={c.id}>
                  <h4>{c.label}</h4>
                  <div className="ep-cells">{c.emoji.map((e) => <Cell key={e.e + e.n} e={e} onPick={pick} onHover={setHover} />)}</div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="ep-footer">
        {hover ? <><span className="ep-footer-emoji">{hover.e}</span><span>:{hover.n || 'emoji'}:</span></> : <span className="muted">Shift-click to pick several</span>}
      </div>
    </div>,
    document.body,
  );
}

function Cell({ e, onPick, onHover }: { e: EmojiEntry; onPick: (e: string, keepOpen?: boolean) => void; onHover: (e: EmojiEntry) => void }) {
  return (
    <button className="ep-cell" onClick={(ev) => onPick(e.e, ev.shiftKey)} onMouseEnter={() => onHover(e)} aria-label={e.n || e.e}>{e.e}</button>
  );
}
