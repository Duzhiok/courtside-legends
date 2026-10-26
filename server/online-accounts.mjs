/**
 * T6 P3 server accounts + ratings (no WebSocket code here).
 *
 * - Passwords are never stored: scrypt hash + random salt per account.
 * - Ratings are Elo (K = 32, start 1000); wins/losses count; draws and
 *   missing players change nothing.
 * - Accounts persist as JSON. The default file lives in the user's home
 *   directory, NOT inside the repo: the static site serves the repo root,
 *   so an accounts file there would be publicly readable.
 * - Sessions are in-memory tokens only; a server restart logs everyone
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

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function publicView(acct) {
  return { name: acct.name, rating: acct.rating, wins: acct.wins, losses: acct.losses };
}

export function createAccountStore({ file = DEFAULT_ACCOUNTS_FILE, now = Date.now } = {}) {
  const accounts = new Map();
  const sessions = new Map();
  // Only EXISTING accounts are tracked, so made-up names cannot grow this map.
  const failures = new Map(); // name -> { count, lockedUntil }
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
      if (typeof password !== "string" || password.length < 4) {
        return { ok: false, reason: "密码至少 4 位" };
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
    isLocked: (name) => (failures.get(String(name || "").trim())?.lockedUntil ?? 0) > now(),
    verify: (name, password) => {
      const clean = String(name || "").trim();
      const acct = accounts.get(clean);
      if (!acct || typeof password !== "string") return false;
      const record = failures.get(clean);
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
        failures.delete(clean);
        return true;
      }
      const count = (record?.count || 0) + 1;
      failures.set(clean, count >= MAX_LOGIN_FAILURES ? { count: 0, lockedUntil: now() + LOGIN_LOCK_MS } : { count, lockedUntil: 0 });
      return false;
    },
    createSession: (name) => {
      const token = randomBytes(16).toString("hex");
      sessions.set(token, name);
      return token;
    },
    getSession: (token) => sessions.get(token) || null,
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
