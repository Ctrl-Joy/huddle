import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Reveal, useTitle } from './common';
import { POSTS, findPost, fmtDate, type Post } from './posts';
import { NotFoundContent } from './NotFoundPage';

export function Cover({ post, big = false }: { post: Post; big?: boolean }) {
  const [a, b, c] = post.cover;
  return (
    <div className={'lp-cover' + (big ? ' big' : '')} style={{ '--c1': a, '--c2': b, '--c3': c } as CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        {post.shape === 'rings' && <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="3"><circle cx="160" cy="90" r="26" /><circle cx="160" cy="90" r="46" opacity=".6" /><circle cx="160" cy="90" r="68" opacity=".35" /><circle cx="160" cy="90" r="92" opacity=".18" /></g>}
        {post.shape === 'bubbles' && <g fill="rgba(255,255,255,.85)"><rect x="70" y="50" width="110" height="38" rx="19" /><rect x="140" y="98" width="110" height="38" rx="19" opacity=".55" /><circle cx="92" cy="69" r="5" fill={b} /><circle cx="110" cy="69" r="5" fill={b} /><circle cx="128" cy="69" r="5" fill={b} /></g>}
        {post.shape === 'stack' && <g>{[0, 1, 2, 3].map((i) => <rect key={i} x={100 + i * 8} y={40 + i * 26} width={120 - i * 16} height="18" rx="9" fill="rgba(255,255,255,.85)" opacity={1 - i * 0.2} />)}</g>}
        {post.shape === 'wave' && <g fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="4" strokeLinecap="round">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const h = [16, 34, 54, 26, 70, 40, 58, 22, 12][i]; return <path key={i} d={`M${104 + i * 14} ${90 - h / 2}v${h}`} />; })}</g>}
      </svg>
    </div>
  );
}

export function BlogIndexPage() {
  useTitle('Blog — Huddle');
  const [lead, ...rest] = [...POSTS].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      <section className="lp-pagehero lp-blog-hero">
        <div className="lp-wrap">
          <Reveal><span className="lp-eyebrow">The Huddle blog</span></Reveal>
          <Reveal delay={80}><h1 className="lp-h1">Notes from the <span className="lp-grad">back room.</span></h1></Reveal>
          <Reveal delay={160}><p className="lp-lede">Product updates, design stories and practical guides for people who run — or just love — their communities.</p></Reveal>
        </div>
      </section>
      <section className="lp-section lp-section-tight">
        <div className="lp-wrap">
          <Reveal>
            <Link to={`/blog/${lead.slug}`} className="lp-card lp-post lp-post-lead">
              <Cover post={lead} big />
              <div className="lp-post-b">
                <span className="lp-tag">{lead.tag}</span>
                <h2>{lead.title}</h2>
                <p>{lead.excerpt}</p>
                <small><time dateTime={lead.date}>{fmtDate(lead.date)}</time> · {lead.minutes} min read</small>
              </div>
            </Link>
          </Reveal>
          <div className="lp-post-grid">
            {rest.map((p, i) => (
              <Reveal key={p.slug} delay={i * 90}>
                <Link to={`/blog/${p.slug}`} className="lp-card lp-post">
                  <Cover post={p} />
                  <div className="lp-post-b">
                    <span className="lp-tag">{p.tag}</span>
                    <h2>{p.title}</h2>
                    <p>{p.excerpt}</p>
                    <small><time dateTime={p.date}>{fmtDate(p.date)}</time> · {p.minutes} min read</small>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const post = findPost(slug);
  useTitle(post ? `${post.title} — Huddle blog` : 'Post not found — Huddle');
  if (!post) return <NotFoundContent what="blog post" />;
  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);
  return (
    <article className="lp-article">
      <header className="lp-wrap lp-article-head">
        <Reveal><Link to="/blog" className="lp-back">← All posts</Link></Reveal>
        <Reveal delay={60}><span className="lp-tag">{post.tag}</span></Reveal>
        <Reveal delay={120}><h1 className="lp-h1">{post.title}</h1></Reveal>
        <Reveal delay={180}><p className="lp-article-meta">{post.author} · <time dateTime={post.date}>{fmtDate(post.date)}</time> · {post.minutes} min read</p></Reveal>
      </header>
      <Reveal variant="zoom" className="lp-wrap lp-article-cover"><Cover post={post} big /></Reveal>
      <div className="lp-wrap lp-prose">
        {post.body.map((b, i) => {
          switch (b.t) {
            case 'p': return <p key={i}>{b.text}</p>;
            case 'h2': return <h2 key={i}>{b.text}</h2>;
            case 'ul': return <ul key={i}>{b.items.map((it) => <li key={it}>{it}</li>)}</ul>;
            case 'quote': return <blockquote key={i}><p>{b.text}</p></blockquote>;
          }
        })}
      </div>
      <aside className="lp-wrap lp-more" aria-labelledby="more-h">
        <h2 id="more-h" className="lp-h3">Keep reading</h2>
        <div className="lp-post-grid two">
          {others.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="lp-card lp-post">
              <Cover post={p} />
              <div className="lp-post-b"><span className="lp-tag">{p.tag}</span><h3>{p.title}</h3><small>{fmtDate(p.date)}</small></div>
            </Link>
          ))}
        </div>
      </aside>
    </article>
  );
}
