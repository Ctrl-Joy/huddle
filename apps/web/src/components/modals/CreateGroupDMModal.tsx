import { useMemo, useState } from 'react';
import { LIMITS, RelationshipType } from '@huddle/shared';
import { Modal } from './Modal';
import { useRelationshipStore } from '../../stores/relationships';
import { openDM } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { Avatar } from '../common/Avatar';
import { IconCheck } from '../common/icons';
import { userDisplayName } from '../../stores/guilds';

export function CreateGroupDMModal({ close }: { close: () => void }) {
  const rels = useRelationshipStore((s) => s.relationships);
  const friends = useMemo(() => Object.values(rels).filter((r) => r.type === RelationshipType.FRIEND)
    .sort((a, b) => userDisplayName(a.user).localeCompare(userDisplayName(b.user))), [rels]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const max = LIMITS.GROUP_DM_RECIPIENTS - 1;
  const shown = friends.filter((f) => !q || f.user.username.toLowerCase().includes(q.toLowerCase()) || (f.user.display_name || '').toLowerCase().includes(q.toLowerCase()));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  const create = async () => {
    if (!selected.length) return;
    setBusy(true);
    try { await openDM(selected); close(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };

  return (
    <Modal close={close} title="Select Friends" subtitle={`You can add ${Math.max(0, max - selected.length)} more friend${max - selected.length === 1 ? '' : 's'}.`}
      footer={<button className="btn btn-primary btn-block" disabled={!selected.length || busy} onClick={create}>{selected.length > 1 ? 'Create Group DM' : 'Create DM'}</button>}>
      <div className="chip-input">
        {selected.map((id) => {
          const f = rels[id];
          return <button key={id} className="chip" onClick={() => toggle(id)}>{f ? userDisplayName(f.user) : id} ×</button>;
        })}
        <input autoFocus placeholder={selected.length ? '' : 'Type the username of a friend'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="pick-list scroll-thin">
        {shown.map((f) => (
          <button key={f.id} className={'pick-row' + (selected.includes(f.id) ? ' selected' : '')} onClick={() => toggle(f.id)}>
            <Avatar user={f.user} size={32} status="auto" ring="var(--bg-elevated)" />
            <span className="pick-name">{userDisplayName(f.user)}<small>{f.user.username}</small></span>
            <span className={'checkbox' + (selected.includes(f.id) ? ' on' : '')}>{selected.includes(f.id) && <IconCheck size={12} strokeWidth={3} />}</span>
          </button>
        ))}
        {!shown.length && <div className="muted center-pad">{friends.length ? 'No friends match that search.' : "You don't have any friends to add yet."}</div>}
      </div>
    </Modal>
  );
}
