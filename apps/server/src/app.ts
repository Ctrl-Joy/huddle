import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createSnowflakeGenerator, LIMITS } from '@huddle/shared';
import { Db } from './db';
import { TokenService, bearer, resolveSecret } from './auth';
import { RateLimiter, DEFAULT_RATE_LIMITS, type RateLimitConfig } from './ratelimit';
import { Gateway } from './gateway';
import { VoiceManager } from './gateway/voice';
import { ApiErr, ErrorCode, emailNotVerified, tooMany, unauthorized } from './errors';
import type { Ctx } from './context';
import { Mailer, smtpTransportFromEnv, type MailTransport } from './services/mailer';
import { VerificationCodes } from './services/verification';
import { authenticate, needsVerification } from './services/accounts';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import relationshipRoutes from './routes/relationships';
import guildRoutes from './routes/guilds';
import channelRoutes from './routes/channels';
import messageRoutes from './routes/messages';
import roleRoutes from './routes/roles';
import memberRoutes from './routes/members';
import inviteRoutes from './routes/invites';
import banRoutes from './routes/bans';
import auditRoutes from './routes/audit';
import searchRoutes from './routes/search';
import emojiRoutes from './routes/emojis';
import soundboardRoutes from './routes/soundboard';
import discoveryRoutes from './routes/discovery';
import threadRoutes from './routes/threads';
import { archiveStaleThreads } from './services/threads';
import userSettingsRoutes from './routes/userSettings';
import messageFeatureRoutes from './routes/messageFeatures';
import { finalizeExpiredPolls } from './services/polls';
import scheduledEventRoutes from './routes/scheduledEvents';
import { advanceScheduledEvents } from './services/scheduledEvents';
import { LinkPreviews, type PageFetcher } from './services/linkPreview';
import { GifService, type GifFetch } from './services/gifs';
import stickerRoutes from './routes/stickers';
import gifRoutes from './routes/gifs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

export interface BuildOptions {
  /** SQLite file path or ':memory:'. Default: $HUDDLE_DB or apps/server/data/huddle.db */
  dbPath?: string;
  /** Default: $HUDDLE_UPLOADS or apps/server/uploads */
  uploadsDir?: string;
  jwtSecret?: string;
  logger?: boolean;
  heartbeatInterval?: number;
  rateLimits?: Partial<RateLimitConfig>;
  /** Serve apps/web/dist with SPA fallback. Default: NODE_ENV === 'production'. */
  production?: boolean;
  webDist?: string;
  /** Link-preview page fetcher; tests pass a stub so nothing touches the network. */
  fetchPage?: PageFetcher;
  /** GIF provider key. Default: $HUDDLE_GIF_API_KEY; null/empty disables GIF search. */
  gifApiKey?: string | null;
  /** GIF provider fetcher; tests pass a stub. */
  fetchGifs?: GifFetch;
  /** Outgoing mail. Default: SMTP from HUDDLE_SMTP_* (null when unset). Tests pass a MemoryTransport. */
  mailTransport?: MailTransport | null;
  /** Default: on when mail can be sent, or HUDDLE_REQUIRE_EMAIL_VERIFICATION=1. */
  requireEmailVerification?: boolean;
  /** Default:  (links in emails). */
  publicUrl?: string;
  /** Default: . */
  mailFrom?: string;
}

/** Signed-in but unverified accounts may only reach these (plus every /api/auth/* route). */
const UNVERIFIED_ALLOWED = new Set(['GET /api/users/@me', 'PATCH /api/users/@me', 'GET /api/health']);

/** Lifetime of TURN REST credentials handed out by /api/ice. */
const TURN_CREDENTIAL_TTL = 24 * 60 * 60;

export type HuddleApp = FastifyInstance & { huddle: Ctx };

export async function buildApp(opts: BuildOptions = {}): Promise<HuddleApp> {
  const dbPath = opts.dbPath ?? process.env.HUDDLE_DB ?? path.join(SERVER_ROOT, 'data', 'huddle.db');
  const uploadsDir = path.resolve(opts.uploadsDir ?? process.env.HUDDLE_UPLOADS ?? path.join(SERVER_ROOT, 'uploads'));
  const production = opts.production ?? process.env.NODE_ENV === 'production';
  const webDist = opts.webDist ?? path.resolve(SERVER_ROOT, '..', 'web', 'dist');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const db = new Db(dbPath);
  const dataDir = dbPath === ':memory:' ? null : path.dirname(path.resolve(dbPath));

  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  }) as unknown as HuddleApp;

  // Email: verification is required whenever mail can actually be delivered (or explicitly asked for).
  const mailTransport = opts.mailTransport !== undefined ? opts.mailTransport : smtpTransportFromEnv(process.env);
  const requireEmailVerification = opts.requireEmailVerification
    ?? (!!mailTransport || process.env.HUDDLE_REQUIRE_EMAIL_VERIFICATION === '1');
  const publicUrl = (opts.publicUrl ?? process.env.HUDDLE_PUBLIC_URL ?? '').trim().replace(/\/+$/, '')
    || (production ? '' : 'http://localhost:5173');
  const smtpUser = process.env.HUDDLE_SMTP_USER?.trim() ?? '';
  const mailFrom = (opts.mailFrom ?? process.env.HUDDLE_MAIL_FROM ?? '').trim()
    || (smtpUser.includes('@') ? `Huddle <${smtpUser}>` : 'Huddle <no-reply@localhost>');
  if (opts.requireEmailVerification === undefined) {
    if (!requireEmailVerification) {
      console.warn('[huddle] email verification is OFF (no SMTP configured): new accounts are created verified and password-reset emails cannot be delivered. Set HUDDLE_SMTP_* to enable email.');
    } else if (!mailTransport) {
      if (production) console.error('[huddle] HUDDLE_REQUIRE_EMAIL_VERIFICATION=1 but SMTP is not configured: verification emails cannot be delivered!');
      else console.warn('[huddle] email verification is ON without SMTP (dev): codes are printed to this console.');
    } else if (!publicUrl) {
      console.warn('[huddle] HUDDLE_PUBLIC_URL is not set: links in emails will be incomplete.');
    }
  }

  const tokens = new TokenService(resolveSecret(opts.jwtSecret, dataDir));
  const ctx = {
    db,
    cfg: {
      uploadsDir, heartbeatInterval: opts.heartbeatInterval ?? 30_000, production, webDist,
      requireEmailVerification, publicUrl,
    },
    id: createSnowflakeGenerator(0),
    tokens,
    mail: new Mailer({ transport: mailTransport, from: mailFrom, devLog: !production }),
    codes: new VerificationCodes(db, tokens.secret),
    limiter: new RateLimiter({ ...DEFAULT_RATE_LIMITS, ...(opts.rateLimits ?? {}) }),
    slowmode: new Map(),
  } as unknown as Ctx;
  ctx.gw = new Gateway(ctx);
  ctx.voice = new VoiceManager(ctx);
  ctx.previews = new LinkPreviews(ctx);
  if (opts.fetchPage) ctx.previews.fetcher = opts.fetchPage;
  ctx.gifs = new GifService((opts.gifApiKey !== undefined ? opts.gifApiKey : process.env.HUDDLE_GIF_API_KEY) || null, opts.fetchGifs);
  app.decorate('huddle', ctx);
  app.decorateRequest('userId', null);

  // Tolerant JSON parser: empty body → {}.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, raw, done) => {
    const s = String(raw ?? '');
    if (!s.trim()) return done(null, {});
    try {
      done(null, JSON.parse(s));
    } catch {
      done(new ApiErr(400, 'Malformed JSON body', ErrorCode.INVALID_FORM), undefined);
    }
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: LIMITS.ATTACHMENT_BYTES, files: LIMITS.ATTACHMENTS_PER_MESSAGE, fields: 20, fieldSize: 64 * 1024 },
  });

  if (production && fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: true });
  }
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: !(production && fs.existsSync(webDist)),
    maxAge: '7d',
    immutable: true,
  });

  app.setErrorHandler((err: FastifyError | ApiErr, req, reply) => {
    if (err instanceof ApiErr) return reply.status(err.status).send(err.toJSON());
    const fe = err as FastifyError;
    if (fe.validation) return reply.status(400).send({ message: fe.message, code: ErrorCode.INVALID_FORM });
    if (fe.code === 'FST_REQ_FILE_TOO_LARGE' || fe.statusCode === 413) {
      return reply.status(413).send({ message: 'Payload too large', code: ErrorCode.PAYLOAD_TOO_LARGE });
    }
    const status = fe.statusCode && fe.statusCode >= 400 ? fe.statusCode : 500;
    if (status < 500) return reply.status(status).send({ message: fe.message, code: ErrorCode.GENERAL });
    req.log.error(err);
    if (!opts.logger) console.error('[huddle] unhandled error', err);
    return reply.status(500).send({ message: 'Internal Server Error', code: ErrorCode.GENERAL });
  });

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0];
    if (production && req.method === 'GET' && !url.startsWith('/api') && !url.startsWith('/uploads/') &&
        fs.existsSync(path.join(webDist, 'index.html'))) {
      return reply.type('text/html').sendFile('index.html', webDist);
    }
    return reply.status(404).send({ message: '404: Not Found', code: ErrorCode.UNKNOWN_ROUTE });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(async (api) => {
    api.get('/health', async () => ({ ok: true }));

    // Resolve the bearer token (if any) for every API request.
    api.addHook('onRequest', async (req) => {
      const token = bearer(req.headers.authorization);
      if (!token) return;
      const user = await authenticate(ctx, token);
      if (!user) return;
      req.userId = user.id;
      // Unverified accounts: only verify / resend / change email / read themselves until the email is confirmed.
      if (needsVerification(ctx, user)) {
        const route = req.routeOptions.url;
        if (route && !route.startsWith('/api/auth/') && !UNVERIFIED_ALLOWED.has(`${req.method} ${route}`)) throw emailNotVerified();
      }
    });

    // WebRTC relay config, read at runtime so a deploy can set it without rebuilding the web app.
    // With HUDDLE_TURN_SECRET (coturn's static-auth-secret) each signed-in user gets credentials that
    // expire after a day, so the relay can't be used by people outside Huddle.
    api.get('/ice', async (req) => {
      const urls = (process.env.HUDDLE_TURN_URL ?? '').split(',').map((u) => u.trim()).filter(Boolean);
      if (!urls.length) return { iceServers: [] };
      if (!req.userId) throw unauthorized();
      const secret = process.env.HUDDLE_TURN_SECRET;
      if (secret) {
        const username = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL}:${req.userId}`;
        const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
        return { iceServers: [{ urls, username, credential }] };
      }
      return {
        iceServers: [{
          urls,
          username: process.env.HUDDLE_TURN_USERNAME || undefined,
          credential: process.env.HUDDLE_TURN_CREDENTIAL || undefined,
        }],
      };
    });

    // Token-bucket rate limiting for writes.
    api.addHook('preHandler', async (req) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      const route = req.routeOptions.url ?? '';
      const lim = ctx.limiter;
      let wait = 0;
      if (!req.userId) {
        if (route.startsWith('/api/auth/')) wait = lim.consume(`auth:${req.ip}`, lim.config.auth);
      } else if (req.method === 'POST' && route === '/api/channels/:id/messages') {
        const params = req.params as { id: string };
        wait = lim.consume(`msg:${req.userId}:${params.id}`, lim.config.messages);
      } else {
        wait = lim.consume(`w:${req.userId}`, lim.config.writes);
      }
      if (wait > 0) throw tooMany(wait);
    });

    for (const r of [
      authRoutes, userRoutes, relationshipRoutes, guildRoutes, channelRoutes, messageRoutes, roleRoutes, memberRoutes,
      inviteRoutes, banRoutes, auditRoutes, searchRoutes, discoveryRoutes, emojiRoutes, threadRoutes, userSettingsRoutes,
    ]) {
      r(api, ctx);
    }
    messageFeatureRoutes(api, ctx);
    stickerRoutes(api, ctx);
    gifRoutes(api, ctx);
    scheduledEventRoutes(api, ctx);
    soundboardRoutes(api, ctx);
  }, { prefix: '/api' });

  // Close polls whose time is up (votes are refused after expiry regardless; this posts the result line).
  const pollTimer = setInterval(() => {
    try { finalizeExpiredPolls(ctx); } catch (e) { console.error('[huddle] poll finalize failed', e); }
  }, 15_000);
  pollTimer.unref();
  app.addHook('preClose', async () => {
    clearInterval(pollTimer);
    await ctx.previews.settle();
  });

  ctx.gw.attach(app.server);

  // Auto-archive idle threads.
  const archiveTimer = setInterval(() => {
    try { archiveStaleThreads(ctx); } catch (e) { console.error('[huddle] thread auto-archive failed', e); }
  }, 60_000);
  archiveTimer.unref();

  // Scheduled events: external ones go live at their start time; anything past its end auto-completes.
  const eventTimer = setInterval(() => {
    try { advanceScheduledEvents(ctx); } catch (e) { console.error('[huddle] scheduled event update failed', e); }
  }, 15_000);
  eventTimer.unref();
  app.addHook('preClose', async () => { clearInterval(eventTimer); });

  app.addHook('preClose', async () => {
    clearInterval(archiveTimer);
    ctx.voice.clear();
    ctx.gw.close();
  });
  app.addHook('onClose', async () => {
    ctx.limiter.close();
    db.close();
  });

  return app;
}
