// API object shapes. All ids are snowflake strings, all timestamps ISO-8601 strings,
// all permission values decimal bigint strings.
import type { GuildCategory } from './discovery';
import type { CustomEmojiRef } from './emojis';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export enum ChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
}

export enum MessageType {
  DEFAULT = 0,
  RECIPIENT_ADD = 1,
  RECIPIENT_REMOVE = 2,
  CALL = 3,
  CHANNEL_NAME_CHANGE = 4,
  CHANNEL_PINNED_MESSAGE = 6,
  GUILD_MEMBER_JOIN = 7,
  REPLY = 19,
}

export enum RelationshipType {
  FRIEND = 1,
  BLOCKED = 2,
  PENDING_INCOMING = 3,
  PENDING_OUTGOING = 4,
}

export enum NotificationLevel {
  ALL_MESSAGES = 0,
  ONLY_MENTIONS = 1,
  NOTHING = 2,
}

/** What everyone can see about a user. */
export interface PublicUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null; // url path, e.g. /uploads/avatars/<file>
  banner_color: string | null;
  bio: string | null;
  bot?: boolean;
  created_at: string;
}

/** The current user (includes private fields). */
export interface User extends PublicUser {
  email: string;
  custom_status: string | null;
  status: PresenceStatus; // preferred status (what they set), not the computed presence
}

export interface Presence {
  user_id: string;
  status: PresenceStatus; // computed: invisible is reported to others as offline
  custom_status: string | null;
}

export interface Role {
  id: string;
  guild_id: string;
  name: string;
  color: number; // 0 = no colour
  hoist: boolean;
  mentionable: boolean;
  position: number; // @everyone = 0
  permissions: string;
}

export interface Member {
  guild_id: string;
  user: PublicUser;
  nick: string | null;
  roles: string[]; // role ids, excluding @everyone
  joined_at: string;
  communication_disabled_until: string | null;
  mute: boolean; // server mute
  deaf: boolean; // server deafen
}

export interface PermissionOverwrite {
  id: string;
  type: 0 | 1; // 0 role, 1 member
  allow: string;
  deny: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  guild_id: string | null;
  name: string | null;
  topic: string | null;
  position: number;
  parent_id: string | null;
  rate_limit_per_user: number;
  last_message_id: string | null;
  permission_overwrites: PermissionOverwrite[];
  /** DM / group DM only */
  recipients?: PublicUser[];
  owner_id?: string | null; // group DM owner
  icon?: string | null;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  owner_id: string;
  system_channel_id: string | null;
  created_at: string;
  /** Listed in the public server directory (see discovery.ts). */
  discoverable: boolean;
  category: GuildCategory | null;
  /** #rrggbb used for the directory card banner. */
  banner_color: string | null;
  /** Uploaded directory banner image (/uploads/…); the card falls back to banner_color. */
  banner: string | null;
  /** Shown with a badge in Discover. Set by seed/admin tooling only. */
  verified: boolean;
}

/** Guild as delivered in READY / GUILD_CREATE — includes nested collections. */
export interface FullGuild extends Guild {
  roles: Role[];
  channels: Channel[];
  members: Member[];
  presences: Presence[];
  voice_states: VoiceState[];
  member_count: number;
  /** Custom emoji uploaded to this server. */
  emojis?: GuildEmoji[];
}

/** A custom emoji uploaded to a server (see emojis.ts for the message token format). */
export interface GuildEmoji {
  id: string;
  guild_id: string;
  name: string;
  url: string; // /uploads/emojis/<id>.<ext>
  animated: boolean; // GIF
  creator_id: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  content_type: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface Reaction {
  emoji: string; // unicode emoji, or "c:<id>" for a custom emoji
  custom_emoji?: CustomEmojiRef | null; // set for custom emoji reactions
  count: number;
  me: boolean;
  user_ids?: string[]; // first up to 25 reactors, for tooltips
}

export interface MessageReference {
  message_id: string;
  channel_id: string;
}

export interface Message {
  id: string;
  channel_id: string;
  guild_id: string | null;
  author: PublicUser;
  member?: { nick: string | null; roles: string[] } | null;
  content: string;
  type: MessageType;
  created_at: string;
  edited_at: string | null;
  pinned: boolean;
  mention_everyone: boolean;
  mentions: string[]; // user ids
  mention_roles: string[];
  attachments: Attachment[];
  reactions: Reaction[];
  message_reference: MessageReference | null;
  referenced_message: Message | null; // one level only
  nonce?: string | null;
}

export interface Relationship {
  id: string; // the other user's id
  type: RelationshipType;
  user: PublicUser;
  since: string;
}

export interface ReadState {
  channel_id: string;
  last_read_message_id: string | null;
  mention_count: number;
}

export interface UserGuildSettings {
  guild_id: string;
  muted: boolean;
  message_notifications: NotificationLevel;
  suppress_everyone: boolean;
  channel_overrides: { channel_id: string; muted: boolean }[];
}

export interface VoiceState {
  guild_id: string | null;
  channel_id: string | null;
  user_id: string;
  session_id: string;
  self_mute: boolean;
  self_deaf: boolean;
  self_video: boolean;
  self_stream: boolean;
  mute: boolean; // server
  deaf: boolean; // server
}

export interface Invite {
  code: string;
  guild: Pick<Guild, 'id' | 'name' | 'icon' | 'description'>;
  channel: Pick<Channel, 'id' | 'name' | 'type'>;
  inviter: PublicUser | null;
  uses: number;
  max_uses: number; // 0 = unlimited
  max_age: number; // seconds, 0 = never
  created_at: string;
  expires_at: string | null;
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

export interface Ban {
  user: PublicUser;
  reason: string | null;
}

export enum AuditLogAction {
  GUILD_UPDATE = 1,
  CHANNEL_CREATE = 10,
  CHANNEL_UPDATE = 11,
  CHANNEL_DELETE = 12,
  CHANNEL_OVERWRITE_UPDATE = 14,
  CHANNEL_OVERWRITE_DELETE = 15,
  MEMBER_KICK = 20,
  MEMBER_BAN_ADD = 22,
  MEMBER_BAN_REMOVE = 23,
  MEMBER_UPDATE = 24,
  MEMBER_ROLE_UPDATE = 25,
  MEMBER_MOVE = 26,
  MEMBER_DISCONNECT = 27,
  ROLE_CREATE = 30,
  ROLE_UPDATE = 31,
  ROLE_DELETE = 32,
  INVITE_CREATE = 40,
  INVITE_DELETE = 42,
  MESSAGE_DELETE = 72,
  MESSAGE_PIN = 74,
  MESSAGE_UNPIN = 75,
  EMOJI_CREATE = 80,
  EMOJI_UPDATE = 81,
  EMOJI_DELETE = 82,
}

export interface AuditLogEntry {
  id: string;
  guild_id: string;
  user_id: string;
  target_id: string | null;
  action_type: AuditLogAction;
  changes: { key: string; old_value?: unknown; new_value?: unknown }[];
  reason: string | null;
  created_at: string;
}

export interface ApiError {
  message: string;
  code: number;
  errors?: Record<string, string>;
}

export const LIMITS = {
  MESSAGE_LENGTH: 4000,
  ATTACHMENTS_PER_MESSAGE: 10,
  ATTACHMENT_BYTES: 25 * 1024 * 1024,
  GUILD_NAME: 100,
  CHANNEL_NAME: 100,
  USERNAME_MIN: 2,
  USERNAME_MAX: 32,
  PASSWORD_MIN: 8,
  GROUP_DM_RECIPIENTS: 10,
  MESSAGES_PAGE: 50,
  GUILD_BANNER_BYTES: 2 * 1024 * 1024,
} as const;
