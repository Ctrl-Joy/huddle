import type { FastifyInstance } from 'fastify';
import { Permissions } from '@huddle/shared';
import type { Ctx } from '../context';
import { auditEntry, publicUser, usersById } from '../serializers';
import { requireGuildPerm } from '../services/permissions';
import { isSnowflake, queryInt, queryStr, uid } from './util';
import { invalidField } from '../errors';

export default function auditRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/guilds/:id/audit-logs', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.VIEW_AUDIT_LOG);
    const limit = queryInt(req.query, 'limit', 50, 1, 100);
    const before = queryStr(req.query, 'before');
    const userId = queryStr(req.query, 'user_id');
    const actionRaw = queryStr(req.query, 'action_type');
    if (before && !isSnowflake(before)) throw invalidField('before', 'before must be a snowflake');
    const action = actionRaw === undefined ? null : Number(actionRaw);
    if (action !== null && !Number.isInteger(action)) throw invalidField('action_type', 'action_type must be an integer');

    const rows = db.all<any>(
      `SELECT * FROM audit_log
        WHERE guild_id = ?
          AND (? IS NULL OR CAST(id AS INTEGER) < CAST(? AS INTEGER))
          AND (? IS NULL OR user_id = ?)
          AND (? IS NULL OR action_type = ?)
        ORDER BY CAST(id AS INTEGER) DESC LIMIT ?`,
      g.id, before ?? null, before ?? null, userId ?? null, userId ?? null, action, action, limit,
    );
    const entries = rows.map(auditEntry);
    const ids = new Set<string>();
    for (const e of entries) {
      ids.add(e.user_id);
      if (e.target_id) ids.add(e.target_id);
    }
    const users = [...usersById(db, ids).values()].map(publicUser);
    return { audit_log_entries: entries, users };
  });
}
