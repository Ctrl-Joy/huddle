// Desktop notifications, synthesized ping sound, and preference persistence.
const PREF_KEY = 'huddle.notify';

export interface NotifyPrefs { desktop: boolean; sounds: boolean }

export function getNotifyPrefs(): NotifyPrefs {
  try { return { desktop: true, sounds: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { desktop: true, sounds: true }; }
}
export function setNotifyPrefs(p: Partial<NotifyPrefs>) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...getNotifyPrefs(), ...p })); } catch { /* ignore */ }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

let ctx: AudioContext | null = null;
let lastPing = 0;

/** Short two-tone "ping" synthesized with WebAudio — no audio files. */
export function playPing(kind: 'message' | 'join' | 'leave' | 'ring' = 'message') {
  if (!getNotifyPrefs().sounds) return;
  try { if (localStorage.getItem('huddle.fakeMedia') === '1') return; } catch { /* ignore */ } // silent automated voice tests
  const now = Date.now();
  if (now - lastPing < 400 && kind === 'message') return;
  lastPing = now;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const tones: [number, number][] =
      kind === 'join' ? [[523.25, 0], [783.99, 0.08]]
      : kind === 'leave' ? [[783.99, 0], [523.25, 0.08]]
      : kind === 'ring' ? [[659.25, 0], [880, 0.15], [659.25, 0.3]]
      : [[880, 0], [1318.5, 0.07]];
    for (const [freq, offset] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.25);
    }
  } catch { /* audio unavailable */ }
}

export function showDesktopNotification(title: string, body: string, opts: { icon?: string; tag?: string; onClick?: () => void } = {}) {
  if (!getNotifyPrefs().desktop) return;
  if (notificationPermission() !== 'granted') return;
  try {
    const n = new Notification(title, { body: body.slice(0, 200), icon: opts.icon || '/favicon.svg', tag: opts.tag, silent: true });
    n.onclick = () => { window.focus(); opts.onClick?.(); n.close(); };
    setTimeout(() => n.close(), 6000);
  } catch { /* ignore */ }
}
