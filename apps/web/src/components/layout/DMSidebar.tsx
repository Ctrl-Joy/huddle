import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelType, type Channel } from '@huddle/shared';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, openModal } from '../../stores/ui';
import { useChannelUnread } from '../../stores/readStates';
import { usePendingIncomingCount } from '../../stores/relationships';
import { useCustomStatus } from '../../stores/presences';
import { Avatar, Badge, GuildIcon, Tooltip } from '../common/Avatar';
import { IconPlus, IconUsers } from '../common/icons';
import { buildChannelMenu, buildUserMenu } from '../menus/menus';
import { pluralize } from '../../lib/format';
import { useVoiceStore } from '../../stores/voice';

export function DMSidebar({ activeChannelId }: { activeChannelId?: string }) {
  const channels = useGuildStore((s) => s.channels);
  const pending = usePendingIncomingCount();
  const nav = useNavigate();
  const dms = useMemo(() => Object.values(channels)
    .filter((c) => c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM)
    .sort((a, b) => (BigInt(b.last_message_id || b.id) > BigInt(a.last_message_id || a.id) ? 1 : -1)), [channels]);

  return (
    <div className="channel-sidebar">
      <div className="sidebar-header">
        <button className="search-trigger" onClick={() => openModal('quickSwitcher')}>Find or start a conversation</button>
      </div>
      <div className="channel-list scroll-thin">
        <button className={'dm-nav' + (!activeChannelId ? ' active' : '')} onClick={() => nav('/channels/@me')}>
          <IconUsers size={20} /><span>Friends</span>{pending > 0 && <Badge count={pending} />}
        </button>
        <div className="dm-section-header">
          <span>Direct Messages</span>
          <Tooltip label="Create DM">
            <button className="icon-btn tiny" aria-label="Create DM" onClick={() => openModal('createGroupDM')}><IconPlus size={16} /></button>
          </Tooltip>
        </div>
        {dms.map((c) => <DMRow key={c.id} channel={c} active={c.id === activeChannelId} />)}
        {!dms.length && (
          <div className="dm-empty">
            {[0, 1, 2, 3].map((i) => <div key={i} className="dm-skeleton" style={{ opacity: 1 - i * 0.22 }}><span /><span /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function DMRow({ channel, active }: { channel: Channel; active: boolean }) {
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user!.id);
  const { unread, mentions } = useChannelUnread(channel.id);
  const other = channel.type === ChannelType.DM ? channel.recipients?.find((r) => r.id !== me) : undefined;
  const custom = useCustomStatus(other?.id);
  const inCall = useVoiceStore((s) => Object.values(s.states).some((v) => v.channel_id === channel.id));
  const name = channelDisplayName(channel, me);
  const isGroup = channel.type === ChannelType.GROUP_DM;
  return (
    <div
      className={'dm-row' + (active ? ' active' : '') + (unread && !active ? ' unread' : '')}
      onClick={() => nav(`/channels/@me/${channel.id}`)}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, other ? [...buildUserMenu(other.id, e.currentTarget)] : buildChannelMenu(channel))}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') nav(`/channels/@me/${channel.id}`); }}
    >
      {isGroup || !other
        ? <GuildIcon guild={{ id: channel.id, name, icon: channel.icon ?? null }} size={32} className="dm-group-icon" />
        : <Avatar user={other} size={32} status="auto" ring="var(--bg-sidebar)" />}
      <div className="dm-text">
        <span className="dm-name truncate">{name}</span>
        {isGroup ? <span className="dm-sub">{pluralize((channel.recipients?.length ?? 0), 'Member')}</span>
          : inCall ? <span className="dm-sub accent">In a call</span>
          : custom ? <span className="dm-sub truncate">{custom}</span> : null}
      </div>
      {mentions > 0 && !active && <Badge count={mentions} />}
    </div>
  );
}
