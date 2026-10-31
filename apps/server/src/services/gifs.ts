// GIF search proxy (GIPHY REST API: /v1/gifs/search and /v1/gifs/trending). The key stays on the server:
// clients call /api/gifs/* and get back only the fields they need. Results are cached (beta keys are tightly
// rate-limited upstream); the route also rate-limits per user. Without a key (HUDDLE_GIF_API_KEY unset) the
// feature is off and /api/config reports gifs: false.
import type { Embed, GifResult, GifSearchResponse } from '@huddle/shared';

/** Swappable in tests (no network): GETs a URL and returns the status + parsed JSON body. */
export type GifFetch = (url: string) => Promise<{ status: number; json: unknown }>;

export class GifUnavailable extends Error {}

const API = 'https://api.giphy.com/v1/gifs';
const PAGE = 24;
const MAX_OFFSET = 499;
const CACHE_MS = { trending: 5 * 60_000, search: 90_000 };
export const GIF_PROVIDER = 'GIPHY';
/** Media hosts that get an inline GIF embed. */
export const GIF_MEDIA_HOST_RE = /^(media|i)\.giphy\.com$/i;
/** The API hands out media0-4 shard hosts; they are rewritten to media.giphy.com. */
const API_MEDIA_HOST_RE = /^media\d?\.giphy\.com$/i;

const defaultFetch: GifFetch = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  return { status: r.status, json: r.ok ? await r.json() : null };
};

/** https URL on media.giphy.com / i.giphy.com (shards normalised, query string dropped), or null. */
function mediaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (API_MEDIA_HOST_RE.test(u.hostname)) return 'https://media.giphy.com' + u.pathname;
    if (!GIF_MEDIA_HOST_RE.test(u.hostname)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

function toResult(d: any): GifResult | null {
  const img = d?.images ?? {};
  // sent: "downsized" (≤ 2 MB) or the original; grid thumbnail: fixed_width_small, else fixed_width (webp first)
  const full = img.downsized?.url ? img.downsized : img.original;
  const small = img.fixed_width_small?.url ? img.fixed_width_small : img.fixed_width ?? full;
  const url = mediaUrl(full?.url);
  const preview = mediaUrl(small?.webp) ?? mediaUrl(small?.url) ?? url;
  if (!url || !preview || typeof d.id !== 'string') return null;
  return {
    id: d.id,
    title: typeof d.title === 'string' ? d.title.slice(0, 140) : '',
    url,
    preview,
    width: Number(full.width) || 0,
    height: Number(full.height) || 0,
  };
}

export class GifService {
  readonly provider = GIF_PROVIDER;
  private cache = new Map<string, { at: number; value: GifSearchResponse }>();

  constructor(private key: string | null, public fetcher: GifFetch = defaultFetch) {}

  get enabled(): boolean {
    return !!this.key;
  }

  search(q: string, offset: number): Promise<GifSearchResponse> {
    return this.query('search', { q }, offset);
  }

  trending(offset: number): Promise<GifSearchResponse> {
    return this.query('trending', {}, offset);
  }

  private async query(kind: 'search' | 'trending', params: Record<string, string>, offset: number): Promise<GifSearchResponse> {
    if (!this.key) throw new GifUnavailable('not configured');
    const off = Math.max(0, Math.min(MAX_OFFSET, Math.floor(offset) || 0));
    const cacheKey = `${kind}:${params.q?.toLowerCase() ?? ''}:${off}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS[kind]) return hit.value;

    const qs = new URLSearchParams({ api_key: this.key, limit: String(PAGE), offset: String(off), rating: 'pg-13', lang: 'en', ...params });
    let res: { status: number; json: any };
    try {
      res = await this.fetcher(`${API}/${kind}?${qs}`);
    } catch {
      throw new GifUnavailable('provider unreachable');
    }
    if (res.status !== 200 || !Array.isArray(res.json?.data)) throw new GifUnavailable(`provider http ${res.status}`);
    const results = (res.json.data as unknown[]).map(toResult).filter((r): r is GifResult => !!r);
    const count = Number(res.json.pagination?.count) || res.json.data.length;
    const total = Number(res.json.pagination?.total_count) || 0;
    const nextOff = off + count;
    const value: GifSearchResponse = { results, next: count > 0 && nextOff < total && nextOff <= MAX_OFFSET ? nextOff : null };
    if (this.cache.size > 300) this.cache.clear();
    this.cache.set(cacheKey, { at: Date.now(), value });
    return value;
  }
}

/**
 * Inline GIF embed for a direct GIF / video URL on the provider's media domain (or a giphy.com/gifs/… page,
 * mapped to its media file). Built without fetching anything.
 */
export function gifEmbedFor(raw: string): Embed | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  let media: string | null = null;
  if (GIF_MEDIA_HOST_RE.test(u.hostname) && /\.(gif|webp|mp4)$/i.test(u.pathname)) media = u.origin + u.pathname;
  else if (/^(www\.)?giphy\.com$/i.test(u.hostname)) {
    const id = /^\/gifs\/(?:[\w-]*-)?([A-Za-z0-9]{6,40})\/?$/.exec(u.pathname)?.[1];
    if (id) media = `https://media.giphy.com/media/${id}/giphy.gif`;
  }
  if (!media) return null;
  const video = media.toLowerCase().endsWith('.mp4');
  return {
    url: raw, type: 'gifv', title: null, description: null, site_name: GIF_PROVIDER, color: null,
    image: video ? null : { url: media, width: null, height: null },
    video: video ? { url: media } : null,
  };
}
