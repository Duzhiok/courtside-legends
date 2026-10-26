/**
 * Registration rate limiting for the online server.
 *
 * Registering is expensive (a scrypt hash that blocks the event loop) and valuable (every new account starts
 * with gold), so it is limited per client address and, as a backstop against many addresses, globally.
 *
 * The gate is asked BEFORE the hash (`check`) and charged only for accounts that were actually created
 * (`record`): a mistyped name, a taken name or a too-short password costs the caller nothing. A side effect
 * is that memory stays bounded: addresses are only remembered after a success, so the table can never hold
 * more than the global limit's worth of entries, however many addresses probe the server.
 */

export const REGISTER_PER_IP_LIMIT = 5;
export const REGISTER_GLOBAL_LIMIT = 100;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/**
 * @param {{ perIp?: number, global?: number, windowMs?: number, now?: () => number }} [options]
 *   `Infinity` switches a limit off.
 */
export function createRegistrationGate({
  perIp = REGISTER_PER_IP_LIMIT,
  global = REGISTER_GLOBAL_LIMIT,
  windowMs = REGISTER_WINDOW_MS,
  now = Date.now,
} = {}) {
  /** ip -> timestamps of recent successful registrations, oldest first. */
  const byIp = new Map();
  /** every recent successful registration, oldest first. */
  let all = [];

  const prune = () => {
    const cutoff = now() - windowMs;
    all = all.filter((t) => t > cutoff);
    for (const [ip, times] of byIp) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length) byIp.set(ip, recent);
      else byIp.delete(ip);
    }
  };

  /** How long until the entry that is `limit` places from the newest one falls out of the window. */
  const retryAfter = (times, limit) => Math.max(1, times[times.length - limit] + windowMs - now());

  return {
    /** @returns {{ ok: true } | { ok: false, scope: "ip" | "global", retryAfterMs: number }} */
    check(ip) {
      prune();
      const mine = byIp.get(ip) || [];
      if (mine.length >= perIp) return { ok: false, scope: "ip", retryAfterMs: retryAfter(mine, perIp) };
      if (all.length >= global) return { ok: false, scope: "global", retryAfterMs: retryAfter(all, global) };
      return { ok: true };
    },
    /** Charge one created account to `ip`. */
    record(ip) {
      const t = now();
      all.push(t);
      byIp.set(ip, [...(byIp.get(ip) || []), t]);
    },
    /** Number of addresses currently remembered (for tests). */
    size: () => byIp.size,
  };
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/**
 * The address to rate limit a connection by.
 * Without a trusted proxy that is the socket's peer address, and X-Forwarded-For is IGNORED: any client can
 * send that header, so believing it would let a caller pick a fresh "address" for every request. Behind a
 * proxy you control (`trustProxy`), use the RIGHTMOST entry: that is the one your proxy appended; anything to
 * its left was supplied by the client.
 */
export function clientIp(req, { trustProxy = false } = {}) {
  const peer = String(req?.socket?.remoteAddress || "");
  const normalize = (ip) => ip.replace(IPV4_MAPPED, "$1");
  if (trustProxy) {
    const header = req?.headers?.["x-forwarded-for"];
    const entries = String(Array.isArray(header) ? header.join(",") : header || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length) return normalize(entries[entries.length - 1]);
  }
  return peer ? normalize(peer) : "unknown";
}
