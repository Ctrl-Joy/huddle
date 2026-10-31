// Scheduled event REST actions + display helpers (times in the viewer's zone, following the 12/24h preference).
import type { PublicUser, ScheduledEvent, ScheduledEventCreate } from '@huddle/shared';
import { api, errorMessage, uploadWithProgress } from '../api/client';
import { useEventStore } from '../stores/scheduledEvents';
import { useGuildStore } from '../stores/guilds';
import { useAuthStore } from '../stores/auth';
import { toast } from '../stores/ui';
import { formatTime } from './format';

const base = (guildId: string) => `/guilds/${guildId}/scheduled-events`;
const pending = new Map<string, Promise<void>>();

/** Fetches a server's open events once (deduped); `force` refetches. */
export function loadGuildEvents(guildId: string, force = false): Promise<void> {
  if (!force && useEventStore.getState().loaded[guildId]) return Promise.resolve();
  let p = pending.get(guildId);
  if (!p) {
    p = api.get<ScheduledEvent[]>(base(guildId))
      .then((list) => useEventStore.getState().setGuild(guildId, list))
      .catch(() => {})
      .finally(() => pending.delete(guildId));
    pending.set(guildId, p);
  }
  return p;
}

async function uploadCover(e: ScheduledEvent, file: File): Promise<ScheduledEvent> {
  const form = new FormData();
  form.append('file', file);
  return uploadWithProgress<ScheduledEvent>(`${base(e.guild_id)}/${e.id}/cover`, form).promise;
}

/** `cover`: a new image, null to remove the current one, undefined to leave it. */
export async function saveEvent(
  guildId: string, body: Partial<ScheduledEventCreate>, cover: File | null | undefined, eventId?: string,
): Promise<ScheduledEvent> {
  let e = eventId
    ? await api.patch<ScheduledEvent>(`${base(guildId)}/${eventId}`, body)
    : await api.post<ScheduledEvent>(base(guildId), body);
  useEventStore.getState().upsert(e);
  try {
    if (cover) e = await uploadCover(e, cover);
    else if (cover === null && e.image) e = await api.del<ScheduledEvent>(`${base(guildId)}/${e.id}/cover`);
    useEventStore.getState().upsert(e);
  } catch (err) {
    toast('Cover image upload failed: ' + errorMessage(err), 'error');
  }
  return e;
}

export async function deleteEvent(e: ScheduledEvent): Promise<void> {
  await api.del(`${base(e.guild_id)}/${e.id}`);
  useEventStore.getState().remove(e.id);
}

/** start | end | cancel */
export async function setEventStatus(e: ScheduledEvent, action: 'start' | 'end' | 'cancel'): Promise<void> {
  const next = await api.post<ScheduledEvent>(`${base(e.guild_id)}/${e.id}/${action}`);
  useEventStore.getState().upsert(next);
}

/** Optimistic "Interested" toggle. */
export async function toggleInterested(e: ScheduledEvent): Promise<void> {
  const me = useAuthStore.getState().user?.id ?? '';
  const on = !e.user_interested;
  const store = useEventStore.getState();
  store.interest(e.id, me, e.user_count + (on ? 1 : -1), on, me);
  try {
    const next = on
      ? await api.put<ScheduledEvent>(`${base(e.guild_id)}/${e.id}/users/@me`)
      : await api.del<ScheduledEvent>(`${base(e.guild_id)}/${e.id}/users/@me`);
    useEventStore.getState().upsert(next);
  } catch (err) {
    useEventStore.getState().interest(e.id, me, e.user_count, !on, me);
    toast(errorMessage(err), 'error');
  }
}

export async function fetchInterested(e: ScheduledEvent): Promise<PublicUser[]> {
  const users = await api.get<PublicUser[]>(`${base(e.guild_id)}/${e.id}/users`);
  useGuildStore.getState().upsertUsers(users);
  return users;
}

/** Opens the server with this event's details showing (see ChannelSidebar). */
export const eventLink = (e: ScheduledEvent): string => `${location.origin}/channels/${e.guild_id}?event=${e.id}`;

// ---- display ----

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

function dayLabel(d: Date): string {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, tomorrow)) return 'Tomorrow';
  return (d.getFullYear() === today.getFullYear() ? dayFmt : dayYearFmt).format(d);
}

/** "Tomorrow at 7:00 PM" / "Sat, Nov 8 at 19:00" */
export function formatEventStart(iso: string): string {
  return `${dayLabel(new Date(iso))} at ${formatTime(iso)}`;
}

/** Start – end in one line; the end drops its day when it's the same day. */
export function formatEventRange(e: Pick<ScheduledEvent, 'start_time' | 'end_time'>): string {
  const start = formatEventStart(e.start_time);
  if (!e.end_time) return start;
  const sameDay = new Date(e.start_time).toDateString() === new Date(e.end_time).toDateString();
  return `${start} – ${sameDay ? formatTime(e.end_time) : formatEventStart(e.end_time)}`;
}

/** Short status line for cards: "Live now", "Starts in 25 min", "Starting soon", or the start time. */
export function eventWhenLabel(e: ScheduledEvent, now = Date.now()): string {
  if (e.status === 'active') return 'Live now';
  const ms = Date.parse(e.start_time) - now;
  if (ms <= 0) return 'Starting soon';
  if (ms < 3600_000) return `Starts in ${Math.max(1, Math.round(ms / 60_000))} min`;
  return formatEventStart(e.start_time);
}

/** `<input type="date">` / `<input type="time">` values (local) for an ISO time, and back. */
export function toDateTimeInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
export function fromDateTimeInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
