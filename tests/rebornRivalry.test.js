// Career 2.0 decision 2: rivalries are born from real Reborn games (auto /
// story / challenge), recorded per real game id, and never touch the dice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUTO_MIN_MEETINGS,
  DEFAULT_TAKEOVER_WINDOW,
  MAX_ACTIVE_RIVALS,
  RIVALRY_TAKEOVER_WINDOW,
  challengeCandidates,
  challengeRival,
  headToHead,
  mirrorRivalriesToAccount,
  recordRivalryMeetings,
  rivalryLedger,
  takeoverWindowFor,
} from "../js/reborn/rivalry.js";
import { buildSeason, playGame, takeoverEligible } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { legacyOf, relationshipsOf, rivalryStakes } from "../js/career/careerRelationships.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

const KOBE = { bref: "bryanko01", name: "科比", nameEn: "Kobe Bryant", pos: "SG", ovr: 74, team: "LAL" };
const report = (n, { kobe = {}, line = {}, ...rest } = {}) => ({
  gameId: `g${n}`,
  year: 1997,
  game: n,
  won: false,
  margin: 12,
  gameScore: 6,
  you: { pos: "SG", ovr: 70 },
  opponents: [{ ...KOBE, min: 28, pts: 14, gs: 8, ...kobe }],
  takeover: null,
  ...rest,
  line: { min: 24, pts: 10, ...line },
});

function feed(reports, ledger = rivalryLedger(null)) {
  const formed = [];
  for (const r of reports) {
    const out = recordRivalryMeetings(ledger, r);
    ledger = out.ledger;
    formed.push(...out.formed);
  }
  return { ledger, formed };
}

test("auto: never on first sight; repeated close duels with the direct matchup form a rivalry", () => {
  const duel = { margin: 3, gameScore: 14, kobe: { gs: 15, pts: 22 }, won: true };
  const first = feed([report(1, duel)]);
  assert.equal(first.formed.length, 0, "one meeting is not a rivalry");
  const three = feed([report(1, duel), report(2, duel), report(3, duel)]);
  assert.equal(three.formed.length, 1);
  assert.equal(three.formed[0].origin, "auto");
  assert.equal(three.formed[0].bref, "bryanko01");
  assert.equal(three.ledger.watch.bryanko01, undefined, "the watch entry is consumed");
});

test("auto: blowouts with no duel do not build enough heat in three meetings", () => {
  const { formed, ledger } = feed([1, 2, 3].map((n) => report(n)));
  assert.equal(formed.length, 0);
  assert.equal(ledger.watch.bryanko01.meetings, AUTO_MIN_MEETINGS);
});

test("meaningful only: a different position group, a big level gap, or no real minutes is no matchup", () => {
  assert.equal(feed([report(1, { kobe: { pos: "C" } })]).ledger.watch.bryanko01, undefined);
  assert.equal(feed([report(1, { kobe: { ovr: 95 } })]).ledger.watch.bryanko01, undefined);
  assert.equal(feed([report(1, { line: { min: 5 } })]).ledger.watch.bryanko01, undefined);
});

test("story: a taunt after he buries you needs a second meeting, then forms immediately", () => {
  const buried = { kobe: { pts: 31, gs: 24 }, gameScore: 4, won: false };
  assert.equal(feed([report(1, buried)]).formed.length, 0, "first meeting: no story yet");
  const { formed } = feed([report(1), report(2, buried)]);
  assert.equal(formed.length, 1);
  assert.deepEqual([formed[0].origin, formed[0].reason], ["story", "taunt"]);
});

test("story: a clutch takeover in a one-possession game against him is a story beat", () => {
  const clutch = { takeover: { attempted: true, made: true }, margin: 2, won: true };
  const { formed } = feed([report(1), report(2, clutch)]);
  assert.deepEqual([formed[0].origin, formed[0].reason], ["story", "clutch"]);
});

test("challenge: only someone who really played that game; no duplicates; capped", () => {
  const r = report(1);
  assert.equal(challengeRival(rivalryLedger(null), r, "jordami01").reason, "not-faced");
  const once = challengeRival(rivalryLedger(null), r, "bryanko01");
  assert.equal(once.rival.origin, "challenge");
  assert.equal(challengeRival(once.ledger, r, "bryanko01").reason, "already");
  assert.equal(challengeCandidates(once.ledger, r).length, 0, "a rival is not offered again");
  const full = { version: 1, watch: {}, rivals: Array.from({ length: MAX_ACTIVE_RIVALS }, (_, i) => ({ bref: `x${i}`, games: [] })) };
  assert.equal(challengeRival(full, r, "bryanko01").reason, "full");
});

test("meetings: idempotent per game id, losing still counts, H2H is the real W/L", () => {
  let { ledger } = challengeRival(rivalryLedger(null), report(1), "bryanko01");
  ledger = recordRivalryMeetings(ledger, report(2, { won: true })).ledger;
  const again = recordRivalryMeetings(ledger, report(2, { won: true }));
  assert.equal(again.met.length, 0, "same game twice changes nothing");
  assert.deepEqual(headToHead(again.ledger.rivals[0]), { meetings: 2, wins: 1, losses: 1 });
  const dnp = recordRivalryMeetings(again.ledger, report(3, { kobe: { min: 0 } }));
  assert.equal(dnp.met.length, 0, "he did not play: not a meeting");
});

test("takeover window: wider only against a roster with a rival; still Q4-only", () => {
  const { ledger } = challengeRival(rivalryLedger(null), report(1), "bryanko01");
  assert.equal(takeoverWindowFor(ledger, [{ bref: "bryanko01" }]), RIVALRY_TAKEOVER_WINDOW);
  assert.equal(takeoverWindowFor(ledger, [{ bref: "jordami01" }]), DEFAULT_TAKEOVER_WINDOW);
  const sim = { running: true, quarter: 4, clock: 170, score: { home: 90, away: 83 }, possession: "home", youSide: "home", home: { onCourt: [{ id: "me" }] }, clutchDecision: null };
  assert.equal(takeoverEligible(sim, "me"), false);
  assert.equal(takeoverEligible(sim, "me", RIVALRY_TAKEOVER_WINDOW), true);
  assert.equal(takeoverEligible({ ...sim, quarter: 3 }, "me", RIVALRY_TAKEOVER_WINDOW), false);
});

test("account mirror: stable ids, safe to repeat, never leaks the unrevealed name", () => {
  let { ledger } = challengeRival(rivalryLedger(null), report(1), "bryanko01");
  ledger = recordRivalryMeetings(ledger, report(2, { won: true })).ledger;
  const reborn = { seed: "s1", identity: { bref: "secret01", name: "Secret Star" }, rivalries: ledger };
  const account = {};
  mirrorRivalriesToAccount(account, reborn);
  mirrorRivalriesToAccount(account, reborn);
  assert.equal(relationshipsOf(account).filter((r) => r.kind === "rivalry").length, 1);
  assert.equal(legacyOf(account).filter((e) => e.type === "rivalry").length, 1);
  assert.equal(legacyOf(account).filter((e) => e.type === "rivalry-game").length, 2);
  const stakes = rivalryStakes(account, "bryanko01");
  assert.deepEqual([stakes.wins, stakes.losses], [1, 1]);
  assert.ok(!JSON.stringify(account).includes("Secret Star"));
});

test("real GameSim: the report carries real opponent box lines and the ledger records them", async () => {
  const reborn = createRebornState("rivalry-real-1", ROWS);
  reborn.player.coachTrust = 80; // a starter plays real minutes
  const teamId = reborn.player.teamId;
  const opp = ["LAL", "CHI", "UTA"].find((t) => t !== teamId);
  const season = buildSeason(reborn, ROWS, { games: [1, 2].map((day) => ({ homeId: teamId, awayId: opp, day, played: false })) });
  const one = await playGame(reborn, season, ROWS);
  const faced = one.report.opponents;
  assert.ok(faced.length >= 5 && faced.every((o) => o.bref && o.team === opp && o.min > 0));
  const target = challengeCandidates(rivalryLedger(one.reborn), one.report)[0];
  assert.ok(target, "someone real to challenge");
  const challenged = { ...one.reborn, rivalries: challengeRival(rivalryLedger(one.reborn), one.report, target.bref).ledger };
  const two = await playGame(challenged, season, ROWS);
  const rival = rivalryLedger(two.reborn).rivals[0];
  const met = two.report.rivalry.met.find((m) => m.bref === target.bref);
  const played = two.report.opponents.find((o) => o.bref === target.bref);
  if (played) {
    assert.ok(met, "a rival who played is recorded");
    assert.equal(met.gameId, two.report.gameId);
    assert.equal(met.won, two.report.won);
    assert.equal(rival.games.length, 2);
  } else {
    assert.equal(rival.games.length, 1, "a rival who sat out is not a meeting");
  }
});

test("fast-forward stops before a game against a rival (ahead of a plain key game)", async () => {
  const { gameStop } = await import("../js/reborn/fastForward.js");
  const reborn = createRebornState("rivalry-ff-1", ROWS);
  const opp = ["CHI", "LAL"].find((t) => t !== reborn.player.teamId);
  const season = buildSeason(reborn, ROWS, { games: [{ homeId: reborn.player.teamId, awayId: opp, day: 1, played: false }] });
  const star = ROWS.find((r) => r.team === opp && Number(r.season) === season.year);
  assert.notEqual(gameStop(reborn, ROWS, season.games[0], season)?.type, "rivalry");
  const withRival = { ...reborn, rivalries: { version: 1, watch: {}, rivals: [{ bref: star.bref, name: star.name, games: [] }] } };
  const stop = gameStop(withRival, ROWS, season.games[0], season);
  assert.equal(stop.type, "rivalry");
  assert.equal(stop.detail.rival, star.name);
});
