// Season Awards 2.0: the awards tab reads real season numbers, out of the real season length, and shows "—" (never NaN or
// a made-up value) when a metric's inputs are missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex, isRookieSeason } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");
const { computeAwards, simUserNextGame } = await import("../js/engine/season.js");
const { seasonAwardsHtml, seasonMetrics, teamContext } = await import("../js/ui/seasonAwardsView.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
const peak = (b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0];
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

let played = null;
/** One real 20-game My Team season, played to the end, awards computed (built once, it takes a few seconds). */
function realSeason() {
  if (played) return played;
  const account = { id: "acc-a", name: "Zed", playerIds: STARS.map((b) => peak(b).id), cardMods: {}, gold: 5, tacticId: "pace_space" };
  const st = buildMyTeamSeason(account, { variant: "quick", seed: 7 }).season;
  let guard = 0;
  while (simUserNextGame(st) && guard++ < 40);
  st.awards = computeAwards(st);
  played = st;
  return st;
}

test("metrics: TS% and EFF use their stated formulas on the summed box score", () => {
  const m = seasonMetrics({ gp: 10, gs: 10, min: 340, pts: 300, reb: 80, oreb: 20, dreb: 60, ast: 50, stl: 12, blk: 8, tov: 25, fg: 110, fga: 220, tp: 30, tpa: 80, ft: 50, fta: 60, pf: 20, plusMinus: 45 });
  assert.equal(m.ppg, 30);
  assert.ok(Math.abs(m.ts - 300 / (2 * (220 + 0.44 * 60))) < 1e-9);
  assert.equal(m.eff, (300 + 80 + 50 + 12 + 8 - 110 - 10 - 25) / 10);
  assert.equal(m.fg, 0.5);
  assert.equal(m.pm, 4.5);
});

test("metrics: a missing input makes that metric unavailable, not zero", () => {
  const oldRow = { gp: 10, pts: 200, reb: 50, ast: 30, stl: 5, blk: 5, tov: 10, fg: 80, fga: 170 }; // no FT, 3P, +/- fields
  const m = seasonMetrics(oldRow);
  assert.equal(m.ppg, 20);
  assert.equal(m.tp, null);
  assert.equal(m.ts, null, "TS% needs free-throw attempts");
  assert.equal(m.eff, null, "EFF needs free throws too");
  assert.equal(m.pm, null);
  assert.equal(seasonMetrics({ gp: 0, pts: 0 }).ppg, null, "no games, no per-game numbers");
  const ftOnly = seasonMetrics({ gp: 20, pts: 2, fga: 0, fta: 2, fg: 0, ft: 2, reb: 270, ast: 40, stl: 10, blk: 80, tov: 5 });
  assert.equal(ftOnly.ts, null, "no shots, no TS% (the formula would read 113.6%)");
  assert.equal(ftOnly.fg, null);
});

test("a real 20-game season: every card shows games out of 20 (not 82), real numbers, no NaN", { timeout: 120000 }, () => {
  const st = realSeason();
  const html = seasonAwardsHtml(st, "zh");
  const text = visible(html);
  assert.match(text, /本季 20 场/);
  assert.doesNotMatch(text, /\/82\b/, "no 82-game assumption anywhere");
  assert.doesNotMatch(text, /NaN|undefined|Infinity/);
  assert.doesNotMatch(text, /\(PER\)/, "the efficiency number is never labelled PER");
  assert.match(text, /不是 PER/, "the definition says so plainly");
  const mvp = st.awards.mvp;
  const row = st.playerSeason[`${mvp.teamId}:${mvp.playerId}`];
  assert.ok(text.includes(`${row.stats.gp}/20`), "MVP games played out of the real season length");
  assert.ok(text.includes((row.stats.pts / row.stats.gp).toFixed(1)), "MVP points per game straight from his season row");
  for (const player of [...st.awards.allNba.first, ...st.awards.allDefense.first]) assert.ok(text.includes(player.name), `${player.name} is in a table`);
});

test("team context comes from the standings: record, conference and league rank", { timeout: 120000 }, () => {
  const st = realSeason();
  const team = teamContext(st, st.awards.mvp.teamId);
  const rec = st.standings[st.awards.mvp.teamId];
  assert.equal(`${team.w}-${team.l}`, `${rec.w}-${rec.l}`);
  assert.ok(team.leagueRank >= 1 && team.leagueRank <= team.teams);
  assert.ok(team.confRank == null || team.confRank <= team.leagueRank);
});

test("an old save (awards without basis/bref, no season rows) still renders, with '—' for what it lacks", { timeout: 120000 }, () => {
  const st = structuredClone(realSeason());
  for (const key of ["mvp", "dpoy", "sixthMan", "mip", "roy"]) {
    if (st.awards[key]) { delete st.awards[key].basis; delete st.awards[key].bref; delete st.awards[key].season; }
  }
  st.playerSeason = {};
  const text = visible(seasonAwardsHtml(st, "zh"));
  assert.doesNotMatch(text, /NaN|undefined/);
  assert.ok(text.includes(st.awards.mvp.name));
  assert.ok(text.includes(String(st.awards.mvp.ppg)), "falls back to the per-game numbers stored on the award");
  assert.match(text, /—/, "missing metrics read as unavailable");
});

test("English reads in English (labels, rules, definitions)", { timeout: 120000 }, () => {
  const html = seasonAwardsHtml(realSeason(), "en");
  assert.match(html, /20-game season/);
  assert.match(html, /Details/);
  assert.match(html, /not PER/);
  assert.doesNotMatch(visible(html.replace(/<strong>[^<]*<\/strong>|<em>[^<]*<\/em>/g, "")), /场次|详情|依据|资格/);
});

test("real season path: rows carry bref, and ROY is never a known non-debut card (Shaq's 1994 won it before)", { timeout: 120000 }, () => {
  const st = realSeason();
  const rows = Object.values(st.playerSeason);
  assert.ok(rows.length && rows.every((row) => row.bref), "season rows keep the bref the slim snapshot drops");
  const roy = st.awards.roy;
  if (roy) {
    const row = st.playerSeason[`${roy.teamId}:${roy.playerId}`];
    assert.notEqual(isRookieSeason(row), false, `${roy.name} ${row.season} is not his debut season`);
  }
});
