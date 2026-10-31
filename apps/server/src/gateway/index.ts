import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import {
  GatewayCloseCode, GatewayOp, Permissions, has,
  type DispatchEventName, type DispatchEvents, type GatewayFrame, type Presence, type PresenceStatus, type ReadyPayload,
} from '@huddle/shared';
import type { Ctx } from '../context';
import {
  getChannelRow, getUserRow, guildSettings, isPrivate, privateChannelsOf, privateUser, publicUser, readState,
  recipientIds, relationshipsOf, type ChannelRow, type UserRow,
} from '../serializers';
import { channelPermsBulk, getGuildRow, guildPerms } from '../services/permissions';
import { fullGuild } from '../services/guilds';
import { userSettingsOf } from '../services/userSettings';
import { Session, SessionRegistry } from './sessions';
import { authenticate, needsVerification } from '../services/accounts';
import { guildMemberIds, presenceAudience, readyPresenceIds } from './dispatch';

export type Payload<K extends DispatchEventName> =
  | DispatchEvents[K]
  | ((userId: string) => DispatchEvents[K] | null | undefined);

const VALID_STATUSES: PresenceStatus[] = ['online', 'idle', 'dnd', 'invisible'];

export class Gateway {
  readonly sessions = new SessionRegistry();
  private wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  private timer: NodeJS.Timeout;
  private closed = false;

  constructor(private ctx: Ctx) {
    this.wss.on('connection', (ws) => this.onConnection(ws));
    const tick = Math.max(250, Math.min(5000, Math.floor(ctx.cfg.heartbeatInterval / 4)));
    this.timer = setInterval(() => this.reap(), tick);
    this.timer.unref();
  }

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = (req.url ?? '').split('?')[0];
      if (pathname !== '/gateway' && pathname !== '/gateway/') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    for (const s of this.sessions.all) {
      try { s.ws.terminate(); } catch { /* ignore */ }
    }
    this.wss.close();
  }

  // ---------------- connection lifecycle ----------------

  private onConnection(ws: WebSocket): void {
    const s = new Session(ws);
    this.sessions.add(s);
    s.sendRaw({ op: GatewayOp.HELLO, d: { heartbeat_interval: this.ctx.cfg.heartbeatInterval } });
    ws.on('message', (raw) => {
      this.onMessage(s, raw).catch((err) => {
        console.error('[gateway] handler error', err);
        s.close(GatewayCloseCode.UNKNOWN_ERROR, 'Unknown error');
      });
    });
    ws.on('close', () => this.onClose(s));
    ws.on('error', () => { /* close follows */ });
  }

  private reap(): void {
    const limit = this.ctx.cfg.heartbeatInterval * 2 + Math.min(5000, this.ctx.cfg.heartbeatInterval / 2);
    const now = Date.now();
    for (const s of this.sessions.all) {
      if (now - s.lastHeartbeat > limit) s.close(GatewayCloseCode.SESSION_TIMED_OUT, 'Session timed out');
    }
  }

  private async onMessage(s: Session, raw: RawData): Promise<void> {
    if (this.closed) return;
    let frame: GatewayFrame<any>;
    try {
      frame = JSON.parse(raw.toString());
      if (!frame || typeof frame !== 'object' || typeof frame.op !== 'number') throw new Error('bad frame');
    } catch {
      s.close(GatewayCloseCode.DECODE_ERROR, 'Decode error');
      return;
    }

    switch (frame.op) {
      case GatewayOp.HEARTBEAT:
        s.lastHeartbeat = Date.now();
        s.sendRaw({ op: GatewayOp.HEARTBEAT_ACK });
        return;
      case GatewayOp.IDENTIFY:
        await this.identify(s, frame.d);
        return;
    }

    if (!s.identified) {
      s.close(GatewayCloseCode.NOT_AUTHENTICATED, 'Not authenticated');
      return;
    }
    const d = frame.d ?? {};
    switch (frame.op) {
      case GatewayOp.PRESENCE_UPDATE:
        this.updatePresence(s.userId!, d);
        return;
      case GatewayOp.VOICE_STATE_UPDATE:
        this.ctx.voice.update(s, d);
        return;
      case GatewayOp.VOICE_SIGNAL:
        this.ctx.voice.signal(s, d);
        return;
      default:
        return; // unknown ops are ignored
    }
  }

  private async identify(s: Session, d: any): Promise<void> {
    if (s.identified) return;
    const user = await authenticate(this.ctx, d?.token);
    if (this.closed) return;
    if (!user) {
      s.close(GatewayCloseCode.AUTHENTICATION_FAILED, 'Authentication failed');
      return;
    }
    if (needsVerification(this.ctx, user)) {
      s.close(GatewayCloseCode.EMAIL_NOT_VERIFIED, 'Email not verified');
      return;
    }
    if (s.ws.readyState !== s.ws.OPEN) return;
    s.tokenVersion = user.token_version ?? 0;
    s.lastHeartbeat = Date.now();
    const first = this.sessions.bind(s, user.id);
    s.dispatch('READY', this.buildReady(s, user));
    if (first) this.broadcastPresence(user.id);
  }

  /** Closes the user's sessions that identified with a token older than `version` (revoked sessions). */
  dropStaleSessions(userId: string, version: number, code: number): void {
    const set = this.sessions.of(userId);
    if (!set) return;
    for (const s of [...set]) if (s.tokenVersion < version) s.close(code, 'Session invalidated');
  }

  private onClose(s: Session): void {
    const userId = s.userId;
    if (this.closed) return;
    const last = this.sessions.remove(s);
    if (!userId) return;
    const vs = this.ctx.voice.get(userId);
    if (vs && (last || vs.session_id === s.id)) this.ctx.voice.leave(userId);
    if (last) this.broadcastPresence(userId);
  }

  // ---------------- READY ----------------

  buildReady(s: Session, user: UserRow): ReadyPayload {
    const { db } = this.ctx;
    const guildIds = db.all<{ guild_id: string }>(
      'SELECT guild_id FROM members WHERE user_id = ? ORDER BY joined_at ASC', user.id,
    ).map((r) => r.guild_id);
    return {
      session_id: s.id,
      user: privateUser(user, this.ctx.cfg.requireEmailVerification),
      guilds: guildIds.map((id) => fullGuild(this.ctx, id)!).filter(Boolean),
      private_channels: privateChannelsOf(db, user.id),
      relationships: relationshipsOf(db, user.id),
      presences: readyPresenceIds(db, user.id).map((id) => this.presence(id)),
      read_states: db.all<any>('SELECT * FROM read_states WHERE user_id = ?', user.id).map(readState),
      user_guild_settings: guildIds.map((gid) => guildSettings(db, user.id, gid)),
      user_settings: userSettingsOf(db, user.id),
      voice_states: this.ctx.voice.forDmUser(user.id),
    };
  }

  // ---------------- presence ----------------

  isOnline(userId: string): boolean {
    return this.sessions.isOnline(userId);
  }

  presence(userOrId: string | UserRow): Presence {
    const u = typeof userOrId === 'string' ? getUserRow(this.ctx.db, userOrId) : userOrId;
    if (!u) return { user_id: String(userOrId), status: 'offline', custom_status: null };
    const online = this.sessions.isOnline(u.id);
    const status: PresenceStatus = !online || u.status === 'invisible' ? 'offline' : (u.status as PresenceStatus);
    return { user_id: u.id, status, custom_status: status === 'offline' ? null : u.custom_status };
  }

  broadcastPresence(userId: string): void {
    const p = this.presence(userId);
    this.dispatchToUsers(presenceAudience(this.ctx.db, userId), 'PRESENCE_UPDATE', p);
  }

  private updatePresence(userId: string, d: any): void {
    const status = d?.status;
    if (!VALID_STATUSES.includes(status)) return;
    let custom: string | null | undefined = d?.custom_status;
    if (custom !== undefined && custom !== null) custom = String(custom).slice(0, 128) || null;
    const { db } = this.ctx;
    if (custom === undefined) db.run('UPDATE users SET status = ? WHERE id = ?', status, userId);
    else db.run('UPDATE users SET status = ?, custom_status = ? WHERE id = ?', status, custom, userId);
    const u = getUserRow(db, userId);
    if (!u) return;
    this.dispatchToUser(userId, 'USER_UPDATE', privateUser(u, this.ctx.cfg.requireEmailVerification));
    this.broadcastPresence(userId);
  }

  /** USER_UPDATE: full User to self, PublicUser to everyone who can see them. */
  broadcastUserUpdate(userId: string): void {
    const u = getUserRow(this.ctx.db, userId);
    if (!u) return;
    const full = privateUser(u, this.ctx.cfg.requireEmailVerification);
    const pub = publicUser(u);
    this.dispatchToUsers(presenceAudience(this.ctx.db, userId), 'USER_UPDATE', (uid) => (uid === userId ? full : pub));
  }

  // ---------------- fan-out ----------------

  dispatchToUser<K extends DispatchEventName>(userId: string, t: K, d: Payload<K>): void {
    const set = this.sessions.of(userId);
    if (!set || set.size === 0) return;
    const payload = typeof d === 'function' ? (d as (u: string) => DispatchEvents[K] | null | undefined)(userId) : d;
    if (payload === null || payload === undefined) return;
    for (const s of set) s.dispatch(t, payload);
  }

  dispatchToUsers<K extends DispatchEventName>(userIds: Iterable<string>, t: K, d: Payload<K>): void {
    for (const id of new Set(userIds)) this.dispatchToUser(id, t, d);
  }

  /**
   * Sends to every member of a guild. With `channelId`, only to members who can VIEW_CHANNEL it
   * (and optionally hold `perm` there).
   */
  dispatchToGuild<K extends DispatchEventName>(
    guildId: string, t: K, d: Payload<K>,
    opts: { channelId?: string; exclude?: string; perm?: bigint } = {},
  ): void {
    const online = new Set(guildMemberIds(this.ctx.db, guildId).filter((id) => this.sessions.isOnline(id)));
    if (opts.exclude) online.delete(opts.exclude);
    if (!online.size) return;
    if (opts.channelId) {
      const c = getChannelRow(this.ctx.db, opts.channelId);
      if (!c) return;
      this.dispatchToUsers(this.viewers(c, online, opts.perm), t, d);
      return;
    }
    if (opts.perm) {
      const g = getGuildRow(this.ctx.db, guildId);
      if (!g) return;
      const need = opts.perm;
      this.dispatchToUsers([...online].filter((u) => has(guildPerms(this.ctx.db, g, u) ?? 0n, need)), t, d);
      return;
    }
    this.dispatchToUsers(online, t, d);
  }

  /** Online users who can view a guild channel (with an optional extra permission). */
  viewers(c: ChannelRow, among?: Set<string>, perm?: bigint): string[] {
    const online = among ?? new Set([...this.sessions.onlineUsers()]);
    const perms = channelPermsBulk(this.ctx.db, c, online);
    const need = Permissions.VIEW_CHANNEL | (perm ?? 0n);
    return [...perms].filter(([, p]) => has(p, need)).map(([id]) => id);
  }

  /** Channel-scoped event: DM recipients, or guild members who can view the channel. */
  dispatchToChannel<K extends DispatchEventName>(channel: ChannelRow | string, t: K, d: Payload<K>): void {
    const c = typeof channel === 'string' ? getChannelRow(this.ctx.db, channel) : channel;
    if (!c) return;
    if (isPrivate(c)) this.dispatchToUsers(recipientIds(this.ctx.db, c.id), t, d);
    else if (c.guild_id) this.dispatchToGuild(c.guild_id, t, d, { channelId: c.id });
  }
}
