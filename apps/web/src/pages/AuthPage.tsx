import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LIMITS } from '@huddle/shared';
import { login, register, requestLogin, requestRegister, useAuthStore } from '../stores/auth';
import { adoptSession } from '../lib/session';
import { MAX_ACCOUNTS, listAccounts } from '../lib/accounts';
import { ApiError, errorMessage } from '../api/client';
import { LogoMark } from '../components/common/icons';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
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

  if (token && !adding) return <Navigate to={next} replace />;

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'register') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
      if (username.length < LIMITS.USERNAME_MIN || username.length > LIMITS.USERNAME_MAX) e.username = `Must be between ${LIMITS.USERNAME_MIN} and ${LIMITS.USERNAME_MAX} characters.`;
      else if (!/^[a-zA-Z0-9_.]+$/.test(username)) e.username = 'Only letters, numbers, underscores and periods.';
      if (password.length < LIMITS.PASSWORD_MIN) e.password = `Must be at least ${LIMITS.PASSWORD_MIN} characters.`;
    } else {
      if (!loginName.trim()) e.login = 'Required.';
      if (!password) e.password = 'Required.';
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
        <h1>{adding ? 'Add an account' : mode === 'login' ? 'Good to see you again' : 'Create your account'}</h1>
        <p className="auth-sub">{adding ? "Sign in to another account. You'll stay signed in to this one and can switch any time." : mode === 'login' ? 'Sign in to pick up where your huddles left off.' : 'Join your friends and communities in a few seconds.'}</p>
        {full && <div className="form-error" role="alert">You can keep up to {MAX_ACCOUNTS} accounts on this device. Signing in to another one will forget the oldest.</div>}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        {mode === 'register' ? (
          <>
            {field('email', 'Email', <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />)}
            {field('username', 'Username', <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={LIMITS.USERNAME_MAX} />)}
          </>
        ) : (
          field('login', 'Email or username', <input autoComplete="username" value={loginName} onChange={(e) => setLoginName(e.target.value)} autoFocus />)
        )}
        {field('password', 'Password', <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />)}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}</button>
        <div className="auth-switch">
          {mode === 'login'
            ? <>New here? <Link to={`/register${suffix}`}>Create an account</Link></>
            : <>Already have an account? <Link to={`/login${suffix}`}>Log in</Link></>}
          {adding && <div className="auth-back"><Link to="/channels/@me">Back to Huddle</Link></div>}
        </div>
      </form>
    </div>
  );
}
