import type { FastifyInstance } from 'fastify';
import { AuditLogAction, EMOJI_LIMITS, EMOJI_NAME_RE, Permissions, customReactionKey } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ApiErr, ErrorCode, badRequest, invalidField, notFound } from '../errors';
import { emoji as serializeEmoji, emojisOf, type EmojiRow, type GuildRow } from '../serializers';
import { requireGuild, requireGuildPerm } from '../services/permissions';
import { writeAudit } from '../services/audit';
import { IMAGE_EXT, removeUpload, saveUpload, sniffImage } from '../uploads';
import { auditReason, body, readMultipart, uid } from './util';

/** Validates an emoji name and checks it's free in the guild (case-insensitive). */
function checkName(ctx: Ctx, g: GuildRow, raw: unknown, exceptId?: string): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!EMOJI_NAME_RE.test(name)) {
    throw invalidField('name', `Emoji names must be ${EMOJI_LIMITS.NAME_MIN}-${EMOJI_LIMITS.NAME_MAX} characters of letters, numbers and underscores`);
  }
  const taken = ctx.db.one<{ id: string }>('SELECT id FROM emojis WHERE guild_id = ? AND name = ? COLLATE NOCASE', g.id, name);
  if (taken && taken.id !== exceptId) throw invalidField('name', `This server already has an emoji called :${name}:`);
  return name;
}

export default function emojiRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const loadEmoji = (g: GuildRow, eid: string): EmojiRow => {
    const e = db.one<EmojiRow>('SELECT * FROM emojis WHERE id = ? AND guild_id = ?', eid, g.id);
    if (!e) throw notFound('Emoji', ErrorCode.UNKNOWN_EMOJI);
    return e;
  };
  const broadcast = (guildId: string) => gw.dispatchToGuild(guildId, 'GUILD_EMOJIS_UPDATE', { guild_id: guildId, emojis: emojisOf(db, guildId) });

  app.get('/guilds/:id/emojis', async (req) => {
    const { g } = requireGuild(db, (req.params as { id: string }).id, uid(req));
    return emojisOf(db, g.id);
  });

  // multipart: file (PNG/JPEG/GIF/WebP, ≤ 256 KB) + name
  app.post('/guilds/:id/emojis', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_EMOJIS);
    const { fields, files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: EMOJI_LIMITS.BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffImage(f.data);
    if (!kind) throw invalidField('file', 'Emoji must be a PNG, JPEG, GIF or WebP image');
    const name = checkName(ctx, g, fields.name);
    const count = db.one<{ n: number }>('SELECT COUNT(*) AS n FROM emojis WHERE guild_id = ?', g.id)!.n;
    if (count >= EMOJI_LIMITS.PER_GUILD) {
      throw new ApiErr(400, `Maximum number of emoji reached (${EMOJI_LIMITS.PER_GUILD})`, ErrorCode.MAX_EMOJIS);
    }
    const id = ctx.id();
    const { url } = saveUpload(ctx.cfg.uploadsDir, `emojis/${id}.${IMAGE_EXT[kind]}`, f.data);
    db.run(
      'INSERT INTO emojis (id, guild_id, name, url, animated, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, g.id, name, url, kind === 'gif' ? 1 : 0, me, now(),
    );
    writeAudit(ctx, g.id, me, AuditLogAction.EMOJI_CREATE, id, [{ key: 'name', new_value: name }], auditReason(req));
    broadcast(g.id);
    return serializeEmoji(loadEmoji(g, id));
  });

  app.patch('/guilds/:id/emojis/:eid', async (req) => {
    const me = uid(req);
    const { id, eid } = req.params as { id: string; eid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const e = loadEmoji(g, eid);
    const b = body(req);
    const name = checkName(ctx, g, b.name, e.id);
    if (name !== e.name) {
      db.run('UPDATE emojis SET name = ? WHERE id = ?', name, e.id);
      writeAudit(ctx, g.id, me, AuditLogAction.EMOJI_UPDATE, e.id, [{ key: 'name', old_value: e.name, new_value: name }], auditReason(req, b));
      broadcast(g.id);
    }
    return serializeEmoji(loadEmoji(g, e.id));
  });

  app.delete('/guilds/:id/emojis/:eid', async (req, reply) => {
    const me = uid(req);
    const { id, eid } = req.params as { id: string; eid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const e = loadEmoji(g, eid);
    db.tx(() => {
      db.run('DELETE FROM emojis WHERE id = ?', e.id);
      // reactions with it would only render as broken chips; drop them
      db.run('DELETE FROM reactions WHERE emoji = ?', customReactionKey(e.id));
    });
    removeUpload(ctx.cfg.uploadsDir, e.url);
    writeAudit(ctx, g.id, me, AuditLogAction.EMOJI_DELETE, e.id, [{ key: 'name', old_value: e.name }], auditReason(req));
    broadcast(g.id);
    return reply.status(204).send();
  });
}
