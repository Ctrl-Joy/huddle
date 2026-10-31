import { Link } from 'react-router-dom';
import { useDocTitle, useT } from '../i18n';
import { Lines } from '../i18n/Rich';
import { Buddy } from './Buddies';
import './hero.css';

/** 404 in the home page's style: a confused buddy and a way back. */
export default function NotFound() {
  const t = useT();
  useDocTitle('nf.title', false);
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
        <h1 className="disp"><Lines text={t('nf.h1')} gradLast /></h1>
        <p>{t('nf.body')}</p>
        <Link className="btn big white" to="/">{t('nf.back')}</Link>
      </main>
    </div>
  );
}
