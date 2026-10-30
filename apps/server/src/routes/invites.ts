import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AuditLogAction, ChannelType, Permissions, has } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ApiErr, ErrorCode, badRequest, forbidden, notFound } from '../errors';
import { invite, type InviteRow } from '../serializers';
import { getGuildRow, requireChannel, requireGuildPerm, guildPerms } from '../services/permissions';
import { addMember, fullGuild } from '../services/guilds';
import { writeAudit } from '../services/audit';
import { auditReason, body, optInt, uid } from './util';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newCode(): string {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export default function inviteRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const online = (ids: string[]) => ids.filter((id) => ctx.gw.presence(id).status !== 'offline').length;

  const loadValid = (code: string): InviteRow => {
    const i = db.one<InviteRow>('SELECT * FROM invites WHERE code = ?', code);
    if (!i) throw notFound('Invite', ErrorCode.UNKNOWN_INVITE);
    const expired = (i.expires_at && Date.parse(i.expires_at) <= Date.now()) || (i.max_uses > 0 && i.uses >= i.max_uses);
    if (expired) {
      db.run('DELETE FROM invites WHERE code = ?', code);
      throw notFound('Invite', ErrorCode.UNKNOWN_INVITE);
    }
    return i;
  };

  app.post('/channels/:id/invites', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    if (!c.guild_id || c.type === ChannelType.GUILD_CATEGORY) throw badRequest('Invites can only be created for server channels');
    if (!has(perms, Permissions.CREATE_INVITE)) throw forbidden();
    const b = body(req);
    const maxUses = optInt(b, 'max_uses', 0, 100) ?? 0;
    const maxAge = optInt(b, 'max_age', 0, 604800) ?? 86400;
    let code = newCode();
    while (db.one('SELECT 1 AS x FROM invites WHERE code = ?', code)) code = newCode();
    const created = now();
    const expires = maxAge > 0 ? new Date(Date.now() + maxAge * 1000).toISOString() : null;
    db.run(
      `INSERT INTO invites (code, guild_id, channel_id, inviter_id, uses, max_uses, max_age, created_at, expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      code, c.guild_id, c.id, me, maxUses, maxAge, created, expires,
    );
    writeAudit(ctx, c.guild_id, me, AuditLogAction.INVITE_CREATE, null, [
      { key: 'code', new_value: code }, { key: 'channel_id', new_value: c.id },
      { key: 'max_uses', new_value: maxUses }, { key: 'max_age', new_value: maxAge },
    ], auditReason(req));
    return invite(db, db.one<InviteRow>('SELECT * FROM invites WHERE code = ?', code)!);
  });

  app.get('/guilds/:id/invites', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_GUILD);
    return db.all<InviteRow>('SELECT * FROM invites WHERE guild_id = ? ORDER BY created_at DESC', g.id)
      .filter((i) => !((i.expires_at && Date.parse(i.expires_at) <= Date.now()) || (i.max_uses > 0 && i.uses >= i.max_uses)))
      .map((i) => invite(db, i));
  });

  // Public preview (auth optional).
  app.get('/invites/:code', async (req) => {
    const i = loadValid((req.params as { code: string }).code);
    return invite(db, i, true, online);
  });

  app.post('/invites/:code', async (req) => {
    const me = uid(req);
    const i = loadValid((req.params as { code: string }).code);
    const g = getGuildRow(db, i.guild_id)!;
    if (db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', g.id, me)) {
      return fullGuild(ctx, g.id); // already a member: no-op
    }
    if (db.one('SELECT 1 AS x FROM bans WHERE guild_id = ? AND user_id = ?', g.id, me)) {
      throw new ApiErr(403, 'You are banned from this server', ErrorCode.BANNED);
    }
    db.run('UPDATE invites SET uses = uses + 1 WHERE code = ?', i.code);
    addMember(ctx, g, me);
    return fullGuild(ctx, g.id);
  });

  app.delete('/invites/:code', async (req) => {
    const me = uid(req);
    const code = (req.params as { code: string }).code;
    const i = db.one<InviteRow>('SELECT * FROM invites WHERE code = ?', code);
    if (!i) throw notFound('Invite', ErrorCode.UNKNOWN_INVITE);
    const g = getGuildRow(db, i.guild_id);
    const perms = g ? guildPerms(db, g, me) : null;
    if (perms === null) throw notFound('Invite', ErrorCode.UNKNOWN_INVITE);
    if (!has(perms, Permissions.MANAGE_GUILD) && !has(perms, Permissions.MANAGE_CHANNELS) && i.inviter_id !== me) {
      throw forbidden();
    }
    const out = invite(db, i);
    db.run('DELETE FROM invites WHERE code = ?', code);
    writeAudit(ctx, i.guild_id, me, AuditLogAction.INVITE_DELETE, null, [{ key: 'code', old_value: code }], auditReason(req));
    return out;
  });
}
