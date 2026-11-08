// My Team Season follow-up smoke: a finished season leaves a result, the record survives starting
// another season, 20- and 82-game records are never summed, and the owned collection is untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { createAccount, getAccount, saveAccount } = await import("../js/data/account.js");
const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");
const { myTeamResult, recordMyTeamResult, seasonRecordSummary, MAX_SEASON_RECORDS } = await import("../js/myteam/seasonRecord.js");
const { simUserNextGame, startPlayoffs, simAllPlayoffs, advanceToUserGame } = await import("../js/engine/season.js");

const seen = new Set();
const ids = [...PLAYERS].sort((a, b) => overall(b) - overall(a)).filter((p) => (seen.has(p.bref) ? false : (seen.add(p.bref), true))).slice(0, 10).map((p) => p.id);
const acc = createAccount("Rec");
saveAccount({ ...getAccount(acc.id), playerIds: ids, coachId: null });

function playToDone(st) {
  while (simUserNextGame(st)) { /* regular season */ }
  advanceToUserGame(st);
  startPlayoffs(st);
  simAllPlayoffs(st);
  return st;
}

test("no result before the season is done; a finished season yields one", () => {
  const { season } = buildMyTeamSeason(getAccount(acc.id), { variant: "quick", seed: 5 });
  assert.equal(myTeamResult(season), null);
  playToDone(season);
  assert.equal(season.phase, "done");
  const r = myTeamResult(season);
  assert.equal(r.variant, "quick");
  assert.equal(r.games, 20);
  assert.equal(r.w + r.l, 20);
  assert.equal(typeof r.champion, "boolean");
});

test("recording is idempotent, survives a new season, and never touches the collection", () => {
  const before = JSON.stringify(getAccount(acc.id).playerIds);
  const a = playToDone(buildMyTeamSeason(getAccount(acc.id), { variant: "quick", seed: 6 }).season);
  const ra = myTeamResult(a);
  assert.equal(recordMyTeamResult(acc.id, ra).changed, true);
  assert.equal(recordMyTeamResult(acc.id, ra).changed, false); // opening the finished hub twice records once
  const b = buildMyTeamSeason(getAccount(acc.id), { variant: "quick", seed: 7 }).season; // "play another season"
  assert.notEqual(b.myTeam.seasonId, a.myTeam.seasonId);
  assert.ok(getAccount(acc.id).myTeamSeasons.some((r) => r.seasonId === ra.seasonId));
  assert.equal(JSON.stringify(getAccount(acc.id).playerIds), before);
});

test("records are capped, newest first, and 20/82 never share a count", () => {
  for (let i = 0; i < MAX_SEASON_RECORDS + 5; i++) recordMyTeamResult(acc.id, { seasonId: `x${i}`, variant: i % 2 ? "full" : "quick", champion: i % 4 === 0, w: 1, l: 1, games: 20 });
  const list = getAccount(acc.id).myTeamSeasons;
  assert.equal(list.length, MAX_SEASON_RECORDS);
  assert.equal(list[0].seasonId, `x${MAX_SEASON_RECORDS + 4}`);
  const quick = seasonRecordSummary(list, "quick");
  const full = seasonRecordSummary(list, "full");
  assert.ok(quick.includes("20 场") && full.includes("82 场"));
  assert.notEqual(quick, full);
});

test("a guest / missing account records nothing", () => {
  assert.equal(recordMyTeamResult(null, { seasonId: "z" }).ok, false);
  assert.equal(recordMyTeamResult("nope", { seasonId: "z" }).ok, false);
});
