import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Buddy } from './Buddies';
import './hero.css';

/** 404 in the home page's style: a confused buddy and a way back. */
export default function NotFound() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Page not found — Huddle';
    return () => { document.title = prev; };
  }, []);
  return (
    <div className="hx nf">
      <div className="starfield" aria-hidden="true" />
      <span className="nf-code disp" aria-hidden="true">404</span>
      <main className="nf-box">
        <div className="nf-buddy" aria-hidden="true">
          <Buddy hue="violet" mood="confused" topper="antenna" />
          <span className="q q1">?</span>
          <span className="q q2">?</span>
          <span className="q q3">?</span>
        </div>
        <h1 className="disp"><span>This channel</span><span className="grad">doesn’t exist.</span></h1>
        <p>The page you’re after has moved, or it never was. Let’s get you back to your people.</p>
        <Link className="btn big white" to="/">Back home</Link>
      </main>
    </div>
  );
}
