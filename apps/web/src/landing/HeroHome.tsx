import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { POSTS, fmtDate, type Post } from './posts';
import { Buddy, Cube, CubeBot, Huddy, Logo, Orb, Ring, Sparkle, type Hue } from './Buddies';
import { AppMock, CallStory, DropInStory, FlairStory, MembersStory, PhoneMock, WatchStory } from './Mocks';
import { useDocTitle, useLocale, useT, type Key, type T } from '../i18n';
import { en } from '../i18n/en';
import { Lines } from '../i18n/Rich';
import { I, ICONS } from './icons';
import { SECTIONS, SiteFooter } from './SiteChrome';
import './hero.css';

const SKY_VIDEO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4b73c700-3112-4c07-bd48-0af2893dff7c.mp4';
const SKY_POSTER = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SAFETY: { icon: string; title: Key; text: Key; hue: Hue }[] = [
  { icon: ICONS.block, title: 'home.safety.1.t', text: 'home.safety.1.d', hue: 'coral' },
  { icon: ICONS.lock, title: 'home.safety.2.t', text: 'home.safety.2.d', hue: 'violet' },
  { icon: ICONS.gavel, title: 'home.safety.3.t', text: 'home.safety.3.d', hue: 'amber' },
  { icon: ICONS.server, title: 'home.safety.4.t', text: 'home.safety.4.d', hue: 'mint' },
];

const FAQ: { q: Key; a: Key }[] = [1, 2, 3, 4, 5, 6].map((n) => ({ q: `home.faq.${n}.q` as Key, a: `home.faq.${n}.a` as Key }));

/** Post title / excerpt in the current language when translated (bodies stay in English). */
const postText = (t: T, p: Post, field: 'title' | 'excerpt') => {
  const k = `post.${p.slug}.${field}`;
  return k in en ? t(k as Key) : p[field];
};

// ---------- feature cards ----------
interface Feature { key: string; hue: number; title: Key; body: Key; mock: ReactNode; deco: ReactNode }
const FEATURES: Feature[] = [
  {
    key: 'flair', hue: 312, title: 'home.f.flair.title',
    body: 'home.f.flair.body',
    mock: <FlairStory />,
    deco: <><Orb hue="pink" className="peek p-tr" /><Sparkle className="peek p-bl s-sm" color="#ffd1ec" /></>,
  },
  {
    key: 'faces', hue: 168, title: 'home.f.faces.title',
    body: 'home.f.faces.body',
    mock: <CallStory />,
    deco: <><Cube className="peek p-tl" /><Buddy hue="mint" mood="wow" className="peek p-br b-peek" /></>,
  },
  {
    key: 'door', hue: 262, title: 'home.f.door.title',
    body: 'home.f.door.body',
    mock: <DropInStory />,
    deco: <><Buddy hue="violet" mood="wink" topper="antenna" className="peek p-tl b-peek" /><Ring className="peek p-br" /></>,
  },
  {
    key: 'who', hue: 336, title: 'home.f.who.title',
    body: 'home.f.who.body',
    mock: <MembersStory />,
    deco: <><Orb hue="amber" className="peek p-tl" /><Sparkle className="peek p-br s-sm" color="#ffe08a" /></>,
  },
  {
    key: 'watch', hue: 145, title: 'home.f.watch.title',
    body: 'home.f.watch.body',
    mock: <WatchStory />,
    deco: <><Buddy hue="amber" mood="grin" topper="sprout" className="peek p-tl b-peek" /><Cube className="peek p-br c-sm" /></>,
  },
];

function FeatureCard({ f, i }: { f: Feature; i: number }) {
  const t = useT();
  const flip = i % 2 === 1;
  return (
    <article className={'fcard-wrap rv' + (flip ? ' flip' : '')} style={{ '--h': f.hue } as CSSProperties} aria-labelledby={`f-${f.key}`}>
      <div className="fcard tilt">
        <div className="f-text">
          <h3 className="disp" id={`f-${f.key}`}><Lines text={t(f.title)} /></h3>
          <p>{t(f.body)}</p>
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
  const t = useT();
  const locale = useLocale();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={postText(t, post, 'title')} onClick={onClose}>
      <article className="reader-box" onClick={(e) => e.stopPropagation()}>
        <div className="reader-cover" style={coverStyle(post)} />
        <button className="reader-close" aria-label={t('home.blog.close')} onClick={onClose}><I d={ICONS.close} /></button>
        <div className="reader-body">
          <div className="post-meta"><span>{t(`home.blog.tag.${post.tag}`)}</span> · {fmtDate(post.date, locale)} · {t('home.blog.minutes', { n: post.minutes })}</div>
          <h3>{postText(t, post, 'title')}</h3>
          {t('home.blog.bodyNote') !== en['home.blog.bodyNote'] && <p className="reader-note">{t('home.blog.bodyNote')}</p>}
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


/** Scrolling home: hero, feature cards, marquee, Safety / Support / Blog, closing CTA, footer. */
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
  const t = useT();
  const locale = useLocale();

  useDocTitle('home.title', false);

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

  // Jump to a section when arriving with a hash (e.g. redirected from /safety).
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
      // phones scroll fast: start the reveal just before an element enters so there's never a blank screen
    }, { root, rootMargin: window.matchMedia('(max-width: 600px)').matches ? '0px 0px 12% 0px' : '0px 0px -8% 0px' });
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
  const faq = FAQ.map((f, i) => ({ q: t(f.q), a: t(f.a), i })).filter((f) => !query || (f.q + ' ' + f.a).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const marquee = t('home.marquee').split('\n');
  const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

  return (
    <div className="hx" ref={rootRef}>
      <div className="starfield" aria-hidden="true" />

      <header className="bar" ref={barRef} data-open={open ? 'true' : 'false'} data-scrolled={scrolled ? 'true' : 'false'}>
        <div className="bar-in">
          <a className="brand in-el" style={d(0)} href="/" onClick={goTo('top')} aria-label={t('nav.home')}>
            <span className="brand-mark"><Logo /></span>
            <span className="brand-word">Huddle</span>
          </a>
          <nav className="links" aria-label={t('nav.primary')}>
            {SECTIONS.map((s, i) => (
              <a key={s.id} className="in-el" style={d(0.06 + i * 0.04)} href={`#${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined}>{t(s.label)}</a>
            ))}
          </nav>
          <div className="actions in-el" style={d(0.24)}>
            {!loggedIn && <Link className="nav-ghost" to="/register">{t('nav.signup')}</Link>}
            <Link className="btn pill-w" to={appLink}>{loggedIn ? t('nav.open') : t('nav.login')}</Link>
            <button
              className="menu" aria-label={open ? t('nav.closeMenu') : t('nav.menu')} aria-expanded={open} aria-controls="menu-sheet"
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            >
              <svg viewBox="0 0 20 14" aria-hidden="true">
                <path d={open ? 'M3 1l14 12M3 13 17 1' : 'M0 1h20M0 7h20M0 13h20'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="sheet" id="menu-sheet" aria-label={t('nav.menu')}>
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} onClick={goTo(s.id)} aria-current={active === s.id ? 'true' : undefined}>{t(s.label)}<I d={ICONS.arrow} /></a>)}
          <div className="sheet-cta">
            {!loggedIn && <Link className="btn ghost-w" to={appLink}>{t('nav.login')}</Link>}
            <Link className="btn pill-w" to={startLink}>{loggedIn ? t('nav.open') : t('nav.signup')}</Link>
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
              <span className="ln"><span className="ln-i in-el" style={d(0.2)}>{t('home.hero.l1')}</span></span>
              <span className="ln"><span className="ln-i in-el" style={d(0.3)}>{t('home.hero.l2')}</span></span>
              <span className="ln"><span className="ln-i in-el grad" style={d(0.4)}>{t('home.hero.l3')}</span></span>
            </h1>
            <p className="in-el" style={d(0.6)}>{t('home.hero.sub')}</p>
            <div className="cta in-el" style={d(0.72)} ref={lastCtaRef}>
              <Link className="btn big white" to={startLink}>{loggedIn ? t('nav.open') : t('home.cta.start')}<I d={ICONS.arrow} /></Link>
              {!loggedIn && <Link className="btn big accent" to={appLink}>{t('home.cta.browser')}</Link>}
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
        <section className="sec feats" id="features" aria-label={t('home.features')}>
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
                    {marquee.map((w, i) => (
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

        <section className="sec" id="safety" aria-labelledby="h-safety">
          <div className="wrap">
            <div className="fcard-wrap rv solo" style={{ '--h': 280 } as CSSProperties}>
              <div className="fcard tilt">
                <div className="f-text center">
                  <h2 className="disp" id="h-safety"><Lines text={t('home.safety.title')} /></h2>
                  <p>{t('home.safety.sub')}</p>
                </div>
                <div className="safety">
                  {SAFETY.map((s, i) => (
                    <div key={s.title} className={'safe rv h-' + s.hue} style={{ transitionDelay: `${0.07 * i}s` }}>
                      <div className="safe-ic"><I d={s.icon} /></div>
                      <h3>{t(s.title)}</h3>
                      <p>{t(s.text)}</p>
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
                  <h2 className="disp" id="h-support"><Lines text={t('home.support.title')} /></h2>
                  <p>{t('home.support.sub')}</p>
                  <div className="help-buddy" aria-hidden="true"><Huddy wave mood="happy" /></div>
                </div>
                <div className="help">
                  <label className="search">
                    <I d={ICONS.search} />
                    <span className="sr">{t('home.support.searchLabel')}</span>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.support.search')} />
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
                    {faq.length === 0 && <p className="faq-empty">{t('home.support.none', { q: query })}</p>}
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
                  <h2 className="disp" id="h-blog"><Lines text={t('home.blog.title')} /></h2>
                  <p>{t('home.blog.sub')}</p>
                </div>
                <div className="posts">
                  {POSTS.map((p, i) => (
                    <button key={p.slug} className="post rv" style={{ transitionDelay: `${0.06 * i}s` }} onClick={() => setPost(p)}>
                      <div className="post-cover" style={coverStyle(p)}>
                        <span className={'shape ' + p.shape}><i /><i /><i /></span>
                      </div>
                      <div className="post-body">
                        <div className="post-meta"><span>{t(`home.blog.tag.${p.tag}`)}</span> · {fmtDate(p.date, locale)}</div>
                        <h3>{postText(t, p, 'title')}</h3>
                        <p>{postText(t, p, 'excerpt')}</p>
                        <span className="read">{t('home.blog.read')} <I d={ICONS.arrow} /></span>
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
            <h2 className="disp rv" id="h-closing"><Lines text={t('home.closing')} gradLast /></h2>
            <div className="rv closing-cta" style={{ transitionDelay: '.08s' }}>
              <Link className="btn big white" to={startLink}>{loggedIn ? t('nav.open') : t('home.cta.start')}<I d={ICONS.arrow} /></Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onSection={goTo} />

      {post && <Reader post={post} onClose={() => setPost(null)} />}
    </div>
  );
}
