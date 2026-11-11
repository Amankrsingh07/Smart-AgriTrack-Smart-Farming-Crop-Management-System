type Bucket = { timestamps: number[] };
const store = globalThis as typeof globalThis & { __agritrackRateLimits?: Map<string, Bucket> };
const buckets = store.__agritrackRateLimits ??= new Map();

export function checkRateLimit(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key) ?? { timestamps: [] };
  current.timestamps = current.timestamps.filter((time: number) => now - time < windowMs);
  if (current.timestamps.length >= limit) {
    buckets.set(key, current);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.timestamps[0])) / 1000)) };
  }
  current.timestamps.push(now);
  buckets.set(key, current);
  if (buckets.size > 5000) for (const [entry, bucket] of buckets) if (bucket.timestamps.every((time: number) => now - time >= windowMs)) buckets.delete(entry);
  return { allowed: true, retryAfterSeconds: 0 };
}
