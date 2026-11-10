/**
 * Player Reborn PR3 — weekly training. Growth is the existing awardGrowth
 * engine, so the test proves the Reborn wiring (focus -> plan -> ledger ->
 * card), not the engine itself. One level costs 1200 XP and a big game is
 * worth ~77 XP for a 21-year-old, so the level-up test plays ~20 games
 * through the pure growth function (no sim).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRAINING_FOCI,
  focusAttributes,
  chooseFocus,
  trainingPlan,
  applyGameGrowth,
  describeGrowth,
} from "../js/reborn/training.js";
import { createRebornState, buildPlayerCard, applyIdentityToRoster } from "../js/reborn/identity.js";
import { rosterCards } from "../js/reborn/season.js";
import { attributeCeiling } from "../js/career/playerGrowth.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("the three foci train the engine's trios", () => {
  assert.deepEqual(focusAttributes("shooting"), ["three", "mid", "scoring"]);
  assert.deepEqual(focusAttributes("defense"), ["defense", "steal", "block"]);
  assert.deepEqual(focusAttributes("playmaking"), ["pass", "iq", "speed"]);
  assert.deepEqual(TRAINING_FOCI, ["shooting", "defense", "playmaking"]);
});

test("one focus per week; the input is never mutated", () => {
  const reborn = createRebornState("reborn-train-1", ROWS);
  const chosen = chooseFocus(reborn, "shooting", 1);
  assert.deepEqual(chosen.player.training, { focus: "shooting", week: 1 });
  assert.equal(reborn.player.training, undefined, "input untouched");
  assert.throws(() => chooseFocus(chosen, "defense", 1), /already chosen/);
  const nextWeek = chooseFocus(chosen, "defense", 2);
  assert.deepEqual(nextWeek.player.training, { focus: "defense", week: 2 });
  assert.throws(() => chooseFocus(reborn, "dance", 1), /invalid/);
  assert.throws(() => chooseFocus(reborn, "shooting", 0), /invalid/);
});

test("the plan map is what awardGrowth consumes", () => {
  const reborn = createRebornState("reborn-train-1", ROWS);
  assert.deepEqual(trainingPlan(reborn), {}, "no focus, no plan");
  const chosen = chooseFocus(reborn, "defense", 1);
  assert.deepEqual(trainingPlan(chosen), { [reborn.identity.bref]: { focus: "defense" } });
});

test("games under a focus grow the card — and never past the ceiling", () => {
  let reborn = createRebornState("reborn-train-1", ROWS);
  reborn = chooseFocus(reborn, "shooting", 1);
  const cards = applyIdentityToRoster(rosterCards(ROWS, reborn.player.teamId, 1997), reborn.identity, {
    players: ROWS,
  });
  const clone = buildPlayerCard(reborn.identity, ROWS);
  const line = { id: clone.id, min: 30, score: 20 };
  let out = null;
  let leveledTotal = 0;
  for (let i = 0; i < 20; i++) {
    out = applyGameGrowth(reborn, { year: 1997, cards, rows: ROWS, lines: [line] });
    reborn = out.reborn;
    leveledTotal += out.entries[0].leveled.length;
    for (const step of out.entries[0].leveled) {
      assert.ok(
        TRAINING_FOCI.includes("shooting") && ["three", "mid", "scoring"].includes(step.attribute),
        "only the focus trio grows",
      );
      assert.equal(step.to, step.from + 1);
      const base = step.from - (out.growth[reborn.identity.bref].deltas[step.attribute] - 1);
      assert.ok(
        step.to <= attributeCeiling(clone, step.attribute, base, []),
        "never past the ceiling",
      );
    }
  }
  assert.ok(leveledTotal >= 1, "twenty big games level at least once");
  const grown = buildPlayerCard(reborn.identity, ROWS, { growth: reborn.player.growth });
  assert.ok(
    grown.three + grown.mid + grown.scoring >
      clone.three + clone.mid + clone.scoring,
    "the gains show up on the card",
  );
  assert.equal(reborn.player.growth[reborn.identity.bref].year, 1997);
});

test("growth entries render with their source on the card", () => {
  const lines = describeGrowth(
    [{ xp: 77, leveled: [{ attribute: "three", from: 53, to: 54 }] }],
    "zh",
  );
  assert.deepEqual(lines, ["训练：three 53 → 54"]);
  assert.deepEqual(
    describeGrowth([{ xp: 77, leveled: [{ attribute: "three", from: 53, to: 54 }] }], "en"),
    ["Training: three 53 → 54"],
  );
  assert.deepEqual(describeGrowth([], "zh"), []);
  assert.deepEqual(
    describeGrowth([{ id: "x", name: "Darius Daniels", xp: 77, leveled: [] }], "zh"),
    ["训练经验 +77（Darius Daniels）"],
  );
  assert.deepEqual(
    describeGrowth([{ id: "x", name: "Darius Daniels", xp: 77, leveled: [] }], "en"),
    ["Training XP +77 (Darius Daniels)"],
  );
});
