/**
 * Signature Awakening — integration on the real Reborn harness.
 * Game RESULTS are never asserted (policy); what is pinned is the wiring:
 * evidence extraction from real playGame reports, the extraSkills threading
 * through buildPlayerCard / playGame / nextSeasonCard, and the awakening
 * state surviving the persist round-trip.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeason, playGame } from "../js/reborn/season.js";
import {
  createRebornState,
  buildPlayerCard,
  REBORN_TEAM_IDS,
} from "../js/reborn/identity.js";
import { nextSeasonCard } from "../js/reborn/contract.js";
import {
  createAwakeningState,
  evidenceFromReport,
  recordGame,
  awakenedSkillIds,
  normalizeAwakeningState,
} from "../js/career/player/signatureAwakening.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

function twoGameSeason(reborn) {
  const teamId = reborn.player.teamId;
  const [opp1, opp2] = REBORN_TEAM_IDS.filter((t) => t !== teamId).slice(0, 2);
  return buildSeason(reborn, ROWS, {
    games: [
      { homeId: teamId, awayId: opp1, day: 1, played: false },
      { homeId: opp2, awayId: teamId, day: 2, played: false },
    ],
  });
}

function awakenedState() {
  return {
    ...createAwakeningState(1997),
    awakened: [
      {
        skillId: "glass_cleaner",
        source: "awakened",
        game: 1,
        season: 1997,
        evidence: { qualifying: 3, keyGame: 1 },
      },
    ],
  };
}

test("extraSkills ride on the built card; unknown or duplicate ids do not", () => {
  const reborn = createRebornState("reborn-awak-1", ROWS);
  const card = buildPlayerCard(reborn.identity, ROWS, { extraSkills: ["glass_cleaner"] });
  assert.ok(card.skills.includes("glass_cleaner"));
  const junk = buildPlayerCard(reborn.identity, ROWS, { extraSkills: ["nope_not_a_skill"] });
  assert.equal(junk.skills.includes("nope_not_a_skill"), false);
  const owned = buildPlayerCard(reborn.identity, ROWS, {
    extraSkills: [card.skills[0]].filter(Boolean),
  });
  assert.equal(
    owned.skills.filter((s) => s === card.skills[0]).length,
    1,
    "an already-owned skill is not duplicated",
  );
});

test("playGame threads the awakening state through untouched", async () => {
  const reborn = createRebornState("reborn-awak-2", ROWS);
  reborn.player.awakening = awakenedState();
  const before = JSON.stringify(reborn.player.awakening);
  const season = twoGameSeason(reborn);
  const out = await playGame(reborn, season, ROWS, {});
  assert.ok(out, "first game played");
  assert.equal(JSON.stringify(out.reborn.player.awakening), before);
  assert.equal(JSON.stringify(reborn.player.awakening), before, "input never mutated");
});

test("evidence from real reports is deterministic for a fixed seed", async () => {
  async function run(seed) {
    const reborn = createRebornState(seed, ROWS);
    const season = twoGameSeason(reborn);
    const evidence = [];
    let current = reborn;
    for (let i = 0; i < 2; i += 1) {
      const out = await playGame(current, season, ROWS, {});
      if (!out) break;
      evidence.push(evidenceFromReport(out.report));
      current = out.reborn;
    }
    return evidence;
  }
  const a = await run("reborn-awak-3");
  const b = await run("reborn-awak-3");
  assert.equal(a.length, 2);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same seed, same evidence");
  for (const e of a) {
    assert.equal("pts" in e, false, "points are not evidence");
    assert.equal(typeof e.min, "number");
  }
});

test("recording real reports updates the ledger (played games only)", async () => {
  const reborn = createRebornState("reborn-awak-4", ROWS);
  const season = twoGameSeason(reborn);
  let state = createAwakeningState(1997);
  let current = reborn;
  let played = 0;
  for (let i = 0; i < 2; i += 1) {
    const out = await playGame(current, season, ROWS, {});
    if (!out) break;
    const card = buildPlayerCard(out.reborn.identity, ROWS, {
      growth: out.reborn.player.growth,
      season: out.report.year,
      extraSkills: awakenedSkillIds(state),
    });
    const result = recordGame(state, { evidence: evidenceFromReport(out.report), card });
    state = result.state;
    if (out.report.line.min >= 8) played += 1;
    current = out.reborn;
  }
  assert.equal(state.form.length, played, "only games with real minutes enter the form");
});

test("nextSeasonCard carries awakened skills across the rollover", () => {
  const reborn = createRebornState("reborn-awak-5", ROWS);
  reborn.player.awakening = awakenedState();
  const card = nextSeasonCard(reborn, { year: 1998, players: ROWS });
  assert.ok(card.skills.includes("glass_cleaner"), "awakened skill survives the rollover");
});

test("awakening survives the JSON persist round-trip", () => {
  const reborn = createRebornState("reborn-awak-6", ROWS);
  reborn.player.awakening = awakenedState();
  const roundTripped = JSON.parse(JSON.stringify(reborn));
  assert.deepEqual(awakenedSkillIds(roundTripped.player.awakening), ["glass_cleaner"]);
  assert.equal(normalizeAwakeningState(roundTripped.player.awakening).version, 1);
});
