import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { POSTS, fmtDate, type Post } from './posts';
import { Buddy, Cube, CubeBot, Huddy, Logo, Orb, Ring, Sparkle, type Hue } from './Buddies';
import { AppMock, CallStory, DropInStory, FlairStory, MembersStory, PhoneMock, WatchStory } from './Mocks';
import './hero.css';

const SKY_VIDEO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4b73c700-3112-4c07-bd48-0af2893dff7c.mp4';
const SKY_POSTER = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png';

const SECTIONS = [
  { id: 'features', label: 'Features' },
  { id: 'download', label: 'Download' },
  { id: 'safety', label: 'Safety' },
  { id: 'support', label: 'Support' },
  { id: 'blog', label: 'Blog' },
] as const;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- icons (stroke, 24×24) ----------
const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  block: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  gavel: 'M14 4l6 6M11 7l6 6M4 20l7-7M9 9l6-6 6 6-6 6z',
  server: 'M4 4h16v7H4zM4 13h16v7H4zM8 8h.01M8 17h.01',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  laptop: 'M5 5h14v10H5zM2 19h20',
  phone: 'M7 2h10v20H7zM11 18h2',
  tablet: 'M5 3h14v18H5zM11 18h2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  play: 'M8 5v14l11-7z',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  chev: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
};

const SAFETY = [
  { icon: ICONS.block, title: 'You choose who reaches you', text: 'Friend requests, blocking and DMs only from people you share a space with.', hue: 'coral' as Hue },
  { icon: ICONS.lock, title: 'Private when you want it', text: 'Lock channels to the roles or members that should be there. Everyone else never sees them.', hue: 'violet' as Hue },
  { icon: ICONS.gavel, title: 'Moderation built in', text: 'Timeouts, kicks, bans and a full audit log for every change.', hue: 'amber' as Hue },
  { icon: ICONS.server, title: 'Your server, your data', text: 'Huddle is self-hostable. No ads, and nothing is sold to anyone.', hue: 'mint' as Hue },
];

const FAQ = [
  { q: 'How do I create a server?', a: 'Click the + at the bottom of the server list, give it a name and an optional icon. Huddle sets up #general and a General voice room for you.' },
  { q: 'How do I invite people?', a: 'Open the server menu and choose Invite People. Copy the link, and optionally limit how many times it can be used or when it expires.' },
  { q: 'How do roles and permissions work?', a: 'Create roles in Server Settings → Roles and toggle what each can do. For a single channel, use Channel Settings → Permissions to allow or deny a role or a member.' },
  { q: 'Why can’t people hear me in voice?', a: 'Check that your browser has microphone access, pick the right input in User Settings → Voice & Video, and make sure you are not muted or server-muted.' },
  { q: 'How do I share my screen?', a: 'Join a voice channel or start a DM call, then press the screen button. Your browser lets you pick a screen, a window or a tab.' },
  { q: 'How do I control notifications?', a: 'Right-click a server and open Notification Settings: all messages, only @mentions, or nothing. You can also mute single channels.' },
];

const PLATFORMS = [
  { id: 'windows', name: 'Windows', icon: ICONS.monitor },
  { id: 'mac', name: 'macOS', icon: ICONS.laptop },
  { id: 'linux', name: 'Linux', icon: ICONS.monitor },
  { id: 'ios', name: 'iOS', icon: ICONS.phone },
  { id: 'android', name: 'Android', icon: ICONS.tablet },
];

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mac/.test(ua)) return 'mac';
  if (/win/.test(ua)) return 'windows';
  if (/linux/.test(ua)) return 'linux';
  return '';
}

// ---------- feature cards ----------
interface Feature { key: string; hue: number; lines: string[]; body: string; mock: ReactNode; deco: ReactNode }
const FEATURES: Feature[] = [
  {
    key: 'flair', hue: 312, lines: ['Say it with', 'a little', 'flair'],
    body: 'Set a custom status, react to anything and sprinkle emoji over the chat. Your group’s inside jokes finally have a home.',
    mock: <FlairStory />,
    deco: <><Orb hue="pink" className="peek p-tr" /><Sparkle className="peek p-bl s-sm" color="#ffd1ec" /></>,
  },
  {
    key: 'faces', hue: 168, lines: ['Faces on,', 'screens up,', 'no installs'],
    body: 'Flip on your camera or share a tab, a window or your whole screen, right from the browser. Everyone sees it live.',
    mock: <CallStory />,
    deco: <><Cube className="peek p-tl" /><Buddy hue="mint" mood="wow" className="peek p-br b-peek" /></>,
  },
  {
    key: 'door', hue: 262, lines: ['The door’s', 'always', 'open'],
    body: 'Voice rooms never hang up. Click one to drop in, click away to leave. No ringing, no invites, no scheduling.',
    mock: <DropInStory />,
    deco: <><Buddy hue="violet" mood="wink" topper="antenna" className="peek p-tl b-peek" /><Ring className="peek p-br" /></>,
  },
  {
    key: 'who', hue: 336, lines: ['Spot who’s', 'up for', 'something'],
    body: 'Status dots and voice badges show who’s free, who’s heads-down and who’s already hanging out, all at a glance.',
    mock: <MembersStory />,
    deco: <><Orb hue="amber" className="peek p-tl" /><Sparkle className="peek p-br s-sm" color="#ffe08a" /></>,
  },
  {
    key: 'watch', hue: 145, lines: ['Movie night', 'from any', 'couch'],
    body: 'Stream something to the call and watch, react and heckle together, even when you’re miles apart.',
    mock: <WatchStory />,
    deco: <><Buddy hue="amber" mood="grin" topper="sprout" className="peek p-tl b-peek" /><Cube className="peek p-br c-sm" /></>,
  },
];

function FeatureCard({ f, i }: { f: Feature; i: number }) {
  const flip = i % 2 === 1;
  return (
    <article className={'fcard-wrap rv' + (flip ? ' flip' : '')} style={{ '--h': f.hue } as CSSProperties} aria-labelledby={`f-${f.key}`}>
      <div className="fcard tilt">
        <div className="f-text">
          <h3 className="disp" id={`f-${f.key}`}>{f.lines.map((l) => <span key={l}>{l}</span>)}</h3>
          <p>{f.body}</p>
        </div>
        <div className={'f-panel rv ' + (flip ? 'from-l' : 'from-r')}>
          <div className="f-mock">{f.mock}</div>
        </div>
      </div>
      {f.deco}
    </article>
  );
}

function Reader({ post, onClose }: { post: Post; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={post.title} onClick={onClose}>
      <article className="reader-box" onClick={(e) => e.stopPropagation()}>
        <div className="reader-cover" style={coverStyle(post)} />
        <button className="reader-close" aria-label="Close article" onClick={onClose}><I d={ICONS.close} /></button>
        <div className="reader-body">
          <div className="post-meta"><span>{post.tag}</span> · {fmtDate(post.date)} · {post.minutes} min read</div>
          <h3>{post.title}</h3>
          {post.body.map((b, i) =>
            b.t === 'p' ? <p key={i}>{b.text}</p>
            : b.t === 'h2' ? <h4 key={i}>{b.text}</h4>
            : b.t === 'quote' ? <blockquote key={i}>{b.text}</blockquote>
            : <ul key={i}>{b.items.map((it) => <li key={it}>{it}</li>)}</ul>,
          )}
          <div className="post-author">— {post.author}</div>
        </div>
      </article>
    </div>
  );
}

const coverStyle = (p: Post): CSSProperties => ({
  background: `radial-gradient(90% 110% at 15% 10%, ${p.cover[0]}, transparent 62%), radial-gradient(90% 100% at 95% 95%, ${p.cover[2]}, transparent 60%), ${p.cover[1]}`,
});

/** Twinkling stars at fixed, deterministic spots. */
const STARS = Array.from({ length: 34 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1 + 1) % 1;
  return { left: `${(r(1) * 100).toFixed(2)}%`, top: `${(r(2) * 100).toFixed(2)}%`, size: 2 + Math.round(r(3) * 3), delay: `${(r(4) * 4).toFixed(2)}s`, dur: `${(2.6 + r(5) * 3).toFixed(2)}s` };
});

const MARQUEE = ['Talk', 'Play', 'Share', 'Hang out', 'Huddle'];

/** Buddies standing on the footer horizon; m2 sits in the middle, over the line. */
const LINEUP: { hue: Hue; mood: 'happy' | 'grin' | 'wow' | 'wink' | 'sleepy'; topper: 'none' | 'headset' | 'sprout' | 'antenna' | 'bow' | 'beanie'; wave?: boolean }[] = [
  { hue: 'sky', mood: 'sleepy', topper: 'beanie' },
  { hue: 'coral', mood: 'grin', topper: 'bow' },
  { hue: 'teal', mood: 'happy', topper: 'headset', wave: true },
  { hue: 'amber', mood: 'wow', topper: 'sprout' },
  { hue: 'violet', mood: 'wink', topper: 'none' },
  { hue: 'mint', mood: 'grin', topper: 'none', wave: true },
];

const SOCIAL = [
  { label: 'Community chat', icon: ICONS.chat },
  { label: 'Photos', icon: ICONS.camera },
  { label: 'Videos', icon: ICONS.play },
  { label: 'Music', icon: ICONS.music },
  { label: 'Mentions', icon: ICONS.at },
];

/** Scrolling home: hero, feature cards, marquee, Download / Safety / Support / Blog, closing CTA, footer. */
export default function HeroHome() {
  const loggedIn = useAuthStore((s) => !!s.token);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCtaRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [post, setPost] = useState<Post | null>(null);
  const [lang, setLang] = useState('en');
  const platform = useMemo(detectPlatform, []);

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
    const last = lastCtaRef.current;
    const onEnd = (e: AnimationEvent) => { if (e.target === last) clear(); };
    const start = () => {
      if (started) return;
      started = true;
      root.classList.add('intro-play');
      last?.addEventListener('animationend', onEnd);
      endTimer = window.setTimeout(clear, 3200);
    };
    const fontTimer = window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(start)), 700);
    document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(start)));
    return () => {
      window.clearTimeout(failsafe); window.clearTimeout(fontTimer); window.clearTimeout(endTimer);
      last?.removeEventListener('animationend', onEnd);
    };
  }, []);

  // Jump to a section when arriving with a hash (e.g. redirected from /download).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    // 'instant' overrides the container's smooth scroll-behavior; retry once layout has settled
    const jump = () => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    requestAnimationFrame(jump);
    const t = window.setTimeout(jump, 300);
    return () => window.clearTimeout(t);
  }, []);

  // Header shade after scrolling, active nav link, and scroll-reveal.
  useEffect(() => {
    const root = rootRef.current!;
    const onScroll = () => setScrolled(root.scrollTop > 8);
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });

    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { root, rootMargin: '-45% 0px -50% 0px' });
    root.querySelectorAll('section[id]').forEach((s) => spy.observe(s));
    // clear the highlight when back in the hero
    const top = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(''); }, { root, rootMargin: '-45% 0px -50% 0px' });
    if (heroRef.current) top.observe(heroRef.current);

    const reveal = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }, { root, rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.rv').forEach((el) => reveal.observe(el));

    return () => { root.removeEventListener('scroll', onScroll); spy.disconnect(); top.disconnect(); reveal.disconnect(); };
  }, []);

  // Pointer effects: hero parallax and card tilt (fine pointers only, never with reduced motion).
  useEffect(() => {
    const root = rootRef.current!;
    const hero = heroRef.current;
    if (reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    let mx = 0, my = 0;
    const onHero = (e: PointerEvent) => {
      if (!hero) return;
      const r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      my = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        hero.style.setProperty('--mx', mx.toFixed(3));
        hero.style.setProperty('--my', my.toFixed(3));
      });
    };
    hero?.addEventListener('pointermove', onHero);

    const cards = Array.from(root.querySelectorAll<HTMLElement>('.tilt'));
    const move = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(x * 4).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    };
    const leave = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    cards.forEach((c) => { c.addEventListener('pointermove', move); c.addEventListener('pointerleave', leave); });
    return () => {
      cancelAnimationFrame(raf);
      hero?.removeEventListener('pointermove', onHero);
      cards.forEach((c) => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerleave', leave); });
    };
  }, []);

  // Scroll-linked parallax: each card's mock lags its card slightly (transform only, one rAF per scroll burst).
  useEffect(() => {
    const root = rootRef.current!;
    if (reducedMotion()) return;
    const pairs = Array.from(root.querySelectorAll<HTMLElement>('.fcard-wrap')).flatMap((w) => {
      const m = w.querySelector<HTMLElement>('.f-mock');
      return m ? [{ w, m }] : [];
    });
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = root.clientHeight;
      for (const { w, m } of pairs) {
        const r = w.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const d = r.top + r.height / 2 - vh / 2;
        const y = Math.max(-16, Math.min(16, -d * 0.045));
        m.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => { cancelAnimationFrame(raf); root.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
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

  const goTo = (id: string) => (e: ReactMouseEvent) => {
    e.preventDefault();
    setOpen(false);
    const el = id === 'top' ? rootRef.current : document.getElementById(id);
    if (id === 'top') el?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    else if (el) {
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      // smooth scrolling can stall (e.g. background tabs); finish the jump if it hasn't arrived
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      window.setTimeout(() => {
        if (Math.abs(el.getBoundingClientRect().top - margin) > 4) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      }, 1200);
    }
    history.replaceState(null, '', id === 'top' ? '/' : `/#${id}`);
  };

  const appLink = loggedIn ? '/channels/@me' : '/login';
  const startLink = loggedIn ? '/channels/@me' : '/register';
  const faq = FAQ.map((f, i) => ({ ...f, i })).filter((f) => !query || (f.q + ' ' + f.a).toLowerCase().includes(query.toLowerCase()));
  const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

  return (
    <div className="hx" ref={rootRef}>
      <div className="starfield" aria-hidden="true" />

      <header className="bar" ref={barRef} data-open={open ? 'true' : 'false'} data-scrolled={scrolled ? 'true' : 'false'}>
        <div className="bar-in">
          <a className="brand in-el" style={d(0)} href="/" onClick={goTo('top')} aria-label="Huddle — home">
            <span className="brand-mark"><Logo /></span>
            <span className="brand-word">Huddle</span>
          </a>
          <nav className="links" aria-label="Primary">
            {SECTIONS.map((s, i) => (
              <a key={s.id} className="in-el" style={d(0.06 + i * 0.04)} href={`#${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined}>{s.label}</a>
            ))}
          </nav>
          <div className="actions in-el" style={d(0.24)}>
            {!loggedIn && <Link className="nav-ghost" to="/register">Sign up</Link>}
            <Link className="btn pill-w" to={appLink}>{loggedIn ? 'Open Huddle' : 'Log in'}</Link>
            <button
              className="menu" aria-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="menu-sheet"
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            >
              <svg viewBox="0 0 20 14" aria-hidden="true">
                <path d={open ? 'M3 1l14 12M3 13 17 1' : 'M0 1h20M0 7h20M0 13h20'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="sheet" id="menu-sheet" aria-label="Menu">
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined}>{s.label}<I d={ICONS.arrow} /></a>)}
          <div className="sheet-cta">
            {!loggedIn && <Link className="btn ghost-w" to={appLink}>Log in</Link>}
            <Link className="btn pill-w" to={startLink}>{loggedIn ? 'Open Huddle' : 'Sign up'}</Link>
          </div>
        </nav>
      </header>

      <section className="hero" ref={heroRef} aria-labelledby="h-hero">
        <div className="hero-bg" aria-hidden="true">
          <video ref={videoRef} className="sky" autoPlay muted loop playsInline preload="auto" poster={SKY_POSTER} src={SKY_VIDEO} />
          <div className="veil" />
          <div className="stars">
            {STARS.map((s, i) => (
              <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.dur }} />
            ))}
          </div>
        </div>
        <div className="ambient" aria-hidden="true">
          <div className="amb-bob">
            <CubeBot hue="amber" />
            <CubeBot hue="teal" className="l2" />
            <CubeBot hue="pink" className="l3" />
          </div>
        </div>
        <div className="hero-in">
          <div className="hero-copy">
            <h1 className="disp" id="h-hero">
              <span className="ln"><span className="ln-i in-el" style={d(0.2)}>Your people.</span></span>
              <span className="ln"><span className="ln-i in-el" style={d(0.3)}>Your space.</span></span>
              <span className="ln"><span className="ln-i in-el grad" style={d(0.4)}>Let’s huddle.</span></span>
            </h1>
            <p className="in-el" style={d(0.6)}>Servers, channels, drop-in voice, video and screen share for the groups you love. Right in your browser, free to start.</p>
            <div className="cta in-el" style={d(0.72)} ref={lastCtaRef}>
              <Link className="btn big white" to={startLink}>{loggedIn ? 'Open Huddle' : 'Get started'}<I d={ICONS.arrow} /></Link>
              <Link className="btn big accent" to={appLink}>Open Huddle in your browser</Link>
            </div>
          </div>
          <div className="hero-art in-el" style={d(0.35)} aria-hidden="true">
            <div className="ha">
              <div className="px px-lap"><div className="lap-tilt"><AppMock /></div></div>
              <div className="px px-phone"><div className="bob b2"><PhoneMock /></div></div>
              <div className="px px-huddy"><div className="bob"><Huddy wave mood="grin" className="hb-huddy" /></div></div>
              <div className="px px-coral"><div className="bob b3"><Buddy hue="coral" mood="wink" topper="bow" className="hb-coral" /></div></div>
              <div className="px px-amber"><div className="bob b4"><Buddy hue="amber" mood="wow" topper="sprout" className="hb-amber" /></div></div>
              <div className="px px-d1"><div className="bob b2"><Orb hue="teal" /></div></div>
              <div className="px px-d2"><div className="bob b3"><Orb hue="pink" /></div></div>
              <div className="px px-d3"><div className="bob b4"><Ring /></div></div>
              <div className="px px-d4"><div className="spin"><Sparkle color="#ffe08a" /></div></div>
              <div className="px px-d5"><div className="spin s2"><Sparkle color="#9ed8ff" /></div></div>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section className="sec feats" id="features" aria-label="Features">
          <div className="wrap">
            {FEATURES.map((f, i) => <FeatureCard key={f.key} f={f} i={i} />)}
          </div>
        </section>

        <div className="marquee" aria-hidden="true">
          {[0, 1].map((row) => (
            <div key={row} className={'mq-row' + (row ? ' rev' : '')}>
              <div className="mq-track">
                {[0, 1].map((copy) => (
                  <div key={copy} className="mq-set">
                    {MARQUEE.map((w, i) => (
                      <span key={w} className="mq-item">
                        <span className={'disp ' + ((i + row) % 2 ? 'outline' : 'solid')}>{w}</span>
                        <Sparkle className="mq-star" color={['#5df2d6', '#ff9bd2', '#ffe08a', '#c4b1ff', '#a6f7b4'][(i + row * 2) % 5]} />
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <section className="sec" id="download" aria-labelledby="h-download">
          <div className="wrap">
            <div className="fcard-wrap rv solo" style={{ '--h': 200 } as CSSProperties}>
              <div className="fcard tilt dl">
                <div className="f-text center">
                  <h2 className="disp" id="h-download"><span>Wherever you are,</span><span>Huddle’s there</span></h2>
                  <p>Huddle runs in any modern browser on any device. Want a window of its own? Install it as an app from your browser’s menu in two clicks.</p>
                </div>
                <div className="platforms">
                  {PLATFORMS.map((p, i) => (
                    <div key={p.id} className={'platform rv' + (p.id === platform ? ' current' : '')} style={{ transitionDelay: `${0.06 * i}s` }}>
                      <div className="pl-ic"><I d={p.icon} /></div>
                      <strong>{p.name}</strong>
                      <small>{p.id === platform ? 'Your device' : 'In the browser'}</small>
                    </div>
                  ))}
                </div>
                <div className="panel-cta">
                  <Link className="btn big white" to={appLink}>Open Huddle in your browser</Link>
                  <span className="note"><i />Native apps are on the way.</span>
                </div>
              </div>
              <Buddy hue="sky" mood="happy" topper="beanie" wave className="peek p-tl b-peek" />
              <Orb hue="teal" className="peek p-bl" />
            </div>
          </div>
        </section>

        <section className="sec" id="safety" aria-labelledby="h-safety">
          <div className="wrap">
            <div className="fcard-wrap rv solo" style={{ '--h': 280 } as CSSProperties}>
              <div className="fcard tilt">
                <div className="f-text center">
                  <h2 className="disp" id="h-safety"><span>Your space.</span><span>Your rules.</span></h2>
                  <p>Tools that keep you and your community in control, from who can message you to who can see each channel.</p>
                </div>
                <div className="safety">
                  {SAFETY.map((s, i) => (
                    <div key={s.title} className={'safe rv h-' + s.hue} style={{ transitionDelay: `${0.07 * i}s` }}>
                      <div className="safe-ic"><I d={s.icon} /></div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Buddy hue="violet" mood="happy" topper="headset" className="peek p-tr b-peek" />
            </div>
          </div>
        </section>

        <section className="sec" id="support" aria-labelledby="h-support">
          <div className="wrap">
            <div className="fcard-wrap rv solo" style={{ '--h': 165 } as CSSProperties}>
              <div className="fcard tilt support">
                <div className="f-text">
                  <h2 className="disp" id="h-support"><span>Stuck?</span><span>We’ve got</span><span>your back.</span></h2>
                  <p>Quick answers to the questions we hear most. Type a word or two to narrow them down.</p>
                  <div className="help-buddy" aria-hidden="true"><Huddy wave mood="happy" /></div>
                </div>
                <div className="help">
                  <label className="search">
                    <I d={ICONS.search} />
                    <span className="sr">Search help</span>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help articles" />
                  </label>
                  <div className="faq">
                    {faq.map((f) => (
                      <div key={f.q} className={'faq-item' + (openFaq === f.i ? ' open' : '')}>
                        <button aria-expanded={openFaq === f.i} onClick={() => setOpenFaq(openFaq === f.i ? null : f.i)}>
                          <span>{f.q}</span><I d={ICONS.plus} />
                        </button>
                        <div className="faq-a"><div><p>{f.a}</p></div></div>
                      </div>
                    ))}
                    {faq.length === 0 && <p className="faq-empty">No articles match “{query}”.</p>}
                  </div>
                </div>
              </div>
              <Cube className="peek p-tr" />
            </div>
          </div>
        </section>

        <section className="sec" id="blog" aria-labelledby="h-blog">
          <div className="wrap">
            <div className="fcard-wrap rv solo" style={{ '--h': 330 } as CSSProperties}>
              <div className="fcard">
                <div className="f-text center">
                  <h2 className="disp" id="h-blog"><span>Fresh from</span><span>the Huddle</span></h2>
                  <p>Notes on what we’re building, why, and how to get the most out of your server.</p>
                </div>
                <div className="posts">
                  {POSTS.map((p, i) => (
                    <button key={p.slug} className="post rv" style={{ transitionDelay: `${0.06 * i}s` }} onClick={() => setPost(p)}>
                      <div className="post-cover" style={coverStyle(p)}>
                        <span className={'shape ' + p.shape}><i /><i /><i /></span>
                      </div>
                      <div className="post-body">
                        <div className="post-meta"><span>{p.tag}</span> · {fmtDate(p.date)}</div>
                        <h3>{p.title}</h3>
                        <p>{p.excerpt}</p>
                        <span className="read">Read <I d={ICONS.arrow} /></span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Sparkle className="peek p-tl s-sm" color="#ffd1ec" />
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="h-closing">
          <div className="wrap">
            <h2 className="disp rv" id="h-closing"><span>Your crew’s online.</span><span className="grad">Come say hi.</span></h2>
            <div className="rv closing-cta" style={{ transitionDelay: '.08s' }}>
              <Link className="btn big white" to={startLink}>{loggedIn ? 'Open Huddle' : 'Get started'}<I d={ICONS.arrow} /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="horizon" aria-hidden="true">
          <div className="lineup">
            {[[0, 1], [2], [3, 4, 5]].map((group, g) => (
              <div key={g} className={g === 1 ? 'lu-mid' : 'lu-side ' + (g ? 'r' : 'l')}>
                {group.map((i) => {
                  const c = LINEUP[i];
                  return (
                    <div key={c.hue} className={'mate m' + i}>
                      <Buddy hue={c.hue} mood={c.mood} topper={c.topper} wave={c.wave} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="hover-mate"><Buddy hue="pink" mood="wink" topper="antenna" wave /></div>
        </div>
        <div className="foot-band">
          <div className="wrap foot-grid">
            <div className="foot-left">
              <a className="foot-mark" href="/" onClick={goTo('top')} aria-label="Huddle — home">
                <span className="brand-mark"><Logo /></span>
                <span className="word-pill">Huddle</span>
              </a>
              <p className="foot-tag">A home for your groups: channels, drop-in voice, video and screen share.</p>
              <label className="f-label" htmlFor="foot-lang">Language</label>
              <div className="lang">
                <I d={ICONS.globe} />
                <select id="foot-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="pt">Português</option>
                  <option value="hi">हिन्दी</option>
                </select>
                <I d={ICONS.chev} />
              </div>
              <span className="f-label">Social</span>
              <div className="social">
                {SOCIAL.map((s) => (
                  <a key={s.label} href="#" aria-label={s.label} onClick={(e) => e.preventDefault()}><I d={s.icon} /></a>
                ))}
              </div>
            </div>
            <div className="foot-right">
              <div className="foot-cta"><Link className="btn pill-w" to={appLink}>Open Huddle</Link></div>
              <nav className="foot-cols" aria-label="Footer">
                <div>
                  <h4>Product</h4>
                  <a href="#download" onClick={goTo('download')}>Download</a>
                  <a href="#features" onClick={goTo('features')}>Features</a>
                  <a href="#">Status</a>
                  <Link to={appLink}>Web app</Link>
                </div>
                <div>
                  <h4>Company</h4>
                  <a href="#">About</a>
                  <a href="#blog" onClick={goTo('blog')}>Blog</a>
                  <a href="#">Brand</a>
                  <a href="#">Careers</a>
                </div>
                <div>
                  <h4>Resources</h4>
                  <a href="#support" onClick={goTo('support')}>Support</a>
                  <a href="#safety" onClick={goTo('safety')}>Safety</a>
                  <a href="#">Community guidelines</a>
                  <a href="#">Developers</a>
                  <a href="#">Feedback</a>
                </div>
                <div>
                  <h4>Policies</h4>
                  <a href="#">Terms</a>
                  <a href="#">Privacy</a>
                  <a href="#">Cookies</a>
                  <a href="#">Licenses</a>
                </div>
              </nav>
            </div>
          </div>
          <div className="wrap foot-legal"><small>© {new Date().getFullYear()} Huddle. Made for people who like each other.</small></div>
          <div className="foot-word" aria-hidden="true"><span>Huddle</span></div>
        </div>
      </footer>

      {post && <Reader post={post} onClose={() => setPost(null)} />}
    </div>
  );
}
