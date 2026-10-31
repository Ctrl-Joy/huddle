import type { FastifyInstance } from 'fastify';
import { LIMITS } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { hashPassword, verifyPassword } from '../auth';
import { badRequest, ApiErr, ErrorCode } from '../errors';
import { privateUser, getUserRow, type UserRow } from '../serializers';
import {
  codeError, consumeCodeBuckets, issueToken, needsVerification, notifyEmailChanged, notifyPasswordChanged, revokeSessions,
  sendResetCode, sendVerificationCode, validEmail,
} from '../services/accounts';
import { body, uid } from './util';

export const USERNAME_RE = /^[A-Za-z0-9_.]+$/;

export function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return 'Username is required';
  const s = u.trim();
  if (s.length < LIMITS.USERNAME_MIN || s.length > LIMITS.USERNAME_MAX) {
    return `Username must be between ${LIMITS.USERNAME_MIN} and ${LIMITS.USERNAME_MAX} characters`;
  }
  if (!USERNAME_RE.test(s)) return 'Username may only contain letters, numbers, underscores and periods';
  return null;
}

/** Same rules as sign-up. Returns an error message or null. */
export function validateNewPassword(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < LIMITS.PASSWORD_MIN) return `Password must be at least ${LIMITS.PASSWORD_MIN} characters`;
  if (p.length > 128) return 'Password is too long';
  return null;
}

/** Shown for every reset failure, so a reset attempt never reveals whether an account exists. */
const resetCodeError = () => new ApiErr(400, 'That code is invalid or has expired. Check it, or request a new one.',
  ErrorCode.VERIFICATION_CODE_INVALID, { code: 'Invalid or expired code.' });

export default function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const me = (u: UserRow) => privateUser(u, ctx.cfg.requireEmailVerification);

  app.post('/auth/register', async (req) => {
    const b = body(req);
    const errors: Record<string, string> = {};
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!validEmail(email)) errors.email = 'Enter a valid email address';
    const uErr = validateUsername(username);
    if (uErr) errors.username = uErr;
    const pErr = validateNewPassword(password);
    if (pErr) errors.password = pErr;
    if (!errors.email && db.one('SELECT 1 AS x FROM users WHERE email = ?', email)) errors.email = 'Email is already registered';
    if (!errors.username && db.one('SELECT 1 AS x FROM users WHERE username = ?', username)) errors.username = 'Username is taken';
    if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], errors);

    const verify = ctx.cfg.requireEmailVerification;
    if (verify) consumeCodeBuckets(ctx, email, req.ip);
    const id = ctx.id();
    const display = typeof b.display_name === 'string' && b.display_name.trim() ? b.display_name.trim().slice(0, 32) : null;
    db.run(
      `INSERT INTO users (id, email, username, display_name, password_hash, created_at, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, email, username, display, await hashPassword(password), now(), verify ? 0 : 1,
    );
    const user = getUserRow(db, id)!;
    // The account exists either way; if this email doesn't arrive the user can resend from the verify screen.
    if (verify) await sendVerificationCode(ctx, { user, email, ip: req.ip, background: true, skipBuckets: true });
    return { token: await issueToken(ctx, user), user: me(user) };
  });

  app.post('/auth/login', async (req) => {
    const b = body(req);
    const login = typeof b.login === 'string' ? b.login.trim() : typeof b.email === 'string' ? b.email.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!login || !password) throw badRequest('Login and password are required');
    const user = db.one<UserRow>('SELECT * FROM users WHERE email = ? OR username = ?', login, login);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiErr(401, 'Invalid login or password', ErrorCode.UNAUTHORIZED, {
        login: 'Invalid login or password', password: 'Invalid login or password',
      });
    }
    return { token: await issueToken(ctx, user), user: me(user) };
  });

  // ---------- email verification (sign-up, and confirming a new address) ----------

  /** The address awaiting confirmation: a pending change, or the unverified sign-up address. */
  const verifyTarget = (u: UserRow): string | null =>
    u.pending_email ?? (needsVerification(ctx, u) ? u.email : null);

  app.post('/auth/verify-email', async (req) => {
    const id = uid(req);
    const u = getUserRow(db, id)!;
    const target = verifyTarget(u);
    if (!target) throw badRequest('Your email is already verified');
    const code = typeof body(req).code === 'string' ? body(req).code : '';
    const r = ctx.codes.check(id, 'verify_email', target, code);
    if (!r.ok) throw codeError(r);

    if (u.pending_email) {
      // Confirming a change: the address may have been taken since it was requested.
      const taken = db.one<{ id: string }>('SELECT id FROM users WHERE email = ? AND id != ?', u.pending_email, id);
      if (taken) {
        db.run('UPDATE users SET pending_email = NULL WHERE id = ?', id);
        ctx.gw.broadcastUserUpdate(id);
        throw new ApiErr(400, 'That email is now used by another account.', ErrorCode.INVALID_FORM, { email: 'Email is already registered' });
      }
      const old = u.email;
      db.run('UPDATE users SET email = ?, pending_email = NULL, email_verified = 1 WHERE id = ?', u.pending_email, id);
      notifyEmailChanged(ctx, old, u.pending_email);
    } else {
      db.run('UPDATE users SET email_verified = 1 WHERE id = ?', id);
    }
    ctx.codes.clear(id, 'verify_email');
    ctx.gw.broadcastUserUpdate(id);
    return me(getUserRow(db, id)!);
  });

  app.post('/auth/verify-email/resend', async (req) => {
    const id = uid(req);
    const u = getUserRow(db, id)!;
    const target = verifyTarget(u);
    if (!target) throw badRequest('Your email is already verified');
    const resendAfter = await sendVerificationCode(ctx, { user: u, email: target, ip: req.ip, change: !!u.pending_email });
    return { email: target, resend_after: resendAfter };
  });

  // ---------- password reset ----------

  // Always the same 200 body: never reveals whether an account exists.
  app.post('/auth/password/forgot', async (req) => {
    const email = typeof body(req).email === 'string' ? body(req).email.trim() : '';
    if (!validEmail(email)) throw badRequest('Enter a valid email address', { email: 'Enter a valid email address' });
    // Hourly caps apply to the address whether or not it has an account (so 429s don't leak either).
    consumeCodeBuckets(ctx, email, req.ip);
    const user = db.one<UserRow>('SELECT * FROM users WHERE email = ?', email);
    if (user && ctx.codes.cooldown(user.id, 'reset_password') === 0) sendResetCode(ctx, user);
    else ctx.codes.dummyWork();
    return { ok: true };
  });

  app.post('/auth/password/reset', async (req) => {
    const b = body(req);
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const code = typeof b.code === 'string' ? b.code : '';
    const pErr = validateNewPassword(b.new_password);
    if (pErr) throw badRequest(pErr, { new_password: pErr });
    if (!email || !code) throw resetCodeError();
    const user = db.one<UserRow>('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      ctx.codes.dummyWork();
      throw resetCodeError();
    }
    const r = ctx.codes.check(user.id, 'reset_password', user.email, code);
    if (!r.ok) throw resetCodeError();

    const hash = await hashPassword(b.new_password);
    // New password, email proven, any pending email change dropped, and every existing session revoked.
    db.tx(() => {
      db.run('UPDATE users SET password_hash = ?, email_verified = 1, pending_email = NULL WHERE id = ?', hash, user.id);
      ctx.codes.clear(user.id);
    });
    revokeSessions(ctx, user.id);
    notifyPasswordChanged(ctx, user.email);
    const fresh = getUserRow(db, user.id)!;
    ctx.gw.broadcastUserUpdate(user.id);
    return { token: await issueToken(ctx, fresh), user: me(fresh) };
  });
}

