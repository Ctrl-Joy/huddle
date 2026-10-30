import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconClose, IconMenu, LogoMark } from '../components/common/icons';
import { SocialShape } from './art';
import { useAppHref } from './common';
import './landing.css';

const NAV = [
  { to: '/download', label: 'Download' },
  { to: '/safety', label: 'Safety' },
  { to: '/support', label: 'Support' },
  { to: '/blog', label: 'Blog' },
];

const LANGS = ['English', 'Español', 'Français', 'Deutsch', 'Português', 'हिन्दी', '日本語', 'Bahasa Indonesia'];

function Brand() {
  return (
    <Link to="/" className="lp-brand" aria-label="Huddle home">
      <span className="lp-brand-mark"><LogoMark size={26} /></span>
      <span className="lp-brand-word">Huddle</span>
    </Link>
  );
}

function Nav({ scrolled }: { scrolled: boolean }) {
  const { loggedIn, href } = useAppHref();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
    <header className={'lp-nav' + (scrolled ? ' scrolled' : '')}>
      <div className="lp-wrap lp-nav-in">
        <Brand />
        <nav className="lp-nav-links" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className="lp-nav-link">{n.label}</NavLink>)}
        </nav>
        <div className="lp-nav-cta">
          <Link to={href} className={'lp-btn ' + (loggedIn ? 'lp-btn-primary' : 'lp-btn-light')}>{loggedIn ? 'Open Huddle' : 'Log in'}</Link>
          <button ref={toggleRef} type="button" className="lp-burger" aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open} aria-controls="lp-drawer" onClick={() => setOpen((o) => !o)}>
            {open ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>
    </header>
      <div className={'lp-scrim' + (open ? ' open' : '')} onClick={() => setOpen(false)} aria-hidden="true" />
      <div id="lp-drawer" className={'lp-drawer' + (open ? ' open' : '')} inert={!open} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="lp-drawer-top"><Brand />
          <button ref={closeRef} type="button" className="lp-burger lp-drawer-close" aria-label="Close menu" onClick={() => { setOpen(false); toggleRef.current?.focus(); }}><IconClose size={22} /></button>
        </div>
        <nav aria-label="Mobile">
          <NavLink to="/" end className="lp-drawer-link">Home</NavLink>
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className="lp-drawer-link">{n.label}</NavLink>)}
        </nav>
        <div className="lp-drawer-foot">
          <Link to={href} className="lp-btn lp-btn-primary lp-btn-block">{loggedIn ? 'Open Huddle' : 'Log in'}</Link>
          {!loggedIn && <Link to="/register" className="lp-btn lp-btn-ghost lp-btn-block">Create a free account</Link>}
        </div>
      </div>
    </>
  );
}

function Footer() {
  const { loggedIn, href } = useAppHref();
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('huddle.lp.lang') || 'English'; } catch { return 'English'; } });
  const cols: { h: string; links: [string, string][] }[] = [
    { h: 'Product', links: [['Download', '/download'], ['Open in browser', '/channels/@me'], ['Features', '/#features'], ['Create an account', '/register']] },
    { h: 'Company', links: [['Why we built Huddle', '/blog/why-we-built-huddle'], ['Blog', '/blog'], ['Contact', '/support#contact']] },
    { h: 'Resources', links: [['Support centre', '/support'], ['Getting started', '/support#faq'], ['Parents & teens', '/safety#families'], ['Safety centre', '/safety']] },
    { h: 'Policies', links: [['Community principles', '/safety#principles'], ['Your controls', '/safety#controls'], ['Privacy basics', '/safety#privacy'], ['Safety FAQ', '/safety#faq']] },
  ];
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-foot-top">
          <div className="lp-foot-brand">
            <Brand />
            <p>A cosy, fast place for the groups you care about. Made with care, for people who&apos;d rather be talking than configuring.</p>
            <label className="lp-lang">
              <span className="lp-sr">Language</span>
              <span className="lp-lang-ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
              </span>
              <select value={lang} onChange={(e) => { setLang(e.target.value); try { localStorage.setItem('huddle.lp.lang', e.target.value); } catch { /* ignore */ } }}>
                {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            {lang !== 'English' && <p className="lp-lang-note">Translations are on the way — the site is shown in English for now.</p>}
            <ul className="lp-social" aria-label="Social channels (coming soon)">
              {(['circle', 'square', 'triangle', 'wave'] as const).map((s) => (
                <li key={s}><span role="img" aria-label={`Social profile placeholder (${s})`} className="lp-social-i"><SocialShape shape={s} /></span></li>
              ))}
            </ul>
          </div>
          {cols.map((c) => (
            <nav key={c.h} className="lp-foot-col" aria-label={c.h}>
              <h2>{c.h}</h2>
              <ul>{c.links.map(([l, to]) => <li key={l}><Link to={to}>{l}</Link></li>)}</ul>
            </nav>
          ))}
        </div>
        <div className="lp-foot-bottom">
          <Brand />
          <span>© {new Date().getFullYear()} Huddle. An independent project.</span>
          <Link to={loggedIn ? href : "/register"} className="lp-btn lp-btn-primary lp-btn-sm">{loggedIn ? "Open Huddle" : "Sign up"}</Link>
        </div>
      </div>
    </footer>
  );
}

function PageFallback() {
  return <div className="lp-page-loading" role="status"><span className="lp-spinner" /><span className="lp-sr">Loading…</span></div>;
}

export default function LandingLayout() {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();

  // Scroll to top (or to #hash) on navigation.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loc.hash) {
      let tries = 0;
      const seek = () => {
        const target = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
        if (target) target.scrollIntoView({ block: 'start' });
        else if (tries++ < 20) window.setTimeout(seek, 60);
      };
      seek();
    } else {
      el.scrollTo({ top: 0 });
    }
  }, [loc.pathname, loc.hash]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Hand the default title back to the app when leaving the marketing site.
  useEffect(() => () => { document.title = 'Huddle'; }, []);

  return (
    <div className="lp" ref={scroller} id="top">
      <a href="#lp-main" className="lp-skip">Skip to content</a>
      <Nav scrolled={scrolled} />
      <main id="lp-main" tabIndex={-1}>
        <Suspense fallback={<PageFallback />}><Outlet /></Suspense>
      </main>
      <Footer />
    </div>
  );
}

