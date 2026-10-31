import type { Db } from './db';
import type { TokenService } from './auth';
import type { RateLimiter } from './ratelimit';
import type { Gateway } from './gateway';
import type { VoiceManager } from './gateway/voice';
import type { LinkPreviews } from './services/linkPreview';
import type { GifService } from './services/gifs';
import type { Mailer } from './services/mailer';
import type { VerificationCodes } from './services/verification';

export interface Config {
  uploadsDir: string;
  heartbeatInterval: number;
  production: boolean;
  webDist: string;
  /** New accounts must confirm their email (SMTP configured, or HUDDLE_REQUIRE_EMAIL_VERIFICATION=1). */
  requireEmailVerification: boolean;
  /** Base URL for links in emails, without a trailing slash. */
  publicUrl: string;
}

/** Everything a route/service needs; one per buildApp() instance (no module singletons). */
export interface Ctx {
  db: Db;
  cfg: Config;
  /** Snowflake id generator. */
  id: () => string;
  tokens: TokenService;
  limiter: RateLimiter;
  gw: Gateway;
  voice: VoiceManager;
  /** In-memory slow-mode tracker: `${channelId}:${userId}` → last send ms. */
  slowmode: Map<string, number>;
  /** Background link-preview fetcher (swap `previews.fetcher` in tests). */
  previews: LinkPreviews;
  /** GIF search proxy (disabled without HUDDLE_GIF_API_KEY). */
  gifs: GifService;
  /** Outgoing email (SMTP, or the dev console). */
  mail: Mailer;
  /** Verification / password reset codes. */
  codes: VerificationCodes;
}

export const now = (): string => new Date().toISOString();
