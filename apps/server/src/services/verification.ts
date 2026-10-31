// One-time 6-digit codes for email verification and password reset.
// Only an HMAC of the code is stored (keyed from the JWT secret and bound to purpose + user + address);
// each code lives 10 minutes, dies after 5 wrong guesses, and is single-use. Issuing a new code replaces the old one.
import crypto from 'node:crypto';
import { VERIFICATION } from '@huddle/shared';
import type { Db } from '../db';

export type CodePurpose = 'verify_email' | 'reset_password';

export const CODE_TTL_MS = VERIFICATION.CODE_TTL_SECS * 1000;
export const MAX_ATTEMPTS = VERIFICATION.MAX_ATTEMPTS;
export const RESEND_COOLDOWN_MS = VERIFICATION.RESEND_COOLDOWN_SECS * 1000;

export type CheckResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'expired' | 'exhausted' }
  | { ok: false; reason: 'invalid'; attemptsLeft: number };

interface CodeRow {
  id: string; user_id: string; purpose: string; email: string; code_hash: string;
  attempts: number; consumed: number; created_at: number; expires_at: number;
}

export class VerificationCodes {
  /** Clock (ms); tests move it forward. */
  now: () => number = () => Date.now();
  private key: Buffer;

  constructor(private db: Db, secret: Uint8Array) {
    // A dedicated key, so code hashes are useless for forging tokens and vice versa.
    this.key = crypto.createHmac('sha256', Buffer.from(secret)).update('huddle/verification-codes/v1').digest();
  }

  private hash(purpose: CodePurpose, userId: string, email: string, code: string): Buffer {
    return crypto.createHmac('sha256', this.key).update(`${purpose}\n${userId}\n${email.toLowerCase()}\n${code}`).digest();
  }

  /** Burns comparable CPU for requests that have no account behind them (keeps timing flat). */
  dummyWork(): void {
    this.hash('reset_password', '0', 'nobody@invalid', '000000');
  }

  private latest(userId: string, purpose: CodePurpose): CodeRow | undefined {
    return this.db.one<CodeRow>(
      'SELECT * FROM verification_codes WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1', userId, purpose,
    );
  }

  /** Seconds until another code may be sent to `email` (0 = now). A different address isn't held back. */
  cooldown(userId: string, purpose: CodePurpose, email?: string): number {
    const row = this.latest(userId, purpose);
    if (!row) return 0;
    if (email && row.email.toLowerCase() !== email.toLowerCase()) return 0;
    const left = row.created_at + RESEND_COOLDOWN_MS - this.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** Creates a fresh code (replacing any earlier one for this user + purpose) and returns it in the clear, once. */
  issue(userId: string, purpose: CodePurpose, email: string): string {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(VERIFICATION.CODE_LENGTH, '0');
    const t = this.now();
    this.db.tx(() => {
      this.db.run('DELETE FROM verification_codes WHERE user_id = ? AND purpose = ?', userId, purpose);
      this.db.run('DELETE FROM verification_codes WHERE expires_at < ?', t - 24 * 60 * 60_000);
      this.db.run(
        `INSERT INTO verification_codes (id, user_id, purpose, email, code_hash, attempts, consumed, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        crypto.randomUUID(), userId, purpose, email, this.hash(purpose, userId, email, code).toString('hex'), t, t + CODE_TTL_MS,
      );
    });
    return code;
  }

  /**
   * Checks a guess against the live code for user + purpose, which must have been sent to `email`.
   * Every guess counts towards the 5-attempt limit; a match consumes the code.
   */
  check(userId: string, purpose: CodePurpose, email: string, guess: string): CheckResult {
    const row = this.latest(userId, purpose);
    if (!row || row.consumed || row.email.toLowerCase() !== email.toLowerCase()) return { ok: false, reason: 'missing' };
    if (row.expires_at <= this.now()) return { ok: false, reason: 'expired' };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'exhausted' };
    // Count the attempt before comparing, so concurrent guesses can't exceed the limit.
    const counted = this.db.run(
      'UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed = 0', row.id, MAX_ATTEMPTS,
    );
    if (counted.changes !== 1) return { ok: false, reason: 'exhausted' };
    const normalized = typeof guess === 'string' ? guess.replace(/\s+/g, '') : '';
    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = this.hash(purpose, userId, row.email, /^\d{6}$/.test(normalized) ? normalized : 'x');
    if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) {
      const used = this.db.run('UPDATE verification_codes SET consumed = 1 WHERE id = ? AND consumed = 0', row.id);
      if (used.changes === 1) return { ok: true, email: row.email };
      return { ok: false, reason: 'missing' };
    }
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return left > 0 ? { ok: false, reason: 'invalid', attemptsLeft: left } : { ok: false, reason: 'exhausted' };
  }

  /** Forgets every code for user (+ purpose). */
  clear(userId: string, purpose?: CodePurpose): void {
    if (purpose) this.db.run('DELETE FROM verification_codes WHERE user_id = ? AND purpose = ?', userId, purpose);
    else this.db.run('DELETE FROM verification_codes WHERE user_id = ?', userId);
  }
}
