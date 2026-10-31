// API errors serialised as { message, code, errors?, retry_after? }.

export const ErrorCode = {
  GENERAL: 0,
  UNKNOWN_ACCOUNT: 10001,
  UNKNOWN_CHANNEL: 10003,
  UNKNOWN_GUILD: 10004,
  UNKNOWN_INVITE: 10006,
  UNKNOWN_MEMBER: 10007,
  UNKNOWN_MESSAGE: 10008,
  UNKNOWN_OVERWRITE: 10009,
  UNKNOWN_ROLE: 10011,
  UNKNOWN_USER: 10013,
  UNKNOWN_BAN: 10026,
  UNKNOWN_ROUTE: 10404,
  UNAUTHORIZED: 40001,
  BANNED: 40007,
  CANNOT_DM: 50007,
  MISSING_ACCESS: 50001,
  MISSING_PERMISSIONS: 50013,
  INVALID_FORM: 50035,
  PAYLOAD_TOO_LARGE: 40005,
  MAX_PINS: 30003,
  MAX_EMOJIS: 30008,
  UNKNOWN_EMOJI: 10014,
  UNKNOWN_SOUND: 10097,
  MAX_SOUNDS: 30045,
  MAX_STICKERS: 30039,
  UNKNOWN_STICKER: 10060,
  GIFS_UNAVAILABLE: 50501,
  UNKNOWN_SCHEDULED_EVENT: 10070,
  RATE_LIMITED: 20028,
  SLOWMODE: 20016,
} as const;

export class ApiErr extends Error {
  status: number;
  code: number;
  errors?: Record<string, string>;
  retryAfter?: number;
  constructor(status: number, message: string, code: number = ErrorCode.GENERAL, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
  toJSON() {
    const o: Record<string, unknown> = { message: this.message, code: this.code };
    if (this.errors) o.errors = this.errors;
    if (this.retryAfter !== undefined) o.retry_after = this.retryAfter;
    return o;
  }
}

export const badRequest = (message: string, errors?: Record<string, string>) =>
  new ApiErr(400, message, ErrorCode.INVALID_FORM, errors);
export const invalidField = (field: string, message: string) =>
  new ApiErr(400, message, ErrorCode.INVALID_FORM, { [field]: message });
export const unauthorized = (message = '401: Unauthorized') => new ApiErr(401, message, ErrorCode.UNAUTHORIZED);
export const forbidden = (message = 'Missing Permissions', code: number = ErrorCode.MISSING_PERMISSIONS) =>
  new ApiErr(403, message, code);
export const notFound = (what: string, code: number = ErrorCode.GENERAL) => new ApiErr(404, `Unknown ${what}`, code);
export const tooMany = (retryAfterSec: number, message = 'You are being rate limited.', code: number = ErrorCode.RATE_LIMITED) => {
  const e = new ApiErr(429, message, code);
  e.retryAfter = Math.max(0, Math.round(retryAfterSec * 1000) / 1000);
  return e;
};
