// Season Awards 2.0: the awards tab reads real season numbers, out of the real season length, and shows "—" (never NaN or
// a made-up value) when a metric's inputs are missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex, isRookieSeason, previousSeasonLine, seasonLine } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");
const { computeAwards, simUserNextGame } = await import("../js/engine/season.js");
const { seasonAwardsHtml, seasonMetrics, teamContext } = await import("../js/ui/seasonAwardsView.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
const peak = (b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0];
// The view escapes text (an apostrophe becomes &#39;), so decode it back before comparing with plain player names: without this the test failed
// whenever Shaquille O'Neal happened to make an All-NBA / All-Defense first team (a random event of the season).
const ENTITIES = { "&#39;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">" };
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;|&quot;|&amp;|&lt;|&gt;/g, (e) => ENTITIES[e]).replace(/\s+/g, " ");

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

// ── MIP: real season against the same player's previous real season ──────────────────────────────────────────────────

test("previousSeasonLine: the same player's real row one year earlier, else null", () => {
  const prev = previousSeasonLine({ bref: "curryst01", season: 2016 });
  assert.equal(prev?.season, 2015);
  assert.equal(prev?.bref, "curryst01");
  assert.equal(seasonLine({ bref: "curryst01", season: 2016 })?.season, 2016);
  assert.equal(previousSeasonLine({ bref: "curryst01", season: 2010 }), null, "his rookie year has no year before it");
  assert.equal(previousSeasonLine({ season: 2016 }), null, "a card without bref (custom player) has no baseline");
  assert.equal(previousSeasonLine({ bref: "nobody99", season: 2016 }), null);
});

test("real season: the MIP is the biggest REAL year-over-year gain among eligible players, and says what it compared", { timeout: 120000 }, () => {
  const st = realSeason();
  const mip = st.awards.mip;
  assert.ok(mip, "a 20-game season of stars has a MIP");
  assert.equal(mip.basis.rule, "yoy");
  assert.ok(mip.basis.gain > 0);
  assert.equal(mip.basis.prev.season, mip.basis.card.season - 1, "last real season to this card's season");
  assert.equal(mip.basis.card.season, mip.season);
  // Independent check: nobody eligible has a bigger gain than the winner.
  const prod = (l) => l.ppg + 0.85 * l.rpg + 1.15 * l.apg;
  const min = Math.round((25 * 20) / 82);
  let best = -Infinity;
  for (const row of Object.values(st.playerSeason)) {
    if (row.stats.gp < Math.max(1, min) || !row.bref) continue;
    const prev = previousSeasonLine(row);
    const card = seasonLine(row);
    if (!prev || !card || prev.gp < 20 || prev.mpg < 12) continue;
    const s = row.stats;
    if (prod({ ppg: s.pts / s.gp, rpg: s.reb / s.gp, apg: s.ast / s.gp }) < 0.6 * prod(card)) continue; // must have delivered it in the sim
    best = Math.max(best, prod(card) - prod(prev));
  }
  const w = Object.values(st.playerSeason).find((r) => r.playerId === mip.playerId);
  const cardOfWinner = seasonLine({ bref: w.bref, season: w.season });
  assert.ok(prod({ ppg: w.stats.pts / w.stats.gp, rpg: w.stats.reb / w.stats.gp, apg: w.stats.ast / w.stats.gp }) >= 0.6 * prod(cardOfWinner), "the MIP actually produced in the sim, not just on his card");
  assert.ok(Math.abs(mip.basis.gain - best) < 0.06, `winner gain ${mip.basis.gain} vs best eligible ${best}`);
});

test("the MIP card shows the two real seasons and the gain; the old rating rule still reads honestly", { timeout: 120000 }, () => {
  const st = realSeason();
  const yoy = visible(seasonAwardsHtml(st, "zh"));
  assert.match(yoy, /真实数据：\d{4} .*→ \d{4} /);
  assert.match(yoy, /产出提升/);
  assert.match(yoy, /不是模拟成绩/);
  const legacy = { ...st, awards: { ...st.awards, mip: { ...st.awards.mip, basis: { rule: "rating", expected: 20, over: 5, ageBonus: 1, minGames: 5 } } } };
  const text = visible(seasonAwardsHtml(legacy, "zh"));
  assert.match(text, /超出能力预期/);
  assert.doesNotMatch(text, /真实数据：/);
  const en = visible(seasonAwardsHtml(st, "en"));
  assert.match(en, /Real seasons: \d{4} /);
  assert.doesNotMatch(en.slice(en.indexOf("Most Improved"), en.indexOf("Most Improved") + 400), /[\u3400-\u9fff]/);
});
