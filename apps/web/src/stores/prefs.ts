// Local display preferences (accessibility, chat layout, clock). Persisted in localStorage and applied to <html>.
import { create } from 'zustand';

export type MotionPref = 'auto' | 'on' | 'off';
export type MessageDisplay = 'cozy' | 'compact';
export type ClockPref = '12h' | '24h';

export interface Prefs {
  /** chat message font size in px */
  fontSize: number;
  reduceMotion: MotionPref;
  underlineLinks: boolean;
  messageDisplay: MessageDisplay;
  /** render image / video attachments inline (off = show them as file cards) */
  inlineMedia: boolean;
  clock: ClockPref;
}

export const FONT_MIN = 12;
export const FONT_MAX = 20;
export const FONT_DEFAULT = 15;

const KEY = 'huddle.prefs';
const DEFAULTS: Prefs = { fontSize: FONT_DEFAULT, reduceMotion: 'auto', underlineLinks: false, messageDisplay: 'cozy', inlineMedia: true, clock: '12h' };

function load(): Prefs {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } as Prefs;
    p.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Number(p.fontSize) || FONT_DEFAULT));
    return p;
  } catch { return { ...DEFAULTS }; }
}

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function applyPrefs(p: Prefs = usePrefs.getState()) {
  const el = document.documentElement;
  el.style.setProperty('--chat-font-size', `${p.fontSize}px`);
  el.classList.toggle('reduce-motion', p.reduceMotion === 'on' || (p.reduceMotion === 'auto' && !!motionQuery?.matches));
  el.classList.toggle('underline-links', p.underlineLinks);
  el.classList.toggle('compact-messages', p.messageDisplay === 'compact');
}

interface PrefsState extends Prefs { set(p: Partial<Prefs>): void; reset(): void }

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, reset: _r, ...rest } = get();
    try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* ignore */ }
    applyPrefs(rest);
  },
  reset: () => get().set(DEFAULTS),
}));

/** Apply stored preferences on app start and follow the OS reduced-motion setting while on "Auto". */
export function installPrefs() {
  applyPrefs();
  motionQuery?.addEventListener?.('change', () => applyPrefs());
}
