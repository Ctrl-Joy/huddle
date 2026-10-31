// Composer pop-overs for stickers (server + built-in pack) and GIF search (GIPHY, via the server proxy).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  BUILTIN_STICKER_CATEGORIES, BUILTIN_STICKERS, POPULAR_STICKER_IDS, findBuiltinSticker,
  type GifResult, type GuildSticker, type StickerItem,
} from '@huddle/shared';
import { useGuildStore } from '../../stores/guilds';
import { useStickerStore } from '../../stores/stickers';
import { ApiError, errorMessage } from '../../api/client';
import { matchSticker, searchGifs } from '../../lib/stickers';
import { GuildIcon } from '../common/Avatar';
import { IconSearch } from '../common/icons';
import { StickerImage, stickerSrc, useReducedMotion } from './Sticker';
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
export const IconSticker = ({ size = 20, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M15 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6l8-8V7a4 4 0 0 0-4-4h-2z" /><path d="M13 21v-4a4 4 0 0 1 4-4h4" /><path d="M8.5 10h.01M14.5 10h.01M9 14.5q3 2 6 0" />
  </svg>
);
export const IconGif = ({ size = 20, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="2" y="5" width="20" height="14" rx="3" /><path d="M9.5 10H7.8a1.3 1.3 0 0 0-1.3 1.3v1.4A1.3 1.3 0 0 0 7.8 14h1.7v-2H8.5M12.5 10v4M15.5 14v-4h2.5M15.5 12h2" />
  </svg>
);

/** Places a portal pop-over above/below its anchor and closes it on outside click / Escape. */
function usePopover(ref: RefObject<HTMLDivElement | null>, anchor: Element | null, close: () => void) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const r = anchor?.getBoundingClientRect() ?? { left: window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
    let left = r.right - w;
    let top = r.top - h - 8;
    if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - h - 8);
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setPos({ left, top });
  }, [anchor, ref]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [anchor, close, ref]);
  return { left: pos?.left ?? -9999, top: pos?.top ?? -9999 };
}

interface Entry { s: StickerItem; desc: string | null; tags: string }
const builtinEntry = (s: (typeof BUILTIN_STICKERS)[number]): Entry => ({ s, desc: s.description, tags: s.tags });
const guildEntry = (s: GuildSticker): Entry => ({ s, desc: s.description, tags: s.tags });
const NO_STICKERS: GuildSticker[] = [];

/** Sticker picker: Popular row, this server's stickers, then the built-in pack by category. Click sends. */
export function StickerPicker({ anchor, guildId, onPick, close }: {
  anchor: Element | null; guildId: string | null; onPick: (s: StickerItem) => void; close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const style = usePopover(ref, anchor, close);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<Entry | null>(null);
  const still = useReducedMotion();
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const serverStickers = useStickerStore((s) => (guildId ? s.byGuild[guildId] : undefined)) ?? NO_STICKERS;

  const sections = useMemo(() => {
    const out: { id: string; title: string; items: Entry[] }[] = [];
    if (!q) out.push({ id: 'popular', title: 'Popular', items: POPULAR_STICKER_IDS.flatMap((id) => { const b = findBuiltinSticker(id); return b ? [builtinEntry(b)] : []; }) });
    const server = serverStickers.map(guildEntry).filter((e) => matchSticker({ name: e.s.name, tags: e.tags, description: e.desc }, q));
    if (guild && server.length) out.push({ id: 'server', title: guild.name, items: server });
    for (const c of BUILTIN_STICKER_CATEGORIES) {
      const items = BUILTIN_STICKERS.filter((s) => s.category === c.id && matchSticker(s, q)).map(builtinEntry);
      if (items.length) out.push({ id: c.id, title: c.name, items });
    }
    return out;
  }, [q, serverStickers, guild]);

  const pick = (s: StickerItem) => { onPick(s); close(); };
  const scrollTo = (id: string) => {
    const el = gridRef.current?.querySelector(`[data-sec="${id}"]`) as HTMLElement | null;
    if (el && gridRef.current) gridRef.current.scrollTop = el.offsetTop - 4;
  };

  return createPortal(
    <div ref={ref} className="media-picker sticker-picker" style={style} role="dialog" aria-label="Sticker picker">
      <div className="ep-search">
        <input autoFocus placeholder="Find a sticker" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { const first = sections.find((x) => x.id !== 'popular')?.items[0]; if (e.key === 'Enter' && q && first) { e.preventDefault(); pick(first.s); } }} />
        <IconSearch size={16} />
      </div>
      <div className="ep-body">
        {!q && (
          <div className="ep-nav sp-nav">
            {sections.map((sec) => (
              <button key={sec.id} title={sec.title} onClick={() => scrollTo(sec.id)}>
                {sec.id === 'server' && guild ? <GuildIcon guild={guild} size={24} /> : <img src={stickerSrc(sec.items[0].s, true)} alt="" />}
              </button>
            ))}
          </div>
        )}
        <div className="ep-grid scroll-thin" ref={gridRef}>
          {sections.length === 0 || sections.every((s) => !s.items.length)
            ? <div className="ep-empty">No stickers match “{q}”</div>
            : sections.map((sec) => (
              <section key={sec.id} data-sec={sec.id}>
                <h4>{sec.title}</h4>
                <div className="sp-cells">
                  {sec.items.map((e) => (
                    <button key={sec.id + e.s.id} className="sp-cell" aria-label={`Send sticker: ${e.s.name}`}
                      onClick={() => pick(e.s)} onMouseEnter={() => setHover(e)} onFocus={() => setHover(e)}>
                      <img src={stickerSrc(e.s, still)} alt="" loading="lazy" draggable={false} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
      <div className="ep-footer">
        {hover ? <><StickerImage sticker={hover.s} size={28} className="sp-footer-img" /><span className="truncate"><strong>{hover.s.name}</strong>{hover.desc ? ` · ${hover.desc}` : ''}</span></>
          : <span className="muted">Click a sticker to send it</span>}
      </div>
    </div>,
    document.body,
  );
}

/** GIF search: trending until you type; picking sends the GIF's URL. */
export function GifPicker({ anchor, onPick, close }: { anchor: Element | null; onPick: (g: GifResult) => void; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const style = usePopover(ref, anchor, close);
  const still = useReducedMotion();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifResult[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // debounce typing so a word costs one upstream call, not one per keystroke
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const load = (offset: number, signal?: AbortSignal) => {
    setLoading(true); setError('');
    searchGifs(query, offset, signal)
      .then((r) => { setItems((cur) => (offset ? [...cur, ...r.results] : r.results)); setNext(r.next); })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof ApiError && e.status === 429
          ? 'Whoa, that was a lot of GIFs. Give it a few seconds and try again.'
          : e instanceof ApiError && e.status >= 500 ? 'GIFs are taking a short break. Try again in a moment.' : errorMessage(e));
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const ac = new AbortController();
    setItems([]); setNext(null);
    load(0, ac.signal);
    return () => ac.abort();
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div ref={ref} className="media-picker gif-picker" style={style} role="dialog" aria-label="GIF picker">
      <div className="ep-search">
        <input autoFocus placeholder="Search GIFs" value={q} onChange={(e) => setQ(e.target.value)} maxLength={50} />
        <IconSearch size={16} />
      </div>
      <div className="gif-attribution">{query ? `Results for “${query}”` : 'Trending'} <span>Powered by GIPHY</span></div>
      <div className="gif-grid scroll-thin">
        {error && <div className="ep-empty">{error}</div>}
        {!error && !loading && !items.length && <div className="ep-empty">No GIFs found{query ? ` for “${query}”` : ''}.</div>}
        <div className="gif-cols">
          {items.map((g) => (
            <button key={g.id} className="gif-cell" title={g.title} aria-label={`Send GIF: ${g.title || 'GIF'}`} onClick={() => { onPick(g); close(); }}
              style={g.width && g.height ? { aspectRatio: `${g.width} / ${g.height}` } : undefined}>
              <img src={still ? g.preview.replace(/\.(gif|webp)$/i, '_s.gif') : g.preview} alt={g.title} loading="lazy" referrerPolicy="no-referrer" draggable={false} />
            </button>
          ))}
        </div>
        {loading && <div className="ep-empty">Loading…</div>}
        {!loading && !error && next !== null && <button className="btn btn-ghost btn-small gif-more" onClick={() => load(next)}>Load more</button>}
      </div>
    </div>,
    document.body,
  );
}
