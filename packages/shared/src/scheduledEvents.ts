// Scheduled server events: a time + place (a voice channel, or somewhere else) members can mark themselves interested in.
import type { PublicUser } from './models';

export type ScheduledEventStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
/** voice = one of the server's voice channels (channel_id); external = free-text `location`. */
export type ScheduledEventLocationType = 'voice' | 'external';

export interface ScheduledEvent {
  id: string;
  guild_id: string;
  /** Set for voice events; only members who can view this channel see the event. */
  channel_id: string | null;
  creator_id: string | null;
  creator: PublicUser | null;
  name: string;
  description: string | null;
  start_time: string;
  /** Without one the event auto-completes 24h after it starts. */
  end_time: string | null;
  location_type: ScheduledEventLocationType;
  /** Text location for external events. */
  location: string | null;
  /** Cover image (/uploads/…). */
  image: string | null;
  status: ScheduledEventStatus;
  /** Members marked interested. */
  user_count: number;
  /** Whether the viewer is interested. */
  user_interested: boolean;
  created_at: string;
}

/** POST /guilds/:id/scheduled-events (PATCH takes the same fields, all optional). Cover image: POST …/:eid/cover. */
export interface ScheduledEventCreate {
  name: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  location_type: ScheduledEventLocationType;
  channel_id?: string | null;
  location?: string | null;
}

export const EVENT_LIMITS = {
  NAME: 100,
  DESCRIPTION: 1000,
  LOCATION: 100,
  COVER_BYTES: 2 * 1024 * 1024,
  /** Events with no end time complete this long after they start. */
  DEFAULT_DURATION_MS: 24 * 3600_000,
} as const;

export const eventIsLive = (e: Pick<ScheduledEvent, 'status'>): boolean => e.status === 'active';
export const eventIsOpen = (e: Pick<ScheduledEvent, 'status'>): boolean => e.status === 'scheduled' || e.status === 'active';
