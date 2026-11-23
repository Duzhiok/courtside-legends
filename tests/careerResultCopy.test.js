// B61: the Gold Challenge result screen's words are pure functions now (js/ui/careerResultCopy.js). The move was proven
// identical to the old inline code over 720 outcome combinations (see docs/BACKLOG.md B61 step 7); these pin the wording rules
// that are easy to break: the Chinese-only vs language-aware outcomes, the champion ladder, the loss-count wording.
import test from "node:test";
import assert from "node:assert/strict";
import { advanceCopy, anotherGameCopy, championCopy, eliminatedCopy, seriesGameCopy } from "../js/ui/careerResultCopy.js";

const labels = {
  finalsSeriesLabel: (series, lang) => `SERIES ${series.wins}-${series.losses}${lang ? ` (${lang})` : ""}`,
  careerRoundLabel: (round) => `ROUND ${round}`,
};
const tier = { next: "playoff15", nextLabel: "季后赛挑战", nextLabelEn: "Playoff Challenge" };
const champ = (over) => ({ tierId: "gold", nextTier: null, tier, reward: 600, gold: 1600, injLine: "全员健康。", challengeNote: "", wasFinals: false, series: null, lang: "zh", ...over });

test("champion: the title follows the challenge tier and the language, and the Finals series prefixes the summary", () => {
  assert.equal(championCopy(champ(), labels).title, "总冠军！");
  assert.equal(championCopy(champ({ lang: "en" }), labels).title, "Champions!");
  assert.equal(championCopy(champ({ tierId: "playoff15" }), labels).title, "季后赛挑战冠军！");
  assert.equal(championCopy(champ({ tierId: "champ7", lang: "en" }), labels).title, "Historical Champions Challenge · Cleared!");
  const finals = championCopy(champ({ wasFinals: true, series: { wins: 4, losses: 2 }, lang: "en" }), labels);
  assert.ok(finals.summary.startsWith("SERIES 4-2 (en) · Champions! Earned ¤600. Now ¤1600."), "the label gets the language");
  assert.equal(championCopy(champ({ wasFinals: true, series: null }), labels).summary.includes("SERIES"), false, "no series, no prefix");
  assert.ok(championCopy(champ({ challengeNote: " +50 gold" }), labels).summary.endsWith("全员健康。 +50 gold"));
});

test("champion: only the next challenge tiers give the button a new label; the summary names the next tier in the UI language", () => {
  assert.equal(championCopy(champ(), labels).continueLabel, "捧杯回主页");
  const up = championCopy(champ({ nextTier: "playoff15" }), labels);
  assert.equal(up.continueLabel, "季后赛挑战");
  assert.match(up.summary, /可继续季后赛挑战（保留阵容与金币）/);
  assert.match(championCopy(champ({ nextTier: "playoff15", lang: "en" }), labels).summary, /Continue to Playoff Challenge \(roster and gold kept\)/);
  const noEn = { ...tier, nextLabelEn: undefined };
  assert.match(championCopy(champ({ nextTier: "champ7", tier: noEn, lang: "en" }), labels).summary, /Continue to 季后赛挑战/, "falls back to the Chinese label");
  assert.match(championCopy(champ({ tierId: "champ7", lang: "en" }), labels).summary, /beat all 7 historical champions/);
  assert.match(championCopy(champ({ tierId: "champ7" }), labels).summary, /你已击败 7 支历史总冠军/);
});

test("eliminated: a Finals loss, a second loss and a plain knock-out each get their own title; the summary names the series or the round", () => {
  const base = { wasFinals: false, losses: 1, series: null, round: 3, kind: "半决赛", injLine: "全员健康。" };
  assert.equal(eliminatedCopy(base, labels).title, "淘汰出局");
  assert.equal(eliminatedCopy({ ...base, losses: 2 }, labels).title, "两败出局");
  assert.equal(eliminatedCopy({ ...base, wasFinals: true, losses: 2 }, labels).title, "总决赛出局", "a Finals loss wins over the loss count");
  assert.equal(eliminatedCopy(base, labels).summary, "ROUND 3 · 半决赛失利后出局（负场 1）。可回看其他对决。全员健康。");
  const finals = eliminatedCopy({ ...base, wasFinals: true, series: { wins: 1, losses: 4 } }, labels);
  assert.equal(finals.summary, "SERIES 1-4 · 系列赛失利出局。可回看其他对决。全员健康。", "this one is Chinese-only: no language argument");
  assert.equal(eliminatedCopy({ ...base, wasFinals: true, series: null }, labels).summary.startsWith("ROUND 3"), true, "a Finals loss without a series falls back to the round line");
  assert.equal(eliminatedCopy(base, labels).continueLabel, "回主页");
});

test("a Finals series game names the next game and sends you to the market first", () => {
  const w = seriesGameCopy({ youWin: true, series: { wins: 2, losses: 1 }, gameNo: 3, reward: 160, gold: 900, injLine: "x" }, labels);
  assert.equal(w.title, "总决赛 G3 拿下");
  assert.equal(w.continueLabel, "备战总决赛 G4（先进市场）");
  assert.match(w.summary, /^SERIES 2-1。获得 ¤160，当前 ¤900。G4 开打前可先进市场/);
  assert.equal(seriesGameCopy({ youWin: false, series: {}, gameNo: 1, reward: 40, gold: 1, injLine: "" }, labels).title, "总决赛 G1 惜败");
  assert.equal(seriesGameCopy({ youWin: false, series: {}, gameNo: 1, reward: 40, gold: 1, injLine: "" }, labels).continueLabel, "备战总决赛 G1（先进市场）", "an empty series counts as game 1");
});

test("another game in the group: a win and a loss read differently, and the loss count is out of 2", () => {
  const base = { kind: "对决", reward: 160, nextKind: "决胜局", nextOppName: "Rivals", losses: 1, injLine: "。" };
  const win = anotherGameCopy({ ...base, youWin: true });
  assert.equal(win.title, "对决过关");
  assert.match(win.summary, /组内下一场：决胜局（对阵 Rivals）。负场 1\/2。/);
  const loss = anotherGameCopy({ ...base, youWin: false });
  assert.equal(loss.title, "对决失利 · 还有机会");
  assert.match(loss.summary, /进入 决胜局 争取晋级。负场 1\/2 —— 再输就出局。/);
  assert.equal(loss.continueLabel, "备战决胜局");
});

test("advancing: the title follows the result, the button follows whether the next stage is the Finals", () => {
  const base = { kind: "对决", reward: 160, gold: 1160, nextLabel: "总决赛", losses: 0, injLine: "全员健康。", stageSize: 4 };
  assert.equal(advanceCopy({ ...base, youWin: true }).title, "晋级成功");
  assert.equal(advanceCopy({ ...base, youWin: false }).title, "惊险晋级");
  assert.equal(advanceCopy(base).continueLabel, "备战下一轮");
  assert.equal(advanceCopy({ ...base, stageSize: 2 }).continueLabel, "备战总决赛");
  assert.equal(advanceCopy(base).summary, "对决赛果已计入。获得 ¤160，当前 ¤1160。下一轮：总决赛。负场 0/2。全员健康。");
});
