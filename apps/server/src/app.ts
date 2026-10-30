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
import { ApiErr, ErrorCode, tooMany } from './errors';
import type { Ctx } from './context';
import { getUserRow } from './serializers';

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
}

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

  const ctx = {
    db,
    cfg: { uploadsDir, heartbeatInterval: opts.heartbeatInterval ?? 30_000, production, webDist },
    id: createSnowflakeGenerator(0),
    tokens: new TokenService(resolveSecret(opts.jwtSecret, dataDir)),
    limiter: new RateLimiter({ ...DEFAULT_RATE_LIMITS, ...(opts.rateLimits ?? {}) }),
    slowmode: new Map(),
  } as unknown as Ctx;
  ctx.gw = new Gateway(ctx);
  ctx.voice = new VoiceManager(ctx);
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

    // WebRTC relay config, read at runtime so a deploy can set it without rebuilding the web app.
    api.get('/ice', async () => {
      const urls = (process.env.HUDDLE_TURN_URL ?? '').split(',').map((u) => u.trim()).filter(Boolean);
      if (!urls.length) return { iceServers: [] };
      return {
        iceServers: [{
          urls,
          username: process.env.HUDDLE_TURN_USERNAME || undefined,
          credential: process.env.HUDDLE_TURN_CREDENTIAL || undefined,
        }],
      };
    });

    // Resolve the bearer token (if any) for every API request.
    api.addHook('onRequest', async (req) => {
      const token = bearer(req.headers.authorization);
      if (!token) return;
      const id = await ctx.tokens.verify(token);
      if (id && getUserRow(db, id)) req.userId = id;
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
      inviteRoutes, banRoutes, auditRoutes, searchRoutes,
    ]) {
      r(api, ctx);
    }
  }, { prefix: '/api' });

  ctx.gw.attach(app.server);

  app.addHook('preClose', async () => {
    ctx.voice.clear();
    ctx.gw.close();
  });
  app.addHook('onClose', async () => {
    ctx.limiter.close();
    db.close();
  });

  return app;
}
