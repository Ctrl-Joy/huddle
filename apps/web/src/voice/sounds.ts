// Synthesized UI sounds for voice (no audio files): mute/deafen blips, incoming ringtone, outgoing ringback.
import { getNotifyPrefs } from '../lib/notifications';
import { audioContext } from './audio';
import { fakeMediaEnabled } from './config';

function tone(ctx: AudioContext, freq: number, at: number, dur: number, vol = 0.15, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  gain.gain.setValueAtTime(vol, at + Math.max(0.02, dur - 0.05));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function soundsOn(): boolean {
  if (fakeMediaEnabled()) return false; // automated tests: stay silent
  try { return getNotifyPrefs().sounds !== false; } catch { return true; }
}

export function playVoiceSound(kind: 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'join' | 'disconnect'): void {
  if (!soundsOn()) return;
  try {
    const ctx = audioContext();
    const t = ctx.currentTime + 0.01;
    const seq: [number, number][] =
      kind === 'mute' ? [[600, 0], [400, 0.07]]
      : kind === 'unmute' ? [[400, 0], [600, 0.07]]
      : kind === 'deafen' ? [[500, 0], [350, 0.07], [250, 0.14]]
      : kind === 'undeafen' ? [[250, 0], [350, 0.07], [500, 0.14]]
      : kind === 'join' ? [[523.25, 0], [659.25, 0.08], [783.99, 0.16]]
      : [[783.99, 0], [659.25, 0.08], [523.25, 0.16]];
    for (const [f, o] of seq) tone(ctx, f, t + o, 0.12, 0.12);
  } catch { /* audio unavailable */ }
}

/** Starts a looping ring; returns a stop function. 'incoming' = ringtone, 'outgoing' = ringback. */
export function startRing(kind: 'incoming' | 'outgoing'): () => void {
  if (!soundsOn()) return () => {};
  let stopped = false;
  const play = () => {
    if (stopped) return;
    try {
      const ctx = audioContext();
      const t = ctx.currentTime + 0.02;
      if (kind === 'incoming') {
        // two-tone trill, twice
        for (let i = 0; i < 2; i++) {
          tone(ctx, 784, t + i * 0.5, 0.18, 0.16, 'triangle');
          tone(ctx, 988, t + i * 0.5 + 0.2, 0.22, 0.16, 'triangle');
        }
      } else {
        // classic ringback: 440+480 Hz for 1s
        tone(ctx, 440, t, 1, 0.06);
        tone(ctx, 480, t, 1, 0.06);
      }
    } catch { /* audio unavailable */ }
  };
  play();
  const timer = setInterval(play, kind === 'incoming' ? 2000 : 3000);
  return () => { stopped = true; clearInterval(timer); };
}
