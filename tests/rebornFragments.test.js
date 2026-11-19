/**
 * Career 2.0 decision 4: Player Reborn career fragments. Earned only from a real game's evidence (once per gameId),
 * spent only on intensive training through the existing growth engine, never on the account economy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INTENSIVE_COST,
  INTENSIVE_XP_MULTIPLIER,
  STANDOUT_MARGIN,
  buyIntensive,
  earnFromGame,
  fragmentLedger,
  intensiveBlocker,
  intensiveMultiplier,
} from "../js/reborn/fragments.js";
import { expectedGameScore } from "../js/reborn/trust.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { createRebornState, REBORN_TEAM_IDS } from "../js/reborn/identity.js";
import { chooseFocus } from "../js/reborn/training.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const empty = () => fragmentLedger({});
const withFragments = (reborn, balance, extra = {}) => ({ ...reborn, player: { ...reborn.player, fragments: { balance, intensiveWeek: null, history: [], ...extra } } });

test("a standout is measured against the role's own expectation, and only for a player who played", () => {
  const bar = expectedGameScore("bench") + STANDOUT_MARGIN;
  assert.equal(earnFromGame(empty(), { gameId: "g1", min: 18, gameScore: bar, role: "bench" }).earned, 1);
  assert.equal(earnFromGame(empty(), { gameId: "g1", min: 18, gameScore: bar - 0.1, role: "bench" }).earned, 0);
  assert.equal(earnFromGame(empty(), { gameId: "g1", min: 30, gameScore: bar, role: "starter" }).earned, 0, "a starter's bar is higher");
  assert.equal(earnFromGame(empty(), { gameId: "g1", min: 0, gameScore: 99, role: "dnp" }).earned, 0, "no minutes, no standout");
});

test("a rivalry win pays; both reasons pay 2; the same gameId never pays twice; the input is untouched", () => {
  const first = earnFromGame(empty(), { gameId: "g7", min: 30, gameScore: 25, role: "rotation", rivalryWon: true });
  assert.equal(first.earned, 2);
  assert.deepEqual(first.reasons, ["standout", "rivalry-win"]);
  assert.equal(first.ledger.balance, 2);
  const again = earnFromGame(first.ledger, { gameId: "g7", min: 30, gameScore: 25, role: "rotation", rivalryWon: true });
  assert.equal(again.earned, 0);
  assert.equal(again.ledger, first.ledger, "a replayed game changes nothing");
  assert.equal(empty().balance, 0);
});

test("intensive training: needs this week's focus and enough fragments, once per week, input never mutated", () => {
  const base = createRebornState("frag-buy-1", ROWS);
  assert.equal(intensiveBlocker(withFragments(base, 9), 1), "no-focus");
  const focused = chooseFocus(base, "shooting", 1);
  assert.equal(intensiveBlocker(withFragments(focused, INTENSIVE_COST - 1), 1), "short");
  const rich = withFragments(focused, INTENSIVE_COST + 1);
  const bought = buyIntensive(rich, 1);
  assert.equal(fragmentLedger(bought).balance, 1);
  assert.equal(fragmentLedger(rich).balance, INTENSIVE_COST + 1, "input untouched");
  assert.equal(intensiveBlocker(bought, 1), "already");
  assert.throws(() => buyIntensive(bought, 1), /already/);
  assert.equal(intensiveMultiplier(bought, 1), INTENSIVE_XP_MULTIPLIER);
  assert.equal(intensiveMultiplier(bought, 2), 1, "only the week it was bought for");
  assert.equal(intensiveMultiplier(rich, 1), 1);
});

test("an old Reborn save without a ledger reads as empty and can still play", () => {
  const ledger = fragmentLedger(createRebornState("frag-old-1", ROWS));
  assert.deepEqual(ledger, { balance: 0, intensiveWeek: null, specialWeek: null, specialSkill: null, history: [] });
});

test("real game: the report carries its fragments, the ledger persists, and intensive training multiplies this game's training XP", async () => {
  const start = createRebornState("frag-game-1", ROWS);
  start.player.coachTrust = 80; // a starter really plays (a new 25-trust player can DNP: zero XP would check nothing)
  const reborn = chooseFocus(start, "shooting", 1);
  const teamId = reborn.player.teamId;
  const opp = REBORN_TEAM_IDS.find((t) => t !== teamId);
  const oneGame = () => buildSeason(reborn, ROWS, { games: [{ homeId: teamId, awayId: opp, day: 1, played: false }] });

  const plain = await playGame(withFragments(reborn, INTENSIVE_COST), oneGame(), ROWS, {});
  const boosted = await playGame(buyIntensive(withFragments(reborn, INTENSIVE_COST), 1), oneGame(), ROWS, {});
  for (const out of [plain, boosted]) {
    assert.ok(Number.isInteger(out.report.fragments.earned) && out.report.fragments.earned <= 2);
    assert.equal(fragmentLedger(out.reborn).balance, out.report.fragments.balance, "what the report shows is what is saved");
  }
  assert.equal(plain.report.intensive, false);
  assert.equal(boosted.report.intensive, true);
  assert.equal(fragmentLedger(boosted.reborn).balance, boosted.report.fragments.earned, "the 3 spent are gone");
  assert.equal(boosted.report.line.min, plain.report.line.min, "same seed, same game: only the training differs");
  const xp = (out) => (out.report.growth || []).reduce((n, entry) => n + (entry.xp || 0), 0);
  assert.ok(xp(plain) > 0, "this seed's game earns training XP, so the multiplier is really checked");
  assert.ok(Math.abs(xp(boosted) - xp(plain) * INTENSIVE_XP_MULTIPLIER) <= 1, `${xp(boosted)} vs ${xp(plain)} x${INTENSIVE_XP_MULTIPLIER}`);
});

test("the Reborn ledger and the account's recycled fragments never meet", () => {
  const src = readFileSync(new URL("../js/reborn/fragments.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only, not the doc that explains the rule
  assert.doesNotMatch(src, /import[^;]*account/i, "fragments.js reads no account module");
  assert.doesNotMatch(src, /account\.fragments/, "and never touches account.fragments");
});
