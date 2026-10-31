import { useEffect, useState, type FormEvent } from 'react';
import { ApiErrorCode, VERIFICATION } from '@huddle/shared';
import { changeEmail, resendVerification, resendWait, useAuthStore, verifyEmail } from '../stores/auth';
import { logout } from '../lib/session';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';
import { CodeInput } from '../components/common/CodeInput';

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
      case ApiErrorCode.VERIFICATION_CODE_EXPIRED: return { text: 'That code has expired. Send yourself a new one.', dead: true };
      case ApiErrorCode.VERIFICATION_CODE_EXHAUSTED: return { text: 'Too many wrong tries. Send yourself a new code.', dead: true };
      case ApiErrorCode.VERIFICATION_CODE_MISSING: return { text: 'That code is no longer active. Send yourself a new one.', dead: true };
      case ApiErrorCode.RATE_LIMITED: return { text: e.message || 'Slow down a little and try again shortly.', dead: false };
    }
    return { text: e.message, dead: false };
  }
  return { text: errorMessage(e), dead: false };
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
      setNotice(`We sent a new code to ${r.email}.`);
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
            onDone={(email) => { setChanging(false); setCode(''); setError(''); restart(VERIFICATION.RESEND_COOLDOWN_SECS); setNotice(`We sent a code to ${email}.`); }}
            onCancel={() => setChanging(false)}
          />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h1>Check your email</h1>
            <p className="auth-sub">We sent a 6-digit code to <strong className="verify-email">{user.email}</strong>. Enter it below to finish setting up your account.</p>
            {notice && <div className="form-success" role="status">{notice}</div>}
            <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(''); }} onComplete={(c) => void submit(c)} disabled={busy} invalid={!!error} autoFocus />
            {error && <div className="form-error code-error" role="alert">{error}</div>}
            <p className="verify-hint">The code expires in 10 minutes.</p>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== VERIFICATION.CODE_LENGTH}>{busy ? 'Checking…' : 'Verify'}</button>
            <div className="verify-actions">
              <button type="button" className="btn-link" onClick={() => void resend()} disabled={left > 0}>
                {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
              </button>
              <button type="button" className="btn-link" onClick={() => { setChanging(true); setError(''); setNotice(''); }}>Wrong email? Change it</button>
            </div>
            <p className="spam-hint">Didn't get it? Check your Spam or Promotions folder.</p>
            <div className="auth-switch">Not you? <button type="button" className="btn-link" onClick={logout}>Log out</button></div>
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

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    else if (email.trim().toLowerCase() === current.toLowerCase()) e.email = "That's the address you already have.";
    if (!password) e.password = 'Required.';
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
      <h1>Change your email</h1>
      <p className="auth-sub">We'll send a new code to the address you enter. Currently: <strong className="verify-email">{current}</strong></p>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <label className={'field' + (errors.email ? ' has-error' : '')}>
        <span className="field-label">New email{errors.email && <em> — {errors.email}</em>}</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      <label className={'field' + (errors.password ? ' has-error' : '')}>
        <span className="field-label">Password{errors.password && <em> — {errors.password}</em>}</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      <div className="auth-switch"><button type="button" className="btn-link" onClick={onCancel}>Back</button></div>
    </form>
  );
}
