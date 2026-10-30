// Small UI-facing store for engine diagnostics (peer connection states, ping, listen-only mode).
import { create } from 'zustand';

interface MediaDiagState {
  peerStates: Record<string, RTCPeerConnectionState>;
  /** Average RTT over connected peers (ms), null when unknown. */
  rtt: number | null;
  /** Joined without a microphone (permission denied / no device). */
  listenOnly: boolean;
}

export const useMediaDiag = create<MediaDiagState>()(() => ({ peerStates: {}, rtt: null, listenOnly: false }));

export function setPeerState(userId: string, st: RTCPeerConnectionState | null) {
  useMediaDiag.setState((s) => {
    const peerStates = { ...s.peerStates };
    if (st) peerStates[userId] = st; else delete peerStates[userId];
    return { peerStates };
  });
}
