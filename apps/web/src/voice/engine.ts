// WebRTC mesh media engine. Plugs into stores/voice.ts through registerVoiceEngine().
//
// Topology: one RTCPeerConnection per remote participant in our voice channel (full mesh).
// Lifecycle:
//   onJoin            -> acquire mic (listen-only on failure); wait for the server to echo our VoiceState
//   our VoiceState    -> "activate" the channel: create a Peer for every participant already there
//   their VoiceState  -> create a Peer when someone enters our channel, close it when they leave
//   both sides create their Peer independently; Peer uses perfect negotiation, so whichever side's
//   negotiationneeded fires first (or both) converges on exactly one PC pair per user pair.
//   onLeave / server disconnect -> close every PC, stop every local track, clear streams/speaking.
//   server move (our channel_id changes while connected) -> tear down peers, rebuild in new channel.
//   Gateway reconnect -> REJOIN: peers are closed when the socket drops (connection goes back to
//   'connecting'); after READY the store re-announces our voice state, the server echoes it and we
//   rebuild peers. Local mic/camera/screen are kept across the reconnect. A gateway 'closed'
//   (logout / auth failure) is a full leave.
import type { VoiceState } from '@huddle/shared';
import { gateway } from '../api/gateway';
import { useAuthStore } from '../stores/auth';
import { toast } from '../stores/ui';
import { registerVoiceEngine, useVoiceStore, type LocalVoiceFlags, type VoiceEngine } from '../stores/voice';
import { getMediaPrefs } from '../components/settings/VoiceVideoSettings';
import { unlockAudio } from './audio';
import { fakeMediaEnabled } from './config';
import { getCamera, getMicrophone, getScreen, stopStream } from './media';
import { Peer, type KindMap, type RemoteMedia, type SignalData, type StreamKind } from './peer';
import { playVoiceSound } from './sounds';
import { unwatchAll, unwatchSpeaking, watchSpeaking } from './speaking';
import { setPeerState, useMediaDiag } from './mediaState';

interface PeerEntry {
  peer: Peer;
  audio: Map<string, HTMLAudioElement>; // remote stream id -> playing element
  media: RemoteMedia;
}

const local: { mic: MediaStream | null; camera: MediaStream | null; screen: MediaStream | null } = { mic: null, camera: null, screen: null };
const peers = new Map<string, PeerEntry>();
let activeChannel: string | null = null; // channel whose peers are built (our state confirmed by server)
let session = 0; // bumps on every join/leave; async work from an older session is discarded
let camGen = 0;
let screenGen = 0;
let micState: 'idle' | 'pending' | 'ok' | 'failed' = 'idle';
let serverMute = false;
let serverDeaf = false;
let quietFlags = false; // suppress UI blips for engine-initiated flag changes
let statsTimer: ReturnType<typeof setInterval> | null = null;

const store = () => useVoiceStore.getState();
const me = () => useAuthStore.getState().user?.id ?? '';
const myName = () => {
  const u = useAuthStore.getState().user;
  return u ? ((u as { global_name?: string | null }).global_name || u.username) : 'me';
};

function log(...a: unknown[]) { if (import.meta.env.DEV) console.debug('[voice]', ...a); }

/** Deterministic politeness: the numerically smaller snowflake id is polite. */
function isPolite(mine: string, theirs: string): boolean {
  try { return BigInt(mine) < BigInt(theirs); } catch { return mine < theirs; }
}

function effectiveMute(): boolean { const s = store(); return s.selfMute || s.selfDeaf || serverMute || serverDeaf; }
function effectiveDeaf(): boolean { return store().selfDeaf || serverDeaf; }

function applyAudio(): void {
  const muted = effectiveMute();
  for (const t of local.mic?.getAudioTracks() ?? []) t.enabled = !muted; // sender stays, sends silence
  const deaf = effectiveDeaf();
  for (const e of peers.values()) for (const el of e.audio.values()) el.muted = deaf;
}

function localKinds(): KindMap {
  const m: KindMap = {};
  if (local.mic) m[local.mic.id] = 'mic';
  if (local.camera) m[local.camera.id] = 'camera';
  if (local.screen) m[local.screen.id] = 'screen';
  return m;
}

// ---------------------------------------------------------------------------------------------
// remote audio playback

let audioRoot: HTMLDivElement | null = null;
function audioContainer(): HTMLDivElement {
  if (!audioRoot || !audioRoot.isConnected) {
    audioRoot = document.createElement('div');
    audioRoot.id = 'huddle-voice-audio';
    audioRoot.hidden = true;
    document.body.appendChild(audioRoot);
  }
  return audioRoot;
}

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
function applySink(el: SinkElement): void {
  const id = getMediaPrefs().outputDeviceId || '';
  if (typeof el.setSinkId === 'function' && el.sinkId !== id) el.setSinkId(id).catch(() => { /* device gone / unsupported */ });
}

function applyRemoteMedia(userId: string, entry: PeerEntry, m: RemoteMedia): void {
  if (!peers.has(userId) || peers.get(userId) !== entry) return;
  const s = store();
  const cur = s.streams[userId] || {};
  if ((cur.camera ?? null) !== m.camera) s.setStream(userId, 'camera', m.camera);
  if ((cur.screen ?? null) !== m.screen) s.setStream(userId, 'screen', m.screen);
  entry.media = m;

  const want = new Map(m.audio.map((a) => [a.stream.id, a]));
  for (const [id, el] of entry.audio) {
    if (want.has(id)) continue;
    el.srcObject = null;
    el.remove();
    entry.audio.delete(id);
  }
  for (const [id, a] of want) {
    if (entry.audio.has(id)) continue;
    const el = document.createElement('audio') as SinkElement;
    el.autoplay = true;
    el.srcObject = a.stream;
    el.muted = effectiveDeaf();
    // fake-media test mode: keep the element "playing" (Chrome needs that for WebAudio analysis of
    // remote streams) but inaudible
    if (fakeMediaEnabled()) el.volume = 0;
    el.dataset.user = userId;
    el.dataset.kind = a.kind;
    audioContainer().appendChild(el);
    applySink(el);
    void el.play().catch(() => { /* autoplay blocked until a gesture; join was a gesture */ });
    entry.audio.set(id, el);
  }
  const mic = m.audio.find((a) => a.kind === 'mic');
  if (mic) watchSpeaking('peer:' + userId, mic.stream, (b) => store().setSpeaking(userId, b));
  else unwatchSpeaking('peer:' + userId);
}

// ---------------------------------------------------------------------------------------------
// peers

function ensurePeer(userId: string): PeerEntry | undefined {
  const existing = peers.get(userId);
  if (existing || !activeChannel || userId === me()) return existing;
  const channelId = activeChannel;
  const entry = { audio: new Map(), media: { camera: null, screen: null, audio: [] } } as unknown as PeerEntry;
  entry.peer = new Peer(userId, isPolite(me(), userId), {
    send: (kind, data) => { gateway.sendVoiceSignal({ channel_id: channelId, target_user_id: userId, kind, data }); },
    localKinds,
    onRemoteMedia: (m) => applyRemoteMedia(userId, entry, m),
    onConnectionState: (st) => { log('pc', userId, st); setPeerState(userId, st); },
  });
  peers.set(userId, entry);
  setPeerState(userId, 'new');
  if (local.mic) entry.peer.addLocal('mic', local.mic);
  else if (micState === 'failed') entry.peer.ensureAudioReceive();
  if (local.camera) entry.peer.addLocal('camera', local.camera);
  if (local.screen) entry.peer.addLocal('screen', local.screen);
  log('peer created', userId, entry.peer.polite ? '(polite)' : '(impolite)');
  startStats();
  return entry;
}

function closePeer(userId: string): void {
  const entry = peers.get(userId);
  if (!entry) return;
  peers.delete(userId);
  entry.peer.close();
  for (const el of entry.audio.values()) { el.srcObject = null; el.remove(); }
  entry.audio.clear();
  unwatchSpeaking('peer:' + userId);
  const s = store();
  if (s.streams[userId]) { s.setStream(userId, 'camera', null); s.setStream(userId, 'screen', null); }
  s.setSpeaking(userId, false);
  setPeerState(userId, null);
  log('peer closed', userId);
}

function closeAllPeers(): void {
  for (const id of [...peers.keys()]) closePeer(id);
}

/** Make the peer set match the participants of activeChannel. */
function syncPeers(): void {
  if (!activeChannel) return;
  const states = store().states;
  const here = new Set<string>();
  for (const vs of Object.values(states)) if (vs.channel_id === activeChannel && vs.user_id !== me()) here.add(vs.user_id);
  for (const id of [...peers.keys()]) if (!here.has(id)) closePeer(id);
  for (const id of here) ensurePeer(id);
}

function forEachPeer(fn: (p: Peer) => void) { for (const e of peers.values()) fn(e.peer); }

function startStats(): void {
  if (statsTimer) return;
  statsTimer = setInterval(async () => {
    if (!peers.size) { useMediaDiag.setState({ rtt: null }); return; }
    const vals = (await Promise.all([...peers.values()].map((e) => e.peer.rtt()))).filter((v): v is number => v !== null);
    useMediaDiag.setState({ rtt: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null });
    for (const e of peers.values()) for (const el of e.audio.values()) applySink(el as SinkElement);
  }, 3000);
}

// ---------------------------------------------------------------------------------------------
// local media

async function acquireMic(my: number): Promise<void> {
  micState = 'pending';
  try {
    const stream = await getMicrophone();
    if (my !== session) { stopStream(stream); return; }
    local.mic = stream;
    micState = 'ok';
    useMediaDiag.setState({ listenOnly: false });
    applyAudio();
    watchSpeaking('local', stream, (b) => store().setSpeaking(me(), b), () => !effectiveMute());
    forEachPeer((p) => p.addLocal('mic', stream));
  } catch (e) {
    if (my !== session) return;
    micState = 'failed';
    useMediaDiag.setState({ listenOnly: true });
    const name = (e as DOMException)?.name;
    toast(name === 'NotAllowedError' ? 'Microphone access was denied — you joined in listen-only mode.'
      : name === 'NotFoundError' ? 'No microphone found — you joined in listen-only mode.'
      : 'Could not start your microphone — you joined in listen-only mode.', 'error');
    forEachPeer((p) => p.ensureAudioReceive());
    if (!store().selfMute) { quietFlags = true; try { store().setLocalFlags({ selfMute: true }); } finally { quietFlags = false; } }
  }
}

async function startCamera(): Promise<void> {
  const my = session;
  const gen = ++camGen;
  try {
    const stream = await getCamera(myName());
    if (my !== session || gen !== camGen || !store().selfVideo || !store().connection) { stopStream(stream); return; }
    local.camera = stream;
    store().setStream(me(), 'camera', stream);
    forEachPeer((p) => p.addLocal('camera', stream));
    const track = stream.getVideoTracks()[0];
    if (track) track.onended = () => { if (local.camera === stream) store().setLocalFlags({ selfVideo: false }); };
  } catch (e) {
    if (my !== session || gen !== camGen) return;
    const name = (e as DOMException)?.name;
    toast(name === 'NotAllowedError' ? 'Camera access was denied.' : name === 'NotFoundError' ? 'No camera found.' : 'Could not start your camera.', 'error');
    store().setLocalFlags({ selfVideo: false });
  }
}

function stopCamera(): void {
  camGen++;
  const stream = local.camera;
  local.camera = null;
  forEachPeer((p) => p.removeLocal('camera'));
  stopStream(stream);
  if (store().streams[me()]?.camera) store().setStream(me(), 'camera', null);
}

async function startScreen(): Promise<void> {
  const my = session;
  const gen = ++screenGen;
  try {
    const stream = await getScreen(myName());
    if (my !== session || gen !== screenGen || !store().selfStream || !store().connection) { stopStream(stream); return; }
    local.screen = stream;
    store().setStream(me(), 'screen', stream);
    forEachPeer((p) => p.addLocal('screen', stream));
    // browser's own "Stop sharing" button ends the video track
    const track = stream.getVideoTracks()[0];
    if (track) track.onended = () => { if (local.screen === stream) store().setLocalFlags({ selfStream: false }); };
  } catch (e) {
    if (my !== session || gen !== screenGen) return;
    const name = (e as DOMException)?.name;
    if (name !== 'NotAllowedError' && name !== 'AbortError') toast('Could not start screen sharing.', 'error');
    store().setLocalFlags({ selfStream: false });
  }
}

function stopScreen(): void {
  screenGen++;
  const stream = local.screen;
  local.screen = null;
  forEachPeer((p) => p.removeLocal('screen'));
  stopStream(stream);
  if (store().streams[me()]?.screen) store().setStream(me(), 'screen', null);
}

/** Full local teardown: peers, tracks, published streams, speaking. */
function teardown(): void {
  session++;
  camGen++;
  screenGen++;
  closeAllPeers();
  activeChannel = null;
  unwatchAll();
  stopStream(local.mic); stopStream(local.camera); stopStream(local.screen);
  local.mic = local.camera = local.screen = null;
  micState = 'idle';
  serverMute = serverDeaf = false;
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
  useVoiceStore.setState({ streams: {}, speaking: {} });
  useMediaDiag.setState({ peerStates: {}, rtt: null, listenOnly: false });
}

/** Called when our own VoiceState for the current connection arrives from the server. */
function activate(vs: VoiceState): void {
  serverMute = vs.mute;
  serverDeaf = vs.deaf;
  applyAudio();
  if (activeChannel === vs.channel_id) return;
  closeAllPeers(); // first confirmation (no-op), a server move, or a rejoin after a gateway reconnect
  activeChannel = vs.channel_id;
  log('active in', activeChannel);
  syncPeers();
}

// ---------------------------------------------------------------------------------------------
// engine hooks

const engine: VoiceEngine = {
  async onJoin(conn) {
    teardown();
    const my = session;
    unlockAudio();
    playVoiceSound('join');
    // our state may already be echoed by the time the mic resolves (or even before) — handle both
    const mine = store().states[me()];
    if (mine?.channel_id === conn.channelId) activate(mine);
    await acquireMic(my);
    if (my !== session) return;
    const after = store().states[me()];
    if (after?.channel_id === conn.channelId && store().connection?.channelId === conn.channelId) activate(after);
  },

  onLeave() {
    teardown();
    playVoiceSound('disconnect');
  },

  async onLocalFlagsChange(next: LocalVoiceFlags, prev: LocalVoiceFlags) {
    applyAudio();
    if (!store().connection) return;
    if (!quietFlags) {
      if (next.selfDeaf !== prev.selfDeaf) playVoiceSound(next.selfDeaf ? 'deafen' : 'undeafen');
      else if (next.selfMute !== prev.selfMute) playVoiceSound(next.selfMute ? 'mute' : 'unmute');
    }
    // unmuting while in listen-only mode: try the microphone again
    if (prev.selfMute && !next.selfMute && !local.mic && micState === 'failed') {
      unlockAudio();
      await acquireMic(session);
    }
    if (next.selfVideo !== prev.selfVideo) { if (next.selfVideo) await startCamera(); else stopCamera(); }
    if (next.selfStream !== prev.selfStream) { if (next.selfStream) await startScreen(); else stopScreen(); }
  },

  onVoiceStateUpdate(vs, prev) {
    const myId = me();
    if (vs.user_id === myId) {
      const conn = store().connection;
      if (vs.channel_id && conn && conn.channelId === vs.channel_id) activate(vs);
      return;
    }
    if (!activeChannel) return;
    if (vs.channel_id === activeChannel) {
      // same user, new gateway session (they reconnected): their old PC is dead
      if (prev?.channel_id === activeChannel && prev.session_id !== vs.session_id) closePeer(vs.user_id);
      ensurePeer(vs.user_id);
      const s = store();
      if (!vs.self_video && s.streams[vs.user_id]?.camera) s.setStream(vs.user_id, 'camera', null);
      if (!vs.self_stream && s.streams[vs.user_id]?.screen) s.setStream(vs.user_id, 'screen', null);
    } else if (peers.has(vs.user_id)) {
      closePeer(vs.user_id);
    }
  },

  onSignal(sig) {
    if (!activeChannel || sig.channel_id !== activeChannel) return;
    // the server only relays when both of us are in this channel, so a missing peer is just a race
    const entry = peers.get(sig.from_user_id) ?? ensurePeer(sig.from_user_id);
    entry?.peer.handleSignal(sig.kind, sig.data as SignalData | null);
  },
};

let installed = false;
export function installVoiceEngine(): void {
  if (installed) return;
  installed = true;
  registerVoiceEngine(engine);

  gateway.onStatus((st) => {
    if (st === 'reconnecting' || st === 'connecting') {
      // socket dropped: the server will drop our voice state with the old session. Close peers now,
      // keep local media, and rebuild when our re-announced state is echoed after READY.
      if (activeChannel) { log('gateway lost — closing peers, will rejoin'); closeAllPeers(); activeChannel = null; }
      const c = store().connection;
      if (c && c.status !== 'connecting') useVoiceStore.setState({ connection: { ...c, status: 'connecting' } });
    } else if (st === 'closed') {
      if (store().connection || local.mic) {
        teardown();
        useVoiceStore.setState({ connection: null, selfVideo: false, selfStream: false });
      }
    }
  });

  window.addEventListener('pagehide', () => { closeAllPeers(); });

  if (import.meta.env.DEV) {
    (window as unknown as { __huddleVoice: unknown }).__huddleVoice = {
      peers, local,
      info: () => ({
        me: me(), activeChannel, micState, serverMute, serverDeaf,
        local: Object.fromEntries(Object.entries(local).map(([k, s]) => [k, s ? { id: s.id, tracks: s.getTracks().map((t) => `${t.kind}:${t.readyState}:${t.enabled ? 'on' : 'off'}`) } : null])),
        peers: [...peers.entries()].map(([id, e]) => ({
          id, polite: e.peer.polite,
          connectionState: e.peer.pc.connectionState, iceState: e.peer.pc.iceConnectionState, signalingState: e.peer.pc.signalingState,
          transceivers: e.peer.pc.getTransceivers().map((t) => `${t.mid}:${t.receiver.track.kind}:${t.currentDirection}`),
          audioEls: [...e.audio.values()].map((el) => ({ kind: el.dataset.kind, muted: el.muted, paused: el.paused, tracks: (el.srcObject as MediaStream | null)?.getAudioTracks().map((t) => t.readyState) })),
          remote: { camera: e.media.camera?.id ?? null, screen: e.media.screen?.id ?? null },
        })),
        streams: Object.fromEntries(Object.entries(store().streams).map(([u, s]) => [u, { camera: !!s.camera, screen: !!s.screen }])),
        speaking: store().speaking,
      }),
      /** Simulates the browser's "Stop sharing" button. */
      endScreenTrack: () => { const t = local.screen?.getVideoTracks()[0]; if (t) { t.stop(); t.dispatchEvent(new Event('ended')); } },
    };
  }
}

export type { StreamKind };
