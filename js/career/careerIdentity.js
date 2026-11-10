/**
 * Career identity contract (ADR-006 R2).
 *
 * Pure functions only — no reads from localStorage, no writes, no save
 * changes. The identity is a career-entry choice, not a mode: the mode
 * catalog stays 13 and these roles never become catalog entries.
 *
 * `identityOf(root)` answers "who are you now" for an existing save.
 * A save without an identity is the Classic GM + Coach (the old
 * implementation), per ADR-006 Q1 — old saves are never migrated.
 *
 * `permissionsFor(role)` is the target permission matrix (ADR-006 §0/§3.3).
 * It has no consumers yet: the Coach/GM permission separation (R4–R5) is a
 * separate architecture slice. Do NOT add a capability here unless a real
 * consumer is about to read it, and never hide a button as a substitute
 * for a permission check — the check belongs at the command entry.
 */

/** The four career identities, in the order the entry screen shows them. */
export const CAREER_ROLES = ["PLAYER", "COACH", "GM", "GM_COACH"];

/** Entry-screen identity id -> role id. */
export const CAREER_IDENTITY_ROLES = {
  player: "PLAYER",
  coach: "COACH",
  gm: "GM",
  gm_coach: "GM_COACH",
};

/**
 * Every capability the matrix knows about. Keep this list minimal: only
 * capabilities a real consumer reads (ADR-006 §3.3).
 * - takeover: play the clutch moments yourself (Player Reborn, ADR-005).
 * - personalTraining / teamTraining / setTrainingFocus / allocateDevelopment:
 *   the training split from the role audit (C9): the player trains
 *   themself, the coach sets focus, the GM allocates the budget.
 * - suggestTrade / suggestDraft: a Coach may only suggest a deal or a
 *   pick — never execute one.
 * - watchGame: watch live / simulate / change playback speed (all roles).
 * - signOwnContract: your own employment contract (all roles have one).
 */
export const CAREER_CAPABILITIES = [
  "takeover",
  "personalTraining",
  "commandGame",
  "setRotation",
  "teamTraining",
  "setTrainingFocus",
  "suggestTrade",
  "suggestDraft",
  "trade",
  "signFreeAgent",
  "release",
  "draft",
  "allocateDevelopment",
  "watchGame",
  "signOwnContract",
];

/**
 * Which role a save plays as. Missing or invalid identity reads as the
 * Classic GM + Coach — the save is never rewritten for this.
 * @param {object|null|undefined} root the long-career root save (v3)
 * @returns {"PLAYER"|"COACH"|"GM"|"GM_COACH"}
 */
export function identityOf(root) {
  const role = root?.identity?.currentRole;
  return CAREER_ROLES.includes(role) ? role : "GM_COACH";
}

/**
 * The permission set for a role (ADR-006 §0 matrix). A fresh Set every
 * call — callers must not mutate the matrix. Unknown roles grant nothing
 * (fail closed); callers should resolve the role through identityOf()
 * first, which maps unknown saves to GM_COACH.
 * @param {string} role one of CAREER_ROLES
 * @returns {Set<string>} the capabilities this role holds
 */
export function permissionsFor(role) {
  switch (role) {
    case "PLAYER":
      return new Set(["takeover", "personalTraining", "watchGame", "signOwnContract"]);
    case "COACH":
      return new Set([
        "commandGame",
        "setRotation",
        "teamTraining",
        "setTrainingFocus",
        "suggestTrade",
        "suggestDraft",
        "watchGame",
        "signOwnContract",
      ]);
    case "GM":
      return new Set([
        "trade",
        "signFreeAgent",
        "release",
        "draft",
        "allocateDevelopment",
        "watchGame",
        "signOwnContract",
      ]);
    case "GM_COACH":
      return new Set(CAREER_CAPABILITIES);
    default:
      return new Set();
  }
}
