import type { FastifyInstance } from 'fastify';
import { AuditLogAction, ChannelType, LIMITS, Permissions, has } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { badRequest, forbidden, invalidField } from '../errors';
import {
  channel as serializeChannel, getChannelRow, guild, guildChannels, type ChannelRow, type GuildRow,
} from '../serializers';
import { getGuildRow, requireGuild, requireGuildPerm } from '../services/permissions';
import { createGuild, deleteGuild, fullGuild } from '../services/guilds';
import { diff, writeAudit } from '../services/audit';
import { IMAGE_EXT, removeUpload, saveUpload, sniffImage } from '../uploads';
import { arrayBody, auditReason, body, isSnowflake, optInt, optStr, readMultipart, reqStr, uid } from './util';
import { AVATAR_BYTES } from './users';

export function normalizeChannelName(name: string, type: number): string {
  if (type === ChannelType.GUILD_TEXT) {
    const n = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]+/gu, '').replace(/-+/g, '-').slice(0, LIMITS.CHANNEL_NAME);
    return n || 'channel';
  }
  return name.slice(0, LIMITS.CHANNEL_NAME);
}

/** Validates an overwrite list for a guild; returns rows ready to insert. */
export function parseOverwrites(
  ctx: Ctx, g: GuildRow, raw: unknown, actorPerms: bigint,
): { id: string; type: 0 | 1; allow: bigint; deny: bigint }[] {
  if (!Array.isArray(raw)) throw invalidField('permission_overwrites', 'permission_overwrites must be an array');
  return raw.map((o: any) => {
    if (!o || !isSnowflake(o.id)) throw invalidField('permission_overwrites', 'Invalid overwrite id');
    const type = Number(o.type);
    if (type !== 0 && type !== 1) throw invalidField('permission_overwrites', 'Overwrite type must be 0 or 1');
    if (type === 0 && !ctx.db.one('SELECT 1 AS x FROM roles WHERE id = ? AND guild_id = ?', o.id, g.id)) {
      throw invalidField('permission_overwrites', 'Unknown role in overwrite');
    }
    if (type === 1 && !ctx.db.one('SELECT 1 AS x FROM members WHERE user_id = ? AND guild_id = ?', o.id, g.id)) {
      throw invalidField('permission_overwrites', 'Unknown member in overwrite');
    }
    let allow: bigint, deny: bigint;
    try {
      allow = BigInt(o.allow ?? '0');
      deny = BigInt(o.deny ?? '0');
    } catch {
      throw invalidField('permission_overwrites', 'allow/deny must be bitfield strings');
    }
    if (((allow | deny) & ~actorPerms) !== 0n) throw forbidden('You cannot grant or deny permissions you do not have');
    return { id: o.id, type: type as 0 | 1, allow, deny };
  });
}

export default function guildRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  app.post('/guilds', async (req) => {
    const me = uid(req);
    const b = body(req);
    const name = reqStr(b, 'name', { min: 2, max: LIMITS.GUILD_NAME });
    const id = createGuild(ctx, me, name);
    return fullGuild(ctx, id);
  });

  app.get('/guilds/:id', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g } = requireGuild(db, id, me);
    const q = req.query as Record<string, string>;
    if (q.full === 'true' || q.full === '1') return fullGuild(ctx, g.id);
    return guild(g);
  });

  app.patch('/guilds/:id', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_GUILD);
    const b = body(req);
    const next: Partial<GuildRow> = {};
    const name = optStr(b, 'name', { min: 2, max: LIMITS.GUILD_NAME });
    if (name) next.name = name;
    const desc = optStr(b, 'description', { max: 300, nullable: true });
    if (desc !== undefined) next.description = desc || null;
    if (b.system_channel_id !== undefined) {
      if (b.system_channel_id === null) next.system_channel_id = null;
      else {
        const c = getChannelRow(db, String(b.system_channel_id));
        if (!c || c.guild_id !== g.id || c.type !== ChannelType.GUILD_TEXT) {
          throw invalidField('system_channel_id', 'Must be a text channel in this server');
        }
        next.system_channel_id = c.id;
      }
    }
    if (b.icon === null) next.icon = null;
    if (b.owner_id !== undefined) {
      if (g.owner_id !== me) throw forbidden('Only the owner can transfer ownership');
      if (!db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', g.id, String(b.owner_id))) {
        throw invalidField('owner_id', 'New owner must be a member');
      }
      next.owner_id = String(b.owner_id);
    }
    const keys = Object.keys(next) as (keyof GuildRow)[];
    if (keys.length) {
      db.run(`UPDATE guilds SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => next[k] as string | null), g.id);
      if (next.icon === null) removeUpload(ctx.cfg.uploadsDir, g.icon);
      writeAudit(ctx, g.id, me, AuditLogAction.GUILD_UPDATE, g.id, diff(g as any, next as any, keys), auditReason(req));
    }
    const updated = guild(getGuildRow(db, g.id)!);
    gw.dispatchToGuild(g.id, 'GUILD_UPDATE', updated);
    return updated;
  });

  app.post('/guilds/:id/icon', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_GUILD);
    const { files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: AVATAR_BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffImage(f.data);
    if (!kind) throw invalidField('file', 'Icon must be a PNG, JPEG, GIF or WebP image');
    const { url } = saveUpload(ctx.cfg.uploadsDir, `icons/${g.id}-${ctx.id()}.${IMAGE_EXT[kind]}`, f.data);
    db.run('UPDATE guilds SET icon = ? WHERE id = ?', url, g.id);
    removeUpload(ctx.cfg.uploadsDir, g.icon);
    writeAudit(ctx, g.id, me, AuditLogAction.GUILD_UPDATE, g.id, [{ key: 'icon', old_value: g.icon, new_value: url }]);
    const updated = guild(getGuildRow(db, g.id)!);
    gw.dispatchToGuild(g.id, 'GUILD_UPDATE', updated);
    return updated;
  });

  app.delete('/guilds/:id', async (req, reply) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g } = requireGuild(db, id, me);
    if (g.owner_id !== me) throw forbidden('Only the owner can delete the server');
    deleteGuild(ctx, g);
    return reply.status(204).send();
  });

  // ---------- channels ----------

  app.get('/guilds/:id/channels', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    requireGuild(db, id, me);
    return guildChannels(db, id);
  });

  app.post('/guilds/:id/channels', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g, perms } = requireGuildPerm(db, id, me, Permissions.MANAGE_CHANNELS);
    const b = body(req);
    const type = b.type === undefined ? ChannelType.GUILD_TEXT : Number(b.type);
    if (![ChannelType.GUILD_TEXT, ChannelType.GUILD_VOICE, ChannelType.GUILD_CATEGORY].includes(type)) {
      throw invalidField('type', 'type must be 0 (text), 2 (voice) or 4 (category)');
    }
    const name = normalizeChannelName(reqStr(b, 'name', { min: 1, max: LIMITS.CHANNEL_NAME }), type);
    let parentId: string | null = null;
    if (b.parent_id !== undefined && b.parent_id !== null) {
      if (type === ChannelType.GUILD_CATEGORY) throw invalidField('parent_id', 'Categories cannot be nested');
      const p = getChannelRow(db, String(b.parent_id));
      if (!p || p.guild_id !== g.id || p.type !== ChannelType.GUILD_CATEGORY) throw invalidField('parent_id', 'Unknown category');
      parentId = p.id;
    }
    const topic = type === ChannelType.GUILD_TEXT ? optStr(b, 'topic', { max: 1024, nullable: true }) ?? null : null;
    const rl = optInt(b, 'rate_limit_per_user', 0, 21600) ?? 0;
    let ows: ReturnType<typeof parseOverwrites> = [];
    if (b.permission_overwrites !== undefined) {
      if (!has(perms, Permissions.MANAGE_ROLES)) throw forbidden();
      ows = parseOverwrites(ctx, g, b.permission_overwrites, perms);
    }
    let position = optInt(b, 'position', 0, 10_000);
    if (position === undefined) {
      const max = db.one<{ m: number | null }>(
        type === ChannelType.GUILD_CATEGORY
          ? 'SELECT MAX(position) AS m FROM channels WHERE guild_id = ? AND type = 4'
          : 'SELECT MAX(position) AS m FROM channels WHERE guild_id = ? AND type != 4 AND parent_id IS ?',
        ...(type === ChannelType.GUILD_CATEGORY ? [g.id] : [g.id, parentId]),
      );
      position = max?.m === null || max?.m === undefined ? 0 : max.m + 1;
    }
    const cid = ctx.id();
    db.tx(() => {
      db.run(
        `INSERT INTO channels (id, type, guild_id, name, topic, position, parent_id, rate_limit_per_user, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cid, type, g.id, name, topic, position!, parentId, rl, now(),
      );
      for (const o of ows) {
        db.run('INSERT INTO permission_overwrites (channel_id, target_id, type, allow, deny) VALUES (?, ?, ?, ?, ?)',
          cid, o.id, o.type, o.allow.toString(), o.deny.toString());
      }
    });
    writeAudit(ctx, g.id, me, AuditLogAction.CHANNEL_CREATE, cid, [
      { key: 'name', new_value: name }, { key: 'type', new_value: type },
    ], auditReason(req));
    const out = serializeChannel(db, getChannelRow(db, cid)!);
    gw.dispatchToGuild(g.id, 'CHANNEL_CREATE', out);
    return out;
  });

  app.patch('/guilds/:id/channels', async (req, reply) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_CHANNELS);
    const items = arrayBody(req);
    const updates: { c: ChannelRow; position: number; parent_id: string | null }[] = [];
    for (const it of items) {
      if (!it || typeof it.id !== 'string') throw badRequest('Each item needs an id');
      const c = getChannelRow(db, it.id);
      if (!c || c.guild_id !== g.id) throw badRequest('Unknown channel', { id: it.id });
      const position = optInt(it, 'position', 0, 10_000) ?? c.position;
      let parent = c.parent_id;
      if (it.parent_id !== undefined) {
        if (it.parent_id === null) parent = null;
        else {
          if (c.type === ChannelType.GUILD_CATEGORY) throw invalidField('parent_id', 'Categories cannot be nested');
          const p = getChannelRow(db, String(it.parent_id));
          if (!p || p.guild_id !== g.id || p.type !== ChannelType.GUILD_CATEGORY) throw invalidField('parent_id', 'Unknown category');
          parent = p.id;
        }
      }
      updates.push({ c, position, parent_id: parent });
    }
    db.tx(() => {
      for (const u of updates) db.run('UPDATE channels SET position = ?, parent_id = ? WHERE id = ?', u.position, u.parent_id, u.c.id);
    });
    for (const u of updates) {
      if (u.c.position === u.position && u.c.parent_id === u.parent_id) continue;
      gw.dispatchToGuild(g.id, 'CHANNEL_UPDATE', serializeChannel(db, getChannelRow(db, u.c.id)!));
    }
    return reply.status(204).send();
  });

}
