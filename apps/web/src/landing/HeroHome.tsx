import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { POSTS, fmtDate, type Post } from './posts';
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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  hash: 'M5 9h14M4 15h14M10 4 8 20M16 4l-2 16',
  voice: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  video: 'M15 10l5-3v10l-5-3M3 7h12v10H3z',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  bell: 'M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16zM10 21h4',
  block: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  gavel: 'M14 4l6 6M11 7l6 6M4 20l7-7M9 9l6-6 6 6-6 6z',
  server: 'M4 4h16v7H4zM4 13h16v7H4zM8 8h.01M8 17h.01',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  phone: 'M7 2h10v20H7zM11 18h2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
};

const FEATURES = [
  { icon: ICONS.hash, title: 'Servers & channels', text: 'Give every topic a home. Text channels, categories and invites in a click.' },
  { icon: ICONS.voice, title: 'Drop-in voice', text: 'Voice rooms stay open, so you can wander in whenever your crew is around.' },
  { icon: ICONS.video, title: 'Video & screen share', text: 'Turn on your camera or share a screen, a window or a tab — no installs.' },
  { icon: ICONS.shield, title: 'Roles & permissions', text: 'Decide who sees what and who can do what, down to a single channel.' },
  { icon: ICONS.chat, title: 'DMs & friends', text: 'Private chats and group DMs with the people you care about most.' },
  { icon: ICONS.bell, title: 'Files & notifications', text: 'Share files up to 25 MB, and choose exactly what is allowed to ping you.' },
];

const SAFETY = [
  { icon: ICONS.block, title: 'You choose who reaches you', text: 'Friend requests, blocking and DMs only from people you share a space with.' },
  { icon: ICONS.lock, title: 'Private when you want it', text: 'Lock channels to the roles or members that should be there. Everyone else never sees them.' },
  { icon: ICONS.gavel, title: 'Moderation built in', text: 'Timeouts, kicks, bans and a full audit log for every change.' },
  { icon: ICONS.server, title: 'Your server, your data', text: 'Huddle is self-hostable. No ads, and nothing is sold to anyone.' },
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
  { id: 'mac', name: 'macOS', icon: ICONS.monitor },
  { id: 'linux', name: 'Linux', icon: ICONS.monitor },
  { id: 'ios', name: 'iOS', icon: ICONS.phone },
  { id: 'android', name: 'Android', icon: ICONS.phone },
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

function Logo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="20" r="10" fill="currentColor" opacity="0.95" />
      <circle cx="30" cy="20" r="10" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="30" r="10" fill="currentColor" opacity="0.35" />
      <path d="M12 30 9 38l8-4" fill="currentColor" opacity="0.95" />
    </svg>
  );
}

function SectionHead({ tag, title, lead }: { tag: string; title: ReactNode; lead: string }) {
  return (
    <div className="sec-head">
      <span className="tag rv">{tag}</span>
      <h2 className="rv" style={{ transitionDelay: '.06s' }}>{title}</h2>
      <p className="lead rv" style={{ transitionDelay: '.12s' }}>{lead}</p>
    </div>
  );
}

function Card({ icon, title, text, i }: { icon: string; title: string; text: string; i: number }) {
  return (
    <div className="card rv" style={{ transitionDelay: `${0.05 * i}s` }}>
      <div className="ic"><I d={icon} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
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
        <button className="reader-close" aria-label="Close article" onClick={onClose}><I d={ICONS.close} /></button>
        <div className="post-meta"><span>{post.tag}</span> · {fmtDate(post.date)} · {post.minutes} min read</div>
        <h3>{post.title}</h3>
        {post.body.map((b, i) =>
          b.t === 'p' ? <p key={i}>{b.text}</p>
          : b.t === 'h2' ? <h4 key={i}>{b.text}</h4>
          : b.t === 'quote' ? <blockquote key={i}>{b.text}</blockquote>
          : <ul key={i}>{b.items.map((it) => <li key={it}>{it}</li>)}</ul>,
        )}
        <div className="post-author">— {post.author}</div>
      </article>
    </div>
  );
}

/** Scrolling home: full-screen hero, then Features / Download / Safety / Support / Blog. */
export default function HeroHome() {
  const loggedIn = useAuthStore((s) => !!s.token);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCtaRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [post, setPost] = useState<Post | null>(null);
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

    const reveal = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }, { root, rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.rv').forEach((el) => reveal.observe(el));

    return () => { root.removeEventListener('scroll', onScroll); spy.disconnect(); reveal.disconnect(); };
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

  return (
    <div className="hx" ref={rootRef}>
      <div className="shade" data-on={scrolled ? 'true' : 'false'} />

      <header className="bar" ref={barRef} data-open={open ? 'true' : 'false'}>
        <a className="brand" href="/" onClick={goTo('top')} aria-label="Huddle — home">
          <Logo />
          <span>Huddle</span>
        </a>
        <nav className="links" aria-label="Primary">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined}>{s.label}</a>
          ))}
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
            {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} onClick={goTo(s.id)}>{s.label}</a>)}
            <Link className="btn solid" to={startLink}>{loggedIn ? 'Open Huddle' : 'Sign up'}</Link>
          </nav>
        </div>
      </header>

      <div className="stage">
        <video
          ref={videoRef} className="sky" aria-hidden="true" autoPlay muted loop playsInline preload="auto"
          poster={SKY_POSTER} src={SKY_VIDEO}
        />
        <div className="veil" />
        <div className="screen">
          <main className="hero">
            <a className="pill" href="#features" onClick={goTo('features')}>
              <span className="chip">New</span>
              <span className="pill-label">Screen sharing is here</span>
              <svg viewBox="0 0 9.5 8" fill="none" aria-hidden="true">
                <path d="M0.7 4H8.8M5.6 0.75 8.85 4 5.6 7.25" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <h1>
              <span className="ln"><span className="ln-i">Your people. Your space.</span></span>
              <span className="ln"><span className="ln-i">Let’s huddle.</span></span>
            </h1>
            <p>Servers, channels, voice and video for the communities you care about.</p>
            <div className="cta">
              <Link className="btn ghost" to={appLink}>Open in browser</Link>
              <Link className="btn solid" to={startLink} ref={lastCtaRef}>Get started</Link>
            </div>
          </main>
        </div>
      </div>

      <section className="sec" id="features" aria-labelledby="h-features">
        <div className="wrap">
          <SectionHead tag="Features" title={<span id="h-features">Everything your crew needs</span>} lead="One place to talk, plan and hang out — in text, voice or video." />
          <div className="grid g3">{FEATURES.map((f, i) => <Card key={f.title} {...f} i={i} />)}</div>
        </div>
      </section>

      <section className="sec glow-violet" id="download" aria-labelledby="h-download">
        <div className="wrap">
          <SectionHead tag="Download" title={<span id="h-download">Huddle, wherever you are</span>} lead="Huddle runs in any modern browser. Install it as an app from your browser’s menu for a window of its own." />
          <div className="panel rv">
            <div className="platforms">
              {PLATFORMS.map((p) => (
                <div key={p.id} className={'platform' + (p.id === platform ? ' current' : '')}>
                  <div className="ic"><I d={p.icon} /></div>
                  <strong>{p.name}</strong>
                  <small>{p.id === platform ? 'Your device' : 'Browser'}</small>
                </div>
              ))}
            </div>
            <div className="panel-cta">
              <Link className="btn solid" to={appLink}>Open Huddle in your browser</Link>
              <span>Native apps are on the way.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="safety" aria-labelledby="h-safety">
        <div className="wrap">
          <SectionHead tag="Safety" title={<span id="h-safety">Safe by design</span>} lead="Tools that put you and your community in control." />
          <div className="grid g4">{SAFETY.map((f, i) => <Card key={f.title} {...f} i={i} />)}</div>
        </div>
      </section>

      <section className="sec glow-mint" id="support" aria-labelledby="h-support">
        <div className="wrap narrow">
          <SectionHead tag="Support" title={<span id="h-support">How can we help?</span>} lead="Quick answers to the questions we hear most." />
          <label className="search rv">
            <I d={ICONS.search} />
            <span className="sr">Search help</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help articles" />
          </label>
          <div className="faq">
            {faq.map((f) => (
              <div key={f.q} className={'faq-item rv' + (openFaq === f.i ? ' open' : '')}>
                <button aria-expanded={openFaq === f.i} onClick={() => setOpenFaq(openFaq === f.i ? null : f.i)}>
                  <span>{f.q}</span><I d={ICONS.plus} />
                </button>
                <div className="faq-a"><div><p>{f.a}</p></div></div>
              </div>
            ))}
            {faq.length === 0 && <p className="faq-empty">No articles match “{query}”.</p>}
          </div>
        </div>
      </section>

      <section className="sec" id="blog" aria-labelledby="h-blog">
        <div className="wrap">
          <SectionHead tag="Blog" title={<span id="h-blog">From the Huddle</span>} lead="Notes on what we’re building and why." />
          <div className="grid g4 posts">
            {POSTS.map((p, i) => (
              <button key={p.slug} className="post rv" style={{ transitionDelay: `${0.05 * i}s` }} onClick={() => setPost(p)}>
                <div className="post-cover" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${p.cover[0]}66, transparent 60%), radial-gradient(100% 80% at 90% 90%, ${p.cover[2]}55, transparent 60%), ${p.cover[1]}` }} />
                <div className="post-body">
                  <div className="post-meta"><span>{p.tag}</span> · {fmtDate(p.date)}</div>
                  <h3>{p.title}</h3>
                  <p>{p.excerpt}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sec closing" aria-label="Get started">
        <div className="wrap">
          <h2 className="rv">Your people are waiting.</h2>
          <div className="closing-cta rv" style={{ transitionDelay: '.08s' }}>
            <Link className="btn ghost" to={appLink}>Open in browser</Link>
            <Link className="btn solid" to={startLink}>Get started</Link>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-row">
          <a className="brand-sm" href="/" onClick={goTo('top')}><Logo /><span>Huddle</span></a>
          <nav aria-label="Footer">
            {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} onClick={goTo(s.id)}>{s.label}</a>)}
          </nav>
          <small>© {new Date().getFullYear()} Huddle</small>
        </div>
      </footer>

      {post && <Reader post={post} onClose={() => setPost(null)} />}
    </div>
  );
}
