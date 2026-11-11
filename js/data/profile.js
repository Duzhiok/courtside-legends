/**
 * My World identity (ADR-008, N-1b): the PLAYER'S ACCOUNT identity -- display name, hometown, short bio.
 *
 * Deliberately separate from any Reborn / time-travel career identity: a career save may make you a Brazilian
 * rookie in 1996, but that lives inside the career save and never reads or writes this. Accounts keep their
 * existing `name` as the display name (no second name field to drift); the new fields sit in `account.profile`.
 * Guests have no account, so their profile lives in ONE local key on this device only (the UI says so).
 */
import { saveAccount } from "./account.js";

export const PROFILE_LIMITS = Object.freeze({ name: 24, hometown: 40, bio: 160, identityPlace: 40 });
export const GUEST_PROFILE_KEY = "cls_guest_profile_v1";

// Control characters become spaces, runs of whitespace collapse, then trim + cap. Plain text only:
// views escape on output, this just keeps stored values tidy and bounded.
const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * ADR-004 D1: structured identity places (account-level, not per career).
 * Each field is a city name, capped like the hometown free text; an empty
 * field is null (unset), and all-empty is null (absent). The old hometown
 * free text is a separate field and is never migrated into these — it stays
 * display-only. Career snapshots (Reborn) copy from here at creation and
 * never write back.
 */
export function sanitizeIdentityPlaces(raw) {
  if (!raw || typeof raw !== "object") return null;
  const places = {
    birthplace: clean(raw.birthplace, PROFILE_LIMITS.identityPlace) || null,
    grewUpIn: clean(raw.grewUpIn, PROFILE_LIMITS.identityPlace) || null,
    representedCity: clean(raw.representedCity, PROFILE_LIMITS.identityPlace) || null,
  };
  return places.birthplace || places.grewUpIn || places.representedCity ? places : null;
}

export function sanitizeProfile(raw = {}) {
  const base = {
    name: clean(raw?.name, PROFILE_LIMITS.name),
    hometown: clean(raw?.hometown, PROFILE_LIMITS.hometown),
    bio: clean(raw?.bio, PROFILE_LIMITS.bio),
  };
  const places = sanitizeIdentityPlaces(raw?.identityPlaces);
  return places ? { ...base, identityPlaces: places } : base;
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
  return {
    ...sanitizeProfile({
      name: account.name,
      hometown: profile.hometown,
      bio: profile.bio,
      identityPlaces: profile.identityPlaces,
    }),
    guest: false,
  };
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
  // Identity places ride along with the profile (never derived from the
  // hometown free text, and never written back from a career snapshot).
  account.profile = {
    hometown: next.hometown,
    bio: next.bio,
    ...(next.identityPlaces ? { identityPlaces: next.identityPlaces } : {}),
  };
  persist(account);
  return { ...readIdentity(account, store), saved: true };
}
