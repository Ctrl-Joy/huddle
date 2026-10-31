import { useEffect, useState, type FormEvent } from 'react';
import { ApiErrorCode, VERIFICATION } from '@huddle/shared';
import { changeEmail, resendVerification, resendWait, useAuthStore, verifyEmail } from '../stores/auth';
import { logout } from '../lib/session';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';
import { CodeInput } from '../components/common/CodeInput';
import { tNow, useDocTitle, useT } from '../i18n';

/** Counts down from `initial` seconds; `restart(n)` starts again. */
export function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, (n: number) => setLeft(Math.max(0, Math.ceil(n)))] as const;
}

/** Friendly text for code errors; `dead` = the code can't be used any more (ask for a new one). */
export function describeCodeError(e: unknown): { text: string; dead: boolean } {
  if (e instanceof ApiError) {
    switch (e.code) {
      case ApiErrorCode.VERIFICATION_CODE_EXPIRED: return { text: tNow('auth.err.codeExpired'), dead: true };
      case ApiErrorCode.VERIFICATION_CODE_EXHAUSTED: return { text: tNow('auth.err.codeExhausted'), dead: true };
      case ApiErrorCode.VERIFICATION_CODE_MISSING: return { text: tNow('auth.err.codeMissing'), dead: true };
      case ApiErrorCode.RATE_LIMITED: return { text: e.message || tNow('auth.err.slowDown'), dead: false };
    }
    return { text: e.message, dead: false };
  }
  return { text: errorMessage(e), dead: false };
}

/** A translated sentence with the address shown in bold where {email} was (marked with \u0000). */
function withEmail(text: string, email: string) {
  const [before, after = ''] = text.split('\u0000');
  return <>{before}<strong className="verify-email">{email}</strong>{after}</>;
}

/** Full-screen "Check your email" step shown while the signed-in account's email is unverified. */
export function VerifyEmailPage() {
  const user = useAuthStore((s) => s.user!);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, restart] = useCountdown(resendWait(user.email));
  const [changing, setChanging] = useState(false);
  const t = useT();
  useDocTitle('auth.verify.title');

  const submit = async (c = code) => {
    if (c.length !== VERIFICATION.CODE_LENGTH || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await verifyEmail(c); // user.verified flips → the app starts loading
    } catch (e) {
      setError(describeCodeError(e).text);
      setCode('');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setError(''); setNotice('');
    try {
      const r = await resendVerification();
      restart(r.resend_after);
      setCode('');
      setNotice(t('auth.verify.newSent', { email: r.email }));
    } catch (e) {
      if (e instanceof ApiError && e.retryAfter) restart(e.retryAfter);
      setError(describeCodeError(e).text);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <div className="auth-card verify-card">
        <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
        {changing ? (
          <ChangeEmailForm
            current={user.email}
            onDone={(email) => { setChanging(false); setCode(''); setError(''); restart(VERIFICATION.RESEND_COOLDOWN_SECS); setNotice(t('auth.verify.sentTo', { email })); }}
            onCancel={() => setChanging(false)}
          />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h1>{t('auth.verify.title')}</h1>
            <p className="auth-sub">{withEmail(t('auth.verify.sub', { email: '\u0000' }), user.email)}</p>
            {notice && <div className="form-success" role="status">{notice}</div>}
            <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(''); }} onComplete={(c) => void submit(c)} disabled={busy} invalid={!!error} autoFocus />
            {error && <div className="form-error code-error" role="alert">{error}</div>}
            <p className="verify-hint">{t('auth.verify.expires')}</p>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== VERIFICATION.CODE_LENGTH}>{busy ? t('auth.verify.checking') : t('auth.verify.btn')}</button>
            <div className="verify-actions">
              <button type="button" className="btn-link" onClick={() => void resend()} disabled={left > 0}>
                {left > 0 ? t('auth.resendIn', { n: left }) : t('auth.resend')}
              </button>
              <button type="button" className="btn-link" onClick={() => { setChanging(true); setError(''); setNotice(''); }}>{t('auth.verify.wrongEmail')}</button>
            </div>
            <p className="spam-hint">{t('auth.spam')}</p>
            <div className="auth-switch">{t('auth.verify.notYou')} <button type="button" className="btn-link" onClick={logout}>{t('auth.verify.logout')}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function ChangeEmailForm({ current, onDone, onCancel }: { current: string; onDone: (email: string) => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = t('auth.err.email');
    else if (email.trim().toLowerCase() === current.toLowerCase()) e.email = t('auth.err.sameEmail');
    if (!password) e.password = t('auth.err.required');
    setErrors(e); setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const u = await changeEmail(email.trim(), password);
      onDone(u.email);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1>{t('auth.change.title')}</h1>
      <p className="auth-sub">{withEmail(t('auth.change.sub', { email: '\u0000' }), current)}</p>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <label className={'field' + (errors.email ? ' has-error' : '')}>
        <span className="field-label">{t('auth.change.new')}{errors.email && <em> — {errors.email}</em>}</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      <label className={'field' + (errors.password ? ' has-error' : '')}>
        <span className="field-label">{t('auth.password')}{errors.password && <em> — {errors.password}</em>}</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.change.sending') : t('auth.forgot.send')}</button>
      <div className="auth-switch"><button type="button" className="btn-link" onClick={onCancel}>{t('auth.change.back')}</button></div>
    </form>
  );
}
