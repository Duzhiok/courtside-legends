/**
 * Signature Awakening progress panel — English ability labels.
 * Regression (B146 follow-up ①, 2026-11-25): awakeningProgressHtml rendered
 * the raw Chinese abilityLabel (盖帽/篮板/传球/关键球) in both languages,
 * while progressFor already computed abilityLabelEn (Block/Rebound/Pass/
 * Clutch) with no consumer. The English panel must show the English labels
 * and no Chinese ability text; the Chinese panel must keep the Chinese ones.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createAwakeningState } from "../js/career/player/signatureAwakening.js";
import { awakeningProgressHtml } from "../js/ui/awakeningView.js";

/** Bench big, mirroring the BIG fixture in signatureAwakening.test.js. */
const BIG = {
  id: "big1",
  bref: "big01",
  skills: [],
  block: 72,
  rebound: 70,
  pass: 45,
  clutch: 50,
  speed: 60,
  stamina: 70,
  steal: 40,
  age: 22,
  heightCm: 208,
};

const EN_LABELS = ["Block 72 / 68", "Rebound 70 / 60", "Pass 45 / 60", "Clutch 50 / 55"];
const ZH_LABELS = ["盖帽 72 / 68", "篮板 70 / 60", "传球 45 / 60", "关键球 50 / 55"];

test("awakening progress panel shows English ability labels in English mode", () => {
  const html = awakeningProgressHtml({
    awakening: createAwakeningState(1997),
    card: BIG,
    lang: "en",
  });
  for (const label of EN_LABELS) assert.ok(html.includes(label), `en panel must show ${label}`);
  for (const label of ZH_LABELS) assert.ok(!html.includes(label), `en panel must not show ${label}`);
  assert.ok(!html.includes("天赋达标") && !html.includes("天赋未达标"), "en panel must not show Chinese ability status");
});

test("awakening progress panel keeps Chinese ability labels in Chinese mode", () => {
  const html = awakeningProgressHtml({
    awakening: createAwakeningState(1997),
    card: BIG,
    lang: "zh",
  });
  for (const label of ZH_LABELS) assert.ok(html.includes(label), `zh panel must show ${label}`);
  for (const label of EN_LABELS) assert.ok(!html.includes(label), `zh panel must not show ${label}`);
});

test("'Skills held' names every skill in English in English mode (a pack carries only the Chinese name)", () => {
  const card = { ...BIG, skills: ["glove", "iron_lungs", "dream_shake"] }; // an awakened move is merged onto the card
  const state = { ...createAwakeningState(1997), awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }] };
  const en = awakeningProgressHtml({ awakening: state, card, lang: "en" });
  const held = en.slice(en.indexOf("Skills held"));
  assert.match(held, /Dream Shake/, "the awakened move is named in English");
  assert.ok(!/[\u4e00-\u9fff]/.test(held), `no Chinese in the English held list: ${held.replace(/<[^>]+>/g, " ").slice(0, 160)}`);
  assert.match(awakeningProgressHtml({ awakening: state, card, lang: "zh" }), /梦幻脚步/);
});
