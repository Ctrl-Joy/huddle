import type { FastifyInstance } from 'fastify';
import { AuditLogAction, ChannelType, LIMITS, MessageType, Permissions } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import {
  channel as serializeChannel, getChannelRow, getUserRow, guild, isPrivate, member, recipientIds,
} from '../serializers';
import { getGuildRow, requireChannel, requirePerm } from '../services/permissions';
import { diff, writeAudit } from '../services/audit';
import { createMessage } from '../services/messages';
import { auditReason, body, optInt, optStr, uid } from './util';
import { normalizeChannelName, parseOverwrites } from './guilds';
import { isBlocked } from './users';

export default function channelRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const emitUpdate = (channelId: string) => {
    const c = getChannelRow(db, channelId)!;
    if (isPrivate(c)) gw.dispatchToUsers(recipientIds(db, c.id), 'CHANNEL_UPDATE', (u) => serializeChannel(db, c, u));
    else gw.dispatchToGuild(c.guild_id!, 'CHANNEL_UPDATE', serializeChannel(db, c));
  };

  app.get('/channels/:id', async (req) => {
    const me = uid(req);
    const { c } = requireChannel(db, (req.params as { id: string }).id, me);
    return serializeChannel(db, c, me);
  });

  app.patch('/channels/:id', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    const b = body(req);

    if (isPrivate(c)) {
      if (c.type !== ChannelType.GROUP_DM) throw badRequest('DM channels cannot be edited');
      const name = optStr(b, 'name', { max: 100, nullable: true });
      if (name !== undefined) {
        db.run('UPDATE channels SET name = ? WHERE id = ?', name || null, c.id);
        createMessage(ctx, { channel: c, authorId: me, content: name || '', type: MessageType.CHANNEL_NAME_CHANGE });
      }
      emitUpdate(c.id);
      return serializeChannel(db, getChannelRow(db, c.id)!, me);
    }

    requirePerm(perms, Permissions.MANAGE_CHANNELS);
    const g = getGuildRow(db, c.guild_id!)!;
    const next: Record<string, string | number | null> = {};
    const name = optStr(b, 'name', { min: 1, max: LIMITS.CHANNEL_NAME });
    if (name) next.name = normalizeChannelName(name, c.type);
    if (c.type === ChannelType.GUILD_TEXT) {
      const topic = optStr(b, 'topic', { max: 1024, nullable: true });
      if (topic !== undefined) next.topic = topic || null;
      const rl = optInt(b, 'rate_limit_per_user', 0, 21600);
      if (rl !== undefined) next.rate_limit_per_user = rl;
    }
    const pos = optInt(b, 'position', 0, 10_000);
    if (pos !== undefined) next.position = pos;
    if (b.parent_id !== undefined && c.type !== ChannelType.GUILD_CATEGORY) {
      if (b.parent_id === null) next.parent_id = null;
      else {
        const p = getChannelRow(db, String(b.parent_id));
        if (!p || p.guild_id !== c.guild_id || p.type !== ChannelType.GUILD_CATEGORY) throw invalidField('parent_id', 'Unknown category');
        next.parent_id = p.id;
      }
    }
    if (b.permission_overwrites !== undefined) {
      requirePerm(perms, Permissions.MANAGE_ROLES);
      const ows = parseOverwrites(ctx, g, b.permission_overwrites, perms);
      db.tx(() => {
        db.run('DELETE FROM permission_overwrites WHERE channel_id = ?', c.id);
        for (const o of ows) {
          db.run('INSERT INTO permission_overwrites (channel_id, target_id, type, allow, deny) VALUES (?, ?, ?, ?, ?)',
            c.id, o.id, o.type, o.allow.toString(), o.deny.toString());
        }
      });
      writeAudit(ctx, g.id, me, AuditLogAction.CHANNEL_OVERWRITE_UPDATE, c.id,
        [{ key: 'permission_overwrites', new_value: b.permission_overwrites }], auditReason(req));
    }
    const keys = Object.keys(next);
    if (keys.length) {
      db.run(`UPDATE channels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => next[k]), c.id);
      writeAudit(ctx, g.id, me, AuditLogAction.CHANNEL_UPDATE, c.id, diff(c as any, next, keys), auditReason(req));
    }
    emitUpdate(c.id);
    return serializeChannel(db, getChannelRow(db, c.id)!);
  });

  app.delete('/channels/:id', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);

    if (c.type === ChannelType.DM) {
      // "Close DM": hide it until new activity.
      db.run('UPDATE channel_recipients SET closed = 1 WHERE channel_id = ? AND user_id = ?', c.id, me);
      const out = serializeChannel(db, c, me);
      gw.dispatchToUser(me, 'CHANNEL_DELETE', out);
      return out;
    }
    if (c.type === ChannelType.GROUP_DM) {
      // Leave the group.
      const out = serializeChannel(db, c, me);
      if (ctx.voice.get(me)?.channel_id === c.id) ctx.voice.leave(me);
      db.run('DELETE FROM channel_recipients WHERE channel_id = ? AND user_id = ?', c.id, me);
      gw.dispatchToUser(me, 'CHANNEL_DELETE', out);
      const rest = recipientIds(db, c.id);
      if (rest.length === 0) {
        db.run('DELETE FROM channels WHERE id = ?', c.id);
      } else {
        if (c.owner_id === me) db.run('UPDATE channels SET owner_id = ? WHERE id = ?', rest[0], c.id);
        createMessage(ctx, { channel: getChannelRow(db, c.id)!, authorId: me, content: '', type: MessageType.RECIPIENT_REMOVE });
        emitUpdate(c.id);
      }
      return out;
    }

    requirePerm(perms, Permissions.MANAGE_CHANNELS);
    const g = getGuildRow(db, c.guild_id!)!;
    const out = serializeChannel(db, c);
    ctx.voice.removeFromChannel(c.id);
    const children = c.type === ChannelType.GUILD_CATEGORY
      ? db.all<{ id: string }>('SELECT id FROM channels WHERE parent_id = ?', c.id).map((r) => r.id)
      : [];
    db.tx(() => {
      db.run('UPDATE channels SET parent_id = NULL WHERE parent_id = ?', c.id);
      db.run('DELETE FROM channels WHERE id = ?', c.id);
      if (g.system_channel_id === c.id) db.run('UPDATE guilds SET system_channel_id = NULL WHERE id = ?', g.id);
    });
    writeAudit(ctx, g.id, me, AuditLogAction.CHANNEL_DELETE, c.id, [{ key: 'name', old_value: c.name }], auditReason(req));
    gw.dispatchToGuild(g.id, 'CHANNEL_DELETE', out);
    for (const id of children) emitUpdate(id);
    if (g.system_channel_id === c.id) gw.dispatchToGuild(g.id, 'GUILD_UPDATE', guild(getGuildRow(db, g.id)!));
    return out;
  });

  // ---------- permission overwrites ----------

  app.put('/channels/:id/permissions/:targetId', async (req, reply) => {
    const me = uid(req);
    const { id, targetId } = req.params as { id: string; targetId: string };
    const { c, perms } = requireChannel(db, id, me);
    if (isPrivate(c)) throw badRequest('DM channels have no permission overwrites');
    requirePerm(perms, Permissions.MANAGE_ROLES);
    const g = getGuildRow(db, c.guild_id!)!;
    const b = body(req);
    const [o] = parseOverwrites(ctx, g, [{ id: targetId, type: b.type, allow: b.allow, deny: b.deny }], perms);
    const old = db.one<any>('SELECT * FROM permission_overwrites WHERE channel_id = ? AND target_id = ?', c.id, targetId);
    db.run(
      `INSERT INTO permission_overwrites (channel_id, target_id, type, allow, deny) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (channel_id, target_id) DO UPDATE SET type = excluded.type, allow = excluded.allow, deny = excluded.deny`,
      c.id, o.id, o.type, o.allow.toString(), o.deny.toString(),
    );
    writeAudit(ctx, g.id, me, AuditLogAction.CHANNEL_OVERWRITE_UPDATE, c.id, [
      { key: 'id', new_value: targetId },
      { key: 'type', new_value: o.type },
      { key: 'allow', old_value: old?.allow, new_value: o.allow.toString() },
      { key: 'deny', old_value: old?.deny, new_value: o.deny.toString() },
    ], auditReason(req));
    emitUpdate(c.id);
    return reply.status(204).send();
  });

  app.delete('/channels/:id/permissions/:targetId', async (req, reply) => {
    const me = uid(req);
    const { id, targetId } = req.params as { id: string; targetId: string };
    const { c, perms } = requireChannel(db, id, me);
    if (isPrivate(c)) throw badRequest('DM channels have no permission overwrites');
    requirePerm(perms, Permissions.MANAGE_ROLES);
    const old = db.one<any>('SELECT * FROM permission_overwrites WHERE channel_id = ? AND target_id = ?', c.id, targetId);
    if (!old) throw notFound('Overwrite', ErrorCode.UNKNOWN_OVERWRITE);
    db.run('DELETE FROM permission_overwrites WHERE channel_id = ? AND target_id = ?', c.id, targetId);
    writeAudit(ctx, c.guild_id!, me, AuditLogAction.CHANNEL_OVERWRITE_DELETE, c.id, [
      { key: 'id', old_value: targetId }, { key: 'allow', old_value: old.allow }, { key: 'deny', old_value: old.deny },
    ], auditReason(req));
    emitUpdate(c.id);
    return reply.status(204).send();
  });

  // ---------- group DM recipients ----------

  app.put('/channels/:id/recipients/:userId', async (req, reply) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { c } = requireChannel(db, id, me);
    if (c.type !== ChannelType.GROUP_DM) throw badRequest('Not a group DM');
    if (!getUserRow(db, userId)) throw notFound('User', ErrorCode.UNKNOWN_USER);
    if (isBlocked(ctx, me, userId)) throw forbidden('Cannot add this user', ErrorCode.CANNOT_DM);
    const recips = recipientIds(db, c.id);
    if (recips.includes(userId)) return reply.status(204).send();
    if (recips.length >= LIMITS.GROUP_DM_RECIPIENTS) throw badRequest('Group DM is full');
    db.run('INSERT INTO channel_recipients (channel_id, user_id) VALUES (?, ?)', c.id, userId);
    const fresh = getChannelRow(db, c.id)!;
    gw.dispatchToUser(userId, 'CHANNEL_CREATE', serializeChannel(db, fresh, userId));
    emitUpdate(c.id);
    createMessage(ctx, { channel: fresh, authorId: me, content: `<@${userId}>`, type: MessageType.RECIPIENT_ADD });
    return reply.status(204).send();
  });

  // ---------- typing / calls ----------

  app.post('/channels/:id/typing', async (req, reply) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    requirePerm(perms, Permissions.SEND_MESSAGES);
    const payload = {
      channel_id: c.id,
      guild_id: c.guild_id,
      user_id: me,
      timestamp: Math.floor(Date.now() / 1000),
      ...(c.guild_id ? { member: member(db, c.guild_id, me) ?? undefined } : {}),
    };
    gw.dispatchToChannel(c, 'TYPING_START', payload);
    return reply.status(204).send();
  });

  app.post('/channels/:id/call/ring', async (req) => {
    const me = uid(req);
    const { c } = requireChannel(db, (req.params as { id: string }).id, me);
    if (!isPrivate(c)) throw badRequest('Calls are only available in DMs');
    if (c.type === ChannelType.DM) {
      const other = recipientIds(db, c.id).find((u) => u !== me);
      if (other && isBlocked(ctx, me, other)) throw forbidden('Cannot call this user', ErrorCode.CANNOT_DM);
    }
    const ringing = ctx.voice.ring(me, c);
    return { channel_id: c.id, ringing };
  });

}
