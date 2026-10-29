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

  const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s || "");
  test("all tactics and coaches carry complete EN fields", async () => {
    const m = await import("../js/data/coaches.js");
    for (const [id, t] of Object.entries(m.TACTICS)) {
      assert.ok(t.nameEn && !hasCJK(t.nameEn), `tactic ${id} nameEn`);
      assert.ok(t.descEn && !hasCJK(t.descEn), `tactic ${id} descEn`);
      assert.equal(m.tacticName(t, "zh"), t.name);
      assert.equal(m.tacticName(t, "en"), t.nameEn);
    }
    for (const c of m.COACHES) {
      assert.ok(c.nameEn && !hasCJK(c.nameEn), `coach ${c.id} nameEn`);
      assert.ok(c.styleEn && !hasCJK(c.styleEn), `coach ${c.id} styleEn`);
      assert.ok(c.specialtyEn && !hasCJK(c.specialtyEn), `coach ${c.id} specialtyEn`);
      assert.ok(c.noteEn && !hasCJK(c.noteEn), `coach ${c.id} noteEn`);
      assert.ok(c.record.noteEn && !hasCJK(c.record.noteEn), `coach ${c.id} record.noteEn`);
      assert.equal(m.coachName(c, "zh"), c.name);
      assert.equal(m.coachSpecialtyLabel(c, "en"), c.specialtyEn);
    }
    for (const a of m.ASSISTANTS) {
      assert.ok(a.nameEn && !hasCJK(a.nameEn), `assistant ${a.id} nameEn`);
      assert.ok(a.roleEn && !hasCJK(a.roleEn), `assistant ${a.id} roleEn`);
      assert.ok(a.noteEn && !hasCJK(a.noteEn), `assistant ${a.id} noteEn`);
    }
  });
  test("roster tactic unlock reasons are EN-clean in EN mode", async () => {
    const m = await import("../js/data/coaches.js");
    const passers = [
      { name: "P1", pass: 90, pos: "PG", playPos: "PG" },
      { name: "P2", pass: 88, pos: "SG", playPos: "SG" },
    ];
    const bigs = [
      { name: "C1", rebound: 92, pos: "C", playPos: "C" },
      { name: "C2", rebound: 90, pos: "C", playPos: "C" },
    ];
    const { reasons } = m.rosterTacticUnlocks([...passers, ...bigs], "en");
    assert.ok(Object.keys(reasons).length >= 5);
    for (const [id, r] of Object.entries(reasons)) assert.ok(!hasCJK(r), `reason ${id}: ${r}`);
  });
  test("story events and endings localize without Chinese", async () => {
    const m = await import("../js/story/eventEngine.js");
    for (const ev of m.listStoryEvents()) {
      const loc = m.localizeStoryEvent(ev, "en");
      assert.ok(loc.titleEn || !hasCJK(loc.title), `event ${ev.id} title`);
      assert.ok(!hasCJK(loc.prompt), `event ${ev.id} prompt`);
      for (const c of loc.choices) {
        assert.ok(!hasCJK(c.label), `event ${ev.id} choice ${c.id} label`);
        assert.ok(!hasCJK(c.description), `event ${ev.id} choice ${c.id} desc`);
      }
      assert.equal(m.localizeStoryEvent(ev, "zh"), ev);
    }
    const root = { story: { eventLog: [] }, leagueCareer: { management: { seasonHistory: [
      { championId: "t1", teamId: "t1" }, { championId: "t1", teamId: "t1" },
    ] } } };
    // trust >= 55 path needs frontOfficeTrust; set it
    root.story.frontOfficeTrust = 60;
    const ending = m.deriveEnding(root);
    assert.equal(ending.id, "dynasty-builder");
    assert.ok(ending.labelEn && !hasCJK(ending.labelEn));
  });
  test("teamNameL covers league/time-team generated names", async () => {
    const { teamNameL } = await import("../js/i18n.js");
    assert.equal(teamNameL("联盟队3", "en"), "League Team 3");
    assert.equal(teamNameL("时空队 B", "en"), "Time Team B");
    assert.equal(teamNameL("山猫", "en"), "Bobcats");
    assert.equal(teamNameL("联盟队3", "zh"), "联盟队3");
  });
  test("tier next labels and finals label have EN forms", async () => {
    const { challengeTierMeta } = await import("../js/data/careerChallenges.js");
    assert.ok(challengeTierMeta("gold").nextLabelEn);
    assert.ok(challengeTierMeta("playoff15").nextLabelEn);
    const { finalsSeriesLabel } = await import("../js/engine/careerBracket.js");
    const en = finalsSeriesLabel({ wins: 1, losses: 0, target: 2 }, "en");
    assert.ok(en.includes("Finals") && !hasCJK(en));
    assert.equal(finalsSeriesLabel({ wins: 1, losses: 0, target: 2 }, "zh"), "总决赛 1–0（先赢 2 场）");
  });

test("R59 skill descriptions: every pack has a CJK-free descEn", async () => {
  const { SKILL_PACKS, skillDesc } = await import("../js/data/skills.js");
  const ids = Object.keys(SKILL_PACKS);
  assert.equal(ids.length, 94);
  for (const id of ids) {
    const pack = SKILL_PACKS[id];
    assert.ok(pack.descEn, `${id} missing descEn`);
    assert.ok(!hasCJK(pack.descEn), `${id} descEn has CJK: ${pack.descEn}`);
    assert.equal(skillDesc(pack, "en"), pack.descEn);
    assert.equal(skillDesc(pack, "zh"), pack.desc);
  }
  assert.equal(skillDesc("clutch_killer", "en"), "Clutch shooting rises in close games and the fourth quarter");
});

test("R59 skill shop offers localize name and desc in EN", async () => {
  const { rollSkillShopOffers } = await import("../js/data/skills.js");
  for (let run = 0; run < 3; run++) {
    const offers = rollSkillShopOffers(6, [], null, "en");
    assert.equal(offers.length, 6);
    for (const offer of offers) {
      assert.ok(!hasCJK(offer.name), `offer name has CJK: ${offer.name}`);
      assert.ok(!hasCJK(offer.desc), `offer desc has CJK: ${offer.desc}`);
    }
  }
});

test("R59 career timeline prose: trade and hire descriptions have EN forms", async () => {
  const { transactionDescription } = await import("../js/modes/leagueCareer.js");
  const trade = {
    type: "trade",
    withName: "Team C",
    give: [{ name: "Out A" }, { name: "Out B" }],
    get: [{ name: "In A" }],
  };
  assert.equal(transactionDescription(trade, "en"), "Team C: sent Out A, Out B, got In A");
  assert.equal(transactionDescription(trade, "zh"), "Team C：送出 Out A、Out B，得到 In A");
  const hire = { type: "hire_coach", name: "New Coach", replaced: "Old Coach" };
  assert.equal(transactionDescription(hire, "en"), "New Coach (replacing Old Coach)");
});

test("R59 career history renders EN timeline prose", async () => {
  const { renderCareerHistory } = await import("../js/ui/leagueManagementView.js");
  const career = {
    season: { userTeamId: "B", teams: { B: { name: "Team B" } } },
    management: {
      seasonHistory: [{
        year: 2030,
        teamId: "B",
        teamName: "Team B",
        record: { w: 41, l: 41 },
        finish: "champion",
        awards: {},
        transactions: [{
          type: "trade",
          year: 2030,
          day: 2,
          description: "Team C：送出 Out A，得到 In A",
          descriptionEn: "Team C: sent Out A, got In A",
        }],
      }],
      draftHistory: [],
    },
    history: [],
  };
  const container = { dataset: {}, innerHTML: "" };
  renderCareerHistory(container, { career, lang: "en" });
  assert.ok(container.innerHTML.includes("Team C: sent Out A, got In A"));
  assert.ok(container.innerHTML.includes("Champion"));
  assert.ok(!hasCJK(container.innerHTML), container.innerHTML.slice(0, 300));
});

test("R59 ending share card: text and HTML localize fully in EN", async () => {
  const { shareCardText, renderEndingShareCardHtml } = await import("../js/story/endingShareCard.js");
  const card = {
    ending: { label: "王朝建筑师", labelEn: "Dynasty Builder", tone: "gold" },
    teamName: "Team B",
    yearSpan: "2024–2029",
    seasonCount: 5,
    record: { w: 250, l: 160, pct: 0.61 },
    championships: 2,
    bestSeason: { year: 2027, record: { w: 60, l: 22 } },
    seasons: [{ year: 2027, record: { w: 60, l: 22 }, finish: "champion" }],
    historyChanges: 1,
    signatureTrades: [{ year: 2025, description: "Team C：送出 Out A，得到 In A", descriptionEn: "Team C: sent Out A, got In A" }],
    contract: {
      tone: "success",
      text: "接受「主教练」：3 年 · 薪资 500 · 权限 高",
      textEn: 'Accepted "Head Coach": 3 yrs · salary 500 · authority High',
      privileges: ["自定义训练计划"],
      privilegesEn: ["Custom training plans"],
    },
    story: { trust: 80, pressure: 30, divergence: 5 },
  };
  const text = shareCardText(card, "en");
  assert.ok(!hasCJK(text), text);
  assert.ok(text.includes("Signature trade 2025: Team C: sent Out A, got In A"));
  const html = renderEndingShareCardHtml(card, "en");
  assert.ok(!hasCJK(html), html.slice(0, 300));
  assert.ok(html.includes("Custom training plans"));
  assert.ok(html.includes("Season by season"));
});
