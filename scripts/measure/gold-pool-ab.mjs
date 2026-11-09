/**
 * Lightweight A/B comparison for the gold-challenge pool (design 8da1494 §5/§8):
 * does the role work change what gets picked?
 *
 *   A  = existing prices + role tags (presentation only) + OLD random filler
 *        dealing, role-blind pickers.
 *   B1 = A + role-diverse filler dealing (balanced packs), pickers still blind.
 *   B2 = B1 + role-aware picking (the "推荐" recommendation behaviour).
 *
 * No price/budget change in any variant (C is not implemented here). A few
 * hundred drafts, two picker strategies each (greedy / random). Run with:
 *   node scripts/measure/gold-pool-ab.mjs
 * Prints pick rate by OVR band and price, roster role coverage, gold
 * remaining, and a verdict on whether the 1-coin (74–79) tier is still
 * ~unpicked under B2 (which would warrant C).
 */
import { readFileSync } from "node:fs";
import { PLAYERS, seasonToCard, overall } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import {
  CUSTOM_BUDGET,
  CUSTOM_ROSTER_SIZE,
  clearPeakPoolCache,
  customPriceOf,
  drawZeroCostPack,
  listPaidPeaks,
} from "../../js/data/customPool.js";
import { ROLE_FAMILIES, roleFamilyOf } from "../../js/data/skills.js";

const DRAFTS_PER_CELL = 200;
const BANDS = [
  ["<74", (o) => o < 74],
  ["74–79", (o) => o >= 74 && o < 80],
  ["80–85", (o) => o >= 80 && o < 86],
  ["86–91", (o) => o >= 86 && o < 92],
  ["92–95", (o) => o >= 92 && o < 96],
  ["96+", (o) => o >= 96],
];

function loadRoster(step = 10) {
  const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  PLAYERS.push(...rows.filter((_, i) => i % step === 0).map(seasonToCard));
  clearPeakPoolCache();
}

function fakeDraft() {
  return {
    budgetMode: true,
    picksPerSide: CUSTOM_ROSTER_SIZE,
    used: new Set(),
    teams: {
      A: { players: [], gold: CUSTOM_BUDGET },
      B: { players: [], gold: CUSTOM_BUDGET },
    },
  };
}

function affordableSpendCards(d, side, paidList) {
  const gold = d.teams[side].gold ?? 0;
  return paidList
    .map((c) => c.data)
    .filter((p) => !d.used.has(p.id) && customPriceOf(p) <= gold);
}

function canSpend(d, side, paidList) {
  return affordableSpendCards(d, side, paidList).length > 0;
}

function pickSpend(cards, roster, picker) {
  if (!cards.length) return null;
  if (picker === "random" || picker === "random-role") {
    const missing = new Set(ROLE_FAMILIES.filter((f) => !new Set(roster.map(roleFamilyOf)).has(f)));
    const roleFilling = picker === "random-role" ? cards.filter((p) => missing.has(roleFamilyOf(p))) : [];
    const pool = roleFilling.length ? roleFilling : cards;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Greedy: highest OVR affordable (tiebreak: cheaper). Role-aware first takes a
  // role-skill card that fills a missing family, then falls back to greedy.
  if (picker === "greedy-role") {
    const have = new Set(roster.map(roleFamilyOf));
    const missing = ROLE_FAMILIES.filter((f) => !have.has(f));
    const roleFilling = cards.filter(
      (p) => (p.roleSkills || []).length && missing.includes(roleFamilyOf(p))
    );
    if (roleFilling.length) {
      return roleFilling.sort((a, b) => overall(b) - overall(a) || customPriceOf(a) - customPriceOf(b))[0];
    }
  }
  return [...cards].sort((a, b) => overall(b) - overall(a) || customPriceOf(a) - customPriceOf(b))[0];
}

function pickFiller(pack, roster, picker) {
  const cards = pack.map((c) => c.data);
  if (!cards.length) return null;
  if (picker === "random") return cards[Math.floor(Math.random() * cards.length)];
  if (picker === "random-role") {
    const have = new Set(roster.map(roleFamilyOf));
    const missing = ROLE_FAMILIES.filter((f) => !have.has(f));
    const filling = cards.filter((p) => missing.includes(roleFamilyOf(p)));
    const pool = filling.length ? filling : cards;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (picker === "greedy-role") {
    const have = new Set(roster.map(roleFamilyOf));
    const missing = ROLE_FAMILIES.filter((f) => !have.has(f));
    const withRole = cards.filter((p) => (p.roleSkills || []).length && missing.includes(roleFamilyOf(p)));
    const pool = withRole.length ? withRole : cards.filter((p) => missing.includes(roleFamilyOf(p)));
    const cands = pool.length ? pool : cards;
    return [...cands].sort((a, b) => overall(b) - overall(a))[0];
  }
  return [...cards].sort((a, b) => overall(b) - overall(a))[0];
}

function simulateDraft(variant, picker, paidList) {
  const d = fakeDraft();
  const fillerMode = variant === "A" ? "random" : "balanced";
  // Spend phase: alternate sides until neither can afford another priced card.
  let turn = "A";
  let guard = 0;
  while (guard++ < 40) {
    const other = turn === "A" ? "B" : "A";
    if (!canSpend(d, turn, paidList) && !canSpend(d, other, paidList)) break;
    if (!canSpend(d, turn, paidList)) {
      turn = other;
      continue;
    }
    const team = d.teams[turn];
    const pick = pickSpend(affordableSpendCards(d, turn, paidList), team.players, picker);
    if (!pick) break;
    team.players.push(pick);
    team.gold -= customPriceOf(pick);
    d.used.add(pick.id);
    turn = other;
  }
  // Filler phase: alternate sides, fresh pack each turn, until both rosters are full.
  guard = 0;
  while (guard++ < 40) {
    const aFull = d.teams.A.players.length >= CUSTOM_ROSTER_SIZE;
    const bFull = d.teams.B.players.length >= CUSTOM_ROSTER_SIZE;
    if (aFull && bFull) break;
    const other = turn === "A" ? "B" : "A";
    if (d.teams[turn].players.length >= CUSTOM_ROSTER_SIZE) {
      turn = other;
      continue;
    }
    const team = d.teams[turn];
    const pack = drawZeroCostPack(5, d.used, { mode: fillerMode });
    const pick = pickFiller(pack, team.players, picker);
    if (!pick) break;
    team.players.push(pick);
    d.used.add(pick.id);
    turn = other;
  }
  return [d.teams.A, d.teams.B];
}

function runCell(variant, picker, paidList) {
  const bandPicks = new Map(BANDS.map(([name]) => [name, 0]));
  const pricePicks = new Map([0, 1, 2, 3, 4, 5].map((p) => [p, 0]));
  let totalPicks = 0;
  let familyCoverage = 0;
  let goldLeft = 0;
  let rosterOvr = 0;
  let rosters = 0;
  for (let i = 0; i < DRAFTS_PER_CELL; i++) {
    for (const team of simulateDraft(variant, picker, paidList)) {
      rosters++;
      familyCoverage += new Set(team.players.map(roleFamilyOf)).size;
      goldLeft += team.gold ?? 0;
      rosterOvr += team.players.reduce((s, p) => s + overall(p), 0) / Math.max(1, team.players.length);
      for (const p of team.players) {
        const o = overall(p);
        const band = BANDS.find(([, fn]) => fn(o))[0];
        bandPicks.set(band, bandPicks.get(band) + 1);
        const price = customPriceOf(p);
        pricePicks.set(price, pricePicks.get(price) + 1);
        totalPicks++;
      }
    }
  }
  const pct = (n) => ((100 * n) / Math.max(1, totalPicks)).toFixed(1) + "%";
  return {
    variant,
    picker,
    totalPicks,
    bands: Object.fromEntries([...bandPicks.entries()].map(([k, v]) => [k, pct(v)])),
    prices: Object.fromEntries([...pricePicks.entries()].map(([k, v]) => [k, pct(v)])),
    familiesPerRoster: (familyCoverage / rosters).toFixed(2),
    goldLeft: (goldLeft / rosters).toFixed(2),
    avgOvr: (rosterOvr / rosters).toFixed(1),
  };
}

loadRoster();
// The paid pool is static for the run; listPaidPeaks re-sorts it per call, so
// sort once and filter by `used` per draft instead of re-sorting thousands of times.
const paidList = listPaidPeaks(new Set());
const cells = [
  runCell("A", "greedy-value", paidList),
  runCell("A", "random", paidList),
  runCell("B1", "greedy-value", paidList),
  runCell("B1", "random", paidList),
  runCell("B2", "greedy-role", paidList),
  runCell("B2", "random-role", paidList),
];
console.log(`gold-pool A/B — ${DRAFTS_PER_CELL} drafts/cell, 2 sides each, budget ${CUSTOM_BUDGET}, roster ${CUSTOM_ROSTER_SIZE}`);
console.log("pick % by OVR band | price | families/roster | gold left | avg OVR");
for (const c of cells) {
  console.log(
    `${c.variant} ${c.picker.padEnd(11)} bands ${JSON.stringify(c.bands)} prices ${JSON.stringify(c.prices)} ` +
      `families ${c.familiesPerRoster} gold ${c.goldLeft} ovr ${c.avgOvr}`
  );
}
const b2Greedy = cells.find((c) => c.variant === "B2" && c.picker === "greedy-role");
const oneCoin = parseFloat(b2Greedy.bands["74–79"]);
console.log(
  oneCoin < 5
    ? `VERDICT: 1-coin tier (74–79) still ~unpicked under B2 greedy (${b2Greedy.bands["74–79"]}) — C (small pricing/budget experiment) is warranted.`
    : `VERDICT: 1-coin tier (74–79) is picked under B2 greedy (${b2Greedy.bands["74–79"]}) — no economy change needed for now.`
);
