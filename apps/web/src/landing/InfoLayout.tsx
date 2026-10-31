import { useRef, type ReactNode } from 'react';
import { useDocTitle, useLang, useLocale, useT, type Key } from '../i18n';
import { Blocks, Lines, Rich } from '../i18n/Rich';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './hero.css';
import './info.css';

/** Date shown on the policy pages. Update it whenever a policy changes. */
export const POLICIES_UPDATED = '2026-10-31';

interface Props {
  title: Key;
  kicker: Key;
  h1: Key;
  lead: Key;
  /** Policy page: shows "Last updated" and, when translated, the "English applies" note. */
  legal?: boolean;
  /** Wider column (status table, brand kit, licence list). */
  wide?: boolean;
  children: ReactNode;
}

/** Shared shell for the website's info pages: header, title block, readable column, footer. */
export function InfoLayout({ title, kicker, h1, lead, legal, wide, children }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  useDocTitle(title);
  const updated = new Date(POLICIES_UPDATED + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="hx info" ref={rootRef}>
      <a className="skip" href="#content">{t('nav.skip')}</a>
      <div className="starfield" aria-hidden="true" />
      <SiteHeader scrollRoot={rootRef} />
      <main id="content" tabIndex={-1}>
        <header className="info-head wrap">
          <p className="info-kicker">{t(kicker)}</p>
          <h1 className="disp"><Lines text={t(h1)} gradLast /></h1>
          <p className="info-lead">{t(lead)}</p>
          {legal && <p className="info-updated">{t('info.updated', { date: updated })}</p>}
          {legal && lang !== 'en' && <p className="info-note" role="note">{t('info.translationNote')}</p>}
        </header>
        <div className={'info-body wrap' + (wide ? ' wide' : '')}>
          <article className="info-card prose">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Numbered long-form sections from keys "<prefix>.<n>.h" (heading) and "<prefix>.<n>.b" (body). */
export function Sections({ prefix, count, from = 1 }: { prefix: string; count: number; from?: number }) {
  const t = useT();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const n = from + i;
        const id = `${prefix}-${n}`;
        return (
          <section key={n} aria-labelledby={id}>
            <h2 id={id}>{t(`${prefix}.${n}.h` as Key)}</h2>
            <Blocks text={t(`${prefix}.${n}.b` as Key)} />
          </section>
        );
      })}
    </>
  );
}

/** A translated rich paragraph. */
export function P({ k, className }: { k: Key; className?: string }) {
  const t = useT();
  return <p className={className}><Rich text={t(k)} /></p>;
}
