/**
 * First-run game guide (B97 walkthrough follow-up, user-directed 2026-11-27).
 *
 * One quick intro on first page entry: four short core-loop steps + where the
 * modes live, one tap to dismiss, seen-keyed so it never nags. A "新手指南"
 * button in the home utility row re-opens it later.
 *
 * Technique mirrors tests/firstTimeExperience.test.js: direct module imports
 * for the pure parts, a minimal fake dialog for the open/close wiring, and
 * regex over raw index.html / js/app.js for the static wiring. No DOM/jsdom.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLang, translateStatic } from "../js/i18n.js";
import { PHRASES } from "../js/i18n-phrases.js";
import { modeById } from "../js/data/modeCatalog.js";
import { PLAY_NOW_TIP_KEY, resetTipSession } from "../js/ui/firstRunTip.js";
import {
  FIRST_RUN_GUIDE_KEY,
  guideHtml,
  guideModesLine,
  guideSteps,
  markGuideSeen,
  openFirstRunGuide,
  shouldShowGuide,
  wireGuideDialog,
} from "../js/ui/firstRunGuide.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const homeCss = readFileSync(new URL("../css/home.css", import.meta.url), "utf8");
const ZH = /[\u4e00-\u9fff]/;

function phraseEn(zh) {
  const found = PHRASES.find(([z]) => z === zh);
  assert.ok(found, `PHRASES is missing an entry for ${zh}`);
  return found[1];
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

const throwingStorage = {
  getItem: () => { throw new Error("storage unavailable"); },
  setItem: () => { throw new Error("storage unavailable"); },
};

/** Minimal <dialog> stand-in: innerHTML parsing, listeners, open/showModal/close. */
class FakeDialog {
  constructor() {
    this._innerHTML = "";
    this.open = false;
    this.showModalCalls = 0;
    this.closeCalls = 0;
    this.listeners = {};
    this.buttons = {};
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.buttons = {};
    for (const id of value.matchAll(/id="([^"]+)"/g)) {
      this.buttons[id[1]] = { listeners: {}, addEventListener: (type, fn) => { this.buttons[id[1]].listeners[type] = fn; } };
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }

  querySelector(sel) {
    if (!sel.startsWith("#")) return null;
    return this.buttons[sel.slice(1)] || null;
  }

  showModal() {
    this.showModalCalls += 1;
    this.open = true;
  }

  close() {
    this.closeCalls += 1;
    this.open = false;
    this.listeners.close?.();
  }

  clickButton(id) {
    this.buttons[id]?.listeners.click?.();
  }

  clickBackdrop() {
    this.listeners.click?.({ target: this });
  }
}

test("guide key is new and distinct from the play-now tip key", () => {
  assert.equal(FIRST_RUN_GUIDE_KEY, "cls_guide_first_run_v1");
  assert.notEqual(FIRST_RUN_GUIDE_KEY, PLAY_NOW_TIP_KEY);
});

test("guide has exactly four short core-loop steps, plain language, bilingual", () => {
  setLang("zh");
  const zh = guideSteps();
  assert.equal(zh.length, 4, "guide must be quick: exactly four steps");
  for (const step of zh) {
    assert.ok(step.title && step.body, "every step needs a title and a body");
    assert.ok(step.body.length <= 40, `step body must stay short: ${step.body}`);
    assert.ok(!/化学反应|适配度|暗属性|保底| pity/i.test(step.body), `no jargon in step copy: ${step.body}`);
  }
  assert.deepEqual(
    zh.map((s) => s.title),
    ["抽卡", "组队", "比赛", "临场指挥"],
  );
  setLang("en");
  const en = guideSteps();
  assert.equal(en.length, 4);
  for (const step of en) {
    assert.ok(!ZH.test(step.title + step.body), `English step must contain no Chinese: ${step.title}`);
  }
  assert.deepEqual(
    en.map((s) => s.title),
    ["Draw cards", "Build your team", "Play games", "Coach live"],
  );
  setLang("zh");
});

test("guide modes line names the real catalog modes and home tabs", () => {
  setLang("zh");
  const line = guideModesLine();
  for (const id of ["timeTravel", "franchise", "custom", "career", "sandbox"]) {
    const mode = modeById(id);
    assert.ok(mode, `modeCatalog must still have ${id}`);
    assert.ok(line.includes(mode.title), `modes line must name ${mode.title} (${id})`);
  }
  assert.ok(line.includes("传奇生涯"), "modes line must point at the 传奇生涯 tab");
  assert.ok(line.includes("自由球场"), "modes line must point at the 自由球场 tab");
  setLang("en");
  const enLine = guideModesLine();
  assert.ok(!ZH.test(enLine), "English modes line must contain no Chinese");
  assert.ok(enLine.includes("Time-Travel Career"), "English line must name Time-Travel Career");
  assert.ok(enLine.includes("League GM"), "English line must name League GM");
  assert.ok(enLine.includes("Custom Battle"), "English line must name Custom Battle");
  assert.ok(enLine.includes("Gold Ladder"), "English line must name Gold Ladder");
  assert.ok(enLine.includes("Time-Space Duel"), "English line must name Time-Space Duel");
  assert.ok(enLine.includes("Career tab"), "English line must point at the Career tab");
  assert.ok(enLine.includes("Playground tab"), "English line must point at the Playground tab");
  setLang("zh");
});

test("guideHtml renders title, intro, steps, modes line and both buttons", () => {
  setLang("zh");
  const out = guideHtml();
  assert.ok(out.includes("<h2>新手指南</h2>"), "guide must have its title");
  assert.ok(out.includes("篮球卡牌经理游戏：抽历史球星卡，组队打比赛，临场指挥争冠军。"), "guide must lead with the home one-liner");
  assert.equal((out.match(/<li>/g) || []).length, 4, "guide must render four steps");
  assert.ok(out.includes('id="btn-guide-start">开始游戏</button>'), "guide must have a Start playing button");
  assert.ok(out.includes('id="btn-guide-howto">查看详细玩法说明</button>'), "guide must link to the full how-to");
  setLang("en");
  const en = guideHtml();
  assert.ok(!ZH.test(en), "English guide HTML must contain no Chinese");
  assert.ok(en.includes("<h2>New Player Guide</h2>"));
  assert.ok(en.includes('id="btn-guide-start">Start playing</button>'));
  setLang("zh");
});

test("guide shows when unseen, hides once seen (fake storage)", () => {
  resetTipSession();
  const storage = fakeStorage();
  assert.equal(shouldShowGuide(storage), true, "unseen guide must show");
  markGuideSeen(storage);
  assert.equal(storage.getItem(FIRST_RUN_GUIDE_KEY), "seen", "dismiss must persist the seen key");
  assert.equal(shouldShowGuide(storage), false, "seen guide must not show");
  resetTipSession();
});

test("guide still sticks for the session when storage throws", () => {
  resetTipSession();
  assert.equal(shouldShowGuide(throwingStorage), true, "unseen guide must show even with dead storage");
  markGuideSeen(throwingStorage);
  assert.equal(shouldShowGuide(throwingStorage), false, "dismissed guide must stay dismissed for the session");
  resetTipSession();
});

test("openFirstRunGuide renders, opens, and marks seen on dismiss", () => {
  resetTipSession();
  const storage = fakeStorage();
  const dialog = new FakeDialog();
  assert.equal(openFirstRunGuide(dialog, storage), true);
  assert.equal(dialog.showModalCalls, 1, "guide must open as a modal dialog");
  assert.equal(dialog.open, true);
  assert.ok(dialog.innerHTML.includes("新手指南"), "dialog must render the guide content");
  dialog.clickButton("btn-guide-start");
  assert.equal(dialog.closeCalls, 1, "Start playing must close the guide");
  assert.equal(dialog.open, false);
  assert.equal(storage.getItem(FIRST_RUN_GUIDE_KEY), "seen", "closing must mark the guide seen");
  assert.equal(shouldShowGuide(storage), false);
  resetTipSession();
});

test("guide how-to button closes the guide and opens the full manual", () => {
  resetTipSession();
  const storage = fakeStorage();
  const dialog = new FakeDialog();
  const howto = new FakeDialog();
  openFirstRunGuide(dialog, storage, { howtoDialog: howto });
  dialog.clickButton("btn-guide-howto");
  assert.equal(dialog.closeCalls, 1, "how-to link must close the guide first");
  assert.equal(howto.showModalCalls, 1, "how-to link must open the howto dialog");
  assert.equal(storage.getItem(FIRST_RUN_GUIDE_KEY), "seen", "going to the manual still counts as seen");
  resetTipSession();
});

test("backdrop click closes the guide (and marks it seen)", () => {
  resetTipSession();
  const storage = fakeStorage();
  const dialog = new FakeDialog();
  wireGuideDialog(dialog, storage);
  dialog.showModal();
  dialog.clickBackdrop();
  assert.equal(dialog.closeCalls, 1, "backdrop click must close the guide");
  assert.equal(storage.getItem(FIRST_RUN_GUIDE_KEY), "seen");
  resetTipSession();
});

test("index.html has the guide dialog shell and the home re-open button", () => {
  assert.ok(
    html.includes('<dialog id="first-run-guide-dialog" class="info-dialog guide-dialog" aria-label="新手指南"></dialog>'),
    "guide dialog shell must exist",
  );
  const utilityStart = html.indexOf('<div class="home-utility-row">');
  const utilityEnd = html.indexOf("</div>", utilityStart);
  const utility = html.slice(utilityStart, utilityEnd);
  assert.ok(utility.includes('id="btn-open-guide">新手指南</button>'), "home utility row must have a 新手指南 re-open button");
  assert.ok(utility.includes('id="btn-how-to-play">玩法说明</button>'), "玩法说明 button must stay next to it");
  assert.equal(phraseEn("新手指南"), "New Player Guide");
  setLang("en");
  assert.equal(translateStatic("新手指南"), "New Player Guide");
  setLang("zh");
});

test("home.css styles the guide dialog (narrower than the manual, mobile-first)", () => {
  assert.ok(/\.guide-dialog\s*\{[^}]*max-width:\s*min\(560px, 92vw\)/.test(homeCss), "guide dialog must be narrower than the 680px manual");
  assert.ok(/\.guide-dialog \.guide-steps/.test(homeCss), "guide steps must be styled");
  assert.ok(/\.guide-dialog \.guide-actions/.test(homeCss), "guide actions must be styled");
  assert.ok(/@media \(max-width: 520px\)[\s\S]*?\.guide-dialog \.guide-actions/.test(homeCss), "guide actions must stack on small screens");
});

test("app.js wires the re-open button, the boot trigger, and the wizard guard", () => {
  const reopen = appSource.match(/\$\("#btn-open-guide"\)\?\.addEventListener\("click", \(\) => \{([\s\S]*?)\}\);/);
  assert.ok(reopen, "btn-open-guide must have a click handler in app.js");
  assert.ok(reopen[1].includes("openFirstRunGuide"), "re-open must open the guide");
  assert.ok(reopen[1].includes('$("#first-run-guide-dialog")'), "re-open must target the guide dialog");
  // Boot trigger: after home paints, only with no dev entry and home active.
  const boot = appSource.match(/First-run game guide: one quick intro[\s\S]*?setTimeout\(\(\) => \{([\s\S]*?)\}, 400\);/);
  assert.ok(boot, "boot must have the first-run guide trigger");
  assert.ok(boot[1].includes("devEntries.length"), "guide must not show over a dev entry");
  assert.ok(boot[1].includes('activeScreenName() !== "home"'), "guide must only show on the home screen");
  assert.ok(boot[1].includes("shouldShowGuide"), "guide must check the seen key");
  assert.ok(boot[1].includes("openFirstRunGuide"), "guide must open when unseen");
  // Wizard guard: starting onboarding closes an open guide, never stacks overlays.
  const guard = appSource.match(/function startOnboarding\(acc\) \{([\s\S]*?)const from = activeScreenName\(\);/);
  assert.ok(guard, "startOnboarding must exist");
  assert.ok(guard[1].includes('$("#first-run-guide-dialog")'), "wizard must know about the guide dialog");
  assert.ok(guard[1].includes("guide.close()"), "wizard must close an open guide");
});
