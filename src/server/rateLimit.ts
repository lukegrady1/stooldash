/**
 * In-memory token buckets. Per-instance only (spec §8.6): on Vercel each warm lambda
 * has its own buckets, so these are a soft limit against accidents, not a hard wall.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitRule {
  capacity: number; // max burst
  refillPerMs: number; // tokens added per millisecond
}

export const RULES = {
  createGame: { capacity: 10, refillPerMs: 10 / (60 * 60 * 1000) }, // 10 per hour
  join: { capacity: 30, refillPerMs: 30 / (10 * 60 * 1000) }, // 30 per 10 min
  action: { capacity: 10, refillPerMs: 10 / 1000 }, // 10 per second
} satisfies Record<string, RateLimitRule>;

declare global {
  var __bdBuckets: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!globalThis.__bdBuckets) globalThis.__bdBuckets = new Map();
  return globalThis.__bdBuckets;
}

/**
 * DECISION: limits are enforced in production, or when BD_RATE_LIMIT=on. Local dev
 * and the e2e suite create far more than 10 games an hour from one IP.
 */
export function rateLimitEnabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.BD_RATE_LIMIT === 'on';
}

/** Returns true when the request is allowed. */
export function allow(rule: RateLimitRule, key: string, now = Date.now()): boolean {
  if (!rateLimitEnabled()) return true;
  const map = buckets();
  const b = map.get(key) ?? { tokens: rule.capacity, updatedAt: now };
  const refilled = Math.min(rule.capacity, b.tokens + (now - b.updatedAt) * rule.refillPerMs);
  const next: Bucket = { tokens: refilled, updatedAt: now };
  const ok = next.tokens >= 1;
  if (ok) next.tokens -= 1;
  map.set(key, next);
  // Keep the map from growing without bound.
  if (map.size > 10_000) {
    for (const [k, v] of map) {
      if (now - v.updatedAt > 60 * 60 * 1000) map.delete(k);
    }
  }
  return ok;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return (fwd.split(',')[0] ?? '').trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Test hook. */
export function resetRateLimits(): void {
  globalThis.__bdBuckets = new Map();
}
