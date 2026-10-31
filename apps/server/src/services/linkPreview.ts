// Link previews: find http(s) URLs in a message, fetch each page SSRF-safely, build an Embed from its
// OpenGraph / Twitter / meta tags, store it on the message and dispatch MESSAGE_UPDATE.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { LIMITS, MessageFlags, type Embed } from '@huddle/shared';
import type { Ctx } from '../context';
import { getMessageRow, type ChannelRow } from '../serializers';
import { parseEmbeds } from '../messageExtras';
import { dispatchMessageUpdate } from './messages';
import { gifEmbedFor } from './gifs';

export interface FetchedPage { url: string; html: string }
/** Swappable in tests (no network): resolves the page or throws / returns null. */
export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

export class PreviewRefused extends Error {}

// ---------------- address policy ----------------

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const out = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return out.every((n) => n >= 0 && n <= 255) ? out : null;
}

function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.includes('%')) return null; // zone ids only make sense for link-local
  let tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const b = v4Bytes(dotted[1]);
    if (!b) return null;
    tail = b;
    s = s.slice(0, -dotted[1].length) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (h: string) => (h ? h.split(':') : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function inCidr(bytes: number[], base: number[], bits: number): boolean {
  for (let i = 0; i < bytes.length && bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((bytes[i] & mask) !== (base[i] & mask)) return false;
  }
  return true;
}

// private, loopback, link-local, CGNAT, multicast, documentation, benchmarking and other reserved ranges
const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

// IPv6: only global unicast (2000::/3) is allowed at all; these reserved blocks inside it are refused too
// (Teredo/ORCHID/benchmarking 2001::/23, documentation, 6to4, the newer documentation range).
const V6_BLOCKED: [string, number][] = [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]];

export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const b = v4Bytes(ip)!;
    return V4_BLOCKED.some(([base, bits]) => inCidr(b, v4Bytes(base)!, bits));
  }
  if (kind === 6) {
    const b = v6Bytes(ip);
    if (!b) return true;
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) → judge the embedded IPv4 address
    if (b.slice(0, 10).every((x) => x === 0) && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) {
      return isPrivateAddress(b.slice(12).join('.'));
    }
    if ((b[0] & 0xe0) !== 0x20) return true; // outside 2000::/3: loopback, ULA fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96…
    return V6_BLOCKED.some(([base, bits]) => inCidr(b, v6Bytes(base)!, bits));
  }
  return true; // not an IP address at all
}

// ---------------- fetching ----------------

export interface SafeFetchOptions {
  /** DNS resolver (tests stub this). Must return every address for the host. */
  lookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  /** Address policy (tests may allow their loopback fixture server). */
  isBlocked?: (ip: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const defaultLookup = (host: string) => dns.promises.lookup(host, { all: true, verbatim: true });

function httpUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new PreviewRefused('invalid url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new PreviewRefused('only http(s) urls are fetched');
  if (u.username || u.password) throw new PreviewRefused('urls with credentials are not fetched');
  return u;
}

/**
 * GETs a text/html page without cookies, following at most `maxRedirects` redirects. Every hop's host is
 * resolved and every resolved address must pass the policy; the socket is then pinned to the checked
 * address (no second DNS lookup, so no rebinding window). Body is capped at `maxBytes`.
 */
export async function safeFetchHtml(raw: string, o: SafeFetchOptions = {}): Promise<FetchedPage> {
  const timeoutMs = o.timeoutMs ?? 5000;
  const maxBytes = o.maxBytes ?? 1024 * 1024;
  const maxRedirects = o.maxRedirects ?? 3;
  const blocked = o.isBlocked ?? isPrivateAddress;
  const lookup = o.lookup ?? defaultLookup;
  const deadline = Date.now() + timeoutMs;

  let url = httpUrl(raw);
  for (let hop = 0; ; hop++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addrs: { address: string; family: number }[];
    if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
    else {
      try { addrs = await lookup(host); } catch { throw new PreviewRefused('dns lookup failed'); }
    }
    if (!addrs.length) throw new PreviewRefused('host has no addresses');
    const bad = addrs.find((a) => blocked(a.address));
    if (bad) throw new PreviewRefused(`refusing to fetch ${host}: ${bad.address} is not a public address`);
    const pinned = addrs[0];

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const left = deadline - Date.now();
      if (left <= 0) return reject(new PreviewRefused('timed out'));
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(url, {
        method: 'GET',
        agent: false,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; HuddleBot/1.0; link previews)',
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-encoding': 'identity',
          'accept-language': 'en',
        },
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => {
          if (opts?.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
          else cb(null, pinned.address, pinned.family);
        }) as never,
      });
      const timer = setTimeout(() => req.destroy(new PreviewRefused('timed out')), left);
      req.on('response', (r) => { r.on('close', () => clearTimeout(timer)); resolve(r); });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });

    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      if (hop >= maxRedirects) throw new PreviewRefused('too many redirects');
      url = httpUrl(new URL(res.headers.location, url).href);
      continue;
    }
    if (status !== 200) { res.destroy(); throw new PreviewRefused(`http ${status}`); }
    const type = String(res.headers['content-type'] ?? '').toLowerCase();
    if (!type.startsWith('text/html') && !type.startsWith('application/xhtml+xml')) {
      res.destroy();
      throw new PreviewRefused('not an html page');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { res.destroy(); resolve(); }, Math.max(0, deadline - Date.now()));
      res.on('data', (c: Buffer) => {
        if (size >= maxBytes) return;
        chunks.push(c.subarray(0, maxBytes - size));
        size += Math.min(c.length, maxBytes - size);
        if (size >= maxBytes) { clearTimeout(timer); res.destroy(); resolve(); } // enough: <head> is at the top
      });
      res.on('end', () => { clearTimeout(timer); resolve(); });
      res.on('error', (e) => { clearTimeout(timer); if (size) resolve(); else reject(e); });
    });
    const charset = /charset=([\w-]+)/.exec(type)?.[1];
    const html = Buffer.concat(chunks).toString(charset && /^(iso-8859-1|latin1|windows-1252)$/.test(charset) ? 'latin1' : 'utf8');
    return { url: url.href, html };
  }
}

// ---------------- parsing ----------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string | undefined, max: number): string | null => {
  if (!s) return null;
  const t = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

/** Builds an Embed from a page's <head>; null when there's nothing worth showing. */
export function parsePreview(html: string, pageUrl: string, linkUrl = pageUrl): Embed | null {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = html.slice(0, headEnd > 0 ? headEnd : 512 * 1024);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
  }
  const get = (...keys: string[]) => { for (const k of keys) { const v = meta.get(k); if (v && v.trim()) return v; } return undefined; };
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];

  const title = clean(get('og:title', 'twitter:title') ?? titleTag, 256);
  const description = clean(get('og:description', 'twitter:description', 'description'), 350);
  let site = clean(get('og:site_name', 'application-name', 'twitter:site'), 100);
  if (!site) { try { site = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ } }

  let image: Embed['image'] = null;
  const rawImg = get('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  if (rawImg) {
    try {
      const u = new URL(decodeEntities(rawImg.trim()), pageUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        const dim = (k: string) => { const n = Number(get(k)); return Number.isInteger(n) && n > 0 && n < 10000 ? n : null; };
        image = { url: u.href, width: dim('og:image:width'), height: dim('og:image:height') };
      }
    } catch { /* ignore bad image urls */ }
  }

  let color: number | null = null;
  const theme = get('theme-color')?.trim();
  const hex = theme && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(theme)?.[1];
  if (hex) color = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);

  if (!title && !description && !image) return null;
  return { url: linkUrl, type: 'link', title, description, site_name: site, color, image };
}

/** First LIMITS.EMBEDS_PER_MESSAGE distinct http(s) URLs, skipping code, spoilers and <angle-bracketed> links. */
export function extractUrls(content: string): string[] {
  const prose = content.replace(/```[\s\S]*?```|`[^`\n]*`|\|\|[\s\S]*?\|\|/g, ' ');
  const out: string[] = [];
  for (const m of prose.matchAll(/<?https?:\/\/[^\s<>]+>?/gi)) {
    let u = m[0];
    if (u.startsWith('<')) continue;
    if (u.endsWith('>')) u = u.slice(0, -1);
    // trailing punctuation belongs to the sentence, not the link (keep a closing paren that has an opener)
    while (/[.,!?;:'"\]*_~]$/.test(u) || (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))) u = u.slice(0, -1);
    try { u = new URL(u).href; } catch { continue; }
    if (!out.includes(u)) out.push(u);
    if (out.length >= LIMITS.EMBEDS_PER_MESSAGE) break;
  }
  return out;
}

// ---------------- service ----------------

const CACHE_MS = 10 * 60_000;

/** One per app (ctx.previews). Work runs in the background; tests await settle(). */
export class LinkPreviews {
  fetcher: PageFetcher = (u) => safeFetchHtml(u);
  private pending = new Set<Promise<void>>();
  private cache = new Map<string, { at: number; embed: Embed | null }>();

  constructor(private ctx: Ctx) {}

  /** Re-derives a message's embeds from its content (call after create / edit). */
  enqueue(c: ChannelRow, messageId: string, content: string): void {
    const row = getMessageRow(this.ctx.db, c.id, messageId);
    if (!row) return;
    const urls = extractUrls(content);
    const current = parseEmbeds(row.embeds);
    if (!urls.length) {
      if (current.length) this.store(c, messageId, content, []);
      return;
    }
    if (current.length && current.map((e) => e.url).join('\n') === urls.join('\n')) return;
    const p = this.build(urls)
      .then((embeds) => this.store(c, messageId, content, embeds))
      .catch(() => { /* previews are best-effort */ })
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /**
   * Stores embeds that need no fetch (GIF provider media links) straight away, without a dispatch: called
   * by createMessage before the message is serialised, so MESSAGE_CREATE and the POST response carry them.
   */
  attachInstant(messageId: string, content: string): void {
    const urls = extractUrls(content);
    const embeds = urls.map((u) => gifEmbedFor(u));
    if (!urls.length || !embeds.every((e) => !!e)) return;
    this.ctx.db.run('UPDATE messages SET embeds = ? WHERE id = ?', JSON.stringify(embeds), messageId);
  }

  /** Resolves once every queued preview has been stored (tests). */
  async settle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  private async build(urls: string[]): Promise<Embed[]> {
    const out = await Promise.all(urls.map((u) => this.preview(u)));
    return out.filter((e): e is Embed => !!e);
  }

  private async preview(url: string): Promise<Embed | null> {
    const gif = gifEmbedFor(url); // GIF provider media: no page to fetch
    if (gif) return gif;
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.embed;
    let embed: Embed | null = null;
    try {
      const page = await this.fetcher(url);
      if (page) embed = parsePreview(page.html, page.url, url);
    } catch {
      embed = null; // refused / unreachable / not html → no preview
    }
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(url, { at: Date.now(), embed });
    return embed;
  }

  private store(c: ChannelRow, messageId: string, content: string, embeds: Embed[]): void {
    const { db } = this.ctx;
    const row = getMessageRow(db, c.id, messageId);
    if (!row || row.content !== content) return; // deleted or edited meanwhile (the edit re-queued)
    const before = row.embeds ?? null;
    const next = embeds.length ? JSON.stringify(embeds) : null;
    if (before === next) return;
    db.run('UPDATE messages SET embeds = ? WHERE id = ?', next, messageId);
    // suppressed messages keep the data (so un-suppressing restores it) but viewers see no change
    if ((row.flags ?? 0) & MessageFlags.SUPPRESS_EMBEDS) return;
    dispatchMessageUpdate(this.ctx, c, getMessageRow(db, c.id, messageId)!);
  }
}
