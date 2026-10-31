// REST error codes the web app reacts to (the server's full list lives in apps/server/src/errors.ts).
// Errors are serialised as { message, code, errors?, retry_after? }.

export const ApiErrorCode = {
  UNAUTHORIZED: 40001,
  /** The account's email isn't verified yet; only the verify/resend/change-email/logout calls are allowed. */
  EMAIL_NOT_VERIFIED: 40002,
  RATE_LIMITED: 20028,
  INVALID_FORM: 50035,
  /** Wrong verification / reset code (the body's `errors.code` says how many tries are left, when known). */
  VERIFICATION_CODE_INVALID: 50080,
  /** The code is older than 10 minutes: request a new one. */
  VERIFICATION_CODE_EXPIRED: 50081,
  /** 5 wrong guesses: the code is dead, request a new one. */
  VERIFICATION_CODE_EXHAUSTED: 50082,
  /** No code is waiting (never sent, already used, or replaced by a newer one). */
  VERIFICATION_CODE_MISSING: 50083,
  /** The mail server refused or timed out; nothing was sent. */
  EMAIL_SEND_FAILED: 50084,
} as const;

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Verification / reset codes: 6 digits, valid for 10 minutes, 5 guesses, one resend per minute. */
export const VERIFICATION = {
  CODE_LENGTH: 6,
  CODE_TTL_SECS: 10 * 60,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECS: 60,
} as const;
