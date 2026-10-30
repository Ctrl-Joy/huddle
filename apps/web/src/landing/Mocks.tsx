import { useEffect, useRef, useState, type RefObject } from 'react';
import { FaceAvatar, Logo, type Hue } from './Buddies';

/* Live mini-mocks of Huddle's own UI, built from styled divs. Everything is sized in em,
   so each mock scales with the font-size its container gives it. */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True while the element is on screen (animations only run then). */
function useInView<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** Steps through `durations` in a loop while visible. Returns the current step. */
function useSequence<T extends Element>(ref: RefObject<T | null>, durations: number[], still = 0) {
  const inView = useInView(ref);
  const [step, setStep] = useState(still);
  const key = durations.join(',');
  useEffect(() => {
    if (!inView || reduced()) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), durations[step % durations.length]);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, step, key]);
  return step;
}

// ---------- tiny icons ----------
const P = {
  hash: 'M5 9h14M4 15h14M10 4 8 20M16 4l-2 16',
  speaker: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  head: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  cam: 'M15 10l5-3v10l-5-3M3 7h12v10H3z',
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
  leave: 'M3 14c5-5 13-5 18 0l-3 3-3-2v-2a10 10 0 0 0-6 0v2l-3 2z',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .3-1.5-1.5.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L6.8 7.3l-2-.3-1 3 2 1v2l-2 1 1 3 2-.3 1.5 1.5-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.5-1.5 2 .3 1-3-2-1z',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01',
  play: 'M7 4v16l13-8z',
  chev: 'M6 9l6 6 6-6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6',
};
export const Ic = ({ d, className }: { d: keyof typeof P; className?: string }) => (
  <svg className={'mi' + (className ? ' ' + className : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[d]} />
  </svg>
);

const Av = ({ hue, speaking, status, mood }: { hue: Hue; speaking?: boolean; status?: string; mood?: Parameters<typeof FaceAvatar>[0]['mood'] }) => (
  <span className={'av' + (speaking ? ' speaking' : '')}>
    <FaceAvatar hue={hue} mood={mood} />
    {status && <i className={'dot ' + status} />}
  </span>
);

const Dots = () => <span className="typing" aria-hidden="true"><i /><i /><i /></span>;

// ---------- hero: laptop window + phone ----------
const SERVERS: { hue: Hue; t: string }[] = [
  { hue: 'coral', t: 'NO' },
  { hue: 'amber', t: 'GG' },
  { hue: 'violet', t: 'BK' },
  { hue: 'mint', t: 'ST' },
];

export function AppMock() {
  return (
    <div className="lap">
      <div className="lap-screen">
        <div className="win-bar"><i /><i /><i /><span>huddle · Night Owls</span></div>
        <div className="app">
          <div className="rail">
            <span className="srv home"><Logo /></span>
            <span className="rail-sep" />
            {SERVERS.map((s, i) => (
              <span key={s.t} className={'srv h-' + s.hue + (i === 0 ? ' on' : '')}>{s.t}</span>
            ))}
            <span className="srv add"><Ic d="plus" /></span>
          </div>
          <div className="side">
            <div className="side-head">Night Owls <Ic d="chev" /></div>
            <div className="cat">Text channels</div>
            <div className="ch on"><Ic d="hash" />general</div>
            <div className="ch"><Ic d="hash" />memes</div>
            <div className="ch"><Ic d="hash" />game-night<b>3</b></div>
            <div className="cat">Voice</div>
            <div className="ch"><Ic d="speaker" />Lounge</div>
            <div className="vu"><Av hue="amber" speaking />Juno</div>
            <div className="vu"><Av hue="sky" />Kit</div>
            <div className="ch"><Ic d="speaker" />Study Hall</div>
            <div className="me">
              <Av hue="teal" status="on" />
              <span><b>you</b><small>online</small></span>
              <Ic d="mic" /><Ic d="head" />
            </div>
          </div>
          <div className="chat">
            <div className="chat-head"><Ic d="hash" /><b>general</b><span>plans, memes, everything</span></div>
            <div className="msgs">
              <div className="msg"><Av hue="coral" /><div><p className="who c-coral">Mira <small>Today 21:04</small></p><p>who’s up for co-op tonight? 🎮</p></div></div>
              <div className="msg"><Av hue="amber" /><div><p className="who c-amber">Juno <small>21:05</small></p><p>already in Lounge, door’s open</p><div className="reacts"><span>🔥 3</span><span className="mine">🙌 2</span></div></div></div>
              <div className="msg"><Av hue="violet" /><div><p className="who c-violet">Pip <small>21:06</small></p><div className="shot"><i /><i /><i /></div></div></div>
              <div className="msg pop"><Av hue="mint" /><div><p className="who c-mint">Bo <small>21:07</small></p><p>omw!! save me a seat</p></div></div>
            </div>
            <div className="typing-line"><Dots /> Kit is typing…</div>
            <div className="composer">Message #general<Ic d="smile" /></div>
          </div>
        </div>
      </div>
      <div className="lap-base" />
    </div>
  );
}

export function PhoneMock() {
  return (
    <div className="phone">
      <div className="notch" />
      <div className="ph-head"><Ic d="speaker" /><b>Lounge</b><small>4 here</small></div>
      <div className="ph-grid">
        {(['amber', 'coral', 'sky', 'teal'] as Hue[]).map((h, i) => (
          <div key={h} className={'ph-tile t' + i}>
            <Av hue={h} mood={i === 1 ? 'grin' : 'happy'} />
            <small>{['Juno', 'Mira', 'Kit', 'you'][i]}</small>
          </div>
        ))}
      </div>
      <div className="ph-ctl">
        <span><Ic d="mic" /></span><span><Ic d="cam" /></span><span><Ic d="screen" /></span><span className="red"><Ic d="leave" /></span>
      </div>
    </div>
  );
}

// ---------- (a) status, reactions, emoji picker ----------
const PICK = ['🎉', '😂', '🔥', '👀', '💜', '✨', '🙌', '😎', '🍕', '🎮', '👍', '😴'];

export function StatusMock() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useSequence(ref, [1100]);
  const s = [12, 7, 4].map((b, i) => b + Math.floor((step + 3 - i) / 3));
  return (
    <div className="mock m-status" ref={ref}>
      <div className="prof">
        <div className="prof-banner" />
        <Av hue="pink" status="on" mood="wink" />
        <b>pixelpip</b>
        <span className="cstatus">🎧 lo-fi + level design</span>
      </div>
      <div className="m-side">
        <div className="msg">
          <Av hue="violet" />
          <div>
            <p className="who c-violet">Pip <small>just now</small></p>
            <p>I FINALLY beat the boss!!!</p>
            <div className="reacts">
              {['🎉', '😂', '🫶'].map((e, i) => (
                <span key={e} className={(step % 3 === i ? 'bump ' : '') + (i === 0 ? 'mine' : '')}>
                  {e} <b key={s[i]}>{s[i]}</b>
                </span>
              ))}
              <span className="add"><Ic d="smile" /></span>
            </div>
          </div>
        </div>
        <div className="picker">
          <div className="picker-head"><Ic d="smile" />Pick a reaction</div>
          <div className="picker-grid">
            {PICK.map((e, i) => <span key={e} className={i === (step * 5) % PICK.length ? 'hot' : ''}>{e}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- (b) video call + screen share ----------
export function CallMock() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useSequence(ref, [1600]);
  const who = step % 3;
  return (
    <div className="mock m-call" ref={ref}>
      <div className="share">
        <div className="share-screen">
          <div className="sc-side"><i /><i /><i /><i /></div>
          <div className="sc-main">
            <div className="sc-title" />
            <div className="sc-cards"><i /><i /><i /></div>
            <div className="sc-cursor" />
          </div>
        </div>
        <span className="live">LIVE</span>
        <span className="tile-name"><Ic d="screen" />Juno’s screen</span>
      </div>
      <div className="cams">
        {(['coral', 'sky', 'mint'] as Hue[]).map((h, i) => (
          <div key={h} className={'cam h-' + h + (who === i ? ' talking' : '')}>
            <Av hue={h} mood={i === 2 ? 'grin' : 'happy'} speaking={who === i} />
            <span className="tile-name">{['Mira', 'Kit', 'Bo'][i]}</span>
          </div>
        ))}
      </div>
      <div className="ctl">
        <span><Ic d="mic" /></span><span className="on"><Ic d="cam" /></span><span className="on"><Ic d="screen" /></span><span className="red"><Ic d="leave" /></span>
      </div>
    </div>
  );
}

// ---------- (c) drop into a voice channel ----------
export function DropInMock() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useSequence(ref, [900, 1000, 350, 2800], 3) % 4;
  return (
    <div className="mock m-drop" data-s={step} ref={ref}>
      <div className="side-head">Night Owls <Ic d="chev" /></div>
      <div className="cat">Voice channels</div>
      <div className="ch"><Ic d="speaker" />Lounge</div>
      <div className="vu"><Av hue="coral" speaking />Mira</div>
      <div className="vu"><Av hue="amber" />Juno</div>
      <div className="ch"><Ic d="speaker" />Game Night</div>
      <div className="vu"><Av hue="violet" />Pip</div>
      <div className="ch target"><Ic d="speaker" />Study Hall
        <svg className="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#1b1440" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      </div>
      <div className="vu you"><Av hue="teal" speaking={step === 3} />you</div>
      <div className="connected">
        <span className="sig"><i /><i /><i /></span>
        <div><b>Voice connected</b><small>Study Hall / Night Owls</small></div>
        <Ic d="leave" />
      </div>
    </div>
  );
}

// ---------- (d) members list with live statuses ----------
type St = 'on' | 'idle' | 'dnd' | 'off';
const PEOPLE: { name: string; hue: Hue; role: string }[] = [
  { name: 'Mira', hue: 'coral', role: 'c-coral' },
  { name: 'Juno', hue: 'amber', role: 'c-amber' },
  { name: 'Pip', hue: 'violet', role: 'c-violet' },
  { name: 'Bo', hue: 'mint', role: 'c-mint' },
  { name: 'Kit', hue: 'sky', role: 'c-sky' },
];
const SCRIPT: { st: St[]; voice: (string | null)[] }[] = [
  { st: ['on', 'idle', 'dnd', 'off', 'on'], voice: ['Lounge', null, null, null, null] },
  { st: ['on', 'on', 'dnd', 'off', 'on'], voice: ['Lounge', 'Lounge', null, null, null] },
  { st: ['on', 'on', 'dnd', 'on', 'on'], voice: ['Lounge', 'Lounge', null, null, null] },
  { st: ['on', 'on', 'dnd', 'on', 'idle'], voice: ['Lounge', 'Lounge', null, 'Lounge', null] },
  { st: ['on', 'on', 'on', 'on', 'idle'], voice: ['Lounge', 'Lounge', 'Game Night', 'Lounge', null] },
  { st: ['idle', 'on', 'on', 'off', 'on'], voice: [null, 'Lounge', 'Game Night', null, null] },
];
const SUB: Record<St, string> = { on: 'up for anything', idle: 'away for a bit', dnd: 'focus mode', off: '' };

export function MembersMock() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useSequence(ref, [1500]);
  const now = SCRIPT[step % SCRIPT.length];
  const rows = PEOPLE.map((p, i) => ({ ...p, st: now.st[i], voice: now.voice[i] }));
  const online = rows.filter((r) => r.st !== 'off');
  const offline = rows.filter((r) => r.st === 'off');
  const row = (r: (typeof rows)[number]) => (
    <div key={r.name} className={'mem-row' + (r.st === 'off' ? ' off' : '')}>
      <Av hue={r.hue} status={r.st} speaking={!!r.voice && r.name === 'Mira'} />
      <div>
        <b className={r.role}>{r.name}</b>
        {r.voice ? (
          <small key={r.voice} className="in-voice"><Ic d="speaker" />In {r.voice}</small>
        ) : (
          <small key={r.st}>{SUB[r.st]}</small>
        )}
      </div>
    </div>
  );
  return (
    <div className="mock m-members" ref={ref}>
      <div className="cat">Online — {online.length}</div>
      {online.map(row)}
      {offline.length > 0 && <div className="cat">Offline — {offline.length}</div>}
      {offline.map(row)}
    </div>
  );
}

// ---------- (e) watch together in a call ----------
export function WatchMock() {
  return (
    <div className="mock m-watch">
      <div className="screen-tile">
        <svg className="scene" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a1470" />
              <stop offset="1" stopColor="#ff7aa0" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill="url(#wsky)" />
          <circle cx="236" cy="56" r="22" fill="#ffe08a" />
          <circle cx="60" cy="30" r="1.6" fill="#fff" /><circle cx="120" cy="18" r="1.2" fill="#fff" /><circle cx="170" cy="44" r="1.4" fill="#fff" />
          <path className="hill-b" d="M0 130 Q80 90 160 124 T320 112 V180 H0Z" fill="#6d3fd0" />
          <path className="hill-f" d="M0 150 Q90 118 190 148 T320 140 V180 H0Z" fill="#3a1c8a" />
          <g className="otter">
            <ellipse cx="0" cy="0" rx="16" ry="12" fill="#c48a5a" />
            <circle cx="-6" cy="-3" r="2" fill="#1b1440" /><circle cx="6" cy="-3" r="2" fill="#1b1440" />
            <ellipse cx="0" cy="3" rx="4" ry="2.4" fill="#1b1440" />
          </g>
        </svg>
        <span className="chip-w"><Ic d="users" />Watching together · 5</span>
        <div className="player">
          <Ic d="play" />
          <div className="bar"><i /></div>
          <small>Space Otters · Ep. 4</small>
        </div>
        <div className="floaters" aria-hidden="true">
          {['😂', '💜', '🔥', '😱', '🍿', '😂'].map((e, i) => <span key={i} style={{ left: `${12 + i * 15}%`, animationDelay: `${i * 0.9}s` }}>{e}</span>)}
        </div>
      </div>
      <div className="watchers">
        {(['coral', 'amber', 'violet', 'mint', 'teal'] as Hue[]).map((h, i) => (
          <div key={h} className="w-tile"><Av hue={h} mood={i === 1 ? 'wow' : i === 3 ? 'grin' : 'happy'} speaking={i === 1} /></div>
        ))}
      </div>
    </div>
  );
}
