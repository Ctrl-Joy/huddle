import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS } from '@huddle/shared';
import { Modal, Field } from './Modal';
import { useAuthStore } from '../../stores/auth';
import { createGuild, joinInvite, parseInviteCode, getInvite } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { IconChevronRight, IconCompass, IconUpload, LogoMark } from '../common/icons';

export function CreateServerModal({ close, initialStep = 'start' }: { close: () => void; initialStep?: 'start' | 'create' | 'join' }) {
  const [step, setStep] = useState(initialStep);
  const user = useAuthStore((s) => s.user!);
  const [name, setName] = useState(`${user.display_name || user.username}'s huddle`);
  const [icon, setIcon] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!icon) { setPreview(null); return; }
    const url = URL.createObjectURL(icon);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [icon]);

  const create = async () => {
    if (!name.trim()) { setError('Server name is required.'); return; }
    setBusy(true); setError('');
    try {
      const g = await createGuild(name.trim().slice(0, LIMITS.GUILD_NAME), icon);
      close();
      nav(`/channels/${g.id}`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };

  const join = async () => {
    const code = parseInviteCode(invite);
    if (!code) { setError('Please enter a valid invite link or code.'); return; }
    setBusy(true); setError('');
    try {
      const inv = await getInvite(code);
      await joinInvite(code);
      close();
      nav(`/channels/${inv.guild.id}`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };

  if (step === 'start') {
    return (
      <Modal close={close} title="Start a huddle" subtitle="A server is where you and your people hang out. Make your own, or hop into one you've been invited to." className="center-head">
        <button className="choice-card" onClick={() => setStep('create')}>
          <span className="choice-icon"><LogoMark size={28} /></span>
          <span className="choice-text"><strong>Create My Own</strong><small>Start fresh with text & voice channels</small></span>
          <IconChevronRight size={18} />
        </button>
        <div className="choice-divider">Have an invite already?</div>
        <button className="choice-card" onClick={() => setStep('join')}>
          <span className="choice-icon alt"><IconCompass size={26} /></span>
          <span className="choice-text"><strong>Join a Server</strong><small>Paste an invite link or code</small></span>
          <IconChevronRight size={18} />
        </button>
      </Modal>
    );
  }

  if (step === 'join') {
    return (
      <Modal close={close} title="Join a Server" subtitle="Enter an invite below to join an existing server." className="center-head"
        footer={<>
          {initialStep !== 'join' && <button className="btn btn-ghost" onClick={() => { setStep('start'); setError(''); }}>Back</button>}
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join Server'}</button>
        </>}>
        <form onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <Field label="Invite link" error={error}>
            <input autoFocus value={invite} onChange={(e) => setInvite(e.target.value)} placeholder={`${location.origin}/invite/hTKzmak`} />
          </Field>
        </form>
        <div className="hint-box">
          <strong>Invites look like</strong>
          <code>hTKzmak</code><code>{location.origin}/invite/hTKzmak</code>
        </div>
      </Modal>
    );
  }

  return (
    <Modal close={close} title="Customize your server" subtitle="Give your new server a personality with a name and an icon. You can always change it later." className="center-head"
      footer={<>
        <button className="btn btn-ghost" onClick={() => { setStep('start'); setError(''); }}>Back</button>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create'}</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="icon-upload-wrap">
          <button type="button" className={'icon-upload' + (preview ? ' has-image' : '')} onClick={() => fileRef.current?.click()}>
            {preview ? <img src={preview} alt="" /> : <><IconUpload size={24} /><span>Upload</span></>}
            <span className="icon-upload-plus">+</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setIcon(e.target.files?.[0] ?? null)} />
        </div>
        <Field label="Server name" error={error}>
          <input autoFocus value={name} maxLength={LIMITS.GUILD_NAME} onChange={(e) => setName(e.target.value)} />
        </Field>
        <p className="fine-print">By creating a server, you agree to keep it a friendly place for everyone in it.</p>
      </form>
    </Modal>
  );
}
