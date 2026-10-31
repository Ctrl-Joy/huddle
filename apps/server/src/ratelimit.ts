// In-memory token buckets keyed by arbitrary strings.

export interface BucketSpec { capacity: number; windowMs: number }

export interface RateLimitConfig {
  /** Message sends per user per channel. */
  messages: BucketSpec;
  /** All other authenticated writes per user. */
  writes: BucketSpec;
  /** Soundboard plays per user (on top of writes). */
  soundboard: BucketSpec;
  /** Unauthenticated auth attempts (register/login/forgot/reset) per IP. */
  auth: BucketSpec;
  /** GIF search proxy requests per user (cached or not). */
  gifs: BucketSpec;
  /** Verification / reset emails sent to one address. */
  codesPerEmail: BucketSpec;
  /** Verification / reset emails requested from one IP. */
  codesPerIp: BucketSpec;
  /** Verification emails requested by one account. */
  codesPerUser: BucketSpec;
  /** Feedback messages from one IP. */
  feedbackPerIp: BucketSpec;
  /** Feedback messages from one signed-in account. */
  feedbackPerUser: BucketSpec;
}

const HOUR = 60 * 60_000;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messages: { capacity: 5, windowMs: 5_000 },
  writes: { capacity: 30, windowMs: 10_000 },
  auth: { capacity: 20, windowMs: 60_000 },
  gifs: { capacity: 20, windowMs: 10_000 },
  soundboard: { capacity: 1, windowMs: 2_000 },
  codesPerEmail: { capacity: 5, windowMs: HOUR },
  codesPerIp: { capacity: 30, windowMs: HOUR },
  codesPerUser: { capacity: 10, windowMs: HOUR },
  feedbackPerIp: { capacity: 5, windowMs: HOUR },
  feedbackPerUser: { capacity: 5, windowMs: HOUR },
};

interface Bucket { tokens: number; last: number; capacity: number; rate: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private sweeper: NodeJS.Timeout;

  constructor(public config: RateLimitConfig) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /** Consumes one token. Returns 0 when allowed, otherwise seconds until a token is available. */
  consume(key: string, spec: BucketSpec): number {
    const now = Date.now();
    const rate = spec.capacity / spec.windowMs; // tokens per ms
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: spec.capacity, last: now, capacity: spec.capacity, rate };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(spec.capacity, b.tokens + (now - b.last) * rate);
      b.last = now;
      b.capacity = spec.capacity;
      b.rate = rate;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return (1 - b.tokens) / rate / 1000;
  }

  /** Drops buckets that have refilled completely (forgetting them changes nothing, even for hour-long windows). */
  private sweep() {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (b.tokens + (now - b.last) * b.rate >= b.capacity) this.buckets.delete(k);
    }
  }

  close() {
    clearInterval(this.sweeper);
  }
}
