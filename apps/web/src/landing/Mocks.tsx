import { useEffect, useRef, useState, type RefObject } from 'react';
import { FaceAvatar, Logo, type Hue } from './Buddies';

/* Live mini-mocks of Huddle's own UI, built from styled divs. Everything is sized in em,
   so each mock scales with the font-size its container gives it. Feature-card mocks are
   small scripted "stories": a step index advanced by timers drives which parts are shown. */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True while the element is on screen and the tab is visible. */
function useLive<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(false);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    const onVis = () => setShown(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [ref]);
  return inView && shown;
}

/**
 * Loops through `durations` (ms per step) while live. `n` counts up forever, `step` is n mod length.
 * With reduced motion the loop freezes on `still`.
 */
function useLoop<T extends Element>(ref: RefObject<T | null>, durations: number[], still = 0) {
  const live = useLive(ref);
  const [n, setN] = useState(() => (reduced() ? still : 0));
  const key = durations.join(',');
  useEffect(() => {
    if (!live || reduced()) return;
    const t = window.setTimeout(() => setN((s) => s + 1), durations[n % durations.length]);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, n, key]);
  return { n, step: n % durations.length, live };
}

const on = (cond: boolean, base: string) => base + (cond ? ' on' : '');

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

// ---------- (a) flair: chat, emoji upload, reactions, stickers, toast ----------
// steps: 0 blank · 1-3 messages · 4 upload pill · 5 reactions fly out · 6-7 counts tick · 8 stickers · 9 toast · 10 fade
const FLAIR = [700, 650, 650, 800, 900, 1100, 700, 700, 1500, 2200, 800];
const STICKERS: { hue: Hue; mood: 'grin' | 'wink' | 'wow' | 'happy' }[] = [
  { hue: 'coral', mood: 'grin' }, { hue: 'amber', mood: 'wow' }, { hue: 'violet', mood: 'wink' }, { hue: 'mint', mood: 'happy' },
];

export function FlairStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, live } = useLoop(ref, FLAIR, 9);
  const shown = step > 0 && step < 10;
  const bump = step >= 6 && step < 10 ? Math.min(step - 5, 3) : 0;
  return (
    <div className="story s-flair" ref={ref} data-live={live} data-step={step}>
      <div className="st-phone">
        <div className="sp-head"><Ic d="hash" /><b>memes</b><span className="sp-count">5 online</span></div>
        <div className="chatwin">
          <div className={on(step >= 8 && step < 10, 'chat-track')}>
            <div className={on(shown && step >= 1, 'msg st-msg')}><Av hue="violet" /><div><p className="who c-violet">Pip</p><p>I FINALLY beat the boss!!!</p></div></div>
            <div className={on(shown && step >= 2, 'msg st-msg')}><Av hue="coral" /><div><p className="who c-coral">Mira</p><p>no way 😱 screenshot or it didn’t happen</p></div></div>
            <div className={on(shown && step >= 3, 'msg st-msg')}><Av hue="amber" /><div><p className="who c-amber">Juno</p><p>this calls for a custom emoji</p></div></div>
            <div className={on(step >= 8 && step < 10, 'stickers')}>
              {STICKERS.map((s, i) => <span key={s.hue} style={{ transitionDelay: `${0.08 * i}s` }}><FaceAvatar hue={s.hue} mood={s.mood} /></span>)}
            </div>
          </div>
        </div>
        <div className="sp-comp">Message #memes<Ic d="smile" /></div>
      </div>
      <span className={on(step >= 4 && step < 10, 'st-pill st-upload')}><Ic d="plus" />Upload emoji</span>
      <div className="st-reacts">
        {['🔥', '😂', '🎉'].map((e, i) => (
          <span key={e} className={on(step >= 5 && step < 10, 'st-react r' + i)}>
            <i>{e}</i><b key={bump}>{[12, 8, 5][i] + bump}</b>
          </span>
        ))}
      </div>
      <div className={on(step === 9, 'st-toast')}>
        <Av hue="amber" mood="grin" />
        <div><b>Juno reacted 🔥</b><small>to your message in #memes</small></div>
      </div>
    </div>
  );
}

// ---------- (b) call: tiles cross-fade between buddies, watch-together chip, invite pill ----------
const TILE_SETS: Hue[][] = [['coral', 'mint', 'violet'], ['amber', 'pink', 'sky'], ['sky', 'teal', 'pink'], ['violet', 'amber', 'mint']];
const NAMES: Record<Hue, string> = { coral: 'Mira', amber: 'Juno', violet: 'Pip', mint: 'Bo', sky: 'Kit', teal: 'Tam', pink: 'Lu' };

export function CallStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { n, live } = useLoop(ref, [425], 6);
  const idx = TILE_SETS.map((_, k) => Math.floor((n + 4 - k) / 4) % 3);
  const talking = Math.floor(n / 6) % 4;
  const invite = n % 16 >= 4 && n % 16 < 11;
  return (
    <div className="story s-call" ref={ref} data-live={live}>
      <div className="st-phone call-phone">
        <div className="sp-head"><Ic d="speaker" /><b>Lounge</b><span className="sp-count">4 here</span></div>
        <div className="sp-grid">
          {TILE_SETS.map((set, k) => (
            <div key={k} className={'sp-tile' + (talking === k ? ' talking' : '')}>
              {set.map((h, j) => (
                <div key={h} className={on(idx[k] === j, 'sp-face h-' + h)}>
                  <Av hue={h} mood={j === 1 ? 'grin' : 'happy'} />
                  <small>{NAMES[h]}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ph-ctl"><span><Ic d="mic" /></span><span><Ic d="cam" /></span><span><Ic d="screen" /></span><span className="red"><Ic d="leave" /></span></div>
      </div>
      <div className="st-media">
        <span className="sm-play"><Ic d="play" /></span>
        <div><b>Watch together</b><small>Space Otters · Ep. 4</small><span className="sm-bar"><i /></span></div>
      </div>
      <span className={on(invite, 'st-pill st-invite')}><Ic d="plus" />Invite a friend</span>
    </div>
  );
}

// ---------- (c) drop in: hover → click → join → talk → leave ----------
const DROP = [900, 1000, 320, 900, 2400, 1100];

export function DropInStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, live } = useLoop(ref, DROP, 4);
  return (
    <div className="mock m-drop" data-s={step} data-live={live} ref={ref}>
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
      <div className="vu you"><Av hue="teal" speaking={step === 4} />you</div>
      <div className="connected">
        <span className="sig"><i /><i /><i /></span>
        <div><b>{step === 5 ? 'Disconnected' : step >= 3 ? 'Voice connected' : 'Not in voice'}</b><small>Study Hall / Night Owls</small></div>
        <Ic d="leave" />
      </div>
    </div>
  );
}

// ---------- (d) members: cursor visits members, profile popout ----------
const MEMBERS: { name: string; hue: Hue; role: string; st: 'on' | 'idle' | 'dnd'; line: string; voice?: string; cta: string }[] = [
  { name: 'Mira', hue: 'coral', role: 'c-coral', st: 'on', line: 'In Lounge', voice: 'Lounge', cta: 'Join Lounge' },
  { name: 'Juno', hue: 'amber', role: 'c-amber', st: 'idle', line: 'brb, snack run', cta: 'Say hi' },
  { name: 'Pip', hue: 'violet', role: 'c-violet', st: 'dnd', line: 'focus mode until 6', cta: 'Leave a note' },
  { name: 'Bo', hue: 'mint', role: 'c-mint', st: 'on', line: 'In Game Night', voice: 'Game Night', cta: 'Join Game Night' },
  { name: 'Kit', hue: 'sky', role: 'c-sky', st: 'on', line: 'up for anything', cta: 'Say hi' },
];
const STOPS = [0, 3, 1, 4];
const BANNER: Record<Hue, string> = {
  coral: 'linear-gradient(120deg,#ff9a8a,#ff5f8f)', amber: 'linear-gradient(120deg,#ffe08a,#f39b2f)',
  violet: 'linear-gradient(120deg,#c4b1ff,#7a55f2)', mint: 'linear-gradient(120deg,#a6f7b4,#14b8a6)',
  sky: 'linear-gradient(120deg,#9ed8ff,#3a86f0)', teal: '', pink: '',
};

export function MembersStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { n, live } = useLoop(ref, [650, 1500], 1);
  const step = n % (STOPS.length * 2);
  const stopI = Math.floor(step / 2) % STOPS.length;
  const showing = step % 2 === 1;
  const row = STOPS[stopI];
  const shownRow = showing ? row : STOPS[(stopI + STOPS.length - 1) % STOPS.length];
  const m = MEMBERS[shownRow];
  return (
    <div className="story s-members" ref={ref} data-live={live}>
      <div className="mock mem-list">
        <div className="cat">Online — 5</div>
        {MEMBERS.map((p, i) => (
          <div key={p.name} className={'mem-row' + (showing && i === row ? ' hot' : '')}>
            <Av hue={p.hue} status={p.st} speaking={!!p.voice} />
            <div>
              <b className={p.role}>{p.name}</b>
              <small className={p.voice ? 'in-voice' : ''}>{p.voice && <Ic d="speaker" />}{p.line}</small>
            </div>
          </div>
        ))}
        <svg className="cursor" style={{ transform: `translate3d(0, ${row * 3.3}em, 0)` }} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#1b1440" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div className={on(showing, 'popout')} style={{ top: `${Math.min(1.2 + shownRow * 3.3, 8.6)}em` }}>
        <div className="po-banner" style={{ background: BANNER[m.hue] }} />
        <Av hue={m.hue} status={m.st} />
        <b>{m.name}</b>
        <small className={m.voice ? 'in-voice' : ''}>{m.voice && <Ic d="speaker" />}{m.line}</small>
        <span className="po-btn">{m.cta}</span>
      </div>
    </div>
  );
}

// ---------- (e) watch together: progress, rising reactions, chat bubbles ----------
const BUBBLES: { hue: Hue; name: string; text: string }[] = [
  { hue: 'coral', name: 'Mira', text: 'the otter is SO smug 😂' },
  { hue: 'mint', name: 'Bo', text: 'pause! snack break' },
  { hue: 'violet', name: 'Pip', text: 'best episode yet 💜' },
];

export function WatchStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, live } = useLoop(ref, [2600, 2600, 2600], 0);
  const b = BUBBLES[step];
  return (
    <div className="mock m-watch" ref={ref} data-live={live}>
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
          <path d="M0 130 Q80 90 160 124 T320 112 V180 H0Z" fill="#6d3fd0" />
          <path d="M0 150 Q90 118 190 148 T320 140 V180 H0Z" fill="#3a1c8a" />
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
          {['😂', '💜', '🔥', '😱', '🍿', '😂'].map((e, i) => <span key={i} style={{ left: `${10 + i * 14}%`, animationDelay: `${i * 0.9}s` }}>{e}</span>)}
        </div>
        <div className="w-bubble" key={step}>
          <Av hue={b.hue} />
          <div><b className={'c-' + b.hue}>{b.name}</b><p>{b.text}</p></div>
        </div>
      </div>
      <div className="watchers">
        {(['coral', 'amber', 'violet', 'mint', 'teal'] as Hue[]).map((h, i) => (
          <div key={h} className="w-tile"><Av hue={h} mood={i === 1 ? 'wow' : i === 3 ? 'grin' : 'happy'} speaking={h === b.hue} /></div>
        ))}
      </div>
    </div>
  );
}
