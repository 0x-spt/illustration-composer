export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;

export interface RateLimiter {
  /** Records a request; returns false when `key` exceeded the limit in the current window. */
  hit(key: string, now: number): boolean;
}

/** In-memory fixed window per key. Lives as long as the function instance does. */
export function createRateLimiter(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now) {
      for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
      const w = windows.get(key);
      if (!w) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}
