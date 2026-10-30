import { useEffect, useRef, useState } from 'react';
import { Field } from '../modals/Modal';

/** Persisted media device choices — read by the WebRTC engine. */
export interface MediaPrefs { inputDeviceId?: string; outputDeviceId?: string; videoDeviceId?: string }
const MEDIA_KEY = 'huddle.media';
export function getMediaPrefs(): MediaPrefs {
  try { return JSON.parse(localStorage.getItem(MEDIA_KEY) || '{}'); } catch { return {}; }
}
export function setMediaPrefs(p: Partial<MediaPrefs>) {
  try { localStorage.setItem(MEDIA_KEY, JSON.stringify({ ...getMediaPrefs(), ...p })); } catch { /* ignore */ }
}

export function VoiceVideoSettings() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [prefs, setPrefs] = useState<MediaPrefs>(getMediaPrefs());
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState('');
  const micStream = useRef<MediaStream | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const raf = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const loopbackRef = useRef<HTMLAudioElement>(null);

  const refresh = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setError('Media devices are not available in this browser (a secure context is required).'); return; }
    setDevices(await navigator.mediaDevices.enumerateDevices());
  };
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
      stopMic(); stopCam();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (p: Partial<MediaPrefs>) => { setMediaPrefs(p); setPrefs(getMediaPrefs()); };

  const stopMic = () => {
    cancelAnimationFrame(raf.current);
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setTesting(false);
    setLevel(0);
  };
  const stopCam = () => {
    camStream.current?.getTracks().forEach((t) => t.stop());
    camStream.current = null;
    setCamOn(false);
  };

  const startMic = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: prefs.inputDeviceId ? { deviceId: { exact: prefs.inputDeviceId } } : true });
      micStream.current = stream;
      void refresh(); // labels become available after permission
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      // loop back to the selected output so the user can hear themselves
      if (loopbackRef.current) {
        loopbackRef.current.srcObject = stream;
        const el = loopbackRef.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (prefs.outputDeviceId && el.setSinkId) await el.setSinkId(prefs.outputDeviceId).catch(() => {});
        void el.play().catch(() => {});
      }
      setTesting(true);
    } catch (e) { setError('Could not access your microphone: ' + (e as Error).message); }
  };

  const startCam = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: prefs.videoDeviceId ? { deviceId: { exact: prefs.videoDeviceId } } : true });
      camStream.current = stream;
      void refresh();
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
      setCamOn(true);
    } catch (e) { setError('Could not access your camera: ' + (e as Error).message); }
  };

  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`;
  const sinkSupported = typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';

  return (
    <div>
      <h1 className="settings-title">Voice &amp; Video</h1>
      {error && <div className="form-error">{error}</div>}
      <div className="two-col">
        <Field label="Input Device">
          <select value={prefs.inputDeviceId ?? ''} onChange={(e) => { update({ inputDeviceId: e.target.value || undefined }); if (testing) { stopMic(); } }}>
            <option value="">Default</option>
            {inputs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Microphone')}</option>)}
          </select>
        </Field>
        <Field label="Output Device" hint={sinkSupported ? undefined : 'Your browser does not support choosing an output device.'}>
          <select value={prefs.outputDeviceId ?? ''} disabled={!sinkSupported} onChange={(e) => update({ outputDeviceId: e.target.value || undefined })}>
            <option value="">Default</option>
            {outputs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Speaker')}</option>)}
          </select>
        </Field>
      </div>
      <div className="field-label">Mic Test</div>
      <p className="setting-desc">Having mic issues? Start a test and say something silly — we'll play your voice back to you.</p>
      <div className="mic-test">
        <button className={'btn ' + (testing ? 'btn-danger' : 'btn-primary')} onClick={() => (testing ? stopMic() : void startMic())}>{testing ? 'Stop Testing' : "Let's Check"}</button>
        <div className="level-meter" aria-label="Input level">
          {Array.from({ length: 40 }, (_, i) => <i key={i} className={i / 40 < level ? 'on' : ''} />)}
        </div>
        <audio ref={loopbackRef} hidden />
      </div>
      <div className="divider" />
      <Field label="Camera">
        <select value={prefs.videoDeviceId ?? ''} onChange={(e) => { update({ videoDeviceId: e.target.value || undefined }); if (camOn) stopCam(); }}>
          <option value="">Default</option>
          {cams.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Camera')}</option>)}
        </select>
      </Field>
      <div className="cam-preview">
        <video ref={videoRef} muted playsInline className={camOn ? '' : 'hidden'} />
        {!camOn && <div className="cam-placeholder"><button className="btn btn-primary" onClick={() => void startCam()}>Test Video</button></div>}
        {camOn && <button className="btn btn-secondary btn-small cam-stop" onClick={stopCam}>Stop Video</button>}
      </div>
    </div>
  );
}
