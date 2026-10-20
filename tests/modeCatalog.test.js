import test from "node:test";
import assert from "node:assert/strict";
import {
  MODE_GROUPS,
  allModes,
  modeById,
  validateCatalog,
  variantsOf,
} from "../js/data/modeCatalog.js";

test("catalog has unique mode ids and valid variant/group references", () => {
  assert.equal(validateCatalog(), true);
  const ids = allModes().map((mode) => mode.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("quick-play variants are declared without removing the original modes", () => {
  const custom = modeById("custom");
  assert.ok(custom);
  const variants = variantsOf("custom");
  assert.deepEqual(variants.map((mode) => mode.id).sort(), ["draft", "quick"]);
  for (const variant of variants) {
    assert.equal(modeById(variant.id)?.id, variant.id);
  }
});

test("every mode group exposes at least one mode and a label", () => {
  for (const group of MODE_GROUPS) {
    assert.ok(group.label);
    assert.ok(Array.isArray(group.modes) && group.modes.length > 0);
  }
});

test("validateCatalog rejects corrupted catalogs without mutating the shared singleton", () => {
  const corrupted = [
    ...MODE_GROUPS,
    { id: "broken", label: "broken", parentModeId: "does-not-exist", modes: [{ id: "x", title: "x" }] },
  ];
  assert.throws(() => validateCatalog(corrupted), /unknown parentModeId/);
  assert.equal(validateCatalog(), true);
  assert.equal(MODE_GROUPS.some((group) => group.id === "broken"), false);
});

test("validateCatalog rejects duplicate ids across groups", () => {
  const duplicated = [
    ...MODE_GROUPS,
    { id: "dup", label: "dup", modes: [{ id: "custom", title: "dup" }] },
  ];
  assert.throws(() => validateCatalog(duplicated), /duplicate mode id/);
});
