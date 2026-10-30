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
  /** Text channel where by default only members with MANAGE_MESSAGES can post. */
  GUILD_ANNOUNCEMENT = 5,
  /** A thread: child channel of a text / announcement / forum channel (parent_id = that channel). */
  PUBLIC_THREAD = 11,
  /** No messages of its own; every post is a thread with a title and a starter message. */
  GUILD_FORUM = 15,
}

export enum MessageType {
  DEFAULT = 0,
  RECIPIENT_ADD = 1,
  RECIPIENT_REMOVE = 2,
  CALL = 3,
  CHANNEL_NAME_CHANGE = 4,
  CHANNEL_PINNED_MESSAGE = 6,
  GUILD_MEMBER_JOIN = 7,
  /** Posted in the parent channel when a thread starts; content = thread name, `thread` = the thread. */
  THREAD_CREATED = 18,
  REPLY = 19,
  /** System line posted when a poll closes; message_reference points at the poll. */
  POLL_RESULT = 46,
}

/** Bit flags on Message.flags. */
export enum MessageFlags {
  SUPPRESS_EMBEDS = 1 << 2,
  IS_VOICE_MESSAGE = 1 << 13,
}

/** Bit flags on Attachment.flags. */
export enum AttachmentFlags {
  IS_VOICE_MESSAGE = 1 << 0,
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
  /** Uploaded profile banner image (/uploads/…); shown instead of banner_color. Always sent by the server. */
  banner?: string | null;
  /** #rrggbb profile theme colour (card outline + headings). */
  accent_color?: string | null;
  pronouns?: string | null;
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
  /** Threads only (owner_id above is the thread creator). */
  thread_metadata?: ThreadMetadata;
  /** Threads only: messages sent in the thread (a forum post's starter message isn't counted). */
  message_count?: number;
  /** Threads only. */
  last_message_at?: string | null;
  /** Threads only: the message the thread was started from (in the parent channel; for forum posts, the post's first message). */
  starter_message_id?: string | null;
  /** Forum posts only: ids from the parent forum's available_tags. */
  applied_tags?: string[];
  /** Forum posts only, on create / list payloads: the starter message (for post cards). */
  starter_message?: Message | null;
  /** Forum channels only. */
  available_tags?: ForumTag[];
}

export interface ThreadMetadata {
  archived: boolean;
  archive_timestamp: string | null;
  /** Minutes of inactivity after which the server archives the thread. */
  auto_archive_duration: number;
}

export interface ForumTag {
  id: string;
  name: string;
  emoji: string | null; // unicode emoji
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
  /** Non-archived threads and forum posts (archived ones are fetched per channel). */
  threads?: Channel[];
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
  /** AttachmentFlags bits (voice message, …). */
  flags?: number;
  /** Voice messages: length in seconds. */
  duration_secs?: number | null;
  /** Voice messages: base64 of up to 256 amplitude bytes (0–255), computed by the sender. */
  waveform?: string | null;
}

/** Link preview built from a page's OpenGraph / Twitter / meta tags. Images are hot-linked, never proxied. */
export interface Embed {
  url: string;
  type: 'link';
  title: string | null;
  description: string | null;
  site_name: string | null;
  color: number | null; // from <meta name="theme-color">
  image: { url: string; width: number | null; height: number | null } | null;
}

export interface PollAnswer {
  answer_id: number; // 1-based, stable for the poll's lifetime
  text: string;
  emoji: string | null; // unicode emoji
  count: number;
  me: boolean; // the viewer voted for this answer
}

export interface Poll {
  question: string;
  answers: PollAnswer[];
  allow_multiselect: boolean;
  expires_at: string;
  /** Set once the server has closed the poll (votes are refused after expires_at either way). */
  ended: boolean;
}

/** Body field `poll` on POST /channels/:id/messages. */
export interface PollCreate {
  question: string;
  answers: { text: string; emoji?: string | null }[];
  /** Hours; one of LIMITS.POLL_DURATIONS_HOURS. */
  duration: number;
  allow_multiselect?: boolean;
}

/** Frozen copy of a forwarded message. Attachments point at the original files. */
export interface MessageSnapshot {
  message_id: string;
  channel_id: string;
  guild_id: string | null;
  author: PublicUser;
  content: string;
  created_at: string;
  edited_at: string | null;
  attachments: Attachment[];
  embeds: Embed[];
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
  /** MessageFlags bits. */
  flags?: number;
  /** Link previews (empty when SUPPRESS_EMBEDS is set). */
  embeds?: Embed[];
  poll?: Poll | null;
  /** Set when this message forwards another one. */
  forward?: MessageSnapshot | null;
  /** The thread started from this message (for THREAD_CREATED system messages: the thread that was started). */
  thread?: Channel | null;
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

/** A named, coloured group of servers in the server rail. */
export interface GuildFolder {
  id: string; // client-generated, [A-Za-z0-9_-]{1,32}
  name: string | null;
  color: string | null; // #rrggbb
  guild_ids: string[];
}

/** Per-user settings document synced across devices (GET/PATCH /users/@me/settings). */
export interface UserSettings {
  guild_folders: GuildFolder[];
  /** Rail order of every guild; a folder sits where its first guild is. */
  guild_positions: string[];
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
  POLL_QUESTION: 300,
  POLL_ANSWER: 55,
  POLL_ANSWERS_MIN: 2,
  POLL_ANSWERS_MAX: 10,
  POLL_DURATIONS_HOURS: [1, 4, 8, 24, 72, 168],
  FORWARD_TARGETS: 5,
  EMBEDS_PER_MESSAGE: 3,
  VOICE_MESSAGE_SECS: 180,
  VOICE_WAVEFORM_BYTES: 256,
  USER_BANNER_BYTES: 2 * 1024 * 1024,
  PRONOUNS: 40,
  BIO: 190,
  GUILD_FOLDERS: 100,
  FOLDER_NAME: 32,
  THREAD_NAME: 100,
  FORUM_TAGS: 10,
  FORUM_TAG_NAME: 20,
  TAGS_PER_POST: 5,
} as const;
