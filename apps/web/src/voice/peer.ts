// One RTCPeerConnection to one remote participant, negotiated with the "perfect negotiation"
// pattern (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example):
//   - both sides may create offers whenever `negotiationneeded` fires;
//   - on an offer collision the *impolite* peer ignores the incoming offer, the *polite* peer
//     rolls its own offer back and answers instead;
//   - ICE candidates that arrive before a remote description are queued, then flushed.
// Every offer/answer carries `kinds`, a {streamId -> 'mic'|'camera'|'screen'} map of the
// sender's currently published local streams. Because addTrack(track, stream) propagates the
// stream id (SDP msid) to the remote `track` event, the receiver can label each incoming track.
import { iceServers } from './config';

export type StreamKind = 'mic' | 'camera' | 'screen';
export type KindMap = Record<string, StreamKind>;

export interface SignalData {
  sdp?: RTCSessionDescriptionInit;
  kinds?: KindMap;
  candidate?: RTCIceCandidateInit;
}

export interface RemoteMedia {
  camera: MediaStream | null;
  screen: MediaStream | null;
  audio: { stream: MediaStream; kind: StreamKind }[];
}

export interface PeerHooks {
  send(kind: 'offer' | 'answer' | 'ice', data: SignalData): void;
  /** Labels for the streams we currently publish. */
  localKinds(): KindMap;
  /** Reconciled set of remote media currently received from this peer. */
  onRemoteMedia(media: RemoteMedia): void;
  onConnectionState(state: RTCPeerConnectionState): void;
}

export class Peer {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteKinds: KindMap = {};
  private trackStreams = new Map<string, MediaStream>(); // remote track id -> its stream
  private senders: Partial<Record<StreamKind, RTCRtpSender[]>> = {};
  private recvAudioPlaceholder: RTCRtpTransceiver | null = null;
  private chain: Promise<void> = Promise.resolve();
  closed = false;

  constructor(readonly remoteId: string, readonly polite: boolean, private hooks: PeerHooks) {
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
    this.pc = pc;

    pc.onnegotiationneeded = async () => {
      if (this.closed) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d && d.type === 'offer' && !this.closed) this.hooks.send('offer', { sdp: d.toJSON(), kinds: this.hooks.localKinds() });
      } catch (e) {
        console.warn('[voice] offer failed', e);
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this.closed) this.hooks.send('ice', { candidate: candidate.toJSON() });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.trackStreams.set(ev.track.id, stream);
      ev.track.addEventListener('ended', () => this.reconcile());
    };
    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const st = pc.connectionState;
      this.hooks.onConnectionState(st);
      // ICE restart fires negotiationneeded -> a fresh offer (collisions handled as usual)
      if (st === 'failed') { try { pc.restartIce(); } catch { /* ignore */ } }
    };
  }

  /** Incoming signal from the remote peer. Processed strictly in arrival order. */
  handleSignal(kind: 'offer' | 'answer' | 'ice', data: SignalData | null): void {
    this.chain = this.chain.then(() => this.process(kind, data)).catch((e) => console.warn('[voice] signal failed', kind, e));
  }

  private async process(kind: 'offer' | 'answer' | 'ice', data: SignalData | null): Promise<void> {
    if (this.closed || !data) return;
    const pc = this.pc;
    if (kind === 'ice') {
      if (!data.candidate) return;
      if (!pc.remoteDescription) { this.pendingCandidates.push(data.candidate); return; }
      try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!this.ignoreOffer) throw e; }
      return;
    }
    const desc = data.sdp;
    if (!desc || (desc.type !== 'offer' && desc.type !== 'answer')) return;

    const readyForOffer = !this.makingOffer && (pc.signalingState === 'stable' || this.settingRemoteAnswer);
    const collision = desc.type === 'offer' && !readyForOffer;
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return; // impolite: our offer wins, theirs is dropped
    if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') return; // stale answer

    this.remoteKinds = data.kinds ?? {};
    if (collision && pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' }); // polite: yield
    this.settingRemoteAnswer = desc.type === 'answer';
    try { await pc.setRemoteDescription(desc); } finally { this.settingRemoteAnswer = false; }

    const queued = this.pendingCandidates.splice(0);
    for (const c of queued) { try { await pc.addIceCandidate(c); } catch (e) { console.warn('[voice] queued candidate rejected', e); } }

    if (desc.type === 'offer') {
      await pc.setLocalDescription();
      const d = pc.localDescription;
      if (d && !this.closed) this.hooks.send('answer', { sdp: d.toJSON(), kinds: this.hooks.localKinds() });
    }
    this.reconcile();
  }

  /** Works out which remote tracks are live from transceiver directions + the latest kind map. */
  reconcile(): void {
    if (this.closed) return;
    let camera: MediaStream | null = null;
    let screen: MediaStream | null = null;
    const audio = new Map<string, { stream: MediaStream; kind: StreamKind }>();
    for (const t of this.pc.getTransceivers()) {
      const dir = t.currentDirection;
      if (dir !== 'sendrecv' && dir !== 'recvonly') continue;
      const track = t.receiver.track;
      if (!track || track.readyState === 'ended') continue;
      const stream = this.trackStreams.get(track.id);
      if (!stream) continue;
      const kind = this.remoteKinds[stream.id];
      if (!kind) continue; // not (or no longer) announced by the sender
      if (track.kind === 'audio') audio.set(stream.id, { stream, kind });
      else if (kind === 'screen') screen = stream;
      else camera = stream;
    }
    this.hooks.onRemoteMedia({ camera, screen, audio: [...audio.values()] });
  }

  /** Publishes a local stream to this peer (triggers renegotiation). */
  addLocal(kind: StreamKind, stream: MediaStream): void {
    if (this.closed) return;
    this.removeLocal(kind);
    this.senders[kind] = stream.getTracks().map((t) => this.pc.addTrack(t, stream));
  }

  removeLocal(kind: StreamKind): void {
    const list = this.senders[kind];
    if (!list) return;
    delete this.senders[kind];
    if (this.closed) return;
    for (const s of list) { try { this.pc.removeTrack(s); } catch { /* ignore */ } }
  }

  hasLocal(kind: StreamKind): boolean { return !!this.senders[kind]; }

  /** With no microphone we still want a connection, to receive audio. */
  ensureAudioReceive(): void {
    if (this.closed || this.recvAudioPlaceholder || this.senders.mic) return;
    this.recvAudioPlaceholder = this.pc.addTransceiver('audio', { direction: 'recvonly' });
  }

  /** Round-trip time of the selected ICE candidate pair, in ms. */
  async rtt(): Promise<number | null> {
    if (this.closed) return null;
    try {
      const stats = await this.pc.getStats();
      let out: number | null = null;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && typeof r.currentRoundTripTime === 'number') {
          out = Math.round(r.currentRoundTripTime * 1000);
        }
      });
      return out;
    } catch { return null; }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    try { this.pc.close(); } catch { /* ignore */ }
  }
}
