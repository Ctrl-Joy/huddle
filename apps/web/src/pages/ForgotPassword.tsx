import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIMITS, VERIFICATION } from '@huddle/shared';
import { requestPasswordReset, requestResetPassword, resendWait, useAuthStore } from '../stores/auth';
import { adoptSession } from '../lib/session';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';
import { CodeInput } from '../components/common/CodeInput';
import { useCountdown } from './VerifyEmailPage';
import { tNow, useT } from '../i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rateLimitText(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) {
    const s = Math.ceil(e.retryAfter ?? 0);
    if (s > 120) return tNow('auth.err.rateMinutes', { n: Math.ceil(s / 60) });
    if (s > 0) return tNow('auth.err.rateSeconds', { n: s });
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
  const t = useT();

  const sendCode = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setFormError(''); setNotice('');
    if (!EMAIL_RE.test(email.trim())) { setErrors({ email: t('auth.err.email') }); return; }
    setErrors({});
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      restart(resendWait(email.trim()) || VERIFICATION.RESEND_COOLDOWN_SECS);
      setStep('reset');
      setCode('');
      setNotice(t('auth.forgot.sent', { email: email.trim() }));
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      setFormError(rateLimitText(e));
    } finally { setBusy(false); }
  };

  const reset = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setFormError('');
    const e: Record<string, string> = {};
    if (code.length !== VERIFICATION.CODE_LENGTH) e.code = t('auth.err.code');
    if (password.length < LIMITS.PASSWORD_MIN) e.new_password = t('auth.err.passwordLen', { n: LIMITS.PASSWORD_MIN });
    else if (password.length > 128) e.new_password = t('auth.err.tooLong');
    if (confirm !== password) e.confirm = t('auth.err.mismatch');
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
          <h1>{t('auth.forgot.title')}</h1>
          <p className="auth-sub">{t('auth.forgot.sub')}</p>
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <label className={'field' + (errors.email ? ' has-error' : '')}>
            <span className="field-label">{t('auth.email')}{errors.email && <em> — {errors.email}</em>}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.wait') : t('auth.forgot.send')}</button>
          <div className="auth-switch">{t('auth.forgot.remembered')} <Link to={`/login${suffix}`}>{t('auth.forgot.back')}</Link></div>
        </form>
      ) : (
        <form className="auth-card verify-card" onSubmit={reset} noValidate>
          <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
          <h1>{t('auth.reset.title')}</h1>
          {notice && <p className="auth-sub">{notice}</p>}
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <div className={'field' + (errors.code ? ' has-error' : '')}>
            <span className="field-label">{t('auth.reset.code')}{errors.code && <em> — {errors.code}</em>}</span>
            <CodeInput value={code} onChange={(v) => { setCode(v); if (errors.code) setErrors((x) => ({ ...x, code: '' })); }} invalid={!!errors.code} autoFocus label={t('auth.reset.codeLabel')} />
          </div>
          <label className={'field' + (errors.new_password ? ' has-error' : '')}>
            <span className="field-label">{t('auth.reset.new')}{errors.new_password && <em> — {errors.new_password}</em>}</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className={'field' + (errors.confirm ? ' has-error' : '')}>
            <span className="field-label">{t('auth.reset.confirm')}{errors.confirm && <em> — {errors.confirm}</em>}</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.wait') : t('auth.reset.submit')}</button>
          <div className="verify-actions">
            <button type="button" className="btn-link" disabled={left > 0 || busy} onClick={() => void sendCode()}>
              {left > 0 ? t('auth.resendIn', { n: left }) : t('auth.resend')}
            </button>
            <button type="button" className="btn-link" onClick={() => { setStep('email'); setFormError(''); setErrors({}); }}>{t('auth.reset.otherEmail')}</button>
          </div>
          <p className="spam-hint">{t('auth.spam')}</p>
          <div className="auth-switch"><Link to={`/login${suffix}`}>{t('auth.forgot.back')}</Link></div>
        </form>
      )}
    </div>
  );
}
