/**
 * ADR-004 v3→v4 save migration (M4 opening work).
 *
 * The v3 snapshot in tests/fixtures/v3-career-root.json is a real hired
 * time-travel career built by the game's own builders (hiredRoot) and frozen
 * in the stored form — the exact bytes a v3 build wrote to localStorage
 * (writeRootSave compacts the season first). v4 adds no root fields yet, so
 * a v3 root is exactly this shape with the version stamp at 3.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRootState, clearRootSave, deleteCareerSave, exportRootSave, importRootSave, migrateLegacySaves, migrateRootSave, readRootSave, ROOT_SAVE_KEY, ROOT_SAVE_VERSION, ROOT_SAVE_MIN_VERSION, validateRoot, writeRootSave } from "../js/data/saveRoot.js";
import { MIGRATION_BACKUP_KEY, MIGRATION_MIN_VERSION, MIGRATION_MAX_VERSION, migrateRoot, migrateV3ToV4 } from "../js/data/saveMigration.js";
import { readIdentity, sanitizeIdentityPlaces, sanitizeProfile, saveIdentity } from "../js/data/profile.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const fixtureText = readFileSync(new URL("./fixtures/v3-career-root.json", import.meta.url), "utf8");
const fixtureRoot = JSON.parse(fixtureText);

/** A v3 root built by the game's own builders (schemaVersion pinned to 3). */
function v3Root(overrides = {}) {
  return { ...createRootState(overrides), schemaVersion: 3 };
}

/** A v3 save envelope, the format exportRootSave used to write. */
function v3Envelope(root) {
  return JSON.stringify({ format: "courtside-legends-save", schemaVersion: 3, exportedAt: new Date().toISOString(), root });
}

/** Storage that enforces a hard byte budget, like saveQuotaRetry.test.js. */
function limitedStorage(limit, seed = {}) {
  const storage = createMemoryStorage(seed);
  const used = () => Object.entries(storage.dump()).reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  return {
    getItem(key) { return storage.getItem(key); },
    setItem(key, value) {
      const next = used() - (storage.getItem(key)?.length ?? 0) + String(value).length;
      if (next > limit) throw new DOMException("quota", "QuotaExceededError");
      storage.setItem(key, value);
    },
    removeItem(key) { storage.removeItem(key); },
    dump() { return storage.dump(); },
  };
}

/* ------------------------------------------------------------------ */
/* Pure migration functions                                            */
/* ------------------------------------------------------------------ */

test("migration constants stay in sync with the save root's", () => {
  assert.equal(MIGRATION_MIN_VERSION, ROOT_SAVE_MIN_VERSION);
  assert.equal(MIGRATION_MAX_VERSION, ROOT_SAVE_VERSION);
  assert.equal(ROOT_SAVE_VERSION, 4);
  assert.equal(ROOT_SAVE_MIN_VERSION, 3);
});

test("real v3 snapshot round-trips byte-identical except schemaVersion", () => {
  const before = JSON.parse(fixtureText);
  const migrated = migrateV3ToV4(before);
  // The input is untouched; the output differs only in the version stamp.
  assert.deepEqual(before, fixtureRoot);
  assert.equal(JSON.stringify(migrated), fixtureText.replace('"schemaVersion":3', '"schemaVersion":4'));
  assert.equal(migrated.schemaVersion, 4);
  validateRoot(migrated);
});

test("migrateV3ToV4 stamps v4 and never mutates its input", () => {
  const root = v3Root({ activeMode: "timeTravel" });
  const snapshot = JSON.stringify(root);
  const migrated = migrateV3ToV4(root);
  assert.equal(migrated.schemaVersion, 4);
  assert.notEqual(migrated, root);
  assert.equal(JSON.stringify(root), snapshot);
  validateRoot(migrated);
});

test("migrateV3ToV4 rejects anything that is not a v3 root", () => {
  assert.throws(() => migrateV3ToV4(createRootState()), /expects a v3 root/);
  assert.throws(() => migrateV3ToV4({ ...v3Root(), schemaVersion: 2 }), /expects a v3 root/);
  assert.throws(() => migrateV3ToV4({ ...v3Root(), schemaVersion: 5 }), /expects a v3 root/);
  assert.throws(() => migrateV3ToV4(null), /expects a v3 root/);
  assert.throws(() => migrateV3ToV4("v3"), /expects a v3 root/);
});

test("migrateRoot dispatcher: v3 migrates, v4 is a no-op, others rejected", () => {
  const v3 = v3Root();
  assert.equal(migrateRoot(v3).schemaVersion, 4);
  const v4 = createRootState();
  assert.equal(migrateRoot(v4), v4);
  assert.throws(() => migrateRoot({ ...v3, schemaVersion: 2 }), /unsupported older game version/);
  assert.throws(() => migrateRoot({ ...v3, schemaVersion: 5 }), /newer game version/);
  assert.throws(() => migrateRoot({}), /invalid root save/);
  assert.throws(() => migrateRoot(null), /invalid root save/);
});

test("validateRoot accepts v3-shaped and v4 roots, rejects v2 and v5", () => {
  validateRoot(v3Root());
  validateRoot(createRootState());
  assert.throws(() => validateRoot({ ...v3Root(), schemaVersion: 2 }), /unsupported older game version/);
  assert.throws(() => validateRoot({ ...v3Root(), schemaVersion: 5 }), /newer game version/);
});

test("missing-field v3 roots migrate: no coach, no inbox, no reborn, null story", () => {
  const root = v3Root({ activeMode: "timeTravel" });
  // coach / careerInbox / reborn are optional-when-absent (same rule as
  // root.coach); story must be present but may be null.
  delete root.coach;
  delete root.careerInbox;
  delete root.reborn;
  root.story = null;
  const migrated = migrateV3ToV4(root);
  assert.equal(migrated.schemaVersion, 4);
  validateRoot(migrated);
});

/* ------------------------------------------------------------------ */
/* Orchestrator: migrateRootSave                                       */
/* ------------------------------------------------------------------ */

test("orchestrator migrates the fixture and retains the backup", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  const migrated = migrateRootSave(storage);
  assert.equal(migrated.schemaVersion, 4);
  // The stored root is v4; the backup still holds the original v3 bytes.
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(migrated));
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), fixtureText);
  assert.equal(readRootSave(storage).schemaVersion, 4);
  validateRoot(JSON.parse(storage.getItem(ROOT_SAVE_KEY)));
});

test("re-migration is idempotent: a v4 root is a no-op with no backup written", () => {
  const root = createRootState({ savedAt: 42 });
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: JSON.stringify(root) });
  const first = migrateRootSave(storage);
  assert.equal(first.schemaVersion, 4);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
  assert.equal(migrateRootSave(storage).schemaVersion, 4);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(root));
});

test("migrating twice keeps the first backup: the second run changes nothing", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  migrateRootSave(storage);
  const afterFirst = storage.dump();
  migrateRootSave(storage);
  assert.deepEqual(storage.dump(), afterFirst);
});

test("migrateRootSave returns null when there is no root", () => {
  assert.equal(migrateRootSave(createMemoryStorage()), null);
});

test("v5 roots stay rejected: migrateRootSave throws, readRootSave stays null", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: JSON.stringify({ ...v3Root(), schemaVersion: 5 }) });
  assert.throws(() => migrateRootSave(storage), /newer game version/);
  assert.equal(readRootSave(storage), null);
});

/* ------------------------------------------------------------------ */
/* Quota and corruption: the original is never lost                    */
/* ------------------------------------------------------------------ */

test("quota-full during the backup aborts before touching anything", () => {
  const rootText = JSON.stringify(v3Root());
  // Fits the root alone (1x) but not root + backup (2x).
  const storage = limitedStorage(rootText.length + Math.floor(rootText.length / 2), { [ROOT_SAVE_KEY]: rootText });
  assert.throws(() => migrateRootSave(storage), /storage quota exceeded/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), rootText);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
  assert.equal(readRootSave(storage).schemaVersion, 3);
});

test("quota-full during the commit keeps the original bytes intact (M4 acceptance)", () => {
  const rootText = JSON.stringify(v3Root());
  // Fits root + backup (2x) but not root + backup + tmp (3x).
  const storage = limitedStorage(2 * rootText.length + Math.floor(rootText.length / 2), { [ROOT_SAVE_KEY]: rootText });
  assert.throws(() => migrateRootSave(storage), /storage quota exceeded/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), rootText);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), rootText);
  // The original is still a readable v3 save: the player loses nothing.
  assert.equal(readRootSave(storage).schemaVersion, 3);
  // And the migration can be retried once space is freed.
  migrateRootSave(createMemoryStorage({ [ROOT_SAVE_KEY]: rootText }));
});

test("corrupt root JSON with a valid backup restores first, then migrates", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: "{corrupt", [MIGRATION_BACKUP_KEY]: fixtureText });
  const migrated = migrateRootSave(storage);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), fixtureText);
  assert.equal(readRootSave(storage).schemaVersion, 4);
});

test("corrupt root JSON with no usable backup throws and leaves the bytes alone", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: "{corrupt" });
  assert.throws(() => migrateRootSave(storage), /invalid root save/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), "{corrupt");
});

test("corrupt root JSON with a corrupt backup throws and leaves the bytes alone", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: "{corrupt", [MIGRATION_BACKUP_KEY]: "{also corrupt" });
  assert.throws(() => migrateRootSave(storage), /invalid root save/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), "{corrupt");
});

test("a stale corrupt backup is overwritten by the current root before migrating", () => {
  const rootText = JSON.stringify(v3Root());
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: rootText, [MIGRATION_BACKUP_KEY]: "{stale corrupt" });
  assert.equal(migrateRootSave(storage).schemaVersion, 4);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), rootText);
});

test("a v2 root is never migrated or touched", () => {
  const rootText = JSON.stringify({ ...v3Root(), schemaVersion: 2 });
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: rootText });
  assert.throws(() => migrateRootSave(storage), /unsupported older game version/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), rootText);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
});

/* ------------------------------------------------------------------ */
/* Backup retention: until the next VERIFIED save                      */
/* ------------------------------------------------------------------ */

test("backup is deleted only after a subsequent verified save", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  migrateRootSave(storage);
  assert.notEqual(storage.getItem(MIGRATION_BACKUP_KEY), null);
  const migrated = readRootSave(storage);
  writeRootSave(migrated, storage);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
  assert.equal(readRootSave(storage).schemaVersion, 4);
});

test("backup survives a failed next save, so the migration stays retryable", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  migrateRootSave(storage);
  const migratedBytes = storage.getItem(ROOT_SAVE_KEY);
  let failing = true;
  const wrapped = {
    getItem(key) { return storage.getItem(key); },
    setItem(key, value) {
      if (failing) throw new DOMException("quota", "QuotaExceededError");
      storage.setItem(key, value);
    },
    removeItem(key) { storage.removeItem(key); },
  };
  assert.throws(() => writeRootSave(readRootSave(storage), wrapped), /storage quota exceeded/);
  // The failed save changed nothing and the backup is still there.
  assert.equal(storage.getItem(ROOT_SAVE_KEY), migratedBytes);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), fixtureText);
  // Once the failure clears, a verified save finally drops the backup.
  failing = false;
  writeRootSave(readRootSave(storage), wrapped);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
});

/* ------------------------------------------------------------------ */
/* Lazy hook: migrateLegacySaves                                       */
/* ------------------------------------------------------------------ */

test("lazy hook migrates a v3 root on first read and keeps the backup", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  const result = migrateLegacySaves(storage);
  assert.equal(result.source, ROOT_SAVE_KEY);
  assert.equal(result.root.schemaVersion, 4);
  assert.equal(result.migrationError, undefined);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), fixtureText);
});

test("lazy hook passes a v4 root through without touching storage", () => {
  const root = createRootState({ savedAt: 42 });
  const rootText = JSON.stringify(root);
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: rootText });
  const result = migrateLegacySaves(storage);
  assert.deepEqual(result, { root, source: ROOT_SAVE_KEY });
  assert.equal(storage.getItem(ROOT_SAVE_KEY), rootText);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
});

test("lazy hook returns the v3 root plus the error when migration fails (boot keeps working)", () => {
  const rootText = JSON.stringify(v3Root());
  const storage = limitedStorage(rootText.length + Math.floor(rootText.length / 2), { [ROOT_SAVE_KEY]: rootText });
  const result = migrateLegacySaves(storage);
  assert.equal(result.root.schemaVersion, 3);
  assert.equal(result.source, ROOT_SAVE_KEY);
  assert.match(result.migrationError.message, /storage quota exceeded/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), rootText);
});

test("lazy hook returns null when there is no root at all", () => {
  assert.equal(migrateLegacySaves(createMemoryStorage()), null);
});

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

test("importing a v3 envelope migrates in memory and never writes the migration", () => {
  const storage = createMemoryStorage();
  const imported = importRootSave(v3Envelope(JSON.parse(fixtureText)));
  assert.equal(imported.schemaVersion, 4);
  assert.deepEqual(imported, { ...fixtureRoot, schemaVersion: 4 });
  assert.equal(storage.getItem(ROOT_SAVE_KEY), null);
});

test("importing a v4 envelope works unchanged; export stamps v4", () => {
  const root = hiredRoot();
  const exported = exportRootSave(root);
  const envelope = JSON.parse(exported);
  assert.equal(envelope.schemaVersion, 4);
  assert.deepEqual(importRootSave(exported), root);
});

test("import still rejects v5 envelopes and v2 envelopes", () => {
  const v5 = JSON.stringify({ format: "courtside-legends-save", schemaVersion: 5, exportedAt: new Date().toISOString(), root: createRootState() });
  assert.throws(() => importRootSave(v5), /requires a newer game version/);
  const v2 = JSON.stringify({ format: "courtside-legends-save", schemaVersion: 2, exportedAt: new Date().toISOString(), root: createRootState() });
  assert.throws(() => importRootSave(v2), /unsupported older game version/);
  // A v3 envelope carrying a v5 root is still rejected as a newer save.
  const v3EnvelopeV5Root = JSON.stringify({ format: "courtside-legends-save", schemaVersion: 3, exportedAt: new Date().toISOString(), root: { ...v3Root(), schemaVersion: 5 } });
  assert.throws(() => importRootSave(v3EnvelopeV5Root), /newer game version/);
});

/* ------------------------------------------------------------------ */
/* Old-save fixture regression                                         */
/* ------------------------------------------------------------------ */

test("old-save fixture regression: the v3 snapshot loads, imports and migrates", () => {
  // Plain read: v3 stays a legal save.
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText });
  assert.equal(readRootSave(storage).schemaVersion, 3);
  assert.equal(readRootSave(storage).activeMode, "timeTravel");
  // Import: the v3 envelope migrates in memory.
  assert.equal(importRootSave(v3Envelope(fixtureRoot)).schemaVersion, 4);
  // Lazy hook: first read migrates it in place, backup retained.
  const discovered = migrateLegacySaves(storage);
  assert.equal(discovered.root.schemaVersion, 4);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), fixtureText);
});

/* ------------------------------------------------------------------ */
/* Clearing a career also clears its backup                            */
/* ------------------------------------------------------------------ */

test("clearRootSave removes the migration backup so a deleted career never comes back", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText, [MIGRATION_BACKUP_KEY]: fixtureText });
  clearRootSave(storage);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), null);
});

test("deleteCareerSave removes the migration backup (no-profile branch)", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: fixtureText, [MIGRATION_BACKUP_KEY]: fixtureText });
  deleteCareerSave(storage, { release: true });
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), null);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), null);
});

/* ------------------------------------------------------------------ */
/* Identity Places (ADR-004 D1, account.profile)                       */
/* ------------------------------------------------------------------ */

test("sanitizeIdentityPlaces cleans, caps and nulls empty fields", () => {
  assert.deepEqual(sanitizeIdentityPlaces({ birthplace: "  Shanghai  ", grewUpIn: "", representedCity: "  " }), {
    birthplace: "Shanghai",
    grewUpIn: null,
    representedCity: null,
  });
  assert.equal(sanitizeIdentityPlaces({}), null);
  assert.equal(sanitizeIdentityPlaces({ birthplace: "   " }), null);
  assert.equal(sanitizeIdentityPlaces(null), null);
  assert.equal(sanitizeIdentityPlaces("Shanghai"), null);
  const long = "A".repeat(100);
  assert.equal(sanitizeIdentityPlaces({ birthplace: long }).birthplace.length, 40);
  // Control characters are cleaned, never stored raw.
  assert.equal(sanitizeIdentityPlaces({ birthplace: "New\u0007York" }).birthplace, "New York");
});

test("sanitizeProfile carries identityPlaces through only when present", () => {
  const withPlaces = sanitizeProfile({ name: "Zhi", hometown: "上海", identityPlaces: { birthplace: "Shanghai" } });
  assert.deepEqual(withPlaces.identityPlaces, { birthplace: "Shanghai", grewUpIn: null, representedCity: null });
  const without = sanitizeProfile({ name: "Zhi", hometown: "上海" });
  assert.equal("identityPlaces" in without, false);
  const emptied = sanitizeProfile({ name: "Zhi", identityPlaces: { birthplace: "  " } });
  assert.equal("identityPlaces" in emptied, false);
});

test("saveIdentity preserves identityPlaces across edits; hometown stays separate", () => {
  const account = { name: "Zhi", profile: { hometown: "上海", bio: "", identityPlaces: { birthplace: "上海", grewUpIn: "南京", representedCity: null } } };
  const saved = saveIdentity(account, { bio: "new bio" });
  assert.deepEqual(saved.identityPlaces, { birthplace: "上海", grewUpIn: "南京", representedCity: null });
  assert.equal(saved.hometown, "上海");
  // The old hometown free text is never turned into a place by itself.
  const plain = saveIdentity({ name: "Zhi", profile: { hometown: "上海", bio: "" } }, { hometown: "北京" });
  assert.equal(plain.identityPlaces, undefined);
  assert.equal(plain.hometown, "北京");
});

test("readIdentity surfaces the account's identityPlaces", () => {
  const account = { name: "Zhi", profile: { hometown: "上海", bio: "", identityPlaces: { birthplace: "上海", grewUpIn: null, representedCity: "芝加哥" } } };
  const identity = readIdentity(account, createMemoryStorage());
  assert.deepEqual(identity.identityPlaces, { birthplace: "上海", grewUpIn: null, representedCity: "芝加哥" });
  assert.equal(identity.hometown, "上海");
  assert.equal(identity.guest, false);
});
