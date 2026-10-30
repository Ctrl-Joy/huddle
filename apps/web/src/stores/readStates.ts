// Read states (per channel) + per-guild notification settings, and unread/mention derivations.
import { create } from 'zustand';
import { ChannelType, NotificationLevel, type Channel, type ReadState, type UserGuildSettings } from '@huddle/shared';
import { useGuildStore } from './guilds';
import { useAuthStore } from './auth';
import { channelVisible } from '../lib/permissionsCore';

interface ReadStateStore {
  readStates: Record<string, ReadState>;
  guildSettings: Record<string, UserGuildSettings>;
  setReadStates(list: ReadState[]): void;
  upsertReadState(rs: ReadState): void;
  markRead(channelId: string, messageId: string | null): void;
  incrementMention(channelId: string): void;
  setGuildSettings(list: UserGuildSettings[]): void;
  upsertGuildSettings(s: UserGuildSettings): void;
  reset(): void;
}

export const useReadStateStore = create<ReadStateStore>()((set) => ({
  readStates: {},
  guildSettings: {},
  setReadStates: (list) => set({ readStates: Object.fromEntries(list.map((r) => [r.channel_id, r])) }),
  upsertReadState: (rs) => set((s) => ({ readStates: { ...s.readStates, [rs.channel_id]: rs } })),
  markRead: (channelId, messageId) => set((s) => {
    const prev = s.readStates[channelId];
    if (prev && prev.mention_count === 0 && prev.last_read_message_id && messageId
      && BigInt(prev.last_read_message_id) >= BigInt(messageId)) return {};
    return { readStates: { ...s.readStates, [channelId]: { channel_id: channelId, last_read_message_id: messageId, mention_count: 0 } } };
  }),
  incrementMention: (channelId) => set((s) => {
    const prev = s.readStates[channelId] || { channel_id: channelId, last_read_message_id: null, mention_count: 0 };
    return { readStates: { ...s.readStates, [channelId]: { ...prev, mention_count: prev.mention_count + 1 } } };
  }),
  setGuildSettings: (list) => set({ guildSettings: Object.fromEntries(list.map((g) => [g.guild_id, g])) }),
  upsertGuildSettings: (g) => set((s) => ({ guildSettings: { ...s.guildSettings, [g.guild_id]: g } })),
  reset: () => set({ readStates: {}, guildSettings: {} }),
}));

export function defaultGuildSettings(guildId: string): UserGuildSettings {
  return { guild_id: guildId, muted: false, message_notifications: NotificationLevel.ALL_MESSAGES, suppress_everyone: false, channel_overrides: [] };
}

export function getGuildSettings(guildId: string): UserGuildSettings {
  return useReadStateStore.getState().guildSettings[guildId] || defaultGuildSettings(guildId);
}

export function isChannelMuted(channel: Channel | undefined, settings: Record<string, UserGuildSettings>): boolean {
  if (!channel?.guild_id) return false;
  const gs = settings[channel.guild_id];
  if (!gs) return false;
  if (gs.channel_overrides.some((o) => o.channel_id === channel.id && o.muted)) return true;
  if (channel.parent_id && gs.channel_overrides.some((o) => o.channel_id === channel.parent_id && o.muted)) return true;
  return false;
}

export function isUnread(channel: Channel | undefined, readStates: Record<string, ReadState>): boolean {
  if (!channel || !channel.last_message_id) return false;
  if (channel.type === ChannelType.GUILD_VOICE || channel.type === ChannelType.GUILD_CATEGORY) return false;
  const rs = readStates[channel.id];
  if (!rs || !rs.last_read_message_id) return true;
  return BigInt(channel.last_message_id) > BigInt(rs.last_read_message_id);
}

/** Hook: unread + mention count for a single channel. */
export function useChannelUnread(channelId: string): { unread: boolean; mentions: number; muted: boolean } {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const rs = useReadStateStore((s) => s.readStates[channelId]);
  const gs = useReadStateStore((s) => (channel?.guild_id ? s.guildSettings[channel.guild_id] : undefined));
  const unread = isUnread(channel, rs ? { [channelId]: rs } : {});
  const muted = !!channel && isChannelMuted(channel, gs ? { [gs.guild_id]: gs } : {});
  return { unread, mentions: rs?.mention_count ?? 0, muted };
}

/** Aggregate for a guild: any unread visible, non-muted channel + total mentions. */
export function computeGuildUnread(guildId: string): { unread: boolean; mentions: number } {
  const gstate = useGuildStore.getState();
  const { readStates, guildSettings } = useReadStateStore.getState();
  const gs = guildSettings[guildId];
  let unread = false;
  let mentions = 0;
  const me = useAuthStore.getState().user?.id;
  if (!me) return { unread, mentions };
  for (const c of Object.values(gstate.channels)) {
    if (c.guild_id !== guildId) continue;
    if (c.type !== ChannelType.GUILD_TEXT) continue;
    if (!channelVisible(c, me)) continue;
    mentions += readStates[c.id]?.mention_count ?? 0;
    if (!unread && !gs?.muted && gs?.message_notifications !== NotificationLevel.NOTHING && !isChannelMuted(c, guildSettings) && isUnread(c, readStates)) unread = true;
  }
  return { unread, mentions };
}

/** Hook version (recomputes when any relevant store changes). */
export function useGuildUnread(guildId: string): { unread: boolean; mentions: number } {
  // subscribe to the slices; compute with a stable primitive encoding to avoid re-render loops
  const key = useGuildUnreadKey(guildId);
  const [u, m] = key.split(':');
  return { unread: u === '1', mentions: Number(m) };
}

function useGuildUnreadKey(guildId: string): string {
  useGuildStore((s) => s.channels);
  useGuildStore((s) => s.members[guildId]);
  useReadStateStore((s) => s.readStates);
  useReadStateStore((s) => s.guildSettings[guildId]);
  const r = computeGuildUnread(guildId);
  return `${r.unread ? 1 : 0}:${r.mentions}`;
}

/** Total DM mentions (each unread DM message counts) for the Home button. */
export function usePrivateUnread(): { channelId: string; mentions: number }[] {
  const channels = useGuildStore((s) => s.channels);
  const readStates = useReadStateStore((s) => s.readStates);
  const out: { channelId: string; mentions: number }[] = [];
  for (const c of Object.values(channels)) {
    if (c.type !== ChannelType.DM && c.type !== ChannelType.GROUP_DM) continue;
    const rs = readStates[c.id];
    if (isUnread(c, readStates)) out.push({ channelId: c.id, mentions: Math.max(1, rs?.mention_count ?? 0) });
  }
  out.sort((a, b) => {
    const la = channels[a.channelId].last_message_id || '0';
    const lb = channels[b.channelId].last_message_id || '0';
    return BigInt(lb) > BigInt(la) ? 1 : -1;
  });
  return out;
}
