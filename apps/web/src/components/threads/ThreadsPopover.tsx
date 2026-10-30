import { useEffect, useMemo, useRef, useState } from 'react';
import { ChannelType, Permissions, type Channel } from '@huddle/shared';
import { errorMessage } from '../../api/client';
import { useGuildStore } from '../../stores/guilds';
import { useReadStateStore, isUnread } from '../../stores/readStates';
import { useThreadStore } from '../../stores/threads';
import { useCan } from '../../lib/permissions';
import { fetchThreads } from '../../lib/threads';
import { pluralize, relativeTime } from '../../lib/format';
import { Spinner, Tooltip } from '../common/Avatar';
import { IconThread } from '../common/icons';

/** Header button: lists the channel's threads, with a "Create Thread" action. */
export function ThreadsButton({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  const panelOpen = useThreadStore((s) => s.panel?.parentId === channel.id);
  return (
    <div className="popover-anchor">
      <Tooltip label="Threads" side="bottom">
        <button className={'icon-btn' + (open || panelOpen ? ' active' : '')} aria-label="Threads" onClick={() => setOpen((v) => !v)}><IconThread size={20} /></button>
      </Tooltip>
      {open && <ThreadsPopover channel={channel} close={() => setOpen(false)} />}
    </div>
  );
}

function ThreadsPopover({ channel, close }: { channel: Channel; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const channels = useGuildStore((s) => s.channels);
  const readStates = useReadStateStore((s) => s.readStates);
  const canCreate = useCan(channel.id, Permissions.CREATE_THREADS);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.popover-anchor, .modal-backdrop, .ctx-menu')) close();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [close]);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    fetchThreads(channel.id, { archived: tab === 'archived' ? 'true' : 'false', limit: 100 })
      .catch((e) => { if (live) setError(errorMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [channel.id, tab]);

  const list = useMemo(() => Object.values(channels)
    .filter((c) => c.type === ChannelType.PUBLIC_THREAD && c.parent_id === channel.id && !!c.thread_metadata?.archived === (tab === 'archived'))
    .sort((a, b) => (BigInt(b.last_message_id ?? b.id) > BigInt(a.last_message_id ?? a.id) ? 1 : -1)), [channels, channel.id, tab]);

  const open = (t: Channel) => { useThreadStore.getState().open(channel.id, t.id); close(); };

  return (
    <div className="popover threads-popover" ref={ref}>
      <div className="popover-head">
        <IconThread size={18} /> Threads
        <div className="threads-tabs">
          <button className={'chip' + (tab === 'active' ? ' active' : '')} onClick={() => setTab('active')}>Active</button>
          <button className={'chip' + (tab === 'archived' ? ' active' : '')} onClick={() => setTab('archived')}>Archived</button>
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-small threads-create" onClick={() => { useThreadStore.getState().startNew(channel.id); close(); }}>Create Thread</button>
        )}
      </div>
      <div className="popover-body scroll-thin">
        {error && <div className="form-error">{error}</div>}
        {!list.length && loading ? <div className="center-pad"><Spinner /></div>
          : !list.length ? (
            <div className="empty-mini">
              <div className="empty-mini-icon"><IconThread size={28} /></div>
              <p>{tab === 'active' ? 'No active threads here yet. Start one to keep a side conversation tidy.' : 'No archived threads.'}</p>
            </div>
          ) : list.map((t) => (
            <button key={t.id} className={'thread-row' + (isUnread(t, readStates) && readStates[t.id] ? ' unread' : '')} onClick={() => open(t)}>
              <IconThread size={18} className="thread-row-icon" />
              <span className="thread-row-text">
                <span className="thread-row-name truncate">{t.name}</span>
                <span className="muted small">
                  {pluralize(t.message_count ?? 0, 'message')}{t.last_message_at ? ` · ${relativeTime(t.last_message_at)}` : ''}
                </span>
              </span>
              {(readStates[t.id]?.mention_count ?? 0) > 0 && <span className="badge">{readStates[t.id].mention_count}</span>}
            </button>
          ))}
      </div>
    </div>
  );
}
