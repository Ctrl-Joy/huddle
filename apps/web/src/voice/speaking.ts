// Voice activity detection: AnalyserNode RMS level with a short hold, polled on a timer.
import { audioContext } from './audio';

const THRESHOLD = 0.015; // RMS of float samples (≈ -36 dBFS)
const HOLD_MS = 250;
const POLL_MS = 50;

interface Watch {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  lastLoud: number;
  speaking: boolean;
  gate: () => boolean; // returns false to force "not speaking" (e.g. muted)
  onChange: (speaking: boolean) => void;
}

const watches = new Map<string, Watch>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  const now = performance.now();
  for (const w of watches.values()) {
    w.analyser.getFloatTimeDomainData(w.buf);
    let sum = 0;
    for (let i = 0; i < w.buf.length; i++) sum += w.buf[i] * w.buf[i];
    const rms = Math.sqrt(sum / w.buf.length);
    if (rms > THRESHOLD && w.gate()) w.lastLoud = now;
    const next = now - w.lastLoud < HOLD_MS;
    if (next !== w.speaking) { w.speaking = next; w.onChange(next); }
  }
}

/** Starts watching `stream` under `key` (replacing any previous watch for that key). */
export function watchSpeaking(key: string, stream: MediaStream, onChange: (s: boolean) => void, gate: () => boolean = () => true): void {
  unwatchSpeaking(key);
  if (!stream.getAudioTracks().length) return;
  try {
    const ctx = audioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // analysis only — never routed to the speakers
    watches.set(key, { source, analyser, buf: new Float32Array(analyser.fftSize), lastLoud: 0, speaking: false, gate, onChange });
    timer ??= setInterval(tick, POLL_MS);
  } catch (e) {
    console.warn('[voice] speaking detection unavailable', e);
  }
}

export function unwatchSpeaking(key: string): void {
  const w = watches.get(key);
  if (!w) return;
  watches.delete(key);
  try { w.source.disconnect(); } catch { /* ignore */ }
  if (w.speaking) w.onChange(false);
  if (!watches.size && timer) { clearInterval(timer); timer = null; }
}

export function unwatchAll(): void {
  for (const k of [...watches.keys()]) unwatchSpeaking(k);
}
