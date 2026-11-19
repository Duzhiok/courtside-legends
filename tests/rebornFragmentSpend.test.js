/**
 * Career 2.0 decision 4, the redemption half: what career fragments buy besides intensive training.
 * - specialisation: one week's training levels go into the attributes of a skill the player HAS; no extra levels,
 *   no ceiling change, so it steers growth without adding any;
 * - the legacy jersey: the player's own season jersey, a cosmetic story jersey (never sold), one per season;
 * - the season rollover clears last season's weekly purchases (week numbers restart) and keeps the balance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEGACY_COST,
  SPECIALIZE_COST,
  activeSpecialty,
  buyIntensive,
  buyLegacyJersey,
  buySpecialization,
  fragmentLedger,
  intensiveMultiplier,
  legacyBlocker,
  specializableSkills,
  specializeBlocker,
} from "../js/reborn/fragments.js";
import { awardGrowth } from "../js/career/playerGrowth.js";
import { GROWTH_XP_PER_LEVEL } from "../js/career/balance.js";
import { chooseFocus, trainingPlan } from "../js/reborn/training.js";
import { rolloverSeason } from "../js/reborn/contract.js";
import { createRebornState } from "../js/reborn/identity.js";
import { isForSale } from "../js/collectibles/jerseyCatalog.js";
import { getJerseyProvenance, listOwnedJerseys, mirrorJerseysToAccount } from "../js/collectibles/jerseyCollection.js";
import { jerseyState } from "../js/collectibles/jerseyExchange.js";
import { jerseyCollectionHtml } from "../js/ui/collectibles/jerseyCollectionView.js";
import { fragmentsPanelHtml } from "../js/ui/reborn/fragmentsView.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const withFragments = (reborn, balance) => ({ ...reborn, player: { ...reborn.player, fragments: { balance, history: [] } } });
const revealed = (reborn, yes = true) => ({ ...reborn, identity: { ...reborn.identity, kind: "historical", revealed: yes } });
// rainmaker = shooter family, glass_cleaner = rebounder family, clutch_killer belongs to no awakening family
const CARD = { skills: ["rainmaker", "glass_cleaner", "clutch_killer"] };

test("only skills the card HAS, and only those of an awakening family, can be specialised", () => {
  const list = specializableSkills(CARD);
  assert.deepEqual(list.map((s) => s.skillId), ["rainmaker", "glass_cleaner"]);
  assert.deepEqual(list[0].attributes, ["three"]);
  assert.deepEqual(list[1].attributes, ["rebound", "strength"]);
  assert.deepEqual(specializableSkills({ skills: [] }), []);
  assert.deepEqual(specializableSkills(null), []);
});

test("specialisation: needs this week's focus, a skill he has and the fragments; once per week; one week only", () => {
  const base = withFragments(createRebornState("spec-1", ROWS), SPECIALIZE_COST + 3);
  assert.equal(specializeBlocker(base, 1, CARD, "rainmaker"), "no-focus");
  const focused = chooseFocus(base, "defense", 1);
  assert.equal(specializeBlocker(focused, 1, CARD, "clutch_killer"), "not-owned", "no family, nothing to deepen");
  assert.equal(specializeBlocker(focused, 1, CARD, "block_artist"), "not-owned", "a skill he doesn't have");
  assert.equal(specializeBlocker(withFragments(focused, SPECIALIZE_COST - 1), 1, CARD, "rainmaker"), "short");

  const bought = buySpecialization(focused, 1, CARD, "rainmaker");
  assert.equal(fragmentLedger(bought).balance, 3);
  assert.equal(fragmentLedger(focused).balance, SPECIALIZE_COST + 3, "input untouched");
  assert.equal(specializeBlocker(bought, 1, CARD, "glass_cleaner"), "already");
  assert.equal(activeSpecialty(bought, 1), "rainmaker");
  assert.deepEqual(trainingPlan(bought, 1)[bought.identity.bref], { focus: "defense", attributes: ["three"] });
  // the focus stays on next week until it is picked again; the specialisation does not
  assert.equal(activeSpecialty(bought, 2), null);
  assert.deepEqual(trainingPlan(bought, 2)[bought.identity.bref], { focus: "defense" });
  assert.deepEqual(trainingPlan(bought)[bought.identity.bref], { focus: "defense" }, "no week given, no specialisation");
});

test("a specialised week levels only the skill's attributes, and exactly as many levels as the plain focus would", () => {
  const player = { id: "p1", bref: "testpl01", season: 1997, age: 22, three: 60, mid: 60, scoring: 60, pass: 60, defense: 60, steal: 60, block: 60 };
  // banked XP worth several levels, so one game crosses more than one (the season's level cap still applies)
  const growth = { testpl01: { year: 1997, xp: GROWTH_XP_PER_LEVEL * 5, levels: 0, deltas: {} } };
  const run = (plan) => awardGrowth({ growth, plans: { testpl01: plan }, year: 1997, players: [player], lines: [{ id: "p1", min: 48, score: 40 }] });
  const plain = run({ focus: "shooting" }).growth.testpl01;
  const special = run({ focus: "shooting", attributes: ["three"] }).growth.testpl01;
  assert.ok(plain.levels > 1, "the game earns several levels, so the comparison means something");
  assert.equal(special.levels, plain.levels, "same level count: it steers growth, it adds none");
  assert.deepEqual(Object.keys(special.deltas), ["three"]);
  assert.ok(Object.keys(plain.deltas).length > 1, "the plain focus spreads over its trio");
  // the ceiling still binds: a three already at its ceiling takes nothing more
  const capped = awardGrowth({ growth, plans: { testpl01: { attributes: ["three"] } }, year: 1997, players: [{ ...player, three: 99 }], lines: [{ id: "p1", min: 48, score: 40 }] });
  assert.equal(capped.growth.testpl01.levels, 0);
});

test("legacy jersey: identity known, enough fragments, one per season; a story jersey the shop never sells", () => {
  const base = withFragments(createRebornState("legacy-1", ROWS), LEGACY_COST + 1);
  assert.equal(legacyBlocker(revealed(base, false), 1997), "unrevealed", "the name is printed on it: no spoiler");
  assert.equal(legacyBlocker(withFragments(revealed(base), LEGACY_COST - 1), 1997), "short");
  assert.equal(legacyBlocker(revealed(base), null), "no-season");

  const known = revealed(base);
  const { reborn, jersey } = buyLegacyJersey(known, 1997, { week: 6 });
  assert.equal(jersey.id, `legacy:${known.identity.bref}:1997`);
  assert.equal(jersey.source, "legacy");
  assert.equal(jersey.template.releaseLevel, "story");
  assert.equal(isForSale(jersey.template), false);
  assert.equal(jersey.template.number, null, "no number is invented");
  assert.equal(fragmentLedger(reborn).balance, 1);
  assert.equal(jerseyState(known).collection.length, 0, "input untouched");
  assert.equal(legacyBlocker(withFragments(reborn, 99), 1997), "already");
  assert.throws(() => buyLegacyJersey(withFragments(reborn, 99), 1997), /already/);
  assert.equal(legacyBlocker(withFragments(reborn, 99), 1998), null, "next season has its own");
});

test("the legacy jersey reaches the account collection once, labelled as legacy with its story", () => {
  const known = revealed(withFragments(createRebornState("legacy-2", ROWS), LEGACY_COST));
  const { reborn, jersey } = buyLegacyJersey(known, 1997);
  const account = { shop: { owned: {}, equippedJersey: null } };
  assert.equal(mirrorJerseysToAccount(account, jerseyState(reborn)), 1);
  assert.equal(mirrorJerseysToAccount(account, jerseyState(reborn)), 0, "idempotent");
  const owned = listOwnedJerseys(account);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].source, "legacy");
  const story = getJerseyProvenance(account, jersey.id);
  assert.equal(story.source, "legacy");
  assert.equal(story.cost, LEGACY_COST);
  const html = jerseyCollectionHtml({ list: owned, equipped: null }, "zh");
  assert.match(html, /传承球衣/);
  assert.match(html, new RegExp(`用 ${LEGACY_COST} 个职业碎片兑换`));
  assert.doesNotMatch(html, /交换/, "not described as a swap");
});

test("season rollover: last season's weekly buys don't carry into the same week numbers, the balance does", () => {
  const focused = chooseFocus(withFragments(createRebornState("roll-1", ROWS), 9), "shooting", 5);
  const spent = buySpecialization(buyIntensive(focused, 5), 5, CARD, "rainmaker");
  const next = rolloverSeason(spent, { year: 1997 }).reborn;
  assert.equal(fragmentLedger(next).balance, 9 - 3 - SPECIALIZE_COST);
  const week5 = chooseFocus(next, "shooting", 5);
  assert.equal(intensiveMultiplier(week5, 5), 1, "no free intensive week");
  assert.equal(activeSpecialty(week5, 5), null, "no free specialisation");
});

test("the panel offers the specialisation for owned family skills and the legacy jersey with its blocker", () => {
  const reborn = chooseFocus(withFragments(revealed(createRebornState("panel-1", ROWS), false), 4), "shooting", 1);
  const html = fragmentsPanelHtml({ reborn, week: 1, card: CARD, year: 1997, lang: "zh" });
  assert.match(html, /data-specialize="rainmaker"/);
  assert.match(html, /data-specialize="glass_cleaner"/);
  assert.doesNotMatch(html, /data-specialize="clutch_killer"/);
  assert.match(html, /data-buy-legacy disabled/);
  assert.match(html, /真实身份揭晓后才能兑换/);
  const en = fragmentsPanelHtml({ reborn, week: 1, card: { skills: [] }, year: 1997, lang: "en" });
  assert.doesNotMatch(en, /data-specialize/, "no family skill, no specialisation block");
  assert.doesNotMatch(en, /[\u4e00-\u9fff]/, "English mode has no Chinese left");
});
