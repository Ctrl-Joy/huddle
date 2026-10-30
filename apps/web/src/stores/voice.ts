// Voice state store (DATA ONLY). The WebRTC media engine lives in src/voice/ (added later) and plugs in
// via registerVoiceEngine(). This store owns:
//   - every visible VoiceState (keyed by user id: one connection per user)
//   - our own connection + local flags (mute / deaf / video / screen)
//   - per-user media streams & speaking flags that the engine publishes for the UI to render
//   - DM call ring state (CALL_CREATE / CALL_DELETE)
import { create } from 'zustand';
import type { VoiceSignalPayload, VoiceState } from '@huddle/shared';
import { gateway } from '../api/gateway';
import { api, errorMessage } from '../api/client';
import { useAuthStore } from './auth';

export interface VoiceConnection {
  channelId: string;
  guildId: string | null;
  status: 'connecting' | 'connected';
  since: number;
}

export interface LocalVoiceFlags { selfMute: boolean; selfDeaf: boolean; selfVideo: boolean; selfStream: boolean }

export interface UserStreams { camera?: MediaStream | null; screen?: MediaStream | null }

export interface CallInfo { channelId: string; ringing: string[]; initiatorId: string }

/** Hooks the media engine implements. All optional. */
export interface VoiceEngine {
  /** Called after we asked the gateway to join (status 'connecting'). */
  onJoin?(conn: VoiceConnection, flags: LocalVoiceFlags): void | Promise<void>;
  /** Called when we leave or are disconnected by the server. */
  onLeave?(prev: VoiceConnection): void;
  /** Called whenever local flags change (mute/deaf/video/screen). Engine may revert via setLocalFlags. */
  onLocalFlagsChange?(flags: LocalVoiceFlags, prev: LocalVoiceFlags): void | Promise<void>;
  /** Any VoiceState change (others joining/leaving our channel → create/close peers). */
  onVoiceStateUpdate?(state: VoiceState, prev: VoiceState | undefined): void;
  /** Gateway relayed WebRTC signal addressed to us. */
  onSignal?(signal: VoiceSignalPayload & { from_user_id: string }): void;
}

let engine: VoiceEngine | null = null;
export function registerVoiceEngine(e: VoiceEngine | null) { engine = e; }
export function getVoiceEngine(): VoiceEngine | null { return engine; }

interface VoiceStoreState extends LocalVoiceFlags {
  states: Record<string, VoiceState>;
  connection: VoiceConnection | null;
  speaking: Record<string, boolean>;
  streams: Record<string, UserStreams>;
  calls: Record<string, CallInfo>;
  /** Mute state before deafening, restored when undeafening. */
  muteBeforeDeaf: boolean;

  // data mutators (used by gatewayBindings & the engine)
  setStates(list: VoiceState[]): void;
  applyState(vs: VoiceState): void;
  removeGuildStates(guildId: string): void;
  setLocalFlags(p: Partial<LocalVoiceFlags>): void;
  setSpeaking(userId: string, speaking: boolean): void;
  setStream(userId: string, kind: keyof UserStreams, stream: MediaStream | null): void;
  setCall(c: CallInfo): void;
  removeCall(channelId: string): void;
  reset(): void;
}

const FLAGS_KEY = 'huddle.voiceFlags';
function loadFlags(): Pick<LocalVoiceFlags, 'selfMute' | 'selfDeaf'> {
  try {
    const v = JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}');
    return { selfMute: !!v.selfMute, selfDeaf: !!v.selfDeaf };
  } catch { return { selfMute: false, selfDeaf: false }; }
}

export const useVoiceStore = create<VoiceStoreState>()((set, get) => ({
  states: {},
  connection: null,
  ...loadFlags(),
  selfVideo: false,
  selfStream: false,
  speaking: {},
  streams: {},
  calls: {},
  muteBeforeDeaf: false,

  setStates: (list) => set((s) => {
    const states = { ...s.states };
    for (const vs of list) if (vs.channel_id) states[vs.user_id] = vs;
    return { states };
  }),

  applyState: (vs) => {
    const prev = get().states[vs.user_id];
    set((s) => {
      const states = { ...s.states };
      if (vs.channel_id) states[vs.user_id] = vs; else delete states[vs.user_id];
      const patch: Partial<VoiceStoreState> = { states };
      if (!vs.channel_id) {
        const streams = { ...s.streams }; delete streams[vs.user_id];
        const speaking = { ...s.speaking }; delete speaking[vs.user_id];
        patch.streams = streams; patch.speaking = speaking;
      }
      const me = useAuthStore.getState().user?.id;
      if (vs.user_id === me) {
        // While 'connecting' (switching channels, or rejoining after a gateway reconnect) the server
        // may still echo our *previous* channel or its disconnect — don't let that clobber the new
        // connection. Once 'connected', follow the server (forced disconnect / server move).
        const stale = s.connection?.status === 'connecting' && vs.channel_id !== s.connection.channelId;
        if (stale) {
          // keep connection as-is
        } else if (!vs.channel_id) {
          if (s.connection) {
            const old = s.connection;
            queueMicrotask(() => engine?.onLeave?.(old));
          }
          patch.connection = null;
          patch.selfVideo = false;
          patch.selfStream = false;
        } else {
          patch.connection = { channelId: vs.channel_id, guildId: vs.guild_id, status: 'connected', since: s.connection?.channelId === vs.channel_id ? s.connection.since : Date.now() };
        }
      }
      return patch;
    });
    engine?.onVoiceStateUpdate?.(vs, prev);
  },

  removeGuildStates: (guildId) => set((s) => {
    const states: Record<string, VoiceState> = {};
    for (const [k, v] of Object.entries(s.states)) if (v.guild_id !== guildId) states[k] = v;
    return { states, connection: s.connection?.guildId === guildId ? null : s.connection };
  }),

  setLocalFlags: (p) => {
    const prev = pickFlags(get());
    set(p);
    const next = pickFlags(get());
    try { localStorage.setItem(FLAGS_KEY, JSON.stringify({ selfMute: next.selfMute, selfDeaf: next.selfDeaf })); } catch { /* ignore */ }
    const conn = get().connection;
    if (conn) sendVoiceState(conn.channelId, conn.guildId);
    if (prev.selfMute !== next.selfMute || prev.selfDeaf !== next.selfDeaf || prev.selfVideo !== next.selfVideo || prev.selfStream !== next.selfStream) {
      void engine?.onLocalFlagsChange?.(next, prev);
    }
  },

  setSpeaking: (userId, speaking) => set((s) => (s.speaking[userId] === speaking ? {} : { speaking: { ...s.speaking, [userId]: speaking } })),
  setStream: (userId, kind, stream) => set((s) => ({ streams: { ...s.streams, [userId]: { ...(s.streams[userId] || {}), [kind]: stream } } })),
  setCall: (c) => set((s) => ({ calls: { ...s.calls, [c.channelId]: c } })),
  removeCall: (channelId) => set((s) => { const calls = { ...s.calls }; delete calls[channelId]; return { calls }; }),
  reset: () => set({ states: {}, connection: null, speaking: {}, streams: {}, calls: {}, selfVideo: false, selfStream: false }),
}));

function pickFlags(s: LocalVoiceFlags): LocalVoiceFlags {
  return { selfMute: s.selfMute, selfDeaf: s.selfDeaf, selfVideo: s.selfVideo, selfStream: s.selfStream };
}

function sendVoiceState(channelId: string | null, guildId: string | null) {
  const s = useVoiceStore.getState();
  gateway.updateVoiceState({
    guild_id: guildId, channel_id: channelId,
    self_mute: s.selfMute || s.selfDeaf, self_deaf: s.selfDeaf, self_video: s.selfVideo, self_stream: s.selfStream,
  });
}

/** Imperative voice API used by the UI. The engine reacts through the VoiceEngine hooks. */
export const voiceActions = {
  join(channelId: string, guildId: string | null) {
    const s = useVoiceStore.getState();
    if (s.connection?.channelId === channelId) return;
    if (s.connection) voiceActions.leave();
    const conn: VoiceConnection = { channelId, guildId, status: 'connecting', since: Date.now() };
    useVoiceStore.setState({ connection: conn, selfVideo: false, selfStream: false });
    sendVoiceState(channelId, guildId);
    void engine?.onJoin?.(conn, pickFlags(useVoiceStore.getState()));
  },
  leave() {
    const s = useVoiceStore.getState();
    const conn = s.connection;
    if (!conn) return;
    useVoiceStore.setState({ connection: null, selfVideo: false, selfStream: false });
    sendVoiceState(null, conn.guildId);
    engine?.onLeave?.(conn);
  },
  toggleMute() {
    const s = useVoiceStore.getState();
    if (s.selfDeaf) { useVoiceStore.getState().setLocalFlags({ selfDeaf: false, selfMute: false }); return; }
    useVoiceStore.getState().setLocalFlags({ selfMute: !s.selfMute });
  },
  toggleDeafen() {
    const s = useVoiceStore.getState();
    if (s.selfDeaf) useVoiceStore.getState().setLocalFlags({ selfDeaf: false, selfMute: s.muteBeforeDeaf });
    else { useVoiceStore.setState({ muteBeforeDeaf: s.selfMute }); useVoiceStore.getState().setLocalFlags({ selfDeaf: true, selfMute: true }); }
  },
  toggleVideo() {
    const s = useVoiceStore.getState();
    if (!s.connection) return;
    useVoiceStore.getState().setLocalFlags({ selfVideo: !s.selfVideo });
  },
  toggleScreen() {
    const s = useVoiceStore.getState();
    if (!s.connection) return;
    useVoiceStore.getState().setLocalFlags({ selfStream: !s.selfStream });
  },
  /** DM call: ring the other recipients and join the DM's voice session. */
  async startCall(channelId: string) {
    voiceActions.join(channelId, null);
    try { await api.post(`/channels/${channelId}/call/ring`, {}); } catch (e) { console.warn('ring failed', errorMessage(e)); }
  },
  /** Accept an incoming DM call. */
  acceptCall(channelId: string) { voiceActions.join(channelId, null); },
  /** Decline: just hide the ring locally (server stops ringing when caller leaves). */
  declineCall(channelId: string) { useVoiceStore.getState().removeCall(channelId); },
};

/** Users connected to a channel. */
export function useVoiceParticipants(channelId: string): VoiceState[] {
  const states = useVoiceStore((s) => s.states);
  return Object.values(states).filter((v) => v.channel_id === channelId);
}
