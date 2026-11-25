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

test("a day follows the ADR taper: gold 100/50/0%, XP 100/50/25%, priced at half of ranked", () => {
  const acc = account();
  start(acc);
  const r = run(acc, T0 + 2 * DAY, always(true));
  const { RANKED_PAY, PRICE_SHARE, HOSTED_XP_PER_GAME } = hosted;
  const win = RANKED_PAY.win * PRICE_SHARE;
  assert.equal(r.days[0].games, 20);
  assert.equal(r.gold, 5 * win + 5 * Math.round(win * 0.5), "only games 1-10 pay gold");
  assert.equal(r.xp, 5 * HOSTED_XP_PER_GAME + 5 * Math.round(HOSTED_XP_PER_GAME * 0.5) + 10 * Math.round(HOSTED_XP_PER_GAME * 0.25));
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
  assert.equal(paid, hosted.WEEKLY_PAID_GAMES);
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
  assert.equal(run(acc, T0 + 30 * DAY).days.length, hosted.MAX_CATCH_UP_DAYS);
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
