// React hooks over the permission helpers. Selectors return bigint primitives so they stay stable.
import { Permissions, has } from '@huddle/shared';
import { useGuildStore } from '../stores/guilds';
import { useAuthStore } from '../stores/auth';
import { channelPermissionsFor, guildPermissionsFor } from './permissionsCore';

export * from './permissionsCore';
export { Permissions, has };

function usePermDeps(guildId: string | null | undefined) {
  // subscribe to all slices the computation depends on
  useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  useGuildStore((s) => (guildId ? s.roles[guildId] : undefined));
  const me = useAuthStore((s) => s.user?.id);
  useGuildStore((s) => (guildId && me ? s.members[guildId]?.[me] : undefined));
  return me;
}

export function usePermissions(channelId: string | null | undefined): bigint {
  const channel = useGuildStore((s) => (channelId ? s.channels[channelId] : undefined));
  // threads compute from their parent's overwrites
  useGuildStore((s) => (channel?.parent_id ? s.channels[channel.parent_id] : undefined));
  const me = usePermDeps(channel?.guild_id);
  if (!me || !channel) return 0n;
  return channelPermissionsFor(channel, me);
}

export function useGuildPermissions(guildId: string | null | undefined): bigint {
  const me = usePermDeps(guildId);
  if (!me || !guildId) return 0n;
  return guildPermissionsFor(guildId, me);
}

export function useCan(channelId: string | null | undefined, flag: bigint): boolean {
  return has(usePermissions(channelId), flag);
}
export function useCanGuild(guildId: string | null | undefined, flag: bigint): boolean {
  return has(useGuildPermissions(guildId), flag);
}
