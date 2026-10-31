// REST response envelopes that aren't plain model objects (added by the server; additive only).
import type { AuditLogEntry, Channel, Message, PublicUser, User } from './models';

/** POST /auth/register, POST /auth/login, POST /auth/password/reset */
export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * PATCH /users/@me — the updated user. Changing the password revokes every other session and hands this one
 * a fresh `token` (the old one stops working).
 */
export type UserUpdateResponse = User & { token?: string };

/** POST /auth/verify-email/resend, or PATCH /users/@me with a new email (the code goes to `email`). */
export interface VerificationSentResponse {
  email: string;
  /** Seconds before another code can be requested. */
  resend_after: number;
}

/** POST /auth/password/forgot — identical whether or not the account exists. */
export interface ForgotPasswordResponse {
  ok: true;
}

/** GET /users/:id */
export interface UserProfile extends PublicUser {
  mutual_guild_ids: string[];
  mutual_friend_ids: string[];
}

/** GET /guilds/:id/audit-logs?limit&before&user_id&action_type */
export interface AuditLogResponse {
  audit_log_entries: AuditLogEntry[];
  /** Every actor and target user referenced by the entries. */
  users: PublicUser[];
}

/** GET /guilds/:id/messages/search?content&author_id&channel_id&limit&offset */
export interface MessageSearchResponse {
  total_results: number;
  /** Newest first. */
  messages: Message[];
}

/** POST /channels/:id/call/ring */
export interface CallRingResponse {
  channel_id: string;
  ringing: string[];
}

/**
 * GET /channels/:id/threads?archived&q&tag&sort&limit — threads of a text / announcement / forum channel.
 * Forum posts carry `starter_message`. sort: 'activity' (default) | 'created'.
 */
export interface ThreadListResponse {
  threads: Channel[];
  has_more: boolean;
}
