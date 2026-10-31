import fs from 'node:fs';
import path from 'node:path';

/** Strips path components and unsafe characters from a client-supplied filename. */
export function safeName(name: string | undefined, fallback = 'file'): string {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  const cleaned = base
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(-120);
  return cleaned || fallback;
}

/** Writes a buffer under the uploads root and returns the public URL path. */
export function saveUpload(root: string, relPath: string, data: Buffer): { url: string; abs: string } {
  const abs = path.join(root, relPath);
  if (!abs.startsWith(path.resolve(root))) throw new Error('bad upload path');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return { url: '/uploads/' + relPath.split(path.sep).join('/'), abs };
}

export function removeUpload(root: string, url: string | null | undefined): void {
  if (!url || !url.startsWith('/uploads/')) return;
  const abs = path.join(root, url.slice('/uploads/'.length));
  if (!abs.startsWith(path.resolve(root))) return;
  fs.rm(abs, { force: true }, () => {});
}

const EXT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', txt: 'text/plain', pdf: 'application/pdf', json: 'application/json',
  zip: 'application/zip',
};

export function guessContentType(filename: string, declared?: string): string {
  if (declared && declared !== 'application/octet-stream') return declared;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? declared ?? 'application/octet-stream';
}

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Cheap header parse for png/jpeg/gif/webp dimensions. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    switch (sniffImage(buf)) {
      case 'png':
        return buf.length >= 24 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null;
      case 'gif':
        return buf.length >= 10 ? { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) } : null;
      case 'webp': {
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        if (chunk === 'VP8L' && buf.length >= 25) {
          const b = buf.readUInt32LE(21);
          return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
        }
        if (chunk === 'VP8X' && buf.length >= 30) return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
        return null;
      }
      case 'jpeg': {
        let i = 2;
        while (i + 9 < buf.length) {
          if (buf[i] !== 0xff) { i++; continue; }
          const marker = buf[i + 1];
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
          const len = buf.readUInt16BE(i + 2);
          if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
          }
          i += 2 + len;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const IMAGE_EXT: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
export const IMAGE_MIME: Record<ImageKind, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export type AudioKind = 'mp3' | 'ogg' | 'wav';
export const AUDIO_EXT: Record<AudioKind, string> = { mp3: 'mp3', ogg: 'ogg', wav: 'wav' };

const MP3_KBPS_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_KBPS_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_RATES = [44100, 48000, 32000];

/** Parses an MPEG Layer III frame header at i: { bytes, ms } or null if there's no valid frame. */
function mp3Frame(buf: Buffer, i: number): { bytes: number; ms: number } | null {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
  const brIdx = buf[i + 2] >> 4;
  const srIdx = (buf[i + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const v1 = version === 3;
  const kbps = (v1 ? MP3_KBPS_V1 : MP3_KBPS_V2)[brIdx];
  const rate = MP3_RATES[srIdx] / (v1 ? 1 : version === 2 ? 2 : 4);
  const samples = v1 ? 1152 : 576;
  const bytes = Math.floor(((samples / 8) * kbps * 1000) / rate) + ((buf[i + 2] >> 1) & 1);
  return { bytes, ms: (samples / rate) * 1000 };
}

/** Skips a leading ID3v2 tag. */
function id3End(buf: Buffer): number {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  return 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
}

export function sniffAudio(buf: Buffer): AudioKind | null {
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (mp3Frame(buf, id3End(buf))) return 'mp3';
  return null;
}

/** Duration from the container headers (no decoding). null when it can't be determined. */
export function audioDurationMs(buf: Buffer, kind: AudioKind): number | null {
  try {
    if (kind === 'wav') {
      let byteRate = 0;
      for (let i = 12; i + 8 <= buf.length;) {
        const id = buf.toString('latin1', i, i + 4);
        const size = buf.readUInt32LE(i + 4);
        if (id === 'fmt ' && i + 16 <= buf.length) byteRate = buf.readUInt32LE(i + 16);
        if (id === 'data') return byteRate ? (Math.min(size, buf.length - i - 8) / byteRate) * 1000 : null;
        i += 8 + size + (size & 1);
      }
      return null;
    }
    if (kind === 'mp3') {
      // walk every frame (files are ≤ 512 KB) so VBR files are measured correctly
      let ms = 0;
      for (let i = id3End(buf), f = mp3Frame(buf, i); f; i += f.bytes, f = mp3Frame(buf, i)) ms += f.ms;
      return ms || null;
    }
    // Ogg: sample rate from the first packet (Vorbis or Opus), length from the last page's granule position
    const head = buf.indexOf('OpusHead', 0, 'latin1');
    const vorbis = buf.indexOf('\x01vorbis', 0, 'latin1');
    let rate = 0;
    let preSkip = 0;
    if (head >= 0 && head < 200) { rate = 48000; preSkip = buf.readUInt16LE(head + 10); }
    else if (vorbis >= 0 && vorbis < 200) rate = buf.readUInt32LE(vorbis + 12);
    const last = buf.lastIndexOf('OggS', buf.length - 4, 'latin1');
    if (!rate || last < 0 || last + 14 > buf.length) return null;
    const granule = Number(buf.readBigInt64LE(last + 6));
    return granule > 0 ? ((granule - preSkip) / rate) * 1000 : null;
  } catch {
    return null;
  }
}
