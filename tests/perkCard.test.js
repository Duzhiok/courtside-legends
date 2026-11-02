import test from "node:test";
import assert from "node:assert/strict";
import { COACH_PERK_LINES, COACH_PERK_MAX_LEVEL } from "../js/career/balance.js";
import { createCoachProfile, xpToNextLevel } from "../js/career/coachProfile.js";
import { perkCardHtml, perkModel } from "../js/ui/timeTravel/perkCard.js";

const CJK = /[\u3400-\u9fff]/;
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const rootWith = (coach) => ({ coach: createCoachProfile(coach) });

test("perkModel: level, XP bar and all four lines; nothing to spend means nothing clickable", () => {
  const model = perkModel(rootWith({ level: 2, xp: 50 }));
  assert.deepEqual([model.level, model.xp, model.next, model.perkPoints], [2, 50, xpToNextLevel(2), 0]);
  assert.equal(model.progress, 50 / xpToNextLevel(2));
  assert.deepEqual(model.lines.map((line) => line.id), COACH_PERK_LINES);
  assert.ok(model.lines.every((line) => !line.canSpend && line.level === 0 && line.now === "" && line.next));
});

test("perkModel: a point to spend unlocks every line that isn't maxed", () => {
  const model = perkModel(rootWith({ perkPoints: 1, perks: { tactics: COACH_PERK_MAX_LEVEL, development: 1, negotiation: 0, media: 0 } }));
  const byId = Object.fromEntries(model.lines.map((line) => [line.id, line]));
  assert.equal(byId.tactics.canSpend, false, "maxed");
  assert.equal(byId.tactics.next, "");
  assert.equal(byId.development.canSpend, true);
  assert.match(byId.development.now, /10%/);
  assert.match(byId.development.next, /20%/);
});

test("perkModel: an old save with no coach reads as a fresh level-1 coach", () => {
  const model = perkModel({});
  assert.equal(model.level, 1);
  assert.equal(model.perkPoints, 0);
});

test("perkCardHtml: buttons carry the line id, only spendable ones are enabled, English has no Chinese", () => {
  const root = rootWith({ perkPoints: 2, perks: { tactics: 3, development: 0, negotiation: 0, media: 0 } });
  const html = perkCardHtml(perkModel(root, "zh"), "zh");
  assert.equal((html.match(/data-perk="/g) || []).length, COACH_PERK_LINES.length);
  assert.match(html, /data-perk="tactics" data-state="owned" disabled/);
  assert.match(html, /data-perk="media" data-state="ready">/);
  assert.match(visible(html), /2 点天赋点可分配/);
  assert.match(visible(html), /战术大师/);
  const en = visible(perkCardHtml(perkModel(root, "en"), "en"));
  assert.doesNotMatch(en, CJK);
  assert.match(en, /Tactician/);
  assert.match(en, /Maxed/);
});
