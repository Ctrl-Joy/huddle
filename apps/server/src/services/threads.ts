// Threads: child channels (type PUBLIC_THREAD) of a text, announcement or forum channel. Forum posts are threads too.
import { ChannelType, LIMITS, MessageType, Permissions, has, type Channel, type ForumTag } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { invalidField } from '../errors';
import {
  channel as serializeChannel, forumTags, getChannelRow, getMessageRow, message as serializeMessage, type ChannelRow,
} from '../serializers';
import { createMessage } from './messages';

/** Channel types that can hold threads. */
export const THREAD_PARENTS: number[] = [ChannelType.GUILD_TEXT, ChannelType.GUILD_ANNOUNCEMENT, ChannelType.GUILD_FORUM];

/** Allowed auto-archive durations (minutes). */
export const AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080];

/** Serialises a thread; forum posts optionally carry their starter message (for post cards). */
export function threadPayload(ctx: Ctx, t: ChannelRow, viewerId: string | null, withStarter = false): Channel {
  const out = serializeChannel(ctx.db, t);
  if (withStarter) {
    const m = t.starter_message_id ? getMessageRow(ctx.db, t.id, t.starter_message_id) : undefined;
    out.starter_message = m ? serializeMessage(ctx.db, m, viewerId) : null;
  }
  return out;
}

/** THREAD_CREATE / THREAD_UPDATE to everyone who can view the parent channel. */
export function dispatchThread(ctx: Ctx, t: ChannelRow, ev: 'THREAD_CREATE' | 'THREAD_UPDATE', withStarter = false): void {
  const isForumPost = withStarter && getChannelRow(ctx.db, t.parent_id ?? '')?.type === ChannelType.GUILD_FORUM;
  if (!isForumPost) {
    ctx.gw.dispatchToChannel(t, ev, threadPayload(ctx, t, null));
    return;
  }
  ctx.gw.dispatchToChannel(t, ev, (uid) => threadPayload(ctx, t, uid, true));
}

/** Validates a forum post's applied tags against the forum's available tags. */
export function parseAppliedTags(forum: ChannelRow, raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw invalidField('applied_tags', 'applied_tags must be an array of tag ids');
  const known = new Set(forumTags(forum).map((t) => t.id));
  const ids = [...new Set(raw.map(String))];
  if (ids.length > LIMITS.TAGS_PER_POST) throw invalidField('applied_tags', `A post can have at most ${LIMITS.TAGS_PER_POST} tags`);
  for (const id of ids) if (!known.has(id)) throw invalidField('applied_tags', 'Unknown tag');
  return ids;
}

/** Validates a forum's tag list (keeps ids of existing tags, mints ids for new ones). */
export function parseAvailableTags(ctx: Ctx, raw: unknown): ForumTag[] {
  if (!Array.isArray(raw)) throw invalidField('available_tags', 'available_tags must be an array');
  if (raw.length > LIMITS.FORUM_TAGS) throw invalidField('available_tags', `A forum can have at most ${LIMITS.FORUM_TAGS} tags`);
  const seen = new Set<string>();
  return raw.map((t: any) => {
    const name = typeof t?.name === 'string' ? t.name.trim() : '';
    if (!name || name.length > LIMITS.FORUM_TAG_NAME) {
      throw invalidField('available_tags', `Tag names must be 1-${LIMITS.FORUM_TAG_NAME} characters`);
    }
    if (seen.has(name.toLowerCase())) throw invalidField('available_tags', 'Tag names must be unique');
    seen.add(name.toLowerCase());
    const emoji = typeof t?.emoji === 'string' && t.emoji.trim() ? t.emoji.trim().slice(0, 16) : null;
    const id = typeof t?.id === 'string' && /^\d{1,20}$/.test(t.id) ? t.id : ctx.id();
    return { id, name, emoji };
  });
}

export interface CreateThreadOpts {
  parent: ChannelRow;
  ownerId: string;
  name: string;
  /** Message in the parent channel the thread hangs off. */
  starterMessageId?: string | null;
  appliedTags?: string[];
  autoArchiveDuration?: number;
}

/**
 * Creates a thread in a text / announcement channel, dispatches THREAD_CREATE and posts the
 * "started a thread" system message in the parent. Forum posts use createForumPost instead.
 */
export function createThread(ctx: Ctx, o: CreateThreadOpts): ChannelRow {
  const t = insertThread(ctx, o);
  dispatchThread(ctx, t, 'THREAD_CREATE');
  createMessage(ctx, {
    channel: o.parent, authorId: o.ownerId, content: t.name ?? '', type: MessageType.THREAD_CREATED, referenceChannelId: t.id,
  });
  return t;
}

/** Creates a forum post: a thread plus its starter message (which isn't counted as a reply). */
export function createForumPost(
  ctx: Ctx, o: CreateThreadOpts & { content: string },
): ChannelRow {
  const { db } = ctx;
  const t = insertThread(ctx, o);
  const msg = createMessage(ctx, { channel: t, authorId: o.ownerId, content: o.content, threadStarter: true });
  db.run('UPDATE channels SET starter_message_id = ? WHERE id = ?', msg.id, t.id);
  // the forum's own last_message_id tracks the newest post, so "new posts" can show as unread
  db.run('UPDATE channels SET last_message_id = ? WHERE id = ?', msg.id, o.parent.id);
  const fresh = getChannelRow(db, t.id)!;
  dispatchThread(ctx, fresh, 'THREAD_CREATE', true);
  return fresh;
}

function insertThread(ctx: Ctx, o: CreateThreadOpts): ChannelRow {
  const id = ctx.id();
  const ts = now();
  ctx.db.run(
    `INSERT INTO channels (id, type, guild_id, name, parent_id, owner_id, created_at, last_message_at, starter_message_id,
                           applied_tags, auto_archive_duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, ChannelType.PUBLIC_THREAD, o.parent.guild_id, o.name.slice(0, LIMITS.THREAD_NAME), o.parent.id, o.ownerId, ts, ts,
    o.starterMessageId ?? null, JSON.stringify(o.appliedTags ?? []), o.autoArchiveDuration ?? 4320,
  );
  return getChannelRow(ctx.db, id)!;
}

/** Called by createMessage for user messages in a thread: bumps counters, unarchives, emits THREAD_UPDATE. */
export function onThreadMessage(ctx: Ctx, t: ChannelRow, _messageId: string, ts: string): void {
  ctx.db.run(
    `UPDATE channels SET message_count = message_count + 1, last_message_at = ?,
            archived = 0, archive_timestamp = CASE WHEN archived = 1 THEN ? ELSE archive_timestamp END
      WHERE id = ?`,
    ts, ts, t.id,
  );
  dispatchThread(ctx, getChannelRow(ctx.db, t.id)!, 'THREAD_UPDATE');
}

/** Called after a message in a thread is deleted. */
export function onThreadMessageDeleted(ctx: Ctx, t: ChannelRow, messageId: string, type: number): void {
  if (t.starter_message_id === messageId) return; // forum starter: never counted
  if (type !== MessageType.DEFAULT && type !== MessageType.REPLY) return;
  ctx.db.run('UPDATE channels SET message_count = MAX(0, message_count - 1) WHERE id = ?', t.id);
  dispatchThread(ctx, getChannelRow(ctx.db, t.id)!, 'THREAD_UPDATE');
}

/** Thread owner, or MANAGE_THREADS in the parent. */
export function canManageThread(t: ChannelRow, userId: string, perms: bigint): boolean {
  return t.owner_id === userId || has(perms, Permissions.MANAGE_THREADS);
}

export function setArchived(ctx: Ctx, t: ChannelRow, archived: boolean): ChannelRow {
  ctx.db.run('UPDATE channels SET archived = ?, archive_timestamp = ? WHERE id = ?', archived ? 1 : 0, now(), t.id);
  const fresh = getChannelRow(ctx.db, t.id)!;
  dispatchThread(ctx, fresh, 'THREAD_UPDATE');
  return fresh;
}

/** Archives threads idle for longer than their auto_archive_duration. Returns how many were archived. */
export function archiveStaleThreads(ctx: Ctx, at = Date.now()): number {
  const rows = ctx.db.all<ChannelRow>('SELECT * FROM channels WHERE type = ? AND archived = 0', ChannelType.PUBLIC_THREAD);
  let n = 0;
  for (const t of rows) {
    const last = Date.parse(t.last_message_at ?? t.created_at);
    if (Number.isFinite(last) && at - last > t.auto_archive_duration * 60_000) {
      setArchived(ctx, t, true);
      n++;
    }
  }
  return n;
}
