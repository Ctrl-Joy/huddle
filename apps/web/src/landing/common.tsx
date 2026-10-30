import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { IconChevronDown } from '../components/common/icons';

/** True when the user asked the OS to minimise motion. */
export function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Fades/slides its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = '', variant = 'up', id }: {
  children: ReactNode; delay?: number; className?: string; variant?: 'up' | 'left' | 'right' | 'zoom'; id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} id={id} className={`rv rv-${variant}${shown ? ' is-in' : ''}${className ? ' ' + className : ''}`}
      style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

export interface QA { q: string; a: ReactNode; id?: string }

/** Accessible disclosure list; one item open at a time. */
export function Accordion({ items, initialOpen = -1 }: { items: QA[]; initialOpen?: number }) {
  const [open, setOpen] = useState(initialOpen);
  const base = useId();
  return (
    <div className="acc">
      {items.map((it, i) => {
        const isOpen = open === i;
        const bid = `${base}-b${i}`; const pid = `${base}-p${i}`;
        return (
          <div key={it.q} id={it.id} className={'acc-item' + (isOpen ? ' open' : '')}>
            <h3 className="acc-h">
              <button id={bid} type="button" aria-expanded={isOpen} aria-controls={pid} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span>{it.q}</span>
                <IconChevronDown size={20} className="acc-chev" />
              </button>
            </h3>
            <div id={pid} role="region" aria-labelledby={bid} className="acc-panel" inert={!isOpen}>
              <div className="acc-inner"><div className="acc-body">{it.a}</div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Where the "open the app" CTA should go for the current visitor. */
export function useAppHref() {
  const token = useAuthStore((s) => s.token);
  return { loggedIn: !!token, href: token ? '/channels/@me' : '/login' };
}

export function OpenAppButton({ className = 'lp-btn lp-btn-primary lp-btn-lg', label }: { className?: string; label?: string }) {
  const { loggedIn, href } = useAppHref();
  return <Link className={className} to={href}>{label ?? (loggedIn ? 'Open Huddle' : 'Open Huddle in your browser')}</Link>;
}

/** Page hero used by the secondary pages. */
export function PageHero({ eyebrow, title, children, art }: { eyebrow: string; title: ReactNode; children?: ReactNode; art?: ReactNode }) {
  return (
    <section className="lp-pagehero">
      <div className="lp-wrap lp-pagehero-in">
        <div className="lp-pagehero-text">
          <Reveal><span className="lp-eyebrow">{eyebrow}</span></Reveal>
          <Reveal delay={80}><h1 className="lp-h1">{title}</h1></Reveal>
          {children && <Reveal delay={160}><div className="lp-lede">{children}</div></Reveal>}
        </div>
        {art && <Reveal delay={200} variant="zoom" className="lp-pagehero-art">{art}</Reveal>}
      </div>
    </section>
  );
}

/** Sets the document title for a landing page. */
export function useTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}
