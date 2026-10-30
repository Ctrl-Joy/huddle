import { Link } from 'react-router-dom';
import { Blobs, Trio } from './art';
import { OpenAppButton, Reveal } from './common';

export function CtaBand({ title = 'Your huddle is waiting.', sub = 'Gather your people, open a channel, and say hi. It takes less time than reading this sentence twice.' }: { title?: string; sub?: string }) {
  return (
    <section className="lp-cta" aria-labelledby="cta-h">
      <div className="lp-wrap">
        <Reveal variant="zoom" className="lp-cta-card">
          <Blobs variant="c" />
          <div className="lp-cta-text">
            <h2 id="cta-h" className="lp-h2">{title}</h2>
            <p className="lp-body">{sub}</p>
            <div className="lp-hero-ctas">
              <OpenAppButton className="lp-btn lp-btn-dark lp-btn-lg" />
              <Link to="/download" className="lp-btn lp-btn-onaccent lp-btn-lg">Get Huddle on your devices</Link>
            </div>
          </div>
          <Trio size={240} className="lp-cta-trio" />
        </Reveal>
      </div>
    </section>
  );
}
