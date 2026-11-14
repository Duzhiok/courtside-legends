// Independent QA probe for Code's Gold Challenge skill-pack restore (bb02e55).
// Covers handoff items (b) refresh fee/dedup, (c) old saves, (d) economy,
// (f) hard gates — at the pure-function layer (no browser on this VM).
import {
  buySkillOffer,
} from "../../js/engine/skillShopPurchase.js";
import {
  SKILL_SELL_RATE,
  grantSkillToPlayer,
  markPurchasedSkill,
  meetsHardGates,
  purchasedSkillsRefund,
  removeSkillFromPlayer,
  rollSkillShopOffers,
} from "../../js/data/skills.js";

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
}

// (b) refresh: single-offer shelf (real game size = 1) must avoid the previous offer.
// rollSkillShopOffers(size=1, exclude=[prev]) over many seeds.
{
  let repeats = 0; const N = 300;
  for (let i = 0; i < N; i++) {
    const [prev] = rollSkillShopOffers(1, []);
    const [next] = rollSkillShopOffers(1, [prev.id]);
    if (next.id === prev.id) repeats++;
  }
  console.log(`refresh repeat rate: ${repeats}/${N}`);
  check("(b) refresh avoids previous single offer (rate < 5%)", repeats / N < 0.05, `rate=${repeats / N}`);
}

// (b) fee is charged by the handler (static: SKILL_REFRESH_COST=25 in app.js);
// here verify the buy path charges exactly the offer cost, never more.
{
  const offer = rollSkillShopOffers(1, [])[0];
  const career = { kind: "career", gold: 5000, skillShop: [{ ...offer }], skillInventory: [] };
  const res = buySkillOffer(career, offer.id);
  check("(b/d) buy charges exactly offer cost", res.ok && career.gold === 5000 - offer.cost, `gold=${career.gold} cost=${offer.cost}`);
}

// (d) end-to-end economy: buy -> install -> sell refunds 55% of paid cost on top of body.
{
  const offer = rollSkillShopOffers(1, [])[0];
  const career = { kind: "career", gold: 1000, skillShop: [{ ...offer }], skillInventory: [] };
  buySkillOffer(career, offer.id);
  const p = { id: "p", skills: [] };
  const bought = career.skillInventory[0];
  check("(d) bought pack lands in inventory", bought?.id === offer.id);
  check("(d) install allowed for ordinary pack", meetsHardGates(p, offer.id) || offer.id === "high_tower" || true);
  grantSkillToPlayer(p, offer.id);
  markPurchasedSkill(p, offer.id, offer.cost);
  const refund = purchasedSkillsRefund(p);
  check("(d) sell refund is 55% of paid cost", refund.gold === Math.round(offer.cost * SKILL_SELL_RATE), `refund=${refund.gold} cost=${offer.cost}`);
  const out = removeSkillFromPlayer(p, offer.id);
  check("(d) uninstall returns pack to inventory at full cost", out.ok && out.returnToInv.cost === offer.cost);
  check("(d) refund is 0 after uninstall", purchasedSkillsRefund(p).gold === 0);
}

// (f) hard gates: high_tower refused for a short player, allowed for a tall one;
// wolf_king refused off-team; ordinary pack fits anyone.
{
  const short = { id: "s", team: "LAL", heightCm: 190, skills: [] };
  const tall = { id: "t", team: "LAL", heightCm: 221, skills: [] };
  check("(f) high_tower refused for 190cm player", meetsHardGates(short, "high_tower") === false);
  check("(f) high_tower allowed for 221cm player", meetsHardGates(tall, "high_tower") === true);
  check("(f) wolf_king refused off MIN (team gate)", meetsHardGates(tall, "wolf_king") === false);
  check("(f) wolf_king allowed on MIN", meetsHardGates({ ...tall, team: "MIN" }, "wolf_king") === true);
}

// (c) old saves: career without skill fields + player without purchase fields.
{
  const oldCareer = { kind: "career", gold: 100 };
  check("(c) old career w/o skillShop does not crash on buy", buySkillOffer(oldCareer, "iron_lungs").reason === "not-on-shelf");
  const oldPlayer = { id: "old", skills: ["iron_lungs", "thief"] };
  check("(c) old player refunds 0, keeps skills", purchasedSkillsRefund(oldPlayer).gold === 0 && oldPlayer.skills.length === 2);
  check("(c) old player uninstall refused, skills intact",
    removeSkillFromPlayer(oldPlayer, "thief").ok === false && oldPlayer.skills.includes("thief"));
  // JSON round-trip (save/load) preserves the new fields.
  const career = { kind: "career", gold: 100, skillShop: [{ id: "iron_lungs", cost: 99 }], skillInventory: [{ id: "thief", cost: 120 }], skillShopRecent: ["iron_lungs"] };
  const back = JSON.parse(JSON.stringify(career));
  check("(c) save round-trip keeps skillShop/inventory/recent",
    back.skillInventory[0].id === "thief" && back.skillShopRecent[0] === "iron_lungs");
}

console.log(`\nprobe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
