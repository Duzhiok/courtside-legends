// Regression: `import { getLang }` was once pasted inside gachaView.js's opening JSDoc
// block, so getLang was undefined and drawRevealHtml threw a ReferenceError on every
// card reveal -- the whole suite stayed green because nothing rendered a reveal.
import test from "node:test";
import assert from "node:assert/strict";
import { drawRevealHtml } from "../js/ui/gachaView.js";

const view = {
  esc: (s) => String(s ?? ""),
  photoImg: () => "<img>",
  rarityClass: () => "r",
  skillChipsHtml: () => "",
  hiddenBadgesHtml: () => "",
};

test("drawRevealHtml renders a player reveal without throwing", () => {
  const result = {
    kind: "player",
    outcome: "new",
    ovr: 88,
    rarity: "全明星",
    banner: { name: "常驻池" },
    player: { id: "x-2020", name: "Test Player", season: 2020, pos: "SG", skills: [] },
  };
  let html;
  assert.doesNotThrow(() => { html = drawRevealHtml(result, view); });
  assert.match(html, /Test Player/);
  assert.match(html, /新卡入账/);
});
