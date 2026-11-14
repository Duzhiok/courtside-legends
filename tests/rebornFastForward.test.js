/**
 * Player Reborn — simulate to the next meaningful event. The driver is
 * tested with a stub playOne (canned reports, advances season.index like
 * the real playGame) — nothing here asserts on random game results. The
 * key-game rule is pinned against real roster data: only LAL (Shaq) and
 * UTA (Malone) have a best card at OVR >= 85 in 1996-97.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  weekForGameIndex,
  opponentStar,
  isKeyGame,
  nextFastForwardTarget,
  describeFastForwardTarget,
  describeFastForwardEvent,
  fastForward,
  KEY_GAME_STAR_OVR,
} from "../js/reborn/fastForward.js";
import { createRebornState } from "../js/reborn/identity.js";
import { buildSeason } from "../js/reborn/season.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

const NON_KEY_OPPS = ["CHI", "BOS", "NYK", "DET", "MIA", "CLE", "IND", "POR", "SAS", "DAL"];

function gamesFor(teamId, opps) {
  return opps.map((opp, i) => ({ homeId: teamId, awayId: opp, day: i + 1 }));
}

function seasonWith(reborn, opps) {
  const teamId = reborn.player.teamId;
  const usable = opps.filter((o) => o !== teamId);
  return buildSeason(reborn, ROWS, { games: gamesFor(teamId, usable) });
}

/** A stub playOne: returns canned reports, advances season.index like playGame. */
function stubPlayOne(canned) {
  let n = 0;
  return async (reborn, season) => {
    const cannedReport = canned[Math.min(n, canned.length - 1)];
    n += 1;
    season.index += 1;
    const next = structuredClone(reborn);
    if (cannedReport.trustAfter !== undefined) next.player.coachTrust = cannedReport.trustAfter;
    if (cannedReport.roleAfter) next.player.rotationRole = cannedReport.roleAfter;
    return {
      reborn: next,
      report: {
        game: season.index,
        roleBefore: "garbage",
        roleAfter: "garbage",
        trustAfter: next.player.coachTrust,
        takeover: null,
        revealedNow: false,
        ...cannedReport,
      },
    };
  };
}

test("weekForGameIndex: 4 games per week, 1-based", () => {
  assert.equal(weekForGameIndex(0), 1);
  assert.equal(weekForGameIndex(3), 1);
  assert.equal(weekForGameIndex(4), 2);
  assert.equal(weekForGameIndex(81), 21);
});

test("key game: only a superstar opponent counts (OVR >= 85)", () => {
  assert.equal(KEY_GAME_STAR_OVR, 85);
  const reborn = createRebornState("reborn-ff-key-1", ROWS);
  const teamId = reborn.player.teamId;
  assert.equal(opponentStar(ROWS, "LAL", 1997).name, "Shaquille O'Neal");
  assert.equal(opponentStar(ROWS, "UTA", 1997).name, "Karl Malone");
  assert.equal(isKeyGame(ROWS, { homeId: teamId, awayId: "LAL" }, teamId, 1997), true);
  assert.equal(isKeyGame(ROWS, { homeId: "UTA", awayId: teamId }, teamId, 1997), true);
  assert.equal(isKeyGame(ROWS, { homeId: teamId, awayId: "CHI" }, teamId, 1997), false);
  assert.equal(isKeyGame(ROWS, { homeId: teamId, awayId: "BOS" }, teamId, 1997), false);
  assert.equal(isKeyGame(ROWS, null, teamId, 1997), false);
});

test("nextFastForwardTarget: training at the next week boundary, not the current week", () => {
  const reborn = createRebornState("reborn-ff-target-1", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 8));
  const target = nextFastForwardTarget(reborn, season, ROWS);
  // The run starts in week 1, whose training choice is already on screen —
  // the next training event is week 2's boundary, game index 4.
  assert.deepEqual(target, { type: "training", gameIndex: 4, detail: { week: 2 } });
  assert.match(describeFastForwardTarget(target, "zh"), /第 2 周训练/);
  assert.match(describeFastForwardTarget(target, "en"), /week 2 training/);
});

test("nextFastForwardTarget: a key game next beats a later training boundary", () => {
  const reborn = createRebornState("reborn-ff-target-2", ROWS);
  const teamId = reborn.player.teamId;
  const keyOpp = teamId === "LAL" ? "UTA" : "LAL";
  const season = seasonWith(reborn, ["CHI", keyOpp, "BOS", "NYK", "DET", "MIA", "CLE", "IND"]);
  const target = nextFastForwardTarget(reborn, season, ROWS);
  assert.equal(target.type, "key-game");
  assert.equal(target.gameIndex, 1);
  assert.equal(target.detail.opp, keyOpp);
  assert.match(describeFastForwardTarget(target, "zh"), new RegExp(`vs ${keyOpp}`));
});

test("nextFastForwardTarget: training already chosen for a week is skipped", () => {
  const reborn = createRebornState("reborn-ff-target-3", ROWS);
  const picked = structuredClone(reborn);
  picked.player.training = { focus: "shooting", week: 2 };
  // 12 games so week 3 exists (indices 8-11); opponents cycle, never the key teams.
  const usable = NON_KEY_OPPS.filter((o) => o !== picked.player.teamId);
  const opps = Array.from({ length: 12 }, (_, k) => usable[k % usable.length]);
  const season = seasonWith(picked, opps);
  const target = nextFastForwardTarget(picked, season, ROWS);
  // Week 2 is covered; the next training event is week 3, game index 8.
  assert.deepEqual(target, { type: "training", gameIndex: 8, detail: { week: 3 } });
});

test("nextFastForwardTarget: a finished season points at season-end", () => {
  const reborn = createRebornState("reborn-ff-target-4", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 2));
  season.index = season.games.length;
  assert.deepEqual(nextFastForwardTarget(reborn, season, ROWS), {
    type: "season-end",
    gameIndex: season.games.length,
    detail: null,
  });
});

test("fastForward stops at the next training boundary after simming week 1", async () => {
  const reborn = createRebornState("reborn-ff-run-1", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 8));
  const out = await fastForward(reborn, season, ROWS, {
    playOne: stubPlayOne([{ trustAfter: 26 }, { trustAfter: 27 }, { trustAfter: 27 }, { trustAfter: 28 }]),
  });
  assert.equal(out.reports.length, 4, "week 1 sims, then the run stops");
  assert.equal(out.stoppedAt.type, "training");
  assert.equal(out.stoppedAt.gameIndex, 4);
  assert.equal(out.stoppedAt.detail.week, 2);
  assert.equal(out.reborn.player.coachTrust, 28);
  assert.equal(season.index, 4);
  assert.match(describeFastForwardEvent(out.stoppedAt, "zh"), /第 2 周训练/);
});

test("fastForward stops before a key game without playing it", async () => {
  const reborn = createRebornState("reborn-ff-run-2", ROWS);
  const teamId = reborn.player.teamId;
  const keyOpp = teamId === "LAL" ? "UTA" : "LAL";
  const season = seasonWith(reborn, ["CHI", keyOpp, "BOS"]);
  const out = await fastForward(reborn, season, ROWS, { playOne: stubPlayOne([{ trustAfter: 26 }]) });
  assert.equal(out.reports.length, 1, "only the game before the key game sims");
  assert.equal(out.stoppedAt.type, "key-game");
  assert.equal(out.stoppedAt.gameIndex, 1);
  assert.equal(out.stoppedAt.detail.opp, keyOpp);
  assert.match(describeFastForwardEvent(out.stoppedAt, "zh"), new RegExp(keyOpp));
});

test("fastForward stops on a role change — starter is its own event", async () => {
  const reborn = createRebornState("reborn-ff-run-3", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 4));
  const roleOut = await fastForward(reborn, season, ROWS, {
    playOne: stubPlayOne([{ roleAfter: "bench", trustAfter: 52 }]),
  });
  assert.equal(roleOut.stoppedAt.type, "role");
  assert.equal(roleOut.stoppedAt.detail.roleAfter, "bench");
  assert.match(describeFastForwardEvent(roleOut.stoppedAt, "zh"), /轮换/);

  const reborn2 = createRebornState("reborn-ff-run-3", ROWS);
  const season2 = seasonWith(reborn2, NON_KEY_OPPS.slice(0, 4));
  const starterOut = await fastForward(reborn2, season2, ROWS, {
    playOne: stubPlayOne([{ roleAfter: "starter", trustAfter: 78 }]),
  });
  assert.equal(starterOut.stoppedAt.type, "starter");
  assert.match(describeFastForwardEvent(starterOut.stoppedAt, "zh"), /首发/);
});

test("fastForward stops on a takeover, then on a reveal; takeover wins a tie", async () => {
  const reborn = createRebornState("reborn-ff-run-4", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 4));
  const takeoverOut = await fastForward(reborn, season, ROWS, {
    playOne: stubPlayOne([
      { takeover: { option: "drive", attempted: true, made: true }, trustAfter: 30 },
    ]),
  });
  assert.equal(takeoverOut.stoppedAt.type, "takeover");

  const reborn2 = createRebornState("reborn-ff-run-4", ROWS);
  const season2 = seasonWith(reborn2, NON_KEY_OPPS.slice(0, 4));
  const revealOut = await fastForward(reborn2, season2, ROWS, {
    playOne: stubPlayOne([{ revealedNow: true, trustAfter: 41 }]),
  });
  assert.equal(revealOut.stoppedAt.type, "reveal");
  assert.match(describeFastForwardEvent(revealOut.stoppedAt, "zh"), /身份揭示/);

  const reborn3 = createRebornState("reborn-ff-run-4", ROWS);
  const season3 = seasonWith(reborn3, NON_KEY_OPPS.slice(0, 4));
  const tieOut = await fastForward(reborn3, season3, ROWS, {
    playOne: stubPlayOne([
      {
        takeover: { option: "pullup", attempted: true, made: false },
        revealedNow: true,
        roleAfter: "bench",
        trustAfter: 41,
      },
    ]),
  });
  assert.equal(tieOut.stoppedAt.type, "takeover", "the lived moment outranks the reveal and the role change");
});

test("fastForward with no events sims to the season end", async () => {
  const reborn = createRebornState("reborn-ff-run-5", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 3));
  const out = await fastForward(reborn, season, ROWS, {
    playOne: stubPlayOne([{ trustAfter: 26 }, { trustAfter: 26 }, { trustAfter: 26 }]),
  });
  assert.equal(out.reports.length, 3);
  assert.equal(out.stoppedAt.type, "season-end");
  assert.equal(season.index, 3);
  assert.match(describeFastForwardEvent(out.stoppedAt, "en"), /Season over/);
});

test("fastForward calls onGame once per simmed game (progress)", async () => {
  const reborn = createRebornState("reborn-ff-run-6", ROWS);
  const season = seasonWith(reborn, NON_KEY_OPPS.slice(0, 8));
  let calls = 0;
  const out = await fastForward(reborn, season, ROWS, {
    playOne: stubPlayOne([{ trustAfter: 26 }, { trustAfter: 26 }, { trustAfter: 26 }, { trustAfter: 26 }]),
    onGame: () => {
      calls += 1;
    },
  });
  assert.equal(calls, 4, "one progress call per simmed game");
  assert.equal(out.reports.length, 4);
});

test("nextFastForwardTarget never points at the game already on screen", () => {
  const reborn = createRebornState("reborn-ff-target-now", ROWS);
  const keyOpp = reborn.player.teamId === "LAL" ? "UTA" : "LAL";
  const season = seasonWith(reborn, [keyOpp, "CHI", keyOpp]);
  assert.equal(nextFastForwardTarget(reborn, season, ROWS).gameIndex, 2, "skips the key game you are about to play");
});
