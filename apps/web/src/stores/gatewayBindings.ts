// Applies EVERY DispatchEvents event to the zustand stores. Call bindGateway() once at startup.
import { ChannelType, NotificationLevel, type DispatchEventName, type DispatchEvents, type Message, type User } from '@huddle/shared';
import { gateway } from '../api/gateway';
import { useAuthStore } from './auth';
import { useGuildStore, displayName, channelDisplayName } from './guilds';
import { useMessageStore } from './messages';
import { usePresenceStore } from './presences';
import { useRelationshipStore } from './relationships';
import { useReadStateStore, getGuildSettings, isChannelMuted } from './readStates';
import { useTypingStore } from './typing';
import { useVoiceStore, getVoiceEngine } from './voice';
import { useViewStore } from './view';
import { useBanStore } from './bans';
import { usePinsStore } from './pins';
import { mentionsMe } from '../lib/mentionUtil';
import { navigate, channelPath } from '../lib/nav';
import { playPing, showDesktopNotification } from '../lib/notifications';
import { channelVisible } from '../lib/permissionsCore';
import { stripMarkdownForPreview } from '../lib/plainText';

type Handlers = { [K in DispatchEventName]: (d: DispatchEvents[K]) => void };

const me = () => useAuthStore.getState().user?.id ?? '';

function handleIncomingMessage(m: Message) {
  const myId = me();
  const view = useViewStore.getState();
  const isOwn = m.author.id === myId;
  const channel = useGuildStore.getState().channels[m.channel_id];
  if (isOwn) {
    useReadStateStore.getState().markRead(m.channel_id, m.id);
    return;
  }
  const viewing = view.channelId === m.channel_id && view.atBottom && !document.hidden;
  if (viewing) return; // ChatView acks
  const isDM = !!channel && (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM);
  const mentioned = isDM || mentionsMe(m, { respectSuppress: true });
  if (mentioned) useReadStateStore.getState().incrementMention(m.channel_id);

  // notification decision
  if (useAuthStore.getState().currentStatus === 'dnd') return;
  if (!mentioned) return;
  if (m.guild_id) {
    const gs = getGuildSettings(m.guild_id);
    if (gs.muted || gs.message_notifications === NotificationLevel.NOTHING) return;
    if (isChannelMuted(channel, useReadStateStore.getState().guildSettings)) return;
  }
  const differentChannel = view.channelId !== m.channel_id;
  if (!document.hidden && !differentChannel) return;
  playPing('message');
  if (document.hidden || !document.hasFocus()) {
    const author = displayName(m.author.id, m.guild_id);
    const guild = m.guild_id ? useGuildStore.getState().guilds[m.guild_id] : null;
    const title = guild ? `${author} (#${channel?.name ?? 'channel'}, ${guild.name})` : isDM && channel?.type === ChannelType.GROUP_DM ? `${author} (${channelDisplayName(channel, myId)})` : author;
    const body = stripMarkdownForPreview(m.content) || (m.attachments.length ? `Sent ${m.attachments.length} attachment(s)` : '');
    showDesktopNotification(title, body, {
      icon: m.author.avatar || undefined,
      tag: m.channel_id,
      onClick: () => navigate(channelPath({ id: m.channel_id, guild_id: m.guild_id })),
    });
  }
}

const handlers: Handlers = {
  READY: (d) => {
    const auth = useAuthStore.getState();
    auth.setUser(d.user);
    const gs = useGuildStore.getState();
    gs.loadGuilds(d.guilds);
    gs.setPrivateChannels(d.private_channels);
    gs.upsertUsers(d.relationships.map((r) => r.user));
    useRelationshipStore.getState().set(d.relationships);
    const presences = [...d.presences];
    for (const g of d.guilds) presences.push(...(g.presences || []));
    usePresenceStore.getState().set(presences);
    usePresenceStore.getState().upsert({ user_id: d.user.id, status: d.user.status === 'invisible' ? 'offline' : d.user.status, custom_status: d.user.custom_status });
    useReadStateStore.getState().setReadStates(d.read_states);
    useReadStateStore.getState().setGuildSettings(d.user_guild_settings);
    const vs = [...(d.voice_states || [])];
    for (const g of d.guilds) vs.push(...(g.voice_states || []));
    const voice = useVoiceStore.getState();
    useVoiceStore.setState({ states: {} });
    voice.setStates(vs);
    // if we were in voice before a reconnect, re-announce
    const conn = useVoiceStore.getState().connection;
    if (conn) {
      const v = useVoiceStore.getState();
      gateway.updateVoiceState({ guild_id: conn.guildId, channel_id: conn.channelId, self_mute: v.selfMute || v.selfDeaf, self_deaf: v.selfDeaf, self_video: v.selfVideo, self_stream: v.selfStream });
    }
    // messages may be stale after a reconnect — refetch lazily
    useMessageStore.getState().reset();
    auth.setStatus('ready');
  },

  USER_UPDATE: (u) => {
    const auth = useAuthStore.getState();
    if (u.id === me()) {
      if ('email' in u) auth.setUser(u as User);
      else auth.patchUser(u);
    }
    useGuildStore.getState().upsertUser(u);
  },

  GUILD_CREATE: (g) => {
    useGuildStore.getState().addGuild(g);
    usePresenceStore.getState().set(g.presences || []);
    useVoiceStore.getState().setStates(g.voice_states || []);
  },
  GUILD_UPDATE: (g) => useGuildStore.getState().updateGuild(g),
  GUILD_DELETE: ({ id }) => {
    const view = useViewStore.getState();
    useGuildStore.getState().removeGuild(id);
    useVoiceStore.getState().removeGuildStates(id);
    if (view.guildId === id) navigate('/channels/@me');
  },

  GUILD_MEMBER_ADD: (m) => {
    const gs = useGuildStore.getState();
    const existed = !!gs.members[m.guild_id]?.[m.user.id];
    gs.upsertMember(m);
    const g = gs.guilds[m.guild_id];
    if (g && !existed) useGuildStore.setState((s) => ({ guilds: { ...s.guilds, [g.id]: { ...g, member_count: g.member_count + 1 } } }));
  },
  GUILD_MEMBER_UPDATE: (m) => useGuildStore.getState().upsertMember(m),
  GUILD_MEMBER_REMOVE: ({ guild_id, user }) => {
    const gs = useGuildStore.getState();
    gs.removeMember(guild_id, user.id);
    const g = gs.guilds[guild_id];
    if (g) useGuildStore.setState((s) => ({ guilds: { ...s.guilds, [g.id]: { ...g, member_count: Math.max(0, g.member_count - 1) } } }));
  },
  GUILD_BAN_ADD: ({ guild_id, user }) => useBanStore.getState().add(guild_id, { user, reason: null }),
  GUILD_BAN_REMOVE: ({ guild_id, user }) => useBanStore.getState().remove(guild_id, user.id),

  GUILD_ROLE_CREATE: ({ guild_id, role }) => useGuildStore.getState().upsertRole(guild_id, role),
  GUILD_ROLE_UPDATE: ({ guild_id, role }) => useGuildStore.getState().upsertRole(guild_id, role),
  GUILD_ROLE_DELETE: ({ guild_id, role_id }) => useGuildStore.getState().removeRole(guild_id, role_id),

  CHANNEL_CREATE: (c) => useGuildStore.getState().upsertChannel(c),
  CHANNEL_UPDATE: (c) => {
    useGuildStore.getState().upsertChannel(c);
    // lost access? leave the view
    const view = useViewStore.getState();
    if (view.channelId === c.id && c.guild_id && !channelVisible(c, me())) navigate(`/channels/${c.guild_id}`);
  },
  CHANNEL_DELETE: (c) => {
    useGuildStore.getState().removeChannel(c.id);
    useMessageStore.getState().dropChannel(c.id);
    const view = useViewStore.getState();
    if (view.channelId === c.id) navigate(c.guild_id ? `/channels/${c.guild_id}` : '/channels/@me');
    const conn = useVoiceStore.getState().connection;
    if (conn?.channelId === c.id) useVoiceStore.setState({ connection: null });
  },
  CHANNEL_PINS_UPDATE: ({ channel_id }) => usePinsStore.getState().invalidate(channel_id),

  MESSAGE_CREATE: (m) => {
    useMessageStore.getState().add(m);
    useGuildStore.getState().setLastMessageId(m.channel_id, m.id);
    useTypingStore.getState().stop(m.channel_id, m.author.id);
    handleIncomingMessage(m);
  },
  MESSAGE_UPDATE: (m) => {
    useMessageStore.getState().update(m);
    if (m.author) useGuildStore.getState().upsertUser(m.author);
  },
  MESSAGE_DELETE: ({ id, channel_id }) => useMessageStore.getState().remove(channel_id, id),
  MESSAGE_REACTION_ADD: (r) => useMessageStore.getState().reaction(r.channel_id, r.message_id, r.emoji, r.user_id, true, me()),
  MESSAGE_REACTION_REMOVE: (r) => useMessageStore.getState().reaction(r.channel_id, r.message_id, r.emoji, r.user_id, false, me()),
  MESSAGE_ACK: (rs) => useReadStateStore.getState().upsertReadState(rs),

  TYPING_START: (t) => {
    if (t.user_id === me()) return;
    if (t.member) useGuildStore.getState().upsertMember(t.member);
    useTypingStore.getState().start(t.channel_id, t.user_id);
  },

  PRESENCE_UPDATE: (p) => {
    usePresenceStore.getState().upsert({ user_id: p.user_id, status: p.status, custom_status: p.custom_status });
    if (p.user_id === me()) {
      useAuthStore.getState().setCurrentStatus(p.status);
      if (p.custom_status !== undefined) useAuthStore.getState().patchUser({ custom_status: p.custom_status });
    }
  },

  RELATIONSHIP_ADD: (r) => {
    useGuildStore.getState().upsertUser(r.user);
    useRelationshipStore.getState().upsert(r);
    if (r.type === 3) playPing('message');
  },
  RELATIONSHIP_REMOVE: ({ id }) => useRelationshipStore.getState().remove(id),

  USER_GUILD_SETTINGS_UPDATE: (s) => useReadStateStore.getState().upsertGuildSettings(s),

  VOICE_STATE_UPDATE: (vs) => {
    const voice = useVoiceStore.getState();
    const myConn = voice.connection;
    const prev = voice.states[vs.user_id];
    voice.applyState(vs);
    if (myConn && vs.user_id !== me()) {
      if (vs.channel_id === myConn.channelId && prev?.channel_id !== myConn.channelId) playPing('join');
      if (prev?.channel_id === myConn.channelId && vs.channel_id !== myConn.channelId) playPing('leave');
    }
  },
  VOICE_SIGNAL: (s) => getVoiceEngine()?.onSignal?.(s),
  CALL_CREATE: (c) => {
    useVoiceStore.getState().setCall({ channelId: c.channel_id, ringing: c.ringing, initiatorId: c.initiator_id });
    if (c.ringing.includes(me()) && c.initiator_id !== me()) {
      playPing('ring');
      showDesktopNotification('Incoming call', `${displayName(c.initiator_id)} is calling you`, { tag: 'call-' + c.channel_id, onClick: () => navigate(`/channels/@me/${c.channel_id}`) });
    }
  },
  CALL_DELETE: ({ channel_id }) => useVoiceStore.getState().removeCall(channel_id),
};

let bound = false;
export function bindGateway() {
  if (bound) return;
  bound = true;
  for (const [event, fn] of Object.entries(handlers) as [DispatchEventName, (d: unknown) => void][]) {
    gateway.on(event, fn as never);
  }
  gateway.onStatus((s, info) => {
    if (s === 'closed' && info?.code === 4004) {
      // token rejected
      useAuthStore.getState().clear();
      navigate('/login');
    }
  });
}

export function resetAllStores() {
  useGuildStore.getState().reset();
  useMessageStore.getState().reset();
  usePresenceStore.getState().reset();
  useRelationshipStore.getState().reset();
  useReadStateStore.getState().reset();
  useVoiceStore.getState().reset();
  useTypingStore.setState({ typing: {} });
  usePinsStore.setState({ pins: {} });
}
