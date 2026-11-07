/**
 * My World identity (ADR-008, N-1b): the PLAYER'S ACCOUNT identity -- display name, hometown, short bio.
 *
 * Deliberately separate from any Reborn / time-travel career identity: a career save may make you a Brazilian
 * rookie in 1996, but that lives inside the career save and never reads or writes this. Accounts keep their
 * existing `name` as the display name (no second name field to drift); the new fields sit in `account.profile`.
 * Guests have no account, so their profile lives in ONE local key on this device only (the UI says so).
 */
import { saveAccount } from "./account.js";

export const PROFILE_LIMITS = Object.freeze({ name: 24, hometown: 40, bio: 160 });
export const GUEST_PROFILE_KEY = "cls_guest_profile_v1";

// Control characters become spaces, runs of whitespace collapse, then trim + cap. Plain text only:
// views escape on output, this just keeps stored values tidy and bounded.
const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function sanitizeProfile(raw = {}) {
  return {
    name: clean(raw?.name, PROFILE_LIMITS.name),
    hometown: clean(raw?.hometown, PROFILE_LIMITS.hometown),
    bio: clean(raw?.bio, PROFILE_LIMITS.bio),
  };
}

export function defaultStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // storage fully blocked (strict private mode): guests just can't persist
  }
}

export function readGuestProfile(store = defaultStore()) {
  try {
    return sanitizeProfile(JSON.parse(store?.getItem(GUEST_PROFILE_KEY) || "{}"));
  } catch {
    return sanitizeProfile();
  }
}

/** The identity shown in My World: from the account when signed in, from the guest key otherwise. */
export function readIdentity(account, store = defaultStore()) {
  if (!account) return { ...readGuestProfile(store), guest: true };
  const profile = account.profile || {};
  return { ...sanitizeProfile({ name: account.name, hometown: profile.hometown, bio: profile.bio }), guest: false };
}

/**
 * Save an identity edit. Touches only `name` + `profile` on the account (cards, gold, saves untouched).
 * An empty name keeps the old one -- an account must stay nameable in the account picker.
 * @returns identity plus `saved` (false only when guest storage is unavailable)
 */
export function saveIdentity(account, patch, { store = defaultStore(), persist = saveAccount } = {}) {
  const next = sanitizeProfile({ ...readIdentity(account, store), ...patch });
  if (!account) {
    try {
      if (!store) throw new Error("no storage");
      store.setItem(GUEST_PROFILE_KEY, JSON.stringify(next));
    } catch {
      return { ...next, guest: true, saved: false };
    }
    return { ...next, guest: true, saved: true };
  }
  if (next.name) account.name = next.name;
  account.profile = { hometown: next.hometown, bio: next.bio };
  persist(account);
  return { ...readIdentity(account, store), saved: true };
}
