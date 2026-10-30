import type { FastifyInstance } from 'fastify';
import { ChannelType, Permissions, has } from '@huddle/shared';
import type { Ctx } from '../context';
import { placeholders } from '../db';
import { invalidField } from '../errors';
import { serializeMessages, type ChannelRow, type MessageRow } from '../serializers';
import { channelPerms, requireGuild } from '../services/permissions';
import { isSnowflake, queryInt, queryStr, uid } from './util';

export default function searchRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/guilds/:id/messages/search', async (req) => {
    const me = uid(req);
    const { g } = requireGuild(db, (req.params as { id: string }).id, me);
    const q = req.query;
    const content = queryStr(q, 'content')?.slice(0, 200);
    const authorId = queryStr(q, 'author_id');
    const channelId = queryStr(q, 'channel_id');
    const limit = queryInt(q, 'limit', 25, 1, 100);
    const offset = queryInt(q, 'offset', 0, 0, 5000);
    if (authorId && !isSnowflake(authorId)) throw invalidField('author_id', 'author_id must be a snowflake');
    if (channelId && !isSnowflake(channelId)) throw invalidField('channel_id', 'channel_id must be a snowflake');

    const readable = db.all<ChannelRow>('SELECT * FROM channels WHERE guild_id = ? AND type = ?', g.id, ChannelType.GUILD_TEXT)
      .filter((c) => has(channelPerms(db, c, me), Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY))
      .map((c) => c.id)
      .filter((id) => !channelId || id === channelId);
    if (!readable.length) return { total_results: 0, messages: [] };

    const where: string[] = [`channel_id IN (${placeholders(readable.length)})`, 'type IN (0, 19)'];
    const params: (string | number)[] = [...readable];
    if (content) {
      where.push("content LIKE ? ESCAPE '\\'");
      params.push('%' + content.replace(/[\\%_]/g, (m) => '\\' + m) + '%');
    }
    if (authorId) {
      where.push('author_id = ?');
      params.push(authorId);
    }
    const sqlWhere = where.join(' AND ');
    const total = (db.raw.prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${sqlWhere}`).get(...params) as { n: number }).n;
    const rows = db.raw.prepare(
      `SELECT * FROM messages WHERE ${sqlWhere} ORDER BY CAST(id AS INTEGER) DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as unknown as MessageRow[];
    return { total_results: total, messages: serializeMessages(db, rows, me) };
  });
}
