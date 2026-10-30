import { Permissions, type Channel, type Message } from '@huddle/shared';
import { canHaveThreads, useGuildStore } from '../../stores/guilds';
import { useThreadStore } from '../../stores/threads';
import { useCan } from '../../lib/permissions';
import { openThread } from '../../lib/threads';
import { pluralize, relativeTime } from '../../lib/format';
import { Tooltip } from '../common/Avatar';
import { IconThread } from '../common/icons';

/** The live copy of a message's thread (gateway keeps the store one fresh; the message carries a snapshot). */
export function useMessageThread(m: Message): Channel | null {
  const live = useGuildStore((s) => (m.thread ? s.channels[m.thread.id] : undefined));
  return live ?? m.thread ?? null;
}

/** "Thread" chip under a message that started one: name, message count and last activity. Opens the thread. */
export function ThreadChip({ message }: { message: Message }) {
  const thread = useMessageThread(message);
  if (!thread) return null;
  const count = thread.message_count ?? 0;
  const last = thread.last_message_at;
  return (
    <button className="thread-chip" onClick={(e) => { e.stopPropagation(); openThread(thread); }}>
      <IconThread size={16} />
      <span className="thread-chip-name truncate">{thread.name}</span>
      <span className="thread-chip-count">{count ? pluralize(count, 'message') : 'No messages yet'}</span>
      {last && count > 0 && <span className="thread-chip-time">· {relativeTime(last)}</span>}
      {thread.thread_metadata?.archived && <span className="thread-chip-time">· Archived</span>}
      <span className="thread-chip-go">›</span>
    </button>
  );
}

/** Hover-toolbar action: start a thread from this message (or open the existing one). */
export function ThreadToolbarButton({ message }: { message: Message }) {
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const canCreate = useCan(message.channel_id, Permissions.CREATE_THREADS);
  const thread = useMessageThread(message);
  if (!canHaveThreads(channel)) return null;
  if (thread) {
    return (
      <Tooltip label="Open Thread">
        <button className="tb-btn" aria-label="Open Thread" onClick={() => openThread(thread)}><IconThread size={18} /></button>
      </Tooltip>
    );
  }
  if (!canCreate) return null;
  return (
    <Tooltip label="Create Thread">
      <button className="tb-btn" aria-label="Create Thread" onClick={() => useThreadStore.getState().startNew(message.channel_id, message.id)}><IconThread size={18} /></button>
    </Tooltip>
  );
}
