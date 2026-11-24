// B110 — live-roster grade tooltip (gradeLast) follows the UI language.
//
// grade.js stores the last grade reason as a plain Chinese string (and old
// saves already carry those strings), so the English label is mapped at
// display time via gradeReasonLabel(); unknown strings fall back to
// themselves. Pins: (1) every reason the grade* functions can produce has
// an English label with no CJK characters; (2) zh returns the stored
// string unchanged; (3) the app.js call site passes getLang(); (4) the
// rendered liveStatusLine tooltip reads "Last: …" in English and
// "最近：…" in Chinese.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gradeAssist,
  gradeBlock,
  gradeDreb,
  gradeFoul,
  gradeFtMake,
  gradeFtMiss,
  gradeGoodContest,
  gradeHockeyAssist,
  gradeMake,
  gradeMiss,
  gradeOreb,
  gradeReasonLabel,
  gradeScoredOn,
  gradeScreen,
  gradeSteal,
  gradeTov,
} from "../js/engine/grade.js";

const APP_SRC = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const CJK = /[\u3400-\u9fff]/;

/** Drive every grade* event on a fresh dummy player, collect gradeLast. */
function collectReasons() {
  const seen = new Set();
  const run = (fn) => {
    const p = {};
    fn(p);
    assert.ok(p.gradeLast, "grade event must set gradeLast");
    seen.add(p.gradeLast);
  };
  run((p) => gradeMake(p, { pts: 3 }));
  run((p) => gradeMake(p, { pts: 2 }));
  run((p) => gradeMiss(p, { pts: 2 }));
  run((p) => gradeAssist(p));
  run((p) => gradeHockeyAssist(p));
  run((p) => gradeTov(p));
  run((p) => gradeSteal(p));
  run((p) => gradeBlock(p));
  run((p) => gradeOreb(p));
  run((p) => gradeDreb(p));
  run((p) => gradeScreen(p));
  run((p) => gradeFtMake(p));
  run((p) => gradeFtMiss(p));
  run((p) => gradeFoul(p));
  run((p) => gradeScoredOn(p, { open: 0.2 }));
  run((p) => gradeScoredOn(p, { open: 0.45 }));
  run((p) => gradeScoredOn(p, { open: 0.9 }));
  run((p) => gradeGoodContest(p, { open: 0.2 }));
  return [...seen];
}

const EXPECTED_EN = {
  "三分命中": "3-pointer made",
  "投篮命中": "Field goal made",
  "投篮不中": "Shot missed",
  "助攻": "Assist",
  "间接助攻": "Hockey assist",
  "失误": "Turnover",
  "抢断": "Steal",
  "盖帽": "Block",
  "进攻篮板": "Offensive rebound",
  "防守篮板": "Defensive rebound",
  "挡拆掩护": "Screen set",
  "罚球命中": "Free throw made",
  "罚球不中": "Free throw missed",
  "犯规": "Foul",
  "贴防到位": "Tight defence",
  "被得分（轻微）": "Scored on (light)",
  "失位被捅穿": "Beaten off the ball",
  "成功干扰": "Good contest",
};

test("B110: every grade reason the engine can produce has an English label", () => {
  const reasons = collectReasons();
  assert.equal(reasons.length, 18, `expected 18 reasons, got ${reasons}`);
  for (const r of reasons) {
    assert.equal(gradeReasonLabel(r, "en"), EXPECTED_EN[r], `en label for ${r}`);
    assert.doesNotMatch(gradeReasonLabel(r, "en"), CJK, `no CJK in en label for ${r}`);
    assert.equal(gradeReasonLabel(r, "zh"), r, `zh keeps the stored string for ${r}`);
    assert.equal(gradeReasonLabel(r), r, `default lang keeps the stored string for ${r}`);
  }
});

test("B110: unknown / legacy reason strings fall back to themselves", () => {
  assert.equal(gradeReasonLabel("未知原因", "en"), "未知原因");
  assert.equal(gradeReasonLabel("未知原因", "zh"), "未知原因");
  assert.equal(gradeReasonLabel("", "en"), "");
  assert.equal(gradeReasonLabel(null, "en"), "");
});

test("B110: app.js liveStatusLine passes getLang() into gradeReasonLabel", () => {
  assert.match(APP_SRC, /import \{ gradeReasonLabel \} from "\.\/engine\/grade\.js";/);
  assert.match(APP_SRC, /gradeReasonLabel\(p\.gradeLast, getLang\(\)\)/);
});

test("B110: rendered tooltip reads Last/最近 with the reason in the UI language", () => {
  const start = APP_SRC.indexOf("function liveStatusLine(");
  assert.notEqual(start, -1, "liveStatusLine not found in app.js");
  const fnSrc = APP_SRC.slice(start);
  const end = fnSrc.indexOf("\n}\n");
  assert.notEqual(end, -1, "liveStatusLine closing brace not found");
  const body = fnSrc.slice(0, end + 3);
  const render = (lang) => {
    const fn = new Function(
      "photoImg",
      "escAttr",
      "overall",
      "hotClass",
      "moodClass",
      "esc",
      "L",
      "gradeReasonLabel",
      "getLang",
      `${body}\nreturn liveStatusLine;`,
    )(
      () => "",
      (s) => s,
      () => 80,
      () => "",
      () => "",
      (s) => String(s),
      (zh, en) => (lang === "en" ? en : zh),
      gradeReasonLabel,
      () => lang,
    );
    return fn({
      id: "p1",
      name: "Terry Porter",
      pos: "PG",
      playPos: "PG",
      fgPct: 48,
      injuredGames: 0,
      injuryStatus: "",
      grade: "B+",
      gradeTone: "grade-b",
      gradeLast: "助攻",
      overall: 82,
      stats: { pts: 12, reb: 3, ast: 6, stl: 1, blk: 0 },
      fatigue: 20,
      fatigueNote: "",
      ironLungs: false,
      confidenceLabel: "",
      hot: 0,
      hotLabel: lang === "en" ? "Steady" : "平稳",
      mood: 0,
      moodLabel: lang === "en" ? "Calm" : "平静",
    });
  };
  assert.match(render("en"), /title="Last: Assist"/);
  assert.doesNotMatch(render("en"), CJK);
  assert.match(render("zh"), /title="最近：助攻"/);
});
