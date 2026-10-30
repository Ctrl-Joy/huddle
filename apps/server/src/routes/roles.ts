import type { FastifyInstance } from 'fastify';
import { AuditLogAction, Permissions } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import { channel as serializeChannel, getChannelRow, role, rolesOf, type RoleRow } from '../serializers';
import { requireGuild, requireGuildPerm, topPosition } from '../services/permissions';
import { diff, writeAudit } from '../services/audit';
import { arrayBody, auditReason, body, optBool, optInt, optPerms, optStr, uid } from './util';

export default function roleRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const getRole = (guildId: string, roleId: string): RoleRow => {
    const r = db.one<RoleRow>('SELECT * FROM roles WHERE id = ? AND guild_id = ?', roleId, guildId);
    if (!r) throw notFound('Role', ErrorCode.UNKNOWN_ROLE);
    return r;
  };

  app.get('/guilds/:id/roles', async (req) => {
    const me = uid(req);
    const { g } = requireGuild(db, (req.params as { id: string }).id, me);
    return rolesOf(db, g.id).map(role);
  });

  app.post('/guilds/:id/roles', async (req) => {
    const me = uid(req);
    const { g, perms } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_ROLES);
    const b = body(req);
    const name = optStr(b, 'name', { min: 1, max: 100 }) ?? 'new role';
    const color = optInt(b, 'color', 0, 0xffffff) ?? 0;
    const hoist = optBool(b, 'hoist') ?? false;
    const mentionable = optBool(b, 'mentionable') ?? false;
    const p = optPerms(b, 'permissions') ?? 0n;
    if ((p & ~perms) !== 0n) throw forbidden('You cannot grant permissions you do not have');
    const id = ctx.id();
    const shifted = db.all<RoleRow>('SELECT * FROM roles WHERE guild_id = ? AND position >= 1', g.id);
    db.tx(() => {
      db.run('UPDATE roles SET position = position + 1 WHERE guild_id = ? AND position >= 1', g.id);
      db.run(
        'INSERT INTO roles (id, guild_id, name, color, hoist, mentionable, position, permissions) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        id, g.id, name, color, hoist ? 1 : 0, mentionable ? 1 : 0, p.toString(),
      );
    });
    const out = role(getRole(g.id, id));
    writeAudit(ctx, g.id, me, AuditLogAction.ROLE_CREATE, id, [
      { key: 'name', new_value: name }, { key: 'permissions', new_value: p.toString() },
    ], auditReason(req));
    gw.dispatchToGuild(g.id, 'GUILD_ROLE_CREATE', { guild_id: g.id, role: out });
    for (const r of shifted) gw.dispatchToGuild(g.id, 'GUILD_ROLE_UPDATE', { guild_id: g.id, role: role(getRole(g.id, r.id)) });
    return out;
  });

  // Reorder: [{id, position}]
  app.patch('/guilds/:id/roles', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_ROLES);
    const items = arrayBody(req);
    const myTop = topPosition(db, g, me);
    const all = rolesOf(db, g.id).filter((r) => r.id !== g.id);
    const requested = new Map<string, number>();
    for (const it of items) {
      if (!it || typeof it.id !== 'string') throw badRequest('Each item needs an id');
      if (it.id === g.id) throw badRequest('The @everyone role cannot be moved');
      const r = all.find((x) => x.id === it.id);
      if (!r) throw notFound('Role', ErrorCode.UNKNOWN_ROLE);
      const pos = optInt(it, 'position', 1, 10_000);
      if (pos === undefined) throw invalidField('position', 'position is required');
      if (r.position >= myTop || pos >= myTop) throw forbidden('You can only move roles below your highest role');
      requested.set(r.id, pos);
    }
    // Stable re-sort: requested roles take their new slot; others keep relative order.
    const ordered = [...all].sort((a, b) => {
      const pa = requested.get(a.id) ?? a.position, pb = requested.get(b.id) ?? b.position;
      if (pa !== pb) return pa - pb;
      const ra = requested.has(a.id) ? 1 : 0, rb = requested.has(b.id) ? 1 : 0;
      return ra - rb || a.position - b.position;
    });
    const changed: string[] = [];
    db.tx(() => {
      ordered.forEach((r, i) => {
        if (r.position !== i + 1) {
          db.run('UPDATE roles SET position = ? WHERE id = ?', i + 1, r.id);
          changed.push(r.id);
        }
      });
    });
    // A non-owner must not end up having moved something above themselves.
    for (const id of changed) {
      const r = getRole(g.id, id);
      gw.dispatchToGuild(g.id, 'GUILD_ROLE_UPDATE', { guild_id: g.id, role: role(r) });
      writeAudit(ctx, g.id, me, AuditLogAction.ROLE_UPDATE, id, [{ key: 'position', new_value: r.position }], auditReason(req));
    }
    return rolesOf(db, g.id).map(role);
  });

  app.patch('/guilds/:id/roles/:roleId', async (req) => {
    const me = uid(req);
    const { id, roleId } = req.params as { id: string; roleId: string };
    const { g, perms } = requireGuildPerm(db, id, me, Permissions.MANAGE_ROLES);
    const r = getRole(g.id, roleId);
    const isEveryone = r.id === g.id;
    if (!isEveryone && r.position >= topPosition(db, g, me)) {
      throw forbidden('You can only edit roles below your highest role');
    }
    const b = body(req);
    const next: Partial<Record<keyof RoleRow, string | number>> = {};
    if (!isEveryone) {
      const name = optStr(b, 'name', { min: 1, max: 100 });
      if (name) next.name = name;
      const color = optInt(b, 'color', 0, 0xffffff);
      if (color !== undefined) next.color = color;
      const hoist = optBool(b, 'hoist');
      if (hoist !== undefined) next.hoist = hoist ? 1 : 0;
      const ment = optBool(b, 'mentionable');
      if (ment !== undefined) next.mentionable = ment ? 1 : 0;
    }
    const p = optPerms(b, 'permissions');
    if (p !== undefined) {
      const old = BigInt(r.permissions);
      // you may only toggle bits you hold yourself
      if (((p ^ old) & ~perms) !== 0n) throw forbidden('You cannot grant or revoke permissions you do not have');
      next.permissions = p.toString();
    }
    const keys = Object.keys(next) as (keyof RoleRow)[];
    if (keys.length) {
      db.run(`UPDATE roles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => next[k]!), r.id);
      const changes = diff(r as unknown as Record<string, unknown>, next, keys);
      writeAudit(ctx, g.id, me, AuditLogAction.ROLE_UPDATE, r.id, changes, auditReason(req));
    }
    const out = role(getRole(g.id, r.id));
    gw.dispatchToGuild(g.id, 'GUILD_ROLE_UPDATE', { guild_id: g.id, role: out });
    return out;
  });

  app.delete('/guilds/:id/roles/:roleId', async (req, reply) => {
    const me = uid(req);
    const { id, roleId } = req.params as { id: string; roleId: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_ROLES);
    const r = getRole(g.id, roleId);
    if (r.id === g.id) throw badRequest('The @everyone role cannot be deleted');
    if (r.position >= topPosition(db, g, me)) throw forbidden('You can only delete roles below your highest role');
    const affectedChannels = db.all<{ channel_id: string }>(
      'SELECT channel_id FROM permission_overwrites WHERE target_id = ? AND type = 0', r.id,
    ).map((x) => x.channel_id);
    db.tx(() => {
      db.run('DELETE FROM permission_overwrites WHERE target_id = ? AND type = 0', r.id);
      db.run('DELETE FROM roles WHERE id = ?', r.id);
      db.run('UPDATE roles SET position = position - 1 WHERE guild_id = ? AND position > ?', g.id, r.position);
    });
    writeAudit(ctx, g.id, me, AuditLogAction.ROLE_DELETE, r.id, [{ key: 'name', old_value: r.name }], auditReason(req));
    gw.dispatchToGuild(g.id, 'GUILD_ROLE_DELETE', { guild_id: g.id, role_id: r.id });
    for (const x of db.all<RoleRow>('SELECT * FROM roles WHERE guild_id = ? AND position >= ?', g.id, r.position)) {
      if (x.id !== g.id) gw.dispatchToGuild(g.id, 'GUILD_ROLE_UPDATE', { guild_id: g.id, role: role(x) });
    }
    for (const cid of affectedChannels) {
      const c = getChannelRow(db, cid);
      if (c) gw.dispatchToGuild(g.id, 'CHANNEL_UPDATE', serializeChannel(db, c));
    }
    return reply.status(204).send();
  });
}
