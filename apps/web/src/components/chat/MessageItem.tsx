import { memo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { MessageType, Permissions, type Message } from '@huddle/shared';
import type { ClientMessage } from '../../stores/messages';
import { retryMessage, useMessageStore } from '../../stores/messages';
import { useGuildStore, roleColorFor } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { usePrefs } from '../../stores/prefs';
import { useCan } from '../../lib/permissions';
import { Markdown, InlineMarkdown } from '../../lib/markdown';
import { formatFull, formatTime, formatTimestamp } from '../../lib/format';
import { mentionsMe } from '../../lib/mentionUtil';
import { toggleReaction, deleteMessage } from '../../lib/actions';
import { Avatar, Tooltip } from '../common/Avatar';
import { IconEdit, IconMore, IconReply, IconSmilePlus, IconTrash, IconArrowDown, IconPin, IconUserPlus, IconPhone, IconImage } from '../common/icons';
import { buildMessageMenu, confirmDeleteMessage, openUserPopoutAt } from '../menus/menus';
import { ThreadChip, ThreadToolbarButton } from '../threads/ThreadChip';
import { openThread } from '../../lib/threads';
import { IconThread } from '../common/icons';
import { Attachments } from './Attachments';
import { Reactions } from './Reactions';
import { EditBox } from './EditBox';
import { EmojiPicker } from './EmojiPicker';
import { openModal } from '../../stores/ui';
import { IconForward, IconPoll } from '../common/icons';
import { canForward } from '../menus/menus';
import { PollView, PollResultLine } from './Poll';
import { Embeds } from './Embeds';
import { ForwardedMessage } from './ForwardedMessage';

function useAuthorInfo(m: Message) {
  const guildId = m.guild_id;
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[m.author.id] : undefined));
  const roles = useGuildStore((s) => (guildId ? s.roles[guildId] : undefined));
  const user = useGuildStore((s) => s.users[m.author.id]);
  const u = user || m.author;
  const nick = member?.nick ?? m.member?.nick ?? null;
  const roleIds = member?.roles ?? m.member?.roles ?? [];
  return {
    name: nick || u.display_name || u.username,
    color: roleColorFor(roles, roleIds),
    user: u,
  };
}

export const MessageItem = memo(function MessageItem({ message: m, grouped, highlighted }: { message: ClientMessage; grouped: boolean; highlighted: boolean }) {
  const me = useAuthStore((s) => s.user!);
  usePrefs((s) => s.clock); // re-render timestamps when the 12/24-hour clock changes
  const editing = useUIStore((s) => s.editing?.messageId === m.id);
  const replying = useUIStore((s) => s.replyTo[m.channel_id] === m.id);
  const canManage = useCan(m.channel_id, Permissions.MANAGE_MESSAGES);
  const canReact = useCan(m.channel_id, Permissions.ADD_REACTIONS);
  const canSend = useCan(m.channel_id, Permissions.SEND_MESSAGES);
  const canReadHistory = useCan(m.channel_id, Permissions.READ_MESSAGE_HISTORY);
  const { name, color, user } = useAuthorInfo(m);
  const [pickerOpen, setPickerOpen] = useState(false);
  // only messages that just arrived get the entrance animation (not history loaded on mount)
  const [fresh] = useState(() => Date.now() - Date.parse(m.created_at) < 3000);
  const pickerAnchor = useRef<HTMLButtonElement>(null);
  const own = m.author.id === me.id;
  const pending = m._state === 'pending';
  const failed = m._state === 'failed';
  const mentioned = !own && mentionsMe(m);
  const isSystem = m.type !== MessageType.DEFAULT && m.type !== MessageType.REPLY;

  const openProfile = (e: MouseEvent) => { e.stopPropagation(); openUserPopoutAt(m.author.id, m.guild_id, e.currentTarget); };
  const onContextMenu = (e: MouseEvent) => {
    if (m._state) return;
    if ((e.target as Element).closest('a, img, video')) return;
    useUIStore.getState().openContextMenu(e, buildMessageMenu(m, { onReact: () => setPickerOpen(true) }));
  };

  if (isSystem) return <SystemMessage m={m} name={name} color={color} highlighted={highlighted} />;

  const cls = 'message' + (grouped ? ' grouped' : ' first') + (mentioned ? ' mentioned' : '') + (highlighted ? ' highlighted' : '')
    + (pending ? ' pending' : '') + (failed ? ' failed' : '') + (editing ? ' editing' : '') + (replying ? ' replying' : '') + (pickerOpen ? ' toolbar-pinned' : '') + (fresh ? ' fresh' : '');

  return (
    <div className={cls} data-mid={m.id} onContextMenu={onContextMenu}>
      {m.message_reference && <ReplyPreview m={m} />}
      <div className="message-row">
        <div className="message-gutter">
          {grouped
            ? <Tooltip label={formatFull(m.created_at)}><span className="hover-time">{formatTime(m.created_at)}</span></Tooltip>
            : <Avatar user={user} size={40} onClick={openProfile} className="clickable" />}
        </div>
        <div className="message-main">
          {!grouped && (
            <div className="message-header">
              <button className="author-name" style={color ? { color } : undefined} onClick={openProfile}>{name}</button>
              {user.bot && <span className="bot-tag">BOT</span>}
              <Tooltip label={formatFull(m.created_at)}><time className="message-time" dateTime={m.created_at}>{formatTimestamp(m.created_at)}</time></Tooltip>
            </div>
          )}
          {editing ? (
            <EditBox message={m} />
          ) : (
            m.content && (
              <div className="message-content">
                <Markdown content={m.content} guildId={m.guild_id} />
                {m.edited_at && <Tooltip label={formatFull(m.edited_at)}><span className="edited-tag">(edited)</span></Tooltip>}
              </div>
            )
          )}
          {m.forward && <ForwardedMessage message={m} snap={m.forward} />}
          {m.poll && <PollView message={m} canVote={canReadHistory && !m._state} />}
          {m.attachments.length > 0 && <Attachments message={m} />}
          {!!m.embeds?.length && <Embeds message={m} embeds={m.embeds} canSuppress={own || (canManage && !!m.guild_id)} />}
          {m._progress !== undefined && pending && (
            <div className="upload-progress"><span style={{ width: `${Math.round(m._progress * 100)}%` }} /></div>
          )}
          {failed && (
            <div className="send-failed">
              Message failed to send{m._error ? `: ${m._error}` : ''}.{' '}
              <button className="btn-link" onClick={() => retryMessage(m, me)}>Retry</button>{' · '}
              <button className="btn-link" onClick={() => useMessageStore.getState().removePending(m.channel_id, m.nonce!)}>Delete</button>
            </div>
          )}
          {m.reactions.length > 0 && <Reactions message={m} canReact={canReact} onAdd={() => setPickerOpen(true)} />}
          {m.thread && <ThreadChip message={m} />}
        </div>
      </div>
      {!m._state && !editing && (
        <div className="message-toolbar" role="toolbar">
          {canReact && (
            <Tooltip label="Add Reaction">
              <button ref={pickerAnchor} className="tb-btn" aria-label="Add Reaction" onClick={() => setPickerOpen((v) => !v)}><IconSmilePlus size={18} /></button>
            </Tooltip>
          )}
          <ThreadToolbarButton message={m} />
          {canSend && (
            <Tooltip label="Reply">
              <button className="tb-btn" aria-label="Reply" onClick={() => useUIStore.getState().setReplyTo(m.channel_id, m.id)}><IconReply size={18} /></button>
            </Tooltip>
          )}
          {canForward(m) && (
            <Tooltip label="Forward">
              <button className="tb-btn" aria-label="Forward" onClick={() => openModal('forwardMessage', { message: m })}><IconForward size={18} /></button>
            </Tooltip>
          )}
          {own && (
            <Tooltip label="Edit">
              <button className="tb-btn" aria-label="Edit" onClick={() => useUIStore.getState().setEditing({ channelId: m.channel_id, messageId: m.id })}><IconEdit size={17} /></button>
            </Tooltip>
          )}
          {(own || canManage) && (
            <Tooltip label="Delete">
              <button className="tb-btn danger" aria-label="Delete" onClick={(e) => (e.shiftKey ? void deleteMessage(m.channel_id, m.id) : confirmDeleteMessage(m))}><IconTrash size={17} /></button>
            </Tooltip>
          )}
          <Tooltip label="More">
            <button className="tb-btn" aria-label="More" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              useUIStore.getState().openContextMenu({ clientX: r.left - 190, clientY: r.bottom + 4 }, buildMessageMenu(m, { onReact: () => setPickerOpen(true) }));
            }}><IconMore size={18} /></button>
          </Tooltip>
        </div>
      )}
      {pickerOpen && (
        <EmojiPicker
          anchor={pickerAnchor.current}
          onPick={(e) => { void toggleReaction(m, e); }}
          guildId={m.guild_id}
          close={() => setPickerOpen(false)}
          closeOnPick
        />
      )}
    </div>
  );
});

function ReplyPreview({ m }: { m: Message }) {
  const ref = m.referenced_message;
  const authorInfo = useAuthorInfo(ref ?? m);
  const jump = () => { if (m.message_reference) void useMessageStore.getState().jumpTo(m.message_reference.channel_id || m.channel_id, m.message_reference.message_id); };
  if (!ref) return <div className="reply-preview missing"><span className="reply-spine" /><em>Original message was deleted</em></div>;
  return (
    <div className="reply-preview" onClick={jump} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') jump(); }}>
      <span className="reply-spine" />
      <Avatar user={ref.author} size={16} />
      <span className="reply-author" style={authorInfo.color ? { color: authorInfo.color } : undefined}>@{authorInfo.name}</span>
      <span className="reply-content truncate">
        {ref.content ? <InlineMarkdown content={ref.content} guildId={ref.guild_id} /> : <em className="reply-attach"><IconImage size={14} /> Click to see attachment</em>}
      </span>
    </div>
  );
}

function SystemMessage({ m, name, color, highlighted }: { m: Message; name: string; color: string | null; highlighted: boolean }) {
  const author = <button className="author-name inline" style={color ? { color } : undefined} onClick={(e) => openUserPopoutAt(m.author.id, m.guild_id, e.currentTarget)}>{name}</button>;
  let icon = <IconArrowDown size={16} />;
  let body: ReactNode = null;
  let cls = 'join';
  switch (m.type) {
    case MessageType.GUILD_MEMBER_JOIN: {
      const variants = [<>{author} just joined the huddle. Say hi!</>, <>Welcome, {author}. Pull up a chair.</>, <>{author} hopped in.</>, <>Everyone welcome {author}!</>, <>{author} arrived. Glad you're here.</>];
      body = variants[Number(BigInt(m.id) % BigInt(variants.length))];
      break;
    }
    case MessageType.CHANNEL_PINNED_MESSAGE:
      icon = <IconPin size={16} />; cls = 'pin';
      body = <>{author} pinned <button className="btn-link" onClick={() => m.message_reference && void useMessageStore.getState().jumpTo(m.channel_id, m.message_reference.message_id)}>a message</button> to this channel.</>;
      break;
    case MessageType.CALL:
      icon = <IconPhone size={16} />; cls = 'call';
      body = <>{author} started a call.</>;
      break;
    case MessageType.RECIPIENT_ADD:
      icon = <IconUserPlus size={16} />;
      body = <>{author} added someone to the group.{m.content ? ` ${m.content}` : ''}</>;
      break;
    case MessageType.RECIPIENT_REMOVE:
      icon = <IconArrowDown size={16} />; cls = 'leave';
      body = <>{author} left the group.</>;
      break;
    case MessageType.THREAD_CREATED: {
      icon = <IconThread size={16} />; cls = 'thread';
      const t = m.thread;
      body = <>{author} started a thread: {t
        ? <button className="btn-link thread-link" onClick={() => openThread(t)}>{m.content}</button>
        : <strong>{m.content}</strong>}</>;
      break;
    }
    case MessageType.CHANNEL_NAME_CHANGE:
      icon = <IconEdit size={16} />; cls = 'pin';
      body = <>{author} changed the channel name: <strong>{m.content}</strong></>;
      break;
    case MessageType.POLL_RESULT:
      icon = <IconPoll size={16} />; cls = 'poll-ended';
      body = <><PollResultLine m={m} />{' '}{m.message_reference && <button className="btn-link" onClick={() => void useMessageStore.getState().jumpTo(m.channel_id, m.message_reference!.message_id)}>View poll</button>}</>;
      break;
    default:
      body = <>{author}: {m.content}</>;
  }
  return (
    <div className={'message system ' + cls + (highlighted ? ' highlighted' : '')} data-mid={m.id}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildMessageMenu(m))}>
      <div className="message-row">
        <div className="message-gutter"><span className={'system-icon ' + cls}>{icon}</span></div>
        <div className="message-main system-body">
          {body}<time className="message-time" dateTime={m.created_at}>{formatTimestamp(m.created_at)}</time>
        </div>
      </div>
    </div>
  );
}

