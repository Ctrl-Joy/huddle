// Soundboard playback. Built-in sounds are synthesized here with Web Audio (no audio files); uploaded
// sounds are fetched once, decoded and cached. Everything goes through one gain node set from the
// "Soundboard volume" preference. Fake-media mode (automated tests) stays silent.
import { getMediaPrefs } from '../components/settings/VoiceVideoSettings';
import { audioContext } from './audio';
import { fakeMediaEnabled } from './config';

export const DEFAULT_SOUNDBOARD_VOLUME = 60;

/** 0–100 from Voice & Video settings. */
export function soundboardVolume(): number {
  const v = getMediaPrefs().soundboardVolume;
  return typeof v === 'number' && v >= 0 && v <= 100 ? v : DEFAULT_SOUNDBOARD_VOLUME;
}

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** Gain node with a quick attack, a hold and an exponential release. */
function env(ctx: AudioContext, out: AudioNode, at: number, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(out);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, dest: AudioNode, at: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

function burst(ctx: AudioContext, dest: AudioNode, at: number, dur: number): void {
  const n = noise(ctx);
  n.connect(dest);
  n.start(at, Math.random());
  n.stop(at + dur + 0.05);
}

const SYNTHS: Record<string, Synth> = {
  // three brassy blasts of a detuned major chord
  fanfare: (ctx, out, t) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(out);
    const blasts: [number, number][] = [[0, 0.16], [0.22, 0.16], [0.44, 0.7]];
    for (const [off, len] of blasts) {
      const g = env(ctx, lp, t + off, 0.12, 0.02, len, 0.12);
      for (const f of [349.23, 440, 523.25, 698.46]) for (const d of [-6, 6]) osc(ctx, 'sawtooth', f, g, t + off, len + 0.15).detune.value = d;
    }
  },
  // snare-ish roll that swells, then a low hit with a splash
  drumroll: (ctx, out, t) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    bp.connect(out);
    const hits = 30;
    for (let i = 0; i < hits; i++) burst(ctx, env(ctx, bp, t + i * 0.045, 0.05 + 0.25 * (i / hits), 0.003, 0.005, 0.04), t + i * 0.045, 0.06);
    const end = t + hits * 0.045 + 0.05;
    const tom = env(ctx, out, end, 0.5, 0.005, 0.02, 0.45);
    const o = osc(ctx, 'sine', 160, tom, end, 0.5);
    o.frequency.exponentialRampToValueAtTime(60, end + 0.4);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    hp.connect(out);
    burst(ctx, env(ctx, hp, end, 0.35, 0.005, 0.05, 1.1), end, 1.2);
  },
  // lots of short filtered noise claps scattered over ~2 s
  applause: (ctx, out, t) => {
    for (let i = 0; i < 140; i++) {
      const at = t + Math.pow(Math.random(), 0.8) * 2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 1800;
      bp.Q.value = 1.2;
      bp.connect(out);
      const fade = 1 - Math.max(0, (at - t - 1.4) / 0.8);
      burst(ctx, env(ctx, bp, at, 0.3 * Math.max(0.15, fade), 0.002, 0.004, 0.05), at, 0.07);
    }
  },
  // springy wobble: a rising tone with a fast vibrato that dies out
  boing: (ctx, out, t) => {
    const g = env(ctx, out, t, 0.3, 0.01, 0.15, 0.55);
    const o = osc(ctx, 'triangle', 140, g, t, 0.75);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(90, t);
    depth.gain.exponentialRampToValueAtTime(1, t + 0.7);
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.8);
  },
  // bright bell: fundamental plus a few inharmonic partials
  ding: (ctx, out, t) => {
    const partials: [number, number, number][] = [[1318.5, 0.22, 1.6], [2637, 0.08, 1], [3620, 0.04, 0.6], [5274, 0.02, 0.35]];
    for (const [f, v, d] of partials) osc(ctx, 'sine', f, env(ctx, out, t, v, 0.004, 0, d), t, d);
  },
  // noise through a band-pass that sweeps up and back down
  whoosh: (ctx, out, t) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    bp.connect(g).connect(out);
    burst(ctx, bp, t, 1);
  },
  // four descending muted-brass notes, the last one long and wobbly
  womp: (ctx, out, t) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(out);
    const notes = [293.66, 277.18, 261.63, 246.94];
    notes.forEach((f, i) => {
      const at = t + i * 0.42;
      const last = i === notes.length - 1;
      const len = last ? 0.95 : 0.3;
      const o = osc(ctx, 'sawtooth', f, env(ctx, lp, at, 0.16, 0.04, len, 0.15), at, len + 0.2);
      if (last) {
        o.frequency.linearRampToValueAtTime(f * 0.94, at + len);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6;
        const depth = ctx.createGain();
        depth.gain.value = 7;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(at + 0.15);
        lfo.stop(at + len + 0.2);
      }
    });
  },
  // groups of quick high chirps, like a summer night
  crickets: (ctx, out, t) => {
    for (let group = 0; group < 4; group++) {
      const base = t + group * 0.55 + (group % 2) * 0.07;
      const f = 4300 + (group % 2) * 350;
      for (let p = 0; p < 4; p++) {
        const at = base + p * 0.035;
        osc(ctx, 'sine', f, env(ctx, out, at, 0.09, 0.004, 0.012, 0.01), at, 0.03);
      }
    }
  },
};

const decoded = new Map<string, Promise<AudioBuffer>>();
function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let p = decoded.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then((b) => ctx.decodeAudioData(b));
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
  }
  return p;
}

/**
 * Plays a soundboard sound locally. soundId "builtin:<key>" is synthesized; anything else needs url.
 * volume overrides the preference (0–100), e.g. for previews.
 */
export async function playSoundboardAudio(soundId: string, url: string | null, volume = soundboardVolume()): Promise<void> {
  if (fakeMediaEnabled() || volume <= 0) return;
  try {
    const ctx = audioContext();
    const master = ctx.createGain();
    master.gain.value = Math.pow(volume / 100, 2) * 1.6; // perceptual-ish curve
    master.connect(ctx.destination);
    const t = ctx.currentTime + 0.02;
    const synth = soundId.startsWith('builtin:') ? SYNTHS[soundId.slice(8)] : undefined;
    if (synth) {
      synth(ctx, master, t);
      setTimeout(() => master.disconnect(), 4000);
      return;
    }
    if (!url) return;
    const buf = await loadBuffer(ctx, url);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.onended = () => master.disconnect();
    src.start();
  } catch { /* audio unavailable or undecodable */ }
}

/** Decodes a local file to check it's playable and get its length (ms). */
export async function probeAudioFile(file: File): Promise<number> {
  const buf = await audioContext().decodeAudioData(await file.arrayBuffer());
  return buf.duration * 1000;
}
