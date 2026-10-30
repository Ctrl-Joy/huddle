// REST actions shared across components. They update stores optimistically where it's safe and
// otherwise rely on gateway dispatches to reconcile.
import type {
  Channel, DiscoveryResponse, FullGuild, Guild, GuildCategory, GuildTemplateId, Invite, Member, Message, Relationship, Role, User,
  UserGuildSettings,
} from '@huddle/shared';
import { normalizeReactionKey, type GuildEmoji } from '@huddle/shared';
import { api, errorMessage, uploadWithProgress } from '../api/client';
import { useGuildStore } from '../stores/guilds';
import { useReadStateStore, getGuildSettings } from '../stores/readStates';
import { useAuthStore } from '../stores/auth';
import { useMessageStore } from '../stores/messages';
import { useRelationshipStore } from '../stores/relationships';
import { toast } from '../stores/ui';
import { navigate } from './nav';

// ---- read state ----
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastAcked = new Map<string, string>();

/** Debounced ack of a channel up to messageId. Updates local read state immediately. */
export function ackChannel(channelId: string, messageId: string | null | undefined, immediate = false) {
  if (!messageId) return;
  const rs = useReadStateStore.getState().readStates[channelId];
  const alreadyRead = rs && rs.mention_count === 0 && rs.last_read_message_id && BigInt(rs.last_read_message_id) >= BigInt(messageId);
  useReadStateStore.getState().markRead(channelId, messageId);
  if (alreadyRead && lastAcked.get(channelId) === messageId) return;
  if (alreadyRead) return;
  const run = () => {
    ackTimers.delete(channelId);
    lastAcked.set(channelId, messageId);
    api.post(`/channels/${channelId}/messages/${messageId}/ack`, {}).catch(() => {});
  };
  const prev = ackTimers.get(channelId);
  if (prev) clearTimeout(prev);
  if (immediate) run();
  else ackTimers.set(channelId, setTimeout(run, 600));
}

export function markGuildRead(guildId: string) {
  for (const c of Object.values(useGuildStore.getState().channels)) {
    if (c.guild_id === guildId && c.last_message_id) ackChannel(c.id, c.last_message_id, true);
  }
}

// ---- guilds ----
export async function createGuild(name: string, icon?: File | null, template?: GuildTemplateId | null): Promise<Guild> {
  const g = await api.post<FullGuild>('/guilds', template ? { name, template } : { name });
  // add immediately (gateway GUILD_CREATE will also arrive)
  if ((g as FullGuild).channels) useGuildStore.getState().addGuild(g as FullGuild);
  if (icon) {
    try { await uploadIcon(g.id, icon); } catch (e) { toast('Icon upload failed: ' + errorMessage(e), 'error'); }
  }
  return g;
}

export async function uploadIcon(guildId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const g = await uploadWithProgress<Guild>(`/guilds/${guildId}/icon`, form).promise;
  if (g?.id) useGuildStore.getState().updateGuild(g);
  return g;
}

// ---- custom emoji ----
export async function uploadEmoji(guildId: string, name: string, file: File) {
  const form = new FormData();
  form.append('name', name);
  form.append('file', file);
  const e = await uploadWithProgress<GuildEmoji>(`/guilds/${guildId}/emojis`, form).promise;
  const gs = useGuildStore.getState();
  if (e?.id && !(gs.emojis[guildId] || []).some((x) => x.id === e.id)) gs.setEmojis(guildId, [...(gs.emojis[guildId] || []), e]);
  return e;
}

export async function renameEmoji(guildId: string, emojiId: string, name: string) {
  const e = await api.patch<GuildEmoji>(`/guilds/${guildId}/emojis/${emojiId}`, { name });
  const gs = useGuildStore.getState();
  if (e?.id) gs.setEmojis(guildId, (gs.emojis[guildId] || []).map((x) => (x.id === e.id ? e : x)));
  return e;
}

export async function deleteEmoji(guildId: string, emojiId: string) {
  await api.del(`/guilds/${guildId}/emojis/${emojiId}`);
  const gs = useGuildStore.getState();
  gs.setEmojis(guildId, (gs.emojis[guildId] || []).filter((x) => x.id !== emojiId));
}

export async function leaveGuild(guildId: string) {
  await api.del(`/users/@me/guilds/${guildId}`);
  useGuildStore.getState().removeGuild(guildId);
  navigate('/channels/@me');
}

export async function deleteGuild(guildId: string) {
  await api.del(`/guilds/${guildId}`);
  useGuildStore.getState().removeGuild(guildId);
  navigate('/channels/@me');
}

// ---- discovery ----
export function fetchDiscovery(query: { category?: GuildCategory | null; q?: string }, signal?: AbortSignal) {
  return api.get<DiscoveryResponse>('/discovery', { category: query.category, q: query.q?.trim() }, signal);
}

/** Joins a listed server (no invite needed); a no-op if already a member. */
export async function joinDiscoverable(guildId: string): Promise<FullGuild> {
  const g = await api.post<FullGuild>(`/discovery/${guildId}/join`, {});
  if (g?.channels) useGuildStore.getState().addGuild(g);
  return g;
}

export async function joinInvite(code: string): Promise<Guild | FullGuild | null> {
  const res = await api.post<any>(`/invites/${encodeURIComponent(code)}`, {});
  // server may return the guild, or an Invite, or {guild}
  const guild: Guild | FullGuild | null = res?.channels ? res : res?.guild ?? (res?.id && res?.name ? res : null);
  if (guild && (guild as FullGuild).channels) useGuildStore.getState().addGuild(guild as FullGuild);
  return guild;
}

export function parseInviteCode(input: string): string {
  const t = input.trim();
  const m = t.match(/invite\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : t.replace(/^.*\//, '');
}

export async function getInvite(code: string) { return api.get<Invite>(`/invites/${encodeURIComponent(code)}`); }

export async function createInvite(channelId: string, opts: { max_uses?: number; max_age?: number } = {}) {
  return api.post<Invite>(`/channels/${channelId}/invites`, opts);
}

// ---- channels ----
export async function createChannel(guildId: string, body: { name: string; type: number; parent_id?: string | null; topic?: string | null; permission_overwrites?: unknown[] }) {
  const c = await api.post<Channel>(`/guilds/${guildId}/channels`, body);
  useGuildStore.getState().upsertChannel(c);
  return c;
}

export async function updateChannel(channelId: string, body: Partial<Pick<Channel, 'name' | 'topic' | 'rate_limit_per_user' | 'parent_id'>>) {
  const c = await api.patch<Channel>(`/channels/${channelId}`, body);
  if (c?.id) useGuildStore.getState().upsertChannel(c);
  return c;
}

export async function deleteChannel(channelId: string) {
  await api.del(`/channels/${channelId}`);
  useGuildStore.getState().removeChannel(channelId);
}

export async function setOverwrite(channelId: string, targetId: string, type: 0 | 1, allow: bigint, deny: bigint) {
  await api.put(`/channels/${channelId}/permissions/${targetId}`, { type, allow: allow.toString(), deny: deny.toString() });
  const c = useGuildStore.getState().channels[channelId];
  if (c) {
    const ows = c.permission_overwrites.filter((o) => o.id !== targetId);
    ows.push({ id: targetId, type, allow: allow.toString(), deny: deny.toString() });
    useGuildStore.getState().upsertChannel({ ...c, permission_overwrites: ows });
  }
}

export async function deleteOverwrite(channelId: string, targetId: string) {
  await api.del(`/channels/${channelId}/permissions/${targetId}`);
  const c = useGuildStore.getState().channels[channelId];
  if (c) useGuildStore.getState().upsertChannel({ ...c, permission_overwrites: c.permission_overwrites.filter((o) => o.id !== targetId) });
}

// ---- DMs ----
export async function openDM(userIds: string[]): Promise<Channel> {
  // reuse existing 1:1
  if (userIds.length === 1) {
    const existing = Object.values(useGuildStore.getState().channels).find((c) => c.type === 1 && c.recipients?.some((r) => r.id === userIds[0]));
    if (existing) { navigate(`/channels/@me/${existing.id}`); return existing; }
  }
  const c = await api.post<Channel>('/users/@me/channels', { recipient_ids: userIds });
  useGuildStore.getState().upsertChannel(c);
  navigate(`/channels/@me/${c.id}`);
  return c;
}

// ---- messages ----
export async function editMessage(channelId: string, messageId: string, content: string) {
  const m = await api.patch<Message>(`/channels/${channelId}/messages/${messageId}`, { content });
  if (m?.id) useMessageStore.getState().update(m);
}

export async function deleteMessage(channelId: string, messageId: string) {
  await api.del(`/channels/${channelId}/messages/${messageId}`);
  useMessageStore.getState().remove(channelId, messageId);
}

/** `emoji` may be unicode, a reaction key ("c:<id>") or a custom emoji token from the picker. */
export async function toggleReaction(m: Message, picked: string) {
  const emoji = normalizeReactionKey(picked);
  const existing = m.reactions.find((r) => r.emoji === emoji);
  const path = `/channels/${m.channel_id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}/@me`;
  try {
    if (existing?.me) await api.del(path);
    else await api.put(path);
  } catch (e) { toast(errorMessage(e), 'error'); }
}

export async function setPinned(m: Message, pinned: boolean) {
  try {
    if (pinned) await api.put(`/channels/${m.channel_id}/pins/${m.id}`);
    else await api.del(`/channels/${m.channel_id}/pins/${m.id}`);
    useMessageStore.getState().update({ id: m.id, channel_id: m.channel_id, pinned });
  } catch (e) { toast(errorMessage(e), 'error'); }
}

let lastTyping = 0;
let lastTypingChannel = '';
export function sendTyping(channelId: string) {
  const now = Date.now();
  if (channelId === lastTypingChannel && now - lastTyping < 8000) return;
  lastTyping = now;
  lastTypingChannel = channelId;
  api.post(`/channels/${channelId}/typing`, {}).catch(() => {});
}
export function resetTyping() { lastTyping = 0; }

// ---- members / roles ----
export async function updateMember(guildId: string, userId: string, body: Partial<{ nick: string | null; roles: string[]; communication_disabled_until: string | null; mute: boolean; deaf: boolean; channel_id: string | null }>) {
  const me = useAuthStore.getState().user?.id;
  const path = userId === me && Object.keys(body).every((k) => k === 'nick') ? `/guilds/${guildId}/members/@me` : `/guilds/${guildId}/members/${userId}`;
  const m = await api.patch<Member>(path, body);
  if (m?.user) useGuildStore.getState().upsertMember(m);
  return m;
}

export async function kickMember(guildId: string, userId: string) {
  await api.del(`/guilds/${guildId}/members/${userId}`);
  useGuildStore.getState().removeMember(guildId, userId);
}

export async function banMember(guildId: string, userId: string, reason: string) {
  await api.put(`/guilds/${guildId}/bans/${userId}`, { reason: reason || null });
  useGuildStore.getState().removeMember(guildId, userId);
}

export async function createRole(guildId: string, body: Partial<Role> = {}) {
  const r = await api.post<Role>(`/guilds/${guildId}/roles`, { name: 'new role', ...body });
  useGuildStore.getState().upsertRole(guildId, r);
  return r;
}

export async function updateRole(guildId: string, roleId: string, body: Partial<Pick<Role, 'name' | 'color' | 'hoist' | 'mentionable' | 'permissions'>>) {
  const r = await api.patch<Role>(`/guilds/${guildId}/roles/${roleId}`, body);
  if (r?.id) useGuildStore.getState().upsertRole(guildId, r);
  return r;
}

export async function deleteRole(guildId: string, roleId: string) {
  await api.del(`/guilds/${guildId}/roles/${roleId}`);
  useGuildStore.getState().removeRole(guildId, roleId);
}

export async function reorderRoles(guildId: string, order: { id: string; position: number }[]) {
  const res = await api.patch<Role[]>(`/guilds/${guildId}/roles`, order);
  if (Array.isArray(res)) for (const r of res) useGuildStore.getState().upsertRole(guildId, r);
}

export async function fetchMembers(guildId: string) {
  const gs = useGuildStore.getState();
  if (gs.membersFetched[guildId]) return;
  gs.setMembersFetched(guildId);
  try {
    let after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await api.get<Member[]>(`/guilds/${guildId}/members`, { limit: 1000, after });
      useGuildStore.getState().upsertMembers(guildId, page.map((m) => ({ ...m, guild_id: m.guild_id ?? guildId })));
      if (page.length < 1000) break;
      after = page[page.length - 1].user.id;
    }
  } catch { /* keep READY members */ }
}

// ---- user ----
export async function updateMe(body: Partial<Pick<User, 'display_name' | 'username' | 'bio' | 'banner_color' | 'custom_status'>>) {
  const u = await api.patch<User>('/users/@me', body);
  if (u?.id) { useAuthStore.getState().setUser(u); useGuildStore.getState().upsertUser(u); }
  return u;
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  const u = await uploadWithProgress<User>('/users/@me/avatar', form).promise;
  if (u?.id) { useAuthStore.getState().setUser(u); useGuildStore.getState().upsertUser(u); }
  return u;
}

// ---- relationships ----
export async function sendFriendRequest(username: string) {
  const r = await api.post<Relationship | undefined>('/users/@me/relationships', { username });
  if (r && (r as Relationship).id) useRelationshipStore.getState().upsert(r as Relationship);
  return r;
}
export async function acceptFriend(userId: string) { await api.put(`/users/@me/relationships/${userId}`, { type: 1 }); }
export async function blockUser(userId: string) { await api.put(`/users/@me/relationships/${userId}`, { type: 2 }); }
export async function removeRelationship(userId: string) {
  await api.del(`/users/@me/relationships/${userId}`);
  useRelationshipStore.getState().remove(userId);
}

// ---- guild notification settings ----
export async function updateGuildSettings(guildId: string, patch: Partial<Omit<UserGuildSettings, 'guild_id'>>) {
  const cur = getGuildSettings(guildId);
  useReadStateStore.getState().upsertGuildSettings({ ...cur, ...patch });
  try {
    const res = await api.patch<UserGuildSettings>(`/users/@me/guilds/${guildId}/settings`, patch);
    if (res?.guild_id) useReadStateStore.getState().upsertGuildSettings(res);
  } catch (e) {
    useReadStateStore.getState().upsertGuildSettings(cur);
    toast(errorMessage(e), 'error');
  }
}

export async function toggleChannelMute(channel: Channel) {
  if (!channel.guild_id) return;
  const cur = getGuildSettings(channel.guild_id);
  const existing = cur.channel_overrides.find((o) => o.channel_id === channel.id);
  const muted = !(existing?.muted);
  const overrides = [...cur.channel_overrides.filter((o) => o.channel_id !== channel.id), { channel_id: channel.id, muted }];
  await updateGuildSettings(channel.guild_id, { channel_overrides: overrides });
}
