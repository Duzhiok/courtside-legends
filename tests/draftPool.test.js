// B77: building a CPU team re-filtered the whole player library for every single pick (2.5 s for a gold bracket). The draw pool is built
// once now. The promise is that NOTHING a player can observe changed: the same seed deals the same cards. The old implementation is
// kept below as the oracle and compared on the cards dealt AND on the next random number (so the number of rand() calls matches too).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSISTANTS, COACHES } from "../js/data/coaches.js";
import { HIDDEN_TIERS, PLAYERS, clonePlayer, overall, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { clamp, shuffle } from "../js/core/seededRandom.js";
import { rand, withRng } from "../js/core/rng.js";
import { autoFillTeam, createDrawPool, drawPack, exhibitionTeams, takenPeople } from "../js/engine/draft.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
if (PLAYERS.length < 500) PLAYERS.push(...rows.filter((r) => [1996, 2004, 2010].includes(r.season)).map(seasonToCard)); // the same people appear in several seasons

// —— the oracle: draft.js before the pool, verbatim ——
function weightedPickOld(arr, weightFn) {
  if (!arr.length) return null;
  const weights = arr.map(weightFn);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
function drawPackOld(size = 5, { excludeIds = new Set() } = {}) {
  const people = takenPeople(excludeIds);
  const pool = PLAYERS.filter((p) => !excludeIds.has(p.id) && !people.has(p.bref));
  const cards = [];
  const used = new Set(excludeIds);
  for (let i = 0; i < size; i++) {
    const p = weightedPickOld(pool.filter((x) => !used.has(x.id) && !people.has(x.bref)), (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10);
    if (!p) break;
    used.add(p.id);
    if (p.bref) people.add(p.bref);
    cards.push({ kind: "player", data: clonePlayer(p) });
  }
  return shuffle(cards);
}
function autoFillTeamOld(name, nPlayers = 8, { excludeIds = null, power = 0 } = {}) {
  const pack = [];
  const used = new Set(excludeIds || []);
  const n = clamp(nPlayers + Math.floor(power / 2), 8, 12);
  while (pack.length < n) {
    const batch = drawPackOld(5, { excludeIds: used });
    const before = pack.length;
    for (const c of batch) if (c.kind === "player" && pack.length < n) { pack.push(c.data); used.add(c.data.id); }
    if (pack.length === before) break;
  }
  if (power > 0) {
    const extras = [];
    while (extras.length < power * 2) {
      const batch = drawPackOld(5, { excludeIds: used });
      for (const c of batch) if (c.kind === "player") { extras.push(c.data); used.add(c.data.id); }
      if (!batch.length) break;
    }
    const merged = [...pack, ...extras].sort((a, b) => overall(b) - overall(a));
    pack.length = 0;
    pack.push(...merged.slice(0, n));
  }
  const coach = weightedPickOld(COACHES, (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 10);
  const assistant = weightedPickOld(ASSISTANTS, (x) => HIDDEN_TIERS[x.hiddenTier]?.weight ?? 12);
  return { name, players: pack, coach, assistant };
}

function stream(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Run `fn` with BOTH random sources (rand() and the Math.random that shuffle uses) on the same seeded stream; return its result and the next number. */
function seeded(seed, fn, src = stream(seed)) {
  const keep = Math.random;
  Math.random = src;
  try {
    const out = withRng(src, fn);
    return { out, next: src() };
  } finally {
    Math.random = keep;
  }
}
const shape = (t) => ({ players: t.players.map((p) => p.id), coach: t.coach?.id, assistant: t.assistant?.id });

test("the library is big enough, and has the same person in several seasons (so the one-person-per-league rule is exercised)", () => {
  assert.ok(PLAYERS.length > 500);
  const brefs = new Map();
  for (const p of PLAYERS) brefs.set(p.bref, (brefs.get(p.bref) || 0) + 1);
  assert.ok([...brefs.values()].some((c) => c >= 2));
});

test("autoFillTeam deals exactly what the old implementation dealt, and calls rand() exactly as often (seeds x power x taken)", () => {
  const taken = new Set([PLAYERS[3].id, PLAYERS[40].id, PLAYERS[41].id, PLAYERS[200].id]);
  for (let seed = 1; seed <= 12; seed++) {
    for (const power of [0, 1, 2, 3]) {
      for (const excludeIds of [null, taken]) {
        const n = 8 + (seed % 3);
        const a = seeded(seed, () => autoFillTeam("T", n, { excludeIds: excludeIds && new Set(excludeIds), power }));
        const b = seeded(seed, () => autoFillTeamOld("T", n, { excludeIds: excludeIds && new Set(excludeIds), power }));
        assert.deepEqual(shape(a.out), shape(b.out), `seed ${seed} power ${power} taken ${!!excludeIds}`);
        assert.equal(a.next, b.next, `seed ${seed} power ${power}: same number of random draws`);
        const brefs = a.out.players.map((p) => p.bref);
        assert.equal(new Set(brefs).size, brefs.length, "one person once");
      }
    }
  }
});

test("a whole bracket of teams sharing one growing 'used' set is identical too (the way careerTeams builds it)", () => {
  const build = (fill) => seeded(77, () => {
    const used = new Set();
    const teams = [];
    for (let i = 0; i < 8; i++) {
      const t = fill(`T${i}`, 9 + Math.min(3, i % 4), { excludeIds: used, power: i % 4 });
      for (const p of t.players) used.add(p.id);
      teams.push(shape(t));
    }
    return teams;
  });
  const a = build(autoFillTeam);
  const b = build(autoFillTeamOld);
  assert.deepEqual(a.out, b.out);
  assert.equal(a.next, b.next);
  const all = a.out.flatMap((t) => t.players);
  assert.equal(new Set(all).size, all.length, "no card on two teams");
});

test("drawPack on its own (no shared pool) still matches the old pick for pick, and a shared pool is left whole", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const ex = new Set([PLAYERS[seed].id]);
    const a = seeded(seed, () => drawPack(5, { excludeIds: ex }).map((c) => c.data.id));
    const b = seeded(seed, () => drawPackOld(5, { excludeIds: ex }).map((c) => c.data.id));
    assert.deepEqual(a.out, b.out);
    assert.equal(a.next, b.next);
  }
  const pool = createDrawPool(new Set());
  const { live, sum } = pool;
  const weights = pool.weights.slice();
  drawPack(5, { excludeIds: new Set(), pool });
  assert.equal(pool.live, live, "drawing from a shared pool does not consume it (the caller decides what was kept)");
  assert.equal(pool.sum, sum);
  assert.deepEqual(pool.weights, weights);
});

test("an exhausted library gives a short pack, not an endless loop (as before)", () => {
  const all = new Set(PLAYERS.map((p) => p.id));
  const t = seeded(5, () => autoFillTeam("Empty", 8, { excludeIds: all }));
  assert.equal(t.out.players.length, 0);
});

test("the edges of the pick agree with the old code: a random source stuck at 0 (first live card each time) or just under 1 (the last-card fallback)", () => {
  for (const [label, value] of [["0", 0], ["0.9999999999", 0.9999999999]]) {
    const ex = new Set([PLAYERS[2].id]);
    const a = seeded(0, () => drawPack(5, { excludeIds: ex }).map((c) => c.data.id), () => value);
    const b = seeded(0, () => drawPackOld(5, { excludeIds: ex }).map((c) => c.data.id), () => value);
    assert.deepEqual(a.out, b.out, `rand() == ${label}`);
    assert.equal(new Set(a.out).size, a.out.length, `rand() == ${label}: no card dealt twice (a taken card must never be picked again)`);
    const t = seeded(0, () => shape(autoFillTeam("E", 9, { power: 2 })), () => value);
    const o = seeded(0, () => shape(autoFillTeamOld("E", 9, { power: 2 })), () => value);
    assert.deepEqual(t.out, o.out, `autoFillTeam with rand() == ${label}`);
  }
});

test("the cached library follows the roster: a card added later is drawable, and one taken is not", () => {
  const before = createDrawPool(new Set());
  const extra = { ...PLAYERS[0], id: "pool-test-extra", bref: "pooltest01", hiddenTier: "superstar" };
  PLAYERS.push(extra);
  try {
    const after = createDrawPool(new Set());
    assert.equal(after.live, before.live + 1, "a card that joined the roster is in the next pool");
    assert.equal(createDrawPool(new Set([extra.id])).live, before.live, "and an excluded id is out");
    assert.equal(createDrawPool(new Set([PLAYERS[0].id])).live < after.live, true, "and an existing card can be excluded");
  } finally {
    PLAYERS.pop();
  }
  assert.equal(createDrawPool(new Set()).live, before.live, "and gone again when the roster shrinks back");
});

test("exhibitionTeams: no real person plays for both sides (any season of him)", () => {
  for (let i = 0; i < 60; i++) {
    const { home, away } = exhibitionTeams(10);
    assert.equal(home.players.length, 10);
    assert.equal(away.players.length, 10);
    const mine = new Set(home.players.map((p) => p.bref));
    assert.ok(away.players.every((p) => p.bref && !mine.has(p.bref)), `game ${i}: same player on both sides`);
  }
});

// B97 finding #6: the home and away exhibition teams used to both be named "...传奇"
// (only a home/away prefix differed), so a scoreboard that only varies by color made
// them look like the same team. The two names must be genuinely distinct words, not
// just a shared suffix with a different prefix.
test("exhibitionTeams: home and away names are not a shared-suffix near-duplicate", () => {
  const { home, away } = exhibitionTeams(10);
  assert.notEqual(home.name, away.name, "home and away must not share a literal name");
  assert.ok(home.name && away.name, "both names must be non-empty");
  const sharedSuffix = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  };
  assert.ok(sharedSuffix(home.name, away.name) < 2, `names share too long a suffix: "${home.name}" / "${away.name}"`);
});
