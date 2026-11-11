/**
 * Career Identity Snapshot (M4-C, ADR-004 D1 boundary).
 *
 * When a career is created, the account's current identity places
 * ({ birthplace, grewUpIn, representedCity }) are copied onto the career
 * record as `identitySnapshot` — a frozen copy of who the player was
 * when this career started. Later account edits never rewrite it, and
 * it never writes back to the account.
 *
 * The snapshot lives on the per-mode career record, not on the root:
 * one root can hold both a leagueCareer and a reborn (starting Reborn
 * does not clear an existing leagueCareer), and each career keeps its
 * own snapshot. A career created before identity places existed — or
 * while the account had none — simply has no snapshot field, and reads
 * fall back to the account's live places.
 *
 * Pure functions only — no storage reads, no writes. Hometown Legends
 * (M4-B) reads through resolveCareerIdentityPlaces(), never the field.
 */
import { sanitizeIdentityPlaces } from "../data/profile.js";

/**
 * Clean raw places into a snapshot, or null when there is nothing to
 * keep (all three fields empty). Idempotent: re-sanitizing an existing
 * snapshot returns an equal value, so carry-forward paths (re-employment)
 * can pass a stored snapshot straight through.
 * @param {object|null|undefined} raw places in identityPlaces shape
 * @returns {{birthplace: string|null, grewUpIn: string|null, representedCity: string|null}|null}
 */
export function snapshotIdentityPlaces(raw) {
  return sanitizeIdentityPlaces(raw);
}

/**
 * The snapshot stored on a career record, as a fresh copy (mutating the
 * return value never touches the stored record). Absent on old saves and
 * on careers created while the account had no places.
 * @param {object|null|undefined} career a leagueCareer or reborn record
 * @returns {{birthplace: string|null, grewUpIn: string|null, representedCity: string|null}|null}
 */
export function careerIdentitySnapshot(career) {
  const snapshot = snapshotIdentityPlaces(career?.identitySnapshot);
  return snapshot ? { ...snapshot } : null;
}

/**
 * The identity places a career plays under: its frozen snapshot when it
 * has one, otherwise the account's live places. Read-only — nothing here
 * writes to the career or to the account.
 *
 * `account` accepts an account object ({ profile: { identityPlaces } }),
 * a guest profile, or a readIdentity() result (all carry identityPlaces
 * directly); null/undefined (guest with no places) reads as no live places.
 * @param {object|null|undefined} career a leagueCareer or reborn record
 * @param {object|null|undefined} account the account (or guest identity) to fall back to
 * @returns {{birthplace: string|null, grewUpIn: string|null, representedCity: string|null}|null}
 */
export function resolveCareerIdentityPlaces(career, account) {
  const snapshot = careerIdentitySnapshot(career);
  if (snapshot) return snapshot;
  return snapshotIdentityPlaces(account?.profile?.identityPlaces ?? account?.identityPlaces);
}
