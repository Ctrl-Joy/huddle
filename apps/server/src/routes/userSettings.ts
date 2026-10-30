import type { FastifyInstance } from 'fastify';
import { Permissions, RelationshipType, has } from '@huddle/shared';
import type { Ctx } from '../context';
import { invalidField } from '../errors';
import { getChannelRow, serializeMessages, type MessageRow } from '../serializers';
import { channelPerms } from '../services/permissions';
import { saveUserSettings, userSettingsOf, validateUserSettings } from '../services/userSettings';
import { body, isSnowflake, queryInt, queryStr, uid } from './util';

export default function userSettingsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // ---------- settings document (server folders + rail order) ----------

  app.get('/users/@me/settings', async (req) => userSettingsOf(db, uid(req)));

  app.patch('/users/@me/settings', async (req) => {
    const me = uid(req);
    const next = validateUserSettings(db, me, body(req));
    saveUserSettings(db, me, next);
    ctx.gw.dispatchToUser(me, 'USER_SETTINGS_UPDATE', next);
    return next;
  });

  // ---------- inbox: recent mentions ----------

  /**
   * Messages in servers you're still in that mention you directly, via one of your roles, or with
   * @everyone/@here (only stored when the author was allowed to use it). Newest first, paged with `before`.
   * Channels you can no longer read are filtered out; dismissed items never come back.
   */
  app.get('/users/@me/mentions', async (req) => {
    const me = uid(req);
    const q = req.query;
    const limit = queryInt(q, 'limit', 25, 1, 50);
    const before = queryStr(q, 'before');
    const guildId = queryStr(q, 'guild_id');
    const everyone = queryStr(q, 'everyone') !== 'false';
    const roles = queryStr(q, 'roles') !== 'false';
    if (before && !isSnowflake(before)) throw invalidField('before', 'before must be a snowflake');
    if (guildId && !isSnowflake(guildId)) throw invalidField('guild_id', 'guild_id must be a snowflake');

    const readable = new Map<string, boolean>();
    const canRead = (channelId: string) => {
      let ok = readable.get(channelId);
      if (ok === undefined) {
        const c = getChannelRow(db, channelId);
        ok = !!c && has(channelPerms(db, c, me), Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY);
        readable.set(channelId, ok);
      }
      return ok;
    };

    const out: MessageRow[] = [];
    let cursor = before ?? null;
    const batch = Math.min(200, limit * 3);
    // Rows in channels we can't read are skipped, so keep pulling batches until the page is full.
    for (let guard = 0; out.length < limit && guard < 20; guard++) {
      const rows = db.raw.prepare(
        `SELECT m.* FROM messages m
           JOIN members mb ON mb.guild_id = m.guild_id AND mb.user_id = ?
          WHERE m.author_id != ?
            AND (? IS NULL OR m.guild_id = ?)
            AND (? IS NULL OR CAST(m.id AS INTEGER) < CAST(? AS INTEGER))
            AND (
              EXISTS (SELECT 1 FROM message_mentions mm WHERE mm.message_id = m.id AND mm.user_id = ?)
              OR (? = 1 AND m.mention_everyone = 1)
              OR (? = 1 AND EXISTS (
                SELECT 1 FROM json_each(m.mention_roles) j
                  JOIN member_roles mr ON mr.role_id = j.value AND mr.guild_id = m.guild_id AND mr.user_id = ?))
            )
            AND NOT EXISTS (SELECT 1 FROM mention_dismissals d WHERE d.user_id = ? AND d.message_id = m.id)
            AND m.author_id NOT IN (SELECT other_id FROM relationships WHERE user_id = ? AND type = ?)
          ORDER BY CAST(m.id AS INTEGER) DESC LIMIT ?`,
      ).all(
        me, me, guildId ?? null, guildId ?? null, cursor, cursor, me, everyone ? 1 : 0, roles ? 1 : 0, me, me, me,
        RelationshipType.BLOCKED, batch,
      ) as unknown as MessageRow[];
      for (const r of rows) {
        if (canRead(r.channel_id)) out.push(r);
        if (out.length >= limit) break;
      }
      if (rows.length < batch) break;
      cursor = rows[rows.length - 1].id;
    }
    return serializeMessages(db, out, me);
  });

  app.delete('/users/@me/mentions/:messageId', async (req, reply) => {
    const me = uid(req);
    const { messageId } = req.params as { messageId: string };
    if (!isSnowflake(messageId)) throw invalidField('message_id', 'message_id must be a snowflake');
    db.run('INSERT OR IGNORE INTO mention_dismissals (user_id, message_id) VALUES (?, ?)', me, messageId);
    return reply.status(204).send();
  });
}
