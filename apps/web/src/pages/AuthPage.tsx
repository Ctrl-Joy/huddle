import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LIMITS } from '@huddle/shared';
import { login, register, requestLogin, requestRegister, useAuthStore } from '../stores/auth';
import { ForgotPassword } from './ForgotPassword';
import { adoptSession } from '../lib/session';
import { MAX_ACCOUNTS, listAccounts } from '../lib/accounts';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';
import { useDocTitle, useT } from '../i18n';

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const token = useAuthStore((s) => s.token);
  const [params] = useSearchParams();
  const next = params.get('next') || '/channels/@me';
  // "Add an account": sign in to another account without logging out of the current one
  const adding = params.get('add') === '1' && !!token;
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  useDocTitle(mode === 'register' ? 'auth.register.title' : mode === 'forgot' ? 'auth.forgot.title' : 'auth.login.title');

  if (token && !adding) return <Navigate to={next} replace />;
  if (mode === 'forgot') return <ForgotPassword next={next} adding={adding} />;

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'register') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('auth.err.email');
      if (username.length < LIMITS.USERNAME_MIN || username.length > LIMITS.USERNAME_MAX) e.username = t('auth.err.usernameLen', { min: LIMITS.USERNAME_MIN, max: LIMITS.USERNAME_MAX });
      else if (!/^[a-zA-Z0-9_.]+$/.test(username)) e.username = t('auth.err.usernameChars');
      if (password.length < LIMITS.PASSWORD_MIN) e.password = t('auth.err.passwordLen', { n: LIMITS.PASSWORD_MIN });
    } else {
      if (!loginName.trim()) e.login = t('auth.err.required');
      if (!password) e.password = t('auth.err.required');
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      if (adding) {
        const res = mode === 'login' ? await requestLogin(loginName.trim(), password) : await requestRegister(email.trim(), username.trim(), password);
        adoptSession(res.token, res.user);
        return;
      }
      if (mode === 'login') await login(loginName.trim(), password);
      else await register(email.trim(), username.trim(), password);
      nav(next, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      setFormError(errorMessage(e));
    } finally { setBusy(false); }
  };

  const field = (name: string, label: string, input: ReactElement) => (
    <label className={'field' + (errors[name] ? ' has-error' : '')}>
      <span className="field-label">{label}{errors[name] && <em> — {errors[name]}</em>}</span>
      {input}
    </label>
  );

  const suffix = adding ? '?add=1' : next !== '/channels/@me' ? `?next=${encodeURIComponent(next)}` : '';
  const full = adding && listAccounts().length >= MAX_ACCOUNTS;

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
        <h1>{adding ? t('auth.add.title') : mode === 'login' ? t('auth.login.title') : t('auth.register.title')}</h1>
        <p className="auth-sub">{adding ? t('auth.add.sub') : mode === 'login' ? t('auth.login.sub') : t('auth.register.sub')}</p>
        {full && <div className="form-error" role="alert">{t('auth.add.full', { n: MAX_ACCOUNTS })}</div>}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        {mode === 'register' ? (
          <>
            {field('email', t('auth.email'), <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />)}
            {field('username', t('auth.username'), <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={LIMITS.USERNAME_MAX} />)}
          </>
        ) : (
          field('login', t('auth.loginName'), <input autoComplete="username" value={loginName} onChange={(e) => setLoginName(e.target.value)} autoFocus />)
        )}
        {field('password', t('auth.password'), <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />)}
        {mode === 'login' && <Link className="auth-forgot" to={`/forgot-password${suffix}`}>{t('auth.forgotLink')}</Link>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.wait') : mode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')}</button>
        <div className="auth-switch">
          {mode === 'login'
            ? <>{t('auth.newHere')} <Link to={`/register${suffix}`}>{t('auth.createLink')}</Link></>
            : <>{t('auth.haveAccount')} <Link to={`/login${suffix}`}>{t('auth.loginLink')}</Link></>}
          {adding && <div className="auth-back"><Link to="/channels/@me">{t('auth.backToApp')}</Link></div>}
        </div>
      </form>
    </div>
  );
}
