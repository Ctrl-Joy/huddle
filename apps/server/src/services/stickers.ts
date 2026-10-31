import { STICKER_LIMITS, findBuiltinSticker, stickerItem, type StickerFormat, type StickerItem } from '@huddle/shared';
import type { Ctx } from '../context';
import { invalidField, notFound, ErrorCode } from '../errors';
import { sticker as serializeSticker, type ChannelRow, type StickerRow } from '../serializers';
import { sniffImage } from '../uploads';

/** Sticker upload format from the file bytes: PNG (APNG when it has an animation control chunk), GIF or WebP. */
export function sniffSticker(buf: Buffer): Exclude<StickerFormat, 'svg'> | null {
  const kind = sniffImage(buf);
  if (kind === 'gif' || kind === 'webp') return kind;
  if (kind !== 'png') return null;
  // walk the chunks: acTL must come before the first IDAT for an animated PNG
  for (let i = 8; i + 8 <= buf.length;) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    if (type === 'acTL') return 'apng';
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + len;
  }
  return 'png';
}

/**
 * Resolves `sticker_ids` from a message payload into frozen StickerItems. Built-ins work anywhere; server
 * stickers only in channels of their own server.
 */
export function resolveStickers(ctx: Ctx, c: ChannelRow, raw: unknown): StickerItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) throw invalidField('sticker_ids', 'sticker_ids must be an array of ids');
  const ids = [...new Set(raw as string[])];
  if (ids.length > STICKER_LIMITS.PER_MESSAGE) {
    throw invalidField('sticker_ids', `You can send at most ${STICKER_LIMITS.PER_MESSAGE} sticker${STICKER_LIMITS.PER_MESSAGE === 1 ? '' : 's'} per message`);
  }
  return ids.map((id) => {
    const builtin = findBuiltinSticker(id);
    if (builtin) return stickerItem(builtin);
    const row = /^\d{1,20}$/.test(id) ? ctx.db.one<StickerRow>('SELECT * FROM stickers WHERE id = ?', id) : undefined;
    if (!row) throw notFound('Sticker', ErrorCode.UNKNOWN_STICKER);
    if (row.guild_id !== c.guild_id) throw invalidField('sticker_ids', 'Server stickers can only be used in their own server');
    return stickerItem(serializeSticker(row));
  });
}
