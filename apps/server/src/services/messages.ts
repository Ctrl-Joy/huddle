import { MessageType, Permissions, has, parseMentions, type Message } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { placeholders } from '../db';
import {
  channel as serializeChannel, getMessageRow, isPrivate, isThread, message as serializeMessage, recipientIds,
  type ChannelRow, type MessageRow,
} from '../serializers';
import { channelPerms, channelPermsBulk, getGuildRow } from './permissions';
import { onThreadMessage } from './threads';
import { insertPoll, type PollInput } from './polls';
import type { ForwardData } from '../messageExtras';

export interface NewAttachment {
  id: string; filename: string; size: number; content_type: string; url: string; path: string;
  width: number | null; height: number | null;
  flags?: number; duration_secs?: number | null; waveform?: string | null;
  /** Forwarded copy: reuses another message's file (shown inside the snapshot). */
  snapshot?: boolean;
}

export interface CreateMessageOpts {
  channel: ChannelRow;
  authorId: string;
  content: string;
  type?: MessageType;
  referenceId?: string | null;
  attachments?: NewAttachment[];
  nonce?: string | null;
  id?: string;
  /** THREAD_CREATED system messages: the thread that was started (stored as reference_channel_id). */
  referenceChannelId?: string | null;
  /** A forum post's first message: doesn't count towards the thread's message_count / activity events. */
  threadStarter?: boolean;
  /** MessageFlags bits. */
  flags?: number;
  poll?: PollInput;
  forward?: ForwardData;
}

export interface ResolvedMentions { users: string[]; roles: string[]; everyone: boolean }

/** Validates parsed mentions against the channel and the author's permissions. */
export function resolveMentions(ctx: Ctx, c: ChannelRow, authorId: string, content: string, replyAuthor?: string | null): ResolvedMentions {
  const { db } = ctx;
  const parsed = parseMentions(content);
  let users: string[] = [];
  let roles: string[] = [];
  let everyone = false;
  if (isPrivate(c)) {
    const recips = new Set(recipientIds(db, c.id));
    users = parsed.users.filter((u) => recips.has(u));
    if (replyAuthor && replyAuthor !== authorId && recips.has(replyAuthor) && !users.includes(replyAuthor)) users.push(replyAuthor);
  } else if (c.guild_id) {
    const perms = channelPerms(db, c, authorId);
    const canEveryone = has(perms, Permissions.MENTION_EVERYONE);
    if (parsed.users.length) {
      const rows = db.raw.prepare(
        `SELECT user_id FROM members WHERE guild_id = ? AND user_id IN (${placeholders(parsed.users.length)})`,
      ).all(c.guild_id, ...parsed.users) as unknown as { user_id: string }[];
      const ok = new Set(rows.map((r) => r.user_id));
      users = parsed.users.filter((u) => ok.has(u));
    }
    if (replyAuthor && replyAuthor !== authorId && !users.includes(replyAuthor) &&
        db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', c.guild_id, replyAuthor)) {
      users.push(replyAuthor);
    }
    if (parsed.roles.length) {
      const rows = db.raw.prepare(
        `SELECT id, mentionable FROM roles WHERE guild_id = ? AND id != ? AND id IN (${placeholders(parsed.roles.length)})`,
      ).all(c.guild_id, c.guild_id, ...parsed.roles) as unknown as { id: string; mentionable: number }[];
      const ok = new Set(rows.filter((r) => r.mentionable || canEveryone).map((r) => r.id));
      roles = parsed.roles.filter((r) => ok.has(r));
    }
    everyone = parsed.everyone && canEveryone;
  }
  return { users, roles, everyone };
}

/** Inserts a message (user or system), updates read states and fans out MESSAGE_CREATE. */
export function createMessage(ctx: Ctx, o: CreateMessageOpts): Message {
  const { db } = ctx;
  const c = o.channel;
  const type = o.type ?? MessageType.DEFAULT;
  const id = o.id ?? ctx.id();
  const ts = now();
  const isUserMessage = type === MessageType.DEFAULT || type === MessageType.REPLY;

  let replyAuthor: string | null = null;
  if (o.referenceId) {
    const ref = getMessageRow(db, c.id, o.referenceId);
    replyAuthor = ref?.author_id ?? null;
  }
  const mentions: ResolvedMentions = isUserMessage
    ? resolveMentions(ctx, c, o.authorId, o.content, type === MessageType.REPLY ? replyAuthor : null)
    : { users: [], roles: [], everyone: false };

  // Who can see it (guild: VIEW_CHANNEL holders; DM: recipients)
  let audience: string[];
  if (isPrivate(c)) audience = recipientIds(db, c.id);
  else audience = [...channelPermsBulk(db, c)].filter(([, p]) => has(p, Permissions.VIEW_CHANNEL)).map(([u]) => u);
  const audienceSet = new Set(audience);

  // Mention targets for read-state badges
  const targets = new Set<string>();
  if (isUserMessage) {
    if (isPrivate(c)) for (const u of audience) targets.add(u);
    else {
      if (mentions.everyone) for (const u of audience) targets.add(u);
      for (const u of mentions.users) if (audienceSet.has(u)) targets.add(u);
      if (mentions.roles.length) {
        const rows = db.raw.prepare(
          `SELECT DISTINCT user_id FROM member_roles WHERE role_id IN (${placeholders(mentions.roles.length)})`,
        ).all(...mentions.roles) as unknown as { user_id: string }[];
        for (const r of rows) if (audienceSet.has(r.user_id)) targets.add(r.user_id);
      }
    }
    targets.delete(o.authorId);
  }

  const reopened: string[] = [];
  db.tx(() => {
    db.run(
      `INSERT INTO messages (id, channel_id, guild_id, author_id, content, type, created_at, mention_everyone, mentions,
                             mention_roles, reference_id, reference_channel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, c.id, c.guild_id, o.authorId, o.content, type, ts, mentions.everyone ? 1 : 0, JSON.stringify(mentions.users),
      JSON.stringify(mentions.roles), o.referenceId ?? null, o.referenceChannelId ?? (o.referenceId ? c.id : null),
    );
    for (const u of mentions.users) db.run('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)', id, u);
    for (const a of o.attachments ?? []) {
      db.run(
        `INSERT INTO attachments (id, message_id, filename, size, content_type, url, path, width, height, flags, duration_secs, waveform, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.id, id, a.filename, a.size, a.content_type, a.url, a.path, a.width, a.height,
        a.flags ?? 0, a.duration_secs ?? null, a.waveform ?? null, a.snapshot ? 1 : 0,
      );
    }
    if (o.flags || o.forward) {
      db.run('UPDATE messages SET flags = ?, forward_json = ? WHERE id = ?', o.flags ?? 0, o.forward ? JSON.stringify(o.forward) : null, id);
    }
    if (o.poll) insertPoll(ctx, id, o.poll);
    db.run('UPDATE channels SET last_message_id = ? WHERE id = ?', id, c.id);
    for (const u of targets) {
      db.run(
        `INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count) VALUES (?, ?, NULL, 1)
         ON CONFLICT (user_id, channel_id) DO UPDATE SET mention_count = mention_count + 1`,
        u, c.id,
      );
    }
    if (isUserMessage) {
      db.run(
        `INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count) VALUES (?, ?, ?, 0)
         ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, mention_count = 0`,
        o.authorId, c.id, id,
      );
    }
    if (isPrivate(c)) {
      for (const r of db.all<{ user_id: string }>('SELECT user_id FROM channel_recipients WHERE channel_id = ? AND closed = 1', c.id)) {
        reopened.push(r.user_id);
      }
      if (reopened.length) db.run('UPDATE channel_recipients SET closed = 0 WHERE channel_id = ?', c.id);
    }
  });

  if (isThread(c) && isUserMessage && !o.threadStarter) onThreadMessage(ctx, c, id, ts);

  const row = getMessageRow(db, c.id, id)!;
  const msg = serializeMessage(db, row, o.authorId);

  if (reopened.length) {
    const fresh = db.one<ChannelRow>('SELECT * FROM channels WHERE id = ?', c.id)!;
    ctx.gw.dispatchToUsers(reopened, 'CHANNEL_CREATE', (uid) => serializeChannel(db, fresh, uid));
  }
  ctx.gw.dispatchToUsers(audience, 'MESSAGE_CREATE', (uid) => (uid === o.authorId && o.nonce ? { ...msg, nonce: o.nonce } : msg));
  if (isUserMessage && o.content) ctx.previews?.enqueue(c, id, o.content);
  return o.nonce ? { ...msg, nonce: o.nonce } : msg;
}

/** Serialise + dispatch MESSAGE_UPDATE with per-viewer `me` flags on reactions. */
export function dispatchMessageUpdate(ctx: Ctx, c: ChannelRow, row: MessageRow): void {
  ctx.gw.dispatchToChannel(c, 'MESSAGE_UPDATE', (uid) => serializeMessage(ctx.db, row, uid));
}

export function guildOf(ctx: Ctx, c: ChannelRow) {
  return c.guild_id ? getGuildRow(ctx.db, c.guild_id) : undefined;
}
