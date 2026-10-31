import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIMITS, VERIFICATION } from '@huddle/shared';
import { requestPasswordReset, requestResetPassword, resendWait, useAuthStore } from '../stores/auth';
import { adoptSession } from '../lib/session';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';
import { CodeInput } from '../components/common/CodeInput';
import { useCountdown } from './VerifyEmailPage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rateLimitText(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) {
    const s = Math.ceil(e.retryAfter ?? 0);
    if (s > 120) return `Too many requests. Please try again in about ${Math.ceil(s / 60)} minutes.`;
    if (s > 0) return `Too many requests. Please try again in ${s} second${s === 1 ? '' : 's'}.`;
  }
  return errorMessage(e);
}

/** Login → "Forgot your password?": email → code + new password → signed in. */
export function ForgotPassword({ next, adding }: { next: string; adding: boolean }) {
  const nav = useNavigate();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, restart] = useCountdown(0);

  const sendCode = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setFormError(''); setNotice('');
    if (!EMAIL_RE.test(email.trim())) { setErrors({ email: 'Enter a valid email address.' }); return; }
    setErrors({});
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      restart(resendWait(email.trim()) || VERIFICATION.RESEND_COOLDOWN_SECS);
      setStep('reset');
      setCode('');
      setNotice(`If an account exists for ${email.trim()}, we sent a code to it. It expires in 10 minutes.`);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      setFormError(rateLimitText(e));
    } finally { setBusy(false); }
  };

  const reset = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setFormError('');
    const e: Record<string, string> = {};
    if (code.length !== VERIFICATION.CODE_LENGTH) e.code = 'Enter the 6-digit code.';
    if (password.length < LIMITS.PASSWORD_MIN) e.new_password = `Must be at least ${LIMITS.PASSWORD_MIN} characters.`;
    else if (password.length > 128) e.new_password = 'Too long.';
    if (confirm !== password) e.confirm = "Passwords don't match.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await requestResetPassword(email.trim(), code, password);
      if (adding) { adoptSession(res.token, res.user); return; }
      useAuthStore.getState().setSession(res.token, res.user);
      nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      setFormError(rateLimitText(err));
      if (err instanceof ApiError && err.errors?.code) setCode('');
    } finally { setBusy(false); }
  };

  const suffix = adding ? '?add=1' : next !== '/channels/@me' ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      {step === 'email' ? (
        <form className="auth-card" onSubmit={sendCode} noValidate>
          <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
          <h1>Forgot your password?</h1>
          <p className="auth-sub">Enter the email on your account and we'll send you a code to choose a new password.</p>
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <label className={'field' + (errors.email ? ' has-error' : '')}>
            <span className="field-label">Email{errors.email && <em> — {errors.email}</em>}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Please wait…' : 'Send code'}</button>
          <div className="auth-switch">Remembered it? <Link to={`/login${suffix}`}>Back to log in</Link></div>
        </form>
      ) : (
        <form className="auth-card verify-card" onSubmit={reset} noValidate>
          <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
          <h1>Reset your password</h1>
          {notice && <p className="auth-sub">{notice}</p>}
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <div className={'field' + (errors.code ? ' has-error' : '')}>
            <span className="field-label">Code{errors.code && <em> — {errors.code}</em>}</span>
            <CodeInput value={code} onChange={(v) => { setCode(v); if (errors.code) setErrors((x) => ({ ...x, code: '' })); }} invalid={!!errors.code} autoFocus label="Reset code" />
          </div>
          <label className={'field' + (errors.new_password ? ' has-error' : '')}>
            <span className="field-label">New password{errors.new_password && <em> — {errors.new_password}</em>}</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className={'field' + (errors.confirm ? ' has-error' : '')}>
            <span className="field-label">Confirm new password{errors.confirm && <em> — {errors.confirm}</em>}</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Please wait…' : 'Reset password & log in'}</button>
          <div className="verify-actions">
            <button type="button" className="btn-link" disabled={left > 0 || busy} onClick={() => void sendCode()}>
              {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
            </button>
            <button type="button" className="btn-link" onClick={() => { setStep('email'); setFormError(''); setErrors({}); }}>Use a different email</button>
          </div>
          <p className="spam-hint">Didn't get it? Check your Spam or Promotions folder.</p>
          <div className="auth-switch"><Link to={`/login${suffix}`}>Back to log in</Link></div>
        </form>
      )}
    </div>
  );
}
