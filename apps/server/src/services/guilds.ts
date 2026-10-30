import {
  ChannelType, DEFAULT_EVERYONE_PERMISSIONS, MessageType, type FullGuild, type GuildTemplateId, type Member,
} from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ApiErr, ErrorCode } from '../errors';
import { DEFAULT_LAYOUT, TEMPLATE_LAYOUTS } from './templates';
import {
  emojisOf, getChannelRow, getUserRow, guild, guildChannels, member, membersOf, publicUser, role, rolesOf, type GuildRow,
} from '../serializers';
import { getGuildRow } from './permissions';
import { createMessage } from './messages';

export function fullGuild(ctx: Ctx, guildId: string): FullGuild | null {
  const g = getGuildRow(ctx.db, guildId);
  if (!g) return null;
  const members = membersOf(ctx.db, guildId);
  const presences = members
    .filter((m) => ctx.gw.isOnline(m.user.id))
    .map((m) => ctx.gw.presence(m.user.id))
    .filter((p) => p.status !== 'offline');
  return {
    ...guild(g),
    roles: rolesOf(ctx.db, guildId).map(role),
    channels: guildChannels(ctx.db, guildId),
    members,
    presences,
    voice_states: ctx.voice.inGuild(guildId),
    member_count: members.length,
    emojis: emojisOf(ctx.db, guildId),
  };
}

export function createGuild(ctx: Ctx, ownerId: string, name: string, template?: GuildTemplateId): string {
  const { db } = ctx;
  const gid = ctx.id();
  const ts = now();
  const layout = template ? TEMPLATE_LAYOUTS[template] : DEFAULT_LAYOUT;
  db.tx(() => {
    db.run('INSERT INTO guilds (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)', gid, name, ownerId, ts);
    db.run(
      'INSERT INTO roles (id, guild_id, name, position, permissions) VALUES (?, ?, ?, 0, ?)',
      gid, gid, '@everyone', DEFAULT_EVERYONE_PERMISSIONS.toString(),
    );
    const ins = 'INSERT INTO channels (id, type, guild_id, name, position, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
    let systemChannel: string | null = null;
    layout.forEach((cat, ci) => {
      const catId = ctx.id();
      db.run(ins, catId, ChannelType.GUILD_CATEGORY, gid, cat.name, ci, null, ts);
      const kids = [
        ...(cat.text ?? []).map((n) => [ChannelType.GUILD_TEXT, n] as const),
        ...(cat.voice ?? []).map((n) => [ChannelType.GUILD_VOICE, n] as const),
      ];
      kids.forEach(([type, n], pos) => {
        const cid = ctx.id();
        db.run(ins, cid, type, gid, n, pos, catId, ts);
        if (!systemChannel && type === ChannelType.GUILD_TEXT) systemChannel = cid;
      });
    });
    db.run('UPDATE guilds SET system_channel_id = ? WHERE id = ?', systemChannel, gid);
    db.run('INSERT INTO members (guild_id, user_id, joined_at) VALUES (?, ?, ?)', gid, ownerId, ts);
  });
  const fg = fullGuild(ctx, gid)!;
  ctx.gw.dispatchToUser(ownerId, 'GUILD_CREATE', fg);
  return gid;
}

/** Inserts a member, posts the join system message and dispatches events. */
export function addMember(ctx: Ctx, g: GuildRow, userId: string): Member {
  ctx.db.run('INSERT INTO members (guild_id, user_id, joined_at) VALUES (?, ?, ?)', g.id, userId, now());
  const m = member(ctx.db, g.id, userId)!;
  ctx.gw.dispatchToGuild(g.id, 'GUILD_MEMBER_ADD', m, { exclude: userId });
  ctx.gw.dispatchToUser(userId, 'GUILD_CREATE', fullGuild(ctx, g.id)!);
  if (g.system_channel_id) {
    const c = getChannelRow(ctx.db, g.system_channel_id);
    if (c) createMessage(ctx, { channel: c, authorId: userId, content: '', type: MessageType.GUILD_MEMBER_JOIN });
  }
  // co-members can now see this user's presence and vice versa
  const p = ctx.gw.presence(userId);
  if (p.status !== 'offline') ctx.gw.dispatchToGuild(g.id, 'PRESENCE_UPDATE', p, { exclude: userId });
  return m;
}

/** Self-join via invite or the directory: no-op if already a member, 403 if banned. True if newly added. */
export function joinGuild(ctx: Ctx, g: GuildRow, userId: string): boolean {
  if (ctx.db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', g.id, userId)) return false;
  if (ctx.db.one('SELECT 1 AS x FROM bans WHERE guild_id = ? AND user_id = ?', g.id, userId)) {
    throw new ApiErr(403, 'You are banned from this server', ErrorCode.BANNED);
  }
  addMember(ctx, g, userId);
  return true;
}

/** Removes a member (kick/ban/leave) and notifies everyone. */
export function removeMember(ctx: Ctx, g: GuildRow, userId: string): void {
  const u = getUserRow(ctx.db, userId);
  ctx.voice.removeFromGuild(g.id, userId);
  ctx.db.run('DELETE FROM members WHERE guild_id = ? AND user_id = ?', g.id, userId);
  if (u) ctx.gw.dispatchToGuild(g.id, 'GUILD_MEMBER_REMOVE', { guild_id: g.id, user: publicUser(u) });
  ctx.gw.dispatchToUser(userId, 'GUILD_DELETE', { id: g.id });
}

export function deleteGuild(ctx: Ctx, g: GuildRow): void {
  const ids = ctx.db.all<{ user_id: string }>('SELECT user_id FROM members WHERE guild_id = ?', g.id).map((r) => r.user_id);
  ctx.voice.removeFromGuild(g.id);
  ctx.db.run('DELETE FROM guilds WHERE id = ?', g.id);
  ctx.gw.dispatchToUsers(ids, 'GUILD_DELETE', { id: g.id });
}
