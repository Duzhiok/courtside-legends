import test from "node:test";
import assert from "node:assert/strict";
import { bannerStats, currentBanners, daysUntilRotation, weekIndex } from "../js/data/gacha.js";

const ovrOf = (c) => c.ovr;
const card = (id, bref, season, ovr, team = "LAL", name = bref) => ({ id, bref, season, ovr, team, name });
const POOL = [
  card("a-1962", "russebi01", 1962, 95, "BOS", "Bill Russell"),
  card("a-1963", "russebi01", 1963, 94, "BOS", "Bill Russell"),
  card("b-1965", "westje01", 1965, 91, "LAL", "Jerry West"),
  card("c-1968", "havlijo01", 1968, 82, "BOS", "John Havlicek"),
  card("d-2015", "curryst01", 2015, 97, "GSW", "Stephen Curry"),
  card("e-2015", "tradeguy01", 2015, 70, "NBA", "Mid-season total"),
];
const ERA_1960 = { id: "era-1960", kind: "era", decade: 1960 };

test("bannerStats counts cards and distinct people in the pool", () => {
  const stats = bannerStats(POOL, ERA_1960, ovrOf);
  assert.equal(stats.cards, 4);
  assert.equal(stats.people, 3);
});

test("the showcase lists each person once, best card first", () => {
  const { top } = bannerStats(POOL, ERA_1960, ovrOf);
  assert.deepEqual(top.map((t) => `${t.name}:${t.season}`), ["Bill Russell:1962", "Jerry West:1965", "John Havlicek:1968"]);
});

test("a wished person: how many of their cards are in this banner (null when no wish)", () => {
  assert.equal(bannerStats(POOL, ERA_1960, ovrOf, "russebi01").wishCards, 2);
  assert.equal(bannerStats(POOL, ERA_1960, ovrOf, "curryst01").wishCards, 0);
  assert.equal(bannerStats(POOL, ERA_1960, ovrOf).wishCards, null);
});

test("team banners never include the mid-season 'NBA' total rows", () => {
  const team = { id: "team-BOS", kind: "team", codes: ["BOS"] };
  assert.equal(bannerStats(POOL, team, ovrOf).cards, 3);
  assert.equal(bannerStats(POOL, { id: "team-x", kind: "team", codes: ["NBA"] }, ovrOf).cards, 1, "only an explicit NBA code reaches them");
  for (const banner of currentBanners()) if (banner.kind === "team") assert.ok(!banner.codes.includes("NBA"));
});

test("daysUntilRotation counts 7..1 across a week and rolls over", () => {
  const week0 = new Date(Date.UTC(2024, 0, 1, 0, 0, 1)); // just after a rotation
  assert.equal(daysUntilRotation(week0), 7);
  assert.equal(daysUntilRotation(new Date(Date.UTC(2024, 0, 4, 12))), 4);
  assert.equal(daysUntilRotation(new Date(Date.UTC(2024, 0, 7, 23, 59))), 1);
  const nextWeek = new Date(Date.UTC(2024, 0, 8, 0, 0, 1));
  assert.equal(weekIndex(nextWeek), weekIndex(week0) + 1);
  assert.equal(daysUntilRotation(nextWeek), 7);
});

// ---- view ----
import { bannerExplainHtml, bannerPickerHtml } from "../js/ui/gachaView.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stats = bannerStats(POOL, ERA_1960, ovrOf, "russebi01");
const ERA = { id: "era-1960", kind: "era", decade: 1960, name: "本周年代池 · 1960年代" };

test("era explanation says rarity is pool-relative, lists the best cards and days left", () => {
  const html = bannerExplainHtml(ERA, stats, { days: 3, wishName: "Bill Russell" }, esc);
  assert.match(html, /本池内排名/);
  assert.match(html, /不等于 OVR 96\+/);
  assert.match(html, /还剩 3 天轮换/);
  assert.match(html, /Bill Russell 1962（OVR 95）/);
  assert.match(html, /新手保底那一抽不论选哪个池/);
});

test("standard explanation says rarity is absolute OVR with the real thresholds", () => {
  const html = bannerExplainHtml({ id: "standard", kind: "standard", name: "全历史常驻池" }, stats, {}, esc);
  assert.match(html, /绝对 OVR/);
  assert.match(html, /神话\+ 96\+/);
  assert.doesNotMatch(html, /轮换/);
});

test("wish line: in the pool / not in the pool / no wish yet", () => {
  const inPool = bannerExplainHtml(ERA, bannerStats(POOL, ERA_1960, ovrOf, "russebi01"), { days: 2, wishName: "Bill Russell" }, esc);
  assert.match(inPool, /本池有 2 张他的卡/);
  const missing = bannerExplainHtml(ERA, bannerStats(POOL, ERA_1960, ovrOf, "curryst01"), { days: 2, wishName: "Stephen Curry" }, esc);
  assert.match(missing, /没有<\/strong>他的卡/);
  const none = bannerExplainHtml(ERA, bannerStats(POOL, ERA_1960, ovrOf), { days: 2 }, esc);
  assert.match(none, /还没设心愿球员/);
});

test("names are escaped and the picker shows size + rotation per banner", () => {
  const evil = bannerExplainHtml(ERA, stats, { days: 1, wishName: "<img src=x>" }, esc);
  assert.doesNotMatch(evil, /<img/);
  const picker = bannerPickerHtml([ERA], "era-1960", esc, { stats: { "era-1960": stats }, days: 5 });
  assert.match(picker, /4 张 · 3 人 · 池内排名分档 · 5 天后轮换/);
  assert.equal(bannerExplainHtml(ERA, null, {}, esc), "");
});

import { EXTRA_DRAW, NEWBIE, PITY } from "../js/data/gacha.js";
import { MILESTONE_WINS, WELCOME_TICKETS } from "../js/data/dailyTasks.js";
import { drawRulesHtml } from "../js/ui/gachaView.js";

test("rules copy is built from the real constants (cannot drift from the code)", () => {
  const html = drawRulesHtml().replace(/<[^>]+>/g, "");
  assert.match(html, new RegExp(`¤${EXTRA_DRAW.cost}/次，每天最多 ${EXTRA_DRAW.perDay} 次`));
  assert.match(html, new RegExp(`新手礼包 ${WELCOME_TICKETS} 张`));
  assert.match(html, new RegExp(`每 ${MILESTONE_WINS} 胜 \\+1`));
  assert.match(html, new RegExp(`新手前 ${NEWBIE.allstarByPull} 抽必出 85\\+`));
  assert.match(html, new RegExp(`每 ${PITY.allstarEvery} 抽必出全明星\\+，${PITY.legendAt} 抽必出传奇\\+`));
  assert.match(html, /抽卡券/);
  assert.match(html, /教练卡也算一抽/);
  assert.doesNotMatch(html, /每天免费 1 抽，之后可用金币加抽/, "the stale pre-ticket copy is gone");
});

test("large numbers are formatted the same way in the picker and the panel", () => {
  const big = { cards: 23452, people: 4398, top: [], wishCards: null };
  const picker = bannerPickerHtml([{ id: "standard", kind: "standard", name: "全历史常驻池" }], "standard", esc, { stats: { standard: big }, days: 3 });
  assert.match(picker, /23,452 张/);
  const era = { cards: 3138, people: 976, top: [], wishCards: null };
  assert.match(bannerExplainHtml(ERA, era, { days: 4 }, esc), /3,138 张赛季卡、976 位球员/);
});
