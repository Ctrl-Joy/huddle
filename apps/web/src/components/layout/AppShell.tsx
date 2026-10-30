import { useEffect, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChannelType } from '@huddle/shared';
import { useGuildStore, sortChannels } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { useViewStore } from '../../stores/view';
import { channelVisible } from '../../lib/permissionsCore';
import { getLastChannel, setLastChannel } from '../../lib/nav';
import { fetchMembers } from '../../lib/actions';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { DMSidebar } from './DMSidebar';
import { UserPanel } from './UserPanel';
import { VoicePanel } from './VoicePanel';
import { ChatView } from '../chat/ChatView';
import { FriendsHome } from '../friends/FriendsHome';
import { VoiceView } from '../voice/VoiceView';
import { Layers } from './Layers';
import { useAppEffects } from './useAppEffects';
import { ConnectionBanner } from './ConnectionBanner';
import { IncomingCall } from '../voice/IncomingCall';

export function AppShell() {
  const { guildId = '@me', channelId } = useParams();
  const isHome = guildId === '@me';
  const guild = useGuildStore((s) => (isHome ? undefined : s.guilds[guildId]));
  const channel = useGuildStore((s) => (channelId ? s.channels[channelId] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => (isHome ? undefined : s.members[guildId]));
  const roles = useGuildStore((s) => (isHome ? undefined : s.roles[guildId]));
  const me = useAuthStore((s) => s.user!.id);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  useAppEffects();

  // which channel to land on when none given / not visible
  const fallbackChannel = useMemo(() => {
    if (isHome || !guild) return null;
    const last = getLastChannel(guildId);
    const lc = last ? channels[last] : undefined;
    if (lc && lc.guild_id === guildId && lc.type === ChannelType.GUILD_TEXT && channelVisible(lc, me)) return lc.id;
    const text = Object.values(channels)
      .filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT && channelVisible(c, me));
    // order by category position then channel position
    const catPos = (c: typeof text[number]) => (c.parent_id ? channels[c.parent_id]?.position ?? 0 : -1);
    text.sort((a, b) => catPos(a) - catPos(b) || sortChannels(a, b));
    return text[0]?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome, guild, guildId, channels, me, members, roles]);

  const valid = !!channel && (isHome ? !channel.guild_id : channel.guild_id === guildId && channelVisible(channel, me));

  useEffect(() => {
    useViewStore.getState().set({ guildId: isHome ? null : guildId, channelId: valid ? channelId ?? null : null });
    if (!isHome && valid && channelId && channel?.type === ChannelType.GUILD_TEXT) setLastChannel(guildId, channelId);
    useUIStore.getState().setMobileNav(false);
  }, [guildId, channelId, valid, isHome, channel?.type]);

  useEffect(() => { useUIStore.getState().closeSearch(); }, [guildId]);

  useEffect(() => { if (!isHome && guild) void fetchMembers(guildId); }, [guildId, isHome, guild]);

  if (!isHome && !guild) return <Navigate to="/channels/@me" replace />;
  if (!isHome && (!channelId || !valid) && fallbackChannel && fallbackChannel !== channelId) {
    return <Navigate to={`/channels/${guildId}/${fallbackChannel}`} replace />;
  }
  if (isHome && channelId && !valid) return <Navigate to="/channels/@me" replace />;

  let main;
  if (isHome && !channelId) main = <FriendsHome />;
  else if (channel && valid && channel.type === ChannelType.GUILD_VOICE) main = <VoiceView channel={channel} />;
  else if (channel && valid) main = <ChatView key={channel.id} channel={channel} />;
  else main = <EmptyGuild />;

  return (
    <div className={'app' + (mobileNavOpen ? ' mobile-nav-open' : '')}>
      <ConnectionBanner />
      <div className="app-body">
        <nav className="nav-column" aria-label="Navigation">
          <ServerRail activeGuildId={isHome ? null : guildId} />
          <aside className="sidebar">
            {isHome ? <DMSidebar activeChannelId={channelId} /> : <ChannelSidebar guildId={guildId} activeChannelId={channelId} />}
            <VoicePanel />
            <UserPanel />
          </aside>
        </nav>
        <div className="mobile-scrim" onClick={() => useUIStore.getState().setMobileNav(false)} />
        <main className="main">{main}</main>
      </div>
      <IncomingCall />
      <Layers />
    </div>
  );
}

function EmptyGuild() {
  return (
    <div className="empty-state">
      <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
      <h2>No text channels</h2>
      <p>You can't see any text channels here yet. Ask a moderator, or create one if you have permission.</p>
    </div>
  );
}
