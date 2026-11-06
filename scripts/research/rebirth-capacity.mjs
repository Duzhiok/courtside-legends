// ADR-007 candidate-pool capacity analysis (research only, no engine change).
//
//   node scripts/research/rebirth-capacity.mjs
//
// Question: if every future draft class (2026..2049) is filled by NBA cross-era rebirth, with the rules the
// product owner approved (one rebirth per person per timeline; the original career instance must be over;
// rookie-level cards, not peak), do we run out of people, and how often do famous names repeat?
//
// A "usable rookie card" = the person's first season with enough games to trust the per-game line
// (gp >= MIN_GP and mpg >= MIN_MPG) and a finite card. Everyone else is excluded and counted by reason.
import { readFileSync } from "node:fs";
import { seasonToCard, overall } from "../../js/data/players.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const FIRST_DRAFT = 2026, LAST_DRAFT = 2049; // 24 classes; 2049-50 is the last playable season
const CLASSES = LAST_DRAFT - FIRST_DRAFT + 1;
const MIN_GP = 15, MIN_MPG = 8;
const ACTIVE_REMAINING = 6; // players whose last real season is 2025: assume ~6 more years before their original instance ends

// ---- deterministic order so the report is reproducible
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- build persons
const by = new Map();
for (const r of ROWS) (by.get(r.bref) ?? by.set(r.bref, []).get(r.bref)).push(r);
const persons = [];
const excluded = { thinRookie: 0, badCard: 0 };
let truncatedStart = 0;
for (const [bref, rows] of by) {
  rows.sort((a, b) => a.season - b.season);
  const first = rows[0], last = rows[rows.length - 1];
  const rookieRow = rows.find((r) => r.gp >= MIN_GP && r.mpg >= MIN_MPG);
  if (!rookieRow) { excluded.thinRookie++; continue; }
  let rookieOvr, peak = 0;
  try {
    rookieOvr = overall(seasonToCard(rookieRow));
    for (const r of rows) peak = Math.max(peak, overall(seasonToCard(r)));
  } catch { excluded.badCard++; continue; }
  if (!Number.isFinite(rookieOvr) || !Number.isFinite(peak)) { excluded.badCard++; continue; }
  if (first.season === 1951) truncatedStart++; // data window starts in 1951: real debut may be earlier
  const originalEnds = last.season >= 2025 ? 2025 + ACTIVE_REMAINING : last.season;
  persons.push({ bref, name: first.name, pos: rookieRow.pos, debut: first.season, originalEnds, rookieOvr, peak });
}

const tier = (p) => (p.peak >= 88 ? "A" : p.peak >= 80 ? "B" : p.peak >= 70 ? "C" : "D");
const TIERS = ["A", "B", "C", "D"];
const count = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});

console.log(`persons in roster.json: ${by.size}`);
console.log(`excluded: thin rookie data ${excluded.thinRookie}, unusable card ${excluded.badCard}; usable: ${persons.length}`);
console.log(`debut window starts 1951 (real debut may be earlier): ${truncatedStart}`);
console.log(`usable by peak tier (A>=88 B 80-87 C 70-79 D<70): ${JSON.stringify(count(persons, tier))}`);
console.log(`active in 2025 (original instance ends ~${2025 + ACTIVE_REMAINING}): ${persons.filter((p) => p.originalEnds > 2025).length}\n`);

// ---- two risks that make a head-count look better than it is
const posOf = (p) => ({ PG: "G", SG: "G", SF: "F", PF: "F", C: "C" }[p.pos] || "?");
const decade = (p) => `${Math.floor(p.debut / 10) * 10}s`;
console.log(`usable by position group: ${JSON.stringify(count(persons, posOf))}  (a real class is roughly 40% G / 35% F / 25% C)`);
console.log(`usable by debut decade:   ${JSON.stringify(count(persons, decade))}`);
const oldNoStats = persons.filter((p) => p.debut < 1980).length;
console.log(`debuted before 1980 (no 3PT/STL/BLK in the source data): ${oldNoStats} = ${((100 * oldNoStats) / persons.length).toFixed(0)}% of usable\n`);

// ---- allocation simulation
function simulate({ perClass, headlineCap, cooldown }) {
  const used = new Set();
  const rows = [];
  let short = 0, famousRepeats = 0;
  for (let y = FIRST_DRAFT; y <= LAST_DRAFT; y++) {
    const eligible = persons
      .filter((p) => !used.has(p.bref) && p.originalEnds + cooldown < y)
      .sort((a, b) => hash(`${y}|${a.bref}`) - hash(`${y}|${b.bref}`));
    const head = eligible.filter((p) => p.peak >= 80).slice(0, headlineCap);
    const fill = eligible.filter((p) => p.peak < 80 && !head.includes(p)).slice(0, Math.max(0, perClass - head.length));
    const picked = [...head, ...fill];
    for (const p of picked) used.add(p.bref);
    const gap = perClass - picked.length;
    if (gap > 0) short += gap;
    rows.push({ y, eligible: eligible.length, picked: picked.length, head: head.length, gap });
  }
  const firstShort = rows.find((r) => r.gap > 0)?.y ?? null;
  const left = persons.filter((p) => !used.has(p.bref));
  return { rows, short, firstShort, leftByTier: count(left, tier), usedFamous: persons.filter((p) => used.has(p.bref) && p.peak >= 80).length };
}

console.log("policy                                   classes filled  first short  unfilled seats  famous(>=80) used  pool left by tier");
for (const perClass of [60, 76, 100]) {
  for (const headlineCap of [2, 4]) {
    for (const cooldown of [0, 10]) {
      const r = simulate({ perClass, headlineCap, cooldown });
      const filled = r.rows.filter((x) => x.gap === 0).length;
      console.log(
        `class=${String(perClass).padEnd(3)} headline<=${headlineCap} cooldown=${String(cooldown).padEnd(2)}`.padEnd(41) +
        `${String(filled).padStart(2)}/${CLASSES}`.padEnd(16) + String(r.firstShort ?? "-").padEnd(13) +
        String(r.short).padEnd(16) + String(r.usedFamous).padEnd(19) + JSON.stringify(r.leftByTier),
      );
    }
  }
}

// ---- how fast is the "famous" pool consumed if we let the headline rate float (what repeat exposure looks like)
const famous = persons.filter((p) => p.peak >= 88).length;
console.log(`\ntier-A (peak>=88) people: ${famous}. At headline cap 2/class over ${CLASSES} classes only ${2 * CLASSES} of them are ever reborn (${((100 * 2 * CLASSES) / famous).toFixed(0)}%);`);
console.log(`uncapped (all A+B slots filled first) they would be gone by class ${FIRST_DRAFT + Math.ceil(persons.filter((p) => p.peak >= 80).length / 10) - 1} at 10/class.`);

// ---- position-aware run: each class wants a G/F/C mix; a short position is NOT back-filled by another one
function simulatePos({ perClass, headlineCap, cooldown, mix }) {
  const used = new Set();
  const want = { G: Math.round(perClass * mix.G), F: Math.round(perClass * mix.F) };
  want.C = perClass - want.G - want.F;
  let shortTotal = 0, firstShort = null;
  const shortBy = { G: 0, F: 0, C: 0 };
  for (let y = FIRST_DRAFT; y <= LAST_DRAFT; y++) {
    const eligible = persons
      .filter((p) => !used.has(p.bref) && p.originalEnds + cooldown < y)
      .sort((a, b) => hash(`${y}|${a.bref}`) - hash(`${y}|${b.bref}`));
    const head = eligible.filter((p) => p.peak >= 80).slice(0, headlineCap);
    for (const p of head) used.add(p.bref);
    for (const g of ["G", "F", "C"]) {
      const need = want[g] - head.filter((p) => posOf(p) === g).length;
      const got = eligible.filter((p) => !used.has(p.bref) && p.peak < 80 && posOf(p) === g).slice(0, Math.max(0, need));
      for (const p of got) used.add(p.bref);
      const gap = Math.max(0, need) - got.length;
      if (gap) { shortTotal += gap; shortBy[g] += gap; firstShort ??= y; }
    }
  }
  return { shortTotal, firstShort, shortBy };
}
console.log("\nposition-aware (mix = share of each class), headline<=2, cooldown 0:");
for (const [label, mix] of [["40/35/25 (textbook)", { G: 0.4, F: 0.35 }], ["45/37/18 (matches the pool)", { G: 0.45, F: 0.37 }], ["42/38/20", { G: 0.42, F: 0.38 }]]) {
  for (const perClass of [60, 76, 100]) {
    const r = simulatePos({ perClass, headlineCap: 2, cooldown: 0, mix });
    console.log(`  mix ${label.padEnd(28)} class=${String(perClass).padEnd(3)} unfilled seats ${String(r.shortTotal).padEnd(5)} first short ${r.firstShort ?? "-"}  by pos ${JSON.stringify(r.shortBy)}`);
  }
}
