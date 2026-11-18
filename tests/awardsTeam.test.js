// DPOY is scaled by team defence; Coach of the Year rewards beating the roster's expectation, not owning the best roster.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYERS, overall, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { DEFENSE_FACTOR_BEST, DEFENSE_FACTOR_WORST, coachOfTheYear, teamDefenseFactors, teamStrength } from "../js/engine/awardsTeam.js";
import { computeAwards, createSeason, buildCpuTeamForYear } from "../js/engine/season.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import { seasonAwardsHtml } from "../js/ui/seasonAwardsView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
if (!PLAYERS.some((p) => p.season === 2004)) PLAYERS.push(...ROWS.filter((r) => r.season === 2004).map(seasonToCard));
// Real leagues are narrow (a simulated 2004 league's team strength runs 56.6-66.3), so build rosters around realistic targets.
const around = (target) => [...PLAYERS].sort((a, b) => Math.abs(overall(a) - target) - Math.abs(overall(b) - target)).slice(0, 8);
const strongCards = around(66);
const midCards = around(61);
const weakCards = around(57);
const row = (id, w, l, pa = 100) => ({ id, w, l, pct: w / (w + l), pa: pa * (w + l) });

test("team defence factor: best defence x1.15, worst x0.85, in between by rank; a team with no games is left out", () => {
  const f = teamDefenseFactors([row("a", 10, 10, 99), row("b", 10, 10, 105), row("c", 10, 10, 112), row("none", 0, 0, 0)]);
  assert.equal(f.get("a"), DEFENSE_FACTOR_BEST);
  assert.equal(f.get("c"), DEFENSE_FACTOR_WORST);
  assert.ok(f.get("b") < f.get("a") && f.get("b") > f.get("c"));
  assert.equal(f.has("none"), false);
  assert.equal(teamDefenseFactors([row("solo", 5, 5, 100)]).get("solo"), DEFENSE_FACTOR_BEST, "one team: no ranking, no penalty");
  assert.equal(teamDefenseFactors([]).size, 0);
});

test("coach of the year: with the same record the weaker roster wins; a clearly better record still beats it", () => {
  // Roster strength drives win % across the league; "under" matches the favourite's record with the weakest roster.
  const st = { teams: { fav: { players: strongCards }, mid1: { players: midCards }, mid2: { players: midCards }, weak: { players: weakCards }, under: { players: weakCards } } };
  const base = [row("mid1", 16, 14), row("mid2", 15, 15), row("weak", 6, 24)];
  const same = coachOfTheYear(st, [row("fav", 22, 8), row("under", 22, 8), ...base]);
  assert.equal(same.team.id, "under", "equal 22-8, but one did it with the league's weakest roster");
  assert.ok(same.basis.aboveW > 0, "the basis states by how many wins he beat the expectation");
  assert.equal(same.basis.teams, 5);
  assert.ok(same.basis.strengthRank >= 4);
  const clear = coachOfTheYear(st, [row("fav", 28, 2), row("under", 21, 9), ...base]);
  assert.equal(clear.team.id, "fav", "the record still counts: 28-2 is not beaten by 21-9");
});

test("coach of the year: a losing team never wins, even if it overachieves the most", () => {
  const st = { teams: { a: { players: strongCards }, b: { players: midCards }, c: { players: weakCards }, d: { players: weakCards } } };
  // c is the biggest overachiever vs its weak roster but still has a losing record; b is a modest winner.
  const list = [row("a", 14, 16), row("b", 17, 13), row("c", 13, 17), row("d", 3, 27)];
  assert.notEqual(coachOfTheYear(st, list).team.id, "c");
  assert.equal(coachOfTheYear(st, [row("x", 10, 20), row("y", 8, 22)].map((r) => r)).team.id !== undefined, true, "all losing: still picks someone, never throws");
});

test("coach of the year: a tiny league or no spread in roster strength falls back to the best record", () => {
  const same = { players: midCards };
  const st = { teams: { a: same, b: same, c: same } };
  assert.equal(coachOfTheYear(st, [row("a", 20, 10), row("b", 15, 15), row("c", 10, 20)]).team.id, "a");
  assert.equal(coachOfTheYear({ teams: {} }, []), null);
  assert.equal(teamStrength(undefined), 0);
});

// ---- through the real computeAwards ------------------------------------------------------------------------------

function seasonWith(standings, playerSeason) {
  const meta = historicalSeason(2004).teams[0];
  const st = createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(2004, meta, new Set()), mode: "historical", year: 2004, seed: 7 });
  const ids = Object.keys(st.standings);
  ids.forEach((id, i) => { st.standings[id] = { ...st.standings[id], ...(standings[id] || { w: 15, l: 15, pf: 3000 + i, pa: 3000 + i }) }; });
  st.playerSeason = playerSeason(ids);
  return { st, ids };
}
const stats = (over = {}) => ({ gp: 30, pts: 300, reb: 300, ast: 60, stl: 30, blk: 90, dreb: 240, tov: 40, min: 900, ...over });
const defender = (playerId, teamId, s) => ({ playerId, bref: `${playerId}x01`, name: playerId, teamId, pos: "C", ovr: 80, season: 2004, stats: stats(s) });

test("computeAwards DPOY: the same stocks win on the best defence and lose on the worst", () => {
  const { st } = seasonWith({}, (ids) => ({
    bad: defender("bad", ids[0], { blk: 120 }), // the bigger stat line, on the league's worst defence
    good: defender("good", ids[1], { blk: 100 }), // slightly less, on the best
  }));
  const ids = Object.keys(st.standings);
  ids.forEach((id) => { st.standings[id].pa = 3000; });
  st.standings[ids[0]].pa = 3600; // worst
  st.standings[ids[1]].pa = 2700; // best
  const a = computeAwards(st);
  assert.equal(a.dpoy.name, "good");
  assert.ok(a.dpoy.basis.teamFactor > 1, "the basis shows the team factor that was applied");
  // Control: with equal defences the bigger line wins, so the factor (not luck) decided it.
  ids.forEach((id) => { st.standings[id].pa = 3000; });
  assert.equal(computeAwards(st).dpoy.name, "bad");
});

test("computeAwards COTY carries its basis, and the card explains it (and still reads an older object without one)", () => {
  const { st } = seasonWith({}, () => ({}));
  const a = computeAwards(st);
  assert.ok(a.coty?.basis && Number.isFinite(a.coty.basis.aboveW));
  const zh = seasonAwardsHtml(st, "zh");
  assert.match(zh, /较阵容估计胜场/);
  assert.match(zh, /阵容实力第/);
  assert.match(zh, /不是赛季开始前保存的预测/, "it says what the estimate is, and that it is not a preseason forecast");
  assert.doesNotMatch(zh, /较预期胜场|战绩超出阵容预期/, "no wording that reads as a preseason expectation");
  assert.match(seasonAwardsHtml(st, "en"), /not a forecast saved before the season/);
  assert.doesNotMatch(zh, /不考虑赛前预期/, "the old rule's text is gone");
  assert.doesNotMatch(zh, /不含球队防守成绩/);
});
