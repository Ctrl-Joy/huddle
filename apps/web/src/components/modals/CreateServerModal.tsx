import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GUILD_TEMPLATES, LIMITS, type GuildTemplateId } from '@huddle/shared';
import { Modal, Field } from './Modal';
import { useAuthStore } from '../../stores/auth';
import { createGuild, joinInvite, parseInviteCode, getInvite } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { IconChevronRight, IconLink, IconUpload, LogoMark } from '../common/icons';

// tint for each template's icon (reuses the Discover category colours)
const TEMPLATE_TINT: Record<GuildTemplateId, string> = {
  gaming: 'gaming', friends: 'community', study: 'education', club: 'science_tech', creators: 'art', local: 'entertainment',
};

export function CreateServerModal({ close, initialStep = 'start' }: { close: () => void; initialStep?: 'start' | 'template' | 'create' | 'join' }) {
  const [step, setStep] = useState(initialStep);
  const [template, setTemplate] = useState<GuildTemplateId | null>(null);
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
      const g = await createGuild(name.trim().slice(0, LIMITS.GUILD_NAME), icon, template);
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
        <button className="choice-card" onClick={() => setStep('template')}>
          <span className="choice-icon"><LogoMark size={28} /></span>
          <span className="choice-text"><strong>Create a Server</strong><small>Start fresh or pick a ready-made layout</small></span>
          <IconChevronRight size={18} />
        </button>
        <div className="choice-divider">Have an invite already?</div>
        <button className="choice-card" onClick={() => setStep('join')}>
          <span className="choice-icon alt"><IconLink size={26} /></span>
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

  if (step === 'template') {
    const pick = (t: GuildTemplateId | null) => { setTemplate(t); setError(''); setStep('create'); };
    return (
      <Modal close={close} title="Pick a starting point" subtitle="Templates set up channels for you. You can rename, add or remove any of them later." className="center-head"
        footer={initialStep !== 'template' ? <><button className="btn btn-ghost" onClick={() => setStep('start')}>Back</button><span className="spacer" /></> : undefined}>
        <button className="choice-card" onClick={() => pick(null)}>
          <span className="choice-icon"><LogoMark size={28} /></span>
          <span className="choice-text"><strong>Create My Own</strong><small>Just #general and a voice room</small></span>
          <IconChevronRight size={18} />
        </button>
        <div className="template-list-label">Start from a template</div>
        <div className="template-list">
          {GUILD_TEMPLATES.map((t) => (
            <button key={t.id} className="choice-card" onClick={() => pick(t.id)}>
              <span className={'choice-icon template-icon cat-' + TEMPLATE_TINT[t.id]} aria-hidden="true">{t.name.slice(0, 1)}</span>
              <span className="choice-text"><strong>{t.name}</strong><small>{t.description}</small></span>
              <IconChevronRight size={18} />
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  const templateName = GUILD_TEMPLATES.find((t) => t.id === template)?.name;
  return (
    <Modal close={close} title="Customize your server" subtitle="Give your new server a personality with a name and an icon. You can always change it later." className="center-head"
      footer={<>
        <button className="btn btn-ghost" onClick={() => { setStep('template'); setError(''); }}>Back</button>
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
        {templateName && <p className="fine-print">Using the <strong>{templateName}</strong> template.</p>}
        <p className="fine-print">By creating a server, you agree to keep it a friendly place for everyone in it.</p>
      </form>
    </Modal>
  );
}
