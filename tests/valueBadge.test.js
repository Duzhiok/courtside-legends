import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";
import { valueBadge, valueBadgeHtml } from "../js/ui/valueBadge.js";

const overpaid = { name: "Let Down", valueArchetype: "overpaid" };
const bargain = { name: "Gem", valueArchetype: "bargain" };
const plain = { name: "Plain", valueArchetype: "fair", intangibles: {} };

test("a card you can still pick or buy shows NO value badge — nobody would pick 高薪低能", () => {
  for (const p of [overpaid, bargain, plain]) assert.equal(valueBadge(p), null, p.name);
  assert.equal(valueBadge(overpaid, { scouted: false }), null);
  assert.equal(valueBadgeHtml(valueBadge(overpaid)), "");
});

test("a scout pack reveals the find (妖人) and the trap (高薪低能) alike", () => {
  assert.deepEqual(valueBadge(bargain, { scouted: true }), { text: "妖人", cls: "bargain" });
  assert.deepEqual(valueBadge(overpaid, { scouted: true }), { text: "高薪低能", cls: "overpaid" });
  assert.equal(valueBadge(plain, { scouted: true }), null);
});

test("once owned, you have found out: the let-down is shown; the finds stay hidden as before", () => {
  assert.deepEqual(valueBadge(overpaid, { owned: true }), { text: "高薪低能", cls: "overpaid" });
  assert.equal(valueBadge(bargain, { owned: true }), null);
  assert.equal(valueBadge(plain, { owned: true }), null);
});

test("html: a badge renders one span, nothing renders nothing; null player is safe", () => {
  assert.equal(valueBadgeHtml({ text: "高薪低能", cls: "overpaid" }), '<span class="value-badge overpaid">高薪低能</span>');
  assert.equal(valueBadgeHtml(null), "");
  assert.equal(valueBadge(null), null);
});

test("over the WHOLE roster: no real card shows a badge before it is owned or scouted", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  let overpaidCards = 0;
  let shownWhenOwned = 0;
  for (const row of rows) {
    const card = seasonToCard(row);
    assert.equal(valueBadge(card), null, `${card.name} ${card.season}`);
    if (card.valueArchetype === "overpaid") overpaidCards += 1;
    if (valueBadge(card, { owned: true })?.text === "高薪低能") shownWhenOwned += 1;
  }
  assert.ok(overpaidCards > 0, "there are 高薪低能 cards at all");
  assert.equal(shownWhenOwned, overpaidCards, "every one of them shows the label once owned");
});

test("Embiid 2022 (the card in the report) is a 高薪低能 — hidden on the pick screen, visible once owned", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const embiid = seasonToCard(rows.find((r) => r.bref === "embiijo01" && r.season === 2022));
  assert.equal(embiid.valueArchetype, "overpaid");
  assert.equal(valueBadge(embiid), null);
  assert.equal(valueBadge(embiid, { owned: true }).text, "高薪低能");
});

test("only the intended players are 高薪低能: Jim, Harold and Rick Fox share a surname with De'Aaron, nothing else", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const traps = new Set(rows.map(seasonToCard).filter((c) => c.valueArchetype === "overpaid").map((c) => c.name));
  assert.deepEqual([...traps].sort(), ["Ben Simmons", "De'Aaron Fox", "Deandre Ayton", "Joel Embiid", "Markelle Fultz", "Russell Westbrook"]);
  for (const fox of ["Jim Fox", "Harold Fox", "Rick Fox"]) assert.ok(!traps.has(fox), fox);
});
