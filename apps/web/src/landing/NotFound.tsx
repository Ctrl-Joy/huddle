import { Link } from 'react-router-dom';
import './hero.css';

/** 404 in the same style as the home hero. */
export default function NotFound() {
  return (
    <div className="hx nf">
      <div className="nf-box">
        <span className="tag">404</span>
        <h2>This channel doesn’t exist… yet.</h2>
        <p className="lead">The page you’re looking for has moved or never existed.</p>
        <div className="closing-cta">
          <Link className="btn solid" to="/">Back home</Link>
        </div>
      </div>
    </div>
  );
}
