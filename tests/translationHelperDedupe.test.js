// A-P2-17: the tiny translation helper is defined exactly once, in js/i18n.js
// (`L` for the current language, `TL` for an explicit caller-supplied lang).
// Pins the migration contract: no local T/tr/L copies remain in the UI layer,
// the three files that used to export T/tr no longer do, nothing still imports
// them, and the shared helpers pick the right string in both languages.
// Follow-up to tests/confirmActionMigration.test.js (same grep-style pinning).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { L, TL, getLang, setLang } from "../js/i18n.js";
import { reasonText } from "../js/ui/shopView.js";
import { moduleLabel } from "../js/ui/playerVoiceView.js";
import { effectChipsHtml } from "../js/ui/timeTravel/format.js";

// Every file that used to define (or import) its own T/tr/L copy.
const MIGRATED = [
  "js/i18n.js",
  "js/app.js",
  "js/audio/radioPanel.js",
  "js/modes/halfCourt3v3.js",
  "js/ui/avatarLookView.js",
  "js/ui/careerEntry.js",
  "js/ui/careerPostGameView.js",
  "js/ui/homeShowcase.js",
  "js/ui/hometownView.js",
  "js/ui/learnedBadge.js",
  "js/ui/legacyMuseumView.js",
  "js/ui/liveGoals.js",
  "js/ui/matchEventCards.js",
  "js/ui/matchupPlanView.js",
  "js/ui/myHome/isoRoom.js",
  "js/ui/myHome/myHomeScreen.js",
  "js/ui/myTeamClubhouseView.js",
  "js/ui/myTeamCourtView.js",
  "js/ui/myTeamHonoursView.js",
  "js/ui/myTeamLineupView.js",
  "js/ui/myTeamViewKit.js",
  "js/ui/myWorldView.js",
  "js/ui/playerCard.js",
  "js/ui/playerVoice.js",
  "js/ui/playerVoiceView.js",
  "js/ui/pregameCard.js",
  "js/ui/reborn/creation.js",
  "js/ui/rotationBoard.js",
  "js/ui/screenShell.js",
  "js/ui/shopView.js",
  "js/ui/teamIntelligenceController.js",
  "js/ui/teamIntelligenceView.js",
  "js/ui/timeTravel/choices.js",
  "js/ui/timeTravel/copy.js",
  "js/ui/timeTravel/epilogue.js",
  "js/ui/timeTravel/finance.js",
  "js/ui/timeTravel/financeCard.js",
  "js/ui/timeTravel/format.js",
  "js/ui/timeTravel/hq.js",
  "js/ui/timeTravel/interviewCard.js",
  "js/ui/timeTravel/introCard.js",
  "js/ui/timeTravel/kpis.js",
  "js/ui/timeTravel/legacy.js",
  "js/ui/timeTravel/offers.js",
  "js/ui/timeTravel/paint.js",
  "js/ui/timeTravel/perkCard.js",
  "js/ui/timeTravel/poachCard.js",
  "js/ui/timeTravel/prophecyCard.js",
  "js/ui/timeTravel/retireCard.js",
  "js/ui/timeTravel/screen.js",
  "js/ui/timeTravel/viewModel.js",
  "js/ui/timeTravel/wizard.js",
];

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

// The old shapes: (lang, zh, en) picks and (zh, en) picks closed over a lang.
const DUP_DEF = [
  /(?:^|\n)(?:export )?const (?:T|tr|L) = \(lang, zh, en\) =>/,
  /(?:^|\n)\s*const (?:T|L) = \(zh, en\) => \(getLang\(\) === "en"/,
  /(?:^|\n)\s*const L = \(zh, en\) => \(lang === "en"/,
];

test("A-P2-17: no duplicate translation-helper definition remains", () => {
  for (const rel of MIGRATED) {
    const s = src(rel);
    for (const re of DUP_DEF) {
      assert.equal(re.test(s), false, `${rel} still defines a local T/tr/L copy`);
    }
  }
});

test("A-P2-17: the three files no longer export T/tr", () => {
  assert.equal(src("js/ui/timeTravel/format.js").includes("export const tr"), false);
  assert.equal(src("js/ui/myTeamViewKit.js").includes("export const T"), false);
  assert.equal(src("js/ui/playerVoiceView.js").includes("export const T"), false);
  // ...but format.js keeps its other exports.
  assert.match(src("js/ui/timeTravel/format.js"), /export function effectChipsHtml/);
  assert.match(src("js/ui/timeTravel/format.js"), /export const clamp/);
});

test("A-P2-17: nothing imports tr from format.js or T from the kit/voice views", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.name.endsWith(".js")) files.push(`${dir}/${e.name}`);
    }
  };
  walk("js");
  walk("tests");
  for (const rel of files) {
    const s = src(rel);
    assert.equal(/import \{[^}]*\btr\b[^}]*\} from "[^"]*format\.js"/.test(s), false, `${rel} still imports tr from format.js`);
    assert.equal(/import \{[^}]*\bT\b[^}]*\} from "[^"]*myTeamViewKit\.js"/.test(s), false, `${rel} still imports T from myTeamViewKit.js`);
    assert.equal(/import \{[^}]*\bT\b[^}]*\} from "[^"]*playerVoiceView\.js"/.test(s), false, `${rel} still imports T from playerVoiceView.js`);
  }
});

test("A-P2-17: halfCourtView getter variants are intentionally kept (different semantics)", () => {
  // These take an en() getter, not a lang string — out of scope for the dedupe.
  const s = src("js/ui/halfCourtView.js");
  assert.match(s, /const T = \(zh, enText\) => \(en \? enText : zh\)/);
  assert.match(s, /const T = \(zh, enText\) => \(en\(\) \? enText : zh\)/);
});

test("A-P2-17: helpers passed as values now thread lang instead", () => {
  // Two call sites used to pass the local picker itself down
  // (seasonPanel({ ..., L }), tag/conflictText(c, L)) — a bare L there would
  // be undefined once the local definition is gone.
  assert.match(src("js/ui/myTeamLineupView.js"), /seasonPanel\(\{ eligible, dirty, resume, lang \}\)/);
  assert.match(src("js/ui/myTeamLineupView.js"), /function seasonPanel\(\{ eligible, dirty, resume, lang \}\)/);
  assert.match(src("js/ui/teamIntelligenceView.js"), /conflictText\(c, lang\)/);
  assert.match(src("js/ui/teamIntelligenceView.js"), /synergyText\(s, lang\)/);
  assert.match(src("js/ui/teamIntelligenceView.js"), /tag\(c\.simBacked, lang\)/);
  assert.equal(/, L[ })]/.test(src("js/ui/myTeamLineupView.js")), false);
  assert.equal(/, L[ })]/.test(src("js/ui/teamIntelligenceView.js")), false);
});

test("A-P2-17: shared helpers pick the right language", () => {
  assert.equal(TL("en", "中文", "English"), "English");
  assert.equal(TL("zh", "中文", "English"), "中文");
  assert.equal(TL(undefined, "中文", "English"), "中文");
  assert.equal(TL("en", ["小幅"], ["slightly"])[0], "slightly");
  // Migrated pure helpers still render for an explicit lang, independent of
  // the current UI language (the reason TL exists instead of bare L).
  const prev = getLang();
  try {
    setLang("zh");
    assert.equal(reasonText("not-enough-gold", "en"), "Not enough gold");
    assert.equal(reasonText("not-enough-gold", "zh"), "金币不足");
    assert.equal(moduleLabel("game", "en"), "Entire Game");
    assert.equal(moduleLabel("game", "zh"), "整个游戏");
    assert.match(effectChipsHtml({ trust: 5 }, "en"), /clearly/);
    assert.match(effectChipsHtml({ trust: 5 }, "zh"), /明显/);
    // L follows the current language.
    assert.equal(L("中文", "English"), "中文");
    setLang("en");
    assert.equal(L("中文", "English"), "English");
  } finally {
    setLang(prev);
  }
});
