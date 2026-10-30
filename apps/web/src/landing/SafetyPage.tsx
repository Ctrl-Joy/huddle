import { Link } from 'react-router-dom';
import { IconBell, IconLock, IconShield, IconSlash, IconUsers, IconMessage, IconEye, IconClock } from '../components/common/icons';
import { Accordion, PageHero, Reveal, useTitle, type QA } from './common';

function ShieldArt() {
  return (
    <div className="art-shield" role="img" aria-label="Illustration: a glowing shield surrounded by small chat bubbles and a check mark.">
      <svg viewBox="0 0 240 240" width="260" height="260" aria-hidden="true">
        <defs>
          <linearGradient id="sh-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#0f766e" /></linearGradient>
          <radialGradient id="sh-r"><stop offset="0" stopColor="#2dd4bf" stopOpacity=".45" /><stop offset="1" stopColor="#2dd4bf" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="120" cy="120" r="110" fill="url(#sh-r)" className="sh-pulse" />
        <path d="M120 36l64 24v52c0 46-30 78-64 92-34-14-64-46-64-92V60z" fill="url(#sh-g)" />
        <path d="M120 52l50 19v41c0 36-23 62-50 74z" fill="#ffffff" opacity=".12" />
        <path d="m92 120 20 20 38-42" stroke="#06201d" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <g className="sh-bub sh-b1"><rect x="8" y="58" width="52" height="30" rx="15" fill="#fb7185" /><circle cx="24" cy="73" r="3" fill="#2b0c14" /><circle cx="34" cy="73" r="3" fill="#2b0c14" /><circle cx="44" cy="73" r="3" fill="#2b0c14" /></g>
        <g className="sh-bub sh-b2"><rect x="184" y="150" width="48" height="28" rx="14" fill="#f59e0b" /><path d="M198 164h20" stroke="#2b1a03" strokeWidth="4" strokeLinecap="round" /></g>
        <g className="sh-bub sh-b3"><circle cx="196" cy="54" r="16" fill="#8b5cf6" /><path d="M189 54h14M196 47v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></g>
      </svg>
    </div>
  );
}

const PRINCIPLES = [
  { t: 'People first, always', b: 'Every feature starts with a simple question: does this make it easier for someone to feel welcome and stay safe?', tone: 'teal' },
  { t: 'Communities lead', b: 'The people who run a server know it best. We give them strong, clear tools rather than one-size-fits-all rules.', tone: 'coral' },
  { t: 'You hold the controls', b: 'Who can reach you, what pings you and what you see should always be your call — and easy to change.', tone: 'amber' },
  { t: 'Collect less', b: 'We keep only what Huddle needs to work. Your conversations are for your group, not for advertisers.', tone: 'violet' },
];

const CONTROLS = [
  { i: <IconSlash size={22} />, t: 'Block', b: 'Block someone from your Friends list or their profile. They can no longer send you friend requests or direct messages.' },
  { i: <IconLock size={22} />, t: 'Private channels', b: 'Mark a channel or a whole category private so only the roles and members you choose can see it.' },
  { i: <IconShield size={22} />, t: 'Roles & permissions', b: 'Decide who can post, speak, mention @everyone, manage channels or moderate — server-wide or per channel.' },
  { i: <IconClock size={22} />, t: 'Timeouts, kicks & bans', b: 'Moderators can pause someone for a while, remove them, or ban them, with a reason kept for the team.' },
  { i: <IconBell size={22} />, t: 'Notification control', b: 'Mute a server, limit alerts to direct mentions, or suppress @everyone and @here pings entirely.' },
  { i: <IconMessage size={22} />, t: 'Reporting', b: 'Flag problems to a server’s moderators, or reach the Huddle team through Support. A one-tap in-app report flow is in the works.' },
];

const FAQ: QA[] = [
  { q: 'Who can see the messages I send in a server?', a: <p>Anyone who has permission to view that channel. Server admins decide this with roles and channel permissions — private channels are only visible to the roles or members that have been added to them.</p> },
  { q: 'Can someone message me if we aren’t friends?', a: <p>People who share a server with you can start a direct message. If someone bothers you, block them: blocking stops friend requests and direct messages from that person.</p> },
  { q: 'What happens when I block someone?', a: <p>They’re removed from your friends list and can’t send you friend requests or DMs. You can review and unblock people any time from the Blocked tab in Friends.</p> },
  { q: 'How do moderators remove someone from a server?', a: <p>Members with the right permissions can time someone out (they can read but not participate for a while), kick them (they can rejoin with a new invite), or ban them (they can’t rejoin). Each action can include a reason.</p> },
  { q: 'I run a server. Where do I start with safety?', a: <p>Create a welcome channel with your rules, give a couple of trusted people a Moderators role, keep invite links set to expire, and review the default permissions for <code>@everyone</code>. Our <Link to="/support#faq">Support centre</Link> walks through each step.</p> },
  { q: 'How do I report something serious?', a: <p>Tell the server’s moderators first — they can act immediately. For anything that breaks the law or puts someone in danger, contact local emergency services, then reach out to us via <Link to="/support#contact">Support</Link>.</p> },
];

export default function SafetyPage() {
  useTitle('Safety centre — Huddle');
  return (
    <>
      <PageHero eyebrow="Safety centre" title={<>Room to be yourself, <span className="lp-grad">with guardrails you control.</span></>} art={<ShieldArt />}>
        <p>Huddle gives everyone — members, moderators and server owners — simple tools to shape who they talk to and what they see. Here’s how we think about safety, and how to use those tools.</p>
      </PageHero>

      <section className="lp-section" id="principles" aria-labelledby="principles-h">
        <div className="lp-wrap">
          <Reveal className="lp-center"><span className="lp-eyebrow">Our principles</span><h2 id="principles-h" className="lp-h2">What guides us</h2></Reveal>
          <div className="lp-card-grid four">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.t} delay={i * 80} className={`lp-card lp-principle tone-${p.tone}`}>
                <span className={`lp-num bg-soft-${p.tone}`}>{i + 1}</span>
                <h3>{p.t}</h3><p>{p.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="controls" aria-labelledby="controls-h">
        <div className="lp-wrap">
          <Reveal className="lp-center"><span className="lp-eyebrow">Your controls</span><h2 id="controls-h" className="lp-h2">Tools at your fingertips</h2></Reveal>
          <div className="lp-card-grid three">
            {CONTROLS.map((c, i) => (
              <Reveal key={c.t} delay={(i % 3) * 80} className="lp-card lp-control">
                <span className="lp-control-ic">{c.i}</span>
                <h3>{c.t}</h3><p>{c.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="privacy" aria-labelledby="privacy-h">
        <div className="lp-wrap lp-split">
          <Reveal variant="left">
            <span className="lp-eyebrow">Privacy basics</span>
            <h2 id="privacy-h" className="lp-h2">Your stuff stays yours</h2>
            <p className="lp-body">Huddle exists to connect you with your people — not to profile you. We store what’s needed to deliver your messages, files and settings, and nothing about your conversations is sold or used for ads.</p>
          </Reveal>
          <Reveal variant="right">
            <ul className="lp-checklist">
              <li><IconEye size={18} /><span><b>Visibility follows permissions.</b> Only people who can view a channel can read it.</span></li>
              <li><IconUsers size={18} /><span><b>Your profile, your call.</b> Choose your display name, avatar, status and bio.</span></li>
              <li><IconBell size={18} /><span><b>Quiet by choice.</b> Desktop notifications and sounds are opt-in and adjustable.</span></li>
              <li><IconLock size={18} /><span><b>Sign out anywhere.</b> Logging out clears your session from that browser.</span></li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="families" aria-labelledby="families-h">
        <div className="lp-wrap">
          <Reveal className="lp-center"><span className="lp-eyebrow">Parents &amp; teens</span><h2 id="families-h" className="lp-h2">Talking about Huddle at home</h2>
            <p className="lp-body lp-narrow">Online spaces are a big part of growing up. These conversation starters help families build good habits together — without turning it into an interrogation.</p></Reveal>
          <div className="lp-tips">
            {[
              ['For parents', ['Ask which servers they enjoy and what happens there — curiosity beats rules.', 'Walk through blocking and muting together so they know it’s always an option.', 'Agree on what to do if a stranger asks for photos, personal details or to move to another app.']],
              ['For teens', ['You never owe anyone a reply. Block first, explain never.', 'Keep your real name, school and location out of your profile.', 'If something feels off, screenshot it and tell a moderator or an adult you trust.']],
            ].map(([h, tips], i) => (
              <Reveal key={h as string} delay={i * 100} className="lp-card lp-tip">
                <h3>{h as string}</h3>
                <ul>{(tips as string[]).map((t) => <li key={t}>{t}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="faq" aria-labelledby="faq-h">
        <div className="lp-wrap lp-faq-wrap">
          <Reveal><span className="lp-eyebrow">FAQ</span><h2 id="faq-h" className="lp-h2">Safety questions, answered</h2></Reveal>
          <Reveal delay={100}><Accordion items={FAQ} initialOpen={0} /></Reveal>
        </div>
      </section>
    </>
  );
}
