// Public, signed-out endpoints behind the website: the live Status page and the Feedback form.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context';
import { now } from '../context';
import { invalidField, tooMany } from '../errors';
import { validEmail } from '../services/accounts';
import { feedbackMail } from '../services/emailTemplates';
import { body, optBool, optStr, reqStr } from './util';

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'question', 'report', 'other'] as const;
export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 2000;

const CATEGORY_LABEL: Record<(typeof FEEDBACK_CATEGORIES)[number], string> = {
  bug: 'Bug', idea: 'Idea', question: 'Question', report: 'Report a problem', other: 'Other',
};

export interface SiteOptions {
  /** Feedback goes here by email; null = stored only. Never sent to clients. */
  contactEmail: string | null;
}

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEX = /^[0-9a-f]{7,40}$/i;

/** Short commit hash from .git (read-only, no git binary), or null. */
function gitCommit(repoRoot: string): string | null {
  try {
    const gitDir = path.join(repoRoot, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (HEX.test(head)) return head.slice(0, 7);
    const m = /^ref: (refs\/[\w./-]+)$/.exec(head);
    if (!m || m[1].includes('..')) return null;
    const refFile = path.join(gitDir, ...m[1].split('/'));
    if (fs.existsSync(refFile)) {
      const sha = fs.readFileSync(refFile, 'utf8').trim();
      return HEX.test(sha) ? sha.slice(0, 7) : null;
    }
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + m[1]));
    const sha = line?.split(' ')[0] ?? '';
    return HEX.test(sha) ? sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

/** HUDDLE_VERSION > git commit > package version. Resolved once per app. */
export function appVersion(): string {
  const fromEnv = process.env.HUDDLE_VERSION?.trim();
  if (fromEnv) return fromEnv.slice(0, 40);
  const commit = gitCommit(path.resolve(SERVER_ROOT, '..', '..'));
  if (commit) return commit;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ? `v${pkg.version}` : 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface StatusPayload {
  ok: boolean;
  api: boolean;
  realtime: boolean;
  call_relay: boolean;
  email: boolean;
  gifs: boolean;
  uptime_seconds: number;
  version: string;
  time: string;
}

export default function siteRoutes(app: FastifyInstance, ctx: Ctx, opts: SiteOptions) {
  const version = appVersion();
  const startedAt = Date.now();

  // Only booleans and harmless values: no hostnames, URLs, addresses or secrets.
  app.get('/status', async (_req, reply): Promise<StatusPayload> => {
    reply.header('cache-control', 'no-store');
    const realtime = ctx.gw.accepting;
    return {
      ok: realtime,
      api: true,
      realtime,
      call_relay: (process.env.HUDDLE_TURN_URL ?? '').split(',').some((u) => u.trim() !== ''),
      email: ctx.mail.configured,
      gifs: ctx.gifs.enabled,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      version,
      time: now(),
    };
  });

  const ipHash = (ip: string) =>
    crypto.createHmac('sha256', Buffer.from(ctx.tokens.secret)).update(`feedback:${ip}`).digest('hex').slice(0, 32);

  app.post('/feedback', async (req) => {
    const b = body(req);
    // Honeypot: a hidden field people never see. Bots that fill it get a normal-looking answer and nothing is kept.
    const trap = b.website;
    if (typeof trap === 'string' && trap.trim() !== '') return { ok: true };

    const category = reqStr(b, 'category', { max: 20 });
    if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
      throw invalidField('category', `category must be one of: ${FEEDBACK_CATEGORIES.join(', ')}`);
    }
    const message = reqStr(b, 'message', { min: FEEDBACK_MIN, max: FEEDBACK_MAX });
    const emailRaw = optStr(b, 'email', { max: 254, nullable: true });
    const email = emailRaw ? emailRaw : null;
    if (email && !validEmail(email)) throw invalidField('email', 'Enter a valid email address, or leave it empty');
    const includeUser = optBool(b, 'include_username') ?? false;

    const lim = ctx.limiter;
    const hash = ipHash(req.ip);
    let wait = lim.consume(`fb-ip:${hash}`, lim.config.feedbackPerIp);
    if (!wait && req.userId) wait = lim.consume(`fb-user:${req.userId}`, lim.config.feedbackPerUser);
    if (wait > 0) throw tooMany(wait, 'You have sent a lot of feedback recently. Please try again later.');

    const userId = includeUser && req.userId ? req.userId : null;
    const username = userId
      ? (ctx.db.one<{ username: string }>('SELECT username FROM users WHERE id = ?', userId)?.username ?? null)
      : null;
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 160) : null;
    const id = ctx.id();
    const createdAt = now();
    ctx.db.run(
      'INSERT INTO feedback (id, created_at, category, message, email, user_id, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, createdAt, category, message, email, userId, hash, ua,
    );

    if (opts.contactEmail) {
      const m = feedbackMail(ctx.cfg.publicUrl, {
        id, category: CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL], message, replyTo: email, username, createdAt,
      });
      ctx.mail.sendInBackground({ to: opts.contactEmail, ...m, kind: 'feedback', replyTo: email ?? undefined });
    }
    return { ok: true };
  });
}
