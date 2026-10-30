// Non-hook permission helpers built on the shared computePermissions.
import { ALL_PERMISSIONS, ChannelType, Permissions, computeBasePermissions, computePermissions, has, highestRolePosition, type Channel } from '@huddle/shared';
import { useGuildStore } from '../stores/guilds';
import { useAuthStore } from '../stores/auth';

export function guildPermissionsFor(guildId: string, userId: string): bigint {
  const s = useGuildStore.getState();
  const g = s.guilds[guildId];
  if (!g) return 0n;
  const m = s.members[guildId]?.[userId];
  return computeBasePermissions({
    guildId, ownerId: g.owner_id, userId,
    roles: Object.values(s.roles[guildId] || {}),
    memberRoleIds: m?.roles || [],
    communicationDisabledUntil: m?.communication_disabled_until,
  });
}

export function channelPermissionsFor(channel: Channel | undefined, userId: string): bigint {
  if (!channel) return 0n;
  if (!channel.guild_id) {
    // DMs: everything except guild-only perms
    return Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.ADD_REACTIONS | Permissions.ATTACH_FILES
      | Permissions.EMBED_LINKS | Permissions.READ_MESSAGE_HISTORY | Permissions.CONNECT | Permissions.SPEAK
      | Permissions.VIDEO | Permissions.STREAM;
  }
  const s = useGuildStore.getState();
  const g = s.guilds[channel.guild_id];
  if (!g) return 0n;
  const m = s.members[channel.guild_id]?.[userId];
  let overwrites = channel.permission_overwrites || [];
  // channels without their own overwrites don't inherit here (sync is explicit server-side)
  let perms = computePermissions({
    guildId: channel.guild_id, ownerId: g.owner_id, userId,
    roles: Object.values(s.roles[channel.guild_id] || {}),
    memberRoleIds: m?.roles || [],
    communicationDisabledUntil: m?.communication_disabled_until,
  }, overwrites);
  if (perms === ALL_PERMISSIONS) return perms;
  if (channel.type === ChannelType.GUILD_VOICE && !has(perms, Permissions.CONNECT)) {
    perms &= ~(Permissions.SPEAK | Permissions.VIDEO | Permissions.STREAM | Permissions.MUTE_MEMBERS
      | Permissions.DEAFEN_MEMBERS | Permissions.MOVE_MEMBERS | Permissions.PRIORITY_SPEAKER);
  }
  return perms;
}

export function channelVisible(channel: Channel | undefined, userId: string): boolean {
  if (!channel) return false;
  if (!channel.guild_id) return true;
  return has(channelPermissionsFor(channel, userId), Permissions.VIEW_CHANNEL);
}

export function canChannel(channelId: string | undefined, flag: bigint): boolean {
  const me = useAuthStore.getState().user?.id;
  if (!me || !channelId) return false;
  return has(channelPermissionsFor(useGuildStore.getState().channels[channelId], me), flag);
}

export function canGuild(guildId: string | null | undefined, flag: bigint): boolean {
  const me = useAuthStore.getState().user?.id;
  if (!me || !guildId) return false;
  return has(guildPermissionsFor(guildId, me), flag);
}

export function myHighestPosition(guildId: string): number {
  const s = useGuildStore.getState();
  const me = useAuthStore.getState().user?.id || '';
  const g = s.guilds[guildId];
  if (g?.owner_id === me) return Number.MAX_SAFE_INTEGER;
  return highestRolePosition(Object.values(s.roles[guildId] || {}), s.members[guildId]?.[me]?.roles || []);
}

/** Can I act (kick/ban/nick/roles) on target? Requires strictly higher highest-role, owner can't be targeted. */
export function canActOn(guildId: string, targetId: string): boolean {
  const s = useGuildStore.getState();
  const g = s.guilds[guildId];
  const me = useAuthStore.getState().user?.id;
  if (!g || !me) return false;
  if (targetId === g.owner_id) return false;
  if (me === g.owner_id) return true;
  const targetPos = highestRolePosition(Object.values(s.roles[guildId] || {}), s.members[guildId]?.[targetId]?.roles || []);
  return myHighestPosition(guildId) > targetPos;
}
