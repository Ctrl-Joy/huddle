// Original Huddle marketing illustrations, built from styled divs and inline SVG.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  IconBell, IconCheck, IconFile, IconHash, IconHeadphones, IconImage, IconLock, IconMic, IconMicOff,
  IconPhoneOff, IconPlus, IconScreen, IconShield, IconSpeaker, IconVideo, LogoMark,
} from '../components/common/icons';
import { prefersReducedMotion } from './common';

type Tone = 'teal' | 'coral' | 'amber' | 'violet' | 'sky' | 'lime';

export function Av({ tone, label, size = 32, ring = false, className = '' }: { tone: Tone; label: string; size?: number; ring?: boolean; className?: string }) {
  return (
    <span className={`av av-${tone}${ring ? ' av-ring' : ''}${className ? ' ' + className : ''}`} style={{ '--s': `${size}px` } as CSSProperties}>
      <span className="av-face">{label}</span>
    </span>
  );
}

function Bars({ n = 5, className = '' }: { n?: number; className?: string }) {
  return <span className={'wave ' + className}>{Array.from({ length: n }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</span>;
}

function Typing() {
  return <span className="lp-typing"><i /><i /><i /></span>;
}

/** The friendly three-blob "huddle" mascot. */
export function Trio({ size = 160, mood = 'happy', className = '' }: { size?: number; mood?: 'happy' | 'puzzled'; className?: string }) {
  const puzzled = mood === 'puzzled';
  return (
    <svg className={'trio ' + className} width={size} height={size * 0.8} viewBox="0 0 200 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`tg1-${mood}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#14b8a6" /></linearGradient>
        <linearGradient id={`tg2-${mood}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fda4af" /><stop offset="1" stopColor="#fb7185" /></linearGradient>
        <linearGradient id={`tg3-${mood}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fcd34d" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="150" rx="78" ry="8" fill="rgba(0,0,0,.28)" />
      <g className="trio-b trio-b2">
        <path d="M118 148c-22 0-34-14-34-40 0-30 18-52 40-52s40 22 40 52c0 26-14 40-46 40z" fill={`url(#tg2-${mood})`} />
        <circle cx="116" cy="96" r="6" fill="#1b0b12" /><circle cx="138" cy="96" r="6" fill="#1b0b12" />
        <circle cx="118" cy="94" r="2" fill="#fff" /><circle cx="140" cy="94" r="2" fill="#fff" />
        {puzzled ? <path d="M120 116q8-5 16 0" stroke="#1b0b12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          : <path d="M118 112q9 9 18 0" stroke="#1b0b12" strokeWidth="3.5" fill="none" strokeLinecap="round" />}
      </g>
      <g className="trio-b trio-b3">
        <path d="M150 150c-16 0-24-10-24-28 0-20 12-36 26-36s26 16 26 36c0 18-10 28-28 28z" fill={`url(#tg3-${mood})`} />
        <circle cx="146" cy="116" r="4.5" fill="#251703" /><circle cx="162" cy="116" r="4.5" fill="#251703" />
        <path d="M148 128q6 5 12 0" stroke="#251703" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <g className="trio-b trio-b1">
        <path d="M60 150c-26 0-40-16-40-44 0-32 20-58 44-58s44 26 44 58c0 28-18 44-48 44z" fill={`url(#tg1-${mood})`} />
        <circle cx="52" cy="98" r="6.5" fill="#06201d" /><circle cx="76" cy="98" r="6.5" fill="#06201d" />
        <circle cx="54" cy="96" r="2.2" fill="#fff" /><circle cx="78" cy="96" r="2.2" fill="#fff" />
        {puzzled ? <path d="M54 118h20" stroke="#06201d" strokeWidth="3.5" strokeLinecap="round" />
          : <path d="M52 114q12 12 24 0" stroke="#06201d" strokeWidth="3.5" fill="none" strokeLinecap="round" />}
        <ellipse cx="42" cy="110" rx="6" ry="3.5" fill="#fb7185" opacity=".45" /><ellipse cx="86" cy="110" rx="6" ry="3.5" fill="#fb7185" opacity=".45" />
      </g>
      {puzzled && <text x="170" y="52" fontSize="34" fontWeight="800" fill="#fcd34d" fontFamily="Sora, system-ui, sans-serif">?</text>}
    </svg>
  );
}

/** Floating gradient blobs used behind heroes and bands. */
export function Blobs({ variant = 'a' }: { variant?: 'a' | 'b' | 'c' }) {
  return (
    <div className={`blobs blobs-${variant}`} aria-hidden="true">
      <span className="blob-x bx1" /><span className="blob-x bx2" /><span className="blob-x bx3" />
    </div>
  );
}

/** Pointer-driven parallax on a container (sets --px/--py from -1..1). */
function useParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

function Msg({ tone, name, time, children, nameTone }: { tone: Tone; name: string; time: string; children: ReactNode; nameTone?: Tone }) {
  return (
    <div className="hm-msg">
      <Av tone={tone} label={name[0]} size={34} />
      <div className="hm-msg-b">
        <div className="hm-msg-h"><b className={nameTone ? `tx-${nameTone}` : ''}>{name}</b><small>{time}</small></div>
        {children}
      </div>
    </div>
  );
}

/** Large hero mock of the Huddle app. */
export function HeroMock() {
  const ref = useParallax<HTMLDivElement>();
  return (
    <div className="hm" ref={ref} role="img"
      aria-label="Illustration of the Huddle app: a list of servers, a channel list with a live voice room, a lively chat, and a floating voice call card with a glowing speaking ring.">
      <div className="hm-window" aria-hidden="true">
        <div className="hm-bar"><span className="hm-dots"><i /><i /><i /></span><span className="hm-title">Huddle — Night Owls Studio</span></div>
        <div className="hm-body">
          <div className="hm-rail">
            <span className="hm-srv hm-home"><LogoMark size={22} /></span>
            <span className="hm-sep" />
            <span className="hm-srv g1 active">NO</span>
            <span className="hm-srv g2">🎲</span>
            <span className="hm-srv g3">LB<em className="hm-badge">3</em></span>
            <span className="hm-srv g4">✿</span>
            <span className="hm-srv hm-add"><IconPlus size={16} /></span>
          </div>
          <div className="hm-side">
            <div className="hm-guild">Night Owls Studio</div>
            <div className="hm-cat">Text</div>
            <div className="hm-ch active"><IconHash size={14} />lobby</div>
            <div className="hm-ch"><IconHash size={14} />sketchbook</div>
            <div className="hm-ch unread"><IconHash size={14} />playtest-notes</div>
            <div className="hm-ch"><IconLock size={13} />core-team</div>
            <div className="hm-cat">Voice</div>
            <div className="hm-ch"><IconSpeaker size={14} />The Couch</div>
            <div className="hm-vu"><Av tone="coral" label="J" size={18} ring /><span>Juno</span><Bars n={3} className="wave-sm" /></div>
            <div className="hm-vu"><Av tone="amber" label="R" size={18} /><span>Ravi</span></div>
            <div className="hm-vu"><Av tone="violet" label="T" size={18} /><span>Tess</span><IconMicOff size={11} className="hm-muted" /></div>
            <div className="hm-me"><Av tone="teal" label="Y" size={26} /><span><b>you</b><small>Online</small></span><IconMic size={14} /><IconHeadphones size={14} /></div>
          </div>
          <div className="hm-chat">
            <div className="hm-head"><IconHash size={16} /><b>lobby</b><span className="hm-topic">hang out, share wins, plan sessions</span></div>
            <div className="hm-msgs">
              <Msg tone="coral" name="Juno" time="Today 8:02 PM" nameTone="coral">
                <p>build 0.4 is live 🎉 who&apos;s around to playtest tonight?</p>
              </Msg>
              <Msg tone="amber" name="Ravi" time="Today 8:03 PM" nameTone="amber">
                <p>count me in — bringing snacks <i>and</i> bug reports</p>
                <div className="hm-reacts"><span className="on">🍜 4</span><span>🐛 2</span></div>
              </Msg>
              <Msg tone="violet" name="Tess" time="Today 8:05 PM" nameTone="violet">
                <p>new level sketch, be gentle</p>
                <div className="hm-img"><span className="hm-img-sun" /><span className="hm-img-hill h1" /><span className="hm-img-hill h2" /></div>
              </Msg>
            </div>
            <div className="hm-typing"><Typing /><span><b>Mina</b> is typing…</span></div>
            <div className="hm-compose"><IconPlus size={16} /><span>Message #lobby</span></div>
          </div>
        </div>
      </div>

      <div className="hm-float hm-voice" aria-hidden="true">
        <div className="hm-voice-top"><span className="live-dot" />Live in The Couch</div>
        <div className="hm-voice-tiles">
          <div className="hm-tile speaking"><Av tone="coral" label="J" size={46} ring /><span>Juno</span></div>
          <div className="hm-tile"><Av tone="amber" label="R" size={46} /><span>Ravi</span></div>
        </div>
        <div className="hm-voice-ctl"><span><IconMic size={14} /></span><span><IconVideo size={14} /></span><span><IconScreen size={14} /></span><span className="end"><IconPhoneOff size={14} /></span></div>
      </div>

      <div className="hm-float hm-ping" aria-hidden="true">
        <span className="hm-ping-ic"><IconBell size={14} /></span>
        <span><b>Ravi</b> mentioned you<small>in #playtest-notes</small></span>
      </div>
      <div className="hm-float hm-chip" aria-hidden="true">✨ 12 friends online</div>
    </div>
  );
}

/* ---------- Feature illustrations ---------- */

export function ArtChannels() {
  return (
    <div className="art art-channels" role="img" aria-label="Illustration: a server organised into categories of text and voice channels, with a new channel being added.">
      <div className="ac-card" aria-hidden="true">
        <div className="ac-banner"><span className="ac-icon">🌿</span><b>Plant Swap Collective</b></div>
        <div className="ac-group">
          <div className="ac-cat">Start here</div>
          <div className="ac-row"><IconHash size={14} />welcome<span className="ac-pill">rules</span></div>
          <div className="ac-row"><IconHash size={14} />announcements</div>
        </div>
        <div className="ac-group">
          <div className="ac-cat">Swaps</div>
          <div className="ac-row active"><IconHash size={14} />cuttings-for-trade<span className="ac-count">8</span></div>
          <div className="ac-row"><IconHash size={14} />help-my-fern</div>
          <div className="ac-row"><IconSpeaker size={14} />Greenhouse<span className="ac-live">3 live</span></div>
        </div>
        <div className="ac-new"><IconPlus size={14} />Create channel</div>
      </div>
      <div className="ac-float ac-f1" aria-hidden="true"><IconHash size={16} />seed-library</div>
      <div className="ac-float ac-f2" aria-hidden="true"><IconSpeaker size={16} />Potting bench</div>
    </div>
  );
}

export function ArtVoice() {
  return (
    <div className="art art-voice" role="img" aria-label="Illustration: a video call with three people and a shared screen showing a chart, the active speaker outlined by a glowing ring.">
      <div className="vx-grid" aria-hidden="true">
        <div className="vt vt-share">
          <div className="vt-screen">
            <div className="vt-chart">{[38, 62, 48, 80, 66, 92].map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i } as CSSProperties} />)}</div>
            <span className="vt-tag"><IconScreen size={12} />Sam is sharing</span>
          </div>
        </div>
        <div className="vt vt-cam speaking"><Av tone="sky" label="S" size={52} ring /><span className="vt-name">Sam</span></div>
        <div className="vt vt-cam"><Av tone="lime" label="P" size={52} /><span className="vt-name">Priya <IconMicOff size={11} /></span></div>
        <div className="vt vt-cam"><Av tone="coral" label="O" size={52} /><span className="vt-name">Omar</span><Bars n={4} className="vt-wave" /></div>
      </div>
      <div className="vx-dock" aria-hidden="true">
        <span><IconMic size={16} /></span><span className="on"><IconVideo size={16} /></span><span className="on"><IconScreen size={16} /></span><span className="end"><IconPhoneOff size={16} /></span>
      </div>
    </div>
  );
}

export function ArtRoles() {
  const roles: { n: string; t: Tone; c: number }[] = [
    { n: 'Organisers', t: 'coral', c: 3 }, { n: 'Moderators', t: 'amber', c: 5 }, { n: 'Regulars', t: 'teal', c: 48 }, { n: 'Visitors', t: 'sky', c: 112 },
  ];
  const perms = [{ n: 'Manage channels', on: false }, { n: 'Timeout members', on: true }, { n: 'Pin messages', on: true }, { n: 'Mention @everyone', on: false }];
  return (
    <div className="art art-roles" role="img" aria-label="Illustration: a role list with coloured roles and a permission panel with on and off toggles for the Moderators role.">
      <div className="ar-list" aria-hidden="true">
        <div className="ar-title">Roles</div>
        {roles.map((r, i) => (
          <div key={r.n} className={'ar-role' + (i === 1 ? ' active' : '')}><span className={`ar-dot bg-${r.t}`} /><span>{r.n}</span><small>{r.c}</small></div>
        ))}
      </div>
      <div className="ar-perms" aria-hidden="true">
        <div className="ar-perm-h"><IconShield size={16} /><b>Moderators</b></div>
        {perms.map((p) => (
          <div key={p.n} className="ar-perm"><span>{p.n}</span><span className={'tog' + (p.on ? ' on' : '')}><i /></span></div>
        ))}
        <div className="ar-saved"><IconCheck size={14} />Changes saved</div>
      </div>
    </div>
  );
}

export function ArtDMs() {
  return (
    <div className="art art-dms" role="img" aria-label="Illustration: a friends list with online indicators beside a private conversation between two friends.">
      <div className="ad-friends" aria-hidden="true">
        <div className="ad-title">Friends <span>4 online</span></div>
        {([['Lena', 'violet', 'on', 'sketching ✏️'], ['Kofi', 'amber', 'on', 'In The Couch'], ['Ari', 'sky', 'idle', 'brb'], ['Mo', 'lime', 'off', '']] as const).map(([n, t, s, st]) => (
          <div key={n} className="ad-f"><span className="ad-av"><Av tone={t} label={n[0]} size={30} /><i className={`st st-${s}`} /></span><span className="ad-n"><b>{n}</b>{st && <small>{st}</small>}</span></div>
        ))}
      </div>
      <div className="ad-chat" aria-hidden="true">
        <div className="ad-head"><Av tone="violet" label="L" size={24} /><b>Lena</b></div>
        <div className="bub them">did you finish the zine cover?</div>
        <div className="bub me">almost! sending a preview</div>
        <div className="bub me bub-img"><span /></div>
        <div className="bub them">ok that colour is perfect 😍</div>
        <div className="ad-typing"><Typing /></div>
      </div>
    </div>
  );
}

export function ArtFiles() {
  return (
    <div className="art art-files" role="img" aria-label="Illustration: a shared file, an image upload and a notification panel that only shows mentions.">
      <div className="af-stack" aria-hidden="true">
        <div className="af-file"><span className="af-ic"><IconFile size={20} /></span><span><b>setlist-final.pdf</b><small>212 KB</small></span><span className="af-dl">↓</span></div>
        <div className="af-photo"><IconImage size={18} /><span className="af-ph-a" /><span className="af-ph-b" /></div>
        <div className="af-progress"><span>Uploading poster.png</span><i><b /></i></div>
      </div>
      <div className="af-notif" aria-hidden="true">
        <div className="af-n-h"><IconBell size={16} /><b>Notify me about</b></div>
        <div className="af-opt"><span className="rd" />All messages</div>
        <div className="af-opt sel"><span className="rd" />Only @mentions</div>
        <div className="af-opt"><span className="rd" />Nothing</div>
        <div className="af-toast"><span className="af-badge">@</span><span><b>Dee</b> needs you in #gig-night</span></div>
      </div>
    </div>
  );
}

/* ---------- Small glyphs ---------- */

export function DeviceGlyph({ kind }: { kind: 'desktop' | 'laptop' | 'terminal' | 'phone' | 'tablet' }) {
  const common = { width: 40, height: 40, viewBox: '0 0 40 40', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
  switch (kind) {
    case 'desktop': return <svg {...common}><rect x="5" y="7" width="30" height="20" rx="3" /><path d="M15 33h10M20 27v6" /><path d="M10 13h12M10 18h8" opacity=".55" /></svg>;
    case 'laptop': return <svg {...common}><rect x="8" y="9" width="24" height="16" rx="2.5" /><path d="M4 30h32l-2 3H6z" /><circle cx="20" cy="17" r="3" opacity=".55" /></svg>;
    case 'terminal': return <svg {...common}><rect x="5" y="7" width="30" height="24" rx="3" /><path d="m11 15 5 4-5 4M19 24h9" /></svg>;
    case 'phone': return <svg {...common}><rect x="12" y="4" width="16" height="32" rx="4" /><path d="M18 31h4" /></svg>;
    case 'tablet': return <svg {...common}><rect x="8" y="5" width="24" height="30" rx="3.5" /><path d="M18 30h4" /><path d="M13 12h14M13 17h9" opacity=".55" /></svg>;
  }
}

export function SocialShape({ shape }: { shape: 'circle' | 'square' | 'triangle' | 'wave' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {shape === 'circle' && <circle cx="12" cy="12" r="8" />}
      {shape === 'square' && <rect x="5" y="5" width="14" height="14" rx="4" />}
      {shape === 'triangle' && <path d="M12 4 21 19H3z" />}
      {shape === 'wave' && <path d="M3 14c3-6 6 6 9 0s6 6 9 0v4H3z" />}
    </svg>
  );
}
