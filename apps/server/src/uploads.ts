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
