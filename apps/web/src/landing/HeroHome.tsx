import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import './hero.css';

const SKY_VIDEO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4b73c700-3112-4c07-bd48-0af2893dff7c.mp4';
const SKY_POSTER = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/download', label: 'Download' },
  { to: '/safety', label: 'Safety' },
  { to: '/support', label: 'Support' },
  { to: '/blog', label: 'Blog' },
];

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Full-screen, non-scrolling hero home page. */
export default function HeroHome() {
  const loggedIn = useAuthStore((s) => !!s.token);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCtaRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Huddle — Your people. Your space.';
    return () => { document.title = prev; };
  }, []);

  // Entrance: hide before first paint, play once fonts are ready, then strip the classes.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    root.classList.add('intro');
    const clear = () => root.classList.remove('intro', 'intro-play');
    const failsafe = window.setTimeout(clear, 5000);
    let started = false;
    let endTimer = 0;
    const onEnd = (e: AnimationEvent) => { if (e.target === lastCtaRef.current) clear(); };
    const start = () => {
      if (started) return;
      started = true;
      root.classList.add('intro-play');
      lastCtaRef.current?.addEventListener('animationend', onEnd);
      endTimer = window.setTimeout(clear, 3000);
    };
    const fontTimer = window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(start)), 700);
    document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(start)));
    return () => {
      window.clearTimeout(failsafe); window.clearTimeout(fontTimer); window.clearTimeout(endTimer);
      lastCtaRef.current?.removeEventListener('animationend', onEnd);
    };
  }, []);

  // Mobile menu: close on outside click and Escape.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  // Background video: autoplay alone isn't reliable, so keep nudging it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const play = () => { if (v.paused) v.play().catch(() => {}); };
    const onVis = () => { if (document.visibilityState === 'visible') play(); };
    const once = { once: true, passive: true } as const;
    play();
    v.addEventListener('canplay', play);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', play, once);
    window.addEventListener('touchstart', play, once);
    window.addEventListener('scroll', play, once);
    return () => {
      v.removeEventListener('canplay', play);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', play);
      window.removeEventListener('touchstart', play);
      window.removeEventListener('scroll', play);
    };
  }, []);

  const appLink = loggedIn ? '/channels/@me' : '/login';

  return (
    <div className="hx" ref={rootRef}>
      <video
        ref={videoRef} className="sky" aria-hidden="true" autoPlay muted loop playsInline preload="auto"
        poster={SKY_POSTER} src={SKY_VIDEO}
      />
      <div className="veil" />

      <header className="bar" ref={barRef} data-open={open ? 'true' : 'false'}>
        <Link className="brand" to="/" aria-label="Huddle — home">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="18" cy="20" r="10" fill="currentColor" opacity="0.95" />
            <circle cx="30" cy="20" r="10" fill="currentColor" opacity="0.6" />
            <circle cx="24" cy="30" r="10" fill="currentColor" opacity="0.35" />
            <path d="M12 30 9 38l8-4" fill="currentColor" opacity="0.95" />
          </svg>
          <span>Huddle</span>
        </Link>
        <nav className="links" aria-label="Primary">
          {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
        </nav>
        <div className="actions">
          <Link className="btn ghost" to={appLink}>{loggedIn ? 'Open Huddle' : 'Log in'}</Link>
          {!loggedIn && <Link className="btn solid" to="/register">Sign up</Link>}
          <button
            className="menu" aria-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="menu-sheet"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            <svg viewBox="0 0 20 14" aria-hidden="true">
              <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <nav className="sheet" id="menu-sheet" aria-label="Menu">
            {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
            <Link className="btn solid" to={loggedIn ? '/channels/@me' : '/register'}>{loggedIn ? 'Open Huddle' : 'Sign up'}</Link>
          </nav>
        </div>
      </header>

      <div className="screen">
        <main className="hero">
          <Link className="pill" to="/features">
            <span className="chip">New</span>
            <span className="pill-label">Screen sharing is here</span>
            <svg viewBox="0 0 9.5 8" fill="none" aria-hidden="true">
              <path d="M0.7 4H8.8M5.6 0.75 8.85 4 5.6 7.25" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1>
            <span className="ln"><span className="ln-i">Your people. Your space.</span></span>
            <span className="ln"><span className="ln-i">Let’s huddle.</span></span>
          </h1>
          <p>Servers, channels, voice and video for the communities you care about.</p>
          <div className="cta">
            <Link className="btn ghost" to={appLink}>Open in browser</Link>
            <Link className="btn solid" to={loggedIn ? '/channels/@me' : '/register'} ref={lastCtaRef}>Get started</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
