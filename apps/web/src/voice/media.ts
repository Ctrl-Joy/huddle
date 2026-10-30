// Local media acquisition: microphone, camera, screen — with a dev-only synthetic path
// (localStorage['huddle.fakeMedia'] = '1') for environments without devices.
import { getMediaPrefs } from '../components/settings/VoiceVideoSettings';
import { audioContext } from './audio';
import { fakeMediaEnabled } from './config';

const cleanups = new WeakMap<MediaStream, () => void>();

/** Stops every track of a stream and any synthetic generator behind it. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
  cleanups.get(stream)?.();
  cleanups.delete(stream);
}

export async function getMicrophone(): Promise<MediaStream> {
  if (fakeMediaEnabled()) return fakeMic();
  const { inputDeviceId } = getMediaPrefs();
  const base: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: inputDeviceId ? { ...base, deviceId: { exact: inputDeviceId } } : base });
  } catch (e) {
    // chosen device vanished → fall back to the default one
    if (inputDeviceId && (e as DOMException)?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: base });
    }
    throw e;
  }
}

export async function getCamera(label: string): Promise<MediaStream> {
  if (fakeMediaEnabled()) return fakeVideo(label, 'camera');
  const { videoDeviceId } = getMediaPrefs();
  const base: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: videoDeviceId ? { ...base, deviceId: { exact: videoDeviceId } } : base });
  } catch (e) {
    if (videoDeviceId && (e as DOMException)?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ video: base });
    }
    throw e;
  }
}

export async function getScreen(label: string): Promise<MediaStream> {
  if (fakeMediaEnabled()) return fakeVideo(label, 'screen');
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
}

// ---------------------------------------------------------------------------------------------
// Synthetic media (dev/testing only)

/** A 440 Hz tone gated on/off ~0.7 s so speaking detection visibly toggles. */
function fakeMic(): MediaStream {
  const ctx = audioContext();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  const amp = ctx.createGain();
  amp.gain.value = 0.25;
  const gate = ctx.createGain();
  gate.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.7;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(gate.gain);
  osc.connect(amp).connect(gate).connect(dest);
  osc.start(); lfo.start();
  const stream = dest.stream;
  cleanups.set(stream, () => { try { osc.stop(); lfo.stop(); gate.disconnect(); } catch { /* ignore */ } });
  return stream;
}

function fakeVideo(label: string, kind: 'camera' | 'screen'): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'camera' ? 640 : 1280;
  canvas.height = kind === 'camera' ? 360 : 720;
  const g = canvas.getContext('2d')!;
  let frame = 0;
  const draw = () => {
    frame++;
    const { width: w, height: h } = canvas;
    if (kind === 'camera') {
      const hue = (frame * 3) % 360;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue},70%,45%)`);
      grad.addColorStop(1, `hsl(${(hue + 120) % 360},70%,30%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      g.arc(w / 2 + Math.cos(frame / 12) * w * 0.3, h / 2 + Math.sin(frame / 9) * h * 0.25, 40, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#1e1f22';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3b3d44';
      for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = '#5865f2';
      g.fillRect((frame * 8) % w, h / 2 - 40, 160, 80);
    }
    g.fillStyle = '#fff';
    g.font = `bold ${kind === 'camera' ? 32 : 56}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(kind === 'camera' ? label : `${label}'s screen`, w / 2, h - (kind === 'camera' ? 30 : 60));
    g.font = '20px monospace';
    g.fillText(new Date().toLocaleTimeString(), w / 2, 40);
  };
  draw();
  // setInterval (not rAF) so frames keep flowing while the tab is in the background
  const timer = setInterval(draw, 1000 / 15);
  const stream = canvas.captureStream(15);
  cleanups.set(stream, () => clearInterval(timer));
  return stream;
}
