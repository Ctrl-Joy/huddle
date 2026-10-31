import type {
  Channel, FullGuild, Guild, GuildEmoji, Member, Message, Presence, PresenceStatus, PublicUser, ReadState,
  Relationship, Role, User, UserGuildSettings, UserSettings, VoiceState,
} from './models';
import type { CustomEmojiRef } from './emojis';
import type { GuildSticker } from './stickers';
import type { ScheduledEvent } from './scheduledEvents';
import type { SoundboardPlayEvent, SoundboardSound } from './soundboard';

export enum GatewayOp {
  DISPATCH = 0,
  HEARTBEAT = 1,
  IDENTIFY = 2,
  PRESENCE_UPDATE = 3,
  VOICE_STATE_UPDATE = 4,
  HELLO = 10,
  HEARTBEAT_ACK = 11,
  /** WebRTC signaling relay (client → server → target client and back). */
  VOICE_SIGNAL = 20,
}

export enum GatewayCloseCode {
  UNKNOWN_ERROR = 4000,
  DECODE_ERROR = 4002,
  NOT_AUTHENTICATED = 4003,
  AUTHENTICATION_FAILED = 4004,
  SESSION_TIMED_OUT = 4009,
  /** The account's sessions were revoked (password changed/reset): reconnect with the current token. */
  SESSION_INVALIDATED = 4011,
  /** The account's email isn't verified yet; don't reconnect until it is. */
  EMAIL_NOT_VERIFIED = 4012,
}

export interface GatewayFrame<D = unknown> {
  op: GatewayOp;
  d?: D;
  s?: number; // sequence, DISPATCH only
  t?: keyof DispatchEvents; // event name, DISPATCH only
}

// ---- client → server payloads ----
export interface IdentifyPayload { token: string }
export interface PresenceUpdatePayload { status: PresenceStatus; custom_status?: string | null }
export interface VoiceStateUpdatePayload {
  guild_id: string | null; // null for DM calls
  channel_id: string | null; // null = disconnect
  self_mute: boolean;
  self_deaf: boolean;
  self_video: boolean;
  self_stream: boolean;
}
export type VoiceSignalKind = 'offer' | 'answer' | 'ice';
export interface VoiceSignalPayload {
  channel_id: string;
  target_user_id: string;
  kind: VoiceSignalKind;
  data: unknown; // RTCSessionDescriptionInit | RTCIceCandidateInit
}

// ---- server → client ----
export interface HelloPayload { heartbeat_interval: number }

export interface ReadyPayload {
  session_id: string;
  user: User;
  guilds: FullGuild[];
  private_channels: Channel[]; // DMs & group DMs
  relationships: Relationship[];
  presences: Presence[]; // friends + DM recipients
  read_states: ReadState[];
  user_guild_settings: UserGuildSettings[];
  /** Server folders + rail order (synced across devices). */
  user_settings: UserSettings;
  /** Voice states for DM calls the user can see. */
  voice_states: VoiceState[];
}

/** Every DISPATCH event name and its `d` payload. */
export interface DispatchEvents {
  READY: ReadyPayload;
  USER_UPDATE: User | PublicUser;

  GUILD_CREATE: FullGuild; // joined / created a guild
  GUILD_UPDATE: Guild;
  GUILD_DELETE: { id: string }; // left, kicked, banned, or deleted

  GUILD_MEMBER_ADD: Member;
  GUILD_MEMBER_UPDATE: Member;
  GUILD_MEMBER_REMOVE: { guild_id: string; user: PublicUser };
  GUILD_BAN_ADD: { guild_id: string; user: PublicUser };
  GUILD_BAN_REMOVE: { guild_id: string; user: PublicUser };

  GUILD_ROLE_CREATE: { guild_id: string; role: Role };
  GUILD_ROLE_UPDATE: { guild_id: string; role: Role };
  GUILD_ROLE_DELETE: { guild_id: string; role_id: string };
  /** Full replacement list after any emoji create / rename / delete. */
  GUILD_EMOJIS_UPDATE: { guild_id: string; emojis: GuildEmoji[] };
  /** Full replacement list after any sticker create / edit / delete. */
  GUILD_STICKERS_UPDATE: { guild_id: string; stickers: GuildSticker[] };

  CHANNEL_CREATE: Channel;
  CHANNEL_UPDATE: Channel;
  CHANNEL_DELETE: Channel;
  /** Threads (and forum posts) go to everyone who can view the parent channel. */
  THREAD_CREATE: Channel;
  THREAD_UPDATE: Channel;
  THREAD_DELETE: { id: string; guild_id: string; parent_id: string };
  CHANNEL_PINS_UPDATE: { channel_id: string; guild_id: string | null };

  MESSAGE_CREATE: Message;
  MESSAGE_UPDATE: Message;
  MESSAGE_DELETE: { id: string; channel_id: string; guild_id: string | null };
  MESSAGE_REACTION_ADD: { user_id: string; channel_id: string; message_id: string; guild_id: string | null; emoji: string; custom_emoji?: CustomEmojiRef | null };
  MESSAGE_REACTION_REMOVE: { user_id: string; channel_id: string; message_id: string; guild_id: string | null; emoji: string; custom_emoji?: CustomEmojiRef | null };
  MESSAGE_ACK: ReadState;
  /** One per answer added / removed when a member changes their vote set. */
  MESSAGE_POLL_VOTE_ADD: { user_id: string; channel_id: string; message_id: string; guild_id: string | null; answer_id: number };
  MESSAGE_POLL_VOTE_REMOVE: { user_id: string; channel_id: string; message_id: string; guild_id: string | null; answer_id: number };

  TYPING_START: { channel_id: string; guild_id: string | null; user_id: string; timestamp: number; member?: Member };

  PRESENCE_UPDATE: Presence & { guild_id?: string };

  RELATIONSHIP_ADD: Relationship;
  RELATIONSHIP_REMOVE: { id: string; type: number };

  USER_GUILD_SETTINGS_UPDATE: UserGuildSettings;

  /** Scheduled events go to members who can see the server (and the event's voice channel, if any). */
  SCHEDULED_EVENT_CREATE: ScheduledEvent;
  SCHEDULED_EVENT_UPDATE: ScheduledEvent;
  SCHEDULED_EVENT_DELETE: { id: string; guild_id: string };
  SCHEDULED_EVENT_INTEREST_ADD: { event_id: string; guild_id: string; user_id: string; user_count: number };
  SCHEDULED_EVENT_INTEREST_REMOVE: { event_id: string; guild_id: string; user_id: string; user_count: number };
  /** Sent to all of the user's own sessions after PATCH /users/@me/settings. */
  USER_SETTINGS_UPDATE: UserSettings;

  VOICE_STATE_UPDATE: VoiceState; // channel_id null = left
  VOICE_SIGNAL: VoiceSignalPayload & { from_user_id: string };
  CALL_CREATE: { channel_id: string; ringing: string[]; initiator_id: string };
  CALL_DELETE: { channel_id: string };
  /** Sent only to the members connected to that voice channel / DM call. */
  SOUNDBOARD_SOUND_PLAY: SoundboardPlayEvent;
  /** Full replacement list after any uploaded soundboard sound create / edit / delete. */
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: { guild_id: string; sounds: SoundboardSound[] };
}

export type DispatchEventName = keyof DispatchEvents;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const TYPING_TIMEOUT_MS = 8_000;
