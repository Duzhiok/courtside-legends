/**
 * Hometown Legends account state (ADR-009, M4-B): the childhood idol and the
 * hometown-challenge record. Lives in its OWN account field,
 * `account.hometownLegends`, so it never touches the identity fields owned
 * by M4-A (profile.js) and never reads or writes any career/Reborn save —
 * a career's hometown belongs to that career save alone.
 *
 *   account.hometownLegends = {
 *     idolBref: string | null,          // any roster person; no timeline limits; an idol is NOT a mentor
 *     challenge: { played, wins, losses, lastRepresentedCity, lastResult, lastAt },
 *   }
 *
 * The challenge record snapshots the represented city AT PLAY TIME: changing
 * the represented city later never rewrites it. Guests keep the same shape
 * in one local key on this device, like the guest profile.
 * Nothing here grants cards, gold, or any competitive effect.
 */
import { saveAccount } from "../account.js";

const GUEST_HOMETOWN_KEY = "cls_guest_hometown_v1";

const cleanBref = (v) => (typeof v === "string" && /^[a-z0-9_]+$/i.test(v.trim()) ? v.trim() : null);
const cleanCount = (v) => Math.max(0, Math.floor(Number(v) || 0));

export function sanitizeHometownState(raw) {
  const ch = raw?.challenge && typeof raw.challenge === "object" ? raw.challenge : {};
  return {
    idolBref: cleanBref(raw?.idolBref),
    challenge: {
      played: cleanCount(ch.played),
      wins: cleanCount(ch.wins),
      losses: cleanCount(ch.losses),
      lastRepresentedCity: typeof ch.lastRepresentedCity === "string" && ch.lastRepresentedCity.trim() ? ch.lastRepresentedCity.trim().slice(0, 40) : null,
      lastResult: ch.lastResult === "win" || ch.lastResult === "loss" ? ch.lastResult : null,
      lastAt: typeof ch.lastAt === "string" ? ch.lastAt : null,
    },
  };
}

function defaultStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** The stored state: from the account when signed in, from the guest key otherwise. */
export function readHometownState(account, store = defaultStore()) {
  if (!account) {
    try {
      return sanitizeHometownState(JSON.parse(store?.getItem(GUEST_HOMETOWN_KEY) || "null"));
    } catch {
      return sanitizeHometownState(null);
    }
  }
  return sanitizeHometownState(account.hometownLegends);
}

function writeState(account, state, { store = defaultStore(), persist = saveAccount } = {}) {
  if (!account) {
    try {
      if (!store) throw new Error("no storage");
      store.setItem(GUEST_HOMETOWN_KEY, JSON.stringify(state));
    } catch {
      return { ...state, saved: false };
    }
    return { ...state, saved: true };
  }
  account.hometownLegends = state;
  persist(account);
  return { ...state, saved: true };
}

/**
 * Choose (or clear, with null) the childhood idol. Any person on the roster
 * may be chosen — the idol is a story/display choice with no timeline limit
 * and no gameplay effect, and is not a mentor. When a roster bref set is
 * supplied, an unknown bref is rejected instead of stored.
 */
export function setIdol(account, bref, opts = {}) {
  if (bref != null && opts.knownBrefs && !opts.knownBrefs.has(bref)) {
    throw new Error(`unknown bref: ${bref}`);
  }
  const next = sanitizeHometownState({ ...readHometownState(account, opts.store), idolBref: bref ?? null });
  if (bref != null && !next.idolBref) throw new Error(`unknown bref: ${bref}`);
  return writeState(account, next, opts);
}

/**
 * Record one finished hometown challenge. `representedCity` is the city the
 * player represented in THIS game; it is stored as the record's city and is
 * not updated when the account's represented city changes later.
 */
export function recordChallengeResult(account, { won, representedCity, at = new Date().toISOString() } = {}, opts = {}) {
  const prev = readHometownState(account, opts.store);
  const next = sanitizeHometownState({
    ...prev,
    challenge: {
      played: prev.challenge.played + 1,
      wins: prev.challenge.wins + (won ? 1 : 0),
      losses: prev.challenge.losses + (won ? 0 : 1),
      lastRepresentedCity: representedCity || prev.challenge.lastRepresentedCity,
      lastResult: won ? "win" : "loss",
      lastAt: at,
    },
  });
  return writeState(account, next, opts);
}
