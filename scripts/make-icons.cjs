// Renders the Huddle logo (public/favicon.svg shapes) to the PNG icons phones need. Run: node scripts/make-icons.cjs
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const OUT = path.join(__dirname, '..', 'apps', 'web', 'public');
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, { rounded, scale }) {
  const SS = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  const teal = [0x14, 0xb8, 0xa6], ink = [0x06, 0x20, 0x1d];
  const circles = [[18, 21, 8, .9], [30, 21, 8, .6], [24, 30, 8, .35]];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + .5) / SS) / size) * 48, v = ((y + (sy + .5) / SS) / size) * 48;
        let inBg = true;
        if (rounded) { const R = 14, cx = Math.min(Math.max(u, R), 48 - R), cy = Math.min(Math.max(v, R), 48 - R); inBg = (u - cx) ** 2 + (v - cy) ** 2 <= R * R; }
        if (!inBg) continue;
        let c = teal.slice();
        // logo shapes scaled about the centre (maskable icons keep them inside the safe zone)
        const lu = 24 + (u - 24) / scale, lv = 24 + (v - 24) / scale;
        for (const [cx, cy, rr, op] of circles) if ((lu - cx) ** 2 + (lv - cy) ** 2 <= rr * rr) c = c.map((ch, i) => ch * (1 - op) + ink[i] * op);
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, o = y * (size * 4 + 1) + 1 + x * 4, cov = a / 255;
      raw[o] = cov ? r / cov : 0; raw[o + 1] = cov ? g / cov : 0; raw[o + 2] = cov ? b / cov : 0; raw[o + 3] = a / n;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const out = { 'icon-192.png': [192, { rounded: true, scale: 1 }], 'icon-512.png': [512, { rounded: true, scale: 1 }],
  'icon-maskable-512.png': [512, { rounded: false, scale: 1.25 }], 'apple-touch-icon.png': [180, { rounded: false, scale: 1.15 }] };
for (const [name, [size, o]] of Object.entries(out)) { fs.writeFileSync(path.join(OUT, name), png(size, o)); console.log(name, size); }
