// B94: the draft screen's title and money line come from one place, so a fresh draft and a resumed one agree.
// `oldTitle` / `oldMoney` are the inline expressions initDraft used before the move (the fresh-start behavior that
// must not change); the resumed path used a different, stale title and never painted the money line at all.
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
  if (mode === "custom") return "自定义 · 15 块轮抽 → 32 历史球队淘汰赛";
  if (mode === "duel") return "双人对抗 · 金币买球员（刷新另计）";
  return "选秀建队";
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
  assert.equal(draftTitle("custom"), "自定义 · 15 块轮抽 → 32 历史球队淘汰赛");
  assert.notEqual(draftTitle("custom"), "自定义对战 · 先花 15 块再补 0 块");
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
