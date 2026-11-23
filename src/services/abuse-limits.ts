import { LimitsEnvSchema } from "@/src/env";
import { HttpError } from "./http-error";

const LOOPBACK = /^(127\.|::1$|::ffff:127\.|localhost$)/;

/** Client address as seen by the public tunnel, which appends it as the right-most X-Forwarded-For entry. */
export function clientIp(request: Request): string | null {
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop && !LOOPBACK.test(hop));
  return hops.at(-1) ?? null;
}

/** Fixed-window in-memory limiter (one server process). */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key: string) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= opts.windowMs) {
        if (windows.size > 10000) windows.clear();
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= opts.limit) throw new HttpError(429, "rate_limited");
      w.count++;
    },
  };
}

export function launchLimits(now: () => number = Date.now) {
  const env = LimitsEnvSchema.parse(process.env);
  return {
    ...env,
    ip: createRateLimiter({ limit: env.IP_RATE_LIMIT_PER_HOUR, windowMs: 3600000, now }),
  };
}

let shared: ReturnType<typeof launchLimits> | undefined;
/** Per-IP limit on model-calling endpoints; requests without a public client address (local) are not limited. */
export function limitModelCalls(request: Request) {
  const ip = clientIp(request);
  if (!ip) return;
  shared ??= launchLimits();
  shared.ip.hit(ip);
}
