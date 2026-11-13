/**
 * Promise evidence (Career 2.0 E): start / minutes / contract / trade promises
 * settle from REAL Reborn records, every record has a stable id, and nothing
 * is guessed from a missing fact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectEvidence, gameEvidenceId } from "../js/reborn/promiseEvidence.js";
import { rebornPromiseWindow, settleRebornPromises } from "../js/reborn/promiseSettle.js";
import { settleGamePromises } from "../js/career/promiseEngine.js";
import { makePromise, promisesOf, recordPerson, recordTradeDecision } from "../js/career/careerRelationships.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";

const account = () => {
  const a = { playerIds: [] };
  recordPerson(a, { id: "coach", name: "Coach", role: "coach" });
  recordPerson(a, { id: "me", name: "Me", role: "player", bref: "me01" });
  return a;
};
const promise = (a, kind, check, over = {}) =>
  makePromise(a, { makerId: "coach", targetId: "me", kind, text: `${kind} promise`, madeSeason: 1996, madeGame: 0, check, ...over });
const run = (log, extra = {}) => ({
  seed: "s1",
  identity: { bref: "me01" },
  player: { coachTrust: 40, rotationRole: "bench", seasonLog: log },
  timeline: { events: [] },
  ...extra,
});
const games = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ year: 1996, game: i + 1, min: 20, role: "bench", ...over }));
const status = (a) => promisesOf(a)[0].status;

test("start: a real start fulfils the promise; the engine does not wait for the deadline", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 5 });
  const log = games(3, { started: false });
  log[1].started = true;
  const out = settleRebornPromises(a, run(log));
  assert.equal(out.settled[0].status, "fulfilled");
  assert.equal(out.reborn.player.coachTrust, 43);
});

test("start: every game recorded as NOT started breaks it at the deadline", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 3 });
  const out = settleRebornPromises(a, run(games(3, { started: false })));
  assert.equal(out.settled[0].status, "broken");
  assert.equal(out.reborn.player.coachTrust, 35);
});

test("start: games saved before `started` existed cannot break the promise", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 2 });
  const out = settleRebornPromises(a, run(games(6))); // no started flag at all
  assert.equal(out.settled.length, 0);
  assert.equal(status(a), "open");
});

test("start: a partly-unknown window is still not guessed broken", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 3 });
  const log = games(3, { started: false });
  delete log[0].started;
  assert.equal(settleRebornPromises(a, run(log)).settled.length, 0);
});

test("contract: a real re-sign event fulfils it; a cut does not", () => {
  const check = { type: "contract", dueSeason: 1996 };
  const signed = account();
  promise(signed, "contract", check);
  const withEvent = (outcome) => run(games(2), { timeline: { events: [{ year: 1996, event: "contract", outcome }] } });
  assert.equal(settleRebornPromises(signed, withEvent("resign")).settled[0].status, "fulfilled");

  const minimum = account();
  promise(minimum, "contract", check);
  assert.equal(settleRebornPromises(minimum, withEvent("minimum")).settled[0].status, "fulfilled");

  const cut = account();
  promise(cut, "contract", check);
  assert.equal(settleRebornPromises(cut, withEvent("cut")).settled.length, 0, "cut in the deadline season: still open");
  // The next season starting is the proof the deadline passed with no contract.
  const later = withEvent("cut");
  later.timeline.events.push({ year: 1997, event: "season_start", outcome: "camp" });
  assert.equal(settleRebornPromises(cut, later).settled[0].status, "broken");
});

test("contract: no event and no deadline passed means open, never broken", () => {
  const a = account();
  promise(a, "contract", { type: "contract", dueSeason: 1996 });
  assert.equal(settleRebornPromises(a, run(games(10))).settled.length, 0);
});

test("trade: a timeline trade event or this player's trade record fulfils it", () => {
  const viaTimeline = account();
  promise(viaTimeline, "trade", { type: "trade", dueSeason: 1997 });
  const t = run(games(2), { timeline: { events: [{ year: 1996, event: "trade", to: "LAL" }] } });
  assert.equal(settleRebornPromises(viaTimeline, t).settled[0].status, "fulfilled");

  const viaLegacy = account();
  promise(viaLegacy, "trade", { type: "trade", dueSeason: 1997 });
  recordTradeDecision(viaLegacy, { id: "tr1", season: 1996, playerName: "Me", playerBref: "me01", fromTeam: "CHI", toTeam: "LAL" });
  assert.equal(settleRebornPromises(viaLegacy, run(games(2))).settled[0].status, "fulfilled");

  const someoneElse = account();
  promise(someoneElse, "trade", { type: "trade", dueSeason: 1997 });
  recordTradeDecision(someoneElse, { id: "tr2", season: 1996, playerName: "Other", playerBref: "other01", fromTeam: "CHI", toTeam: "LAL" });
  assert.equal(settleRebornPromises(someoneElse, run(games(2))).settled.length, 0, "another player's trade is not this promise's evidence");
});

test("trade: no trade by the end of the deadline season breaks it", () => {
  const a = account();
  promise(a, "trade", { type: "trade", dueSeason: 1996 });
  const r = run(games(2), { timeline: { events: [{ year: 1997, event: "season_start" }] } });
  assert.equal(settleRebornPromises(a, r).settled[0].status, "broken");
});

test("stable ids: the same game saved twice is one piece of evidence", () => {
  const log = games(3, { started: false });
  const doubled = [...log, ...log.map((g) => ({ ...g }))]; // a re-save that duplicated rows
  const ids = collectEvidence(run(doubled)).map((e) => e.evidenceId);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], gameEvidenceId("s1", 1996, 1));

  const a = account();
  promise(a, "minutes", { type: "minutes", minGames: 4, minMpg: 15, dueAfterGames: 9 });
  // 6 rows but only 3 distinct games: a 4-game requirement is NOT met
  const snap = rebornPromiseWindow(run(doubled))(promisesOf(a)[0]);
  assert.equal(snap.gamesPlayed, 3);
});

test("idempotent: settling the same evidence twice moves trust once", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 5 });
  const r = run(games(2, { started: true }));
  const one = settleRebornPromises(a, r);
  const two = settleRebornPromises(a, one.reborn);
  assert.equal(one.reborn.player.coachTrust, 43);
  assert.equal(two.settled.length, 0);
  assert.equal(two.reborn.player.coachTrust, 43);
});

test("the unified entry settles relationship promises with no inbox at all", () => {
  const a = account();
  promise(a, "start", { type: "start", dueAfterGames: 5 });
  const out = settleGamePromises({ inbox: null, state: null, account: a, relationshipState: rebornPromiseWindow(run(games(2, { started: true })), { account: a }) });
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].source, "relationship");
  assert.equal(out.settled[0].status, "fulfilled");
});

// ---- real engine: no stubs ------------------------------------------------------------------
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

test("a real playGame records the facts the promises need, with a stable id", async () => {
  const reborn = createRebornState("evidence-real-1", ROWS);
  const teamId = reborn.player.teamId;
  const opp = ["LAL", "CHI", "SEA", "UTA"].find((t) => t !== teamId);
  const season = buildSeason(reborn, ROWS, { games: [{ homeId: teamId, awayId: opp, day: 1, played: false }] });
  const out = await playGame(reborn, season, ROWS, {});
  const row = out.reborn.player.seasonLog[0];
  assert.equal(typeof row.started, "boolean", "the tip-off lineup is recorded as a boolean fact");
  assert.equal(row.gameId, gameEvidenceId(reborn.seed, season.year, 1));
  const [ev] = collectEvidence(out.reborn);
  assert.equal(ev.evidenceId, row.gameId);
  assert.equal(ev.started, row.started);

  // and a start promise really settles from it (fulfilled iff he started — never random)
  const a = account();
  recordPerson(a, { id: "rbn", name: "Run", role: "player", bref: out.reborn.identity.bref });
  makePromise(a, { makerId: "coach", targetId: "rbn", kind: "start", text: "start", madeSeason: season.year - 1, madeGame: 0, check: { type: "start", dueAfterGames: 1 } });
  const settled = settleRebornPromises(a, out.reborn);
  assert.equal(settled.settled.length, 1);
  assert.equal(settled.settled[0].status, row.started ? "fulfilled" : "broken");
});

test("contract promises settle from the events the REAL season-end functions write", async () => {
  const { settleContract, rolloverSeason } = await import("../js/reborn/contract.js");
  const make = (trust) => {
    const r = createRebornState("evidence-contract", ROWS);
    r.player.coachTrust = trust;
    r.player.seasonLog = [{ year: 1997, game: 1, gameId: gameEvidenceId(r.seed, 1997, 1), started: false, min: 10, role: "bench" }];
    return r;
  };
  const promiseFor = (r) => {
    const a = account();
    recordPerson(a, { id: "rbn", name: "Run", role: "player", bref: r.identity.bref });
    makePromise(a, { makerId: "coach", targetId: "rbn", kind: "contract", text: "re-sign", madeSeason: 1996, madeGame: 0, check: { type: "contract", dueSeason: 1997 } });
    return a;
  };

  const kept = make(60); // trust >= 50 -> resign
  const a1 = promiseFor(kept);
  const signed = settleContract(kept, { year: 1997 }).reborn;
  assert.equal(settleRebornPromises(a1, signed).settled[0].status, "fulfilled");

  const cut = make(10); // trust < 30 -> cut, no contract
  const a2 = promiseFor(cut);
  const cutState = settleContract(cut, { year: 1997 }).reborn;
  assert.equal(settleRebornPromises(a2, cutState).settled.length, 0, "cut: not signed, but the deadline season has not passed yet");
  const next = rolloverSeason(cutState, { year: 1997 }).reborn;
  assert.equal(settleRebornPromises(a2, next).settled[0].status, "broken", "the new season proves no contract was signed");
});
