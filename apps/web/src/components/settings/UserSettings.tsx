import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@huddle/shared';
import { SettingsLayout, UnsavedBar } from './SettingsLayout';
import { cancelEmailChange, changeEmail, changePassword, resendVerification, resendWait, useAuthStore, verifyEmail } from '../../stores/auth';
import { ApiError } from '../../api/client';
import { CodeInput } from '../common/CodeInput';
import { describeCodeError, useCountdown } from '../../pages/VerifyEmailPage';
import { useUIStore, confirmDialog, toast } from '../../stores/ui';
import { updateMe, uploadAvatar, uploadProfileBanner } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { logout } from '../../lib/session';
import { colorFor, formatShortDate } from '../../lib/format';
import { getNotifyPrefs, setNotifyPrefs, notificationPermission, requestNotificationPermission, playPing } from '../../lib/notifications';
import { Avatar } from '../common/Avatar';
import { Field, Toggle } from '../modals/Modal';
import { Markdown } from '../../lib/markdown';
import { ProfileBanner, Pronouns, accentProps } from '../members/ProfileBanner';
import { LogoMark, IconMoon, IconSun, IconCheck } from '../common/icons';
import { VoiceVideoSettings } from './VoiceVideoSettings';
import { AccessibilityTab, ChatTab, LanguageTab } from './PreferenceSettings';

type Tab = 'account' | 'profile' | 'notifications' | 'voice' | 'appearance' | 'accessibility' | 'chat' | 'language';

export function UserSettings({ close, tab: initial }: { close: () => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'account');
  return (
    <SettingsLayout
      close={close}
      active={tab}
      searchable
      startOnContent={!!initial}
      onSelect={(id) => {
        if (id === 'logout') confirmDialog({ title: 'Log Out', body: 'Are you sure you want to log out?', confirmLabel: 'Log Out', danger: true, onConfirm: () => { close(); logout(); } });
        else setTab(id as Tab);
      }}
      sections={[
        { header: 'User Settings', items: [
          { id: 'account', label: 'My Account', keywords: 'username display name email password member since' },
          { id: 'profile', label: 'Profile', keywords: 'avatar picture banner image colour color accent pronouns about me bio' },
        ] },
        { header: 'App Settings', items: [
          { id: 'appearance', label: 'Appearance', keywords: 'theme dark light mode' },
          { id: 'accessibility', label: 'Accessibility', keywords: 'font size text scale reduce motion animations underline links' },
          { id: 'voice', label: 'Voice & Video', keywords: 'microphone mic camera speaker input output device' },
          { id: 'chat', label: 'Chat', keywords: 'message display cozy compact images videos inline previews' },
          { id: 'notifications', label: 'Notifications', keywords: 'desktop sounds ping alerts mentions' },
          { id: 'language', label: 'Language & Time', keywords: 'english clock 12-hour 24-hour time format' },
        ] },
        { items: [{ id: 'logout', label: 'Log Out', danger: true, keywords: 'sign out' }] },
      ]}
    >
      {tab === 'account' && <MyAccount goProfile={() => setTab('profile')} />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'voice' && <VoiceVideoSettings />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'accessibility' && <AccessibilityTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'language' && <LanguageTab />}
    </SettingsLayout>
  );
}

function MyAccount({ goProfile }: { goProfile: () => void }) {
  const user = useAuthStore((s) => s.user!);
  const [editing, setEditing] = useState<'display_name' | 'username' | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = (f: 'display_name' | 'username') => { setEditing(f); setValue((f === 'username' ? user.username : user.display_name) ?? ''); setError(''); };
  const save = async () => {
    if (!editing) return;
    if (editing === 'username' && (value.length < LIMITS.USERNAME_MIN || value.length > LIMITS.USERNAME_MAX)) { setError(`Must be ${LIMITS.USERNAME_MIN}-${LIMITS.USERNAME_MAX} characters`); return; }
    setBusy(true);
    try { await updateMe({ [editing]: editing === 'display_name' ? value.trim() || null : value.trim() }); setEditing(null); toast('Saved', 'success'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const masked = user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 10)) + c);

  return (
    <div>
      <h1 className="settings-title">My Account</h1>
      <div className="account-card">
        <div className="account-banner" style={{ background: user.banner ? `center / cover no-repeat url(${user.banner}), ${user.banner_color || colorFor(user.id)}` : user.banner_color || colorFor(user.id) }} />
        <div className="account-head">
          <Avatar user={user} size={80} status="auto" ring="var(--bg-elevated)" />
          <div className="account-name">{user.display_name || user.username}<small>{user.username}</small></div>
          <button className="btn btn-primary btn-small" onClick={goProfile}>Edit User Profile</button>
        </div>
        <div className="account-fields">
          {(['display_name', 'username'] as const).map((f) => (
            <div key={f} className="account-field">
              {editing === f ? (
                <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                  <Field label={f === 'username' ? 'Username' : 'Display Name'} error={error}>
                    <input autoFocus value={value} maxLength={32} onChange={(e) => setValue(e.target.value)} />
                  </Field>
                  <div className="row-end">
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn btn-primary btn-small" disabled={busy}>Save</button>
                  </div>
                </form>
              ) : (
                <>
                  <div><div className="field-label">{f === 'username' ? 'Username' : 'Display Name'}</div><div>{(f === 'username' ? user.username : user.display_name) || <span className="muted">You haven't added a display name yet.</span>}</div></div>
                  <button className="btn btn-secondary btn-small" onClick={() => start(f)}>Edit</button>
                </>
              )}
            </div>
          ))}
          <EmailField showEmail={showEmail} masked={masked} toggleShow={() => setShowEmail((v) => !v)} />
          <PasswordField />
          <div className="account-field">
            <div><div className="field-label">Member Since</div><div>{formatShortDate(user.created_at)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailField({ showEmail, masked, toggleShow }: { showEmail: boolean; masked: string; toggleShow: () => void }) {
  const user = useAuthStore((s) => s.user!);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = user.pending_email ?? null;

  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const u = await changeEmail(email.trim(), password);
      setEditing(false); setPassword('');
      toast(u.pending_email ? `We sent a code to ${u.pending_email}` : 'Email updated', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setErrors({ email: errorMessage(err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="account-field account-field-stack">
      {editing ? (
        <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Field label="New Email" error={errors.email}>
            <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Current Password" error={errors.password} hint="We'll send a code to the new address. Your email only changes once you enter it.">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="row-end">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => { setEditing(false); setErrors({}); }}>Cancel</button>
            <button className="btn btn-primary btn-small" disabled={busy}>{busy ? 'Sending…' : 'Send Code'}</button>
          </div>
        </form>
      ) : (
        <div className="account-field-row">
          <div className="account-field-main">
            <div className="field-label">Email</div>
            <div className="email-line">
              <span className="email-value">{showEmail ? user.email : masked}</span>
              {user.verified !== false && <span className="verified-badge" title="Verified"><IconCheck size={12} strokeWidth={3} /> Verified</span>}
              <button className="btn-link" onClick={toggleShow}>{showEmail ? 'Hide' : 'Reveal'}</button>
            </div>
          </div>
          <button className="btn btn-secondary btn-small" onClick={() => { setEditing(true); setEmail(''); setPassword(''); setErrors({}); }}>Edit</button>
        </div>
      )}
      {pending && !editing && <PendingEmail pending={pending} />}
    </div>
  );
}

function PendingEmail({ pending }: { pending: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, restart] = useCountdown(resendWait(pending));

  const submit = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true); setError('');
    try { const u = await verifyEmail(c); toast(`Your email is now ${u.email}`, 'success'); }
    catch (e) { setError(describeCodeError(e).text); setCode(''); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setError('');
    try { const r = await resendVerification(); restart(r.resend_after); toast(`We sent a new code to ${r.email}`, 'success'); }
    catch (e) { if (e instanceof ApiError && e.retryAfter) restart(e.retryAfter); setError(describeCodeError(e).text); }
  };
  const cancel = async () => {
    try { await cancelEmailChange(); toast('Email change cancelled'); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div className="pending-email" role="region" aria-label="Pending email change">
      <div className="pending-email-text">Pending: <strong>{pending}</strong> — enter the code we sent.</div>
      <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(''); }} onComplete={(c) => void submit(c)} disabled={busy} invalid={!!error} label="Code for your new email" />
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="pending-email-actions">
        <button type="button" className="btn-link" disabled={left > 0} onClick={() => void resend()}>{left > 0 ? `Resend in ${left}s` : 'Resend code'}</button>
        <button type="button" className="btn-link danger-link" onClick={() => void cancel()}>Cancel change</button>
      </div>
      <p className="spam-hint">Didn't get it? Check your Spam or Promotions folder.</p>
    </div>
  );
}

function PasswordField() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const close = () => { setOpen(false); setCurrent(''); setNext(''); setConfirm(''); setErrors({}); };
  const save = async () => {
    const e: Record<string, string> = {};
    if (!current) e.password = 'Required';
    if (next.length < LIMITS.PASSWORD_MIN) e.new_password = `Must be at least ${LIMITS.PASSWORD_MIN} characters`;
    else if (next.length > 128) e.new_password = 'Too long';
    if (confirm !== next) e.confirm = "Passwords don't match";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      close();
      toast('Password changed. Other devices were signed out.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setErrors({ password: errorMessage(err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="account-field account-field-stack">
      {open ? (
        <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Field label="Current Password" error={errors.password}>
            <input type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New Password" error={errors.new_password}>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm New Password" error={errors.confirm} hint="Changing your password signs you out everywhere else.">
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="row-end">
            <button type="button" className="btn btn-ghost btn-small" onClick={close}>Cancel</button>
            <button className="btn btn-primary btn-small" disabled={busy}>{busy ? 'Saving…' : 'Change Password'}</button>
          </div>
        </form>
      ) : (
        <div className="account-field-row">
          <div className="account-field-main"><div className="field-label">Password</div><div className="muted">••••••••</div></div>
          <button className="btn btn-secondary btn-small" onClick={() => setOpen(true)}>Change Password</button>
        </div>
      )}
    </div>
  );
}

const BANNER_PRESETS = ['#0f766e', '#14b8a6', '#0369a1', '#7c3aed', '#be185d', '#c2410c', '#b45309', '#4d7c0f', '#334155'];
const ACCENT_PRESETS = ['#14b8a6', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80'];

function ColorSwatches({ value, presets, onChange, label }: { value: string; presets: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {presets.map((c) => (
        <button key={c} type="button" className={'swatch' + (value === c ? ' selected' : '')} style={{ background: c }} aria-label={c} onClick={() => onChange(c)}>{value === c && <IconCheck size={14} strokeWidth={3} />}</button>
      ))}
      <label className="swatch custom" style={{ background: value || 'var(--bg-input)' }} title="Custom colour">
        <input type="color" value={value || presets[0]} onChange={(e) => onChange(e.target.value)} />
        +
      </label>
      {value && <button type="button" className="btn-link" onClick={() => onChange('')}>Default</button>}
    </div>
  );
}

function ProfileTab() {
  const user = useAuthStore((s) => s.user!);
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [pronouns, setPronouns] = useState(user.pronouns ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [banner, setBanner] = useState(user.banner_color ?? '');
  const [accent, setAccent] = useState(user.accent_color ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const dirty = displayName !== (user.display_name ?? '') || bio !== (user.bio ?? '') || banner !== (user.banner_color ?? '')
    || pronouns !== (user.pronouns ?? '') || accent !== (user.accent_color ?? '');

  const reset = () => {
    setDisplayName(user.display_name ?? ''); setBio(user.bio ?? ''); setBanner(user.banner_color ?? '');
    setPronouns(user.pronouns ?? ''); setAccent(user.accent_color ?? ''); setError('');
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      await updateMe({
        display_name: displayName.trim() || null, bio: bio.trim() || null, banner_color: banner || null,
        pronouns: pronouns.trim() || null, accent_color: accent || null,
      });
      toast('Profile saved', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const onAvatar = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file', 'error'); return; }
    setAvatarBusy(true);
    try { await uploadAvatar(f); toast('Avatar updated', 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setAvatarBusy(false); }
  };
  const onBanner = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file', 'error'); return; }
    if (f.size > LIMITS.USER_BANNER_BYTES) { toast('Banner images must be 2 MB or smaller', 'error'); return; }
    setBannerBusy(true);
    try { await uploadProfileBanner(f); toast('Banner updated', 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBannerBusy(false); }
  };
  const dropBanner = async () => {
    setBannerBusy(true);
    try { await updateMe({ banner: null }); } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBannerBusy(false); }
  };

  // the preview follows unsaved edits; the banner image itself uploads straight away (like the avatar)
  const preview = {
    ...user, display_name: displayName || null, bio: bio || null, banner_color: banner || null,
    pronouns: pronouns.trim() || null, accent_color: accent || null,
  };
  const themed = accentProps(preview);

  return (
    <div>
      <h1 className="settings-title">Profile</h1>
      <div className="profile-editor">
        <div className="profile-form">
          <Field label="Display Name"><input value={displayName} maxLength={32} placeholder={user.username} onChange={(e) => setDisplayName(e.target.value)} /></Field>
          <Field label="Pronouns"><input value={pronouns} maxLength={LIMITS.PRONOUNS} placeholder="Add your pronouns" onChange={(e) => setPronouns(e.target.value)} /></Field>
          <div className="divider" />
          <div className="field-label">Avatar</div>
          <div className="row">
            <button className="btn btn-primary btn-small" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>{avatarBusy ? 'Uploading…' : 'Change Avatar'}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="divider" />
          <div className="field-label">Profile Banner</div>
          <div className="row">
            <button className="btn btn-primary btn-small" disabled={bannerBusy} onClick={() => bannerRef.current?.click()}>{bannerBusy ? 'Uploading…' : user.banner ? 'Change Banner' : 'Upload Banner'}</button>
            {user.banner && <button className="btn btn-secondary btn-small" disabled={bannerBusy} onClick={() => void dropBanner()}>Remove Banner</button>}
            <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void onBanner(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <p className="field-hint profile-hint">PNG, JPEG, GIF or WebP, up to 2 MB. Without an image, your banner uses this colour:</p>
          <ColorSwatches label="Banner colour" value={banner} presets={BANNER_PRESETS} onChange={setBanner} />
          <div className="divider" />
          <div className="field-label">Accent Color</div>
          <p className="field-hint profile-hint">Outlines your profile card and tints its headings.</p>
          <ColorSwatches label="Accent colour" value={accent} presets={ACCENT_PRESETS} onChange={setAccent} />
          <div className="divider" />
          <Field label="About Me" hint={`${LIMITS.BIO - bio.length} characters left. You can use markdown and links.`}>
            <textarea rows={4} maxLength={LIMITS.BIO} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell everyone a little about yourself" />
          </Field>
        </div>
        <div className="profile-preview">
          <div className="field-label">Preview</div>
          <div className={'user-popout static' + themed.className} style={themed.style}>
            <ProfileBanner user={preview} />
            <div className="popout-avatar"><Avatar user={preview} size={80} status="auto" ring="var(--bg-elevated)" /></div>
            <div className="popout-body">
              <div className="popout-names">
                <h3>{preview.display_name || user.username}</h3>
                <div className="popout-username">{user.username}</div>
                <Pronouns value={preview.pronouns} />
                {user.custom_status && <div className="popout-custom">{user.custom_status}</div>}
              </div>
              <div className="popout-section">
                {preview.bio && <><h4>About Me</h4><div className="popout-bio"><Markdown content={preview.bio} /></div></>}
                <h4>Member Since</h4><div className="popout-since">{formatShortDate(user.created_at)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {dirty && <UnsavedBar onReset={reset} onSave={save} busy={busy} error={error} />}
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState(getNotifyPrefs());
  const [perm, setPerm] = useState(notificationPermission());
  const update = (p: Partial<typeof prefs>) => { setNotifyPrefs(p); setPrefs(getNotifyPrefs()); };
  return (
    <div>
      <h1 className="settings-title">Notifications</h1>
      <div className="setting-row">
        <div>
          <div className="setting-title">Desktop Notifications</div>
          <div className="setting-desc">
            {perm === 'unsupported' ? 'Your browser does not support desktop notifications.'
              : perm === 'granted' ? 'Huddle can show desktop notifications for mentions and direct messages.'
              : perm === 'denied' ? 'Notifications are blocked by your browser. Allow them in your site settings to turn them on.'
              : 'Your browser needs your permission before Huddle can show desktop notifications.'}
          </div>
          {perm === 'default' && <button className="btn btn-primary btn-small mt" onClick={async () => setPerm(await requestNotificationPermission())}>Enable Desktop Notifications</button>}
        </div>
        <Toggle checked={prefs.desktop && perm === 'granted'} disabled={perm !== 'granted'} onChange={(v) => update({ desktop: v })} label="Desktop notifications" />
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-title">Notification Sounds</div>
          <div className="setting-desc">Play a short ping for mentions, direct messages and voice joins. <button className="btn-link" onClick={() => { setNotifyPrefs({ sounds: true }); playPing('message'); setNotifyPrefs({ sounds: prefs.sounds }); }}>Preview sound</button></div>
        </div>
        <Toggle checked={prefs.sounds} onChange={(v) => update({ sounds: v })} label="Sounds" />
      </div>
      <p className="muted small">Per-server settings (all messages, only mentions, nothing, mute) live in each server's menu under Notification Settings.</p>
    </div>
  );
}

function AppearanceTab() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {}, []);
  return (
    <div>
      <h1 className="settings-title">Appearance</h1>
      <div className="field-label">Theme</div>
      <div className="theme-cards">
        {(['dark', 'light'] as const).map((t) => (
          <button key={t} className={'theme-card ' + t + (theme === t ? ' selected' : '')} onClick={() => useUIStore.getState().setTheme(t)}>
            <span className="theme-swatch" data-theme-preview={t}><i /><i /><i /></span>
            <span className="theme-label">{t === 'dark' ? <IconMoon size={16} /> : <IconSun size={16} />}{t === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        ))}
      </div>
      <div className="appearance-preview">
        <div className="message first">
          <div className="message-row">
            <div className="message-gutter"><span className="avatar" style={{ width: 40, height: 40 }}><span className="avatar-fallback" style={{ background: '#0f766e' }}><LogoMark size={24} /></span></span></div>
            <div className="message-main">
              <div className="message-header"><span className="author-name" style={{ color: 'var(--accent)' }}>Huddle</span><span className="message-time">Today at 9:41 AM</span></div>
              <div className="message-content"><Markdown content={'Looking **sharp**! Themes switch instantly — try `light` or `dark`.'} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
