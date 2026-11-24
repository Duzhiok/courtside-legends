/**
 * T6 P3 server accounts + ratings (no WebSocket code here).
 *
 * - Passwords are never stored: scrypt hash + random salt per account.
 * - Ratings are Elo (K = 32, start 1000); wins/losses count; draws and
 *   missing players change nothing.
 * - Accounts persist as JSON. The default file lives in the user's home
 *   directory, NOT inside the repo: the static site serves the repo root,
 *   so an accounts file there would be publicly readable.
 * - Sessions are in-memory tokens only (7-day sliding expiry); a server restart logs everyone
 *   out (accounts and ratings survive).
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const DEFAULT_ACCOUNTS_FILE = join(homedir(), ".courtside-online-accounts.json");
export const ELO_K = 32;
export const START_RATING = 1000;
/** Wrong passwords before an account locks, and for how long. scryptSync is deliberately slow and
 *  blocks the event loop, so unthrottled guessing is both a brute-force and a denial-of-service hole. */
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 60_000;
/** Sessions expire after this long without use (each use slides it); they used to live until a restart. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** New accounts need at least 8 characters; a 4-character password has too small a guessing space. */
export const MIN_PASSWORD_LENGTH = 8;
/** True when a password the user just typed is shorter than the current minimum: the account still
 *  logs in (there is no password-change flow yet), but the client shows a one-time upgrade hint. */
export function passwordNeedsUpgrade(password) {
  return typeof password === "string" && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function publicView(acct) {
  return { name: acct.name, rating: acct.rating, wins: acct.wins, losses: acct.losses };
}

export function createAccountStore({ file = DEFAULT_ACCOUNTS_FILE, now = Date.now, sessionTtlMs = SESSION_TTL_MS } = {}) {
  const accounts = new Map();
  const sessions = new Map(); // token -> { name, expires }
  // Only EXISTING accounts are tracked, so made-up names cannot grow this map. Keyed by name AND the caller's
  // address: a per-name lock let anyone keep any account locked out forever with 5 wrong guesses a minute.
  const failures = new Map(); // `${name}\u0000${from}` -> { count, lockedUntil }
  const failKey = (name, from) => `${name}\u0000${from || ""}`;
  try {
    const raw = readFileSync(file, "utf8");
    for (const a of JSON.parse(raw)) accounts.set(a.name, a);
  } catch {
    // Missing file: first run. Corrupt file: start empty (a later save
    // overwrites it); nothing recoverable is lost silently beyond that.
  }

  const save = () => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify([...accounts.values()], null, 2));
      renameSync(tmp, file);
    } catch {
      // Persistence is best-effort; the game still works in memory.
    }
  };

  return {
    file,
    count: () => accounts.size,
    get: (name) => {
      const acct = accounts.get(name);
      return acct ? publicView(acct) : null;
    },
    register: (name, password) => {
      const clean = String(name || "").trim();
      if (!clean || clean.length > 20) return { ok: false, reason: "名字需为 1–20 字" };
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, reason: `密码至少 ${MIN_PASSWORD_LENGTH} 位` };
      }
      if (accounts.has(clean)) return { ok: false, reason: "名字已被注册" };
      const salt = randomBytes(16).toString("hex");
      accounts.set(clean, {
        name: clean,
        salt,
        hash: hashPassword(password, salt),
        rating: START_RATING,
        wins: 0,
        losses: 0,
        createdAt: Date.now(),
      });
      save();
      return { ok: true, name: clean };
    },
    isLocked: (name, from = "") => (failures.get(failKey(String(name || "").trim(), from))?.lockedUntil ?? 0) > now(),
    verify: (name, password, from = "") => {
      const clean = String(name || "").trim();
      const acct = accounts.get(clean);
      if (!acct || typeof password !== "string") return false;
      const key = failKey(clean, from);
      const record = failures.get(key);
      if (record && record.lockedUntil > now()) return false; // refuse before paying for scrypt
      let ok = false;
      try {
        const expected = Buffer.from(acct.hash, "hex");
        const actual = Buffer.from(hashPassword(password, acct.salt), "hex");
        ok = expected.length === actual.length && timingSafeEqual(expected, actual);
      } catch {
        ok = false;
      }
      if (ok) {
        failures.delete(key);
        return true;
      }
      const count = (record?.count || 0) + 1;
      failures.set(key, count >= MAX_LOGIN_FAILURES ? { count: 0, lockedUntil: now() + LOGIN_LOCK_MS } : { count, lockedUntil: 0 });
      return false;
    },
    createSession: (name) => {
      const token = randomBytes(16).toString("hex");
      const t = now();
      // Drop expired tokens while we are here, so the map cannot grow without bound.
      for (const [k, v] of sessions) if (v.expires <= t) sessions.delete(k);
      sessions.set(token, { name, expires: t + sessionTtlMs });
      return token;
    },
    getSession: (token) => {
      const entry = sessions.get(token);
      if (!entry) return null;
      const t = now();
      if (entry.expires <= t) {
        sessions.delete(token);
        return null;
      }
      entry.expires = t + sessionTtlMs; // sliding
      return entry.name;
    },
    recordMatch: (winnerName, loserName) => {
      if (!winnerName || !loserName || winnerName === loserName) return null;
      const winner = accounts.get(winnerName);
      const loser = accounts.get(loserName);
      if (!winner || !loser) return null;
      const expectedWinner = 1 / (1 + 10 ** ((loser.rating - winner.rating) / 400));
      winner.rating += Math.round(ELO_K * (1 - expectedWinner));
      loser.rating += Math.round(ELO_K * (0 - (1 - expectedWinner)));
      winner.wins += 1;
      loser.losses += 1;
      save();
      return { winner: publicView(winner), loser: publicView(loser) };
    },
  };
}
