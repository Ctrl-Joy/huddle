// In-memory voice states + WebRTC signaling relay + DM calls.
import {
  ChannelType, MessageType, Permissions, has,
  type VoiceSignalPayload, type VoiceState, type VoiceStateUpdatePayload,
} from '@huddle/shared';
import type { Ctx } from '../context';
import { getChannelRow, getMemberRow, isPrivate, recipientIds, type ChannelRow } from '../serializers';
import { channelPerms } from '../services/permissions';
import { createMessage } from '../services/messages';
import type { Session } from './sessions';

const SIGNAL_KINDS = new Set(['offer', 'answer', 'ice']);

interface Call { initiator: string; ringing: Set<string>; announced: boolean }

export class VoiceManager {
  private states = new Map<string, VoiceState>(); // userId → state
  private calls = new Map<string, Call>(); // DM channel id → call
  private closed = false;

  constructor(private ctx: Ctx) {}

  get(userId: string): VoiceState | undefined {
    return this.states.get(userId);
  }

  inGuild(guildId: string): VoiceState[] {
    return [...this.states.values()].filter((s) => s.guild_id === guildId);
  }

  inChannel(channelId: string): VoiceState[] {
    return [...this.states.values()].filter((s) => s.channel_id === channelId);
  }

  /** Voice states in DM / group DM calls the user is a recipient of. */
  forDmUser(userId: string): VoiceState[] {
    const out: VoiceState[] = [];
    const mine = new Set(
      this.ctx.db.all<{ channel_id: string }>('SELECT channel_id FROM channel_recipients WHERE user_id = ?', userId)
        .map((r) => r.channel_id),
    );
    for (const s of this.states.values()) if (!s.guild_id && s.channel_id && mine.has(s.channel_id)) out.push(s);
    return out;
  }

  private broadcast(state: VoiceState): void {
    const { gw, db } = this.ctx;
    if (state.guild_id) gw.dispatchToGuild(state.guild_id, 'VOICE_STATE_UPDATE', state);
    else if (state.channel_id) gw.dispatchToUsers(recipientIds(db, state.channel_id), 'VOICE_STATE_UPDATE', state);
  }

  /** Handles op VOICE_STATE_UPDATE. Returns an error string when rejected. */
  update(session: Session, p: Partial<VoiceStateUpdatePayload>): string | null {
    const userId = session.userId!;
    if (!p || p.channel_id === null || p.channel_id === undefined) {
      this.leave(userId);
      return null;
    }
    const c = getChannelRow(this.ctx.db, String(p.channel_id));
    if (!c) return 'unknown channel';
    let guildId: string | null = null;
    let perms: bigint;
    if (isPrivate(c)) {
      perms = channelPerms(this.ctx.db, c, userId);
      if (!perms) return 'not a recipient';
    } else {
      if (c.type !== ChannelType.GUILD_VOICE) return 'not a voice channel';
      perms = channelPerms(this.ctx.db, c, userId);
      if (!has(perms, Permissions.VIEW_CHANNEL | Permissions.CONNECT)) return 'missing CONNECT';
      guildId = c.guild_id;
    }

    const existing = this.states.get(userId);
    if (existing && existing.channel_id !== c.id) this.leave(userId);

    const m = guildId ? getMemberRow(this.ctx.db, guildId, userId) : undefined;
    const state: VoiceState = {
      guild_id: guildId,
      channel_id: c.id,
      user_id: userId,
      session_id: session.id,
      self_mute: !!p.self_mute,
      self_deaf: !!p.self_deaf,
      self_video: !!p.self_video && has(perms, Permissions.VIDEO),
      self_stream: !!p.self_stream && has(perms, Permissions.STREAM),
      mute: !!m?.mute,
      deaf: !!m?.deaf,
    };
    this.states.set(userId, state);
    this.broadcast(state);

    if (!guildId) {
      const call = this.calls.get(c.id);
      if (call) call.ringing.delete(userId);
      else this.calls.set(c.id, { initiator: userId, ringing: new Set(), announced: false });
    }
    return null;
  }

  leave(userId: string): void {
    const state = this.states.get(userId);
    if (!state) return;
    this.states.delete(userId);
    const left: VoiceState = { ...state, channel_id: null };
    // broadcast() needs the channel id for DM fan-out, so do it by hand
    if (state.guild_id) this.ctx.gw.dispatchToGuild(state.guild_id, 'VOICE_STATE_UPDATE', left);
    else if (state.channel_id) {
      const recips = recipientIds(this.ctx.db, state.channel_id);
      this.ctx.gw.dispatchToUsers(recips, 'VOICE_STATE_UPDATE', left);
      if (this.inChannel(state.channel_id).length === 0 && this.calls.delete(state.channel_id)) {
        this.ctx.gw.dispatchToUsers(recips, 'CALL_DELETE', { channel_id: state.channel_id });
      }
    }
  }

  /** Relays a signaling payload iff sender and target are both in the named channel. */
  signal(session: Session, p: Partial<VoiceSignalPayload>): boolean {
    const from = session.userId!;
    if (!p || typeof p.channel_id !== 'string' || typeof p.target_user_id !== 'string') return false;
    if (!SIGNAL_KINDS.has(String(p.kind))) return false;
    if (p.target_user_id === from) return false;
    const mine = this.states.get(from);
    const theirs = this.states.get(p.target_user_id);
    if (!mine || !theirs || mine.channel_id !== p.channel_id || theirs.channel_id !== p.channel_id) return false;
    const payload = {
      channel_id: p.channel_id,
      target_user_id: p.target_user_id,
      kind: p.kind as VoiceSignalPayload['kind'],
      data: p.data ?? null,
      from_user_id: from,
    };
    const target = this.ctx.gw.sessions.findById(theirs.session_id);
    if (target) target.dispatch('VOICE_SIGNAL', payload);
    else this.ctx.gw.dispatchToUser(p.target_user_id, 'VOICE_SIGNAL', payload);
    return true;
  }

  /** Applies server mute/deaf from the member row to a live voice state. */
  refreshServerFlags(guildId: string, userId: string): void {
    const s = this.states.get(userId);
    if (!s || s.guild_id !== guildId) return;
    const m = getMemberRow(this.ctx.db, guildId, userId);
    s.mute = !!m?.mute;
    s.deaf = !!m?.deaf;
    this.broadcast(s);
  }

  /** Moves a user to another voice channel in the same guild (or disconnects with null). */
  move(guildId: string, userId: string, channelId: string | null): void {
    const s = this.states.get(userId);
    if (!s || s.guild_id !== guildId) return;
    if (channelId === null) {
      this.leave(userId);
      return;
    }
    const next: VoiceState = { ...s, channel_id: channelId };
    this.states.set(userId, next);
    this.broadcast(next);
  }

  removeFromGuild(guildId: string, userId?: string): void {
    for (const s of [...this.states.values()]) {
      if (s.guild_id === guildId && (!userId || s.user_id === userId)) this.leave(s.user_id);
    }
  }

  removeFromChannel(channelId: string): void {
    for (const s of this.inChannel(channelId)) this.leave(s.user_id);
  }

  /** POST /channels/:id/call/ring — returns the users being rung. */
  ring(userId: string, c: ChannelRow): string[] {
    const recips = recipientIds(this.ctx.db, c.id);
    const inCall = new Set(this.inChannel(c.id).map((s) => s.user_id));
    let call = this.calls.get(c.id);

    if (!call) {
      call = { initiator: userId, ringing: new Set(), announced: false };
      this.calls.set(c.id, call);
    }
    for (const r of recips) if (r !== userId && !inCall.has(r)) call.ringing.add(r);
    if (!call.announced) {
      call.announced = true;
      createMessage(this.ctx, { channel: c, authorId: userId, content: '', type: MessageType.CALL });
    }
    const ringing = [...call.ringing];
    this.ctx.gw.dispatchToUsers(recips, 'CALL_CREATE', { channel_id: c.id, ringing, initiator_id: call.initiator });
    // If nobody joins, the call record would linger; drop it once nobody is in voice after 60s.
    setTimeout(() => {
      if (this.closed) return;
      if (this.calls.get(c.id) === call && this.inChannel(c.id).length === 0) {
        this.calls.delete(c.id);
        this.ctx.gw.dispatchToUsers(recipientIds(this.ctx.db, c.id), 'CALL_DELETE', { channel_id: c.id });
      }
    }, 60_000).unref();
    return ringing;
  }

  clear(): void {
    this.closed = true;
    this.states.clear();
    this.calls.clear();
  }
}
