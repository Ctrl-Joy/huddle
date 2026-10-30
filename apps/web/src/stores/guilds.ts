// Entity store: guilds, channels (guild + private), roles, members and a public-user cache.
import { create } from 'zustand';
import { ChannelType, type Channel, type FullGuild, type Guild, type Member, type PublicUser, type Role } from '@huddle/shared';

export interface GuildEntry extends Guild { member_count: number }

interface GuildState {
  guilds: Record<string, GuildEntry>;
  guildOrder: string[];
  channels: Record<string, Channel>;
  roles: Record<string, Record<string, Role>>; // guildId → roleId → Role
  members: Record<string, Record<string, Member>>; // guildId → userId → Member
  membersFetched: Record<string, boolean>;
  users: Record<string, PublicUser>;

  reset(): void;
  loadGuilds(guilds: FullGuild[]): void;
  addGuild(g: FullGuild): void;
  updateGuild(g: Guild): void;
  removeGuild(id: string): void;
  setGuildOrder(order: string[]): void;

  upsertChannel(c: Channel): void;
  removeChannel(id: string): void;
  setPrivateChannels(cs: Channel[]): void;
  setLastMessageId(channelId: string, messageId: string): void;

  upsertRole(guildId: string, r: Role): void;
  removeRole(guildId: string, roleId: string): void;

  upsertMember(m: Member): void;
  upsertMembers(guildId: string, ms: Member[]): void;
  removeMember(guildId: string, userId: string): void;
  setMembersFetched(guildId: string): void;

  upsertUser(u: PublicUser): void;
  upsertUsers(us: PublicUser[]): void;
}

const ORDER_KEY = 'huddle.guildOrder';
function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch { return []; }
}
function saveOrder(o: string[]) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(o)); } catch { /* ignore */ } }

function mergeUser(users: Record<string, PublicUser>, u: PublicUser): Record<string, PublicUser> {
  const prev = users[u.id];
  if (prev && prev.username === u.username && prev.display_name === u.display_name && prev.avatar === u.avatar
    && prev.banner_color === u.banner_color && prev.bio === u.bio) return users;
  return { ...users, [u.id]: { ...prev, ...u } };
}

export const useGuildStore = create<GuildState>()((set, get) => ({
  guilds: {},
  guildOrder: [],
  channels: {},
  roles: {},
  members: {},
  membersFetched: {},
  users: {},

  reset: () => set({ guilds: {}, guildOrder: [], channels: {}, roles: {}, members: {}, membersFetched: {}, users: {} }),

  loadGuilds: (list) => {
    const guilds: Record<string, GuildEntry> = {};
    const channels: Record<string, Channel> = { ...get().channels };
    const roles: GuildState['roles'] = {};
    const members: GuildState['members'] = {};
    let users = { ...get().users };
    for (const fg of list) {
      const { roles: rs, channels: cs, members: ms, presences: _p, voice_states: _v, ...g } = fg;
      guilds[g.id] = { ...g, member_count: fg.member_count };
      roles[g.id] = Object.fromEntries(rs.map((r) => [r.id, r]));
      members[g.id] = Object.fromEntries(ms.map((m) => [m.user.id, m]));
      for (const c of cs) channels[c.id] = { ...c, guild_id: c.guild_id ?? g.id };
      for (const m of ms) users[m.user.id] = m.user;
    }
    const saved = loadOrder().filter((id) => guilds[id]);
    const order = [...saved, ...list.map((g) => g.id).filter((id) => !saved.includes(id))];
    set({ guilds, roles, members, channels, users, guildOrder: order });
  },

  addGuild: (fg) => {
    const { roles: rs, channels: cs, members: ms, presences: _p, voice_states: _v, ...g } = fg;
    set((s) => {
      const channels = { ...s.channels };
      for (const c of cs) channels[c.id] = { ...c, guild_id: c.guild_id ?? g.id };
      let users = s.users;
      for (const m of ms) users = mergeUser(users, m.user);
      const order = s.guildOrder.includes(g.id) ? s.guildOrder : [...s.guildOrder, g.id];
      saveOrder(order);
      return {
        guilds: { ...s.guilds, [g.id]: { ...g, member_count: fg.member_count } },
        roles: { ...s.roles, [g.id]: Object.fromEntries(rs.map((r) => [r.id, r])) },
        members: { ...s.members, [g.id]: { ...(s.members[g.id] || {}), ...Object.fromEntries(ms.map((m) => [m.user.id, m])) } },
        channels,
        users,
        guildOrder: order,
      };
    });
  },

  updateGuild: (g) => set((s) => (s.guilds[g.id] ? { guilds: { ...s.guilds, [g.id]: { ...s.guilds[g.id], ...g } } } : {})),

  removeGuild: (id) => set((s) => {
    const guilds = { ...s.guilds }; delete guilds[id];
    const roles = { ...s.roles }; delete roles[id];
    const members = { ...s.members }; delete members[id];
    const channels: Record<string, Channel> = {};
    for (const [cid, c] of Object.entries(s.channels)) if (c.guild_id !== id) channels[cid] = c;
    const order = s.guildOrder.filter((x) => x !== id);
    saveOrder(order);
    return { guilds, roles, members, channels, guildOrder: order };
  }),

  setGuildOrder: (order) => { saveOrder(order); set({ guildOrder: order }); },

  upsertChannel: (c) => set((s) => {
    let users = s.users;
    if (c.recipients) for (const u of c.recipients) users = mergeUser(users, u);
    const prev = s.channels[c.id];
    // keep newer last_message_id if the update carries an older one
    const merged = { ...prev, ...c };
    if (prev?.last_message_id && c.last_message_id && BigInt(prev.last_message_id) > BigInt(c.last_message_id)) merged.last_message_id = prev.last_message_id;
    return { channels: { ...s.channels, [c.id]: merged }, users };
  }),

  removeChannel: (id) => set((s) => { const channels = { ...s.channels }; delete channels[id]; return { channels }; }),

  setPrivateChannels: (cs) => set((s) => {
    const channels = { ...s.channels };
    let users = s.users;
    for (const c of cs) {
      channels[c.id] = c;
      if (c.recipients) for (const u of c.recipients) users = mergeUser(users, u);
    }
    return { channels, users };
  }),

  setLastMessageId: (channelId, messageId) => set((s) => {
    const c = s.channels[channelId];
    if (!c) return {};
    if (c.last_message_id && BigInt(c.last_message_id) >= BigInt(messageId)) return {};
    return { channels: { ...s.channels, [channelId]: { ...c, last_message_id: messageId } } };
  }),

  upsertRole: (guildId, r) => set((s) => ({ roles: { ...s.roles, [guildId]: { ...(s.roles[guildId] || {}), [r.id]: r } } })),

  removeRole: (guildId, roleId) => set((s) => {
    const rs = { ...(s.roles[guildId] || {}) }; delete rs[roleId];
    const ms = s.members[guildId];
    let members = s.members;
    if (ms) {
      const next: Record<string, Member> = {};
      for (const [uid, m] of Object.entries(ms)) next[uid] = m.roles.includes(roleId) ? { ...m, roles: m.roles.filter((x) => x !== roleId) } : m;
      members = { ...s.members, [guildId]: next };
    }
    return { roles: { ...s.roles, [guildId]: rs }, members };
  }),

  upsertMember: (m) => set((s) => ({
    members: { ...s.members, [m.guild_id]: { ...(s.members[m.guild_id] || {}), [m.user.id]: m } },
    users: mergeUser(s.users, m.user),
  })),

  upsertMembers: (guildId, ms) => set((s) => {
    let users = s.users;
    for (const m of ms) users = mergeUser(users, m.user);
    return { members: { ...s.members, [guildId]: { ...(s.members[guildId] || {}), ...Object.fromEntries(ms.map((m) => [m.user.id, m])) } }, users };
  }),

  removeMember: (guildId, userId) => set((s) => {
    const ms = { ...(s.members[guildId] || {}) }; delete ms[userId];
    return { members: { ...s.members, [guildId]: ms } };
  }),

  setMembersFetched: (guildId) => set((s) => ({ membersFetched: { ...s.membersFetched, [guildId]: true } })),

  upsertUser: (u) => set((s) => {
    const users = mergeUser(s.users, u);
    if (users === s.users) return {};
    // propagate into members & DM recipients so names/avatars update everywhere
    const members: GuildState['members'] = {};
    let membersChanged = false;
    for (const [gid, ms] of Object.entries(s.members)) {
      if (ms[u.id]) { members[gid] = { ...ms, [u.id]: { ...ms[u.id], user: { ...ms[u.id].user, ...u } } }; membersChanged = true; }
      else members[gid] = ms;
    }
    let channels = s.channels;
    for (const c of Object.values(s.channels)) {
      if (c.recipients?.some((r) => r.id === u.id)) {
        if (channels === s.channels) channels = { ...s.channels };
        channels[c.id] = { ...c, recipients: c.recipients.map((r) => (r.id === u.id ? { ...r, ...u } : r)) };
      }
    }
    return { users, ...(membersChanged ? { members } : {}), channels };
  }),

  upsertUsers: (us) => set((s) => {
    let users = s.users;
    for (const u of us) users = mergeUser(users, u);
    return users === s.users ? {} : { users };
  }),
}));

// ---- selectors / helpers ----

export function sortChannels(a: Channel, b: Channel): number {
  // voice after text within same parent (like most chat apps), then position, then id
  const av = a.type === ChannelType.GUILD_VOICE ? 1 : 0;
  const bv = b.type === ChannelType.GUILD_VOICE ? 1 : 0;
  if (av !== bv) return av - bv;
  if (a.position !== b.position) return a.position - b.position;
  return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
}

export function guildChannels(channels: Record<string, Channel>, guildId: string): Channel[] {
  return Object.values(channels).filter((c) => c.guild_id === guildId);
}

export function isPrivateChannel(c: Channel | undefined): boolean {
  return !!c && (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM);
}

export function sortedRoles(roles: Record<string, Role> | undefined): Role[] {
  return Object.values(roles || {}).sort((a, b) => b.position - a.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/** Display name for a user within an optional guild context: nick > display_name > username. */
export function displayName(userId: string, guildId?: string | null): string {
  const s = useGuildStore.getState();
  const m = guildId ? s.members[guildId]?.[userId] : undefined;
  const u = m?.user || s.users[userId];
  return m?.nick || u?.display_name || u?.username || 'Unknown User';
}

export function userDisplayName(u: PublicUser | undefined | null): string {
  return u ? u.display_name || u.username : 'Unknown User';
}

/** Colour (#hex) of the member's highest coloured role, or null. */
export function memberColor(guildId: string | null | undefined, userId: string): string | null {
  if (!guildId) return null;
  const s = useGuildStore.getState();
  const m = s.members[guildId]?.[userId];
  if (!m) return null;
  return roleColorFor(s.roles[guildId], m.roles);
}

export function roleColorFor(roles: Record<string, Role> | undefined, roleIds: string[]): string | null {
  if (!roles) return null;
  let best: Role | null = null;
  for (const id of roleIds) {
    const r = roles[id];
    if (r && r.color && (!best || r.position > best.position)) best = r;
  }
  return best ? intToHex(best.color) : null;
}

export function intToHex(n: number): string { return '#' + (n & 0xffffff).toString(16).padStart(6, '0'); }
export function hexToInt(h: string): number { return parseInt(h.replace('#', ''), 16) || 0; }

export function channelDisplayName(c: Channel | undefined, meId?: string): string {
  if (!c) return '';
  if (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM) {
    if (c.name) return c.name;
    const others = (c.recipients || []).filter((r) => r.id !== meId);
    if (!others.length) return 'Empty Group';
    return others.map((r) => r.display_name || r.username).join(', ');
  }
  return c.name || '';
}
