import type { Db } from './db';
import type { TokenService } from './auth';
import type { RateLimiter } from './ratelimit';
import type { Gateway } from './gateway';
import type { VoiceManager } from './gateway/voice';

export interface Config {
  uploadsDir: string;
  heartbeatInterval: number;
  production: boolean;
  webDist: string;
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
}

export const now = (): string => new Date().toISOString();
