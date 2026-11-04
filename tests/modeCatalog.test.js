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
  assert.deepEqual(variants.map((mode) => mode.id).sort(), [
    "draft",
    "duel",
    "familyDuel",
    "legend",
    "quick",
  ]);
  for (const variant of variants) {
    assert.equal(modeById(variant.id)?.id, variant.id);
  }
});

test("M1: catalog covers every playable mode, including the custom-hub entries", () => {
  assert.deepEqual(
    allModes()
      .map((mode) => mode.id)
      .sort(),
    [
      "career",
      "custom",
      "draft",
      "duel",
      "familyDuel",
      "franchise",
      "legend",
      "quick",
      "ranked",
      "sandbox",
      "season",
      "timeTravel",
      "tournament",
    ].sort(),
  );
  // sandbox has its own home card and screen — a regular mode, not a variant.
  assert.equal(modeById("sandbox")?.variantOf, undefined);
  // The hub entries are variants of custom, not standalone home cards.
  for (const id of ["legend", "duel", "familyDuel"]) {
    assert.equal(modeById(id)?.variantOf, "custom");
    assert.equal(modeById(id)?.homeTab, undefined);
  }
  // quick was promoted: same id, new name (M1 renames the demo card).
  assert.equal(modeById("quick")?.title, "快速开打");
});

test("M1: every mode declares a spec §3 explore group; panel modes declare a home tab", () => {
  for (const mode of allModes()) {
    assert.ok(mode.exploreGroup, `${mode.id} is missing exploreGroup`);
    assert.ok(
      ["挑战与竞技", "经理生涯", "自由创造", "朋友一起玩"].includes(mode.exploreGroup),
      `${mode.id} has an unknown exploreGroup: ${mode.exploreGroup}`,
    );
  }
  const panelModes = allModes().filter((mode) => mode.homeTab);
  assert.ok(panelModes.length >= 10, "most modes should render on a home tab");
  for (const mode of panelModes) {
    assert.ok(
      ["players", "career", "custom"].includes(mode.homeTab),
      `${mode.id} has an unknown homeTab: ${mode.homeTab}`,
    );
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
