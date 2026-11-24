// B94: the draft screen's title and money line come from one place, so a fresh draft and a resumed one agree.
// `oldTitle` / `oldMoney` are the inline expressions initDraft used before the move (the fresh-start behavior that
// must not change); the resumed path used a different, stale title and never painted the money line at all.
// B95: `oldTitle` always returned raw Chinese regardless of language -- draftTitle() now follows L() instead,
// so a fresh/resumed draft in English mode no longer shows Chinese title text.
import test from "node:test";
import assert from "node:assert/strict";
import { setLang, L } from "../js/i18n.js";
import { CUSTOM_BUDGET } from "../js/data/customPool.js";
import { DRAFT_FREE_REFRESHES, draftRefreshCost } from "../js/engine/draft.js";
import { draftMoneyLabelHtml, draftTitle } from "../js/ui/draftChrome.js";

const draftOf = (mode, gold = 600) => ({
  mode,
  budgetMode: mode === "custom",
  buyPlayers: mode === "custom" || mode === "duel",
  teams: { A: { gold }, B: { gold } },
});

function oldTitle(mode) {
  if (mode === "custom")
    return L("自定义 · 15 块轮抽 → 32 历史球队淘汰赛", "Custom · 15-gold-per-round draft → 32 historical teams, single elimination");
  if (mode === "duel") return L("双人对抗 · 金币买球员（刷新另计）", "1v1 Duel · buy players with gold (refreshing costs extra)");
  return L("选秀建队", "Draft a Team");
}
function oldMoney(d) {
  const isCustom = d.mode === "custom";
  return isCustom
    ? `预算：<strong id="draft-gold">${CUSTOM_BUDGET}</strong> 块`
    : d.buyPlayers
      ? `金币：<strong id="draft-gold">${d.teams.A.gold}</strong>`
      : L(
          `选人免费 · 刷新用金币：<strong id="draft-gold">${d.teams.A.gold}</strong>（前 ${DRAFT_FREE_REFRESHES} 次刷新免费，之后每次 ¤${draftRefreshCost(d)}）`,
          `Picks are free · gold for refreshing: <strong id="draft-gold">${d.teams.A.gold}</strong> (first ${DRAFT_FREE_REFRESHES} refreshes free, then ¤${draftRefreshCost(d)} each)`,
        );
}

test("a fresh draft is painted exactly as before, in every mode and language", () => {
  for (const lang of ["zh", "en"]) {
    setLang(lang);
    for (const mode of ["draft", "duel", "custom", undefined, "somethingElse"]) {
      for (const gold of [0, 345, 800]) {
        const d = draftOf(mode, gold);
        assert.equal(draftTitle(mode), oldTitle(mode), `title ${mode}`);
        assert.equal(draftMoneyLabelHtml(d), oldMoney(d), `money ${lang}/${mode}/${gold}`);
      }
    }
  }
  setLang("zh");
});

test("the custom title is the fresh-start one (a resumed custom draft no longer shows the older wording)", () => {
  setLang("zh");
  assert.equal(draftTitle("custom"), "自定义 · 15 块轮抽 → 32 历史球队淘汰赛");
  assert.notEqual(draftTitle("custom"), "自定义对战 · 先花 15 块再补 0 块");
});

test("B95: custom/duel/plain titles are English in English mode, not leftover Chinese", () => {
  setLang("en");
  assert.equal(draftTitle("custom"), "Custom · 15-gold-per-round draft → 32 historical teams, single elimination");
  assert.equal(draftTitle("duel"), "1v1 Duel · buy players with gold (refreshing costs extra)");
  assert.equal(draftTitle("draft"), "Draft a Team");
  for (const mode of ["custom", "duel", "draft"]) assert.ok(!/[\u4e00-\u9fff]/.test(draftTitle(mode)), `${mode} title leaked Chinese in English mode`);
  setLang("zh");
});

test("each mode says what its money is for, and always exposes the #draft-gold element", () => {
  setLang("zh");
  assert.match(draftMoneyLabelHtml(draftOf("custom")), new RegExp(`预算：<strong id="draft-gold">${CUSTOM_BUDGET}</strong> 块`));
  assert.match(draftMoneyLabelHtml(draftOf("duel", 640)), /金币：<strong id="draft-gold">640<\/strong>/);
  const free = draftMoneyLabelHtml(draftOf("draft", 420));
  assert.match(free, /选人免费/);
  assert.match(free, /id="draft-gold">420</);
  setLang("en");
  assert.match(draftMoneyLabelHtml(draftOf("draft", 420)), /Picks are free/);
  setLang("zh");
});

test("a resumed draft shows its own gold, not the template's default 15", () => {
  setLang("zh");
  const html = draftMoneyLabelHtml(draftOf("duel", 275));
  assert.ok(html.includes(">275<"));
  assert.ok(!html.includes(">15<"));
});
