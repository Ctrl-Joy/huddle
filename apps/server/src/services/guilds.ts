import { ChannelType, DEFAULT_EVERYONE_PERMISSIONS, MessageType, type FullGuild, type Member } from '@huddle/shared';
import { now, type Ctx } from '../context';
import {
  getChannelRow, getUserRow, guild, guildChannels, member, membersOf, publicUser, role, rolesOf, type GuildRow,
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
  };
}

export function createGuild(ctx: Ctx, ownerId: string, name: string): string {
  const { db } = ctx;
  const gid = ctx.id();
  const ts = now();
  db.tx(() => {
    db.run('INSERT INTO guilds (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)', gid, name, ownerId, ts);
    db.run(
      'INSERT INTO roles (id, guild_id, name, position, permissions) VALUES (?, ?, ?, 0, ?)',
      gid, gid, '@everyone', DEFAULT_EVERYONE_PERMISSIONS.toString(),
    );
    const textCat = ctx.id(), general = ctx.id(), voiceCat = ctx.id(), voice = ctx.id();
    const ins = 'INSERT INTO channels (id, type, guild_id, name, position, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(ins, textCat, ChannelType.GUILD_CATEGORY, gid, 'Text Channels', 0, null, ts);
    db.run(ins, general, ChannelType.GUILD_TEXT, gid, 'general', 0, textCat, ts);
    db.run(ins, voiceCat, ChannelType.GUILD_CATEGORY, gid, 'Voice Channels', 1, null, ts);
    db.run(ins, voice, ChannelType.GUILD_VOICE, gid, 'General', 0, voiceCat, ts);
    db.run('UPDATE guilds SET system_channel_id = ? WHERE id = ?', general, gid);
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
