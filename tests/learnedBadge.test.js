import assert from "node:assert/strict";
import test from "node:test";
import { MAX_EPIPHANY } from "../js/engine/epiphany.js";
import { SKILL_PACKS } from "../js/data/skills.js";
import { setLang } from "../js/i18n.js";
import { learnedBadgeHtml, learnedLineHtml, learnedSkillIds } from "../js/ui/learnedBadge.js";
import { buildRosterEvaluation, renderRosterEvaluation } from "../js/ui/rosterEvaluationView.js";

const CJK = /[\u4e00-\u9fff]/;
const SKILL = Object.keys(SKILL_PACKS)[0];
const strip = (html) => html.replace(/title="[^"]*"/g, "");

test("learnedSkillIds reads the epiphany ledger and drops junk", () => {
  assert.deepEqual(learnedSkillIds({ x: { learned: [SKILL, "", 7, null] } }, "x"), [SKILL]);
  assert.deepEqual(learnedSkillIds({}, "x"), []);
  assert.deepEqual(learnedSkillIds({ x: { learned: "nope" } }, "x"), []);
  assert.deepEqual(learnedSkillIds(undefined, "x"), []);
});

test("learned badge: nothing until he learns something, then n/max with the skill names", () => {
  assert.equal(learnedBadgeHtml([], "zh"), "");
  assert.equal(learnedLineHtml([], "zh"), "");
  const badge = learnedBadgeHtml([SKILL], "zh");
  assert.match(badge, new RegExp(`已领悟 1/${MAX_EPIPHANY}`));
  assert.match(badge, /✦/);
  assert.match(learnedBadgeHtml([SKILL], "en"), new RegExp(`Learned 1/${MAX_EPIPHANY}`));
  assert.ok(!CJK.test(strip(learnedBadgeHtml([SKILL], "en"))), "English badge text is English");
  assert.match(learnedLineHtml([SKILL], "zh"), /场上领悟/);
});

// ---- the roster evaluation page: the same badge, reconciled against the ledger player by player
const ledger = { learner: { learned: [SKILL] }, nobody: { learned: [] } };
const players = [
  { id: "a", bref: "learner", name: "Has Learned", season: 1994 },
  { id: "b", bref: "nobody", name: "Learned Nothing", season: 1994 },
  { id: "c", bref: "absent", name: "Not In Ledger", season: 1994 },
];
const evaluate = () => buildRosterEvaluation(players, {}, { teamId: "T", learnedOf: (p) => learnedSkillIds(ledger, p.bref) });
const cardOf = (html, id) => html.split("<article").find((chunk) => chunk.includes(`data-player-id="${id}"`)) || "";
const render = () => { const box = { innerHTML: "" }; renderRosterEvaluation(box, evaluate()); return box.innerHTML; };

test("evaluation rows carry the learned skills, and [] for players the ledger doesn't know", () => {
  const byId = Object.fromEntries(evaluate().map((r) => [r.id, r.learned]));
  assert.deepEqual(byId, { a: [SKILL], b: [], c: [] });
  assert.deepEqual(buildRosterEvaluation(players, {}, {}).map((r) => r.learned), [[], [], []], "no ledger passed: still safe");
});

test("evaluation page: badge + skills line only on the card of the player who learned something", () => {
  setLang("zh");
  const html = render();
  assert.ok(cardOf(html, "a").includes("learned-badge") && cardOf(html, "a").includes("learned-line"));
  assert.ok(!cardOf(html, "b").includes("learned-") && !cardOf(html, "c").includes("learned-"), "no empty badge, no placeholder line");
  assert.equal((html.match(/class="learned-badge"/g) || []).length, 1);
});

test("evaluation page badge follows the language switch", () => {
  setLang("en");
  try {
    const card = cardOf(render(), "a");
    assert.match(card, new RegExp(`Learned 1/${MAX_EPIPHANY}`));
    assert.match(card, /Learned in play:/);
  } finally {
    setLang("zh");
  }
});
