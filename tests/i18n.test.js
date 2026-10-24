import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { getLang, setLang, L, translateStatic, skillNameL, teamNameL } from "../js/i18n.js";
import { PHRASES } from "../js/i18n-phrases.js";
import { FRANCHISES, franchiseName } from "../js/data/franchises.js";
import { careerStageLabel } from "../js/engine/careerBracket.js";
import { challengeTierName } from "../js/data/careerChallenges.js";
import { formatSaveLabel, translateStoredLabel } from "../js/data/savegame.js";

const ZH = /[\u4e00-\u9fff]/;

test("i18n: L() follows the current language and setLang round-trips", () => {
  setLang("zh");
  assert.equal(getLang(), "zh");
  assert.equal(L("中文", "English"), "中文");
  setLang("en");
  assert.equal(getLang(), "en");
  assert.equal(L("中文", "English"), "English");
  setLang("zh");
  assert.equal(L("中文", "English"), "中文");
});

test("i18n: skill names translate by id, and fall back to the Chinese name", () => {
  assert.equal(skillNameL("死亡缠绕", "en"), "Death Wrap");
  assert.equal(skillNameL("大北斗指滚", "en"), "Big Dipper Finger Roll");
  assert.equal(skillNameL("死亡缠绕", "zh"), "死亡缠绕");
  assert.equal(skillNameL("不存在的技能", "en"), "不存在的技能");
});

test("i18n: 中投 translates to MID, never to an investment corporation", () => {
  setLang("en");
  assert.equal(translateStatic("中投"), "MID");
  setLang("zh");
  assert.equal(translateStatic("中投"), "中投");
});

test("i18n: every Chinese segment in index.html is covered by PHRASES", () => {
  // Static chrome is translated by phrase substitution, so the test mirrors
  // that: after translateStatic in en, no Chinese may remain — except the
  // two intentional keeps (the language toggle's own bilingual title, and
  // example search terms that are player names / nicknames).
  const ALLOW = new Set([
    "Language / 语言",
    "搜球员：英文名 / 热门球星中文名 / 外号，如「Livingston」「利文斯顿」「黑曼巴」",
  ]);
  let html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  html = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const segs = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/&nbsp;/g, " ").trim();
    if (ZH.test(t)) segs.add(t);
  }
  for (const m of html.matchAll(/(placeholder|title|aria-label)="([^"]+)"/g)) {
    const t = m[2].trim();
    if (ZH.test(t)) segs.add(t);
  }
  assert.ok(segs.size > 300, `expected hundreds of segments, got ${segs.size}`);
  setLang("en");
  const misses = [...segs].filter((s) => !ALLOW.has(s) && ZH.test(translateStatic(s)));
  assert.deepEqual(misses, []);
  setLang("zh");
});

test("i18n: PHRASES has no empty or identity entries", () => {
  for (const [zh, en] of PHRASES) {
    assert.ok(zh && zh.length >= 1, "empty zh phrase");
    assert.ok(en && en.length >= 1, `empty en for ${zh}`);
    assert.notEqual(en, zh, `identity entry: ${zh}`);
  }
});

test("i18n: franchise names have English forms", () => {
  const lal = FRANCHISES.find((f) => f.id === "LAL");
  assert.equal(franchiseName(lal, "zh"), "湖人");
  assert.equal(franchiseName(lal, "en"), "Lakers");
  assert.ok(FRANCHISEES_EVERY());
  function FRANCHISEES_EVERY() {
    return FRANCHISES.every((f) => franchiseName(f, "en"));
  }
});

test("i18n: home bars — stage labels, tier names, stored labels, team names", () => {
  assert.equal(careerStageLabel(32, { lang: "zh" }), "三十二强 · 32进16");
  assert.equal(careerStageLabel(32, { lang: "en" }), "Round of 32 · 32→16");
  assert.equal(careerStageLabel(2, { lang: "en" }), "Finals · 2→1");
  assert.equal(challengeTierName("gold", "zh"), "金币联赛");
  assert.equal(challengeTierName("gold", "en"), "Gold League");
  assert.equal(challengeTierName("playoff15", "en"), "Historical Playoff Challenge");
  // The exact stored label from the user's screenshot, shown in EN mode.
  assert.equal(
    translateStoredLabel("Gold联赛 · 三十二强 · 32进16", "en"),
    "Gold League · Round of 32 · 32→16"
  );
  assert.equal(translateStoredLabel("金币联赛 · 十六强 · 16进8", "en"), "Gold League · Round of 16 · 16→8");
  assert.equal(translateStoredLabel("金币联赛 · 三十二强 · 32进16", "zh"), "金币联赛 · 三十二强 · 32进16");
  const shown = formatSaveLabel({ label: "金币联赛 · 三十二强 · 32进16", savedAt: Date.UTC(2026, 9, 24, 0, 28) }, "en");
  assert.match(shown, /Gold League · Round of 32/);
  assert.doesNotMatch(shown, ZH);
  assert.equal(teamNameL("山猫", "en"), "Bobcats");
  assert.equal(teamNameL("山猫", "zh"), "山猫");
  assert.equal(teamNameL("我自己的队名", "en"), "我自己的队名");
});

// ---- GameSim language smoke tests ----

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.map(seasonToCard).filter((c) => c.ovr2k >= 82);

function runGame(lang) {
  // 12-man rosters, injuries off: with injuries on, a small roster can drop
  // below 5 available players and the sim skips possessions forever.
  const team = (name, off) => ({
    name,
    players: pool.slice(off, off + 12),
    starterIds: pool.slice(off, off + 5).map((p) => p.id),
  });
  const events = [];
  const sim = new GameSim({
    home: team("H", 0),
    away: team("A", 40),
    youSide: "home",
    injuries: false,
    lang,
    onEvent: (e) => events.push(e),
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  sim.paused = false;
  let guard = 0;
  while (guard++ < 30000 && events.length < 300) {
    sim.step();
    if (sim.paused) sim.setPaused(false);
    if (!sim.running && sim.quarter > 4) break;
  }
  return events;
}

test("i18n: an English game emits no Chinese in score/miss/reb/dunk/coach feed", () => {
  const events = runGame("en");
  assert.ok(events.filter((e) => e.type === "score").length > 20, "expected many score events");
  const leaks = events.filter((e) => ["score", "miss", "reb", "dunk", "coach"].includes(e.type) && ZH.test(e.text));
  assert.deepEqual(
    leaks.map((e) => `${e.type}: ${e.text}`),
    []
  );
});

test("i18n: the default (zh) game still reads Chinese, and lang defaults to zh", () => {
  const events = runGame(undefined);
  const scores = events.filter((e) => e.type === "score");
  assert.ok(scores.length > 20, "expected many score events");
  assert.ok(scores.some((e) => ZH.test(e.text)), "zh game should still emit Chinese feed lines");
  const sim = new GameSim({
    home: { name: "H", players: pool.slice(0, 12), starterIds: pool.slice(0, 5).map((p) => p.id) },
    away: { name: "A", players: pool.slice(40, 52), starterIds: pool.slice(40, 45).map((p) => p.id) },
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  assert.equal(sim.lang, "zh");
});
