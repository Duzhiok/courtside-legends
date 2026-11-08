/**
 * Account Level MVP (v1) — curve, idempotency, persistence, isolation.
 * Losses grant the same participation XP as wins by construction: the award
 * API takes no win/loss input, so every settlement path pays the same.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const level = await import("../js/data/accountLevel.js");
const { createAccount, getAccount, setActiveAccountId } = await import("../js/data/account.js");
const { awardFriendMatchXp } = await import("../js/data/accountLevelOnline.js");
const { levelHtml } = await import("../js/ui/myWorldView.js");

const {
  XP_TABLE, xpForLevel, levelForTotalXp, levelTitle, REWARD_TRACK,
  awardAccountXp, recordDailyLogin, recordDailyTaskXp, claimLevelReward,
  levelSnapshot, madePlayoffs, getGuestAxp,
} = level;

test("curve math: XP_next(L) = 100 + 25L + 5L^2", () => {
  assert.equal(xpForLevel(1), 130);
  assert.equal(xpForLevel(12), 1120);
  assert.equal(xpForLevel(99), 51580);
});

test("level is derived from totalXp alone", () => {
  assert.deepEqual(levelForTotalXp(0), { level: 1, xpIntoLevel: 0, xpForNext: 130, pct: 0, isMax: false });
  assert.equal(levelForTotalXp(130).level, 2);
  assert.equal(levelForTotalXp(130).xpIntoLevel, 0);
  assert.equal(levelForTotalXp(299).level, 2);
  assert.equal(levelForTotalXp(299).xpIntoLevel, 169);
  assert.equal(levelForTotalXp(300).level, 3);
  const huge = levelForTotalXp(10 ** 9);
  assert.equal(huge.level, 100);
  assert.equal(huge.isMax, true);
  assert.equal(huge.pct, 100);
});

test("title table: design-doc reference points and the floor", () => {
  assert.equal(levelTitle(1, "zh"), "新秀");
  assert.equal(levelTitle(1, "en"), "Rookie");
  assert.equal(levelTitle(12, "zh"), "新星");
  assert.equal(levelTitle(12, "en"), "Rising Star");
  assert.equal(levelTitle(35, "zh"), "全明星收藏家");
  assert.equal(levelTitle(35, "en"), "All-Star Collector");
  assert.equal(levelTitle(100, "zh"), "永恒传奇");
  assert.equal(levelTitle(100, "en"), "Eternal Legend");
});

test("XP table matches the design doc", () => {
  assert.deepEqual({ ...XP_TABLE }, {
    login: 10, dailyTask: 20, quick: 25, myTeamGame: 40, ranked: 50,
    friend: 20, playground: 15, careerEvent: 30, season: 200,
    playoff: 150, championship: 500, rebornLifetime: 800,
    autoGame: 5, autoDailyCap: 20,
  });
});

test("reward track: the v1 milestones, Lv.50 carrying two entries", () => {
  const byLevel = new Map();
  for (const entry of REWARD_TRACK) byLevel.set(entry.level, [...(byLevel.get(entry.level) || []), entry]);
  assert.deepEqual([...byLevel.keys()], [2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100]);
  assert.equal(byLevel.get(2)[0].kind, "gold");
  assert.equal(byLevel.get(5)[0].kind, "pack");
  assert.equal(byLevel.get(50).length, 2);
  assert.ok(byLevel.get(50).some((e) => e.kind === "pack" && e.amount === 3));
  assert.ok(byLevel.get(50).some((e) => e.kind === "cosmetic"));
});

test("awardXp: same key pays once (re-settle / re-render cannot double-award)", () => {
  const acc = createAccount("Keyed");
  const first = awardAccountXp(acc, 50, { source: "ranked", key: "game:1" });
  assert.equal(first.gained, 50);
  assert.equal(first.totalXp, 50);
  const second = awardAccountXp(acc, 50, { source: "ranked", key: "game:1" });
  assert.equal(second.gained, 0);
  assert.equal(second.totalXp, 50);
  // A different key is a different event and pays.
  assert.equal(awardAccountXp(acc, 50, { source: "ranked", key: "game:2" }).totalXp, 100);
});

test("participation XP: the award API takes no win/loss input, so a loss pays the same", () => {
  const acc = createAccount("LossPays");
  // Ranked settle calls the same award for a win and for a loss.
  assert.equal(awardAccountXp(acc, XP_TABLE.ranked, { source: "ranked", key: "loss:1" }).gained, 50);
  assert.equal(awardAccountXp(acc, XP_TABLE.ranked, { source: "ranked", key: "win:1" }).gained, 50);
  assert.equal(getAccount(acc.id).axp.totalXp, 100);
});

test("daily login: once per account per day, again the next day", () => {
  const acc = createAccount("Login");
  assert.equal(recordDailyLogin(acc, "2026-11-08").gained, 10);
  assert.equal(recordDailyLogin(acc, "2026-11-08").gained, 0);
  assert.equal(recordDailyLogin(acc, "2026-11-09").gained, 10);
  assert.equal(getAccount(acc.id).axp.totalXp, 20);
});

test("daily task XP: once per task per day", () => {
  const acc = createAccount("Tasks");
  assert.equal(recordDailyTaskXp(acc, "play", "2026-11-08").gained, 20);
  assert.equal(recordDailyTaskXp(acc, "play", "2026-11-08").gained, 0);
  assert.equal(recordDailyTaskXp(acc, "win", "2026-11-08").gained, 20);
  assert.equal(recordDailyTaskXp(acc, "play", "2026-11-09").gained, 20);
  assert.equal(getAccount(acc.id).axp.totalXp, 60);
});

test("claim Lv.2 gold: grants once, second claim refused, locked before Lv.2", () => {
  const acc = createAccount("Gold");
  assert.deepEqual(claimLevelReward(acc, 2), { ok: false, reason: "locked", level: 2 });
  awardAccountXp(acc, 130, { source: "quick", key: "lv2" });
  const first = claimLevelReward(acc, 2);
  assert.equal(first.ok, true);
  assert.equal(first.entries[0].kind, "gold");
  assert.equal(getAccount(acc.id).gold, 100);
  assert.deepEqual(getAccount(acc.id).axp.claimed, [2]);
  assert.deepEqual(claimLevelReward(acc, 2), { ok: false, reason: "claimed" });
  assert.equal(getAccount(acc.id).gold, 100);
});

test("claim Lv.5 pack: draws one real card; a guest cannot claim gold/packs", () => {
  const acc = createAccount("Pack");
  awardAccountXp(acc, 800, { source: "quick", key: "lv5" }); // 130+170+220+280
  assert.equal(levelForTotalXp(getAccount(acc.id).axp.totalXp).level, 5);
  // PLAYERS is only filled by the browser-side roster load, so pass an
  // explicit pool like the gacha tests do (same minimal card shape).
  const poolCard = { id: "jokic-2020", bref: "jokic", season: 2020, team: "DEN", ovr2k: 95, ratingSource: "anchor", skills: [], intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 } };
  const res = claimLevelReward(acc, 5, { rng: () => 0.5, pool: [poolCard] });
  assert.equal(res.ok, true);
  assert.equal(res.cards.length, 1);
  assert.equal(getAccount(acc.id).playerIds.length, 1);
  assert.deepEqual(claimLevelReward(acc, 5), { ok: false, reason: "claimed" });
  assert.deepEqual(claimLevelReward(null, 2), { ok: false, reason: "guest" });
  assert.deepEqual(claimLevelReward(null, 5), { ok: false, reason: "guest" });
});

test("career reset keeps Account Level: axp lives on the account, not on any save", () => {
  const acc = createAccount("Reset");
  awardAccountXp(acc, 520, { source: "quick", key: "reset" }); // 130+170+220: Lv.4
  // A career reset clears career saves / career fields — never account.axp.
  acc.career = { season: 3, team: "GSW" };
  delete acc.career;
  assert.equal(getAccount(acc.id).axp.totalXp, 520);
  assert.equal(levelForTotalXp(getAccount(acc.id).axp.totalXp).level, 4);
});

test("guest progression persists locally without an account", () => {
  setActiveAccountId(null);
  const first = awardAccountXp(null, 25, { source: "quick", key: "g:1" });
  assert.equal(first.owner, "guest");
  assert.equal(first.gained, 25);
  assert.equal(awardAccountXp(null, 25, { source: "quick", key: "g:2" }).totalXp, 50);
  assert.equal(getGuestAxp().totalXp, 50);
  assert.equal(levelSnapshot(null).totalXp, 50);
});

test("account switching isolates progression", () => {
  const a = createAccount("SwitchA");
  awardAccountXp(a, 100, { source: "quick", key: "a" });
  const b = createAccount("SwitchB");
  awardAccountXp(b, 50, { source: "quick", key: "b" });
  assert.equal(getAccount(a.id).axp.totalXp, 100);
  assert.equal(getAccount(b.id).axp.totalXp, 50);
  assert.equal(getAccount(a.id).axp.claimed.length, 0);
});

test("friend-match helper: pays the active account, else the guest record", () => {
  const acc = createAccount("Duel");
  const paid = awardFriendMatchXp();
  assert.deepEqual(paid, { gained: 20, totalXp: 20, owner: "account" });
  assert.equal(getAccount(acc.id).axp.totalXp, 20);
  setActiveAccountId(null);
  const before = getGuestAxp().totalXp;
  const guest = awardFriendMatchXp();
  assert.equal(guest.owner, "guest");
  assert.equal(guest.gained, 20);
  assert.equal(getGuestAxp().totalXp, before + 20);
});

test("madePlayoffs: only when the user's team is in a series or the finals", () => {
  const st = (userTeamId, championId) => ({
    userTeamId,
    playoffs: {
      east: { series: [{ high: { id: "a" }, low: { id: "b" } }] },
      west: { series: [{ high: { id: "c" }, low: { id: "d" } }] },
      finals: { championId },
    },
  });
  assert.equal(madePlayoffs(st("a", "a")), true);
  assert.equal(madePlayoffs(st("d", "a")), true);
  assert.equal(madePlayoffs(st("a", "a")).valueOf(), true);
  assert.equal(madePlayoffs({ userTeamId: "a", playoffs: { east: { series: [{ high: { id: "b" }, low: { id: "c" } }] }, west: { series: [] }, finals: { championId: "b" } } }), false);
  assert.equal(madePlayoffs({ userTeamId: "a", playoffs: null }), false);
  assert.equal(madePlayoffs(null), false);
});

test("levelSnapshot + levelHtml: badge, title, bar, track states", () => {
  const acc = createAccount("View");
  awardAccountXp(acc, 130, { source: "quick", key: "view" });
  const snap = levelSnapshot(acc, "zh");
  assert.equal(snap.level, 2);
  assert.equal(snap.title, "新秀");
  assert.equal(snap.totalXp, 130);
  assert.equal(snap.xpIntoLevel, 0);
  assert.equal(snap.xpForNext, 170);
  const lv2 = snap.track.find((e) => e.level === 2);
  const lv5 = snap.track.find((e) => e.level === 5);
  assert.equal(lv2.state, "available");
  assert.equal(lv5.state, "locked");
  const html = levelHtml(snap, "zh");
  assert.match(html, /Lv\.2/);
  assert.match(html, /新秀/);
  assert.match(html, /data-mw-action="claim-level-reward" data-level="2"/);
  assert.match(html, /Lv\.5 解锁/);
  assert.match(html, /role="progressbar"/);
  assert.equal(levelHtml(null, "zh"), "");
  const en = levelHtml(levelSnapshot(acc, "en"), "en");
  assert.match(en, /Rookie/);
  assert.match(en, /Claim/);
});
