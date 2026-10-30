import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuditLogAction, ChannelType, Permissions, has, type Member } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import { getChannelRow, getMemberRow, member, memberRoleIds, membersOf, type GuildRow, type RoleRow } from '../serializers';
import { canActOn, channelPerms, requireGuild, requireGuildPerm, topPosition } from '../services/permissions';
import { removeMember } from '../services/guilds';
import { writeAudit, type Change } from '../services/audit';
import { auditReason, body, queryInt, queryStr, uid } from './util';

const MAX_TIMEOUT_MS = 28 * 24 * 3600 * 1000;

export default function memberRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const requireMember = (guildId: string, userId: string) => {
    const m = getMemberRow(db, guildId, userId);
    if (!m) throw notFound('Member', ErrorCode.UNKNOWN_MEMBER);
    return m;
  };

  app.get('/guilds/:id/members', async (req) => {
    const me = uid(req);
    const { g } = requireGuild(db, (req.params as { id: string }).id, me);
    const limit = queryInt(req.query, 'limit', 100, 1, 1000);
    return membersOf(db, g.id, { limit, after: queryStr(req.query, 'after') });
  });

  app.get('/guilds/:id/members/:userId', async (req) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { g } = requireGuild(db, id, me);
    const m = member(db, g.id, userId === '@me' ? me : userId);
    if (!m) throw notFound('Member', ErrorCode.UNKNOWN_MEMBER);
    return m;
  });

  /** Shared PATCH logic for /members/@me and /members/:userId. */
  function patchMember(req: FastifyRequest, guildId: string, targetId: string): Member {
    return db.tx(() => patchMemberInner(req, guildId, targetId));
  }

  function patchMemberInner(req: FastifyRequest, guildId: string, targetId: string): Member {
    const me = uid(req);
    const { g, perms } = requireGuild(db, guildId, me);
    const target = requireMember(g.id, targetId);
    const b = body(req);
    const reason = auditReason(req);
    const isSelf = targetId === me;
    const memberChanges: Change[] = [];
    let touched = false;

    // --- nickname
    if (b.nick !== undefined) {
      const nick = b.nick === null || b.nick === '' ? null : String(b.nick).trim().slice(0, 32) || null;
      if (isSelf) {
        if (!has(perms, Permissions.CHANGE_NICKNAME) && !has(perms, Permissions.MANAGE_NICKNAMES)) throw forbidden();
      } else {
        if (!has(perms, Permissions.MANAGE_NICKNAMES)) throw forbidden();
        if (!canActOn(db, g, me, targetId)) throw forbidden('You cannot change the nickname of this member');
      }
      if (nick !== target.nick) {
        db.run('UPDATE members SET nick = ? WHERE guild_id = ? AND user_id = ?', nick, g.id, targetId);
        memberChanges.push({ key: 'nick', old_value: target.nick, new_value: nick });
        touched = true;
      }
    }

    // --- roles
    if (b.roles !== undefined) {
      if (!has(perms, Permissions.MANAGE_ROLES)) throw forbidden();
      if (!Array.isArray(b.roles) || b.roles.some((r: unknown) => typeof r !== 'string')) {
        throw invalidField('roles', 'roles must be an array of role ids');
      }
      const wanted = new Set<string>((b.roles as string[]).filter((r) => r !== g.id));
      const current = new Set(memberRoleIds(db, g.id, targetId));
      const guildRoles = new Map(db.all<RoleRow>('SELECT * FROM roles WHERE guild_id = ?', g.id).map((r) => [r.id, r]));
      for (const r of wanted) if (!guildRoles.has(r)) throw invalidField('roles', `Unknown role ${r}`);
      const added = [...wanted].filter((r) => !current.has(r));
      const removed = [...current].filter((r) => !wanted.has(r));
      const myTop = topPosition(db, g, me);
      for (const r of [...added, ...removed]) {
        if (guildRoles.get(r)!.position >= myTop) throw forbidden('You can only assign roles below your highest role');
      }
      if (!isSelf && g.owner_id === targetId && me !== g.owner_id && removed.length) {
        throw forbidden('You cannot remove roles from the owner');
      }
      if (added.length || removed.length) {
        db.tx(() => {
          for (const r of added) db.run('INSERT OR IGNORE INTO member_roles (guild_id, user_id, role_id) VALUES (?, ?, ?)', g.id, targetId, r);
          for (const r of removed) db.run('DELETE FROM member_roles WHERE guild_id = ? AND user_id = ? AND role_id = ?', g.id, targetId, r);
        });
        const ch: Change[] = [];
        if (added.length) ch.push({ key: '$add', new_value: added.map((id) => ({ id, name: guildRoles.get(id)!.name })) });
        if (removed.length) ch.push({ key: '$remove', new_value: removed.map((id) => ({ id, name: guildRoles.get(id)!.name })) });
        writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_ROLE_UPDATE, targetId, ch, reason);
        touched = true;
      }
    }

    // --- timeout
    if (b.communication_disabled_until !== undefined) {
      if (!has(perms, Permissions.MODERATE_MEMBERS)) throw forbidden();
      if (isSelf || !canActOn(db, g, me, targetId)) throw forbidden('You cannot time out this member');
      let until: string | null = null;
      if (b.communication_disabled_until !== null) {
        const t = Date.parse(String(b.communication_disabled_until));
        if (Number.isNaN(t)) throw invalidField('communication_disabled_until', 'Must be an ISO timestamp');
        if (t - Date.now() > MAX_TIMEOUT_MS) throw invalidField('communication_disabled_until', 'Timeouts are limited to 28 days');
        until = t > Date.now() ? new Date(t).toISOString() : null;
      }
      db.run('UPDATE members SET communication_disabled_until = ? WHERE guild_id = ? AND user_id = ?', until, g.id, targetId);
      memberChanges.push({ key: 'communication_disabled_until', old_value: target.communication_disabled_until, new_value: until });
      touched = true;
      if (until) {
        // A timed-out member can't stay in voice.
        if (ctx.voice.get(targetId)?.guild_id === g.id) ctx.voice.move(g.id, targetId, null);
      }
    }

    // --- server mute / deafen
    let voiceFlagsChanged = false;
    if (b.mute !== undefined) {
      if (!has(perms, Permissions.MUTE_MEMBERS)) throw forbidden();
      const v = b.mute ? 1 : 0;
      if (v !== target.mute) {
        db.run('UPDATE members SET mute = ? WHERE guild_id = ? AND user_id = ?', v, g.id, targetId);
        memberChanges.push({ key: 'mute', old_value: !!target.mute, new_value: !!v });
        voiceFlagsChanged = touched = true;
      }
    }
    if (b.deaf !== undefined) {
      if (!has(perms, Permissions.DEAFEN_MEMBERS)) throw forbidden();
      const v = b.deaf ? 1 : 0;
      if (v !== target.deaf) {
        db.run('UPDATE members SET deaf = ? WHERE guild_id = ? AND user_id = ?', v, g.id, targetId);
        memberChanges.push({ key: 'deaf', old_value: !!target.deaf, new_value: !!v });
        voiceFlagsChanged = touched = true;
      }
    }
    if (voiceFlagsChanged) ctx.voice.refreshServerFlags(g.id, targetId);

    // --- move / disconnect
    if (b.channel_id !== undefined) {
      if (!has(perms, Permissions.MOVE_MEMBERS)) throw forbidden();
      const vs = ctx.voice.get(targetId);
      if (!vs || vs.guild_id !== g.id) throw badRequest('Target user is not connected to voice');
      if (b.channel_id === null) {
        ctx.voice.move(g.id, targetId, null);
        writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_DISCONNECT, targetId, [{ key: 'channel_id', old_value: vs.channel_id }], reason);
      } else {
        const dest = getChannelRow(db, String(b.channel_id));
        if (!dest || dest.guild_id !== g.id || dest.type !== ChannelType.GUILD_VOICE) {
          throw invalidField('channel_id', 'Must be a voice channel in this server');
        }
        if (!has(channelPerms(db, dest, me), Permissions.CONNECT)) throw forbidden();
        if (dest.id !== vs.channel_id) {
          ctx.voice.move(g.id, targetId, dest.id);
          writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_MOVE, targetId, [
            { key: 'channel_id', old_value: vs.channel_id, new_value: dest.id },
          ], reason);
        }
      }
    }

    if (memberChanges.length) writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_UPDATE, targetId, memberChanges, reason);
    const out = member(db, g.id, targetId)!;
    if (touched) gw.dispatchToGuild(g.id, 'GUILD_MEMBER_UPDATE', out);
    return out;
  }

  app.patch('/guilds/:id/members/@me', async (req) => {
    const me = uid(req);
    const b = body(req);
    // Only nick is self-editable here.
    for (const k of Object.keys(b)) if (k !== 'nick') throw invalidField(k, `${k} cannot be changed here`);
    return patchMember(req, (req.params as { id: string }).id, me);
  });

  app.patch('/guilds/:id/members/:userId', async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    return patchMember(req, id, userId);
  });

  app.delete('/guilds/:id/members/:userId', async (req, reply) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.KICK_MEMBERS);
    requireMember(g.id, userId);
    if (userId === me) throw badRequest('Use DELETE /users/@me/guilds/:id to leave');
    if (!canActOn(db, g, me, userId)) throw forbidden('You cannot kick this member');
    removeMember(ctx, g as GuildRow, userId);
    writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_KICK, userId, [], auditReason(req, body(req)));
    return reply.status(204).send();
  });
}
