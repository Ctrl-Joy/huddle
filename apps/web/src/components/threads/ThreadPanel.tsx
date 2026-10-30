import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { ChannelType, LIMITS, Permissions, has, type Channel } from '@huddle/shared';
import { api, errorMessage } from '../../api/client';
import { useGuildStore } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useMessageStore, sendMessage } from '../../stores/messages';
import { useThreadStore, type ThreadPanel as Panel } from '../../stores/threads';
import { confirmDialog, toast, useUIStore } from '../../stores/ui';
import { usePermissions } from '../../lib/permissions';
import { createThread, createThreadFromMessage, deleteThread, updateThread } from '../../lib/threads';
import { InlineMarkdown } from '../../lib/markdown';
import { usePhone } from '../../lib/usePhone';
import { Avatar, Spinner, Tooltip } from '../common/Avatar';
import { IconArchive, IconArrowLeft, IconClose, IconMore, IconThread } from '../common/icons';
import { MessageList } from '../chat/MessageList';
import { Composer } from '../chat/Composer';
import { ForumTagPill } from './ForumTagPill';

/** Right-side thread panel on desktop; full screen with a back button on phones. */
export function ThreadPanelView({ panel, parent }: { panel: Panel; parent: Channel }) {
  const phone = usePhone();
  return (
    <aside className={'side-panel thread-panel' + (phone ? ' phone-full' : '')} aria-label="Thread">
      {panel.threadId === null
        ? <NewThreadForm parent={parent} starterMessageId={panel.starterMessageId ?? null} />
        : <OpenThread threadId={panel.threadId} parent={parent} />}
    </aside>
  );
}

function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const phone = usePhone();
  const close = () => useThreadStore.getState().close();
  return (
    <div className="side-panel-head thread-head">
      {phone && <button className="icon-btn" aria-label="Back" onClick={close}><IconArrowLeft size={20} /></button>}
      <IconThread size={18} className="header-icon" />
      <span className="truncate">{title}</span>
      {children}
      {!phone && (
        <Tooltip label="Close" side="bottom">
          <button className="icon-btn tiny" aria-label="Close thread" onClick={close}><IconClose size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}

function OpenThread({ threadId, parent }: { threadId: string; parent: Channel }) {
  const thread = useGuildStore((s) => s.channels[threadId]);
  const me = useAuthStore((s) => s.user!.id);
  const parentPerms = usePermissions(parent.id);
  const [missing, setMissing] = useState(false);

  // archived threads aren't part of READY: load on demand
  useEffect(() => {
    if (thread) return;
    let live = true;
    api.get<Channel>(`/channels/${threadId}`)
      .then((t) => { if (live) useGuildStore.getState().upsertChannel(t); })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [thread, threadId]);

  if (!thread) {
    return (
      <>
        <PanelHead title="Thread" />
        <div className="center-pad">{missing ? <span className="muted">This thread doesn't exist anymore.</span> : <Spinner />}</div>
      </>
    );
  }

  const archived = !!thread.thread_metadata?.archived;
  const canManage = thread.owner_id === me || has(parentPerms, Permissions.MANAGE_THREADS);
  const tags = parent.type === ChannelType.GUILD_FORUM ? (parent.available_tags ?? []).filter((t) => thread.applied_tags?.includes(t.id)) : [];

  const toggleArchive = () => {
    updateThread(thread.id, { archived: !archived })
      .then(() => toast(archived ? 'Thread reopened' : 'Thread archived', 'success'))
      .catch((e) => toast(errorMessage(e), 'error'));
  };
  const openMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    useUIStore.getState().openContextMenu({ clientX: r.left - 160, clientY: r.bottom + 4 }, [
      { label: archived ? 'Unarchive Thread' : 'Archive Thread', onClick: toggleArchive },
      { separator: true },
      {
        label: 'Delete Thread', danger: true,
        onClick: () => confirmDialog({
          title: 'Delete Thread', danger: true, confirmLabel: 'Delete',
          body: <>Delete <strong>{thread.name}</strong> and all of its messages? This cannot be undone.</>,
          onConfirm: () => deleteThread(thread.id),
        }),
      },
    ]);
  };

  return (
    <>
      <PanelHead title={thread.name}>
        {archived && <span className="thread-archived-pill">Archived</span>}
        {canManage && (
          <>
            <Tooltip label={archived ? 'Unarchive' : 'Archive'} side="bottom">
              <button className={'icon-btn tiny' + (archived ? ' active' : '')} aria-label={archived ? 'Unarchive thread' : 'Archive thread'} onClick={toggleArchive}><IconArchive size={16} /></button>
            </Tooltip>
            <button className="icon-btn tiny" aria-label="Thread options" onClick={openMenu}><IconMore size={16} /></button>
          </>
        )}
      </PanelHead>
      {tags.length > 0 && <div className="thread-tags">{tags.map((t) => <ForumTagPill key={t.id} tag={t} />)}</div>}
      <div className="thread-body">
        <MessageList key={thread.id} channel={thread} />
        {archived && <div className="thread-archived-note">This thread is archived. Sending a message will reopen it.</div>}
        <Composer channel={thread} />
      </div>
    </>
  );
}

function NewThreadForm({ parent, starterMessageId }: { parent: Channel; starterMessageId: string | null }) {
  const me = useAuthStore((s) => s.user!);
  const starter = useMessageStore((s) => (starterMessageId ? s.channels[parent.id]?.messages.find((m) => m.id === starterMessageId) : undefined));
  const [name, setName] = useState(() => (starter?.content.split('\n')[0] ?? '').slice(0, LIMITS.THREAD_NAME));
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const n = name.trim();
    if (!n) { setError('Give your thread a name.'); return; }
    setBusy(true); setError('');
    try {
      const t = starterMessageId ? await createThreadFromMessage(parent.id, starterMessageId, n) : await createThread(parent.id, n);
      if (first.trim()) void sendMessage(t.id, { content: first.trim() }, me);
      useThreadStore.getState().open(parent.id, t.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <PanelHead title="New Thread" />
      <form className="new-thread scroll-thin" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="new-thread-icon"><IconThread size={28} /></div>
        {starter && (
          <div className="new-thread-starter">
            <Avatar user={starter.author} size={20} />
            <span className="truncate"><InlineMarkdown content={starter.content || 'Attachment'} guildId={starter.guild_id} /></span>
          </div>
        )}
        <label className="field-label" htmlFor="thread-name">Thread name</label>
        <input id="thread-name" autoFocus value={name} maxLength={LIMITS.THREAD_NAME} placeholder="What's this thread about?" onChange={(e) => setName(e.target.value)} />
        <label className="field-label" htmlFor="thread-first">Starter message <span className="muted">(optional)</span></label>
        <textarea id="thread-first" rows={3} value={first} maxLength={LIMITS.MESSAGE_LENGTH} placeholder="Kick things off…" onChange={(e) => setFirst(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }} />
        {error && <div className="form-error">{error}</div>}
        <div className="new-thread-actions">
          <button type="button" className="btn btn-ghost" onClick={() => useThreadStore.getState().close()}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>Create Thread</button>
        </div>
      </form>
    </>
  );
}
