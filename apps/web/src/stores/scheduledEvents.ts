// Scheduled events, loaded per server when it's opened (GET /guilds/:id/scheduled-events) and kept current by
// the SCHEDULED_EVENT_* dispatches. Only open (scheduled / live) events are listed; ended ones drop out.
import { useMemo } from 'react';
import { create } from 'zustand';
import { eventIsOpen, type ScheduledEvent } from '@huddle/shared';

interface EventState {
  byId: Record<string, ScheduledEvent>;
  /** guildId → list fetched (cleared on READY so a reconnect refetches). */
  loaded: Record<string, boolean>;
  setGuild(guildId: string, list: ScheduledEvent[]): void;
  upsert(e: ScheduledEvent): void;
  remove(id: string): void;
  interest(eventId: string, userId: string, count: number, on: boolean, me: string): void;
  dropWhere(pred: (e: ScheduledEvent) => boolean): void;
  reset(): void;
}

export const useEventStore = create<EventState>()((set) => ({
  byId: {},
  loaded: {},
  setGuild: (guildId, list) => set((s) => {
    const byId = Object.fromEntries(Object.entries(s.byId).filter(([, e]) => e.guild_id !== guildId));
    for (const e of list) byId[e.id] = e;
    return { byId, loaded: { ...s.loaded, [guildId]: true } };
  }),
  upsert: (e) => set((s) => ({ byId: { ...s.byId, [e.id]: e } })),
  remove: (id) => set((s) => {
    if (!s.byId[id]) return {};
    const { [id]: _gone, ...byId } = s.byId;
    return { byId };
  }),
  interest: (eventId, userId, count, on, me) => set((s) => {
    const e = s.byId[eventId];
    if (!e) return {};
    return { byId: { ...s.byId, [eventId]: { ...e, user_count: count, user_interested: userId === me ? on : e.user_interested } } };
  }),
  dropWhere: (pred) => set((s) => ({ byId: Object.fromEntries(Object.entries(s.byId).filter(([, e]) => !pred(e))) })),
  reset: () => set({ byId: {}, loaded: {} }),
}));

const byStart = (a: ScheduledEvent, b: ScheduledEvent) => Date.parse(a.start_time) - Date.parse(b.start_time);

/** A server's open events, live ones first, then soonest. */
export function useGuildEvents(guildId: string | null | undefined): ScheduledEvent[] {
  const byId = useEventStore((s) => s.byId);
  return useMemo(() => {
    const list = Object.values(byId).filter((e) => e.guild_id === guildId && eventIsOpen(e));
    return list.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || byStart(a, b));
  }, [byId, guildId]);
}

/** The live event happening in a voice channel, if any. */
export function useLiveEventIn(channelId: string): ScheduledEvent | undefined {
  return useEventStore((s) => {
    for (const e of Object.values(s.byId)) if (e.channel_id === channelId && e.status === 'active') return e;
    return undefined;
  });
}
