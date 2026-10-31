// The website's info pages (footer links). Lazy-loaded together; each page is a named export.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT, type Key } from '../i18n';
import { Blocks } from '../i18n/Rich';
import { InfoLayout, P, Sections } from './InfoLayout';
import { Logo } from './Buddies';
import { I, ICONS } from './icons';
import { useAppLinks } from './SiteChrome';

export { StatusPage } from './StatusPage';
export { FeedbackPage } from './FeedbackPage';
export { LicensesPage } from './LicensesPage';

const REPO = 'https://github.com/Ctrl-Joy/huddle';

const GitHubMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
  </svg>
);

function CtaRow({ children }: { children: ReactNode }) {
  return <div className="info-cta">{children}</div>;
}

// ---------- about ----------
export function AboutPage() {
  const t = useT();
  const { startLink } = useAppLinks();
  return (
    <InfoLayout title="about.title" kicker="about.kicker" h1="about.h1" lead="about.lead">
      <Sections prefix="about" count={4} />
      <CtaRow>
        <a className="btn pill-w" href={REPO} target="_blank" rel="noopener noreferrer"><GitHubMark />{t('about.cta.github')}</a>
        <Link className="btn ghost-w" to={startLink}>{t('about.cta.start')}<I d={ICONS.arrow} /></Link>
      </CtaRow>
    </InfoLayout>
  );
}

// ---------- careers ----------
export function CareersPage() {
  const t = useT();
  return (
    <InfoLayout title="careers.title" kicker="careers.kicker" h1="careers.h1" lead="careers.lead">
      <Sections prefix="careers" count={2} />
      <CtaRow>
        <Link className="btn pill-w" to="/feedback">{t('careers.cta')}<I d={ICONS.arrow} /></Link>
        <a className="btn ghost-w" href={REPO} target="_blank" rel="noopener noreferrer"><GitHubMark />GitHub</a>
      </CtaRow>
    </InfoLayout>
  );
}

// ---------- community guidelines ----------
export function GuidelinesPage() {
  return (
    <InfoLayout title="guidelines.title" kicker="guidelines.kicker" h1="guidelines.h1" lead="guidelines.lead">
      <Sections prefix="guidelines" count={9} />
    </InfoLayout>
  );
}

// ---------- developers ----------
const RUN = ['npm install', 'npm run seed -w @huddle/server', 'npm run dev'];

function CodeBlock({ lines }: { lines: string[] }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }, () => {});
  };
  return (
    <div className="code">
      <pre><code>{lines.map((l) => <span key={l}><span className="code-prompt" aria-hidden="true">$ </span>{l}{'\n'}</span>)}</code></pre>
      <button type="button" className="code-copy" onClick={copy} aria-live="polite">
        <I d={copied ? ICONS.check : ICONS.copy} />{copied ? t('dev.copied') : t('dev.copy')}
      </button>
    </div>
  );
}

export function DevelopersPage() {
  const t = useT();
  return (
    <InfoLayout title="dev.title" kicker="dev.kicker" h1="dev.h1" lead="dev.lead">
      <Sections prefix="dev" count={1} />
      <section aria-labelledby="dev-2">
        <h2 id="dev-2">{t('dev.2.h')}</h2>
        <Blocks text={t('dev.2.b')} />
        <CodeBlock lines={RUN} />
        <P k="dev.2.after" />
      </section>
      <Sections prefix="dev" count={2} from={3} />
      <CtaRow>
        <a className="btn pill-w" href={REPO} target="_blank" rel="noopener noreferrer"><GitHubMark />{t('dev.cta.repo')}</a>
        <a className="btn ghost-w" href={`${REPO}#readme`} target="_blank" rel="noopener noreferrer">{t('dev.cta.readme')}<I d={ICONS.external} /></a>
      </CtaRow>
    </InfoLayout>
  );
}

// ---------- policies ----------
export function TermsPage() {
  return (
    <InfoLayout title="terms.title" kicker="terms.kicker" h1="terms.h1" lead="terms.lead" legal>
      <Sections prefix="terms" count={9} />
    </InfoLayout>
  );
}

export function PrivacyPage() {
  return (
    <InfoLayout title="privacy.title" kicker="privacy.kicker" h1="privacy.h1" lead="privacy.lead" legal>
      <Sections prefix="privacy" count={9} />
    </InfoLayout>
  );
}

export function CookiesPage() {
  return (
    <InfoLayout title="cookies.title" kicker="cookies.kicker" h1="cookies.h1" lead="cookies.lead" legal>
      <Sections prefix="cookies" count={4} />
    </InfoLayout>
  );
}

// ---------- brand ----------
const LOGO_FILES: { label: Key; href: string; file: string }[] = [
  { label: 'brand.dl.svg', href: '/favicon.svg', file: 'huddle-logo.svg' },
  { label: 'brand.dl.512', href: '/icon-512.png', file: 'huddle-logo-512.png' },
  { label: 'brand.dl.192', href: '/icon-192.png', file: 'huddle-logo-192.png' },
  { label: 'brand.dl.apple', href: '/apple-touch-icon.png', file: 'huddle-logo-180.png' },
];

/** Colours from the app theme (styles/base.css) and the website (landing/hero.css). */
const COLORS: { name: Key; hex: string; ink: string }[] = [
  { name: 'brand.c.teal', hex: '#2DD4BF', ink: '#06201D' },
  { name: 'brand.c.tealDeep', hex: '#14B8A6', ink: '#06201D' },
  { name: 'brand.c.ink', hex: '#121214', ink: '#FFFFFF' },
  { name: 'brand.c.chat', hex: '#1A1A1E', ink: '#FFFFFF' },
  { name: 'brand.c.panel', hex: '#202024', ink: '#FFFFFF' },
  { name: 'brand.c.indigo', hex: '#0E0936', ink: '#FFFFFF' },
  { name: 'brand.c.royal', hex: '#2C1890', ink: '#FFFFFF' },
  { name: 'brand.c.footer', hex: '#4A4EE0', ink: '#FFFFFF' },
  { name: 'brand.c.violet', hex: '#8F7BFF', ink: '#120A46' },
  { name: 'brand.c.pink', hex: '#FF9BD2', ink: '#3A0D2A' },
];

function Swatch({ name, hex, ink }: { name: Key; hex: string; ink: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(hex).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }, () => {});
  return (
    <li className="bswatch">
      <button type="button" style={{ background: hex, color: ink }} onClick={copy} aria-label={t('brand.copy', { hex })}>
        <span aria-live="polite">{copied ? t('brand.copied', { hex }) : ''}</span>
      </button>
      <b>{t(name)}</b>
      <code>{hex}</code>
    </li>
  );
}

export function BrandPage() {
  const t = useT();
  return (
    <InfoLayout title="brand.title" kicker="brand.kicker" h1="brand.h1" lead="brand.lead" wide>
      <section aria-labelledby="brand-logo">
        <h2 id="brand-logo">{t('brand.logo.h')}</h2>
        <P k="brand.logo.b" />
        <div className="logo-tiles">
          <figure className="logo-tile dark">
            <img src="/favicon.svg" alt="" width={112} height={112} />
            <figcaption>{t('brand.onDark')}</figcaption>
          </figure>
          <figure className="logo-tile light">
            <img src="/favicon.svg" alt="" width={112} height={112} />
            <figcaption>{t('brand.onLight')}</figcaption>
          </figure>
          <figure className="logo-tile lockup">
            <span className="lockup-in"><span className="brand-mark"><Logo /></span><span className="word-pill">Huddle</span></span>
            <figcaption>Huddle</figcaption>
          </figure>
        </div>
        <ul className="downloads">
          {LOGO_FILES.map((f) => (
            <li key={f.href}>
              <a href={f.href} download={f.file}><I d={ICONS.download} /><span><span className="sr">{t('brand.download')}: </span>{t(f.label)}</span></a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="brand-colors">
        <h2 id="brand-colors">{t('brand.colors.h')}</h2>
        <P k="brand.colors.b" />
        <ul className="swatches">{COLORS.map((c) => <Swatch key={c.hex} {...c} />)}</ul>
      </section>
      <section aria-labelledby="brand-type">
        <h2 id="brand-type">{t('brand.type.h')}</h2>
        <P k="brand.type.b" />
        <div className="type-tiles">
          <div className="type-tile"><span className="type-sample disp">Aa Huddle</span><b>Unbounded</b><small>{t('brand.type.display')} · 800–900</small></div>
          <div className="type-tile"><span className="type-sample ui">Aa Huddle</span><b>Inter</b><small>{t('brand.type.ui')} · 400–800</small></div>
        </div>
      </section>
      <section aria-labelledby="brand-rules">
        <h2 id="brand-rules">{t('brand.rules.h')}</h2>
        <div className="rules">
          <div className="rule do"><h3><I d={ICONS.check} />{t('brand.do')}</h3><Blocks text={t('brand.do.list')} /></div>
          <div className="rule dont"><h3><I d={ICONS.close} />{t('brand.dont')}</h3><Blocks text={t('brand.dont.list')} /></div>
        </div>
      </section>
    </InfoLayout>
  );
}

