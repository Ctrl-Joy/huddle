import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import { GatewayOp, type DispatchEventName, type GatewayFrame } from '@huddle/shared';

export class Session {
  readonly id = crypto.randomBytes(16).toString('hex');
  userId: string | null = null;
  seq = 0;
  lastHeartbeat = Date.now();
  readonly connectedAt = Date.now();

  constructor(readonly ws: WebSocket) {}

  get identified(): boolean {
    return this.userId !== null;
  }

  sendRaw(frame: GatewayFrame): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(frame));
  }

  dispatch(t: DispatchEventName, d: unknown): void {
    if (!this.identified) return;
    this.seq++;
    this.sendRaw({ op: GatewayOp.DISPATCH, t, s: this.seq, d });
  }

  close(code: number, reason = ''): void {
    try { this.ws.close(code, reason); } catch { /* ignore */ }
    // Make sure a misbehaving peer can't keep the socket half-open.
    setTimeout(() => { try { this.ws.terminate(); } catch { /* ignore */ } }, 2000).unref();
  }
}

/** userId → live sessions. */
export class SessionRegistry {
  private byUser = new Map<string, Set<Session>>();
  readonly all = new Set<Session>();

  add(s: Session): void {
    this.all.add(s);
  }

  bind(s: Session, userId: string): boolean {
    s.userId = userId;
    let set = this.byUser.get(userId);
    const first = !set || set.size === 0;
    if (!set) this.byUser.set(userId, (set = new Set()));
    set.add(s);
    return first;
  }

  /** Removes a session. Returns true if it was the user's last one. */
  remove(s: Session): boolean {
    this.all.delete(s);
    if (!s.userId) return false;
    const set = this.byUser.get(s.userId);
    if (!set || !set.delete(s)) return false;
    if (set.size === 0) {
      this.byUser.delete(s.userId);
      return true;
    }
    return false;
  }

  of(userId: string): Set<Session> | undefined {
    return this.byUser.get(userId);
  }

  isOnline(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  onlineUsers(): IterableIterator<string> {
    return this.byUser.keys();
  }

  findById(sessionId: string): Session | undefined {
    for (const s of this.all) if (s.id === sessionId) return s;
    return undefined;
  }
}
