import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ChannelType, MessageType, Permissions, type Channel } from '@huddle/shared';
import { useMessageStore, type ClientMessage } from '../../stores/messages';
import { useReadStateStore } from '../../stores/readStates';
import { useAuthStore } from '../../stores/auth';
import { useViewStore } from '../../stores/view';
import { useGuildStore, channelDisplayName, displayName } from '../../stores/guilds';
import { useCan } from '../../lib/permissions';
import { ackChannel } from '../../lib/actions';
import { formatDivider, formatTime, formatTimestamp, isSameDay } from '../../lib/format';
import { IconCheck } from '../common/icons';
import { MessageItem } from './MessageItem';
import { Avatar, Spinner } from '../common/Avatar';
import { IconHash, IconAt, IconThread } from '../common/icons';

const GROUP_MS = 7 * 60 * 1000;

function shouldGroup(prev: ClientMessage | undefined, m: ClientMessage): boolean {
  if (!prev) return false;
  if (prev.author.id !== m.author.id) return false;
  if (m.message_reference || m.type === MessageType.REPLY) return false;
  if (m.type !== MessageType.DEFAULT || (prev.type !== MessageType.DEFAULT && prev.type !== MessageType.REPLY)) return false;
  if (!isSameDay(prev.created_at, m.created_at)) return false;
  return new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS;
}

export function MessageList({ channel }: { channel: Channel }) {
  const channelId = channel.id;
  const state = useMessageStore((s) => s.channels[channelId]);
  const jumpTarget = useMessageStore((s) => s.jumpTarget);
  const me = useAuthStore((s) => s.user!.id);
  const canRead = useCan(channelId, Permissions.READ_MESSAGE_HISTORY);
  const lastMessageId = useGuildStore((s) => s.channels[channelId]?.last_message_id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prependAnchor = useRef<{ height: number; top: number } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [visible, setVisible] = useState(!document.hidden);

  // snapshot of the read marker when the channel was opened → "new messages" divider
  const [unreadMarker] = useState(() => useReadStateStore.getState().readStates[channelId]?.last_read_message_id ?? null);
  const [hadReadState] = useState(() => !!useReadStateStore.getState().readStates[channelId]);
  // only messages that already existed when the channel was opened can be 'new'
  const [mountLast] = useState(() => useGuildStore.getState().channels[channelId]?.last_message_id ?? null);

  const messages = state?.messages ?? [];
  const loaded = state?.loaded ?? false;
  const loading = state?.loading ?? false;
  const hasMoreBefore = state?.hasMoreBefore ?? true;
  const hasMoreAfter = state?.hasMoreAfter ?? false;

  useEffect(() => { void useMessageStore.getState().fetchInitial(channelId); }, [channelId]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // keep position when prepending; stick to bottom when appending
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependAnchor.current) {
      const { height, top } = prependAnchor.current;
      el.scrollTop = el.scrollHeight - height + top;
      prependAnchor.current = null;
    } else if (atBottomRef.current && !jumpTarget) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, jumpTarget]);

  // images/videos loading change height — keep stuck to bottom
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atBottomRef.current) scrollToBottom(); });
    ro.observe(content);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // jump-to-message: scroll into view and highlight
  useEffect(() => {
    if (!jumpTarget || jumpTarget.channelId !== channelId) return;
    const el = scrollRef.current?.querySelector(`[data-mid="${jumpTarget.messageId}"]`);
    if (el) {
      atBottomRef.current = false;
      el.scrollIntoView({ block: 'center' });
      setHighlight(jumpTarget.messageId);
      useMessageStore.getState().clearJump();
    }
  }, [jumpTarget, channelId, messages]);

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [highlight]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottomRef.current = bottom && !hasMoreAfter;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (el.scrollTop < 400 && hasMoreBefore && !loading && loaded && canRead) {
      prependAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
      void useMessageStore.getState().fetchBefore(channelId).then(() => requestAnimationFrame(() => { prependAnchor.current = null; }));
    }
    if (bottom && hasMoreAfter && !loading) void useMessageStore.getState().fetchAfter(channelId);
  };

  // publish view state for notification suppression; ack when at bottom
  const reallyAtBottom = atBottom && !hasMoreAfter;
  useEffect(() => { useViewStore.getState().set({ atBottom: reallyAtBottom }); }, [reallyAtBottom]);
  useEffect(() => () => useViewStore.getState().set({ atBottom: true }), []);
  const lastReal = useMemo(() => { for (let i = messages.length - 1; i >= 0; i--) if (!messages[i]._state) return messages[i].id; return null; }, [messages]);
  useEffect(() => {
    if (!reallyAtBottom || !visible || !loaded) return;
    const target = lastMessageId && lastReal && BigInt(lastMessageId) > BigInt(lastReal) ? lastReal : lastMessageId || lastReal;
    if (target) ackChannel(channelId, target);
  }, [reallyAtBottom, visible, loaded, lastMessageId, lastReal, channelId]);

  const jumpToPresent = () => {
    atBottomRef.current = true;
    if (hasMoreAfter) void useMessageStore.getState().fetchInitial(channelId, true).then(scrollToBottom);
    else scrollToBottom();
    setAtBottom(true);
  };

  // "N new messages since …" bar: unread messages (by the snapshot above) that are loaded right now
  const [newDismissed, setNewDismissed] = useState(false);
  const unread = useMemo(() => {
    if (!hadReadState || !mountLast || newDismissed) return null;
    const isNew = (m: ClientMessage) => !m._state && m.author.id !== me && BigInt(m.id) <= BigInt(mountLast)
      && (unreadMarker === null || BigInt(m.id) > BigInt(unreadMarker));
    const list = messages.filter(isNew);
    if (!list.length) return null;
    const firstReal = messages.find((m) => !m._state);
    // the first unread may be older than what's loaded: then the count is a lower bound
    const partial = hasMoreBefore && firstReal?.id === list[0].id;
    return { count: list.length, partial, first: list[0] };
  }, [messages, hadReadState, mountLast, newDismissed, me, unreadMarker, hasMoreBefore]);
  const markNewRead = () => {
    setNewDismissed(true);
    const last = lastMessageId || lastReal;
    if (last) ackChannel(channelId, last, true);
  };
  const jumpToFirstUnread = () => {
    if (!unread) return;
    atBottomRef.current = false;
    void useMessageStore.getState().jumpTo(channelId, unread.partial && unreadMarker ? unreadMarker : unread.first.id);
  };

  const rows = useMemo(() => {
    const out: ReactElement[] = [];
    let dividerPlaced = newDismissed;
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      if (!prev || !isSameDay(prev.created_at, m.created_at)) {
        out.push(<div key={'d' + m.id} className="day-divider" role="separator"><span>{formatDivider(m.created_at)}</span></div>);
      }
      let isNew = false;
      if (!dividerPlaced && hadReadState && !m._state && m.author.id !== me && mountLast && BigInt(m.id) <= BigInt(mountLast) && (unreadMarker === null || BigInt(m.id) > BigInt(unreadMarker))) {
        isNew = true;
        dividerPlaced = true;
        out.push(<div key={'n' + m.id} className="new-divider" role="separator"><span>NEW</span></div>);
      }
      out.push(
        <MessageItem
          key={m._state ? 'p' + m.nonce : m.id}
          message={m}
          grouped={!isNew && shouldGroup(prev, m) && !(prev && !isSameDay(prev.created_at, m.created_at))}
          highlighted={highlight === m.id}
        />,
      );
    });
    return out;
  }, [messages, highlight, unreadMarker, hadReadState, me, mountLast, newDismissed]);

  return (
    <div className="message-list-wrap">
      {unread && loaded && (
        <div className="new-messages-bar" role="status">
          <button className="new-messages-jump" onClick={jumpToFirstUnread}>
            {unread.count}{unread.partial ? '+' : ''} new message{unread.count === 1 && !unread.partial ? '' : 's'} since {sinceLabel(unread.first.created_at)}
          </button>
          <button className="new-messages-read" onClick={markNewRead}>Mark as read <IconCheck size={14} strokeWidth={3} /></button>
        </div>
      )}
      <div className="message-list scroll-thin" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite">
        <div className="message-list-inner" ref={contentRef}>
          {!canRead ? (
            <div className="no-history">You do not have permission to view the message history of this channel.</div>
          ) : loaded && !hasMoreBefore ? (
            <ChannelIntro channel={channel} />
          ) : (
            <div className="history-loading">{loading ? <Spinner size={22} /> : <span className="skeleton-msgs"><i /><i /><i /></span>}</div>
          )}
          {state?.error && !loaded && <div className="form-error center">{state.error} <button className="btn-link" onClick={() => useMessageStore.getState().fetchInitial(channelId, true)}>Retry</button></div>}
          {rows}
          <div className="list-bottom-spacer" />
        </div>
      </div>
      {(!atBottom || hasMoreAfter) && loaded && (
        <div className="jump-bar">
          <span>{hasMoreAfter ? "You're viewing older messages" : 'Scrolled up'}</span>
          <button onClick={jumpToPresent}>Jump to Present</button>
        </div>
      )}
    </div>
  );
}

/** "3:04 PM" today, otherwise "yesterday at 3:04 PM" / "03/02/2026 3:04 PM". */
function sinceLabel(iso: string): string {
  if (isSameDay(iso, new Date().toISOString())) return formatTime(iso);
  return formatTimestamp(iso).replace(/^Yesterday/, 'yesterday');
}

function ChannelIntro({ channel }: { channel: Channel }) {
  const me = useAuthStore((s) => s.user!.id);
  if (channel.type === ChannelType.DM) {
    const other = channel.recipients?.find((r) => r.id !== me);
    return (
      <div className="channel-intro">
        {other ? <Avatar user={other} size={80} /> : <span className="intro-icon"><IconAt size={40} /></span>}
        <h1>{channelDisplayName(channel, me)}</h1>
        {other && <div className="intro-username">{other.username}</div>}
        <p>This is the beginning of your direct message history with <strong>{channelDisplayName(channel, me)}</strong>.</p>
      </div>
    );
  }
  if (channel.type === ChannelType.GROUP_DM) {
    return (
      <div className="channel-intro">
        <span className="intro-icon"><IconAt size={40} /></span>
        <h1>{channelDisplayName(channel, me)}</h1>
        <p>Welcome to the beginning of the <strong>{channelDisplayName(channel, me)}</strong> group.</p>
      </div>
    );
  }
  if (channel.type === ChannelType.PUBLIC_THREAD) {
    return (
      <div className="channel-intro">
        <span className="intro-icon"><IconThread size={36} /></span>
        <h1>{channel.name}</h1>
        <p>Started by <strong>{displayName(channel.owner_id ?? '', channel.guild_id)}</strong>. Replies here stay out of the main channel.</p>
      </div>
    );
  }
  return (
    <div className="channel-intro">
      <span className="intro-icon"><IconHash size={42} /></span>
      <h1>Welcome to #{channel.name}!</h1>
      <p>This is the start of the #{channel.name} channel.{channel.topic ? ` ${channel.topic}` : ''}</p>
    </div>
  );
}

