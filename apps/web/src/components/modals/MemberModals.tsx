import { useState } from 'react';
import { Modal, Field } from './Modal';
import { useGuildStore, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { updateMember, banMember } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { setCustomStatus } from '../layout/UserPanel';
import { toast } from '../../stores/ui';

export function NicknameModal({ close, guildId, userId }: { close: () => void; guildId: string; userId: string }) {
  const member = useGuildStore((s) => s.members[guildId]?.[userId]);
  const isMe = useAuthStore((s) => s.user?.id === userId);
  const [nick, setNick] = useState(member?.nick ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true);
    try { await updateMember(guildId, userId, { nick: value || null }); close(); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title={isMe ? 'Change Nickname' : `Change ${member?.user.username ?? ''}'s nickname`}
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => save(nick.trim())}>Save</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(nick.trim()); }}>
        <Field label="Nickname" error={error}>
          <input autoFocus value={nick} maxLength={32} placeholder={member?.user.display_name || member?.user.username} onChange={(e) => setNick(e.target.value)} />
        </Field>
        {member?.nick && <button type="button" className="btn-link" onClick={() => save(null)}>Reset Nickname</button>}
      </form>
    </Modal>
  );
}

const DURATIONS = [
  { ms: 60_000, l: '60 seconds' }, { ms: 5 * 60_000, l: '5 minutes' }, { ms: 10 * 60_000, l: '10 minutes' },
  { ms: 3600_000, l: '1 hour' }, { ms: 86400_000, l: '1 day' }, { ms: 7 * 86400_000, l: '1 week' },
];

export function TimeoutModal({ close, guildId, userId }: { close: () => void; guildId: string; userId: string }) {
  const [ms, setMs] = useState(DURATIONS[2].ms);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = displayName(userId, guildId);
  const go = async () => {
    setBusy(true);
    try {
      await updateMember(guildId, userId, { communication_disabled_until: new Date(Date.now() + ms).toISOString() });
      toast(`${name} has been timed out`, 'success');
      close();
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title={`Timeout ${name}`} subtitle="Members who are in timeout can still read messages but can't send messages, react, or join voice."
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={go}>Timeout</button></>}>
      <div className="field-label">Duration</div>
      <div className="pill-choices">
        {DURATIONS.map((d) => <button key={d.ms} className={'pill-choice' + (ms === d.ms ? ' selected' : '')} onClick={() => setMs(d.ms)}>{d.l}</button>)}
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

export function BanModal({ close, guildId, userId }: { close: () => void; guildId: string; userId: string }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = displayName(userId, guildId);
  const go = async () => {
    setBusy(true);
    try { await banMember(guildId, userId, reason.trim()); toast(`${name} has been banned`, 'success'); close(); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title={`Ban '${name}'`} subtitle={`Are you sure you want to ban ${name}? They won't be able to rejoin unless unbanned.`}
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={go}>Ban</button></>}>
      <Field label="Reason for ban" error={error}>
        <textarea rows={3} value={reason} maxLength={512} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function CustomStatusModal({ close }: { close: () => void }) {
  const user = useAuthStore((s) => s.user!);
  const [text, setText] = useState(user.custom_status ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (v: string | null) => {
    setBusy(true);
    try { await setCustomStatus(v); close(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title="Set a custom status" className="center-head"
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => save(text.trim() || null)}>Save</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(text.trim() || null); }}>
        <Field label={`What's cookin', ${user.display_name || user.username}?`} error={error}>
          <input autoFocus value={text} maxLength={128} placeholder="Support has arrived!" onChange={(e) => setText(e.target.value)} />
        </Field>
        {user.custom_status && <button type="button" className="btn-link" onClick={() => save(null)}>Clear status</button>}
      </form>
    </Modal>
  );
}
