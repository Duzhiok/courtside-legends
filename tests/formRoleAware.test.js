// Gold Challenge form bug: Mozgov (C, OVR 77) 42min 0pts 17reb 1ast 2blk 1stl in a win was
// labelled 进攻哑火 / 近况不佳 / 自我怀疑 / 信任下滑. Root causes: scorer-only expectations,
// 0-for-3 treated as an efficiency disaster, boards/defense weighted ~0.25, and confidence
// centred on 41 instead of 50. These cases pin the role-aware rating (js/engine/formRating.js).
import test from "node:test";
import assert from "node:assert/strict";
import { realCards } from "./helpers/realGame.js";
import { overall } from "../js/data/players.js";
import { applyFormAfterGame, confidenceLabel, summarizeRecentForm, syncFormToTeams, tacticalLabel } from "../js/engine/form.js";
import { NEGATIVE_NOTES, rateGame } from "../js/engine/formRating.js";

const card = (bref, season) => {
  const c = realCards(bref).find((x) => x.season === season);
  assert.ok(c, `${bref} ${season} card exists`);
  return { ...c, confidence: 50, tacticalStatus: 50 };
};
const play = (src, stats, won) => applyFormAfterGame(src, { stats }, { won });
const BAD_LABELS = ["自我怀疑", "信心不足"];

test("Mozgov 17 reb / 2 blk / 0 pts in a win: defensive night lifts form, no 近况不佳", () => {
  const src = card("mozgoti01", 2015);
  assert.equal(overall(src), 77);
  const stats = { min: 42, pts: 0, reb: 17, ast: 1, blk: 2, stl: 1, tov: 1, fga: 3, fgm: 0 };
  const r = rateGame(src, stats);
  assert.ok(r.defense > 5, `defense ${r.defense}`);
  assert.ok(r.efficiency > -2, "0-for-3 is a small sample, not an efficiency disaster");
  assert.ok(r.total > 0, `total ${r.total}`);
  const g = play(src, stats, true);
  assert.equal(g.note, "篮板统治");
  assert.ok(!BAD_LABELS.includes(confidenceLabel(src.confidence)), `confidence ${src.confidence}`);
  assert.ok(src.confidence > 50 && src.tacticalStatus > 50, `${src.confidence}/${src.tacticalStatus}`);
  assert.notEqual(tacticalLabel(src.tacticalStatus), "信任下滑");
  assert.equal(summarizeRecentForm(src).poor, false);
});

test("no shot attempts never costs efficiency; low points alone is not a bad game", () => {
  const src = card("mozgoti01", 2015);
  const r = rateGame(src, { min: 30, pts: 0, reb: 9, blk: 1, fga: 0 });
  assert.equal(r.efficiency, 0);
  assert.ok(r.scoring > -3, `scoring ${r.scoring}: an unfed center gets only a light volume ding`);
});

test("Rondo 18 ast / 0 pts in a win: 组织统治, confidence up", () => {
  const src = card("rondora01", 2012);
  const g = play(src, { min: 40, pts: 0, ast: 18, reb: 5, stl: 2, tov: 3, fga: 4, fgm: 0 }, true);
  assert.equal(g.note, "组织统治");
  assert.ok(src.confidence >= 60, `confidence ${src.confidence}`);
});

test("30 points on poor efficiency is a volume night, not a great one", () => {
  const src = card("anthoca01", 2013);
  const stats = { min: 38, pts: 30, reb: 5, ast: 2, stl: 1, tov: 3, fga: 32, fgm: 10, fta: 8, ftm: 6 };
  const r = rateGame(src, stats);
  assert.ok(r.efficiency < -4, `efficiency ${r.efficiency}`);
  assert.ok(r.scoring < 0, `scoring ${r.scoring}`);
  assert.equal(play(src, stats, false).note, "高产低效");
});

test("high scorer, no defense: mixed 攻强守弱, net lower than the scoring alone", () => {
  const src = card("anthoca01", 2013);
  const r = rateGame(src, { min: 38, pts: 36, reb: 1, ast: 2, stl: 0, blk: 0, tov: 2, fga: 22, fgm: 13, fta: 8, ftm: 7 });
  assert.ok(r.scoring >= 6 && r.defense <= -4, `${r.scoring}/${r.defense}`);
  assert.ok(r.total < r.scoring);
  const src2 = card("anthoca01", 2013);
  assert.equal(play(src2, { min: 38, pts: 36, reb: 1, ast: 2, stl: 0, blk: 0, tov: 2, fga: 22, fgm: 13, fta: 8, ftm: 7 }, true).note, "攻强守弱");
});

test("DNP changes nothing; garbage minutes barely move form", () => {
  const src = card("mozgoti01", 2015);
  const before = JSON.stringify(src);
  assert.equal(play(src, { min: 0 }, false), null);
  assert.equal(JSON.stringify(src), before);
  const g = play(src, { min: 3, pts: 0, reb: 1 }, false);
  assert.equal(g.note, "出场有限");
  assert.ok(Math.abs(src.confidence - 50) <= 1);
});

test("a genuinely bad center night is still negative (no over-correction)", () => {
  const src = card("mozgoti01", 2015);
  const g = play(src, { min: 30, pts: 2, reb: 3, ast: 0, blk: 0, stl: 0, tov: 5, fga: 8, fgm: 1, pf: 5 }, false);
  assert.ok(NEGATIVE_NOTES.includes(g.note), g.note);
  assert.ok(src.confidence < 40, `confidence ${src.confidence}`);
  assert.ok(src.tacticalStatus < 45);
  assert.equal(summarizeRecentForm(src).poor, true);
});

test("neutral games hold 50 (no hidden downward drift) and minutes offset does not stack", () => {
  const src = card("mozgoti01", 2015);
  src.targetMinutes = 26;
  const stats = { min: 26, pts: 10, reb: 8, ast: 1, blk: 1, stl: 0, tov: 1, fga: 7, fgm: 4 };
  for (let i = 0; i < 6; i++) play(src, { ...stats, pm: i }, i % 2 === 0);
  assert.ok(src.confidence >= 45 && src.confidence <= 56, `confidence ${src.confidence}`);
  assert.ok(Math.abs(src.targetMinutes - 26) <= 1, `targetMinutes drifted to ${src.targetMinutes}`);
});

test("the same game settled twice (refresh / repeated onEnd) is applied once", () => {
  const src = card("mozgoti01", 2015);
  const sim = { score: { home: 100, away: 90 }, home: { roster: [{ id: src.id, stats: { min: 30, pts: 0, reb: 3, tov: 4, fga: 6, fgm: 0 } }] }, away: { roster: [] } };
  const team = { name: "A", players: [src] };
  syncFormToTeams(sim, team, { name: "B", players: [] });
  const after = { c: src.confidence, n: src.recentGames.length };
  syncFormToTeams(sim, team, { name: "B", players: [] });
  syncFormToTeams({ ...sim, _formSynced: false }, team, { name: "B", players: [] });
  assert.deepEqual({ c: src.confidence, n: src.recentGames.length }, after);
});

test("legacy saves: rows without rating fall back to the note; missing fields default", () => {
  const legacy = { recentGames: [{ pts: 0, reb: 17, ast: 1, min: 42, note: "平稳", won: true }] };
  assert.equal(summarizeRecentForm(legacy).poor, false);
  assert.equal(summarizeRecentForm({ lastGame: { pts: 1, min: 20, note: "进攻哑火" } }).poor, true);
  const bare = { scoring: 60, pass: 40 };
  const g = applyFormAfterGame(bare, { stats: { min: 30, pts: 8, reb: 9, fga: 6, fgm: 4 } }, { won: true });
  assert.ok(g && Number.isFinite(bare.confidence) && Number.isFinite(bare.targetMinutes));
});

// ---- presentation: objective numbers only, no player-facing verdicts ----
import { formatGameLine, formDelta, trueShooting } from "../js/engine/form.js";
const VERDICTS = /哑火|统治|锁死|近况不佳|低迷|攻强守弱|攻弱守强|高产低效|防守尽责|慎卖|火力足/;

test("Mozgov line shows raw stats, TS sample, +/-, rating and real before→after state; no verdict", () => {
  const src = card("mozgoti01", 2015);
  const g = play(src, { min: 42, pts: 0, reb: 17, ast: 1, blk: 2, stl: 1, tov: 1, fga: 3, fgm: 0, pm: 9 }, true);
  const line = formatGameLine(g);
  assert.match(line, /0分17板1助 1断 2帽/);
  assert.match(line, /投0\/3 TS 0%/);
  assert.match(line, /\+\/- \+9/);
  assert.match(line, /评分 \+\d/);
  assert.match(line, new RegExp(`信心 50→${src.confidence} \\(\\+${src.confidence - 50}\\)`));
  assert.doesNotMatch(line, VERDICTS);
  assert.equal(g.pm, 9);
  assert.equal(g.prevConfidence, 50);
});

test("TS shows the attempt count: 0/3 and 0/15 are distinguishable; no shots says 未出手", () => {
  assert.deepEqual(trueShooting({ pts: 0, fga: 3, fgm: 0 }), { pct: 0, fga: 3, fgm: 0 });
  assert.equal(trueShooting({ pts: 0, fga: 15, fgm: 0 }).fga, 15);
  assert.equal(trueShooting({ pts: 0, fga: 0, fta: 0 }), null);
  assert.match(formatGameLine({ pts: 0, reb: 9, ast: 0, min: 30, fga: 0, fta: 0 }), /未出手/);
});

test("legacy rows (no pm / rating / prev state) render without fabricated deltas or errors", () => {
  const line = formatGameLine({ pts: 8, reb: 4, ast: 2, min: 20, fgPct: 50, note: "进攻哑火", won: false, confidence: 40 });
  assert.match(line, /命中 50%/);
  assert.doesNotMatch(line, /信心|评分|\+\/-|进攻哑火/);
  assert.equal(formDelta(undefined, 55), "");
  assert.equal(formatGameLine(null), "");
});
