import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RelationshipType, type Relationship } from '@huddle/shared';
import { useRelationshipStore } from '../../stores/relationships';
import { usePresenceStore, normalize, STATUS_LABEL } from '../../stores/presences';
import { useUIStore, toast, openModal } from '../../stores/ui';
import { userDisplayName } from '../../stores/guilds';
import { acceptFriend, openDM, removeRelationship, sendFriendRequest } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { Avatar, Badge, Tooltip } from '../common/Avatar';
import { IconCheck, IconClose, IconMenu, IconMessage, IconMoreVertical, IconSearch, IconUsers } from '../common/icons';
import { buildUserMenu } from '../menus/menus';
import { confirmDialog } from '../../stores/ui';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

const IconMessagePlus = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 12.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v3l4-3h1.5" /><path d="M18.5 15v6M15.5 18h6" />
  </svg>
);

export function FriendsHome() {
  const [tab, setTab] = useState<Tab>('online');
  const rels = useRelationshipStore((s) => s.relationships);
  const presences = usePresenceStore((s) => s.presences);
  const [q, setQ] = useState('');
  const pendingCount = Object.values(rels).filter((r) => r.type === RelationshipType.PENDING_INCOMING).length;
  // Pending / Blocked tabs only appear when there's something in them
  const hasPending = Object.values(rels).some((r) => r.type === RelationshipType.PENDING_INCOMING || r.type === RelationshipType.PENDING_OUTGOING);
  const hasBlocked = Object.values(rels).some((r) => r.type === RelationshipType.BLOCKED);
  useEffect(() => {
    if ((tab === 'pending' && !hasPending) || (tab === 'blocked' && !hasBlocked)) setTab('online');
  }, [tab, hasPending, hasBlocked]);

  const list = useMemo(() => {
    const all = Object.values(rels);
    let l: Relationship[];
    if (tab === 'online') l = all.filter((r) => r.type === RelationshipType.FRIEND && normalize(presences[r.id]?.status) !== 'offline');
    else if (tab === 'all') l = all.filter((r) => r.type === RelationshipType.FRIEND);
    else if (tab === 'pending') l = all.filter((r) => r.type === RelationshipType.PENDING_INCOMING || r.type === RelationshipType.PENDING_OUTGOING);
    else if (tab === 'blocked') l = all.filter((r) => r.type === RelationshipType.BLOCKED);
    else l = [];
    const s = q.toLowerCase();
    if (s) l = l.filter((r) => r.user.username.toLowerCase().includes(s) || (r.user.display_name || '').toLowerCase().includes(s));
    return l.sort((a, b) => (a.type - b.type) || userDisplayName(a.user).localeCompare(userDisplayName(b.user)));
  }, [rels, presences, tab, q]);

  const labels: Record<Exclude<Tab, 'add'>, string> = { online: 'Online', all: 'All Friends', pending: 'Pending', blocked: 'Blocked' };

  return (
    <div className="friends">
      <header className="chat-header">
        <button className="icon-btn mobile-only" aria-label="Open navigation" onClick={() => useUIStore.getState().setMobileNav(true)}><IconMenu size={22} /></button>
        <div className="chat-header-title"><IconUsers size={22} className="header-icon" /><span className="header-name">Friends</span><span className="header-divider" /></div>
        <nav className="friends-tabs" role="tablist">
          {(['online', 'all', 'pending', 'blocked'] as const).filter((t) => (t !== 'pending' || hasPending) && (t !== 'blocked' || hasBlocked)).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
              {labels[t]}{t === 'pending' && pendingCount > 0 && <Badge count={pendingCount} />}
            </button>
          ))}
          <button role="tab" aria-selected={tab === 'add'} className={'tab add-friend' + (tab === 'add' ? ' active' : '')} onClick={() => setTab('add')}>Add Friend</button>
        </nav>
        <div className="friends-header-actions">
          <Tooltip label="New Group DM" side="bottom">
            <button className="icon-btn" aria-label="New Group DM" onClick={() => openModal('createGroupDM')}><IconMessagePlus size={22} /></button>
          </Tooltip>
        </div>
      </header>
      <div className="friends-body">
        <div className="friends-main">
          {tab === 'add' ? <AddFriend /> : (
            <>
              <div className="friends-search">
                <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search friends" />
                <IconSearch size={16} />
              </div>
              <h3 className="friends-count">{labels[tab]} — {list.length}</h3>
              <div className="friends-list scroll-thin">
                {list.map((r) => <FriendRow key={r.id} rel={r} />)}
                {!list.length && <EmptyFriends tab={tab} onAdd={() => setTab('add')} />}
              </div>
            </>
          )}
        </div>
        <ActiveNow />
      </div>
    </div>
  );
}

function FriendRow({ rel }: { rel: Relationship }) {
  const status = normalize(usePresenceStore((s) => s.presences[rel.id]?.status));
  const custom = usePresenceStore((s) => s.presences[rel.id]?.custom_status);
  const run = (p: Promise<unknown>) => p.catch((e) => toast(errorMessage(e), 'error'));
  const sub = rel.type === RelationshipType.PENDING_INCOMING ? 'Incoming Friend Request'
    : rel.type === RelationshipType.PENDING_OUTGOING ? 'Outgoing Friend Request'
    : rel.type === RelationshipType.BLOCKED ? 'Blocked'
    : custom || STATUS_LABEL[status];
  return (
    <div className="friend-row" onClick={() => rel.type === RelationshipType.FRIEND && void run(openDM([rel.id]))}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildUserMenu(rel.id, e.currentTarget))}>
      <Avatar user={rel.user} size={36} status={rel.type === RelationshipType.FRIEND ? status : null} ring="var(--bg-chat)" />
      <div className="friend-text">
        <span className="friend-name">{userDisplayName(rel.user)} <span className="friend-username">{rel.user.username}</span></span>
        <span className="friend-sub truncate">{sub}</span>
      </div>
      <div className="friend-actions" onClick={(e) => e.stopPropagation()}>
        {rel.type === RelationshipType.FRIEND && (
          <>
            <Tooltip label="Message"><button className="round-btn" aria-label="Message" onClick={() => void run(openDM([rel.id]))}><IconMessage size={18} /></button></Tooltip>
            <Tooltip label="More"><button className="round-btn" aria-label="More" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); useUIStore.getState().openContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, buildUserMenu(rel.id)); }}><IconMoreVertical size={18} /></button></Tooltip>
          </>
        )}
        {rel.type === RelationshipType.PENDING_INCOMING && (
          <>
            <Tooltip label="Accept"><button className="round-btn accept" aria-label="Accept" onClick={() => void run(acceptFriend(rel.id))}><IconCheck size={18} /></button></Tooltip>
            <Tooltip label="Ignore"><button className="round-btn decline" aria-label="Ignore" onClick={() => void run(removeRelationship(rel.id))}><IconClose size={18} /></button></Tooltip>
          </>
        )}
        {rel.type === RelationshipType.PENDING_OUTGOING && (
          <Tooltip label="Cancel"><button className="round-btn decline" aria-label="Cancel" onClick={() => void run(removeRelationship(rel.id))}><IconClose size={18} /></button></Tooltip>
        )}
        {rel.type === RelationshipType.BLOCKED && (
          <Tooltip label="Unblock"><button className="round-btn decline" aria-label="Unblock" onClick={() => confirmDialog({ title: `Unblock ${userDisplayName(rel.user)}?`, body: 'They will be able to send you friend requests and messages again.', confirmLabel: 'Unblock', onConfirm: () => removeRelationship(rel.id) })}><IconClose size={18} /></button></Tooltip>
        )}
      </div>
    </div>
  );
}

function AddFriend() {
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/^@/, '');
    if (!n) return;
    setBusy(true); setResult(null);
    try {
      await sendFriendRequest(n);
      setResult({ ok: true, text: `Success! Your friend request to ${n} was sent.` });
      setName('');
    } catch (err) { setResult({ ok: false, text: errorMessage(err) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="add-friend-panel">
      <h2>Add Friend</h2>
      <p className="muted">You can add friends with their Huddle username.</p>
      <form className={'add-friend-form' + (result ? (result.ok ? ' ok' : ' bad') : '')} onSubmit={submit}>
        <input autoFocus placeholder="You can add friends with their Huddle username." value={name} onChange={(e) => { setName(e.target.value); setResult(null); }} aria-label="Username" maxLength={32} />
        <button className="btn btn-primary" disabled={!name.trim() || busy}>{busy ? 'Sending…' : 'Send Friend Request'}</button>
      </form>
      {result && <div className={result.ok ? 'form-success' : 'form-error'}>{result.text}</div>}
      <div className="add-friend-art" aria-hidden="true"><span /><span /><span /></div>
    </div>
  );
}

function EmptyFriends({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  const text = tab === 'online' ? "No one's around to hang out with right now."
    : tab === 'pending' ? 'There are no pending friend requests. Here’s a cozy corner for now.'
    : tab === 'blocked' ? "You haven't blocked anyone. Nice."
    : 'Your friends list is empty — add someone by their username.';
  return (
    <div className="empty-state compact">
      <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
      <p>{text}</p>
      {(tab === 'all' || tab === 'online') && <button className="btn btn-primary" onClick={onAdd}>Add Friend</button>}
    </div>
  );
}

function ActiveNow() {
  const rels = useRelationshipStore((s) => s.relationships);
  const presences = usePresenceStore((s) => s.presences);
  const active = Object.values(rels).filter((r) => r.type === RelationshipType.FRIEND && normalize(presences[r.id]?.status) !== 'offline' && presences[r.id]?.custom_status);
  return (
    <aside className="active-now">
      <h2>Active Now</h2>
      {active.length ? active.map((r) => (
        <div key={r.id} className="active-card">
          <Avatar user={r.user} size={32} status="auto" ring="var(--bg-elevated)" />
          <div><strong>{userDisplayName(r.user)}</strong><div className="muted small">{presences[r.id]?.custom_status}</div></div>
        </div>
      )) : (
        <div className="active-empty">
          <strong>It's quiet for now...</strong>
          <p className="muted small">When a friend shares what they're up to with a custom status, it'll show up here.</p>
        </div>
      )}
    </aside>
  );
}
