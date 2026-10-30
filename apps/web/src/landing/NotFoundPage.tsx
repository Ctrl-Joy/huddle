import { Link } from 'react-router-dom';
import { Blobs, Trio } from './art';
import { Reveal, useTitle } from './common';

export function NotFoundContent({ what = 'page' }: { what?: string }) {
  return (
    <section className="lp-404">
      <Blobs variant="c" />
      <div className="lp-wrap lp-center">
        <Reveal variant="zoom"><Trio size={220} mood="puzzled" className="lp-float" /></Reveal>
        <Reveal delay={80}><p className="lp-404-code" aria-hidden="true">404</p></Reveal>
        <Reveal delay={140}><h1 className="lp-h1">This channel doesn’t exist… yet.</h1></Reveal>
        <Reveal delay={200}><p className="lp-lede lp-narrow">We looked under every category and couldn’t find that {what}. It may have moved, or the link might have a typo.</p></Reveal>
        <Reveal delay={260}>
          <div className="lp-hero-ctas lp-center-row">
            <Link to="/" className="lp-btn lp-btn-primary lp-btn-lg">Back to home</Link>
            <Link to="/support" className="lp-btn lp-btn-ghost lp-btn-lg">Visit Support</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function NotFoundPage() {
  useTitle('Page not found — Huddle');
  return <NotFoundContent />;
}
