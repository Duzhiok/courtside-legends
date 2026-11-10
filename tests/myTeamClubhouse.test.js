// My Team Clubhouse (integration sprint, workstream D): every displayed number comes from
// real account / season data — titles, W-L, MVP, starters, collection — nothing invented.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { installRealCards, realCards } = await import("./helpers/realGame.js");
const { overall } = await import("../js/data/players.js");
const { autoLineup } = await import("../js/myteam/lineup.js");
const store = await import("../js/myteam/lineupStore.js");
const view = await import("../js/ui/myTeamClubhouseView.js");

const CJK = /[\u4e00-\u9fff]/;
const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
installRealCards(...STARS);
const peak = (bref) => realCards(bref).sort((a, b) => overall(b) - overall(a))[0];
const idsOf = (...brefs) => brefs.map((b) => peak(b).id);
const acct = (extra = {}) => ({ id: "acc-t", playerIds: idsOf(...STARS), cardMods: {}, gold: 5, ...extra });
const record = (over = {}) => ({
  seasonId: `s-${Math.random()}`, variant: "quick", games: 20, w: 14, l: 6,
  champion: false, finish: "playoffs", rank: 2, star: { name: "Stephen Curry", ppg: 28.5 }, finishedAt: Date.now(), ...over,
});

test("hero counts titles from real records only; no seasons means no trophy is drawn", () => {
  const none = view.clubhouseSummary(acct({ myTeamSeasons: [] }));
  assert.equal(none.titles, 0);
  assert.equal(none.played, 0);
  assert.equal(none.latest, null);
  const html = view.clubhouseHtml({ summary: none, lang: "zh" });
  assert.doesNotMatch(html, /🏆/, "no trophy without a real title");
  assert.match(html, /还没有总冠军/);

  const two = view.clubhouseSummary(acct({ myTeamSeasons: [record({ champion: true, finish: "champion", w: 18, l: 2 }), record({ champion: true, finish: "champion" }), record({ champion: false, finish: "missed", w: 8, l: 12 })] }));
  assert.equal(two.titles, 2);
  assert.equal(two.played, 3);
  assert.equal(two.latest.w, 18);
  const html2 = view.clubhouseHtml({ summary: two, lang: "zh" });
  assert.match(html2, /<span class="mtc-titles-num">2<\/span>/);
  assert.match(html2, /最近赛季 18–2/, "latest W-L comes from the newest record");
  assert.match(html2, /20 场赛季已打 3 季 · 2 冠/);
});

test("the court shows the real starting five with photos and OVR; empty slots are honest", () => {
  const s = view.clubhouseSummary(acct());
  assert.equal(s.starters.length, 5);
  assert.equal(s.bench.length, 5);
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.equal((html.match(/mtc-court-card/g) || []).length, 5, "five starter cards on the court");
  for (const c of s.starters) assert.ok(html.includes(`data-card="${c.id}"`), "starter card carries its real id");
  assert.match(html, /OVR \d+/);
  assert.match(html, /换人/);

  const thin = view.clubhouseSummary(acct({ playerIds: idsOf("curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01") }));
  const thinHtml = view.clubhouseHtml({ summary: thin, lang: "zh" });
  assert.equal(thin.validation.eligible, true, "8 players is eligible");
  assert.equal((thinHtml.match(/mtc-court-card/g) || []).length, 5);
});

test("the swap picker lists bench players only — never a starter", () => {
  const s = view.clubhouseSummary(acct());
  const out = s.starters[0];
  const html = view.clubhouseHtml({ summary: s, swapFor: out.id, lang: "zh" });
  for (const b of s.bench) assert.ok(html.includes(`data-card="${b.id}"`), "bench player is offered");
  const picker = html.slice(html.indexOf("mtc-picker"));
  for (const st of s.starters) assert.ok(!picker.includes(`data-act="pick-bench" data-card="${st.id}"`), "a starter is never offered as his own replacement");
  assert.ok(picker.includes(`data-out="${out.id}"`), "the picker knows whom it replaces");
});

test("swap is an explicit save through the lineup store: out goes, bench comes in, starters stay five", async () => {
  const { toggleStarter } = await import("../js/myteam/lineup.js");
  const { createAccount, saveAccount, getAccount } = await import("../js/data/account.js");
  const a = createAccount("SwapTest");
  a.playerIds = idsOf(...STARS);
  saveAccount(a);
  const draft = autoLineup(a);
  const out = draft.starterIds[0];
  const benchId = draft.rosterIds.find((id) => !draft.starterIds.includes(id));
  const stepped = toggleStarter(draft, out);
  assert.equal(stepped.blocked, undefined);
  const swapped = toggleStarter(stepped.draft, benchId);
  assert.equal(swapped.blocked, undefined);
  assert.equal(swapped.draft.starterIds.length, 5);
  assert.ok(!swapped.draft.starterIds.includes(out));
  assert.ok(swapped.draft.starterIds.includes(benchId));
  const res = store.saveMyTeamLineup(a.id, swapped.draft);
  assert.equal(res.ok, true);
  const reloaded = getAccount(a.id);
  assert.deepEqual(reloaded.myTeamLineup.starterIds, swapped.draft.starterIds);
  assert.equal(reloaded.myTeamLineup.rosterIds.length, draft.rosterIds.length, "roster untouched by a swap");
});

test("collection wall shows real OVR and names; skill names come from the card's own skill ids", () => {
  const s = view.clubhouseSummary(acct());
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.match(html, /共 10 张球员卡/);
  assert.equal((html.match(/mtc-wall-card/g) || []).length, 10, "all ten owned cards on the wall");
  for (const c of s.cards.slice(0, 3)) assert.ok(html.includes(`OVR ${overall(c)}`), "OVR is the card's real overall");
  assert.deepEqual(view.cardSkillNames({ skills: ["clutch_killer", "mid_maestro", "nope"] }, "zh"), ["杀手时刻", "中投大师"]);
  assert.deepEqual(view.cardSkillNames({ skills: ["clutch_killer"] }, "en"), ["Clutch Killer"]);
  assert.deepEqual(view.cardSkillNames({ skills: [] }), []);
});

test("MVP is shown only from a real live report; past records never invent one", () => {
  const report = { w: 16, l: 4, rank: 1, teams: 8, finish: "champion", players: [], star: null, mvp: { name: "LeBron James", mine: true, ppg: 31.2 }, objectives: [] };
  const season = { myTeam: { result: { champion: true }, goldEarned: 120, goldParts: null } };
  const s = view.clubhouseSummary(acct({ myTeamSeasons: [record({ champion: true })] }), { season, report });
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.match(html, /LeBron James/);
  assert.match(html, /是你的球员/);

  const noMvp = view.clubhouseSummary(acct({ myTeamSeasons: [record({ champion: true })] }), { season, report: { ...report, mvp: null } });
  assert.doesNotMatch(view.clubhouseHtml({ summary: noMvp, lang: "zh" }), /联赛 MVP/);
});

test("season center: eligible lineups can start, ineligible ones show the real blockers, a live season continues", () => {
  const ready = view.clubhouseSummary(acct());
  const readyHtml = view.clubhouseHtml({ summary: ready, lang: "zh" });
  assert.match(readyHtml, /data-act="start-quick"/);
  assert.doesNotMatch(readyHtml, /data-act="start-quick" disabled/, "eligible lineup: start is enabled");

  const thin = view.clubhouseSummary(acct({ playerIds: idsOf("curryst01") }));
  const thinHtml = view.clubhouseHtml({ summary: thin, lang: "zh" });
  assert.match(thinHtml, /名单还差 7 人/, "the real blocker is named");
  assert.doesNotMatch(thinHtml, /data-act="start-quick"/, "ineligible lineup: no start button at all");

  const live = view.clubhouseSummary(acct(), { season: { myTeam: {} }, report: { w: 5, l: 2, rank: 3, teams: 8, finish: "pending", players: [], star: null, mvp: null, objectives: [] } });
  const liveHtml = view.clubhouseHtml({ summary: live, resume: "第 8 场 · 5胜2负", lang: "zh" });
  assert.match(liveHtml, /继续我的赛季/);
  assert.match(liveHtml, /第 8 场 · 5胜2负/);
});

test("honours room lists real champion seasons; Finals appearances include the titles; past lineups are honestly absent", () => {
  const s = view.clubhouseSummary(acct({ myTeamSeasons: [
    record({ champion: true, finish: "champion", w: 18, l: 2 }),
    record({ champion: false, finish: "finals", w: 15, l: 5 }),
    record({ champion: false, finish: "missed", w: 8, l: 12 }),
  ] }));
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.match(html, /季后赛 2 次 · 总决赛 2 次 · 共打了 3 个赛季/, "one title + one lost Final = two Finals");
  assert.doesNotMatch(html, /没有存档|not stored/, "no developer-facing note leaks into the player UI");
  assert.doesNotMatch(html, /mtc-five|当年首发/, "records without a saved lineup show no lineup at all (nothing fabricated)");
});

test("guest sees an honest empty state and no fake team", () => {
  const s = view.clubhouseSummary(null);
  assert.equal(s.guest, true);
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.match(html, /创建 \/ 登录账号/);
  assert.doesNotMatch(html, /mtc-court-card|mtc-wall-card/, "no team is rendered for a guest");
});

test("every rendered clubhouse action has a handler; English has no Chinese left", async () => {
  const s = view.clubhouseSummary(acct());
  const html = view.clubhouseHtml({ summary: s, swapFor: s.starters[0].id, resume: "x", lang: "zh" });
  const known = ["accounts", "open-collection", "edit-lineup", "start-quick", "start-full", "resume-season", "swap", "pick-bench", "cancel-swap"];
  const handlerSource = (await import("node:fs")).readFileSync(new URL("../js/ui/myTeamClubhouseScreen.js", import.meta.url), "utf8");
  for (const [, name] of html.matchAll(/data-act="([^"]+)"/g)) {
    assert.ok(known.includes(name), name);
    assert.ok(handlerSource.includes(`"${name}"`), `${name} has no handler in myTeamClubhouseScreen.js`);
  }
  const en = view.clubhouseHtml({ summary: s, lang: "en" });
  assert.doesNotMatch(en, CJK);
});
