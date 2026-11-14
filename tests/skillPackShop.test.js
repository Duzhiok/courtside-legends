// Gold Challenge skill packs restored (route 2 of the S0 removal). The fragment
// shop stays removed; this shop spends only the run's own gold.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import { rosterCards } from "../js/reborn/season.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";
import { buySkillOffer } from "../js/engine/skillShopPurchase.js";
import {
  MAX_SKILL_SLOTS,
  SKILL_PACKS,
  SKILL_SELL_RATE,
  grantSkillToPlayer,
  listBuyableSkillPacks,
  markPurchasedSkill,
  meetsHardGates,
  purchasedSkillsRefund,
  removableSkills,
  removeSkillFromPlayer,
  rollSkillShopOffers,
  skillSlotsFull,
} from "../js/data/skills.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const careerWith = (gold, offers) => ({ kind: "career", gold, skillShop: offers.map((o) => ({ ...o })), skillInventory: [] });

test("the shelf only offers learnable packs (no duo / exclusive / negative), unique, priced", () => {
  const buyable = new Set(listBuyableSkillPacks().map((s) => s.id));
  assert.ok(buyable.size > 20);
  for (const id of buyable) assert.ok(!SKILL_PACKS[id].duo && !SKILL_PACKS[id].exclusive && !SKILL_PACKS[id].negative);
  const offers = rollSkillShopOffers(6, []);
  assert.equal(new Set(offers.map((o) => o.id)).size, offers.length);
  assert.ok(offers.length >= 1 && offers.every((o) => buyable.has(o.id) && o.cost > 0 && o.name && o.desc));
  const again = rollSkillShopOffers(6, offers.map((o) => o.id));
  assert.ok(again.some((o) => !offers.some((x) => x.id === o.id)), "a refresh avoids the last shelf");
});

test("buying spends the run's gold, moves the pack into the inventory, off the shelf", () => {
  const [a, b] = rollSkillShopOffers(2, []);
  const career = careerWith(a.cost + 7, [a, b]);
  const res = buySkillOffer(career, a.id);
  assert.equal(res.ok, true);
  assert.equal(career.gold, 7);
  assert.deepEqual(career.skillInventory.map((x) => [x.id, x.cost]), [[a.id, a.cost]]);
  assert.deepEqual(career.skillShop.map((x) => x.id), [b.id]);
  assert.equal(buySkillOffer(career, a.id).reason, "not-on-shelf", "no double buy");
});

test("buying refuses when short, when gone, or when not purchasable; nothing is spent", () => {
  const [a] = rollSkillShopOffers(1, []);
  const poor = careerWith(a.cost - 1, [a]);
  assert.equal(buySkillOffer(poor, a.id).reason, "short");
  assert.equal(poor.gold, a.cost - 1);
  assert.equal(poor.skillInventory.length, 0);
  assert.equal(buySkillOffer(careerWith(999, []), "iron_lungs").reason, "not-on-shelf");
  const duoId = Object.values(SKILL_PACKS).find((s) => s.duo).id;
  const duo = careerWith(999, [{ id: duoId, name: "x", cost: 10 }]);
  assert.equal(buySkillOffer(duo, duoId).reason, "not-purchasable");
  assert.equal(duo.gold, 999);
  assert.equal(buySkillOffer({ kind: "league", gold: 999 }, "x").reason, "no-career");
});

test("hard gates: team-limited, curated-only and height-gated packs cannot go on the wrong player", () => {
  const short = { id: "s", team: "LAL", heightCm: 190, skills: [] };
  const tall = { id: "t", team: "LAL", heightCm: 221, skills: [] };
  assert.equal(meetsHardGates(short, "high_tower"), false, "bought skills do not bypass the height gate");
  assert.equal(meetsHardGates(tall, "high_tower"), true);
  assert.equal(meetsHardGates({ ...tall, team: "MIN" }, "wolf_king"), true);
  assert.equal(meetsHardGates(tall, "wolf_king"), false);
  assert.equal(meetsHardGates(short, "iron_lungs"), true, "an ordinary pack fits anyone");
  assert.equal(meetsHardGates(short, "no_such_skill"), false);
});

test("install -> mark purchased -> uninstall returns it with its price; selling refunds ~55%", () => {
  const p = { id: "p", skills: [] };
  assert.equal(grantSkillToPlayer(p, "iron_lungs"), true);
  assert.equal(grantSkillToPlayer(p, "iron_lungs"), false, "no duplicate install");
  markPurchasedSkill(p, "iron_lungs", 400);
  assert.deepEqual(removableSkills(p), ["iron_lungs"]);
  const refund = purchasedSkillsRefund(p);
  assert.equal(refund.gold, Math.round(400 * SKILL_SELL_RATE));
  const out = removeSkillFromPlayer(p, "iron_lungs");
  assert.equal(out.ok, true);
  assert.equal(out.returnToInv.cost, 400);
  assert.equal(p.skills.includes("iron_lungs"), false);
  assert.equal(purchasedSkillsRefund(p).gold, 0, "nothing to refund once uninstalled");
});

test("slots: a full card must drop a removable skill before taking a new one", () => {
  const ids = Object.values(SKILL_PACKS).filter((s) => !s.duo && !s.exclusive && !s.negative).slice(0, MAX_SKILL_SLOTS).map((s) => s.id);
  const p = { id: "p", skills: [] };
  for (const id of ids) grantSkillToPlayer(p, id);
  assert.equal(skillSlotsFull(p), true);
  assert.deepEqual(removableSkills(p), [], "innate skills are not removable");
  markPurchasedSkill(p, ids[0], 300);
  assert.deepEqual(removableSkills(p), [ids[0]]);
});

test("old saves: a player with skills but no purchase fields still reads, refunds 0, keeps skills", () => {
  const old = { id: "old", skills: ["iron_lungs", "thief"] };
  assert.deepEqual(removableSkills(old), []);
  assert.equal(purchasedSkillsRefund(old).gold, 0);
  assert.equal(removeSkillFromPlayer(old, "thief").ok, false);
  assert.deepEqual(old.skills, ["iron_lungs", "thief"]);
  const oldCareer = { kind: "career", gold: 100 };
  assert.equal(buySkillOffer(oldCareer, "iron_lungs").reason, "not-on-shelf", "no skillShop / inventory fields is fine");
});

function simScore(seed, skill) {
  const home = rosterCards(ROWS, "LAL", 1997).map((p) => ({ ...p, skills: skill ? [...(p.skills || []), skill] : [...(p.skills || [])] }));
  const away = rosterCards(ROWS, "CHI", 1997);
  const sim = new GameSim({
    home: { name: "LAL", players: home, starterIds: home.slice(0, 5).map((p) => p.id) },
    away: { name: "CHI", players: away, starterIds: away.slice(0, 5).map((p) => p.id) },
    youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(String(seed))),
    onEvent: () => {}, onTick: () => {}, onEnd: () => {},
  });
  sim.autoOffense = sim.autoDefense = sim.autoRotation = true;
  sim._quiet = true; sim.running = true; sim.paused = false;
  for (let g = 0; sim.running && g < 8000; g += 1) sim.step();
  return `${sim.score.home}-${sim.score.away}`;
}

test("a purchased pack is read by the real GameSim (same seed, with vs without)", () => {
  for (const skill of ["iron_lungs", "thief"]) {
    const changed = [1, 2, 3].filter((seed) => simScore(seed, skill) !== simScore(seed, null)).length;
    assert.ok(changed >= 2, `${skill} changed ${changed}/3 seeded games`);
  }
  assert.equal(simScore(1, null), simScore(1, null), "baseline is deterministic");
});
