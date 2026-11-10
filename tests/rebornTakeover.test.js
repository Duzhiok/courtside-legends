/**
 * Player Reborn PR4 — the takeover moment. The choice mapping and the
 * controller-gated ask are pinned exactly; the outcome is only ever
 * described (never a win probability — the dialog HTML must contain no
 * percentage at all). Game results are never asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import {
  TAKEOVER_OPTIONS,
  takeoverOption,
  takeoverDecisionFor,
  askTakeover,
  createTakeoverHook,
  takeoverDialogHtml,
  describeTakeoverOutcome,
} from "../js/ui/reborn/takeover.js";
import { createRebornState, buildPlayerCard, REBORN_TEAM_IDS } from "../js/reborn/identity.js";
import { rosterCards, attemptTakeover } from "../js/reborn/season.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

function eligibleSim(seed = "reborn-take-1", { onCourt = true } = {}) {
  const reborn = createRebornState(seed, ROWS);
  const teamId = reborn.player.teamId;
  const clone = buildPlayerCard(reborn.identity, ROWS);
  const rest = rosterCards(ROWS, teamId, 1997).filter((p) => p.bref !== reborn.identity.bref);
  const homeCards = [clone, ...rest.slice(0, 9)];
  const oppId = REBORN_TEAM_IDS.find((t) => t !== teamId);
  const awayCards = rosterCards(ROWS, oppId, 1997).slice(0, 10);
  const starters = onCourt
    ? homeCards.slice(0, 5).map((p) => p.id)
    : homeCards.slice(1, 6).map((p) => p.id);
  const sim = new GameSim({
    home: { name: teamId, players: homeCards, starterIds: starters },
    away: { name: oppId, players: awayCards, starterIds: awayCards.slice(0, 5).map((p) => p.id) },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  sim.quarter = 4;
  sim.clock = 100;
  sim.score = { home: 98, away: 100 };
  sim.possession = "home";
  return { sim, reborn, clone };
}

test("three options: drive, pull-up, pass — pass declines the moment", () => {
  assert.deepEqual(TAKEOVER_OPTIONS.map((o) => o.id), ["drive", "pullup", "pass"]);
  assert.deepEqual(takeoverDecisionFor("drive"), { actionHint: "attack" });
  assert.deepEqual(takeoverDecisionFor("pullup"), { actionHint: "three" });
  assert.equal(takeoverDecisionFor("pass"), null);
  assert.equal(takeoverDecisionFor(null), null);
  assert.throws(() => takeoverDecisionFor("dunk"), /invalid/);
  assert.equal(takeoverOption("drive").zh, "突破上篮");
});

test("askTakeover returns the validated pick with its attempt id — it does not submit", async () => {
  const { sim, clone } = eligibleSim();
  const out = await askTakeover({ sim, playerId: clone.id, onAsk: async () => "drive" });
  assert.equal(out.shooterId, clone.id);
  assert.equal(out.actionHint, "attack");
  assert.ok(out.attemptId);
  assert.equal(sim.clutchDecision, null, "the driver submits, not the ask");
});

test("askTakeover with pull-up picks the jumper; with pass it declines", async () => {
  const { sim, clone } = eligibleSim("reborn-take-2");
  const pullup = await askTakeover({ sim, playerId: clone.id, onAsk: async () => "pullup" });
  assert.equal(pullup.actionHint, "three");
  assert.equal(await askTakeover({ sim, playerId: clone.id, onAsk: async () => "pass" }), null);
  assert.equal(await askTakeover({ sim, playerId: clone.id, onAsk: async () => null }), null);
});

test("askTakeover refuses when the player is not on court", async () => {
  const { sim, clone } = eligibleSim("reborn-take-3", { onCourt: false });
  assert.equal(await askTakeover({ sim, playerId: clone.id, onAsk: async () => "drive" }), null);
});

test("the hook plugs into the driver: drive submits, the outcome lands in clutchLog", async () => {
  const { sim, clone } = eligibleSim("reborn-take-4");
  const hook = createTakeoverHook({ onAsk: async () => "drive" });
  const out = await attemptTakeover(sim, clone.id, hook);
  assert.equal(out.accepted, true);
  assert.equal(out.actionHint, "attack");
  for (let i = 0; i < 20 && sim.clutchLog.length === 0; i++) sim.step();
  assert.equal(sim.clutchLog.length, 1);
  assert.equal(sim.clutchLog[0].shooterId, clone.id);
  assert.equal(sim.clutchLog[0].actionHint, "attack");
  // The shot type itself is the engine's weighted choice from the player's
  // tendencies — the hint changes who shoots and what the team hunts, not
  // the dice. The probe (scripts/research/reborn-takeover-probe.mjs) measures
  // the distribution: pull-up shifts a shooter to threes, drive to twos for
  // a non-shooter.
});

test("the dialog shows the situation and the three choices — never a percentage", () => {
  const { sim, clone } = eligibleSim("reborn-take-5");
  const html = takeoverDialogHtml({ sim, playerId: clone.id, lang: "zh" });
  assert.match(html, /突破上篮/);
  assert.match(html, /急停跳投/);
  assert.match(html, /传给队友/);
  assert.match(html, /Q4/);
  assert.match(html, /98 – 100/);
  assert.ok(!html.includes("%"), "no percentage anywhere — no win probability");
  assert.ok(!/胜率|win probability|win rate/i.test(html));
  const en = takeoverDialogHtml({ sim, playerId: clone.id, lang: "en" });
  assert.match(en, /Drive to the rim/);
  assert.ok(!en.includes("%"));
});

test("the outcome is described as what happened, zh + en", () => {
  assert.equal(
    describeTakeoverOutcome({ attempted: true, made: true, zone: "three", points: 3 }, "zh"),
    "关键回合：三分打进（3 分）",
  );
  assert.equal(
    describeTakeoverOutcome({ attempted: true, made: false, zone: "two", points: 0 }, "zh"),
    "关键回合：两分没进（0 分）",
  );
  assert.equal(
    describeTakeoverOutcome({ attempted: true, made: true, zone: "two", points: 2 }, "en"),
    "Takeover: made the two (2 pts)",
  );
  assert.equal(
    describeTakeoverOutcome({ attempted: false, reason: "turnover" }, "zh"),
    "关键回合：失误了",
  );
  assert.equal(
    describeTakeoverOutcome({ attempted: false, reason: "doubled" }, "en"),
    "Takeover: doubled, never got the ball",
  );
  assert.equal(describeTakeoverOutcome(null, "zh"), null);
});
