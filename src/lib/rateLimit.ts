// Simple in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const LIMIT_PER_HOUR = 50; // 50 API calls per hour per IP
const HOUR_MS = 60 * 60 * 1000;

export function getRateLimitKey(req: Request): string {
  // Use IP address from headers (Vercel sets x-forwarded-for)
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return ip;
}

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || now > record.resetTime) {
    // New window
    requestCounts.set(key, { count: 1, resetTime: now + HOUR_MS });
    return { allowed: true, remaining: LIMIT_PER_HOUR - 1, resetAt: now + HOUR_MS };
  }

  record.count += 1;

  if (record.count > LIMIT_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetTime,
    };
  }

  return {
    allowed: true,
    remaining: LIMIT_PER_HOUR - record.count,
    resetAt: record.resetTime,
  };
}
