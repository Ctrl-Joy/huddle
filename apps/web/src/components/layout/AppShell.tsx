import { useEffect, useMemo, useRef } from 'react';
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
import { useSwipePanels } from './useSwipePanels';
import { ForumView } from '../threads/ForumView';
import { DISCOVER_PATH, DiscoverSidebar, DiscoverView, parseDiscoverPage } from '../discover/Discover';

export function AppShell() {
  const { guildId = '@me', channelId } = useParams();
  const isDiscover = guildId === 'discover';
  const isHome = guildId === '@me' || isDiscover; // discover borrows the home shell (no guild)
  const discoverPage = isDiscover ? parseDiscoverPage(channelId) : null;
  const guild = useGuildStore((s) => (isHome ? undefined : s.guilds[guildId]));
  const channel = useGuildStore((s) => (channelId ? s.channels[channelId] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => (isHome ? undefined : s.members[guildId]));
  const roles = useGuildStore((s) => (isHome ? undefined : s.roles[guildId]));
  const me = useAuthStore((s) => s.user!.id);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const mobileMembersOpen = useUIStore((s) => s.mobileMembersOpen);
  const bodyRef = useRef<HTMLDivElement>(null);
  useAppEffects();
  useSwipePanels(bodyRef);

  // which channel to land on when none given / not visible
  const fallbackChannel = useMemo(() => {
    if (isHome || !guild) return null;
    const last = getLastChannel(guildId);
    const lc = last ? channels[last] : undefined;
    if (lc && lc.guild_id === guildId && isLandable(lc.type) && channelVisible(lc, me)) return lc.id;
    const text = Object.values(channels)
      .filter((c) => c.guild_id === guildId && (c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT) && channelVisible(c, me));
    // order by category position then channel position
    const catPos = (c: typeof text[number]) => (c.parent_id ? channels[c.parent_id]?.position ?? 0 : -1);
    text.sort((a, b) => catPos(a) - catPos(b) || sortChannels(a, b));
    return text[0]?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome, guild, guildId, channels, me, members, roles]);

  const valid = !isDiscover && !!channel && (isHome ? !channel.guild_id : channel.guild_id === guildId && channelVisible(channel, me));

  useEffect(() => {
    useViewStore.getState().set({ guildId: isHome ? null : guildId, channelId: valid ? channelId ?? null : null });
    if (!isHome && valid && channelId && channel && isLandable(channel.type)) setLastChannel(guildId, channelId);
    useUIStore.getState().setMobileNav(false);
    useUIStore.getState().setMobileMembers(false);
  }, [guildId, channelId, valid, isHome, channel?.type]);

  useEffect(() => { useUIStore.getState().closeSearch(); }, [guildId]);

  useEffect(() => { if (!isHome && guild) void fetchMembers(guildId); }, [guildId, isHome, guild]);

  if (!isHome && !guild) return <Navigate to="/channels/@me" replace />;
  // threads live beside their parent: /channels/g/<thread> → /channels/g/<parent>?thread=<thread>
  if (valid && channel?.type === ChannelType.PUBLIC_THREAD && channel.parent_id) {
    const params = new URLSearchParams(location.search);
    params.set('thread', channel.id);
    return <Navigate to={`/channels/${guildId}/${channel.parent_id}?${params}`} replace />;
  }
  if (!isHome && (!channelId || !valid) && fallbackChannel && fallbackChannel !== channelId) {
    return <Navigate to={`/channels/${guildId}/${fallbackChannel}`} replace />;
  }
  if (isDiscover && discoverPage === undefined) return <Navigate to={DISCOVER_PATH} replace />;
  if (isHome && !isDiscover && channelId && !valid) return <Navigate to="/channels/@me" replace />;

  let main;
  if (isDiscover) main = <DiscoverView page={discoverPage ?? null} />;
  else if (isHome && !channelId) main = <FriendsHome />;
  else if (channel && valid && channel.type === ChannelType.GUILD_VOICE) main = <VoiceView channel={channel} />;
  else if (channel && valid && channel.type === ChannelType.GUILD_FORUM) main = <ForumView key={channel.id} channel={channel} />;
  else if (channel && valid) main = <ChatView key={channel.id} channel={channel} />;
  else main = <EmptyGuild />;

  return (
    <div className={'app' + (mobileNavOpen ? ' mobile-nav-open' : '') + (mobileMembersOpen ? ' mobile-members-open' : '')}>
      <ConnectionBanner />
      <div className="app-body" ref={bodyRef}>
        <nav className="nav-column" aria-label="Navigation">
          <ServerRail activeGuildId={isHome ? null : guildId} discover={isDiscover} />
          <aside className="sidebar">
            {isDiscover ? <DiscoverSidebar page={discoverPage ?? null} /> : isHome ? <DMSidebar activeChannelId={channelId} /> : <ChannelSidebar guildId={guildId} activeChannelId={channelId} />}
            <VoicePanel />
            <UserPanel />
          </aside>
        </nav>
        <div className="mobile-scrim" onClick={() => { useUIStore.getState().setMobileNav(false); useUIStore.getState().setMobileMembers(false); }} />
        <main className="main">{main}</main>
      </div>
      <IncomingCall />
      <Layers />
    </div>
  );
}

/** Channels you can land on / be returned to. */
function isLandable(type: number): boolean {
  return type === ChannelType.GUILD_TEXT || type === ChannelType.GUILD_ANNOUNCEMENT || type === ChannelType.GUILD_FORUM;
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
