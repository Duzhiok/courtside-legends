import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  PLAYER_ROLES,
  inferPlayerRole,
  staminaMinuteCap,
  staminaMinuteHint,
  suggestTargetMinutes,
} from "../js/data/playerMinutes.js";
import { recordGameAndCheck, epiphanyCandidates, formLine } from "../js/data/epiphany.js";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Guard: A-P2-5 — js/data/ must not import js/engine/. The two violations were
// accountProgress.js -> engine/epiphany.js and playerPrefs.js -> engine/gameplan.js.
// The depended-upon pure functions now live in data/ (epiphany.js moved whole,
// role/minute rules in playerMinutes.js) and engine imports them back.
test("data layer does not import the engine layer (A-P2-5)", () => {
  for (const file of ["../js/data/accountProgress.js", "../js/data/playerPrefs.js"]) {
    assert.doesNotMatch(src(file), /from\s+["']\.\.\/engine\//, `${file} must not import engine/`);
  }
  assert.doesNotMatch(src("../js/data/epiphany.js"), /from\s+["']\.\.\/engine\//);
  assert.doesNotMatch(src("../js/data/playerMinutes.js"), /from\s+["']\.\.\/engine\//);
});

// Guard: the moves actually happened — no stale copies left behind.
test("epiphany lives in data/, minute rules live in data/playerMinutes.js", () => {
  assert.equal(existsSync(new URL("../js/engine/epiphany.js", import.meta.url)), false);
  assert.doesNotMatch(src("../js/engine/gameplan.js"), /export (const PLAYER_ROLES|function (inferPlayerRole|staminaMinuteCap|staminaMinuteHint|suggestTargetMinutes))/);
  assert.match(src("../js/engine/gameplan.js"), /from\s+["']\.\.\/data\/playerMinutes\.js["']/);
  assert.match(src("../js/engine/gameplan.js"), /PLAYER_ROLES,\s*inferPlayerRole,\s*staminaMinuteCap,\s*staminaMinuteHint,\s*suggestTargetMinutes/);
});

// Spot checks: the moved minute rules behave exactly as before the move.
test("playerMinutes: role minutes are capped by the stamina ceiling", () => {
  assert.equal(PLAYER_ROLES.alpha.wantMin, 36);
  assert.equal(suggestTargetMinutes({ roleExpectation: "alpha", stamina: 95, skills: [] }), 36);
  assert.equal(suggestTargetMinutes({ roleExpectation: "alpha", stamina: 50, skills: [] }), 24);
  assert.equal(suggestTargetMinutes({ roleExpectation: "bench", stamina: 95, skills: [] }), 12);
  assert.equal(suggestTargetMinutes({ roleExpectation: "starter", stamina: 60, skills: ["iron_lungs"] }), 30);
  assert.equal(staminaMinuteCap({ stamina: 50 }), 24);
  assert.equal(staminaMinuteCap({ stamina: 95 }), 48);
  assert.equal(inferPlayerRole({ roleExpectation: "sixth" }), "sixth");
  assert.match(staminaMinuteHint({ stamina: 50, targetMinutes: 30 }), /体能50/);
  assert.match(staminaMinuteHint({ stamina: 50, targetMinutes: 30 }, "en"), /Stamina 50/);
});

// Spot check: recordGameAndCheck is reachable from its new home and still records form.
test("epiphany: recordGameAndCheck works from js/data/epiphany.js", () => {
  const game = { min: 30, pts: 30, ast: 10, tpm: 0, twoPm: 0, reb: 0, blk: 0, stl: 0 };
  const { mod } = recordGameAndCheck({ merges: 0, skills: [] }, { skills: [] }, game, () => 0.99);
  assert.equal(mod.form.length, 1);
  assert.deepEqual(mod.form[0], formLine(game));
  assert.equal(epiphanyCandidates(mod.form, { skills: [] }).length, 0);
});
