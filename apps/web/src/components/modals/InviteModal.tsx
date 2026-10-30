import { useEffect, useState } from 'react';
import type { Invite } from '@huddle/shared';
import { Modal, Field } from './Modal';
import { useGuildStore } from '../../stores/guilds';
import { createInvite } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { copyText } from '../../lib/format';
import { IconHash } from '../common/icons';

const AGES = [
  { v: 1800, l: '30 minutes' }, { v: 3600, l: '1 hour' }, { v: 21600, l: '6 hours' }, { v: 43200, l: '12 hours' },
  { v: 86400, l: '1 day' }, { v: 604800, l: '7 days' }, { v: 0, l: 'Never' },
];
const USES = [0, 1, 5, 10, 25, 50, 100];

export function inviteUrl(code: string) { return `${location.origin}/invite/${code}`; }

export function InviteModal({ close, guildId, channelId }: { close: () => void; guildId: string; channelId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [maxAge, setMaxAge] = useState(604800);
  const [maxUses, setMaxUses] = useState(0);

  const generate = async (age = maxAge, uses = maxUses) => {
    setError('');
    try { setInvite(await createInvite(channelId, { max_age: age, max_uses: uses })); }
    catch (e) { setError(errorMessage(e)); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void generate(); }, [channelId]);

  const copy = async () => {
    if (!invite) return;
    await copyText(inviteUrl(invite.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const ageLabel = AGES.find((a) => a.v === (invite?.max_age ?? maxAge))?.l ?? '';

  return (
    <Modal close={close} title={`Invite friends to ${guild?.name ?? 'server'}`} subtitle={channel ? <span className="inline-icon"><IconHash size={14} />{channel.name}</span> : undefined}>
      {!editing ? (
        <>
          <div className="field-label">Send a server invite link to a friend</div>
          <div className="copy-row">
            <input readOnly value={invite ? inviteUrl(invite.code) : error ? '' : 'Generating…'} onFocus={(e) => e.currentTarget.select()} />
            <button className={'btn ' + (copied ? 'btn-success' : 'btn-primary')} disabled={!invite} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {error && <div className="form-error">{error}</div>}
          <p className="fine-print">
            {invite?.max_age ? `Your invite link expires in ${ageLabel}.` : 'Your invite link will never expire.'}
            {invite?.max_uses ? ` Limited to ${invite.max_uses} use${invite.max_uses === 1 ? '' : 's'}.` : ''}{' '}
            <button className="btn-link" onClick={() => setEditing(true)}>Edit invite link.</button>
          </p>
        </>
      ) : (
        <>
          <Field label="Expire after">
            <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>
              {AGES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
          </Field>
          <Field label="Max number of uses">
            <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
              {USES.map((u) => <option key={u} value={u}>{u === 0 ? 'No limit' : `${u} use${u === 1 ? '' : 's'}`}</option>)}
            </select>
          </Field>
          <div className="row-end">
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { setEditing(false); setInvite(null); void generate(maxAge, maxUses); }}>Generate a New Link</button>
          </div>
        </>
      )}
    </Modal>
  );
}
