import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Attachment } from '@huddle/shared';
import { sendVoiceMessage } from '../../lib/actions';
import { VoiceRecorder, decodeWaveform, formatClock } from '../../lib/voiceMessage';
import { toast } from '../../stores/ui';
import { errorMessage } from '../../api/client';
import { Tooltip } from '../common/Avatar';
import { IconMic, IconPause, IconPlay, IconSend, IconTrash } from '../common/icons';

const BARS = 40;
let current: HTMLAudioElement | null = null; // one voice message plays at a time

/** Play/pause pill with waveform progress and duration. */
export function VoiceMessagePlayer({ a }: { a: Attachment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const bars = useMemo(() => decodeWaveform(a.waveform, BARS), [a.waveform]);
  const duration = a.duration_secs || 0;
  const progress = duration ? Math.min(1, time / duration) : 0;

  useEffect(() => () => { if (current === audio.current) current = null; }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (current && current !== el) current.pause();
      current = el;
      void el.play().catch(() => toast('Could not play this voice message', 'error'));
    } else el.pause();
  };
  const seek = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    setTime(el.currentTime);
  };

  return (
    <div className={'voice-msg' + (playing ? ' playing' : '')}>
      <button className="voice-msg-play" aria-label={playing ? 'Pause voice message' : 'Play voice message'} onClick={toggle}>
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <div className="voice-msg-wave" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}
        onPointerDown={seek}
        onKeyDown={(e) => {
          const el = audio.current;
          if (!el) return;
          if (e.key === 'ArrowRight') el.currentTime = Math.min(duration, el.currentTime + 5);
          if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5);
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        }}>
        {bars.map((h, i) => <i key={i} className={(i + 0.5) / BARS <= progress ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%` }} />)}
      </div>
      <span className="voice-msg-time">{formatClock(playing || time ? time : duration)}</span>
      <audio ref={audio} src={a.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
    </div>
  );
}

type RecState = 'idle' | 'starting' | 'recording' | 'sending';
const HOLD_MS = 350;

/**
 * Composer mic: tap to start (then Send / Cancel), or press and hold to talk and release to send.
 * While active it renders the recording bar in place of the text box (see Composer).
 */
export function useVoiceRecording(channelId: string) {
  const recorder = useRef<VoiceRecorder | null>(null);
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const pressedAt = useRef(0);
  const sendRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed(recorder.current?.elapsed() ?? 0), 200);
    return () => clearInterval(t);
  }, [state]);
  // leaving the channel throws the recording away
  useEffect(() => () => recorder.current?.cancel(), [channelId]);

  const start = async () => {
    if (state !== 'idle') return;
    if (!VoiceRecorder.supported()) { toast('Recording is not supported in this browser', 'error'); return; }
    const r = new VoiceRecorder();
    recorder.current = r;
    r.onLevel = setLevel;
    r.onLimit = () => sendRef.current();
    setState('starting');
    setElapsed(0);
    try {
      await r.start();
      if (recorder.current !== r) { r.cancel(); return; }
      setState('recording');
    } catch (e) {
      recorder.current = null;
      setState('idle');
      toast((e as DOMException)?.name === 'NotAllowedError' ? 'Microphone access was blocked' : 'Could not start recording: ' + errorMessage(e), 'error');
    }
  };
  const cancel = () => {
    recorder.current?.cancel();
    recorder.current = null;
    setState('idle');
  };
  const send = async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setState('sending');
    const rec = await r.stop();
    if (!rec) { setState('idle'); toast('That recording was too short', 'info'); return; }
    try {
      await sendVoiceMessage(channelId, rec.blob, rec.durationSecs, rec.waveform);
    } catch (e) {
      toast('Voice message failed to send: ' + errorMessage(e), 'error');
    }
    setState('idle');
  };
  sendRef.current = () => { void send(); };

  // press-and-hold: a long press releases into "send"; a quick tap leaves it recording
  const micHandlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // keep focus (and the phone keyboard) where it is
      pressedAt.current = Date.now();
      void start();
      // the mic button is swapped for the recording bar, so listen for the release on the window
      window.addEventListener('pointerup', () => {
        if (pressedAt.current && Date.now() - pressedAt.current > HOLD_MS) sendRef.current();
        pressedAt.current = 0;
      }, { once: true });
    },
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void start(); } },
  };
  return { state, elapsed, level, start, cancel, send, micHandlers, active: state !== 'idle' };
}

export function RecordingBar({ rec }: { rec: ReturnType<typeof useVoiceRecording> }) {
  return (
    <div className="voice-rec" role="status" aria-live="polite">
      <Tooltip label="Cancel">
        <button className="composer-btn danger-hover" aria-label="Cancel recording" onClick={rec.cancel} disabled={rec.state === 'sending'}><IconTrash size={20} /></button>
      </Tooltip>
      <span className="voice-rec-dot" style={{ transform: `scale(${1 + rec.level * 0.8})` }} />
      <span className="voice-rec-time">{rec.state === 'starting' ? 'Starting…' : rec.state === 'sending' ? 'Sending…' : formatClock(rec.elapsed)}</span>
      <span className="voice-rec-hint">{rec.state === 'recording' ? 'Recording — release or press send' : ''}</span>
      <Tooltip label="Send voice message">
        <button className="voice-rec-send" aria-label="Send voice message" onClick={() => void rec.send()} disabled={rec.state !== 'recording'}><IconSend size={18} /></button>
      </Tooltip>
    </div>
  );
}

export function MicButton({ rec }: { rec: ReturnType<typeof useVoiceRecording> }) {
  return (
    <Tooltip label="Record a voice message (hold to talk)">
      <button className="composer-btn mic-btn" aria-label="Record a voice message" {...rec.micHandlers}><IconMic size={22} /></button>
    </Tooltip>
  );
}
