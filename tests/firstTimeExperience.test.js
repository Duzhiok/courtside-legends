/**
 * B97 ② + B98 ③ — first-time-player next steps (2026-11-27, Lychee).
 *
 * ② The home first screen had no one-line explanation of what the game is:
 * desktop only had the small grey topbar tagline "选人 · 模拟 · 临场指挥"
 * (hidden on phones, home.css max-width 560px), and the hero's own paragraph
 * is hidden by the compact-header CSS on every non-career tab — the default
 * tab is "world", so a new player never saw it. Fix: a dedicated one-line
 * intro as a direct child of .hero, outside .home-banner-copy.
 *
 * ③ The result page only offered "再来一局 / 回主页". Fix: two next-step
 * buttons in the sticky .actions bar — 组建自己的阵容 (My Team tab) and
 * 金币挑战 (gold ladder, mode "career") — wired to the same destinations
 * as the home screen entries.
 *
 * Technique mirrors tests/homeTabs.test.js: regex over raw index.html, no
 * DOM/jsdom dependency. Copy is bilingual via PHRASES + applyStaticLang.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLang, translateStatic } from "../js/i18n.js";
import { PHRASES } from "../js/i18n-phrases.js";
import { HOME_CATEGORIES } from "../js/ui/homeTabs.js";
import { modeById } from "../js/data/modeCatalog.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const homeCss = readFileSync(new URL("../css/home.css", import.meta.url), "utf8");
const ZH = /[\u4e00-\u9fff]/;

const INTRO_ZH = "篮球卡牌经理游戏：抽历史球星卡，组队打比赛，临场指挥争冠军。";
const INTRO_EN = "A basketball card-manager game: draft historic star cards, build your team, and coach live for the title.";

function phraseEn(zh) {
  const found = PHRASES.find(([z]) => z === zh);
  assert.ok(found, `PHRASES is missing an entry for ${zh}`);
  return found[1];
}

test("B97 ②: home first screen has a one-line 'what is this game' intro", () => {
  const introHtml = `<p class="home-intro" id="home-intro">${INTRO_ZH}</p>`;
  // Exactly one, and a direct child of <section class="hero"> right after the
  // banner closes — NOT inside .home-banner-copy (whose > p the compact-header
  // CSS hides on every non-career tab, including the default "world" tab).
  assert.equal(html.split(introHtml).length - 1, 1, "home-intro must appear exactly once");
  const heroStart = html.indexOf('<section class="hero">', html.indexOf('id="screen-home"'));
  const heroEnd = html.indexOf("</section>", heroStart);
  const introAt = html.indexOf(introHtml);
  assert.ok(introAt > heroStart && introAt < heroEnd, "home-intro must sit inside the home hero");
  const bannerCopyAt = html.indexOf('<div class="home-banner-copy">');
  const bannerCloseAt = html.indexOf('<div class="account-home-bar save-home-bar" id="save-home-bar"');
  assert.ok(bannerCopyAt < introAt && introAt < bannerCloseAt, "home-intro must come after the banner, before the save bars");
  // The banner-copy paragraph is hidden by the compact rule; the intro must not
  // be swept up by that rule or any other display:none in home.css.
  const compactRule = homeCss.match(/#screen-home\[data-home-tab\]:not\(\[data-home-tab="career"\]\) :is\(([^)]*)\)/);
  assert.ok(compactRule, "compact-header rule must still exist in home.css");
  assert.ok(!compactRule[1].includes("home-intro"), "compact-header rule must not hide .home-intro");
  assert.ok(/\.home-intro\s*\{/.test(homeCss), "home.css must style .home-intro");
});

test("B97 ②: home intro is bilingual via PHRASES", () => {
  assert.equal(phraseEn(INTRO_ZH), INTRO_EN);
  setLang("en");
  const en = translateStatic(INTRO_ZH);
  assert.equal(en, INTRO_EN);
  assert.ok(!ZH.test(en), "English intro must contain no Chinese");
  setLang("zh");
  assert.equal(translateStatic(INTRO_ZH), INTRO_ZH);
});

test("B98 ③: result page offers two next steps inside the sticky actions bar", () => {
  const resultStart = html.indexOf('<main id="screen-result"');
  const resultEnd = html.indexOf("</main>", resultStart);
  const result = html.slice(resultStart, resultEnd);
  const actionsStart = result.indexOf('<div class="actions">');
  const actionsEnd = result.indexOf("</div>", result.indexOf('id="btn-home"'));
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "result .actions must exist");
  const actions = result.slice(actionsStart, actionsEnd);
  assert.ok(actions.includes('<span class="tiny result-next-label" id="result-next-label">下一步可以：</span>'), "result must label the next steps");
  assert.ok(actions.includes('<button class="btn ghost" id="btn-result-my-team">组建自己的阵容</button>'), "result must offer 组建自己的阵容");
  assert.ok(actions.includes('<button class="btn ghost" id="btn-result-gold">金币挑战</button>'), "result must offer 金币挑战");
  // The old buttons stay exactly as they were.
  assert.ok(actions.includes('id="btn-again">再来一局</button>'), "再来一局 must stay");
  assert.ok(actions.includes('id="btn-home">回主页</button>'), "回主页 must stay");
});

test("B98 ③: next-step labels are bilingual via PHRASES", () => {
  for (const [zh, en] of [
    ["下一步可以：", "Next up:"],
    ["组建自己的阵容", "Build your own roster"],
    ["金币挑战", "Gold Challenge"],
  ]) {
    assert.equal(phraseEn(zh), en);
    setLang("en");
    const out = translateStatic(zh);
    assert.equal(out, en);
    assert.ok(!ZH.test(out), `English for ${zh} must contain no Chinese`);
    setLang("zh");
  }
});

test("B98 ③: next-step buttons are wired to the real destinations", () => {
  // My Team: home screen, players tab — the same tab the home "我的球队" tab opens.
  const myTeam = appSource.match(/\$\("#btn-result-my-team"\)\.onclick = \(\) => \{([\s\S]*?)\};/);
  assert.ok(myTeam, "btn-result-my-team must have an onclick in app.js");
  assert.ok(myTeam[1].includes('show("home")'), "my-team button must show home");
  assert.ok(myTeam[1].includes('activateHomeTab?.("players")'), "my-team button must activate the players tab");
  assert.ok(HOME_CATEGORIES.some((c) => c.id === "players"), "home tabs must still include players");
  // Gold challenge: the gold ladder, mode "career" — the same entry as the home mode card.
  const gold = appSource.match(/\$\("#btn-result-gold"\)\.onclick = \(\) => (.*?);/);
  assert.ok(gold, "btn-result-gold must have an onclick in app.js");
  assert.ok(gold[1].includes('startMode("career")'), "gold button must start the career (gold ladder) mode");
  const career = modeById("career");
  assert.ok(career, "modeCatalog must still have the career mode");
  assert.equal(career.title, "金币晋级赛");
});

test("B98 ③: season sim disables the new buttons mid-run", () => {
  // simRestOfSeason disables every result button while it runs, so a tap
  // mid-sim cannot start a new flow under the running one.
  const list = appSource.match(/const buttons = \[([^\]]*)\]\s*\n\s*\.map\(\(sel\) => \$\(sel\)\)/);
  assert.ok(list, "simRestOfSeason button list must exist");
  assert.ok(list[1].includes('"#btn-result-my-team"'), "sim must disable the my-team button");
  assert.ok(list[1].includes('"#btn-result-gold"'), "sim must disable the gold button");
});
