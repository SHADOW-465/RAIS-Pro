// Best-effort per-IP failed-attempt limiter for the break-glass login.
// In-memory: each serverless instance has its own table, which is still
// enough to slow a casual spray.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function now(): number {
  return Date.now();
}

function prune(t: number): void {
  if (buckets.size < 200) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= t) buckets.delete(k);
  }
}

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return (req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

export function loginAttemptsBlocked(ip: string): boolean {
  const t = now();
  prune(t);
  const b = buckets.get(ip);
  if (!b || b.resetAt <= t) return false;
  return b.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string): void {
  const t = now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= t) {
    buckets.set(ip, { count: 1, resetAt: t + WINDOW_MS });
    return;
  }
  b.count += 1;
}

export function clearLoginAttempts(ip: string): void {
  buckets.delete(ip);
}

/** Tests only. */
export function __resetLoginThrottleForTests(): void {
  buckets.clear();
}
