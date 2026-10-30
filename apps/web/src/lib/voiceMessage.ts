// Voice-message helpers: recorder (MediaRecorder over the shared mic helper, so 'huddle.fakeMedia' works),
// waveform computation (~64 amplitude bytes, base64) and decoding for the player.
import { LIMITS } from '@huddle/shared';
import { getMicrophone, stopStream } from '../voice/media';
import { audioContext } from '../voice/audio';

export const WAVEFORM_SAMPLES = 64;
const MIME_PREFS = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

export interface Recording { blob: Blob; durationSecs: number; waveform: string }

/** Downsamples amplitudes (any scale) to `n` bytes normalised to 0–255, base64-encoded. */
export function encodeWaveform(levels: number[], n = WAVEFORM_SAMPLES): string {
  if (!levels.length) return '';
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * levels.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    out.push(peak);
  }
  const max = Math.max(...out) || 1;
  return btoa(String.fromCharCode(...out.map((v) => Math.round((v / max) * 255))));
}

/** Waveform bytes → `bars` heights in 0–1 (flat placeholder when missing). */
export function decodeWaveform(b64: string | null | undefined, bars = 40): number[] {
  let bytes: number[] = [];
  try { bytes = b64 ? Array.from(atob(b64), (c) => c.charCodeAt(0)) : []; } catch { bytes = []; }
  if (!bytes.length) return new Array(bars).fill(0.25);
  return Array.from({ length: bars }, (_, i) => {
    const v = bytes[Math.min(bytes.length - 1, Math.floor((i * bytes.length) / bars))];
    return Math.max(0.08, v / 255);
  });
}

/** RMS per chunk of the decoded audio; null if the browser can't decode its own recording. */
async function waveformFromBlob(blob: Blob): Promise<string | null> {
  try {
    const buf = await audioContext().decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const chunk = Math.max(1, Math.floor(data.length / (WAVEFORM_SAMPLES * 4)));
    const levels: number[] = [];
    for (let i = 0; i < data.length; i += chunk) {
      let sum = 0;
      const end = Math.min(data.length, i + chunk);
      for (let j = i; j < end; j++) sum += data[j] * data[j];
      levels.push(Math.sqrt(sum / (end - i)));
    }
    return encodeWaveform(levels);
  } catch {
    return null;
  }
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sampler: ReturnType<typeof setInterval> | null = null;
  private limit: ReturnType<typeof setTimeout> | null = null;
  /** Live levels (0–1) sampled every 100 ms — drives the recording meter and is the waveform fallback. */
  levels: number[] = [];
  onLevel?: (level: number) => void;
  /** Called when the 3-minute cap stops the recording by itself. */
  onLimit?: () => void;

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices;
  }

  async start(): Promise<void> {
    this.stream = await getMicrophone();
    const mimeType = MIME_PREFS.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = Date.now();
    try {
      const ctx = audioContext();
      this.source = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.source.connect(this.analyser);
      const buf = new Float32Array(this.analyser.fftSize);
      this.sampler = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        this.levels.push(level);
        this.onLevel?.(level);
      }, 100);
    } catch { /* metering is cosmetic */ }
    this.limit = setTimeout(() => this.onLimit?.(), LIMITS.VOICE_MESSAGE_SECS * 1000);
  }

  elapsed(): number { return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0; }

  /** Stops and returns the recording (null if it was too short to be useful). */
  async stop(): Promise<Recording | null> {
    const rec = this.rec;
    const durationSecs = Math.min(LIMITS.VOICE_MESSAGE_SECS, this.elapsed());
    if (!rec) return null;
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    const type = rec.mimeType || this.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.chunks, { type: type.split(';')[0] });
    const live = [...this.levels];
    this.cleanup();
    if (durationSecs < 0.5 || !blob.size) return null;
    const waveform = (await waveformFromBlob(blob)) ?? encodeWaveform(live);
    return { blob, durationSecs: Math.round(durationSecs * 100) / 100, waveform };
  }

  cancel(): void {
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch { /* ignore */ }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.sampler) clearInterval(this.sampler);
    if (this.limit) clearTimeout(this.limit);
    this.sampler = this.limit = null;
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.source = null;
    this.analyser = null;
    stopStream(this.stream);
    this.stream = null;
    this.rec = null;
  }
}

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
