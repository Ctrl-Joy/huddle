import { useState, type DragEvent, type MouseEvent as RMouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { useGuildUnread, usePrivateUnread } from '../../stores/readStates';
import { usePendingIncomingCount } from '../../stores/relationships';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, openModal } from '../../stores/ui';
import { getLastChannel } from '../../lib/nav';
import { Avatar, Badge, GuildIcon, Tooltip } from '../common/Avatar';
import { IconCompass, IconPlus, LogoMark } from '../common/icons';
import { buildGuildMenu } from '../menus/menus';
import { useVoiceStore } from '../../stores/voice';
import { ChannelType } from '@huddle/shared';

export function ServerRail({ activeGuildId }: { activeGuildId: string | null }) {
  const order = useGuildStore((s) => s.guildOrder);
  const guilds = useGuildStore((s) => s.guilds);
  const nav = useNavigate();
  const pending = usePendingIncomingCount();
  const dmUnread = usePrivateUnread();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDrop = (target: string) => {
    if (!dragId || dragId === target) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(target), 0, dragId);
    useGuildStore.getState().setGuildOrder(next);
    setDragId(null); setOverId(null);
  };

  return (
    <div className="server-rail" role="tree" aria-label="Servers">
      <RailItem active={activeGuildId === null} label="Direct Messages" badge={pending} onClick={() => nav('/channels/@me')}>
        <span className="rail-home"><LogoMark size={30} /></span>
      </RailItem>
      {dmUnread.slice(0, 5).map(({ channelId, mentions }) => <DMUnreadItem key={channelId} channelId={channelId} mentions={mentions} />)}
      <div className="rail-sep" />
      {order.map((id) => guilds[id] && (
        <div
          key={id}
          className={'rail-drag' + (overId === id && dragId !== id ? ' drop-target' : '')}
          draggable
          onDragStart={(e: DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); setOverId(id); }}
          onDragLeave={() => setOverId((o) => (o === id ? null : o))}
          onDrop={() => onDrop(id)}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
        >
          <GuildRailItem guildId={id} active={activeGuildId === id} />
        </div>
      ))}
      <RailItem label="Add a Server" className="rail-action" onClick={() => openModal('createServer')}>
        <span className="rail-action-icon"><IconPlus size={22} /></span>
      </RailItem>
      <RailItem label="Join a Server" className="rail-action" onClick={() => openModal('joinServer')}>
        <span className="rail-action-icon"><IconCompass size={22} /></span>
      </RailItem>
    </div>
  );
}

function RailItem({ active, unread, label, badge, onClick, onContextMenu, children, className }: {
  active?: boolean; unread?: boolean; label: string; badge?: number; onClick: () => void;
  onContextMenu?: (e: RMouseEvent) => void; children: ReactNode; className?: string;
}) {
  return (
    <div className={'rail-item' + (active ? ' active' : '') + (unread ? ' unread' : '') + (className ? ' ' + className : '')}>
      <span className="rail-pill" />
      <Tooltip label={label} side="right">
        <button className="rail-button" aria-label={label} onClick={onClick} onContextMenu={onContextMenu}>
          {children}
          {badge ? <Badge count={badge} className="rail-badge" /> : null}
        </button>
      </Tooltip>
    </div>
  );
}

function GuildRailItem({ guildId, active }: { guildId: string; active: boolean }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const { unread, mentions } = useGuildUnread(guildId);
  const inVoice = useVoiceStore((s) => s.connection?.guildId === guildId);
  const nav = useNavigate();
  if (!guild) return null;
  return (
    <RailItem
      active={active}
      unread={unread}
      label={guild.name}
      badge={mentions}
      onClick={() => { const last = getLastChannel(guildId); nav(`/channels/${guildId}${last ? '/' + last : ''}`); }}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildGuildMenu(guildId))}
    >
      <GuildIcon guild={guild} size={48} />
      {inVoice && <span className="rail-voice-dot" title="Connected to voice" />}
    </RailItem>
  );
}

function DMUnreadItem({ channelId, mentions }: { channelId: string; mentions: number }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const me = useAuthStore((s) => s.user!.id);
  const nav = useNavigate();
  if (!channel) return null;
  const other = channel.recipients?.find((r) => r.id !== me);
  const name = channelDisplayName(channel, me);
  return (
    <RailItem label={name} badge={mentions} unread onClick={() => nav(`/channels/@me/${channelId}`)}>
      {channel.type === ChannelType.GROUP_DM || !other
        ? <GuildIcon guild={{ id: channel.id, name, icon: channel.icon ?? null }} size={48} />
        : <Avatar user={other} size={48} />}
    </RailItem>
  );
}
