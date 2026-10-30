import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { emojiToken, parseEmojiToken, type GuildEmoji } from '@huddle/shared';
import { EMOJI_CATEGORIES, findCustomEmoji, getRecentEmoji, pushRecentEmoji, searchCustomEmoji, searchEmoji, type EmojiEntry } from '../../lib/emoji';
import { useGuildStore } from '../../stores/guilds';
import { GuildIcon } from '../common/Avatar';
import { IconClock, IconSearch } from '../common/icons';
import { CustomEmojiImg } from './CustomEmoji';

/** One pickable cell: unicode emoji or a custom emoji (value = its <:name:id> token). */
interface Pick { value: string; name: string; glyph: ReactNode }

const unicodePick = (e: EmojiEntry): Pick => ({ value: e.e, name: e.n, glyph: e.e });
const customPick = (e: GuildEmoji): Pick => ({ value: emojiToken(e), name: e.name, glyph: <CustomEmojiImg emoji={e} /> });

/**
 * onPick receives either a unicode emoji or a custom emoji token (<:name:id>). With `guildId`, that
 * server's custom emoji are listed first and included in search results.
 */
export function EmojiPicker({ anchor, onPick, close, closeOnPick, placement = 'auto', guildId = null }: {
  anchor: Element | null; onPick: (emoji: string) => void; close: () => void; closeOnPick?: boolean; placement?: 'auto' | 'above';
  guildId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<Pick | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const serverEmoji = useGuildStore((s) => (guildId ? s.emojis[guildId] : undefined)) ?? [];
  // recent custom emoji only show while they still exist (and only those usable here)
  const recent = useMemo(() => getRecentEmoji().flatMap((v): Pick[] => {
    const tok = parseEmojiToken(v);
    if (!tok) return [{ value: v, name: '', glyph: v }];
    const e = findCustomEmoji(tok.id);
    return e && e.guild_id === guildId ? [customPick(e)] : [];
  }), [guildId]);
  const results = useMemo<Pick[]>(() => (q ? [
    ...searchCustomEmoji(guildId, q, 40).map(customPick),
    ...searchEmoji(q, 120).map(unicodePick),
  ] : []), [q, guildId, serverEmoji]); // eslint-disable-line react-hooks/exhaustive-deps

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
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0].value, e.shiftKey); } }} />
        <IconSearch size={16} />
      </div>
      <div className="ep-body">
        {!q && (
          <div className="ep-nav">
            {guild && serverEmoji.length > 0 && <button title={guild.name} className="ep-nav-guild" onClick={() => scrollTo('server')}><GuildIcon guild={guild} size={24} /></button>}
            {recent.length > 0 && <button title="Frequently Used" onClick={() => scrollTo('recent')}><IconClock size={18} /></button>}
            {EMOJI_CATEGORIES.map((c) => <button key={c.id} title={c.label} onClick={() => scrollTo(c.id)}>{c.icon}</button>)}
          </div>
        )}
        <div className="ep-grid scroll-thin" ref={gridRef}>
          {q ? (
            results.length ? (
              <div className="ep-cells">{results.map((e) => <Cell key={e.value + e.name} e={e} onPick={pick} onHover={setHover} />)}</div>
            ) : <div className="ep-empty">No emoji match “{q}”</div>
          ) : (
            <>
              {guild && serverEmoji.length > 0 && (
                <section data-cat="server">
                  <h4>{guild.name}</h4>
                  <div className="ep-cells">{serverEmoji.map((e) => <Cell key={e.id} e={customPick(e)} onPick={pick} onHover={setHover} />)}</div>
                </section>
              )}
              {recent.length > 0 && (
                <section data-cat="recent">
                  <h4>Frequently Used</h4>
                  <div className="ep-cells">{recent.map((e) => <Cell key={e.value} e={e} onPick={pick} onHover={setHover} />)}</div>
                </section>
              )}
              {EMOJI_CATEGORIES.map((c) => (
                <section key={c.id} data-cat={c.id}>
                  <h4>{c.label}</h4>
                  <div className="ep-cells">{c.emoji.map((e) => <Cell key={e.e + e.n} e={unicodePick(e)} onPick={pick} onHover={setHover} />)}</div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="ep-footer">
        {hover ? <><span className="ep-footer-emoji">{hover.glyph}</span><span>:{hover.name || 'emoji'}:</span></> : <span className="muted">Shift-click to pick several</span>}
      </div>
    </div>,
    document.body,
  );
}

function Cell({ e, onPick, onHover }: { e: Pick; onPick: (e: string, keepOpen?: boolean) => void; onHover: (e: Pick) => void }) {
  return (
    <button className="ep-cell" onClick={(ev) => onPick(e.value, ev.shiftKey)} onMouseEnter={() => onHover(e)} aria-label={e.name || e.value}>{e.glyph}</button>
  );
}
