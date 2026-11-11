/**
 * ADR-004 v3→v4 save migration (M4 opening work). Pure functions only — this
 * module imports nothing from saveRoot.js (saveRoot.js imports from here, so
 * an import back would be a cycle). The stateful half (backup key, strict
 * commit, lazy hook) lives in saveRoot.js, which owns the storage keys.
 *
 * What v4 adds to the root: nothing yet except the version stamp. Identity
 * Places live on account.profile (profile.js), not in the root, so
 * migrateV3ToV4 is a version stamp + a clone. Future M4 root fields will
 * fill their defaults here; validateRoot already treats every v4 field as
 * optional (same rule as root.coach), so a v3-shaped root stays legal.
 *
 * Downgrade (v4→v3) is deliberately NOT here: the user deferred it (Q4),
 * so there is no downgradeV4ToV3 and no downgrade export in this phase.
 */

/** The backup key holds the original v3 bytes until the next verified save. */
export const MIGRATION_BACKUP_KEY = "cls_root_v3_backup";

/**
 * Oldest root version the migrator understands. Kept in sync with
 * ROOT_SAVE_MIN_VERSION in saveRoot.js (tests pin the equality).
 */
export const MIGRATION_MIN_VERSION = 3;

/**
 * Newest root version the migrator understands. Kept in sync with
 * ROOT_SAVE_VERSION in saveRoot.js (tests pin the equality).
 */
export const MIGRATION_MAX_VERSION = 4;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Pure: stamp a v3 root to v4. Returns a NEW object; the input is untouched
 * (byte-identical when serialised, except the schemaVersion field). Throws
 * unless the input is a v3 root — the orchestrator validates first, so this
 * is a second line of defence, not the only one.
 */
export function migrateV3ToV4(root) {
  if (!isObject(root) || root.schemaVersion !== MIGRATION_MIN_VERSION) {
    throw new Error("migrateV3ToV4 expects a v3 root");
  }
  const next = cloneJson(root);
  next.schemaVersion = MIGRATION_MAX_VERSION;
  return next;
}

/**
 * Pure dispatcher: v3 → migrate; v4 → the input unchanged (a true no-op, so
 * re-running a migration is idempotent); older → "unsupported older game
 * version"; newer → "newer game version"; not a root → "invalid root save".
 * Same messages as validateRoot, so callers treat both the same way.
 */
export function migrateRoot(root) {
  if (!isObject(root) || !Number.isInteger(root.schemaVersion)) {
    throw new Error("invalid root save");
  }
  if (root.schemaVersion === MIGRATION_MAX_VERSION) return root;
  if (root.schemaVersion === MIGRATION_MIN_VERSION) return migrateV3ToV4(root);
  if (root.schemaVersion > MIGRATION_MAX_VERSION) {
    throw new Error("save was created by a newer game version");
  }
  throw new Error("save was created by an unsupported older game version");
}
