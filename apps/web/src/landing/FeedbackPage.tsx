import { useId, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useT, type Key } from '../i18n';
import { Rich } from '../i18n/Rich';
import { InfoLayout } from './InfoLayout';
import { I, ICONS } from './icons';

// Same limits as POST /api/feedback (apps/server/src/routes/site.ts).
const MIN = 10;
const MAX = 2000;
const CATEGORIES = ['bug', 'idea', 'question', 'report', 'other'] as const;
type Category = (typeof CATEGORIES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FeedbackPage() {
  const t = useT();
  const user = useAuthStore((s) => (s.token ? s.user : null));
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [includeUser, setIncludeUser] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [errors, setErrors] = useState<{ message?: string; email?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const validate = () => {
    const e: typeof errors = {};
    const len = message.trim().length;
    if (len < MIN) e.message = t('fb.err.short', { n: MIN });
    else if (len > MAX) e.message = t('fb.err.long', { n: MAX });
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = t('fb.err.email');
    setErrors(e);
    return !e.message && !e.email;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      await api.post('/feedback', {
        category, message: message.trim(), email: email.trim() || null,
        include_username: !!user && includeUser, website,
      });
      setDone(true);
      setMessage(''); setEmail(''); setIncludeUser(false);
      requestAnimationFrame(() => doneRef.current?.focus());
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setErrors({ form: t('fb.err.rate') });
      else if (e instanceof ApiError && e.errors?.email) setErrors({ email: t('fb.err.email') });
      else if (e instanceof ApiError && e.errors?.message) setErrors({ message: t('fb.err.short', { n: MIN }) });
      else setErrors({ form: t('fb.err.generic') });
    } finally {
      setBusy(false);
    }
  };

  const catLabel: Record<Category, Key> = { bug: 'fb.cat.bug', idea: 'fb.cat.idea', question: 'fb.cat.question', report: 'fb.cat.report', other: 'fb.cat.other' };
  const count = message.trim().length;

  return (
    <InfoLayout title="fb.title" kicker="fb.kicker" h1="fb.h1" lead="fb.lead">
      {done ? (
        <div className="fb-done" ref={doneRef} tabIndex={-1} role="status">
          <span className="fb-done-ic" aria-hidden="true"><I d={ICONS.check} /></span>
          <h2>{t('fb.done.h')}</h2>
          <p>{t('fb.done.b')}</p>
          <button type="button" className="btn ghost-w" onClick={() => setDone(false)}>{t('fb.again')}</button>
        </div>
      ) : (
        <form className="fb-form" onSubmit={submit} noValidate>
          {errors.form && <p className="fb-error form" role="alert">{errors.form}</p>}
          <fieldset className="fb-cats">
            <legend>{t('fb.category')}</legend>
            <div className="fb-chips">
              {CATEGORIES.map((c) => (
                <label key={c} className={'fb-chip' + (category === c ? ' on' : '')}>
                  <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
                  <span>{t(catLabel[c])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="fb-field">
            <label htmlFor={`${id}-msg`}>{t('fb.message')}</label>
            <textarea
              id={`${id}-msg`} value={message} rows={7} maxLength={MAX + 200} placeholder={t('fb.messagePh')}
              onChange={(e) => { setMessage(e.target.value); if (errors.message) setErrors((x) => ({ ...x, message: undefined })); }}
              aria-invalid={!!errors.message} aria-describedby={`${id}-msg-hint${errors.message ? ` ${id}-msg-err` : ''}`} required
            />
            <div className="fb-hint">
              <span id={`${id}-msg-hint`}>{t('fb.messageHint', { min: MIN, max: MAX })}</span>
              <span className={count > MAX ? 'over' : ''} aria-hidden="true">{count}/{MAX}</span>
            </div>
            {errors.message && <p className="fb-error" id={`${id}-msg-err`} role="alert">{errors.message}</p>}
          </div>

          <div className="fb-field">
            <label htmlFor={`${id}-email`}>{t('fb.email')}</label>
            <input
              id={`${id}-email`} type="email" autoComplete="email" value={email} maxLength={254}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((x) => ({ ...x, email: undefined })); }}
              aria-invalid={!!errors.email} aria-describedby={`${id}-email-hint${errors.email ? ` ${id}-email-err` : ''}`}
            />
            <div className="fb-hint"><span id={`${id}-email-hint`}>{t('fb.emailHint')}</span></div>
            {errors.email && <p className="fb-error" id={`${id}-email-err`} role="alert">{errors.email}</p>}
          </div>

          {user && (
            <label className="fb-check">
              <input type="checkbox" checked={includeUser} onChange={(e) => setIncludeUser(e.target.checked)} />
              <span>
                <b>{t('fb.include', { name: user.username })}</b>
                <small>{t('fb.includeHint')}</small>
              </span>
            </label>
          )}

          {/* honeypot: hidden from people and assistive tech; bots that fill it are ignored by the server */}
          <div className="fb-trap" aria-hidden="true">
            <label>{t('fb.honeypot')}<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>

          <button className="btn pill-w fb-send" disabled={busy}>{busy ? t('fb.sending') : t('fb.send')}{!busy && <I d={ICONS.arrow} />}</button>
          <p className="fb-privacy"><Rich text={t('fb.privacy')} /></p>
        </form>
      )}
    </InfoLayout>
  );
}
