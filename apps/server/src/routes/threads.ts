import type { FastifyInstance } from 'fastify';
import { ChannelType, LIMITS, MessageType, Permissions, type ThreadListResponse } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import { getChannelRow, getMessageRow, type ChannelRow } from '../serializers';
import { requireChannel, requirePerm } from '../services/permissions';
import { dispatchMessageUpdate } from '../services/messages';
import {
  AUTO_ARCHIVE_DURATIONS, THREAD_PARENTS, canManageThread, createForumPost, createThread, dispatchThread,
  parseAppliedTags, setArchived, threadPayload,
} from '../services/threads';
import { body, optBool, optInt, optStr, queryInt, queryStr, reqStr, uid } from './util';

const optDuration = (b: Record<string, any>): number | undefined => {
  const d = optInt(b, 'auto_archive_duration', 60, 10080);
  if (d !== undefined && !AUTO_ARCHIVE_DURATIONS.includes(d)) {
    throw invalidField('auto_archive_duration', `auto_archive_duration must be one of ${AUTO_ARCHIVE_DURATIONS.join(', ')}`);
  }
  return d;
};

export default function threadRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  const requireParent = (id: string, me: string) => {
    const r = requireChannel(db, id, me);
    if (!THREAD_PARENTS.includes(r.c.type)) throw badRequest('This channel cannot have threads');
    return r;
  };

  // ---------- list ----------

  app.get('/channels/:id/threads', async (req): Promise<ThreadListResponse> => {
    const me = uid(req);
    const { c, perms } = requireParent((req.params as { id: string }).id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const q = req.query;
    const archived = queryStr(q, 'archived') ?? 'false'; // 'false' | 'true' | 'all'
    const search = queryStr(q, 'q')?.trim().slice(0, 100);
    const tag = queryStr(q, 'tag');
    const sort = queryStr(q, 'sort') === 'created' ? 'created' : 'activity';
    const limit = queryInt(q, 'limit', 50, 1, 100);
    const offset = queryInt(q, 'offset', 0, 0, 100_000);

    const where = ['parent_id = ?', 'type = ?'];
    const params: (string | number)[] = [c.id, ChannelType.PUBLIC_THREAD];
    if (archived === 'true') where.push('archived = 1');
    else if (archived !== 'all') where.push('archived = 0');
    if (search) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${search.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
    }
    if (tag) {
      // applied_tags is a JSON array of id strings
      where.push('applied_tags LIKE ?');
      params.push(`%"${tag.replace(/[^\d]/g, '')}"%`);
    }
    const order = sort === 'created'
      ? 'CAST(id AS INTEGER) DESC'
      : 'CAST(COALESCE(last_message_id, id) AS INTEGER) DESC';
    const rows = db.all<ChannelRow>(
      `SELECT * FROM channels WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params, limit + 1, offset,
    );
    const forum = c.type === ChannelType.GUILD_FORUM;
    return {
      threads: rows.slice(0, limit).map((t) => threadPayload(ctx, t, me, forum)),
      has_more: rows.length > limit,
    };
  });

  // ---------- create ----------

  /** New thread in a text / announcement channel, or a new forum post. */
  app.post('/channels/:id/threads', async (req) => {
    const me = uid(req);
    const { c, perms } = requireParent((req.params as { id: string }).id, me);
    const b = body(req);
    const name = reqStr(b, 'name', { min: 1, max: LIMITS.THREAD_NAME });
    const autoArchiveDuration = optDuration(b);

    if (c.type === ChannelType.GUILD_FORUM) {
      // posting in a forum is governed by SEND_MESSAGES on the forum
      requirePerm(perms, Permissions.SEND_MESSAGES);
      const content = typeof b.message?.content === 'string' ? b.message.content : '';
      if (!content.trim()) throw invalidField('message', 'A post needs a message');
      if (content.length > LIMITS.MESSAGE_LENGTH) {
        throw invalidField('message', `Message must be ${LIMITS.MESSAGE_LENGTH} characters or fewer`);
      }
      const appliedTags = parseAppliedTags(c, b.applied_tags);
      const t = createForumPost(ctx, { parent: c, ownerId: me, name, appliedTags, autoArchiveDuration, content });
      return threadPayload(ctx, t, me, true);
    }

    requirePerm(perms, Permissions.CREATE_THREADS);
    const t = createThread(ctx, { parent: c, ownerId: me, name, autoArchiveDuration });
    return threadPayload(ctx, t, me);
  });

  /** Thread hanging off an existing message. */
  app.post('/channels/:id/messages/:mid/threads', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireParent(id, me);
    if (c.type === ChannelType.GUILD_FORUM) throw badRequest('Use POST /channels/:id/threads to create a forum post');
    requirePerm(perms, Permissions.CREATE_THREADS, Permissions.READ_MESSAGE_HISTORY);
    const m = getMessageRow(db, c.id, mid);
    if (!m) throw notFound('Message', ErrorCode.UNKNOWN_MESSAGE);
    if (m.type !== MessageType.DEFAULT && m.type !== MessageType.REPLY) throw badRequest('Cannot start a thread from a system message');
    if (db.one('SELECT 1 AS x FROM channels WHERE starter_message_id = ? AND parent_id = ?', m.id, c.id)) {
      throw badRequest('This message already has a thread');
    }
    const b = body(req);
    const name = optStr(b, 'name', { max: LIMITS.THREAD_NAME }) || m.content.split('\n')[0].trim().slice(0, LIMITS.THREAD_NAME) || 'New Thread';
    const t = createThread(ctx, { parent: c, ownerId: me, name, starterMessageId: m.id, autoArchiveDuration: optDuration(b) });
    // the starter message now carries its thread chip
    dispatchMessageUpdate(ctx, c, getMessageRow(db, c.id, m.id)!);
    return threadPayload(ctx, t, me);
  });
}

/**
 * PATCH /channels/:id for threads (called from channel routes): name / archived / applied_tags / auto_archive_duration.
 * Allowed for the thread owner or MANAGE_THREADS holders.
 */
export function updateThread(ctx: Ctx, t: ChannelRow, me: string, perms: bigint, b: Record<string, any>): ChannelRow {
  const { db } = ctx;
  if (!canManageThread(t, me, perms)) throw forbidden();
  const parent = getChannelRow(db, t.parent_id ?? '');
  if (!parent) throw notFound('Channel', ErrorCode.UNKNOWN_CHANNEL);
  const next: Record<string, string | number> = {};
  const name = optStr(b, 'name', { min: 1, max: LIMITS.THREAD_NAME });
  if (name) next.name = name;
  const d = optDuration(b);
  if (d !== undefined) next.auto_archive_duration = d;
  if (b.applied_tags !== undefined) {
    if (parent.type !== ChannelType.GUILD_FORUM) throw invalidField('applied_tags', 'Only forum posts have tags');
    next.applied_tags = JSON.stringify(parseAppliedTags(parent, b.applied_tags));
  }
  const keys = Object.keys(next);
  if (keys.length) db.run(`UPDATE channels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => next[k]), t.id);
  const archived = optBool(b, 'archived');
  if (archived !== undefined && archived !== !!t.archived) return setArchived(ctx, getChannelRow(db, t.id)!, archived);
  const fresh = getChannelRow(db, t.id)!;
  if (keys.length) dispatchThread(ctx, fresh, 'THREAD_UPDATE');
  return fresh;
}

/** DELETE /channels/:id for threads: owner or MANAGE_THREADS. Messages go with it (FK cascade). */
export function deleteThread(ctx: Ctx, t: ChannelRow, me: string, perms: bigint): void {
  if (!canManageThread(t, me, perms)) throw forbidden();
  const parent = getChannelRow(ctx.db, t.parent_id ?? '');
  // audience = parent viewers; compute before the row disappears
  const viewers = parent ? ctx.gw.viewers(parent) : [];
  ctx.db.run('DELETE FROM channels WHERE id = ?', t.id);
  ctx.gw.dispatchToUsers(viewers, 'THREAD_DELETE', { id: t.id, guild_id: t.guild_id!, parent_id: t.parent_id ?? '' });
  if (parent && t.starter_message_id) {
    const starter = getMessageRow(ctx.db, parent.id, t.starter_message_id);
    if (starter) dispatchMessageUpdate(ctx, parent, starter);
  }
}
