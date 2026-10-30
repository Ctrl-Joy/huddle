import {
  ChannelType, MessageType, customReactionId, type Attachment, type AuditLogEntry, type Ban, type Channel, type CustomEmojiRef,
  type ForumTag, type Guild, type GuildEmoji, type Invite, type Member,
  type Message, type PermissionOverwrite, type PublicUser, type Reaction, type ReadState, type Relationship, type Role,
  type User, type UserGuildSettings,
} from '@huddle/shared';
import { placeholders, type Db } from './db';
import { attachment, messageExtras } from './messageExtras';

// ---------- row types ----------
export interface UserRow {
  id: string; email: string; username: string; display_name: string | null; password_hash: string;
  avatar: string | null; banner_color: string | null; bio: string | null; custom_status: string | null;
  status: string; bot: number; created_at: string; banner: string | null; accent_color: string | null; pronouns: string | null;
}
export interface GuildRow {
  id: string; name: string; icon: string | null; description: string | null; owner_id: string;
  system_channel_id: string | null; created_at: string; discoverable: number; category: string | null;
  banner_color: string | null; banner: string | null; verified: number;
}
export interface MemberRow {
  guild_id: string; user_id: string; nick: string | null; joined_at: string;
  communication_disabled_until: string | null; mute: number; deaf: number;
}
export interface RoleRow {
  id: string; guild_id: string; name: string; color: number; hoist: number; mentionable: number; position: number;
  permissions: string;
}
export interface ChannelRow {
  id: string; type: number; guild_id: string | null; name: string | null; topic: string | null; position: number;
  parent_id: string | null; rate_limit_per_user: number; last_message_id: string | null; owner_id: string | null;
  icon: string | null; created_at: string;
  archived: number; archive_timestamp: string | null; auto_archive_duration: number; message_count: number;
  last_message_at: string | null; starter_message_id: string | null; applied_tags: string; available_tags: string;
}
export interface MessageRow {
  id: string; channel_id: string; guild_id: string | null; author_id: string; content: string; type: number;
  created_at: string; edited_at: string | null; pinned: number; pinned_at: string | null; mention_everyone: number;
  mentions: string; mention_roles: string; reference_id: string | null; reference_channel_id: string | null;
  flags?: number; embeds?: string | null; forward_json?: string | null;
}
export interface OverwriteRow { channel_id: string; target_id: string; type: number; allow: string; deny: string }

// ---------- users ----------
export function publicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar: u.avatar,
    banner_color: u.banner_color,
    bio: u.bio,
    banner: u.banner ?? null,
    accent_color: u.accent_color ?? null,
    pronouns: u.pronouns ?? null,
    bot: !!u.bot,
    created_at: u.created_at,
  };
}

export function privateUser(u: UserRow): User {
  return { ...publicUser(u), email: u.email, custom_status: u.custom_status, status: u.status as User['status'] };
}

export function getUserRow(db: Db, id: string): UserRow | undefined {
  return db.one<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export function usersById(db: Db, ids: Iterable<string>): Map<string, UserRow> {
  const list = [...new Set(ids)];
  const map = new Map<string, UserRow>();
  if (!list.length) return map;
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    for (const u of db.raw.prepare(`SELECT * FROM users WHERE id IN (${placeholders(chunk.length)})`).all(...chunk) as unknown as UserRow[]) {
      map.set(u.id, u);
    }
  }
  return map;
}

const DELETED_USER = (id: string): PublicUser => ({
  id, username: 'deleted-user', display_name: 'Deleted User', avatar: null, banner_color: null, bio: null, banner: null, accent_color: null, pronouns: null, bot: false,
  created_at: new Date(0).toISOString(),
});

// ---------- guilds / roles / members ----------
export function guild(g: GuildRow): Guild {
  return {
    id: g.id, name: g.name, icon: g.icon, description: g.description, owner_id: g.owner_id,
    system_channel_id: g.system_channel_id, created_at: g.created_at,
    discoverable: !!g.discoverable, category: (g.category as Guild['category']) ?? null, banner_color: g.banner_color ?? null,
    banner: g.banner ?? null, verified: !!g.verified,
  };
}

export function role(r: RoleRow): Role {
  return {
    id: r.id, guild_id: r.guild_id, name: r.name, color: r.color, hoist: !!r.hoist, mentionable: !!r.mentionable,
    position: r.position, permissions: String(r.permissions),
  };
}

// ---------- custom emoji ----------
export interface EmojiRow {
  id: string; guild_id: string; name: string; url: string; animated: number; creator_id: string | null; created_at: string;
}

export function emoji(e: EmojiRow): GuildEmoji {
  return {
    id: e.id, guild_id: e.guild_id, name: e.name, url: e.url, animated: !!e.animated, creator_id: e.creator_id,
    created_at: e.created_at,
  };
}

export function emojisOf(db: Db, guildId: string): GuildEmoji[] {
  return db.all<EmojiRow>('SELECT * FROM emojis WHERE guild_id = ? ORDER BY CAST(id AS INTEGER) ASC', guildId).map(emoji);
}

export function emojiRef(e: EmojiRow): CustomEmojiRef {
  return { id: e.id, name: e.name, animated: !!e.animated, url: e.url };
}

export function rolesOf(db: Db, guildId: string): RoleRow[] {
  return db.all<RoleRow>('SELECT * FROM roles WHERE guild_id = ? ORDER BY position ASC, CAST(id AS INTEGER) ASC', guildId);
}

export function memberRoleIds(db: Db, guildId: string, userId: string): string[] {
  return db.all<{ role_id: string }>('SELECT role_id FROM member_roles WHERE guild_id = ? AND user_id = ?', guildId, userId)
    .map((r) => r.role_id);
}

export function memberFrom(m: MemberRow, user: PublicUser, roles: string[]): Member {
  return {
    guild_id: m.guild_id,
    user,
    nick: m.nick,
    roles,
    joined_at: m.joined_at,
    communication_disabled_until: m.communication_disabled_until,
    mute: !!m.mute,
    deaf: !!m.deaf,
  };
}

export function getMemberRow(db: Db, guildId: string, userId: string): MemberRow | undefined {
  return db.one<MemberRow>('SELECT * FROM members WHERE guild_id = ? AND user_id = ?', guildId, userId);
}

export function member(db: Db, guildId: string, userId: string): Member | null {
  const m = getMemberRow(db, guildId, userId);
  if (!m) return null;
  const u = getUserRow(db, userId);
  return memberFrom(m, u ? publicUser(u) : DELETED_USER(userId), memberRoleIds(db, guildId, userId));
}

/** Members of a guild (optionally paginated by user id). */
export function membersOf(db: Db, guildId: string, opts: { limit?: number; after?: string } = {}): Member[] {
  const limit = opts.limit ?? -1;
  const rows = db.all<MemberRow & { role_ids: string | null } & UserRow>(
    `SELECT m.*, u.*, m.guild_id AS guild_id,
            (SELECT GROUP_CONCAT(role_id) FROM member_roles mr WHERE mr.guild_id = m.guild_id AND mr.user_id = m.user_id) AS role_ids
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.guild_id = ? AND CAST(m.user_id AS INTEGER) > CAST(? AS INTEGER)
      ORDER BY CAST(m.user_id AS INTEGER) ASC LIMIT ?`,
    guildId, opts.after ?? '0', limit,
  );
  return rows.map((r) => memberFrom(r, publicUser({ ...r, id: r.user_id }), r.role_ids ? r.role_ids.split(',') : []));
}

// ---------- channels ----------
export function overwrite(o: OverwriteRow): PermissionOverwrite {
  return { id: o.target_id, type: o.type === 1 ? 1 : 0, allow: String(o.allow), deny: String(o.deny) };
}

export function overwritesOf(db: Db, channelId: string): OverwriteRow[] {
  return db.all<OverwriteRow>('SELECT * FROM permission_overwrites WHERE channel_id = ?', channelId);
}

export function isPrivate(c: { type: number }): boolean {
  return c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM;
}

export function recipientIds(db: Db, channelId: string): string[] {
  return db.all<{ user_id: string }>('SELECT user_id FROM channel_recipients WHERE channel_id = ? ORDER BY rowid', channelId)
    .map((r) => r.user_id);
}

export function isThread(c: { type: number }): boolean {
  return c.type === ChannelType.PUBLIC_THREAD;
}

function parseJsonList<T>(raw: string | null | undefined): T[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function forumTags(c: ChannelRow): ForumTag[] {
  return parseJsonList<ForumTag>(c.available_tags);
}

/** Thread-only fields (threads never carry overwrites; they inherit the parent's). */
function threadFields(c: ChannelRow): Partial<Channel> {
  return {
    owner_id: c.owner_id,
    thread_metadata: {
      archived: !!c.archived, archive_timestamp: c.archive_timestamp ?? null, auto_archive_duration: c.auto_archive_duration ?? 4320,
    },
    message_count: c.message_count ?? 0,
    last_message_at: c.last_message_at ?? null,
    starter_message_id: c.starter_message_id ?? null,
    applied_tags: parseJsonList<string>(c.applied_tags),
  };
}

function channelBase(c: ChannelRow, ows: PermissionOverwrite[]): Channel {
  if (isThread(c)) return { ...channelCore(c, []), ...threadFields(c) };
  if (c.type === ChannelType.GUILD_FORUM) return { ...channelCore(c, ows), available_tags: forumTags(c) };
  return channelCore(c, ows);
}

function channelCore(c: ChannelRow, ows: PermissionOverwrite[]): Channel {
  return {
    id: c.id,
    type: c.type as ChannelType,
    guild_id: c.guild_id,
    name: c.name,
    topic: c.topic,
    position: c.position,
    parent_id: c.parent_id,
    rate_limit_per_user: c.rate_limit_per_user,
    last_message_id: c.last_message_id,
    permission_overwrites: ows,
  };
}

/** Serialises a channel. For DMs, `viewerId` is excluded from `recipients`. */
export function channel(db: Db, c: ChannelRow, viewerId?: string | null): Channel {
  if (isPrivate(c)) {
    const ids = recipientIds(db, c.id).filter((id) => id !== viewerId);
    const users = usersById(db, ids);
    return {
      ...channelBase(c, []),
      recipients: ids.map((id) => (users.get(id) ? publicUser(users.get(id)!) : DELETED_USER(id))),
      owner_id: c.owner_id,
      icon: c.icon,
    };
  }
  return channelBase(c, overwritesOf(db, c.id).map(overwrite));
}

export function getChannelRow(db: Db, id: string): ChannelRow | undefined {
  return db.one<ChannelRow>('SELECT * FROM channels WHERE id = ?', id);
}

/** Non-archived threads of a guild (sent with the guild in READY / GUILD_CREATE). */
export function activeThreadsOf(db: Db, guildId: string): Channel[] {
  return db.all<ChannelRow>(
    'SELECT * FROM channels WHERE guild_id = ? AND type = ? AND archived = 0 ORDER BY CAST(id AS INTEGER) ASC',
    guildId, ChannelType.PUBLIC_THREAD,
  ).map((c) => channelBase(c, []));
}

/** Guild channels, excluding threads (see activeThreadsOf). */
export function guildChannels(db: Db, guildId: string): Channel[] {
  const rows = db.all<ChannelRow>(
    'SELECT * FROM channels WHERE guild_id = ? AND type != ? ORDER BY position ASC, CAST(id AS INTEGER) ASC',
    guildId, ChannelType.PUBLIC_THREAD,
  );
  const ows = db.all<OverwriteRow>(
    'SELECT o.* FROM permission_overwrites o JOIN channels c ON c.id = o.channel_id WHERE c.guild_id = ?', guildId,
  );
  const byChannel = new Map<string, PermissionOverwrite[]>();
  for (const o of ows) {
    let l = byChannel.get(o.channel_id);
    if (!l) byChannel.set(o.channel_id, (l = []));
    l.push(overwrite(o));
  }
  return rows.map((c) => channelBase(c, byChannel.get(c.id) ?? []));
}

/** Open DMs / group DMs for a user, with recipients excluding the user. */
export function privateChannelsOf(db: Db, userId: string): Channel[] {
  const rows = db.all<ChannelRow>(
    `SELECT c.* FROM channels c JOIN channel_recipients r ON r.channel_id = c.id
      WHERE r.user_id = ? AND r.closed = 0 ORDER BY CAST(COALESCE(c.last_message_id, c.id) AS INTEGER) DESC`,
    userId,
  );
  return rows.map((c) => channel(db, c, userId));
}

// ---------- messages ----------
export function serializeMessages(db: Db, rows: MessageRow[], viewerId: string | null, withReferenced = true): Message[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = placeholders(ids.length);

  const authors = usersById(db, rows.map((r) => r.author_id));

  // member info (nick + roles) per (guild, author)
  const memberInfo = new Map<string, { nick: string | null; roles: string[] }>();
  const guildAuthors = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.guild_id) continue;
    let s = guildAuthors.get(r.guild_id);
    if (!s) guildAuthors.set(r.guild_id, (s = new Set()));
    s.add(r.author_id);
  }
  for (const [gid, set] of guildAuthors) {
    const uids = [...set];
    const mrows = db.raw.prepare(
      `SELECT m.user_id, m.nick,
              (SELECT GROUP_CONCAT(role_id) FROM member_roles mr WHERE mr.guild_id = m.guild_id AND mr.user_id = m.user_id) AS role_ids
         FROM members m WHERE m.guild_id = ? AND m.user_id IN (${placeholders(uids.length)})`,
    ).all(gid, ...uids) as unknown as { user_id: string; nick: string | null; role_ids: string | null }[];
    for (const m of mrows) memberInfo.set(`${gid}:${m.user_id}`, { nick: m.nick, roles: m.role_ids ? m.role_ids.split(',') : [] });
  }

  const atts = new Map<string, Attachment[]>();
  const snapshotAtts = new Map<string, Attachment[]>(); // forwarded copies (shown inside MessageSnapshot)
  for (const a of db.raw.prepare(`SELECT * FROM attachments WHERE message_id IN (${ph}) ORDER BY rowid`).all(...ids) as any[]) {
    const into = a.snapshot ? snapshotAtts : atts;
    let l = into.get(a.message_id);
    if (!l) into.set(a.message_id, (l = []));
    l.push(attachment(a));
  }
  const extras = messageExtras(db, rows, viewerId, snapshotAtts);

  const reacts = new Map<string, Map<string, Reaction>>();
  for (const r of db.raw.prepare(
    `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${ph}) ORDER BY created_at ASC, rowid ASC`,
  ).all(...ids) as unknown as { message_id: string; emoji: string; user_id: string }[]) {
    let m = reacts.get(r.message_id);
    if (!m) reacts.set(r.message_id, (m = new Map()));
    let agg = m.get(r.emoji);
    if (!agg) m.set(r.emoji, (agg = { emoji: r.emoji, count: 0, me: false, user_ids: [] }));
    agg.count++;
    if (r.user_id === viewerId) agg.me = true;
    if (agg.user_ids!.length < 25) agg.user_ids!.push(r.user_id);
  }
  // attach custom emoji info ("c:<id>" keys); reactions whose emoji was deleted are dropped
  const customIds = new Set<string>();
  for (const m of reacts.values()) for (const k of m.keys()) { const id = customReactionId(k); if (id) customIds.add(id); }
  if (customIds.size) {
    const list = [...customIds];
    const found = new Map((db.raw.prepare(`SELECT * FROM emojis WHERE id IN (${placeholders(list.length)})`).all(...list) as unknown as EmojiRow[])
      .map((e) => [e.id, e]));
    for (const m of reacts.values()) {
      for (const [k, agg] of m) {
        const id = customReactionId(k);
        if (!id) continue;
        const e = found.get(id);
        if (e) agg.custom_emoji = emojiRef(e);
        else m.delete(k);
      }
    }
  }

  const referenced = new Map<string, Message>();
  if (withReferenced) {
    const refIds = [...new Set(rows.map((r) => r.reference_id).filter((x): x is string => !!x))];
    if (refIds.length) {
      const refRows = db.raw.prepare(`SELECT * FROM messages WHERE id IN (${placeholders(refIds.length)})`).all(...refIds) as unknown as MessageRow[];
      for (const m of serializeMessages(db, refRows, viewerId, false)) referenced.set(m.id, m);
    }
  }

  // threads started from these messages, and the threads named by THREAD_CREATED system messages
  const threads = new Map<string, Channel>();
  const threadRows = db.raw.prepare(
    `SELECT * FROM channels WHERE type = ${ChannelType.PUBLIC_THREAD} AND (starter_message_id IN (${ph}) OR id IN (${ph}))`,
  ).all(...ids, ...rows.map((r) => (r.type === MessageType.THREAD_CREATED ? r.reference_channel_id ?? '' : ''))) as unknown as ChannelRow[];
  const threadById = new Map(threadRows.map((t) => [t.id, channelBase(t, [])]));
  for (const t of threadRows) if (t.starter_message_id) threads.set(t.starter_message_id, threadById.get(t.id)!);

  return rows.map((r): Message => {
    const author = authors.get(r.author_id);
    const isThreadCreated = r.type === MessageType.THREAD_CREATED;
    // a forum post's starter message lives inside its thread: no chip there
    const started = threads.get(r.id);
    const thread = isThreadCreated
      ? threadById.get(r.reference_channel_id ?? '') ?? null
      : started && started.id !== r.channel_id ? started : null;
    return {
      id: r.id,
      channel_id: r.channel_id,
      guild_id: r.guild_id,
      author: author ? publicUser(author) : DELETED_USER(r.author_id),
      member: r.guild_id ? memberInfo.get(`${r.guild_id}:${r.author_id}`) ?? null : null,
      content: r.content,
      type: r.type,
      created_at: r.created_at,
      edited_at: r.edited_at,
      pinned: !!r.pinned,
      mention_everyone: !!r.mention_everyone,
      mentions: JSON.parse(r.mentions || '[]'),
      mention_roles: JSON.parse(r.mention_roles || '[]'),
      attachments: atts.get(r.id) ?? [],
      reactions: [...(reacts.get(r.id)?.values() ?? [])],
      message_reference: r.reference_id ? { message_id: r.reference_id, channel_id: r.reference_channel_id ?? r.channel_id } : null,
      referenced_message: r.reference_id ? referenced.get(r.reference_id) ?? null : null,
      ...extras(r),
      ...(thread ? { thread } : {}),
    };
  });
}

export function getMessageRow(db: Db, channelId: string, id: string): MessageRow | undefined {
  return db.one<MessageRow>('SELECT * FROM messages WHERE id = ? AND channel_id = ?', id, channelId);
}

export function message(db: Db, row: MessageRow, viewerId: string | null): Message {
  return serializeMessages(db, [row], viewerId)[0];
}

// ---------- misc ----------
export function readState(r: { channel_id: string; last_read_message_id: string | null; mention_count: number }): ReadState {
  return { channel_id: r.channel_id, last_read_message_id: r.last_read_message_id, mention_count: r.mention_count };
}

export function guildSettings(db: Db, userId: string, guildId: string): UserGuildSettings {
  const r = db.one<any>('SELECT * FROM user_guild_settings WHERE user_id = ? AND guild_id = ?', userId, guildId);
  if (!r) return { guild_id: guildId, muted: false, message_notifications: 0, suppress_everyone: false, channel_overrides: [] };
  return {
    guild_id: guildId,
    muted: !!r.muted,
    message_notifications: r.message_notifications,
    suppress_everyone: !!r.suppress_everyone,
    channel_overrides: JSON.parse(r.channel_overrides || '[]'),
  };
}

export function relationshipsOf(db: Db, userId: string): Relationship[] {
  const rows = db.all<{ other_id: string; type: number; since: string }>(
    'SELECT other_id, type, since FROM relationships WHERE user_id = ?', userId,
  );
  const users = usersById(db, rows.map((r) => r.other_id));
  return rows.flatMap((r) => {
    const u = users.get(r.other_id);
    return u ? [{ id: r.other_id, type: r.type, user: publicUser(u), since: r.since }] : [];
  });
}

export function relationship(db: Db, userId: string, otherId: string): Relationship | null {
  const r = db.one<{ type: number; since: string }>('SELECT type, since FROM relationships WHERE user_id = ? AND other_id = ?', userId, otherId);
  const u = getUserRow(db, otherId);
  if (!r || !u) return null;
  return { id: otherId, type: r.type, user: publicUser(u), since: r.since };
}

export interface InviteRow {
  code: string; guild_id: string; channel_id: string; inviter_id: string | null; uses: number; max_uses: number;
  max_age: number; created_at: string; expires_at: string | null;
}

export function invite(db: Db, i: InviteRow, withCounts = false, onlineCount?: (ids: string[]) => number): Invite {
  const g = db.one<GuildRow>('SELECT * FROM guilds WHERE id = ?', i.guild_id)!;
  const c = getChannelRow(db, i.channel_id);
  const inviter = i.inviter_id ? getUserRow(db, i.inviter_id) : undefined;
  const out: Invite = {
    code: i.code,
    guild: { id: g.id, name: g.name, icon: g.icon, description: g.description },
    channel: { id: i.channel_id, name: c?.name ?? null, type: (c?.type ?? 0) as ChannelType },
    inviter: inviter ? publicUser(inviter) : null,
    uses: i.uses,
    max_uses: i.max_uses,
    max_age: i.max_age,
    created_at: i.created_at,
    expires_at: i.expires_at,
  };
  if (withCounts) {
    const ids = db.all<{ user_id: string }>('SELECT user_id FROM members WHERE guild_id = ?', g.id).map((r) => r.user_id);
    out.approximate_member_count = ids.length;
    out.approximate_presence_count = onlineCount ? onlineCount(ids) : 0;
  }
  return out;
}

export function ban(db: Db, r: { user_id: string; reason: string | null }): Ban {
  const u = getUserRow(db, r.user_id);
  return { user: u ? publicUser(u) : DELETED_USER(r.user_id), reason: r.reason };
}

export function auditEntry(r: any): AuditLogEntry {
  return {
    id: r.id, guild_id: r.guild_id, user_id: r.user_id, target_id: r.target_id, action_type: r.action_type,
    changes: JSON.parse(r.changes || '[]'), reason: r.reason, created_at: r.created_at,
  };
}
