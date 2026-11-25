import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esc } from "../js/core/html.js";
import { marketOwnedCard } from "../js/ui/marketCards.js";

// Regression (B120, 2026-11-24): esc audit batch 4 — the low-risk app.js
// group of the 2026-11-19 audit. The 47 low-risk sites are names from
// roster.json / static tables / validated career data (no user-input path),
// but they still reach innerHTML, so this batch wraps them in esc() as
// defense in depth on top of the load gate (Wibey 519df336) and the
// medium-risk batches (B118 live-match, B119 season/market/trade).
//
// Fixed here (15 app.js sites): familyDuelCardRow, renderPack tips
// (INTANGIBLE_DEFS fallback name), renderPosBoard (both label branches),
// lineupChemistryPreviewHtml boost line, rollLegendTeam tips + pool button,
// the skill-manage chip body, fillTempoSelect / fillBallActionSelect /
// wireTakeoverPanel focus select / initFocusAndPacksUI focus select option
// labels, the live-pack button name, syncSeasonPickCap chips and the
// renderSeasonOfferPack row. Plus marketOwnedCard tips + tag chips
// (marketCards.js) and the sandbox hand-written team-name input, which now
// strips `<>` at the read point (the audit's input-side note).
//
// Re-verified safe, not changed: renderRoster coach/assistant lines,
// rollLegendTeam "已选" line, syncTakeoverPanel status, syncDefendHint,
// openMarket tier line and renderSeasonOfferPack franchise line all go
// through textContent; poolRoleLine labels come only from static role /
// archetype tables; orderSelectHtml, fillTacticSelect and the pick-swap
// section were already esc()d by later work; the bid card (B119) and the
// setup-mini card (B116) were already esc()d; tournament slot / bracket /
// champion names are generated literals (`玩家 ${i + 1}` / `轮空 AI ${i + 1}`);
// the bracket-log label comes from the static careerStageLabel table; the
// setup pack-preview button from the audit is gone (B116 redesign).
const appSrc = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const mcSrc = readFileSync(new URL("../js/ui/marketCards.js", import.meta.url), "utf8");
const sbSrc = readFileSync(new URL("../js/ui/sandboxView.js", import.meta.url), "utf8");

function body(src, fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  assert.ok(start >= 0, `function ${fnName} not found`);
  const paramsClose = src.indexOf(") {", start);
  assert.ok(paramsClose >= 0, `function ${fnName} has no ") {"`);
  const openIdx = paramsClose + 1;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${fnName}`);
}

const BAD = '<img src=x onerror=alert(1)>';

function assertEscaped(html, label) {
  assert.ok(!html.includes(BAD), `${label}: raw crafted name must not appear`);
  assert.ok(html.includes("&lt;img"), `${label}: crafted name must be escaped`);
}

test("familyDuelCardRow escapes the roster player name", () => {
  const fnSrc = body(appSrc, "familyDuelCardRow");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in familyDuelCardRow");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "familyDuelCardRow must esc the player name");
});

test("renderPack tips escape the intangible name (INTANGIBLE_DEFS fallback)", () => {
  const fnSrc = body(appSrc, "renderPack");
  assert.ok(/esc\(t\.name\)/.test(fnSrc), "renderPack tips must esc the intangible name");
  assert.ok(!/\$\{t\.name\}/.test(fnSrc), "no raw ${t.name} may remain in renderPack tips");
});

test("renderPosBoard escapes the player name in both label branches", () => {
  const fnSrc = body(appSrc, "renderPosBoard");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in renderPosBoard");
  assert.equal((fnSrc.match(/esc\(p\.name\)/g) || []).length, 2, "both label branches must esc the name");
});

test("lineupChemistryPreviewHtml escapes the boost player name", () => {
  const fnSrc = body(appSrc, "lineupChemistryPreviewHtml");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "boost line must esc the player name");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in the boost line");
});

test("rollLegendTeam escapes the tips name and the pool button name", () => {
  const fnSrc = body(appSrc, "rollLegendTeam");
  assert.ok(/esc\(t\.name\)/.test(fnSrc), "legend tips must esc the intangible name");
  assert.ok(!/\$\{t\.name\}/.test(fnSrc), "no raw ${t.name} may remain in legend tips");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "legend pool button must esc the player name");
  // The one remaining raw ${p.name} is the #legend-picked textContent
  // assignment, which never parses HTML — pin it so a future innerHTML use
  // of the same name gets caught.
  assert.equal((fnSrc.match(/\$\{p\.name\}/g) || []).length, 1, "exactly one raw ${p.name} may remain");
  const idx = fnSrc.indexOf("${p.name}");
  assert.ok(fnSrc.slice(Math.max(0, idx - 120), idx).includes("textContent"), "the remaining raw ${p.name} must belong to the textContent assignment");
});

test("paintSkillManageBlock skill-chip body escapes the skill name", () => {
  const fnSrc = body(appSrc, "paintSkillManageBlock");
  assert.ok(/>\$\{esc\(s\.name\)\}<\/span>/.test(fnSrc), "skill-chip body must esc the skill name");
  assert.ok(!/>\$\{s\.name\}<\/span>/.test(fnSrc), "no raw ${s.name} may remain in the skill-chip body");
});

test("fillTempoSelect escapes the plan label", () => {
  const fnSrc = body(appSrc, "fillTempoSelect");
  assert.ok(/esc\(lbl\.name\)/.test(fnSrc), "tempo option must esc the plan label");
  assert.ok(!/\$\{lbl\.name\}/.test(fnSrc), "no raw ${lbl.name} may remain in fillTempoSelect");
});

test("fillBallActionSelect escapes the ball-action name", () => {
  const fnSrc = body(appSrc, "fillBallActionSelect");
  assert.ok(/esc\(a\.name\)/.test(fnSrc), "ball-action option must esc the action name");
  assert.ok(!/\$\{a\.name\}/.test(fnSrc), "no raw ${a.name} may remain in fillBallActionSelect");
});

test("wireTakeoverPanel focus select escapes the plan label", () => {
  const fnSrc = body(appSrc, "wireTakeoverPanel");
  assert.ok(/esc\(lbl\.name\)/.test(fnSrc), "takeover focus option must esc the plan label");
  assert.ok(!/\$\{lbl\.name\}/.test(fnSrc), "no raw ${lbl.name} may remain in wireTakeoverPanel");
});

test("initFocusAndPacksUI escapes the focus label and the live-pack name", () => {
  const fnSrc = body(appSrc, "initFocusAndPacksUI");
  assert.ok(/esc\(lbl\.name\)/.test(fnSrc), "focus option must esc the plan label");
  assert.ok(!/\$\{lbl\.name\}/.test(fnSrc), "no raw ${lbl.name} may remain in initFocusAndPacksUI");
  assert.ok(/esc\(d\.name\)/.test(fnSrc), "live-pack button must esc the pack name");
  assert.ok(!/\$\{d\.name\}/.test(fnSrc), "no raw ${d.name} may remain in initFocusAndPacksUI");
});

test("syncSeasonPickCap chips escape the player name", () => {
  const fnSrc = body(appSrc, "syncSeasonPickCap");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "season-pick chip must esc the player name");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in syncSeasonPickCap");
});

test("renderSeasonOfferPack escapes the player name", () => {
  const fnSrc = body(appSrc, "renderSeasonOfferPack");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "season offer row must esc the player name");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} may remain in renderSeasonOfferPack");
});

test("sandboxView strips <> from the hand-written team name at the read point", () => {
  const line = sbSrc.split("\n").find((l) => l.includes("buildSandboxTeam(") && l.includes("data-name"));
  assert.ok(line, "sandbox buildSandboxTeam call line not found");
  assert.ok(/\.replace\(\/\[<>\]\/g, ""\)/.test(line), "hand-written team name must strip <> before buildSandboxTeam");
});

test("marketOwnedCard: crafted name, intangible fallback name and tag come out escaped", () => {
  // The intangible key has no INTANGIBLE_DEFS entry, so topIntangibles falls
  // back to the raw key as the display name — exactly the fallback this
  // batch closes. The tag rides the same card's chip row.
  const crafted = {
    id: "x1",
    name: BAD,
    season: 1996,
    pos: "PG",
    scoring: 80,
    defense: 80,
    pass: 80,
    rebound: 50,
    steal: 50,
    block: 50,
    speed: 80,
    strength: 60,
    injuredGames: 0,
    tags: [BAD],
    intangibles: { [BAD]: 99 },
  };
  const html = marketOwnedCard(crafted, true);
  assertEscaped(html, "marketOwnedCard");
});

test("marketCards source: no raw intangible-name or tag interpolation remains", () => {
  assert.ok(!/\$\{t\.name\}/.test(mcSrc), "no raw ${t.name} may remain in marketCards tips");
  assert.ok(/esc\(t\.name\)/.test(mcSrc), "marketCards tips must esc the intangible name");
  assert.ok(!/chip warn">\$\{t\}</.test(mcSrc), "no raw ${t} may remain in marketCards tag chips");
  assert.ok(/chip warn">\$\{esc\(t\)\}</.test(mcSrc), "marketCards tag chips must esc the tag");
});
