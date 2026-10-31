// Scheduled events: serialising, who sees them (gateway audience) and the status timer (going live / auto-completing).
import {
  EVENT_LIMITS, Permissions, has, type DispatchEventName, type ScheduledEvent, type ScheduledEventLocationType,
  type ScheduledEventStatus,
} from '@huddle/shared';
import type { Ctx } from '../context';
import type { Db } from '../db';
import { getChannelRow, getUserRow, publicUser } from '../serializers';
import { guildMemberIds } from '../gateway/dispatch';
import { channelPerms } from './permissions';

export interface ScheduledEventRow {
  id: string; guild_id: string; channel_id: string | null; creator_id: string | null; name: string;
  description: string | null; start_time: string; end_time: string | null; location_type: ScheduledEventLocationType;
  location: string | null; image: string | null; status: ScheduledEventStatus; created_at: string;
}

export function getEventRow(db: Db, guildId: string, id: string): ScheduledEventRow | undefined {
  return db.one<ScheduledEventRow>('SELECT * FROM scheduled_events WHERE id = ? AND guild_id = ?', id, guildId);
}

/** Interested users who are still members of the server. */
export function interestedIds(db: Db, e: ScheduledEventRow): string[] {
  return db.all<{ user_id: string }>(
    `SELECT u.user_id FROM scheduled_event_users u JOIN members m ON m.guild_id = ? AND m.user_id = u.user_id
      WHERE u.event_id = ? ORDER BY u.created_at ASC`,
    e.guild_id, e.id,
  ).map((r) => r.user_id);
}

export function serializeEvent(db: Db, e: ScheduledEventRow, viewerId: string | null, interested = interestedIds(db, e)): ScheduledEvent {
  const creator = e.creator_id ? getUserRow(db, e.creator_id) : undefined;
  return {
    id: e.id,
    guild_id: e.guild_id,
    channel_id: e.channel_id,
    creator_id: e.creator_id,
    creator: creator ? publicUser(creator) : null,
    name: e.name,
    description: e.description,
    start_time: e.start_time,
    end_time: e.end_time,
    location_type: e.location_type,
    location: e.location,
    image: e.image,
    status: e.status,
    user_count: interested.length,
    user_interested: !!viewerId && interested.includes(viewerId),
    created_at: e.created_at,
  };
}

/** Members see an event; a voice event only if they can also view its channel. */
export function canSeeEvent(db: Db, e: ScheduledEventRow, userId: string): boolean {
  if (!e.channel_id) return !!db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', e.guild_id, userId);
  const c = getChannelRow(db, e.channel_id);
  return !!c && has(channelPerms(db, c, userId), Permissions.VIEW_CHANNEL);
}

/** Online users who should hear about an event. */
export function eventAudience(ctx: Ctx, e: ScheduledEventRow): string[] {
  if (!e.channel_id) return guildMemberIds(ctx.db, e.guild_id);
  const c = getChannelRow(ctx.db, e.channel_id);
  return c ? ctx.gw.viewers(c) : [];
}

/**
 * Sends the event (with each viewer's own `user_interested`) to its audience. Pass the audience from before an edit
 * so people who can no longer see it (moved to a channel they can't view) get a delete instead.
 */
export function dispatchEvent(
  ctx: Ctx, t: Extract<DispatchEventName, 'SCHEDULED_EVENT_CREATE' | 'SCHEDULED_EVENT_UPDATE'>, e: ScheduledEventRow,
  prevAudience?: string[],
): void {
  const audience = eventAudience(ctx, e);
  if (prevAudience) {
    const still = new Set(audience);
    ctx.gw.dispatchToUsers(prevAudience.filter((u) => !still.has(u)), 'SCHEDULED_EVENT_DELETE', { id: e.id, guild_id: e.guild_id });
  }
  const interested = interestedIds(ctx.db, e);
  const base = serializeEvent(ctx.db, e, null, interested);
  const set = new Set(interested);
  ctx.gw.dispatchToUsers(audience, t, (u) => ({ ...base, user_interested: set.has(u) }));
}

/** Moves an event from its current status to `status` (no-op if someone got there first) and tells its audience. */
export function setEventStatus(ctx: Ctx, e: ScheduledEventRow, status: ScheduledEventStatus): ScheduledEventRow | null {
  const r = ctx.db.run('UPDATE scheduled_events SET status = ? WHERE id = ? AND status = ?', status, e.id, e.status);
  if (!r.changes) return null;
  const next = { ...e, status };
  dispatchEvent(ctx, 'SCHEDULED_EVENT_UPDATE', next);
  return next;
}

/** When an open event is over: its end time, or a day after it starts without one. */
export const eventEndsAt = (e: Pick<ScheduledEventRow, 'start_time' | 'end_time'>): number =>
  e.end_time ? Date.parse(e.end_time) : Date.parse(e.start_time) + EVENT_LIMITS.DEFAULT_DURATION_MS;

/**
 * Runs on a timer (see app.ts): open events past their end complete; external events go live at their start time
 * (voice events wait for their creator or a manager to start them). Returns how many changed.
 */
export function advanceScheduledEvents(ctx: Ctx, at = Date.now()): number {
  const due = ctx.db.all<ScheduledEventRow>(
    "SELECT * FROM scheduled_events WHERE status IN ('scheduled', 'active') AND start_time <= ?", new Date(at).toISOString(),
  );
  let n = 0;
  for (const e of due) {
    if (eventEndsAt(e) <= at) {
      if (setEventStatus(ctx, e, 'completed')) n++;
    } else if (e.status === 'scheduled' && e.location_type === 'external') {
      if (setEventStatus(ctx, e, 'active')) n++;
    }
  }
  return n;
}
