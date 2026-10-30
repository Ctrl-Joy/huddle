// 64-bit time-ordered ids: 42 bits ms since HUDDLE_EPOCH | 5 bits worker | 17 bits sequence.

export const HUDDLE_EPOCH = 1735689600000n; // 2025-01-01T00:00:00Z

export function createSnowflakeGenerator(workerId = 0) {
  let lastMs = 0n;
  let seq = 0n;
  const worker = BigInt(workerId & 0x1f);
  return function next(): string {
    let now = BigInt(Date.now());
    if (now === lastMs) {
      seq = (seq + 1n) & 0x1ffffn;
      if (seq === 0n) while ((now = BigInt(Date.now())) <= lastMs) { /* spin to next ms */ }
    } else {
      seq = 0n;
    }
    lastMs = now;
    return (((now - HUDDLE_EPOCH) << 22n) | (worker << 17n) | seq).toString();
  };
}

export function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + HUDDLE_EPOCH);
}

export function compareSnowflakes(a: string, b: string): number {
  const x = BigInt(a), y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
