import type { FastifyInstance } from 'fastify';
import { AuditLogAction, Permissions } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, notFound } from '../errors';
import { ban, getMemberRow, getUserRow, publicUser } from '../serializers';
import { canActOn, requireGuildPerm } from '../services/permissions';
import { removeMember } from '../services/guilds';
import { writeAudit } from '../services/audit';
import { auditReason, body, uid } from './util';

export default function banRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  app.get('/guilds/:id/bans', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.BAN_MEMBERS);
    return db.all<{ user_id: string; reason: string | null }>(
      'SELECT user_id, reason FROM bans WHERE guild_id = ? ORDER BY created_at DESC', g.id,
    ).map((r) => ban(db, r));
  });

  app.get('/guilds/:id/bans/:userId', async (req) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.BAN_MEMBERS);
    const r = db.one<{ user_id: string; reason: string | null }>('SELECT user_id, reason FROM bans WHERE guild_id = ? AND user_id = ?', g.id, userId);
    if (!r) throw notFound('Ban', ErrorCode.UNKNOWN_BAN);
    return ban(db, r);
  });

  app.put('/guilds/:id/bans/:userId', async (req, reply) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.BAN_MEMBERS);
    const u = getUserRow(db, userId);
    if (!u) throw notFound('User', ErrorCode.UNKNOWN_USER);
    if (userId === me) throw badRequest('You cannot ban yourself');
    if (userId === g.owner_id) throw forbidden('You cannot ban the owner');
    const isMember = !!getMemberRow(db, g.id, userId);
    if (isMember && !canActOn(db, g, me, userId)) throw forbidden('You cannot ban this member');
    const reason = auditReason(req, body(req));
    db.run(
      `INSERT INTO bans (guild_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = excluded.reason`,
      g.id, userId, reason, now(),
    );
    if (isMember) removeMember(ctx, g, userId);
    writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_BAN_ADD, userId, [], reason);
    gw.dispatchToGuild(g.id, 'GUILD_BAN_ADD', { guild_id: g.id, user: publicUser(u) }, { perm: Permissions.BAN_MEMBERS });
    return reply.status(204).send();
  });

  app.delete('/guilds/:id/bans/:userId', async (req, reply) => {
    const me = uid(req);
    const { id, userId } = req.params as { id: string; userId: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.BAN_MEMBERS);
    const r = db.run('DELETE FROM bans WHERE guild_id = ? AND user_id = ?', g.id, userId);
    if (!r.changes) throw notFound('Ban', ErrorCode.UNKNOWN_BAN);
    writeAudit(ctx, g.id, me, AuditLogAction.MEMBER_BAN_REMOVE, userId, [], auditReason(req, body(req)));
    const u = getUserRow(db, userId);
    if (u) gw.dispatchToGuild(g.id, 'GUILD_BAN_REMOVE', { guild_id: g.id, user: publicUser(u) }, { perm: Permissions.BAN_MEMBERS });
    return reply.status(204).send();
  });
}
