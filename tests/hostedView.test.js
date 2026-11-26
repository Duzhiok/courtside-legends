import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const hosted = await import("../js/data/hostedLeague.js");
const view = await import("../js/ui/hostedView.js");

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 23, 12, 0);
const noSave = () => {};

function card(id, name = id) {
  return {
    id, bref: id, season: 2000, name, team: "DEN", pos: "SF", age: 27, heightCm: 201,
    ovr2k: 72, ratingSource: "anchor", skills: [], speed: 70, strength: 65, stamina: 70, block: 60,
    three: 70, mid: 62, paint: 62, pass: 65, iq: 65, rebound: 55, defense: 60, steal: 55, scoring: 65, clutch: 60,
    intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 },
  };
}
const POOL = ["a", "b", "c", "d", "e"].map((id) => card(id));
const account = (extra = {}) => ({ id: "acc-v", playerIds: ["a", "b", "c", "d", "e"], cardMods: {}, gold: 0, ...extra });
const ctx = (lang = "zh", now = T0 + 3 * DAY) => ({ now, pool: POOL, lang });

// --- data layer: the two new behaviours ---

test("each settled day remembers its key game: the biggest win, or the closest loss on a day with no win", () => {
  const acc = account();
  hosted.setHostedPlan(acc, { playerId: "a", attr: "three" }, { now: T0, save: noSave });
  const margins = [4, 18, 9];
  const r = hosted.settleHosted(acc, {
    now: T0 + 2 * DAY, pool: POOL, save: noSave,
    playGame: ({ index }) => { const m = margins[(index - 1) % 3]; return { won: m > 0, score: { me: 100 + m, opponent: 100 }, opponent: `T${index}` }; },
  });
  assert.equal(r.days[0].key.margin, 18);
  assert.equal(r.days[0].key.index, 2);
  assert.equal(r.days[0].key.opponent, "T2");

  const lose = account({ id: "acc-l" });
  hosted.setHostedPlan(lose, { playerId: "a", attr: "three" }, { now: T0, save: noSave });
  const l = hosted.settleHosted(lose, {
    now: T0 + 2 * DAY, pool: POOL, save: noSave,
    playGame: ({ index }) => ({ won: false, score: { me: 90, opponent: 90 + index }, opponent: `L${index}` }),
  });
  assert.equal(l.days[0].key.margin, -1, "no win: the closest loss is the story");
  assert.equal(l.days[0].key.index, 1);
});

test("turning hosted league off and on again never plays the days in between", () => {
  const acc = account();
  hosted.setHostedPlan(acc, { playerId: "a", attr: "three" }, { now: T0, save: noSave });
  hosted.clearHostedPlan(acc, { save: noSave });
  assert.equal(hosted.hostedState(acc).plan, null);
  assert.equal(hosted.hostedState(acc).settledDay, null);
  // owed nothing while off, however long it has been off
  assert.equal(hosted.settleHosted(acc, { now: T0 + 5 * DAY, playGame: () => ({ won: true }), pool: POOL, save: noSave }).days.length, 0);
  // back on five days later: counting starts from that day, not from the old settledDay
  hosted.setHostedPlan(acc, { playerId: "a", attr: "three" }, { now: T0 + 5 * DAY, save: noSave });
  assert.equal(hosted.settleHosted(acc, { now: T0 + 6 * DAY, playGame: () => ({ won: true }), pool: POOL, save: noSave }).days.length, 0);
  assert.equal(hosted.settleHosted(acc, { now: T0 + 7 * DAY, playGame: () => ({ won: true }), pool: POOL, save: noSave }).days.length, 1);
});

// --- view: story first, numbers second; everything escaped ---

const result = (extra = {}) => ({
  days: [
    { day: hosted.dayOf(T0 + DAY), games: 20, wins: 14, paid: 10, gold: 150, xp: 60, key: { index: 7, me: 112, opponentScore: 98, margin: 14, opponent: "LAL|2001" } },
    { day: hosted.dayOf(T0 + 2 * DAY), games: 20, wins: 12, paid: 10, gold: 140, xp: 55, key: { index: 3, me: 101, opponentScore: 95, margin: 6, opponent: "BOS|1986" } },
  ],
  gold: 290, xp: 115, gained: 2, ...extra,
});

test("the welcome-back card leads with the story: record, best game, who grew; then the numbers", () => {
  const out = view.hostedReportHtml(result(), { playerId: "a", attr: "three" }, ctx());
  assert.match(out, /离线打了 2 天/);
  assert.match(out, /40 场 26 胜 14 负/);
  assert.match(out, /最精彩：第 7 场 112–98 大胜 LAL\|2001（\+14）/, "the biggest of the days' key games");
  assert.match(out, /a 的三分 \+2（\+115 经验）/);
  assert.ok(out.indexOf("hl-story") < out.indexOf("hl-numbers"), "story before numbers");
  assert.match(out, /金币 \+¤290/);
  assert.equal(view.hostedReportHtml({ days: [], gold: 0, xp: 0, gained: 0 }, null, ctx()), "", "nothing settled: no card");
});

test("the report speaks English, and says 'banked' when nothing broke through", () => {
  const out = view.hostedReportHtml(result({ gained: 0 }), { playerId: "a", attr: "three" }, ctx("en"));
  assert.match(out, /Welcome back/);
  assert.match(out, /26–14 over 40 games/);
  assert.match(out, /Best game: #7, 112–98 over LAL\|2001 \(\+14\)/);
  assert.match(out, /banked 115 3PT XP/);
  assert.doesNotMatch(out, /[\u4e00-\u9fff]/, "no Chinese left in the English card");
});

test("names and team names from the save are escaped, never markup", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const pool = [card("a", evil), ...POOL.slice(1)];
  const report = view.hostedReportHtml(
    result({ days: [{ day: 1, games: 20, wins: 10, paid: 10, gold: 1, xp: 1, key: { index: 1, me: 100, opponentScore: 90, margin: 10, opponent: evil } }] }),
    { playerId: "a", attr: "three" }, { ...ctx(), pool },
  );
  assert.ok(!report.includes("<img"), report);
  assert.match(report, /&lt;img/);
  const acc = account({ hosted: { plan: { playerId: "a", attr: "three" }, settledDay: 1, log: [{ day: 1, games: 20, wins: 10, paid: 10, gold: 1, xp: 1, key: { index: 1, me: 100, opponentScore: 90, margin: 10, opponent: evil } }] } });
  assert.ok(!view.hostedLogHtml(acc, ctx()).includes("<img"));
  assert.ok(!view.hostedFormHtml(acc, { playerId: "a", attr: "three" }, { ...ctx(), pool }).includes("<img"));
});

test("log: newest first, at most seven days, and rows saved before key games existed still render", () => {
  const log = Array.from({ length: 9 }, (_, i) => ({ day: 20000 + 9 - i, games: 20, wins: 10, paid: 10, gold: 5, xp: 5 }));
  const out = view.hostedLogHtml(account({ hosted: { plan: { playerId: null, attr: null }, settledDay: 1, log } }), ctx());
  assert.equal((out.match(/<li>/g) || []).length, 7);
  assert.ok(!out.includes("undefined") && !out.includes("null"));
  assert.match(view.hostedLogHtml(account(), ctx()), /还没有结算过/, "empty log has a friendly line");
});

test("a day that paid nothing says why: the weekly reward cap is used up", () => {
  const acc = account({ hosted: { plan: { playerId: "a", attr: "three" }, settledDay: 1, log: [
    { day: 20001, games: 20, wins: 10, paid: 0, gold: 0, xp: 0 },
    { day: 20000, games: 20, wins: 10, paid: 10, gold: 80, xp: 40 },
  ] } });
  const out = view.hostedLogHtml(acc, ctx());
  assert.equal((out.match(/本周奖励已满/g) || []).length, 1, "only the unpaid day is explained");
  assert.match(view.hostedLogHtml(acc, ctx("en")), /weekly rewards used up/);
});

test("form: off by default; on shows the focus; fewer than five different players cannot start", () => {
  const off = view.hostedFormHtml(account(), { playerId: "", attr: "three" }, ctx());
  assert.match(off, /未开启/);
  assert.match(off, /data-hosted-save[^>]*>\s*开启托管/);
  assert.doesNotMatch(off, /data-hosted-off/);
  const on = view.hostedFormHtml(account({ hosted: { plan: { playerId: "a", attr: "three" }, settledDay: 1, paidWeek: { week: hosted.weekOf(hosted.dayOf(T0 + 3 * DAY)), paid: 7 } } }), { playerId: "a", attr: "three" }, ctx());
  assert.match(on, /托管中 · 训练重点：a · 三分/);
  assert.match(on, /本周已计奖励 7\/25 场/);
  assert.match(on, /data-hosted-off/);
  assert.match(on, /data-hosted-attr="three"/);
  const tiny = view.hostedFormHtml(account({ playerIds: ["a", "b"] }), { playerId: "", attr: "three" }, ctx());
  assert.match(tiny, /至少需要 5 位不同的球员/);
  assert.match(tiny, /data-hosted-save[^>]*disabled/);
});
