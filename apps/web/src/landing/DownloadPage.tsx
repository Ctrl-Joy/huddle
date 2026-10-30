import { Link } from 'react-router-dom';
import { DeviceGlyph, Trio } from './art';
import { PageHero, Reveal, useAppHref, useTitle } from './common';
import { CtaBand } from './CtaBand';

type Kind = 'desktop' | 'laptop' | 'terminal' | 'phone' | 'tablet';
const PLATFORMS: { os: string; kind: Kind; how: string; browsers: string; tone: string }[] = [
  { os: 'Windows', kind: 'desktop', tone: 'teal', how: 'Open Huddle in your browser today. A native desktop app is on the roadmap.', browsers: 'Edge, Chrome, Firefox' },
  { os: 'macOS', kind: 'laptop', tone: 'coral', how: 'Works great in your browser of choice, and you can pin it to the Dock as its own app.', browsers: 'Safari, Chrome, Firefox' },
  { os: 'Linux', kind: 'terminal', tone: 'amber', how: 'Any up-to-date Chromium or Firefox build runs the full Huddle experience.', browsers: 'Firefox, Chromium, Chrome' },
  { os: 'iOS & iPadOS', kind: 'phone', tone: 'violet', how: 'Open Huddle in Safari and add it to your Home Screen for a full-screen, app-like feel.', browsers: 'Safari' },
  { os: 'Android', kind: 'tablet', tone: 'sky', how: 'Open Huddle in Chrome and add it to your Home screen to launch it like any other app.', browsers: 'Chrome, Firefox, Samsung Internet' },
];

function detectOS(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS & iPadOS';
  if (/mac/i.test(ua)) return 'macOS';
  if (/win/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return '';
}

export default function DownloadPage() {
  useTitle('Download Huddle');
  const { href } = useAppHref();
  const mine = detectOS();
  return (
    <>
      <PageHero eyebrow="Get Huddle" title={<>Huddle, wherever <span className="lp-grad">you are.</span></>} art={<Trio size={260} className="lp-float" />}>
        <p>Huddle runs right in your web browser — nothing to install, nothing to update. Native apps are in the works; until then, every device below gets the full experience.</p>
        <div className="lp-hero-ctas"><Link to={href} className="lp-btn lp-btn-primary lp-btn-lg">Open Huddle in your browser</Link></div>
      </PageHero>

      <section className="lp-section" aria-labelledby="platforms-h">
        <div className="lp-wrap">
          <h2 id="platforms-h" className="lp-sr">Platforms</h2>
          <div className="lp-os-grid">
            {PLATFORMS.map((p, i) => (
              <Reveal key={p.os} delay={i * 80} className={`lp-card lp-os tone-${p.tone}${mine === p.os ? ' mine' : ''}`}>
                {mine === p.os && <span className="lp-os-mine">Your device</span>}
                <span className={`lp-os-ic bg-soft-${p.tone}`}><DeviceGlyph kind={p.kind} /></span>
                <h3>{p.os}</h3>
                <p>{p.how}</p>
                <p className="lp-os-br"><small>Tested in</small>{p.browsers}</p>
                <div className="lp-os-actions">
                  <Link to={href} className="lp-btn lp-btn-primary lp-btn-block">Open in browser</Link>
                  <button type="button" className="lp-btn lp-btn-ghost lp-btn-block" disabled aria-disabled="true">Native app · Coming soon</button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt" aria-labelledby="install-h">
        <div className="lp-wrap lp-install">
          <Reveal className="lp-install-text">
            <span className="lp-eyebrow">Install as an app</span>
            <h2 id="install-h" className="lp-h2">Give Huddle its own window</h2>
            <p className="lp-body">You don’t need an installer to make Huddle feel at home. Most browsers can pin a site as an app with its own icon and window — here’s how.</p>
          </Reveal>
          <ol className="lp-steps">
            {[
              ['Chrome or Edge (desktop)', 'Open Huddle, then use the browser menu → “Cast, save and share” / “Apps” → “Install page as app”.'],
              ['Safari (Mac)', 'Open Huddle, then choose File → “Add to Dock”.'],
              ['Safari (iPhone & iPad)', 'Tap the Share button, then “Add to Home Screen”.'],
              ['Chrome (Android)', 'Tap the ⋮ menu, then “Add to Home screen”.'],
            ].map(([h, b], i) => (
              <li key={h}><Reveal delay={i * 90} className="lp-step"><span className="lp-step-n">{i + 1}</span><div><b>{h}</b><p>{b}</p></div></Reveal></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="req-h">
        <div className="lp-wrap lp-center">
          <Reveal>
            <h2 id="req-h" className="lp-h3">What you’ll need</h2>
            <p className="lp-body lp-narrow">A recent version of a modern browser, a stable connection, and — for voice and video — permission to use your microphone and camera. Screen sharing works in desktop browsers.</p>
          </Reveal>
        </div>
      </section>
      <CtaBand title="No download? No problem." sub="Your browser is all it takes. Open Huddle and you’ll be chatting before the kettle boils." />
    </>
  );
}
