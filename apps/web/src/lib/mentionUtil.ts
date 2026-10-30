import { ChannelType, type Message } from '@huddle/shared';
import { useGuildStore } from '../stores/guilds';
import { useAuthStore } from '../stores/auth';
import { getGuildSettings } from '../stores/readStates';

/** Does this message mention the current user (directly, via role, or @everyone/@here)? */
export function mentionsMe(m: Message, opts: { respectSuppress?: boolean } = {}): boolean {
  const me = useAuthStore.getState().user?.id;
  if (!me) return false;
  if (m.mentions?.includes(me)) return true;
  if (m.referenced_message?.author.id === me && m.author.id !== me) return true;
  if (m.guild_id) {
    if (m.mention_everyone) {
      if (!(opts.respectSuppress && getGuildSettings(m.guild_id).suppress_everyone)) return true;
    }
    const myRoles = useGuildStore.getState().members[m.guild_id]?.[me]?.roles || [];
    if (m.mention_roles?.some((r) => myRoles.includes(r))) return true;
  }
  return false;
}

export function isDMChannel(channelId: string): boolean {
  const c = useGuildStore.getState().channels[channelId];
  return !!c && (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM);
}
