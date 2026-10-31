import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useT, type Key } from '../i18n';
import { LangPicker } from '../i18n/LangPicker';
import { Buddy, Logo, type Hue } from './Buddies';
import { I, ICONS } from './icons';

/** Home-page sections reachable from the nav and footer. */
export const SECTIONS = [
  { id: 'features', label: 'nav.features' },
  { id: 'safety', label: 'nav.safety' },
  { id: 'support', label: 'nav.support' },
  { id: 'blog', label: 'nav.blog' },
] as const satisfies readonly { id: string; label: Key }[];

/** Buddies standing on the footer horizon; m2 sits in the middle, over the line. */
const LINEUP: { hue: Hue; mood: 'happy' | 'grin' | 'wow' | 'wink' | 'sleepy'; topper: 'none' | 'headset' | 'sprout' | 'antenna' | 'bow' | 'beanie'; wave?: boolean }[] = [
  { hue: 'sky', mood: 'sleepy', topper: 'beanie' },
  { hue: 'coral', mood: 'grin', topper: 'bow' },
  { hue: 'teal', mood: 'happy', topper: 'headset', wave: true },
  { hue: 'amber', mood: 'wow', topper: 'sprout' },
  { hue: 'violet', mood: 'wink', topper: 'none' },
  { hue: 'mint', mood: 'grin', topper: 'none', wave: true },
];

const SOCIAL: { label: Key; icon: string }[] = [
  { label: 'social.chat', icon: ICONS.chat },
  { label: 'social.photos', icon: ICONS.camera },
  { label: 'social.videos', icon: ICONS.play },
  { label: 'social.music', icon: ICONS.music },
  { label: 'social.mentions', icon: ICONS.at },
];

type SectionHandler = (id: string) => (e: ReactMouseEvent) => void;

export function useAppLinks() {
  const loggedIn = useAuthStore((s) => !!s.token);
  return { loggedIn, appLink: loggedIn ? '/channels/@me' : '/login', startLink: loggedIn ? '/channels/@me' : '/register' };
}

/**
 * A link to a home-page section. On the home page `onSection` scrolls in place;
 * elsewhere it's a router link to "/#id" and the home page jumps there on arrival.
 */
function SectionLink({ id, onSection, children, className }: { id: string; onSection?: SectionHandler; children: ReactNode; className?: string }) {
  if (onSection) return <a className={className} href={`/#${id}`} onClick={onSection(id)}>{children}</a>;
  return <Link className={className} to={`/#${id}`}>{children}</Link>;
}

/** The site footer: buddy horizon, links, language, social, giant wordmark. Shared by every public page. */
export function SiteFooter({ onSection }: { onSection?: SectionHandler }) {
  const t = useT();
  const { appLink } = useAppLinks();
  return (
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
            {onSection ? (
              <a className="foot-mark" href="/" onClick={onSection('top')} aria-label={t('nav.home')}>
                <span className="brand-mark"><Logo /></span>
                <span className="word-pill">Huddle</span>
              </a>
            ) : (
              <Link className="foot-mark" to="/" aria-label={t('nav.home')}>
                <span className="brand-mark"><Logo /></span>
                <span className="word-pill">Huddle</span>
              </Link>
            )}
            <p className="foot-tag">{t('footer.tag')}</p>
            <span className="f-label" id="foot-lang-label">{t('footer.language')}</span>
            <div className="foot-lang"><LangPicker id="foot-lang" labelledBy="foot-lang-label" /></div>
            <span className="f-label">{t('footer.social')}</span>
            {/* TODO: the owner will provide the real social profile links; until then these stay inert. */}
            <div className="social">
              {SOCIAL.map((s) => (
                <a key={s.label} href="#" aria-label={t(s.label)} onClick={(e) => e.preventDefault()}><I d={s.icon} /></a>
              ))}
            </div>
          </div>
          <div className="foot-right">
            <div className="foot-cta"><Link className="btn pill-w" to={appLink}>{t('nav.open')}</Link></div>
            <nav className="foot-cols" aria-label={t('footer.nav')}>
              <div>
                <h4>{t('footer.product')}</h4>
                <SectionLink id="features" onSection={onSection}>{t('nav.features')}</SectionLink>
                <Link to="/status">{t('footer.status')}</Link>
                <Link to={appLink}>{t('footer.webapp')}</Link>
              </div>
              <div>
                <h4>{t('footer.company')}</h4>
                <Link to="/about">{t('footer.about')}</Link>
                <SectionLink id="blog" onSection={onSection}>{t('nav.blog')}</SectionLink>
                <Link to="/brand">{t('footer.brand')}</Link>
                <Link to="/careers">{t('footer.careers')}</Link>
              </div>
              <div>
                <h4>{t('footer.resources')}</h4>
                <SectionLink id="support" onSection={onSection}>{t('nav.support')}</SectionLink>
                <SectionLink id="safety" onSection={onSection}>{t('nav.safety')}</SectionLink>
                <Link to="/guidelines">{t('footer.guidelines')}</Link>
                <Link to="/developers">{t('footer.developers')}</Link>
                <Link to="/feedback">{t('footer.feedback')}</Link>
              </div>
              <div>
                <h4>{t('footer.policies')}</h4>
                <Link to="/terms">{t('footer.terms')}</Link>
                <Link to="/privacy">{t('footer.privacy')}</Link>
                <Link to="/cookies">{t('footer.cookies')}</Link>
                <Link to="/licenses">{t('footer.licenses')}</Link>
              </div>
            </nav>
          </div>
        </div>
        <div className="wrap foot-legal"><small>{t('footer.legal', { year: new Date().getFullYear() })}</small></div>
        <div className="foot-word" aria-hidden="true"><span>Huddle</span></div>
      </div>
    </footer>
  );
}

/** Header for the info pages: same look as the home page bar, links go back to home sections. */
export function SiteHeader({ scrollRoot }: { scrollRoot: RefObject<HTMLElement | null> }) {
  const t = useT();
  const { loggedIn, appLink, startLink } = useAppLinks();
  const barRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 8);
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [scrollRoot]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <header className="bar" ref={barRef} data-open={open ? 'true' : 'false'} data-scrolled={scrolled ? 'true' : 'false'}>
      <div className="bar-in">
        <Link className="brand" to="/" aria-label={t('nav.home')}>
          <span className="brand-mark"><Logo /></span>
          <span className="brand-word">Huddle</span>
        </Link>
        <nav className="links" aria-label={t('nav.primary')}>
          {SECTIONS.map((s) => <Link key={s.id} to={`/#${s.id}`}>{t(s.label)}</Link>)}
        </nav>
        <div className="actions">
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
        {SECTIONS.map((s) => <Link key={s.id} to={`/#${s.id}`} onClick={() => setOpen(false)}>{t(s.label)}<I d={ICONS.arrow} /></Link>)}
        <div className="sheet-cta">
          {!loggedIn && <Link className="btn ghost-w" to={appLink}>{t('nav.login')}</Link>}
          <Link className="btn pill-w" to={startLink}>{loggedIn ? t('nav.open') : t('nav.signup')}</Link>
        </div>
      </nav>
    </header>
  );
}
