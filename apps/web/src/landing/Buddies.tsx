import { useId, type CSSProperties } from 'react';

/** Huddle's own cast: round "blob buddies" drawn from scratch as inline SVG. */
export const HUES = {
  teal: ['#5df2d6', '#12a893'],
  coral: ['#ffa08f', '#ea5470'],
  amber: ['#ffe08a', '#f39b2f'],
  violet: ['#c4b1ff', '#7a55f2'],
  mint: ['#a6f7b4', '#36c46f'],
  sky: ['#9ed8ff', '#3a86f0'],
  pink: ['#ffb3dc', '#e85aaa'],
} as const;
export type Hue = keyof typeof HUES;
export type Mood = 'happy' | 'grin' | 'wow' | 'confused' | 'sleepy' | 'wink';
export type Topper = 'none' | 'headset' | 'sprout' | 'antenna' | 'bow' | 'beanie';

const INK = '#1b1440';

function Face({ mood }: { mood: Mood }) {
  const eye = (cx: number) => (
    <g>
      <ellipse cx={cx} cy="64" rx="5" ry="6.6" fill={INK} />
      <circle cx={cx + 1.8} cy="61.6" r="1.9" fill="#fff" />
    </g>
  );
  const arc = (cx: number, up = false) => (
    <path d={up ? `M${cx - 6} 66 q6 -7 12 0` : `M${cx - 6} 63 q6 6 12 0`} stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none" />
  );
  let eyes;
  let mouth;
  switch (mood) {
    case 'grin':
      eyes = <>{eye(46)}{eye(74)}</>;
      mouth = (
        <g>
          <path d="M47 79 Q60 97 73 79 Z" fill={INK} strokeLinejoin="round" stroke={INK} strokeWidth="2" />
          <ellipse cx="60" cy="88" rx="6" ry="3.4" fill="#ff7aa0" />
        </g>
      );
      break;
    case 'wow':
      eyes = <>{eye(46)}{eye(74)}</>;
      mouth = <ellipse cx="60" cy="85" rx="5.5" ry="7" fill={INK} />;
      break;
    case 'confused':
      eyes = (
        <>
          <ellipse cx="46" cy="65" rx="4.2" ry="5.4" fill={INK} />
          <ellipse cx="74" cy="63" rx="5.8" ry="7.4" fill={INK} />
          <circle cx="76" cy="60.4" r="2" fill="#fff" />
          <path d="M67 50 q8 -5 15 -1" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d="M40 55 l12 2" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        </>
      );
      mouth = <path d="M48 86 q4 -5 8 0 t8 0 t8 0" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />;
      break;
    case 'sleepy':
      eyes = <>{arc(46)}{arc(74)}</>;
      mouth = <ellipse cx="60" cy="84" rx="3.6" ry="3" fill={INK} />;
      break;
    case 'wink':
      eyes = <>{eye(46)}{arc(74, true)}</>;
      mouth = <path d="M50 80 Q60 90 70 80" stroke={INK} strokeWidth="3.8" strokeLinecap="round" fill="none" />;
      break;
    default:
      eyes = <>{eye(46)}{eye(74)}</>;
      mouth = <path d="M50 80 Q60 90 70 80" stroke={INK} strokeWidth="3.8" strokeLinecap="round" fill="none" />;
  }
  return (
    <g className="b-face">
      <g className="b-eyes">{eyes}</g>
      <ellipse cx="34" cy="78" rx="6.5" ry="4" fill="#ff5f8f" opacity=".42" />
      <ellipse cx="86" cy="78" rx="6.5" ry="4" fill="#ff5f8f" opacity=".42" />
      {mouth}
    </g>
  );
}

function TopperArt({ kind, dark }: { kind: Topper; dark: string }) {
  switch (kind) {
    case 'headset':
      return (
        <g className="b-headset">
          <path d="M16 64 C16 -12 104 -12 104 64" stroke="#2b2259" strokeWidth="7" fill="none" strokeLinecap="round" />
          <rect x="5" y="52" width="16" height="28" rx="7" fill="#2b2259" />
          <rect x="99" y="52" width="16" height="28" rx="7" fill="#2b2259" />
          <rect x="8" y="57" width="4" height="18" rx="2" fill="#5df2d6" />
          <rect x="108" y="57" width="4" height="18" rx="2" fill="#5df2d6" />
          <path d="M13 79 q2 22 28 21" stroke="#2b2259" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="42" cy="100" r="5" fill="#5df2d6" />
        </g>
      );
    case 'sprout':
      return (
        <g className="b-sprout">
          <path d="M60 16 q-1 -9 3 -15" stroke="#36c46f" strokeWidth="3.6" fill="none" strokeLinecap="round" />
          <ellipse cx="53" cy="0" rx="9" ry="5" fill="#5ee08a" transform="rotate(-25 53 0)" />
          <ellipse cx="71" cy="-3" rx="9" ry="5" fill="#36c46f" transform="rotate(30 71 -3)" />
        </g>
      );
    case 'antenna':
      return (
        <g className="b-antenna">
          <path d="M60 15 L60 -2" stroke={dark} strokeWidth="3.6" strokeLinecap="round" />
          <circle cx="60" cy="-5" r="6" fill="#ffe08a" />
          <circle cx="58" cy="-7" r="2" fill="#fff" opacity=".8" />
        </g>
      );
    case 'bow':
      return (
        <g>
          <path d="M80 20 l-14 -10 v20 z" fill="#ff5f8f" />
          <path d="M80 20 l14 -10 v20 z" fill="#ff5f8f" />
          <circle cx="80" cy="20" r="5" fill="#ff8fb0" />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d="M22 40 C26 6 94 6 98 40 Z" fill="#6d5bff" />
          <rect x="18" y="34" width="84" height="12" rx="6" fill="#8f80ff" />
          <circle cx="60" cy="4" r="8" fill="#ffe08a" />
        </g>
      );
    default:
      return null;
  }
}

interface BuddyProps {
  hue?: Hue;
  mood?: Mood;
  topper?: Topper;
  wave?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Buddy({ hue = 'teal', mood = 'happy', topper = 'none', wave = false, className, style }: BuddyProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [light, dark] = HUES[hue];
  return (
    <svg className={'buddy' + (className ? ' ' + className : '')} style={style} viewBox="-6 -16 132 150" aria-hidden="true">
      <defs>
        <radialGradient id={`bg${id}`} cx="36%" cy="28%" r="80%">
          <stop offset="0" stopColor={light} />
          <stop offset=".95" stopColor={dark} />
        </radialGradient>
      </defs>
      <ellipse className="b-shadow" cx="60" cy="129" rx="40" ry="4.5" fill="#000" opacity=".22" />
      <ellipse cx="43" cy="122" rx="13" ry="7.5" fill={dark} />
      <ellipse cx="77" cy="122" rx="13" ry="7.5" fill={dark} />
      <path d="M20 80 q-13 6 -11 21" stroke={dark} strokeWidth="11" strokeLinecap="round" fill="none" />
      {wave ? (
        <path className="b-wave" d="M100 76 q15 -8 14 -30" stroke={dark} strokeWidth="11" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M100 80 q13 6 11 21" stroke={dark} strokeWidth="11" strokeLinecap="round" fill="none" />
      )}
      <path d="M60 14 C95 14 109 42 109 74 C109 108 88 122 60 122 C32 122 11 108 11 74 C11 42 25 14 60 14Z" fill={`url(#bg${id})`} />
      <ellipse cx="38" cy="36" rx="14" ry="7.5" fill="#fff" opacity=".38" transform="rotate(-28 38 36)" />
      <ellipse cx="60" cy="104" rx="25" ry="11" fill="#fff" opacity=".1" />
      <Face mood={mood} />
      <TopperArt kind={topper} dark={dark} />
    </svg>
  );
}

/** Huddle's mascot: the teal buddy in a headset. */
export function Huddy(props: Omit<BuddyProps, 'hue' | 'topper'>) {
  return <Buddy hue="teal" topper="headset" {...props} />;
}

/** A small round face for avatars inside product mocks. */
export function FaceAvatar({ hue, mood = 'happy' }: { hue: Hue; mood?: Mood }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [light, dark] = HUES[hue];
  return (
    <svg className="fav" viewBox="10 22 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`fa${id}`} cx="36%" cy="28%" r="85%">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx="60" cy="72" r="50" fill={`url(#fa${id})`} />
      <Face mood={mood} />
    </svg>
  );
}

/** Decorative 3D-ish objects. */
export function Cube({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={'deco cube' + (className ? ' ' + className : '')} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 8 88 28 50 48 12 28Z" fill="#ffe08a" />
      <path d="M12 28 50 48v44L12 72Z" fill="#f39b2f" />
      <path d="M88 28 50 48v44l38-20Z" fill="#d9761f" />
      <path d="M50 8 88 28 50 48 12 28Z" fill="#fff" opacity=".18" />
    </svg>
  );
}

export function Orb({ hue = 'violet', className, style }: { hue?: Hue; className?: string; style?: CSSProperties }) {
  const [light, dark] = HUES[hue];
  return (
    <span
      className={'deco orb' + (className ? ' ' + className : '')}
      style={{ ...style, background: `radial-gradient(circle at 32% 28%, #fff 0 6%, ${light} 22%, ${dark} 70%, #241466 100%)` }}
      aria-hidden="true"
    />
  );
}

export function Sparkle({ className, style, color = '#fff' }: { className?: string; style?: CSSProperties; color?: string }) {
  return (
    <svg className={'deco sparkle' + (className ? ' ' + className : '')} style={style} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 0C22 13 27 18 40 20 27 22 22 27 20 40 18 27 13 22 0 20 13 18 18 13 20 0Z" fill={color} />
    </svg>
  );
}

export function Ring({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={'deco ring' + (className ? ' ' + className : '')} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="36" fill="none" stroke="#ff8fc8" strokeWidth="14" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="#fff" strokeWidth="4" opacity=".35" strokeDasharray="30 200" strokeLinecap="round" transform="rotate(200 50 50)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="20" r="10" fill="currentColor" opacity="0.95" />
      <circle cx="30" cy="20" r="10" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="30" r="10" fill="currentColor" opacity="0.35" />
      <path d="M12 30 9 38l8-4" fill="currentColor" opacity="0.95" />
    </svg>
  );
}
