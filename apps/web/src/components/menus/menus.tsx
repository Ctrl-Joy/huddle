// Context-menu item builders for guilds, channels, messages and members.
import { ChannelType, Permissions, RelationshipType, has, type Channel, type Message } from '@huddle/shared';
import { useGuildStore, sortedRoles, intToHex, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useReadStateStore, getGuildSettings, isChannelMuted } from '../../stores/readStates';
import { useRelationshipStore } from '../../stores/relationships';
import { useUIStore, openModal, confirmDialog, toast, type MenuItem } from '../../stores/ui';
import { useVoiceStore } from '../../stores/voice';
import { canActOn, channelPermissionsFor, guildPermissionsFor, myHighestPosition } from '../../lib/permissionsCore';
import {
  ackChannel, markGuildRead, leaveGuild, deleteChannel, toggleChannelMute, updateGuildSettings, deleteMessage, setPinned,
  openDM, sendFriendRequest, removeRelationship, blockUser, updateMember, kickMember, toggleReaction, acceptFriend,
} from '../../lib/actions';
import { copyText } from '../../lib/format';
import { errorMessage } from '../../api/client';
import { useMessageStore } from '../../stores/messages';

const me = () => useAuthStore.getState().user?.id ?? '';
const copyId = (id: string): MenuItem => ({ label: 'Copy ID', hint: 'ID', onClick: () => { void copyText(id); toast('Copied ID', 'success'); } });

function guarded(fn: () => Promise<unknown>) {
  return () => { fn().catch((e) => toast(errorMessage(e), 'error')); };
}

export function buildGuildMenu(guildId: string): MenuItem[] {
  const s = useGuildStore.getState();
  const g = s.guilds[guildId];
  if (!g) return [];
  const perms = guildPermissionsFor(guildId, me());
  const gs = getGuildSettings(guildId);
  const firstText = Object.values(s.channels).find((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT && has(channelPermissionsFor(c, me()), Permissions.CREATE_INVITE));
  const canSettings = has(perms, Permissions.MANAGE_GUILD) || has(perms, Permissions.MANAGE_ROLES) || has(perms, Permissions.KICK_MEMBERS) || has(perms, Permissions.BAN_MEMBERS) || has(perms, Permissions.VIEW_AUDIT_LOG) || has(perms, Permissions.MANAGE_EMOJIS);
  const items: MenuItem[] = [
    { label: 'Mark As Read', onClick: () => markGuildRead(guildId) },
    { separator: true },
  ];
  if (firstText) items.push({ label: 'Invite People', color: 'accent', onClick: () => openModal('invite', { guildId, channelId: firstText.id }) });
  items.push(
    { label: gs.muted ? 'Unmute Server' : 'Mute Server', onClick: () => void updateGuildSettings(guildId, { muted: !gs.muted }) },
    { label: 'Notification Settings', onClick: () => openModal('notificationSettings', { guildId }) },
  );
  if (canSettings || has(perms, Permissions.MANAGE_CHANNELS)) items.push({ separator: true });
  if (canSettings) items.push({ label: 'Server Settings', onClick: () => openModal('serverSettings', { guildId }) });
  if (has(perms, Permissions.MANAGE_CHANNELS)) {
    items.push({ label: 'Create Channel', onClick: () => openModal('createChannel', { guildId }) });
    items.push({ label: 'Create Category', onClick: () => openModal('createCategory', { guildId }) });
  }
  if (g.owner_id !== me()) {
    items.push({ separator: true }, {
      label: 'Leave Server', danger: true,
      onClick: () => confirmDialog({
        title: `Leave '${g.name}'`, danger: true, confirmLabel: 'Leave Server',
        body: <>Are you sure you want to leave <strong>{g.name}</strong>? You won't be able to rejoin unless you are re-invited.</>,
        onConfirm: () => leaveGuild(guildId),
      }),
    });
  }
  items.push({ separator: true }, copyId(guildId));
  return items;
}

export function buildChannelMenu(channel: Channel): MenuItem[] {
  const perms = channelPermissionsFor(channel, me());
  const items: MenuItem[] = [];
  const isCategory = channel.type === ChannelType.GUILD_CATEGORY;
  if (channel.type === ChannelType.GUILD_TEXT || channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) {
    items.push({ label: 'Mark As Read', disabled: !channel.last_message_id, onClick: () => ackChannel(channel.id, channel.last_message_id, true) });
    items.push({ separator: true });
  }
  if (isCategory) {
    const collapsed = !!useUIStore.getState().collapsedCategories[channel.id];
    items.push({ label: collapsed ? 'Expand Category' : 'Collapse Category', onClick: () => useUIStore.getState().toggleCategory(channel.id) });
    items.push({ separator: true });
  }
  if (channel.guild_id && has(perms, Permissions.CREATE_INVITE) && !isCategory) {
    items.push({ label: 'Invite People', color: 'accent', onClick: () => openModal('invite', { guildId: channel.guild_id, channelId: channel.id }) });
  }
  if (channel.guild_id) {
    const muted = isChannelMuted(channel, useReadStateStore.getState().guildSettings);
    items.push({ label: muted ? (isCategory ? 'Unmute Category' : 'Unmute Channel') : (isCategory ? 'Mute Category' : 'Mute Channel'), onClick: () => void toggleChannelMute(channel) });
  }
  if (channel.guild_id && has(perms, Permissions.MANAGE_CHANNELS)) {
    items.push({ separator: true });
    if (isCategory) {
      items.push({ label: 'Create Text Channel', onClick: () => openModal('createChannel', { guildId: channel.guild_id, parentId: channel.id, channelType: ChannelType.GUILD_TEXT }) });
      items.push({ label: 'Create Voice Channel', onClick: () => openModal('createChannel', { guildId: channel.guild_id, parentId: channel.id, channelType: ChannelType.GUILD_VOICE }) });
    }
    items.push({ label: isCategory ? 'Edit Category' : 'Edit Channel', onClick: () => openModal('channelSettings', { channelId: channel.id }) });
    items.push({
      label: isCategory ? 'Delete Category' : 'Delete Channel', danger: true,
      onClick: () => confirmDialog({
        title: isCategory ? 'Delete Category' : 'Delete Channel', danger: true, confirmLabel: 'Delete',
        body: <>Are you sure you want to delete <strong>{isCategory ? channel.name : '#' + channel.name}</strong>? This cannot be undone.</>,
        onConfirm: () => deleteChannel(channel.id),
      }),
    });
  }
  items.push({ separator: true }, copyId(channel.id));
  return items;
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];

export function buildMessageMenu(m: Message, opts: { onReact?: () => void } = {}): MenuItem[] {
  const channel = useGuildStore.getState().channels[m.channel_id];
  const perms = channelPermissionsFor(channel, me());
  const own = m.author.id === me();
  const isDM = !m.guild_id;
  const canManage = has(perms, Permissions.MANAGE_MESSAGES);
  const items: MenuItem[] = [];
  if (has(perms, Permissions.ADD_REACTIONS)) {
    items.push({
      label: 'Add Reaction',
      submenu: [
        ...QUICK_REACTIONS.map((e) => ({ label: e, onClick: () => void toggleReaction(m, e) })),
        ...(opts.onReact ? [{ separator: true }, { label: 'View More', onClick: opts.onReact }] : []),
      ],
    });
  }
  if (has(perms, Permissions.SEND_MESSAGES)) items.push({ label: 'Reply', onClick: () => useUIStore.getState().setReplyTo(m.channel_id, m.id) });
  if (own && m.type !== 7) items.push({ label: 'Edit Message', onClick: () => useUIStore.getState().setEditing({ channelId: m.channel_id, messageId: m.id }) });
  if (canManage || isDM) items.push({ label: m.pinned ? 'Unpin Message' : 'Pin Message', onClick: () => void setPinned(m, !m.pinned) });
  if (m.content) items.push({ label: 'Copy Text', onClick: () => { void copyText(m.content); toast('Copied text', 'success'); } });
  items.push({
    label: 'Mark Unread', onClick: () => {
      const list = useMessageStore.getState().get(m.channel_id).messages;
      const idx = list.findIndex((x) => x.id === m.id);
      const prev = idx > 0 ? list[idx - 1].id : null;
      useReadStateStore.getState().upsertReadState({ channel_id: m.channel_id, last_read_message_id: prev, mention_count: 0 });
    },
  });
  items.push({ label: 'Copy Message Link', onClick: () => { void copyText(`${location.origin}/channels/${m.guild_id ?? '@me'}/${m.channel_id}?m=${m.id}`); toast('Link copied', 'success'); } });
  if (own || canManage) {
    items.push({ separator: true }, {
      label: 'Delete Message', danger: true,
      onClick: () => confirmDeleteMessage(m),
    });
  }
  items.push({ separator: true }, copyId(m.id));
  return items;
}

export function confirmDeleteMessage(m: Message) {
  confirmDialog({
    title: 'Delete Message', danger: true, confirmLabel: 'Delete',
    body: 'Are you sure you want to delete this message? This cannot be undone.',
    onConfirm: () => deleteMessage(m.channel_id, m.id),
  });
}

export function openUserPopoutAt(userId: string, guildId: string | null, el: Element, placement: 'right' | 'left' = 'right') {
  const r = el.getBoundingClientRect();
  useUIStore.getState().openPopout({ kind: 'user', userId, guildId, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement });
}

function relationshipItems(userId: string): MenuItem[] {
  if (userId === me()) return [];
  const rel = useRelationshipStore.getState().relationships[userId];
  const items: MenuItem[] = [];
  if (!rel) items.push({ label: 'Add Friend', onClick: guarded(async () => { const u = useGuildStore.getState().users[userId]; await sendFriendRequest(u?.username ?? ''); toast('Friend request sent', 'success'); }) });
  else if (rel.type === RelationshipType.FRIEND) items.push({ label: 'Remove Friend', danger: true, onClick: guarded(() => removeRelationship(userId)) });
  else if (rel.type === RelationshipType.PENDING_INCOMING) items.push({ label: 'Accept Friend Request', onClick: guarded(() => acceptFriend(userId)) });
  else if (rel.type === RelationshipType.PENDING_OUTGOING) items.push({ label: 'Cancel Friend Request', onClick: guarded(() => removeRelationship(userId)) });
  if (rel?.type === RelationshipType.BLOCKED) items.push({ label: 'Unblock', onClick: guarded(() => removeRelationship(userId)) });
  else items.push({ label: 'Block', danger: true, onClick: guarded(() => blockUser(userId)) });
  return items;
}

export function buildUserMenu(userId: string, anchor?: Element): MenuItem[] {
  const items: MenuItem[] = [];
  if (anchor) items.push({ label: 'Profile', onClick: () => openUserPopoutAt(userId, null, anchor) });
  if (userId !== me()) items.push({ label: 'Message', onClick: guarded(() => openDM([userId])) });
  const rel = relationshipItems(userId);
  if (rel.length) items.push({ separator: true }, ...rel);
  items.push({ separator: true }, copyId(userId));
  return items;
}

export function buildMemberMenu(guildId: string, userId: string, anchor?: Element): MenuItem[] {
  const s = useGuildStore.getState();
  const g = s.guilds[guildId];
  const member = s.members[guildId]?.[userId];
  if (!g) return buildUserMenu(userId, anchor);
  const perms = guildPermissionsFor(guildId, me());
  const isMe = userId === me();
  const actOn = canActOn(guildId, userId);
  const items: MenuItem[] = [];
  if (anchor) items.push({ label: 'Profile', onClick: () => openUserPopoutAt(userId, guildId, anchor) });
  if (!isMe) items.push({ label: 'Message', onClick: guarded(() => openDM([userId])) });
  const name = displayName(userId, guildId);

  if ((isMe && has(perms, Permissions.CHANGE_NICKNAME)) || (!isMe && has(perms, Permissions.MANAGE_NICKNAMES) && actOn) || (isMe && has(perms, Permissions.MANAGE_NICKNAMES))) {
    items.push({ label: isMe ? 'Edit Server Profile' : 'Change Nickname', onClick: () => openModal('nickname', { guildId, userId }) });
  }
  const rel = relationshipItems(userId);
  if (rel.length) items.push({ separator: true }, ...rel.filter((r) => !r.danger || r.label === 'Remove Friend'));

  if (member && has(perms, Permissions.MANAGE_ROLES)) {
    const myPos = myHighestPosition(guildId);
    const roles = sortedRoles(s.roles[guildId]).filter((r) => r.id !== guildId);
    if (roles.length) {
      items.push({ separator: true }, {
        label: 'Roles',
        submenu: roles.map((r) => {
          const hasRole = member.roles.includes(r.id);
          return {
            label: r.name, checked: hasRole, disabled: r.position >= myPos,
            color: r.color ? intToHex(r.color) : undefined,
            onClick: guarded(() => updateMember(guildId, userId, { roles: hasRole ? member.roles.filter((x) => x !== r.id) : [...member.roles, r.id] })),
          };
        }),
      });
    }
  }

  const voice = useVoiceStore.getState().states[userId];
  const inGuildVoice = voice && voice.guild_id === guildId;
  if (inGuildVoice && (has(perms, Permissions.MUTE_MEMBERS) || has(perms, Permissions.DEAFEN_MEMBERS) || has(perms, Permissions.MOVE_MEMBERS))) {
    items.push({ separator: true });
    if (has(perms, Permissions.MUTE_MEMBERS)) items.push({ label: 'Server Mute', checked: !!member?.mute, onClick: guarded(() => updateMember(guildId, userId, { mute: !member?.mute })) });
    if (has(perms, Permissions.DEAFEN_MEMBERS)) items.push({ label: 'Server Deafen', checked: !!member?.deaf, onClick: guarded(() => updateMember(guildId, userId, { deaf: !member?.deaf })) });
    if (has(perms, Permissions.MOVE_MEMBERS)) {
      const voiceChannels = Object.values(s.channels).filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_VOICE && c.id !== voice.channel_id);
      if (voiceChannels.length) items.push({ label: 'Move To', submenu: voiceChannels.map((c) => ({ label: c.name || '', onClick: guarded(() => updateMember(guildId, userId, { channel_id: c.id })) })) });
      items.push({ label: 'Disconnect', danger: true, onClick: guarded(() => updateMember(guildId, userId, { channel_id: null })) });
    }
  }

  if (!isMe && actOn && (has(perms, Permissions.MODERATE_MEMBERS) || has(perms, Permissions.KICK_MEMBERS) || has(perms, Permissions.BAN_MEMBERS))) {
    items.push({ separator: true });
    if (has(perms, Permissions.MODERATE_MEMBERS)) {
      const timedOut = member?.communication_disabled_until && Date.parse(member.communication_disabled_until) > Date.now();
      if (timedOut) items.push({ label: 'Remove Timeout', onClick: guarded(() => updateMember(guildId, userId, { communication_disabled_until: null })) });
      else items.push({ label: `Timeout ${name}`, danger: true, onClick: () => openModal('timeout', { guildId, userId }) });
    }
    if (has(perms, Permissions.KICK_MEMBERS)) items.push({
      label: `Kick ${name}`, danger: true,
      onClick: () => confirmDialog({
        title: `Kick '${name}' from server`, danger: true, confirmLabel: 'Kick',
        body: <>Are you sure you want to kick <strong>{name}</strong> from <strong>{g.name}</strong>? They can rejoin with a new invite.</>,
        onConfirm: () => kickMember(guildId, userId),
      }),
    });
    if (has(perms, Permissions.BAN_MEMBERS)) items.push({ label: `Ban ${name}`, danger: true, onClick: () => openModal('ban', { guildId, userId }) });
  }
  items.push({ separator: true }, copyId(userId));
  return items;
}
