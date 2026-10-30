// Original abstract art for the demo communities (gradients, shapes, simple glyphs), encoded as PNG with zlib.
// Same tiny-encoder approach as scripts/make-icons.cjs at the repo root.
import zlib from 'node:zlib';

type RGB = [number, number, number];
export type Motif = 'bubbles' | 'waves' | 'dots' | 'stripes' | 'peaks' | 'rings';
export type Glyph = 'circle' | 'ring' | 'diamond' | 'triangle' | 'moon' | 'plus' | 'bars' | 'wave' | 'square' | 'drop';

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

/** RGB PNG; each row uses the Sub filter, which keeps smooth gradients small. */
function encodePng(w: number, h: number, px: (x: number, y: number) => RGB): Buffer {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  const row = new Uint8Array(w * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      row[x * 3] = r; row[x * 3 + 1] = g; row[x * 3 + 2] = b;
    }
    const o = y * stride;
    raw[o] = 1; // Sub
    for (let i = 0; i < row.length; i++) raw[o + 1 + i] = (row[i] - (i >= 3 ? row[i - 3] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Coverage from a signed distance (negative = inside), anti-aliased over ~1px. */
const cover = (d: number, px: number) => clamp01(0.5 - d / px);

/** Small deterministic PRNG so a community always gets the same picture. */
export function rng(seedText: string) {
  let s = 2166136261;
  for (const ch of seedText) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 960×540 banner: angled two-colour gradient with a motif drawn in the third colour. */
export function bannerPng(seed: string, colors: [string, string, string], motif: Motif): Buffer {
  const W = 960, H = 540;
  const [c1, c2, c3] = colors.map(hex) as [RGB, RGB, RGB];
  const r = rng(seed);
  const angle = r() * Math.PI;
  const ax = Math.cos(angle), ay = Math.sin(angle);
  const shapes = Array.from({ length: 14 }, () => ({ x: r() * W, y: r() * H, s: 30 + r() * 120, a: 0.12 + r() * 0.3 }));
  const freq = 2 + r() * 3, phase = r() * 6.28;
  return encodePng(W, H, (x, y) => {
    const t = clamp01(0.5 + ((x - W / 2) * ax + (y - H / 2) * ay) / Math.hypot(W, H));
    let c = mix(c1, c2, t);
    const u = x / W, v = y / H;
    switch (motif) {
      case 'bubbles':
        for (const s of shapes) c = mix(c, c3, cover(Math.hypot(x - s.x, y - s.y) - s.s, 1.5) * s.a);
        break;
      case 'rings':
        for (const s of shapes.slice(0, 7)) c = mix(c, c3, cover(Math.abs(Math.hypot(x - s.x, y - s.y) - s.s * 1.6) - 6, 1.5) * (s.a + 0.15));
        break;
      case 'waves':
        for (let i = 0; i < 4; i++) {
          const wy = H * (0.35 + i * 0.17) + Math.sin(u * Math.PI * freq + phase + i) * 26;
          c = mix(c, c3, cover(wy - y, 1.5) * 0.16);
        }
        break;
      case 'dots': {
        const g = 36, gx = (x % g) - g / 2, gy = (y % g) - g / 2;
        const rad = 3 + 6 * clamp01(1 - Math.hypot(u - 0.8, v - 0.3));
        c = mix(c, c3, cover(Math.hypot(gx, gy) - rad, 1.2) * 0.55);
        break;
      }
      case 'stripes': {
        const d = ((x + y * 0.6) % 90) - 45;
        c = mix(c, c3, cover(Math.abs(d) - 12, 1.5) * 0.22 * (0.4 + u));
        break;
      }
      case 'peaks':
        for (let i = 0; i < 3; i++) {
          const ridge = H * (0.45 + i * 0.16) - Math.abs(((u * (freq + i) + phase) % 2) - 1) * 140 + i * 10;
          c = mix(c, mix(c3, c2, i * 0.3), cover(ridge - y, 1.5) * (0.3 + i * 0.2));
        }
        break;
    }
    // soft vignette at the bottom so the overlapping icon sits on a calmer edge
    c = mix(c, [0, 0, 0], clamp01((v - 0.65) / 0.35) * 0.18);
    return c;
  });
}

/** 256×256 square icon: diagonal gradient + one bold glyph (the app clips it to a circle/rounded square). */
export function iconPng(colors: [string, string, string], glyph: Glyph): Buffer {
  const S = 256;
  const [c1, c2] = colors.map(hex) as RGB[];
  const ink: RGB = [255, 255, 255];
  return encodePng(S, S, (x, y) => {
    let c = mix(c1, c2, clamp01((x + y) / (2 * S)));
    const px = (x - S / 2) / (S / 2), py = (y - S / 2) / (S / 2); // -1..1
    const p = 2 / S; // one pixel in glyph units
    const len = Math.hypot(px, py);
    let d: number;
    switch (glyph) {
      case 'circle': d = len - 0.42; break;
      case 'ring': d = Math.abs(len - 0.4) - 0.1; break;
      case 'square': d = Math.max(Math.abs(px), Math.abs(py)) - 0.38; break;
      case 'diamond': d = (Math.abs(px) + Math.abs(py)) / Math.SQRT2 - 0.36; break;
      case 'triangle': {
        const k = Math.sqrt(3), qx = Math.abs(px), qy = 0.12 - py; // apex up
        d = Math.max(qx * k * 0.5 + qy * 0.5, -qy) - 0.3;
        break;
      }
      case 'moon': d = Math.max(len - 0.44, -(Math.hypot(px - 0.22, py + 0.14) - 0.36)); break;
      case 'plus': d = Math.min(Math.max(Math.abs(px) - 0.13, Math.abs(py) - 0.45), Math.max(Math.abs(px) - 0.45, Math.abs(py) - 0.13)); break;
      case 'bars': {
        const heights = [0.3, 0.5, 0.38];
        d = Infinity;
        for (let i = 0; i < 3; i++) d = Math.min(d, Math.max(Math.abs(px - (i - 1) * 0.3) - 0.09, Math.abs(py - (0.45 - heights[i])) - heights[i]));
        break;
      }
      case 'wave': d = Math.max(Math.abs(py - 0.16 * Math.sin(px * 6)) - 0.09, Math.abs(px) - 0.5); break;
      case 'drop': { // round bottom, pointed top
        const cone = Math.max(Math.abs(px) - 0.3 * (py + 0.5) / 0.62, -(py + 0.5), py - 0.12);
        d = Math.min(Math.hypot(px, py - 0.12) - 0.32, cone);
        break;
      }
    }
    c = mix(c, ink, cover(d, p) * 0.92);
    return c;
  });
}
