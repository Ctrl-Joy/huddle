import { useEffect, useRef, useState } from 'react';
import { ChannelType, type Channel } from '@huddle/shared';
import { useUIStore } from '../../stores/ui';
import { isPhone, usePhone } from '../../lib/usePhone';
import { useAuthStore } from '../../stores/auth';
import { channelDisplayName } from '../../stores/guilds';
import { useStatus } from '../../stores/presences';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { InlineMarkdown } from '../../lib/markdown';
import { Avatar, StatusDot, Tooltip } from '../common/Avatar';
import { IconAt, IconMenu, IconPhone, IconPin, IconSearch, IconUsers, IconVideo, IconClose } from '../common/icons';
import { PinsPopover } from './PinsPopover';
import { ChannelIcon } from '../common/ChannelIcon';
import { ThreadsButton } from '../threads/ThreadsPopover';
import { InboxButton } from './InboxPopover';

export function ChatHeader({ channel }: { channel: Channel }) {
  const me = useAuthStore((s) => s.user!.id);
  const phone = usePhone();
  const memberListOpen = useUIStore((s) => (phone ? s.mobileMembersOpen : s.memberListOpen));
  const [pinsOpen, setPinsOpen] = useState(false);
  const isDM = channel.type === ChannelType.DM;
  const isGroup = channel.type === ChannelType.GROUP_DM;
  const other = isDM ? channel.recipients?.find((r) => r.id !== me) : undefined;
  const otherStatus = useStatus(other?.id);
  const inCall = useVoiceStore((s) => s.connection?.channelId === channel.id);
  const name = channelDisplayName(channel, me);

  const startCall = (video: boolean) => {
    if (!inCall) void voiceActions.startCall(channel.id);
    if (video) setTimeout(() => { if (!useVoiceStore.getState().selfVideo) voiceActions.toggleVideo(); }, 50);
  };

  return (
    <header className="chat-header">
      <button className="icon-btn mobile-only" aria-label="Open navigation" onClick={() => useUIStore.getState().setMobileNav(true)}><IconMenu size={22} /></button>
      <div className="chat-header-title">
        {isDM && other ? (
          <>
            <IconAt size={22} className="header-icon" />
            <span className="header-name">{name}</span>
            <StatusDot status={otherStatus} size={9} ring="var(--bg-chat)" />
          </>
        ) : isGroup ? (
          <>
            <IconUsers size={22} className="header-icon" />
            <span className="header-name">{name}</span>
          </>
        ) : (
          <>
            <ChannelIcon type={channel.type} size={22} className="header-icon" />
            <span className="header-name">{channel.name}</span>
          </>
        )}
        {channel.topic && (
          <>
            <span className="header-divider" />
            <span className="header-topic truncate" title={channel.topic}><InlineMarkdown content={channel.topic} guildId={channel.guild_id} /></span>
          </>
        )}
      </div>
      <div className="chat-header-tools">
        {(isDM || isGroup) && (
          <>
            <Tooltip label={inCall ? 'In call' : 'Start Voice Call'} side="bottom">
              <button className={'icon-btn' + (inCall ? ' active' : '')} aria-label="Start Voice Call" onClick={() => startCall(false)}><IconPhone size={20} /></button>
            </Tooltip>
            <Tooltip label="Start Video Call" side="bottom">
              <button className="icon-btn" aria-label="Start Video Call" onClick={() => startCall(true)}><IconVideo size={20} /></button>
            </Tooltip>
          </>
        )}
        {(channel.type === ChannelType.GUILD_TEXT || channel.type === ChannelType.GUILD_ANNOUNCEMENT) && <ThreadsButton channel={channel} />}
        {channel.type !== ChannelType.GUILD_FORUM && <div className="popover-anchor">
          <Tooltip label="Pinned Messages" side="bottom">
            <button className={'icon-btn' + (pinsOpen ? ' active' : '')} aria-label="Pinned Messages" onClick={() => setPinsOpen((v) => !v)}><IconPin size={20} /></button>
          </Tooltip>
          {pinsOpen && <PinsPopover channel={channel} close={() => setPinsOpen(false)} />}
        </div>}
        <Tooltip label={isDM ? (memberListOpen ? 'Hide User Profile' : 'Show User Profile') : memberListOpen ? 'Hide Member List' : 'Show Member List'} side="bottom">
          <button className={'icon-btn' + (memberListOpen ? ' active' : '')} aria-label="Toggle member list" onClick={() => (isPhone() ? useUIStore.getState().setMobileMembers(true) : useUIStore.getState().toggleMemberList())}>
            {isDM && other ? <Avatar user={other} size={22} /> : <IconUsers size={20} />}
          </button>
        </Tooltip>
        {channel.guild_id && <SearchBox guildId={channel.guild_id} />}
        <InboxButton />
      </div>
    </header>
  );
}

function SearchBox({ guildId }: { guildId: string }) {
  const [q, setQ] = useState(useUIStore.getState().searchGuildId === guildId ? useUIStore.getState().searchQuery : '');
  const searchOpen = useUIStore((s) => s.searchOpen);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!searchOpen) setQ((v) => v); }, [searchOpen]);
  return (
    <div className={'search-box' + (q ? ' has-value' : '')}>
      <input
        ref={ref}
        placeholder="Search"
        value={q}
        aria-label="Search messages"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q.trim()) useUIStore.getState().openSearch(guildId, q.trim());
          if (e.key === 'Escape') { setQ(''); useUIStore.getState().closeSearch(); ref.current?.blur(); }
        }}
      />
      {q ? (
        <button className="search-clear" aria-label="Clear search" onClick={() => { setQ(''); useUIStore.getState().closeSearch(); }}><IconClose size={14} /></button>
      ) : <IconSearch size={14} />}
    </div>
  );
}
