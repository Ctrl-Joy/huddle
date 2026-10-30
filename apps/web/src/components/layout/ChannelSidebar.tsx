import { useMemo, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelType, Permissions, has, type Channel, type VoiceState } from '@huddle/shared';
import { useGuildStore, sortChannels, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, openModal } from '../../stores/ui';
import { useChannelUnread } from '../../stores/readStates';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useCan, useGuildPermissions, channelPermissionsFor } from '../../lib/permissions';
import { channelVisible } from '../../lib/permissionsCore';
import { Avatar, Badge, Tooltip } from '../common/Avatar';
import {
  IconChevronDown, IconChevronRight, IconHash, IconHeadphonesOff, IconLock, IconMicOff, IconPlus, IconSettings,
  IconSpeaker, IconUserPlus, IconVideo, IconClose, IconBellOff,
} from '../common/icons';
import { buildChannelMenu, buildGuildMenu, buildMemberMenu, openUserPopoutAt } from '../menus/menus';
import { toast } from '../../stores/ui';

export function isPrivateChannel(c: Channel): boolean {
  return !!c.guild_id && c.permission_overwrites.some((o) => o.id === c.guild_id && (BigInt(o.deny) & Permissions.VIEW_CHANNEL) !== 0n);
}

export function ChannelSidebar({ guildId, activeChannelId }: { guildId: string; activeChannelId?: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const me = useAuthStore((s) => s.user!.id);
  useGuildStore((s) => s.members[guildId]?.[me]);
  useGuildStore((s) => s.roles[guildId]);
  const collapsed = useUIStore((s) => s.collapsedCategories);
  const headerRef = useRef<HTMLButtonElement>(null);
  const perms = useGuildPermissions(guildId);
  const menuOpen = useUIStore((s) => s.contextMenu?.tag === 'guild-header:' + guildId);

  const tree = useMemo(() => {
    const all = Object.values(channels).filter((c) => c.guild_id === guildId);
    const categories = all.filter((c) => c.type === ChannelType.GUILD_CATEGORY).sort(sortChannels);
    const visible = all.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && channelVisible(c, me));
    const byParent = new Map<string | null, Channel[]>();
    for (const c of visible) {
      const p = c.parent_id && categories.some((x) => x.id === c.parent_id) ? c.parent_id : null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(c);
    }
    for (const list of byParent.values()) list.sort(sortChannels);
    const canManage = has(perms, Permissions.MANAGE_CHANNELS);
    return {
      root: byParent.get(null) || [],
      // hide empty categories unless you can manage channels
      categories: categories.filter((cat) => canManage || (byParent.get(cat.id)?.length ?? 0) > 0).map((cat) => ({ cat, children: byParent.get(cat.id) || [] })),
    };
  }, [channels, guildId, me, perms]);

  if (!guild) return null;

  const openHeaderMenu = () => {
    const r = headerRef.current!.getBoundingClientRect();
    const ui = useUIStore.getState();
    if (menuOpen) { ui.closeContextMenu(); return; }
    ui.openContextMenu({ clientX: r.left + 8, clientY: r.bottom + 6 }, buildGuildMenu(guildId), { tag: 'guild-header:' + guildId, width: r.width - 16 });
  };

  return (
    <div className="channel-sidebar">
      <button ref={headerRef} className={'sidebar-header guild-header' + (menuOpen ? ' open' : '')} onClick={openHeaderMenu}>
        <span className="truncate">{guild.name}</span>
        {menuOpen ? <IconClose size={18} /> : <IconChevronDown size={18} />}
      </button>
      <div className="channel-list scroll-thin" onContextMenu={(e) => { if (e.target === e.currentTarget) useUIStore.getState().openContextMenu(e, buildGuildMenu(guildId)); }}>
        {tree.root.map((c) => <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} />)}
        {tree.categories.map(({ cat, children }) => {
          const isCollapsed = !!collapsed[cat.id];
          const shown = isCollapsed ? children.filter((c) => c.id === activeChannelId || c.type === ChannelType.GUILD_VOICE) : children;
          return (
            <div key={cat.id} className="category">
              <CategoryHeader channel={cat} collapsed={isCollapsed} guildId={guildId} />
              {shown.map((c) => <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} hideParticipants={isCollapsed && c.type === ChannelType.GUILD_VOICE} />)}
            </div>
          );
        })}
        {!tree.root.length && !tree.categories.length && (
          <div className="sidebar-empty">No channels you can see yet.</div>
        )}
      </div>
    </div>
  );
}

function CategoryHeader({ channel, collapsed, guildId }: { channel: Channel; collapsed: boolean; guildId: string }) {
  const canManage = useCan(channel.id, Permissions.MANAGE_CHANNELS);
  return (
    <div className="category-header" onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildChannelMenu(channel))}>
      <button className="category-toggle" onClick={() => useUIStore.getState().toggleCategory(channel.id)} aria-expanded={!collapsed}>
        {collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
        <span className="truncate">{channel.name}</span>
      </button>
      {canManage && (
        <Tooltip label="Create Channel">
          <button className="icon-btn tiny" aria-label="Create Channel" onClick={() => openModal('createChannel', { guildId, parentId: channel.id })}><IconPlus size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}

function ChannelRow({ channel, active, hideParticipants }: { channel: Channel; active: boolean; hideParticipants?: boolean }) {
  const nav = useNavigate();
  const { unread, mentions, muted } = useChannelUnread(channel.id);
  const me = useAuthStore((s) => s.user!.id);
  const perms = channelPermissionsFor(channel, me);
  const voice = channel.type === ChannelType.GUILD_VOICE;
  const priv = isPrivateChannel(channel);
  const connected = useVoiceStore((s) => s.connection?.channelId === channel.id);
  const states = useVoiceStore((s) => s.states);
  const participants = useMemo(() => Object.values(states).filter((v) => v.channel_id === channel.id), [states, channel.id]);

  const onClick = () => {
    if (voice) {
      if (!has(perms, Permissions.CONNECT)) { toast("You don't have permission to connect to this channel.", 'error'); return; }
      if (!connected) voiceActions.join(channel.id, channel.guild_id);
    }
    nav(`/channels/${channel.guild_id}/${channel.id}`);
  };

  const Icon = voice ? IconSpeaker : IconHash;
  return (
    <>
      <div
        className={'channel-row' + (active ? ' active' : '') + (unread && !muted && !active ? ' unread' : '') + (muted ? ' muted' : '') + (connected ? ' connected' : '')}
        onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildChannelMenu(channel))}
      >
        {unread && !muted && !active && <span className="unread-pill" />}
        <button className="channel-link" onClick={onClick} aria-current={active ? 'page' : undefined}>
          <span className="channel-icon">
            <Icon size={18} />
            {priv && <span className="channel-lock"><IconLock size={9} strokeWidth={3} /></span>}
          </span>
          <span className="channel-name truncate">{channel.name}</span>
          {muted && <IconBellOff size={14} className="channel-muted-icon" />}
        </button>
        <span className="channel-actions">
          {has(perms, Permissions.CREATE_INVITE) && (
            <Tooltip label="Create Invite">
              <button className="icon-btn tiny" aria-label="Create Invite" onClick={() => openModal('invite', { guildId: channel.guild_id, channelId: channel.id })}><IconUserPlus size={15} /></button>
            </Tooltip>
          )}
          {has(perms, Permissions.MANAGE_CHANNELS) && (
            <Tooltip label="Edit Channel">
              <button className="icon-btn tiny" aria-label="Edit Channel" onClick={() => openModal('channelSettings', { channelId: channel.id })}><IconSettings size={15} /></button>
            </Tooltip>
          )}
        </span>
        {mentions > 0 && !active && <Badge count={mentions} className="channel-badge" />}
      </div>
      {voice && !hideParticipants && participants.length > 0 && (
        <div className="voice-participants">
          {participants.map((p) => <VoiceParticipantRow key={p.user_id} state={p} guildId={channel.guild_id!} />)}
        </div>
      )}
    </>
  );
}

function VoiceParticipantRow({ state, guildId }: { state: VoiceState; guildId: string }) {
  const speaking = useVoiceStore((s) => !!s.speaking[state.user_id]);
  const name = useGuildStore(() => displayName(state.user_id, guildId));
  useGuildStore((s) => s.members[guildId]?.[state.user_id]);
  const onClick = (e: MouseEvent) => openUserPopoutAt(state.user_id, guildId, e.currentTarget, 'right');
  return (
    <div
      className="voice-participant"
      onClick={onClick}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildMemberMenu(guildId, state.user_id, e.currentTarget))}
    >
      <Avatar userId={state.user_id} size={22} speaking={speaking} />
      <span className="truncate">{name}</span>
      <span className="vp-icons">
        {state.self_stream && <span className="live-pill">LIVE</span>}
        {state.self_video && <IconVideo size={14} />}
        {(state.mute || state.self_mute) && !state.self_deaf && !state.deaf && <IconMicOff size={14} className={state.mute ? 'server-flag' : ''} />}
        {(state.deaf || state.self_deaf) && <IconHeadphonesOff size={14} className={state.deaf ? 'server-flag' : ''} />}
      </span>
    </div>
  );
}
