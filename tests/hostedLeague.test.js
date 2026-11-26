import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const hosted = await import("../js/data/hostedLeague.js");
const camp = await import("../js/data/trainingCamp.js");

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 23, 12, 0); // a Monday, noon UTC: no timezone puts it near a day edge
const noSave = () => {};

function card(id) {
  return {
    id, bref: id, season: 2000, name: id, team: "DEN", pos: "SF", age: 27, heightCm: 201,
    ovr2k: 72, ratingSource: "anchor", skills: [], speed: 70, strength: 65, stamina: 70, block: 60,
    three: 70, mid: 62, paint: 62, pass: 65, iq: 65, rebound: 55, defense: 60, steal: 55, scoring: 65, clutch: 60,
    intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 },
  };
}
const POOL = [card("c0"), card("c1")];
const account = () => ({ id: "acc-h", playerIds: ["c0", "c1"], cardMods: {}, gold: 0 });
const always = (won) => () => ({ won });
const run = (acc, now, playGame = always(true)) => hosted.settleHosted(acc, { now, playGame, pool: POOL, save: noSave });
const start = (acc, plan = { playerId: "c0", attr: "three" }) => hosted.setHostedPlan(acc, plan, { now: T0, save: noSave });

test("nothing is owed without a plan, and never for today: games settle the day after", () => {
  const acc = account();
  assert.equal(run(acc, T0 + 3 * DAY).days.length, 0);
  start(acc);
  assert.equal(run(acc, T0).days.length, 0, "same day: nothing yet");
  assert.equal(run(acc, T0 + DAY).days.length, 0, "the day after setting the plan: that day is still running");
  assert.equal(run(acc, T0 + 2 * DAY).days.length, 1, "two days on: the first full day settles");
});

test("economy constants are pinned by value, not read back from the module (B47 follow-up a)", () => {
  // These used to be asserted only through the imported constants, so changing
  // a constant left every test green. Pin the literal values here; a deliberate
  // economy change must update this test too.
  assert.equal(hosted.DAILY_GAMES, 20);
  assert.equal(hosted.WEEKLY_PAID_GAMES, 25);
  assert.equal(hosted.MAX_CATCH_UP_DAYS, 7);
  assert.equal(hosted.PRICE_SHARE, 0.5);
  assert.equal(hosted.RANKED_PAY.win, 40);
  assert.equal(hosted.RANKED_PAY.loss, 12);
  assert.equal(hosted.HOSTED_XP_PER_GAME, 8);
  assert.equal(hosted.YIELD_EVERY_GAMES, 5);
  assert.deepEqual(hosted.TAPER, [
    { upTo: 5, gold: 1, xp: 1 },
    { upTo: 10, gold: 0.5, xp: 0.5 },
    { upTo: 20, gold: 0, xp: 0.25 },
  ]);
});

test("a day follows the ADR taper: gold 100/50/0%, XP 100/50/25%, priced at half of ranked", () => {
  const acc = account();
  start(acc);
  const r = run(acc, T0 + 2 * DAY, always(true));
  const win = 20; // ranked win 40 x PRICE_SHARE 0.5, pinned literally (see constants test)
  const xp = 8; // HOSTED_XP_PER_GAME, pinned literally
  assert.equal(r.days[0].games, 20);
  assert.equal(r.gold, 5 * win + 5 * Math.round(win * 0.5), "only games 1-10 pay gold");
  assert.equal(r.xp, 5 * xp + 5 * Math.round(xp * 0.5) + 10 * Math.round(xp * 0.25));
  assert.equal(acc.gold, r.gold);
});

test("settling is idempotent: the same clock twice pays once", () => {
  const acc = account();
  start(acc);
  const first = run(acc, T0 + 3 * DAY);
  const gold = acc.gold;
  const again = run(acc, T0 + 3 * DAY);
  assert.equal(again.days.length, 0);
  assert.equal(acc.gold, gold);
  assert.equal(first.days.length, 2);
});

test("the seed of a game is fixed by (account, day, index): settling late or reloading cannot reroll", () => {
  const seen = (acc, now) => { const seeds = []; run(acc, now, ({ seed }) => (seeds.push(seed), { won: seed % 2 === 0 })); return seeds; };
  const a = account(); start(a);
  const b = account(); start(b);
  const early = seen(a, T0 + 2 * DAY);
  const late = seen(b, T0 + 3 * DAY).slice(0, 20);
  assert.deepEqual(early, late, "day 1's 20 seeds are identical whether settled on day 1 or day 2");
  assert.equal(new Set(early).size, 20);
  assert.notEqual(hosted.hostedSeed("x", 1, 1), hosted.hostedSeed("y", 1, 1));
  assert.notEqual(hosted.hostedSeed("x", 1, 1), hosted.hostedSeed("x", 2, 1), "another day is another game");
  assert.notEqual(hosted.hostedSeed("x", 1, 1), hosted.hostedSeed("x", 1, 2));
});

test("the weekly cap is HARD: after 25 paid games the rest of the week pays nothing, and a new week resets it", () => {
  const acc = account();
  start(acc);
  const r = run(acc, T0 + 7 * DAY); // Tue..Sun settled = 6 days of 20 games, all in one Monday-based week
  const paid = r.days.reduce((n, d) => n + d.paid, 0);
  assert.equal(paid, 25, "weekly cap is 25 paid games, pinned literally");
  assert.equal(r.days.reduce((n, d) => n + d.games, 0), 120, "every game is still played and recorded");
  assert.equal(r.days.at(-1).gold, 0);
  const week2 = run(acc, T0 + 9 * DAY); // Mon + Tue of the next week: a new week, a fresh cap
  assert.equal(week2.days.length, 2);
  assert.equal(week2.days.at(-1).paid > 0, true, "new week pays again");
});

test("hosted XP goes through the Training Center bank: same tier budget, no direct attribute edits", () => {
  const acc = account();
  start(acc);
  const r = run(acc, T0 + 7 * DAY);
  const t = acc.cardMods.c0.training;
  assert.ok(Number.isFinite(t.xp.three) && (t.attrs.three > 0 || t.xp.three > 0), "xp bank written");
  assert.equal(r.gained, t.attrs.three || 0);
  const budget = camp.trainingInfo(acc, "c0", POOL).budget;
  assert.ok((t.attrs.three || 0) <= budget.perAttr, "never beyond the per-attribute cap");
  const noOwner = account();
  hosted.setHostedPlan(noOwner, { playerId: "stranger", attr: "three" }, { now: T0, save: noSave });
  const r2 = run(noOwner, T0 + 2 * DAY);
  assert.equal(r2.gained, 0);
  assert.equal(noOwner.cardMods.stranger, undefined, "a card the player does not own gets nothing");
});

test("catch-up is bounded: away for a month settles at most MAX_CATCH_UP_DAYS", () => {
  const acc = account();
  start(acc);
  assert.equal(run(acc, T0 + 30 * DAY).days.length, 7, "catch-up is capped at 7 days, pinned literally");
});

test("it touches nothing but gold, one card's XP bank and its own log", () => {
  const acc = { ...account(), tickets: 3, rankedWins: 2, playerIds: ["c0", "c1"] };
  start(acc);
  run(acc, T0 + 4 * DAY, always(false));
  assert.equal(acc.tickets, 3);
  assert.equal(acc.rankedWins, 2);
  assert.deepEqual(acc.playerIds, ["c0", "c1"]);
  assert.ok(acc.gold > 0 && acc.hosted.log.length === 3);
});

// --- async settlement (the page must not freeze for a 7-day catch-up) ---

const wins3of4 = ({ index }) => ({ won: index % 4 !== 0, score: { me: 100, opponent: 90 }, opponent: "T" });
const asyncRun = (acc, ref = acc, extra = {}) => hosted.settleHostedAsync(ref, { now: T0 + 4 * DAY, playGame: wins3of4, pool: POOL, save: noSave, ...extra });

test("async settlement gives exactly the synchronous result", async () => {
  const a = account();
  const b = account();
  start(a);
  start(b);
  const sync = run(a, T0 + 4 * DAY, wins3of4);
  const viaAsync = await asyncRun(b);
  assert.deepEqual(viaAsync, sync);
  assert.equal(b.gold, a.gold);
  assert.deepEqual(b.hosted, a.hosted);
});

test("it plays in small chunks, handing the thread back between them, and reports rising progress", async () => {
  const acc = account();
  start(acc);
  let sinceYield = 0;
  let yields = 0;
  const seen = [];
  await asyncRun(acc, acc, {
    playGame: (g) => { sinceYield += 1; return wins3of4(g); },
    yieldFrame: async () => { assert.ok(sinceYield <= hosted.YIELD_EVERY_GAMES, `${sinceYield} games ran without yielding`); sinceYield = 0; yields += 1; },
    onProgress: (p) => seen.push(p),
  });
  assert.equal(yields, 11, "3 days of 20 games, a yield after every chunk of 5 except the last");
  assert.ok(seen.every((p, i) => p.total === 60 && (i === 0 || p.done > seen[i - 1].done)), JSON.stringify(seen.slice(0, 3)));
  assert.ok(seen.at(-1).done < seen.at(-1).total, "no yield once everything is played");
});

test("what the player did while it settled survives: the result is written onto the CURRENT account, not the old object", async () => {
  const stored = { ...account(), gold: 600 };
  start(stored);
  const current = () => JSON.parse(JSON.stringify(stored)); // like getAccount(): a fresh copy of what is saved
  let spent = false;
  const out = await asyncRun(stored, () => (spent ? stored : current()), {
    yieldFrame: async () => { if (!spent) { spent = true; stored.gold -= 150; } }, // starts a training session half way
  });
  assert.ok(out.gold > 0);
  assert.equal(stored.gold, 600 - 150 + out.gold, "the 150 spent during settlement is still spent");
});

test("if the account was switched away while settling, nothing is paid and nothing is marked settled", async () => {
  const mine = account();
  start(mine);
  const other = { ...account(), id: "someone-else" };
  let calls = 0;
  const out = await asyncRun(mine, () => (calls++ === 0 ? mine : other)); // first read = mine, the end-of-settlement read = a different account
  assert.deepEqual(out.days, []);
  assert.equal(mine.gold, 0);
  assert.equal(other.gold, 0);
  assert.equal(hosted.hostedState(mine).settledDay, hosted.dayOf(T0), "still owed: the next visit settles it");
});
