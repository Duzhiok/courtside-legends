import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { PLAYERS, overall, seasonToCard } from "../js/data/players.js";
import { pledgeProphecy, prophecyBoard, prophecySeed, settleProphecy, sleeperCandidates } from "../js/career/draftProphecy.js";
import { PROPHECY_HIT, PROPHECY_HIT_OVR, PROPHECY_MISS } from "../js/career/balance.js";
import { resolveFutureKnowledgeChoice } from "../js/modes/timeTravelCareer.js";
import { settleSeasonRollover } from "../js/modes/seasonRollover.js";
import { exportRootSave, importRootSave } from "../js/data/saveRoot.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const REAL = ROWS.map(seasonToCard);
const cardsOf = (bref) => REAL.filter((c) => c.bref === bref).sort((a, b) => a.season - b.season);
const bestEarly = (bref) => {
  const cards = cardsOf(bref);
  return Math.max(...cards.filter((c) => c.season <= cards[0].season + 2).map(overall));
};

/** A real 1995 career that chose to share a sleeper. */
const sharedRoot = () => resolveFutureKnowledgeChoice(hiredRoot(), "share-draft-sleeper");

test("the board: three real prospects from the next three classes, exactly one real sleeper", () => {
  for (const year of [1984, 1995, 2003, 2014]) {
    const board = sleeperCandidates({ year, seed: 7, players: REAL });
    assert.equal(board.length, 3, `${year}`);
    const kinds = board.map((c) => {
      const cards = cardsOf(c.bref);
      assert.equal(cards[0].season, c.rookieSeason, "rookie season is his first real card");
      assert.ok(c.rookieSeason >= year + 1 && c.rookieSeason <= year + 3, `${c.name} is in the next three classes`);
      const best = bestEarly(c.bref);
      assert.ok(c.low <= best && best <= c.high, `${c.name}: the memory band contains the truth (${c.low}-${c.high} vs ${best})`);
      return best >= 78 && overall(cards[0]) <= 68 ? "sleeper" : best <= 70 ? "decoy" : "other";
    });
    assert.deepEqual(kinds.sort(), ["decoy", "decoy", "sleeper"], `${year}: ${board.map((c) => c.name)}`);
    assert.ok(board.every((c) => !("best" in c)), "the answer never leaves the module");
  }
});

test("same career, same board; a different career seed can draw a different one", () => {
  const a = sleeperCandidates({ year: 1995, seed: 7, players: REAL });
  assert.deepEqual(sleeperCandidates({ year: 1995, seed: 7, players: REAL }), a);
  const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => sleeperCandidates({ year: 1995, seed, players: REAL }).map((c) => c.bref).sort().join()));
  assert.ok(seen.size > 1, "the seed matters");
});

test("no honest board, no board: 1992 has no sleeper in its next classes, and a season past the roster can't be judged", () => {
  assert.deepEqual(sleeperCandidates({ year: 1992, seed: 7, players: REAL }), []);
  assert.deepEqual(sleeperCandidates({ year: 2024, seed: 7, players: REAL }), []);
});

test("pledging: only after sharing a sleeper, only someone on the board, only once", () => {
  const root = sharedRoot();
  const board = prophecyBoard(root, REAL);
  assert.equal(board.length, 3);
  assert.throws(() => pledgeProphecy(resolveFutureKnowledgeChoice(hiredRoot(), "keep-quiet"), board[0].bref, REAL), /only after/);
  assert.throws(() => pledgeProphecy(root, "jordami01", REAL), /not on the board/);
  const pledged = pledgeProphecy(root, board[0].bref, REAL);
  assert.equal(pledged.story.prophecy.bref, board[0].bref);
  assert.equal(pledged.story.prophecy.judgeYear, board[0].rookieSeason + 2);
  assert.equal(pledged.story.prophecy.status, "pending");
  assert.equal(pledged.story.eventLog.at(-1).type, "prophecy-made");
  assert.throws(() => pledgeProphecy(pledged, board[1].bref, REAL), /already/);
  assert.equal(prophecySeed(root.story), prophecySeed(pledged.story));
});

function pledgedOn(kind) {
  const root = sharedRoot();
  const pick = prophecyBoard(root, REAL).find((c) => (bestEarly(c.bref) >= PROPHECY_HIT_OVR) === (kind === "sleeper"));
  return { root: pledgeProphecy(root, pick.bref, REAL), pick };
}

test("the verdict waits for his third season to end, then pays out off his REAL cards -- once", () => {
  const { root, pick } = pledgedOn("sleeper");
  const judge = root.story.prophecy.judgeYear;
  assert.equal(settleProphecy(root, { year: judge, players: REAL }), root, "his third season is not over yet");
  const settled = settleProphecy(root, { year: judge + 1, players: REAL });
  assert.equal(settled.story.prophecy.status, "hit");
  assert.equal(settled.story.prophecy.best, bestEarly(pick.bref));
  assert.equal(settled.story.frontOfficeTrust, root.story.frontOfficeTrust + PROPHECY_HIT.trust);
  assert.equal(settled.coach.reputation, root.coach.reputation + PROPHECY_HIT.reputation);
  assert.equal(settled.story.eventLog.at(-1).type, "prophecy-result");
  assert.equal(settleProphecy(settled, { year: judge + 5, players: REAL }), settled, "settled once");
});

test("backing a prospect who never broke out costs you trust", () => {
  const { root } = pledgedOn("decoy");
  const settled = settleProphecy(root, { year: root.story.prophecy.judgeYear + 1, players: REAL });
  assert.equal(settled.story.prophecy.status, "miss");
  assert.equal(settled.story.frontOfficeTrust, root.story.frontOfficeTrust + PROPHECY_MISS.trust);
  assert.equal(settled.coach.reputation, root.coach.reputation);
});

test("no card for him (data not loaded) is never guessed as a miss", () => {
  const { root } = pledgedOn("sleeper");
  assert.equal(settleProphecy(root, { year: 2010, players: [] }), root);
});

test("the season rollover settles it and hands the result to the recap", () => {
  const { root, pick } = pledgedOn("sleeper");
  const before = PLAYERS.length;
  PLAYERS.push(...cardsOf(pick.bref));
  try {
    const { root: next, prophecy } = settleSeasonRollover(root, { year: root.story.prophecy.judgeYear + 1 });
    assert.equal(prophecy?.hit, true);
    assert.equal(next.story.prophecy.status, "hit");
  } finally {
    PLAYERS.length = before;
  }
});

test("a prophecy survives a save round-trip; a malformed one is rejected", () => {
  const { root } = pledgedOn("sleeper");
  assert.deepEqual(importRootSave(exportRootSave(root)).story.prophecy, root.story.prophecy);
  const settled = settleProphecy(root, { year: root.story.prophecy.judgeYear + 1, players: REAL });
  assert.deepEqual(importRootSave(exportRootSave(settled)).story.prophecy, settled.story.prophecy);
  for (const broken of [{ ...root.story.prophecy, status: "maybe" }, { ...root.story.prophecy, low: 90, high: 60 }, { ...root.story.prophecy, status: "hit" }]) {
    assert.throws(() => importRootSave(exportRootSave({ ...root, story: { ...root.story, prophecy: broken } })));
  }
});
