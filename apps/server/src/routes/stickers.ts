import type { FastifyInstance } from 'fastify';
import { AuditLogAction, Permissions, STICKER_LIMITS } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ApiErr, ErrorCode, badRequest, invalidField, notFound } from '../errors';
import { sticker as serializeSticker, stickersOf, type GuildRow, type StickerRow } from '../serializers';
import { requireGuild, requireGuildPerm } from '../services/permissions';
import { writeAudit } from '../services/audit';
import { sniffSticker } from '../services/stickers';
import { removeUpload, saveUpload } from '../uploads';
import { auditReason, body, readMultipart, uid } from './util';

const EXT = { png: 'png', apng: 'png', gif: 'gif', webp: 'webp' } as const;

/** 2–30 printable characters, unique in the guild (case-insensitive). */
function checkName(ctx: Ctx, g: GuildRow, raw: unknown, exceptId?: string): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < STICKER_LIMITS.NAME_MIN || name.length > STICKER_LIMITS.NAME_MAX || /[\p{C}]/u.test(name)) {
    throw invalidField('name', `Sticker names must be ${STICKER_LIMITS.NAME_MIN}-${STICKER_LIMITS.NAME_MAX} characters`);
  }
  const taken = ctx.db.one<{ id: string }>('SELECT id FROM stickers WHERE guild_id = ? AND name = ? COLLATE NOCASE', g.id, name);
  if (taken && taken.id !== exceptId) throw invalidField('name', `This server already has a sticker called "${name}"`);
  return name;
}

/** The related emoji: required, a short string containing at least one emoji. */
function checkTags(raw: unknown): string {
  const tags = typeof raw === 'string' ? raw.trim() : '';
  if (!tags || tags.length > STICKER_LIMITS.TAGS_MAX || !/\p{Extended_Pictographic}/u.test(tags)) {
    throw invalidField('tags', 'Pick a related emoji for this sticker');
  }
  return tags;
}

function checkDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw invalidField('description', 'description must be a string');
  const d = raw.trim();
  if (d.length > STICKER_LIMITS.DESCRIPTION_MAX) {
    throw invalidField('description', `Descriptions can be at most ${STICKER_LIMITS.DESCRIPTION_MAX} characters`);
  }
  return d || null;
}

export default function stickerRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const loadSticker = (g: GuildRow, sid: string): StickerRow => {
    const s = db.one<StickerRow>('SELECT * FROM stickers WHERE id = ? AND guild_id = ?', sid, g.id);
    if (!s) throw notFound('Sticker', ErrorCode.UNKNOWN_STICKER);
    return s;
  };
  const broadcast = (guildId: string) =>
    gw.dispatchToGuild(guildId, 'GUILD_STICKERS_UPDATE', { guild_id: guildId, stickers: stickersOf(db, guildId) });

  app.get('/guilds/:id/stickers', async (req) => {
    const { g } = requireGuild(db, (req.params as { id: string }).id, uid(req));
    return stickersOf(db, g.id);
  });

  // multipart: file (PNG/APNG/GIF/WebP, ≤ 512 KB) + name + tags (related emoji) + description?
  app.post('/guilds/:id/stickers', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_EMOJIS);
    const { fields, files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: STICKER_LIMITS.BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const format = sniffSticker(f.data);
    if (!format) throw invalidField('file', 'Stickers must be a PNG, APNG, GIF or WebP image');
    const name = checkName(ctx, g, fields.name);
    const tags = checkTags(fields.tags);
    const description = checkDescription(fields.description);
    const count = db.one<{ n: number }>('SELECT COUNT(*) AS n FROM stickers WHERE guild_id = ?', g.id)!.n;
    if (count >= STICKER_LIMITS.PER_GUILD) {
      throw new ApiErr(400, `Maximum number of stickers reached (${STICKER_LIMITS.PER_GUILD})`, ErrorCode.MAX_STICKERS);
    }
    const id = ctx.id();
    const { url } = saveUpload(ctx.cfg.uploadsDir, `stickers/${id}.${EXT[format]}`, f.data);
    db.run(
      'INSERT INTO stickers (id, guild_id, name, description, tags, format, url, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, g.id, name, description, tags, format, url, me, now(),
    );
    writeAudit(ctx, g.id, me, AuditLogAction.STICKER_CREATE, id, [{ key: 'name', new_value: name }], auditReason(req));
    broadcast(g.id);
    return serializeSticker(loadSticker(g, id));
  });

  // { name?, tags?, description? }
  app.patch('/guilds/:id/stickers/:sid', async (req) => {
    const me = uid(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const s = loadSticker(g, sid);
    const b = body(req);
    const next = {
      name: b.name !== undefined ? checkName(ctx, g, b.name, s.id) : s.name,
      tags: b.tags !== undefined ? checkTags(b.tags) : s.tags,
      description: b.description !== undefined ? checkDescription(b.description) : s.description,
    };
    const changes = (Object.keys(next) as (keyof typeof next)[])
      .filter((k) => next[k] !== s[k])
      .map((k) => ({ key: k, old_value: s[k], new_value: next[k] }));
    if (changes.length) {
      db.run('UPDATE stickers SET name = ?, tags = ?, description = ? WHERE id = ?', next.name, next.tags, next.description, s.id);
      writeAudit(ctx, g.id, me, AuditLogAction.STICKER_UPDATE, s.id, changes, auditReason(req, b));
      broadcast(g.id);
    }
    return serializeSticker(loadSticker(g, s.id));
  });

  app.delete('/guilds/:id/stickers/:sid', async (req, reply) => {
    const me = uid(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const s = loadSticker(g, sid);
    db.run('DELETE FROM stickers WHERE id = ?', s.id);
    // sent sticker messages keep their frozen copy; the client shows a placeholder once the image is gone
    removeUpload(ctx.cfg.uploadsDir, s.url);
    writeAudit(ctx, g.id, me, AuditLogAction.STICKER_DELETE, s.id, [{ key: 'name', old_value: s.name }], auditReason(req));
    broadcast(g.id);
    return reply.status(204).send();
  });
}
