// Sessions (versioned tokens), email verification and account-notice emails.
import { GatewayCloseCode, VERIFICATION } from '@huddle/shared';
import type { Ctx } from '../context';
import { ApiErr, ErrorCode, tooMany } from '../errors';
import { getUserRow, type UserRow } from '../serializers';
import type { CheckResult, CodePurpose } from './verification';
import { emailChangedMail, passwordChangedMail, resetPasswordMail, verifyEmailMail } from './emailTemplates';

/** Stricter than "has an @": no whitespace, commas, quotes or brackets (nothing an address-list parser could split). */
export const EMAIL_RE = /^[^\s@,;:<>()[\]\\"']+@[^\s@,;:<>()[\]\\"']+\.[^\s@,;:<>()[\]\\"']+$/;

export function validEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s);
}

// ---------------- sessions ----------------

export function issueToken(ctx: Ctx, u: Pick<UserRow, 'id' | 'token_version'>): Promise<string> {
  return ctx.tokens.sign(u.id, u.token_version ?? 0);
}

/** The user behind a bearer token, or null if the token is bad, expired or revoked. */
export async function authenticate(ctx: Ctx, token: string | null | undefined): Promise<UserRow | null> {
  const claims = await ctx.tokens.verify(token);
  if (!claims) return null;
  const u = getUserRow(ctx.db, claims.userId);
  if (!u || claims.version !== (u.token_version ?? 0)) return null;
  return u;
}

/** True when this account must confirm its email before using Huddle. */
export function needsVerification(ctx: Ctx, u: Pick<UserRow, 'email_verified'>): boolean {
  return ctx.cfg.requireEmailVerification && !u.email_verified;
}

/**
 * Revokes every token issued so far for the user (bumps token_version) and drops their gateway sessions.
 * Returns the new version; sign a fresh token with it for the session that should stay signed in.
 */
export function revokeSessions(ctx: Ctx, userId: string): number {
  ctx.db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', userId);
  const version = getUserRow(ctx.db, userId)!.token_version;
  ctx.gw.dropStaleSessions(userId, version, GatewayCloseCode.SESSION_INVALIDATED);
  return version;
}

// ---------------- codes ----------------

const norm = (email: string) => email.trim().toLowerCase();

/** Per-address and per-IP hourly caps on outgoing code emails (429 when exceeded). */
export function consumeCodeBuckets(ctx: Ctx, email: string, ip: string, userId?: string): void {
  const lim = ctx.limiter;
  const busy = 'Too many codes were requested. Please wait a while and try again.';
  let wait = lim.consume(`code-ip:${ip}`, lim.config.codesPerIp);
  if (wait > 0) throw tooMany(wait, busy);
  wait = lim.consume(`code-email:${norm(email)}`, lim.config.codesPerEmail);
  if (wait > 0) throw tooMany(wait, busy);
  if (userId) {
    wait = lim.consume(`code-user:${userId}`, lim.config.codesPerUser);
    if (wait > 0) throw tooMany(wait, busy);
  }
}

export function cooldownError(secs: number): ApiErr {
  return tooMany(secs, `You can request a new code in ${secs} second${secs === 1 ? '' : 's'}.`);
}

export interface SendCodeOptions {
  user: UserRow;
  email: string;
  ip: string;
  /** verify_email to confirm an address change (wording only). */
  change?: boolean;
  /** Don't wait for (or fail on) delivery — sign-up. */
  background?: boolean;
  /** Skip the hourly caps (already consumed by the caller). */
  skipBuckets?: boolean;
}

/** Issues a verify_email code to `email` and mails it. Enforces the resend cooldown and hourly caps. */
export async function sendVerificationCode(ctx: Ctx, o: SendCodeOptions): Promise<number> {
  const wait = ctx.codes.cooldown(o.user.id, 'verify_email', o.email);
  if (wait > 0) throw cooldownError(wait);
  if (!o.skipBuckets) consumeCodeBuckets(ctx, o.email, o.ip, o.user.id);
  const code = ctx.codes.issue(o.user.id, 'verify_email', o.email);
  const m = verifyEmailMail(ctx.cfg.publicUrl, code, { change: o.change });
  await deliver(ctx, o.user.id, 'verify_email', { to: o.email, kind: 'verification code', ...m, devNote: `verification code ${code}` }, !!o.background);
  return VERIFICATION.RESEND_COOLDOWN_SECS;
}

/** Issues a reset_password code for an existing account and mails it in the background. */
export function sendResetCode(ctx: Ctx, user: UserRow): void {
  const code = ctx.codes.issue(user.id, 'reset_password', user.email);
  const m = resetPasswordMail(ctx.cfg.publicUrl, code);
  ctx.mail.sendInBackground({ to: user.email, kind: 'password reset code', ...m, devNote: `password reset code ${code}` });
}

async function deliver(
  ctx: Ctx, userId: string, purpose: CodePurpose,
  mail: { to: string; kind: string; subject: string; text: string; html: string; devNote: string }, background: boolean,
): Promise<void> {
  if (background) {
    ctx.mail.sendInBackground(mail);
    return;
  }
  try {
    await ctx.mail.send(mail);
  } catch (e) {
    console.error(`[huddle] email delivery failed (${mail.kind}): ${(e as Error)?.message ?? e}`);
    ctx.codes.clear(userId, purpose); // nothing arrived: don't hold the user to the cooldown
    throw new ApiErr(503, "We couldn't send the email right now. Please try again in a minute.", ErrorCode.EMAIL_SEND_FAILED);
  }
}

/** Turns a failed code check into the API error the client shows inline. */
export function codeError(r: Exclude<CheckResult, { ok: true }>): ApiErr {
  switch (r.reason) {
    case 'invalid':
      return new ApiErr(400, `That code isn't right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`,
        ErrorCode.VERIFICATION_CODE_INVALID, { code: "That code isn't right." });
    case 'expired':
      return new ApiErr(400, 'That code has expired. Request a new one.', ErrorCode.VERIFICATION_CODE_EXPIRED,
        { code: 'That code has expired.' });
    case 'exhausted':
      return new ApiErr(400, 'Too many wrong attempts. Request a new code.', ErrorCode.VERIFICATION_CODE_EXHAUSTED,
        { code: 'Too many wrong attempts.' });
    default:
      return new ApiErr(400, 'No active code. Request a new one.', ErrorCode.VERIFICATION_CODE_MISSING,
        { code: 'No active code.' });
  }
}

// ---------------- notices ----------------

export function notifyPasswordChanged(ctx: Ctx, email: string): void {
  if (!ctx.cfg.requireEmailVerification && !ctx.mail.configured) return;
  ctx.mail.sendInBackground({ to: email, kind: 'password changed notice', ...passwordChangedMail(ctx.cfg.publicUrl) });
}

export function notifyEmailChanged(ctx: Ctx, oldEmail: string, newEmail: string): void {
  ctx.mail.sendInBackground({ to: oldEmail, kind: 'email changed notice', ...emailChangedMail(ctx.cfg.publicUrl, newEmail) });
}
