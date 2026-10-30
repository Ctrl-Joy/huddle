import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@huddle/shared';
import { SettingsLayout, UnsavedBar } from './SettingsLayout';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, confirmDialog, toast } from '../../stores/ui';
import { updateMe, uploadAvatar } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { logout } from '../../lib/session';
import { colorFor, formatShortDate } from '../../lib/format';
import { getNotifyPrefs, setNotifyPrefs, notificationPermission, requestNotificationPermission, playPing } from '../../lib/notifications';
import { Avatar } from '../common/Avatar';
import { Field, Toggle } from '../modals/Modal';
import { Markdown } from '../../lib/markdown';
import { LogoMark, IconMoon, IconSun, IconCheck } from '../common/icons';
import { VoiceVideoSettings } from './VoiceVideoSettings';

type Tab = 'account' | 'profile' | 'notifications' | 'voice' | 'appearance';

export function UserSettings({ close, tab: initial }: { close: () => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'account');
  return (
    <SettingsLayout
      close={close}
      active={tab}
      onSelect={(id) => {
        if (id === 'logout') confirmDialog({ title: 'Log Out', body: 'Are you sure you want to log out?', confirmLabel: 'Log Out', danger: true, onConfirm: () => { close(); logout(); } });
        else setTab(id as Tab);
      }}
      sections={[
        { header: 'User Settings', items: [{ id: 'account', label: 'My Account' }, { id: 'profile', label: 'Profile' }] },
        { header: 'App Settings', items: [{ id: 'appearance', label: 'Appearance' }, { id: 'voice', label: 'Voice & Video' }, { id: 'notifications', label: 'Notifications' }] },
        { items: [{ id: 'logout', label: 'Log Out', danger: true }] },
      ]}
    >
      {tab === 'account' && <MyAccount goProfile={() => setTab('profile')} />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'voice' && <VoiceVideoSettings />}
      {tab === 'appearance' && <AppearanceTab />}
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
        <div className="account-banner" style={{ background: user.banner_color || colorFor(user.id) }} />
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
          <div className="account-field">
            <div><div className="field-label">Email</div><div>{showEmail ? user.email : masked} <button className="btn-link" onClick={() => setShowEmail((v) => !v)}>{showEmail ? 'Hide' : 'Reveal'}</button></div></div>
          </div>
          <div className="account-field">
            <div><div className="field-label">Member Since</div><div>{formatShortDate(user.created_at)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const BANNER_PRESETS = ['#0f766e', '#14b8a6', '#0369a1', '#7c3aed', '#be185d', '#c2410c', '#b45309', '#4d7c0f', '#334155'];

function ProfileTab() {
  const user = useAuthStore((s) => s.user!);
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [banner, setBanner] = useState(user.banner_color ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = displayName !== (user.display_name ?? '') || bio !== (user.bio ?? '') || banner !== (user.banner_color ?? '');

  const reset = () => { setDisplayName(user.display_name ?? ''); setBio(user.bio ?? ''); setBanner(user.banner_color ?? ''); setError(''); };
  const save = async () => {
    setBusy(true); setError('');
    try { await updateMe({ display_name: displayName.trim() || null, bio: bio.trim() || null, banner_color: banner || null }); toast('Profile saved', 'success'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const onAvatar = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file', 'error'); return; }
    setAvatarBusy(true);
    try { await uploadAvatar(f); toast('Avatar updated', 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setAvatarBusy(false); }
  };

  const preview = { ...user, display_name: displayName || null, bio: bio || null, banner_color: banner || null };

  return (
    <div>
      <h1 className="settings-title">Profile</h1>
      <div className="profile-editor">
        <div className="profile-form">
          <Field label="Display Name"><input value={displayName} maxLength={32} placeholder={user.username} onChange={(e) => setDisplayName(e.target.value)} /></Field>
          <div className="divider" />
          <div className="field-label">Avatar</div>
          <div className="row">
            <button className="btn btn-primary btn-small" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>{avatarBusy ? 'Uploading…' : 'Change Avatar'}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="divider" />
          <div className="field-label">Banner Color</div>
          <div className="swatches">
            {BANNER_PRESETS.map((c) => (
              <button key={c} className={'swatch' + (banner === c ? ' selected' : '')} style={{ background: c }} aria-label={c} onClick={() => setBanner(c)}>{banner === c && <IconCheck size={14} strokeWidth={3} />}</button>
            ))}
            <label className="swatch custom" style={{ background: banner || 'var(--bg-input)' }} title="Custom colour">
              <input type="color" value={banner || '#14b8a6'} onChange={(e) => setBanner(e.target.value)} />
              +
            </label>
            {banner && <button className="btn-link" onClick={() => setBanner('')}>Default</button>}
          </div>
          <div className="divider" />
          <Field label="About Me" hint={`${190 - bio.length} characters left. You can use markdown and links.`}>
            <textarea rows={4} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell everyone a little about yourself" />
          </Field>
        </div>
        <div className="profile-preview">
          <div className="field-label">Preview</div>
          <div className="user-popout static">
            <div className="popout-banner" style={{ background: preview.banner_color || colorFor(user.id) }}><span className="popout-banner-mark"><LogoMark size={46} /></span></div>
            <div className="popout-avatar"><Avatar user={preview} size={80} status="auto" ring="var(--bg-elevated)" /></div>
            <div className="popout-body">
              <div className="popout-names"><h3>{preview.display_name || user.username}</h3><div className="popout-username">{user.username}</div>{user.custom_status && <div className="popout-custom">{user.custom_status}</div>}</div>
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
