import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArtChannels, ArtDMs, ArtFiles, ArtRoles, ArtVoice, Av, Blobs, HeroMock } from './art';
import { CtaBand } from './CtaBand';
import { OpenAppButton, Reveal, useAppHref, useTitle } from './common';
import { IconCheck } from '../components/common/icons';

interface Feature { id: string; kicker: string; title: string; body: string; points: string[]; art: ReactNode; tone: string }

const FEATURES: Feature[] = [
  {
    id: 'communities', kicker: 'Servers & channels', tone: 'teal',
    title: 'Spaces that grow with your group',
    body: 'Start a server in seconds, then shape it around how your group really talks. Separate the announcements from the memes, tuck planning into its own corner, and keep a voice room open for whoever wanders by.',
    points: ['Text and voice channels, grouped into tidy categories', 'Private channels for the folks who need them', 'Invite links with expiry dates and use limits'],
    art: <ArtChannels />,
  },
  {
    id: 'voice', kicker: 'Voice, video & screen share', tone: 'coral',
    title: 'Talk like you’re in the same room',
    body: 'Hop into a voice channel without calling anyone — just drop in. Flip on your camera when faces help, share your screen to walk through a plan, and see at a glance who’s speaking.',
    points: ['Drop-in voice rooms that stay open', 'Camera and screen sharing in the same call', 'Mute, deafen and device picks one click away'],
    art: <ArtVoice />,
  },
  {
    id: 'roles', kicker: 'Roles & moderation', tone: 'amber',
    title: 'You set the house rules',
    body: 'Roles let you hand out exactly the powers each person needs — nothing more. Give organisers the keys, let moderators keep things calm, and decide channel by channel who can see, speak or post.',
    points: ['Colour-coded roles with fine-grained permissions', 'Per-channel overrides for roles and members', 'Timeouts, kicks and bans with a reason on record'],
    art: <ArtRoles />,
  },
  {
    id: 'dms', kicker: 'Direct messages & friends', tone: 'violet',
    title: 'A quiet corner for one-on-ones',
    body: 'Not everything belongs in the group chat. Add friends, see who’s around, and slip into a private conversation or a small group DM — with voice and video calls built right in.',
    points: ['Friend requests, presence and custom statuses', 'Group DMs for the inner circle', 'Block anyone, any time'],
    art: <ArtDMs />,
  },
  {
    id: 'files', kicker: 'Files & notifications', tone: 'sky',
    title: 'Share the good stuff, skip the noise',
    body: 'Drag in photos, PDFs and drafts and they land right in the conversation. Then tune your notifications server by server, so a busy community never drowns out the message that’s actually for you.',
    points: ['Drag-and-drop uploads with image previews', 'All messages, only mentions, or nothing — per server', 'Mute servers and quiet @everyone pings'],
    art: <ArtFiles />,
  },
];

const STORIES = [
  { group: 'A Thursday board-game club', tone: 'amber' as const, who: 'R', quote: 'We used to lose plans in a dozen chat threads. Now there’s one channel per campaign and a voice room we just leave open on game night.' },
  { group: 'A university study group', tone: 'teal' as const, who: 'M', quote: 'Screen share plus a pinned resources channel turned our cram sessions from chaos into something that actually feels organised.' },
  { group: 'A tiny indie game team', tone: 'coral' as const, who: 'J', quote: 'Roles keep testers out of the build channels and the whole team in the lobby. It feels like an office, minus the commute.' },
];

function Hero() {
  const { loggedIn } = useAppHref();
  return (
    <section className="lp-hero">
      <Blobs variant="a" />
      <div className="lp-grid-bg" aria-hidden="true" />
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-text">
          <Reveal><span className="lp-eyebrow"><span className="live-dot" />Chat · voice · video, together</span></Reveal>
          <Reveal delay={80}>
            <h1 className="lp-display">Pull up a chair. <span className="lp-grad">Your crew’s already talking.</span></h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lp-lede">Huddle is a home for the groups you care about — friends, clubs, classmates, guilds and side-project teams. Jump between text channels, drop into voice, share your screen, and keep it all in order with roles that fit how your group actually works.</p>
          </Reveal>
          <Reveal delay={240}>
            <div className="lp-hero-ctas">
              <OpenAppButton />
              <Link to="/download" className="lp-btn lp-btn-ghost lp-btn-lg">Download</Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <ul className="lp-hero-meta">
              <li><IconCheck size={16} />Free to use</li>
              <li><IconCheck size={16} />Runs in any modern browser</li>
              <li><IconCheck size={16} />{loggedIn ? 'You’re signed in' : 'Set up in under a minute'}</li>
            </ul>
          </Reveal>
        </div>
        <Reveal delay={200} variant="zoom" className="lp-hero-art"><HeroMock /></Reveal>
      </div>
    </section>
  );
}

function Marquee() {
  const words = ['study groups', 'book clubs', 'raid nights', 'band practice', 'hack weeks', 'family chats', 'art critiques', 'language swaps', 'fan clubs', 'run clubs'];
  const row = words.map((w) => <span key={w}>{w}</span>);
  return (
    <section className="lp-marquee" aria-label="Huddle is made for groups of all kinds">
      <p className="lp-marquee-lead">Made for</p>
      <div className="lp-marquee-track" aria-hidden="true"><div className="lp-marquee-row">{row}{row}</div></div>
      <p className="lp-sr">study groups, book clubs, raid nights, band practice, hack weeks, family chats and more.</p>
    </section>
  );
}

function FeatureRow({ f, i }: { f: Feature; i: number }) {
  const flip = i % 2 === 1;
  return (
    <section className={'lp-feature' + (flip ? ' flip' : '')} id={f.id} aria-labelledby={`${f.id}-h`}>
      <div className="lp-wrap lp-feature-in">
        <Reveal variant={flip ? 'right' : 'left'} className={`lp-feature-art tone-${f.tone}`}>{f.art}</Reveal>
        <div className="lp-feature-text">
          <Reveal><span className={`lp-kicker tx-${f.tone}`}>{String(i + 1).padStart(2, '0')} — {f.kicker}</span></Reveal>
          <Reveal delay={80}><h2 id={`${f.id}-h`} className="lp-h2">{f.title}</h2></Reveal>
          <Reveal delay={140}><p className="lp-body">{f.body}</p></Reveal>
          <ul className="lp-points">
            {f.points.map((p, k) => (
              <li key={p}><Reveal delay={200 + k * 70}><span className={`lp-tick bg-${f.tone}`}><IconCheck size={14} /></span>{p}</Reveal></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { n: '3,218', l: 'messages swapped' },
    { n: '41 h', l: 'spent hanging out in voice' },
    { n: '12', l: 'channels, neatly sorted' },
    { n: '0', l: 'notifications nobody wanted' },
  ];
  return (
    <section className="lp-stats" aria-labelledby="stats-h">
      <Blobs variant="b" />
      <div className="lp-wrap">
        <Reveal className="lp-center">
          <span className="lp-eyebrow">A week in a busy huddle</span>
          <h2 id="stats-h" className="lp-h2">Small rooms. Big energy.</h2>
          <p className="lp-note">Illustrative figures from an imagined 60-person community — not real usage data.</p>
        </Reveal>
        <div className="lp-stat-grid">
          {stats.map((s, i) => (
            <Reveal key={s.l} delay={i * 90} className="lp-stat"><b>{s.n}</b><span>{s.l}</span></Reveal>
          ))}
        </div>
        <div className="lp-stories">
          {STORIES.map((s, i) => (
            <Reveal key={s.group} delay={i * 110} className="lp-story">
              <figure>
                <span className="lp-story-tag">Example story</span>
                <blockquote><p>“{s.quote}”</p></blockquote>
                <figcaption><Av tone={s.tone} label={s.who} size={36} /><span>{s.group}</span></figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  useTitle('Huddle — chat, voice and video for your people');
  return (
    <>
      <Hero />
      <Marquee />
      <div className="lp-features" id="features">
        <div className="lp-wrap lp-center lp-features-head">
          <Reveal><span className="lp-eyebrow">Everything in one place</span></Reveal>
          <Reveal delay={80}><h2 className="lp-h2">Built for hanging out <em>and</em> getting things done</h2></Reveal>
        </div>
        {FEATURES.map((f, i) => <FeatureRow key={f.id} f={f} i={i} />)}
      </div>
      <Stats />
      <CtaBand />
    </>
  );
}
