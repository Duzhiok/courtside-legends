// Player Cards v2 (Workstream A): one reusable layered template — portrait-first face,
// OVR badge, rarity frame per tier, shine only on myth + legend, visuals only (the
// template displays the OVR it is given and never recomputes it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playerCardHtml, playerCardFaceHtml, rarityFrameClass, rarityLabel, careerPhaseLabelL } from "../js/ui/playerCard.js";
import { playerLegacyBadge } from "../js/data/playerLegacy.js";

const CJK = /[\u4e00-\u9fff]/;
const jordan = { id: "jordami01-1996", bref: "jordami01", name: "Michael Jordan", nameEn: "Michael Jordan", season: 1996, team: "CHI", teamLabel: "Chicago Bulls", pos: "SG", hiddenTier: "hof" };
const plain = { id: "doejo01-2020", bref: "doejo01", name: "John Doe", nameEn: "John Doe", season: 2020, team: "DAL", teamLabel: "Dallas Mavericks", pos: "PF" };

test("rarityFrameClass maps every tier to a distinct frame, and a tier-less card gets none", () => {
  assert.equal(rarityFrameClass({ cls: "myth" }), "rarity-myth");
  assert.equal(rarityFrameClass({ cls: "legend" }), "rarity-legend");
  assert.equal(rarityFrameClass({ cls: "super" }), "rarity-super");
  assert.equal(rarityFrameClass({ cls: "allstar" }), "rarity-allstar");
  assert.equal(rarityFrameClass({ cls: "star" }), "rarity-star");
  assert.equal(rarityFrameClass({ cls: "goto" }), "rarity-goto");
  assert.equal(rarityFrameClass({ cls: "" }), "");
  assert.equal(rarityFrameClass(null), "");
});

test("face: portrait dominates (card-portrait img), name + rarity tag + season · team · pos are readable at a glance", () => {
  const html = playerCardFaceHtml(jordan, { ovr: 97, lang: "zh" });
  assert.match(html, /<img[^>]*class="[^"]*card-portrait[^"]*"/, "portrait img carries the card-portrait class");
  assert.match(html, /Michael Jordan/);
  assert.match(html, /<span class="rarity-tag legend">传奇<\/span>/);
  assert.match(html, /1996 · Chicago Bulls · SG/);
  assert.match(html, /<div class="card-ovr"><span>OVR<\/span><strong>97<\/strong><\/div>/, "OVR badge shows the given OVR");
  const en = playerCardFaceHtml(jordan, { ovr: 97, lang: "en" });
  assert.match(en, /<span class="rarity-tag legend">Legendary<\/span>/);
  assert.doesNotMatch(en, CJK, "no Chinese residue on the English face");
});

test("face displays the OVR it is given and never recomputes it (visuals only)", () => {
  // Jordan's real OVR is 97; pass 88 and the badge must show 88 — the template owns no gameplay numbers.
  const html = playerCardFaceHtml(jordan, { ovr: 88, lang: "zh" });
  assert.match(html, /<strong>88<\/strong>/);
  assert.doesNotMatch(html, /<strong>97<\/strong>/);
  assert.equal(rarityLabel(playerLegacyBadge(jordan, 88), "en"), "Legendary", "identity tier is unchanged by the displayed OVR");
});

test("full card: rarity frame per tier, legend-season keeps its team gradient, foot only when given", () => {
  const legend = playerCardHtml(jordan, { ovr: 97, lang: "zh" });
  assert.match(legend, /class="player-card card-v2 rarity-legend legend-season"/);
  assert.match(legend, /style="background: linear-gradient\(135deg, #[0-9A-F]{6}/, "legend-season keeps its team-colour gradient");
  assert.doesNotMatch(legend, /card-foot/, "no foot without extra content (onboarding face-only)");
  const myth = playerCardHtml(plain, { ovr: 100, lang: "zh" });
  assert.match(myth, /class="player-card card-v2 rarity-myth"/);
  assert.doesNotMatch(myth, /legend-season/);
  const sup = playerCardHtml(plain, { ovr: 91, lang: "zh" });
  assert.match(sup, /class="player-card card-v2 rarity-super"/);
  const role = playerCardHtml(plain, { ovr: 75, lang: "zh" });
  assert.match(role, /class="player-card card-v2"/, "tier-less card has no rarity frame class");
  assert.doesNotMatch(role, /class="player-card card-v2 rarity-/);
  const withFoot = playerCardHtml(plain, { ovr: 91, lang: "zh", extra: '<span class="x">foot</span>' });
  assert.match(withFoot, /<div class="card-foot"><span class="x">foot<\/span><\/div>/);
});

test("onboarding usage: button tag + data-pick + selected / view-only states pass through", () => {
  const pick = playerCardHtml(jordan, { ovr: 97, lang: "zh", tag: "button", attrs: 'type="button" data-pick="jordami01-1996"', selected: true });
  assert.match(pick, /^<button class="player-card card-v2 rarity-legend legend-season selected"( style="[^"]*")? type="button" data-pick="jordami01-1996">/);
  assert.match(pick, /<\/button>$/);
  const viewOnly = playerCardHtml(jordan, { ovr: 97, lang: "zh", viewOnly: true });
  assert.match(viewOnly, /class="player-card card-v2 rarity-legend legend-season view-only"/);
});

test("shine is CSS-only and limited to myth + legend frames (never on every card)", () => {
  const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
  const shineRule = css.split("\n").find((line) => line.includes(".card-v2.rarity-myth::after"));
  assert.ok(shineRule, "a shine rule exists for the v2 frames");
  assert.match(shineRule, /rarity-myth/);
  assert.match(shineRule, /rarity-legend/);
  for (const tier of ["rarity-super", "rarity-allstar", "rarity-star", "rarity-goto"]) {
    assert.doesNotMatch(shineRule, new RegExp(tier), `${tier} must not shine`);
  }
  // The one-time sweep is disabled under prefers-reduced-motion.
  const reduced = css.split("@media (prefers-reduced-motion: reduce)").find((block) => block.includes("rarity-myth"));
  assert.ok(reduced, "reduced-motion covers the new shine");
});

test("careerPhaseLabelL localises the five Chinese phase labels; unknown labels pass through", () => {
  assert.equal(careerPhaseLabelL("巅峰期", "en"), "Prime");
  assert.equal(careerPhaseLabelL("巅峰期", "zh"), "巅峰期");
  assert.equal(careerPhaseLabelL("新秀成长期", "en"), "Rising prospect");
  assert.equal(careerPhaseLabelL("生涯末期", "en"), "Late career");
  assert.equal(careerPhaseLabelL("未知期", "en"), "未知期");
  assert.equal(careerPhaseLabelL("", "en"), "");
});
