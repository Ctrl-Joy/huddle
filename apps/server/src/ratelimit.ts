// In-memory token buckets keyed by arbitrary strings.

export interface BucketSpec { capacity: number; windowMs: number }

export interface RateLimitConfig {
  /** Message sends per user per channel. */
  messages: BucketSpec;
  /** All other authenticated writes per user. */
  writes: BucketSpec;
  /** Unauthenticated auth attempts (register/login) per IP. */
  auth: BucketSpec;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messages: { capacity: 5, windowMs: 5_000 },
  writes: { capacity: 30, windowMs: 10_000 },
  auth: { capacity: 20, windowMs: 60_000 },
};

interface Bucket { tokens: number; last: number }

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
      b = { tokens: spec.capacity, last: now };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(spec.capacity, b.tokens + (now - b.last) * rate);
      b.last = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return (1 - b.tokens) / rate / 1000;
  }

  private sweep() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of this.buckets) if (b.last < cutoff) this.buckets.delete(k);
  }

  close() {
    clearInterval(this.sweeper);
  }
}
