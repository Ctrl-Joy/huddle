// WebSocket gateway client: HELLO → IDENTIFY, heartbeats, sequence tracking, auto-reconnect with
// exponential backoff, and a typed event emitter keyed by DispatchEvents.
import {
  GatewayCloseCode, GatewayOp,
  type DispatchEventName, type DispatchEvents, type GatewayFrame, type HelloPayload,
  type PresenceUpdatePayload, type VoiceSignalPayload, type VoiceStateUpdatePayload,
} from '@huddle/shared';

export type GatewayStatus = 'idle' | 'connecting' | 'identifying' | 'ready' | 'reconnecting' | 'closed';

type Handler<K extends DispatchEventName> = (data: DispatchEvents[K]) => void;
type AnyHandler = (event: DispatchEventName, data: unknown) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private seq: number | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAcked = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private manualClose = false;
  private handlers = new Map<DispatchEventName, Set<Handler<any>>>();
  private anyHandlers = new Set<AnyHandler>();
  private statusHandlers = new Set<(s: GatewayStatus, info?: { code?: number; reason?: string }) => void>();
  status: GatewayStatus = 'idle';

  connect(token: string): void {
    this.token = token;
    this.manualClose = false;
    this.attempts = 0;
    this.open();
  }

  /** Use a new token for the next (re)connect, e.g. after a password change revoked the old one. */
  setToken(token: string): void {
    this.token = token;
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearTimers();
    if (this.ws) {
      try { this.ws.close(1000, 'logout'); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  on<K extends DispatchEventName>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  onAny(fn: AnyHandler): () => void {
    this.anyHandlers.add(fn);
    return () => { this.anyHandlers.delete(fn); };
  }

  onStatus(fn: (s: GatewayStatus, info?: { code?: number; reason?: string }) => void): () => void {
    this.statusHandlers.add(fn);
    return () => { this.statusHandlers.delete(fn); };
  }

  send(op: GatewayOp, d?: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ op, d }));
    return true;
  }

  updatePresence(p: PresenceUpdatePayload): boolean { return this.send(GatewayOp.PRESENCE_UPDATE, p); }
  updateVoiceState(v: VoiceStateUpdatePayload): boolean { return this.send(GatewayOp.VOICE_STATE_UPDATE, v); }
  sendVoiceSignal(s: VoiceSignalPayload): boolean { return this.send(GatewayOp.VOICE_SIGNAL, s); }

  // ---- internals ----
  private setStatus(s: GatewayStatus, info?: { code?: number; reason?: string }) {
    this.status = s;
    for (const fn of this.statusHandlers) fn(s, info);
  }

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/gateway`;
  }

  private open() {
    this.clearTimers();
    this.setStatus(this.attempts > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(this.url()); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onmessage = (ev) => {
      let frame: GatewayFrame<any>;
      try { frame = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      this.handleFrame(frame);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.manualClose) return;
      if (ev.code === GatewayCloseCode.AUTHENTICATION_FAILED || ev.code === GatewayCloseCode.EMAIL_NOT_VERIFIED) {
        this.setStatus('closed', { code: ev.code, reason: ev.reason });
        return;
      }
      this.scheduleReconnect(ev.code, ev.reason);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private handleFrame(frame: GatewayFrame<any>) {
    switch (frame.op) {
      case GatewayOp.HELLO: {
        const { heartbeat_interval } = frame.d as HelloPayload;
        this.startHeartbeat(heartbeat_interval || 30000);
        this.setStatus('identifying');
        this.send(GatewayOp.IDENTIFY, { token: this.token });
        break;
      }
      case GatewayOp.HEARTBEAT_ACK:
        this.heartbeatAcked = true;
        break;
      case GatewayOp.HEARTBEAT:
        this.send(GatewayOp.HEARTBEAT, this.seq);
        break;
      case GatewayOp.DISPATCH: {
        if (typeof frame.s === 'number') this.seq = frame.s;
        const t = frame.t as DispatchEventName;
        if (t === 'READY') { this.attempts = 0; this.setStatus('ready'); }
        this.emit(t, frame.d);
        break;
      }
      default:
        break;
    }
  }

  private emit(event: DispatchEventName, data: unknown) {
    const set = this.handlers.get(event);
    if (set) for (const fn of set) {
      try { fn(data); } catch (e) { console.error(`[gateway] handler for ${event} failed`, e); }
    }
    for (const fn of this.anyHandlers) {
      try { fn(event, data); } catch (e) { console.error('[gateway] any-handler failed', e); }
    }
  }

  private startHeartbeat(interval: number) {
    this.heartbeatAcked = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.heartbeatAcked) {
        // zombie connection — force reconnect
        try { this.ws?.close(4000, 'heartbeat timeout'); } catch { /* ignore */ }
        return;
      }
      this.heartbeatAcked = false;
      this.send(GatewayOp.HEARTBEAT, this.seq);
    }, interval);
  }

  private scheduleReconnect(code?: number, reason?: string) {
    if (this.manualClose) return;
    this.attempts++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempts - 1, 5)) * (0.75 + Math.random() * 0.5);
    this.setStatus('reconnecting', { code, reason });
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }
}

export const gateway = new GatewayClient();
