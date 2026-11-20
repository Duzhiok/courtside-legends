// B50: a finished gold-challenge run leaves a read-only record instead of vanishing with its save slot.
// Review fixes: dedup by runId, design fields (wins / gold / finals score / eliminated by, no lineup), all 20
// shown under a History head with View result + Delete.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const { createAccount, getAccount } = await import("../js/data/account.js");
const { MAX_ARCHIVE, challengeArchiveEntry, deleteChallengeArchive, duelArchiveEntry, makeRunId, normalizeArchive, readChallengeArchive, recordChallengeArchive } = await import("../js/data/challengeArchive.js");
const view = await import("../js/ui/myWorldView.js");

const CJK = /[\u4e00-\u9fff]/;
const won = (opp) => ({ yours: true, done: true, winner: { name: "Hawks", bracketId: "you" }, loser: { name: opp, bracketId: "x" } });
const lost = (opp) => ({ yours: true, done: true, winner: { name: opp, bracketId: "x" }, loser: { name: "Hawks", bracketId: "you" } });
const run = (extra = {}) => ({
  kind: "career", challengeTier: "gold", stageSize: 8, round: 2, gold: 520, runId: "run-test-1",
  bracketLog: [{ matches: [won("Aces"), lost("Kings")] }],
  pods: [{ openerA: won("Queens"), openerB: null, winnersMatch: null, revivalMatch: null, deciderMatch: null }],
  team: { name: "<b>Hawks</b>" }, ...extra,
});

test("an entry keeps the design summary: outcome, W-L, gold, finals score, eliminated by -- no lineup", () => {
  const e = challengeArchiveEntry(run(), "eliminated", 1000);
  assert.equal(e.outcome, "eliminated");
  assert.equal(e.runId, "run-test-1");
  assert.equal(e.kind, "career");
  assert.equal(e.fieldSource, "random");
  assert.equal(e.round, 2);
  assert.equal(e.wins, 2, "one logged win + one current-pod win");
  assert.equal(e.losses, 1, "one logged loss, current stage not yet lost");
  assert.equal(e.gold, 520);
  assert.equal(e.finals, false);
  assert.equal(e.finalsScore, null);
  assert.equal(e.eliminatedBy, "Kings", "last lost match decides it");
  assert.deepEqual(Object.keys(e).sort(), ["eliminatedBy", "fieldSource", "finals", "finalsScore", "finishedAt", "gold", "id", "kind", "losses", "outcome", "round", "runId", "teamName", "tier", "wins"]);
  assert.equal(challengeArchiveEntry(run({ stageSize: 2, series: { wins: 2, losses: 1, opp: { name: "Rivals" } } }), "eliminated").finalsScore, "2-1");
  assert.equal(challengeArchiveEntry(run({ stageSize: 2, series: { wins: 2, losses: 1, opp: { name: "Rivals" } } }), "eliminated").eliminatedBy, "Rivals");
  assert.equal(challengeArchiveEntry(run({ stageSize: 2, series: { wins: 2, losses: 0, opp: { name: "Rivals" } } }), "champion").eliminatedBy, null);
  assert.equal(challengeArchiveEntry(run({ stageSize: 2, series: { wins: 2, losses: 0, opp: { name: "Rivals" } } }), "champion").finalsScore, "2-0");
  assert.equal(challengeArchiveEntry(run({ stageSize: 2, series: { wins: 1, losses: 2, opp: { name: "Rivals" } } }), "eliminated").wins, 2, "finals wins come from the series, not the pods");
  assert.equal(challengeArchiveEntry(run({ fromCustom: true, challengeTier: undefined }), "champion").tier, "custom");
  assert.match(makeRunId(1000), /^run-/);
  assert.equal(challengeArchiveEntry(run(), "continued"), null, "only real finishes");
  assert.equal(challengeArchiveEntry(null, "champion"), null);
  assert.match(challengeArchiveEntry(run({ runId: undefined }), "eliminated").runId, /^run-/, "a run without one gets minted at archive time");
});

test("records live on the account, newest first, once per runId, capped, and survive a re-read", () => {
  const acc = createAccount("Arch");
  const a = challengeArchiveEntry(run(), "eliminated", 1);
  assert.equal(recordChallengeArchive(acc.id, a).changed, true);
  assert.equal(recordChallengeArchive(acc.id, a).changed, false, "same record twice is a no-op");
  const again = challengeArchiveEntry(run(), "eliminated", 9999); // same runId, fresh entry id
  assert.notEqual(again.id, a.id);
  assert.equal(recordChallengeArchive(acc.id, again).changed, false, "same runId twice is a no-op (double tap)");
  const b = challengeArchiveEntry(run({ runId: "run-test-2" }), "champion", 2);
  recordChallengeArchive(acc.id, b);
  assert.deepEqual(readChallengeArchive(acc.id).map((e) => e.id), [b.id, a.id]);
  assert.equal(getAccount(acc.id).challengeArchive.length, 2);
  for (let i = 0; i < MAX_ARCHIVE + 5; i++) recordChallengeArchive(acc.id, challengeArchiveEntry(run({ runId: `run-cap-${i}` }), "eliminated", 10 + i));
  assert.equal(readChallengeArchive(acc.id).length, MAX_ARCHIVE);
});

test("accounts do not see each other's records; a guest keeps a separate device list", () => {
  const x = createAccount("X");
  const y = createAccount("Y");
  recordChallengeArchive(x.id, challengeArchiveEntry(run(), "eliminated", 5));
  assert.equal(readChallengeArchive(y.id).length, 0);
  assert.equal(readChallengeArchive(null).length, 0);
  recordChallengeArchive(null, challengeArchiveEntry(run(), "champion", 6));
  assert.equal(readChallengeArchive(null).length, 1);
  assert.equal(readChallengeArchive(x.id).length, 1, "guest record is not on the account");
});

test("one record can be deleted by runId; a stale key is a no-op", () => {
  const acc = createAccount("Del");
  const a = challengeArchiveEntry(run({ runId: "run-del-1" }), "eliminated", 1);
  const b = challengeArchiveEntry(run({ runId: "run-del-2" }), "champion", 2);
  recordChallengeArchive(acc.id, a);
  recordChallengeArchive(acc.id, b);
  assert.equal(deleteChallengeArchive(acc.id, "run-del-1").changed, true);
  assert.deepEqual(readChallengeArchive(acc.id).map((e) => e.runId), ["run-del-2"]);
  assert.equal(deleteChallengeArchive(acc.id, "run-del-1").changed, false, "already gone");
  assert.equal(deleteChallengeArchive(acc.id, a.id).changed, false, "the other record stays");
  recordChallengeArchive(null, challengeArchiveEntry(run({ runId: "run-del-g" }), "champion", 3));
  assert.equal(deleteChallengeArchive(null, "run-del-g").changed, true);
  assert.ok(!readChallengeArchive(null).some((e) => e.runId === "run-del-g"), "the guest record is gone (other tests' guest records stay)");
});

test("garbage in storage is dropped, old records still read (roster retired), storage failures never throw", () => {
  assert.deepEqual(normalizeArchive("nope"), []);
  assert.deepEqual(normalizeArchive([null, { id: 1 }, { id: "a", outcome: "won", finishedAt: 1 }, { id: "b", outcome: "champion", finishedAt: "x" }]), []);
  const old = normalizeArchive([{ id: "ok", outcome: "champion", finishedAt: 1, roster: [{ name: "A", ovr: 90 }] }])[0];
  assert.equal(old.roster, undefined, "the retired lineup is not kept");
  assert.equal(old.runId, null, "pre-runId records read with a null runId and still dedup on id");
  assert.equal(recordChallengeArchive("no-such-account", challengeArchiveEntry(run(), "champion")).ok, false);
  assert.equal(recordChallengeArchive(null, null).ok, false);
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(readChallengeArchive(null), []);
  assert.equal(recordChallengeArchive(null, challengeArchiveEntry(run(), "champion")).ok, false);
  assert.equal(deleteChallengeArchive(null, "run-x").changed, false, "nothing stored, nothing to delete");
  globalThis.localStorage = real;
});

test("My World lists every record under a History head: View result + Delete, no Continue, escaped, bilingual", () => {
  const list = normalizeArchive([1, 2, 3, 4, 5, 6, 7].map((i) => challengeArchiveEntry(run({ runId: `run-view-${i}` }), i === 1 ? "champion" : "eliminated", 100 + i)));
  for (const lang of ["zh", "en"]) {
    const html = view.gamesHtml({ archive: list, canClaim: true }, lang);
    assert.equal((html.match(/mw-game mw-archive/g) || []).length, 7, "all 7 rows shown, none hidden behind a 5-cap");
    assert.doesNotMatch(html, /更早的记录|older record/, "no hidden-remainder line any more");
    assert.match(html, lang === "en" ? /History/ : /历史记录/, "its own section head");
    assert.match(html, lang === "en" ? /most recent 20/ : /最近 20 条/, "the retention note is written out");
    assert.match(html, lang === "en" ? /View result/ : /查看结果/, "a literal view entry");
    assert.match(html, lang === "en" ? /Delete/ : /删除/, "a delete entry");
    assert.doesNotMatch(html, /data-mw-action="resume-career"/, "a record has no Continue");
    assert.ok(!html.includes("<b>Hawks"), "team name escaped");
    assert.doesNotMatch(html, /No career in progress|还没有进行中的生涯/, "records are not 'nothing here'");
    if (lang === "en") assert.doesNotMatch(html, CJK, "English has no Chinese");
  }
  assert.match(view.gamesHtml({ archive: list.slice(0, 1) }, "zh"), /通关夺冠|淘汰出局/);
  assert.match(view.gamesHtml({ archive: [challengeArchiveEntry(run({ stageSize: 2, series: { wins: 1, losses: 2, opp: { name: "Rivals" } } }), "eliminated")] }, "zh"), /总决赛出局/);
  assert.match(view.gamesHtml({ archive: [challengeArchiveEntry(run({ stageSize: 2, series: { wins: 1, losses: 2, opp: { name: "Rivals" } } }), "eliminated")] }, "zh"), /Rivals/);
  assert.match(view.gamesHtml({ archive: [] }, "zh"), /还没有进行中的生涯/);
});

test("wiring: both ends of a finished run archive BEFORE clearing the slot; moving on to the next tier does not", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /archiveFinishedChallenge\(c, "eliminated"\);\s*clearSave\(\);/);
  assert.match(app, /archiveFinishedChallenge\(c, "champion"\);\s*clearSave\(\);/);
  assert.equal((app.match(/(?<!function )archiveFinishedChallenge\(c,/g) || []).length, 2, "exactly two call sites (no duplicate records)");
  assert.match(app, /runId: makeRunId\(\)/, "a new bracket mints its runId at boot");
  assert.match(app, /if \(c && !c\.runId\) c\.runId = makeRunId\(\);/, "a legacy run without one gets stamped at archive time");
});

// B50 leftovers: Duel (incl. the Custom hub entry -- same code path) archives one record per finished game;
// the budget-draft bracket is a kind "career" run, so its ends already flow through archiveFinishedChallenge
// with tier "custom" (pinned by the first test above).
const duel = (extra = {}) => ({
  kind: "duel", round: 1, gameId: "game-duel-1",
  teamA: { name: "玩家 A" }, teamB: { name: "玩家 B" }, ...extra,
});
const duelSnap = (home = 102, away = 98) => ({
  score: { home, away }, home: { name: "玩家 A" }, away: { name: "玩家 B" }, youSide: "home",
});

test("a duel game leaves a read-only record: scoreline, winner, per-game id -- no lineup, no gold", () => {
  const e = duelArchiveEntry(duel(), duelSnap(), 1000);
  assert.equal(e.kind, "duel");
  assert.equal(e.tier, "duel");
  assert.equal(e.outcome, "duel");
  assert.equal(e.runId, "game-duel-1", "the per-game id is the dedup key, not a fresh mint");
  assert.equal(e.homeName, "玩家 A");
  assert.equal(e.awayName, "玩家 B");
  assert.equal(e.homeScore, 102);
  assert.equal(e.awayScore, 98);
  assert.equal(e.winnerName, "玩家 A");
  assert.equal(e.teamName, "玩家 A", "compat: winner, for career-shaped readers");
  assert.equal(e.gold, 0, "market budgets are not winnings");
  assert.equal(e.finishedAt, 1000);
  assert.deepEqual(Object.keys(e).sort(), ["awayName", "awayScore", "eliminatedBy", "fieldSource", "finals", "finalsScore", "finishedAt", "gold", "homeName", "homeScore", "id", "kind", "losses", "outcome", "round", "runId", "teamName", "tier", "winnerName", "wins"]);
  const tie = duelArchiveEntry(duel(), duelSnap(100, 100), 1001);
  assert.equal(tie.winnerName, null, "a tie has no winner");
  assert.equal(tie.teamName, "玩家 A", "a tie falls back to the home name");
  assert.equal(duelArchiveEntry(duel({ gameId: undefined }), duelSnap(), 1002).runId.slice(0, 4), "run-", "a game without an id gets one minted at archive time");
  assert.equal(duelArchiveEntry(duel(), duelSnap(90, 110)).winnerName, "玩家 B", "the away side can win");
  assert.equal(duelArchiveEntry({ kind: "career" }, duelSnap()), null, "only duel states archive here");
  assert.equal(duelArchiveEntry(duel(), null), null, "no snapshot, no record");
  assert.equal(duelArchiveEntry(duel(), { score: { home: "x", away: 98 } }), null, "a non-numeric score is not a finish");
  assert.equal(duelArchiveEntry(duel(), { score: {} }), null);
  assert.equal(challengeArchiveEntry(duel(), "duel"), null, "the career builder never takes the duel outcome");
});

test("duel records share the store: newest first, once per gameId, capped, deletable, guests separate", () => {
  const acc = createAccount("DuelArch");
  const a = duelArchiveEntry(duel(), duelSnap(), 1);
  assert.equal(recordChallengeArchive(acc.id, a).changed, true);
  assert.equal(recordChallengeArchive(acc.id, duelArchiveEntry(duel(), duelSnap(), 9999)).changed, false, "same gameId twice is a no-op (double fire of the result screen)");
  const b = duelArchiveEntry(duel({ gameId: "game-duel-2" }), duelSnap(88, 95), 2);
  const c = challengeArchiveEntry(run({ runId: "run-mix-1" }), "champion", 3);
  recordChallengeArchive(acc.id, b);
  recordChallengeArchive(acc.id, c);
  assert.deepEqual(readChallengeArchive(acc.id).map((e) => e.id), [c.id, b.id, a.id], "career and duel records interleave newest first");
  assert.equal(readChallengeArchive(acc.id)[1].kind, "duel");
  assert.equal(deleteChallengeArchive(acc.id, "game-duel-2").changed, true);
  assert.deepEqual(readChallengeArchive(acc.id).map((e) => e.runId), ["run-mix-1", "game-duel-1"]);
  const kept = normalizeArchive([duelArchiveEntry(duel({ gameId: "game-n-1" }), duelSnap(1, 2), 5)]);
  assert.equal(kept[0].homeScore, 1);
  assert.equal(kept[0].winnerName, "玩家 B");
  assert.deepEqual(normalizeArchive([{ id: "x", outcome: "duel", finishedAt: 1 }])[0].kind, "duel", "the outcome alone identifies a duel record (kind missing)");
});

test("My World renders duel records under History: scoreline, no Continue, escaped, bilingual", () => {
  const enDuel = (extra = {}) => ({ kind: "duel", round: 1, gameId: "game-en-1", teamA: { name: "Player A" }, teamB: { name: "Player B" }, ...extra });
  const enSnap = (home, away) => ({ score: { home, away }, home: { name: "Player A" }, away: { name: "Player B" }, youSide: "home" });
  const list = normalizeArchive([
    duelArchiveEntry(enDuel(), enSnap(102, 98), 1000),
    duelArchiveEntry(enDuel({ gameId: "game-tie" }), enSnap(100, 100), 1001),
  ]);
  for (const lang of ["zh", "en"]) {
    const html = view.gamesHtml({ archive: list, canClaim: true }, lang);
    assert.equal((html.match(/mw-game mw-archive/g) || []).length, 2);
    assert.match(html, lang === "en" ? /Duel/ : /双人对抗/, "the duel kind is labelled, not shown as a gold tier");
    assert.match(html, /102–98/, "the scoreline is shown");
    assert.match(html, lang === "en" ? /View result/ : /查看结果/);
    assert.match(html, lang === "en" ? /Delete/ : /删除/);
    assert.doesNotMatch(html, /data-mw-action="resume-career"/, "a record has no Continue");
    if (lang === "en") assert.doesNotMatch(html, CJK, "English has no Chinese");
    const line = view.archiveSummaryLine(list[0], lang);
    assert.match(line, /102–98/);
    assert.match(line, lang === "en" ? /Duel/ : /双人对抗/);
    if (lang === "en") assert.doesNotMatch(line, CJK);
  }
  assert.match(view.gamesHtml({ archive: list }, "zh"), /平局/, "the tie row says so");
  const evil = duelArchiveEntry(duel({ teamA: { name: "<b>玩家 A</b>" }, teamB: { name: "玩家 B" } }), { score: { home: 102, away: 98 }, home: { name: "<b>玩家 A</b>" }, away: { name: "玩家 B" } }, 1000);
  const evilHtml = view.gamesHtml({ archive: normalizeArchive([evil]) }, "zh");
  assert.ok(!evilHtml.includes("<b>玩家 A"), "team names escaped");
  assert.match(evilHtml, /&lt;b&gt;玩家 A&lt;\/b&gt;/, "the evil name is shown escaped, not rendered");
  const career = normalizeArchive([challengeArchiveEntry(run({ runId: "run-line-1" }), "eliminated", 2000)])[0];
  assert.match(view.archiveSummaryLine(career, "zh"), /金币联赛/);
  assert.match(view.archiveSummaryLine(career, "zh"), /淘汰出局/);
  assert.match(view.archiveSummaryLine(career, "en"), /Gold League/);
  assert.match(view.archiveSummaryLine(career, "en"), /Eliminated/);
  assert.equal(view.archiveSummaryLine(null, "zh"), "");
});

test("wiring: a duel game archives at its result screen, keyed by the id minted at market-done; the home bar shows the latest record", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(state\.career\?\.kind === "duel"\) \{\s*archiveFinishedDuel\(state\.career, snap\);/, "the duel branch archives before wiring rematch");
  assert.match(app, /c\.gameId = makeRunId\(\);\s*openSetup\(c\.teamA, c\.teamB, "home"\);/, "market-done mints the per-game id before setup");
  assert.match(app, /const entry = duelArchiveEntry\(c, snap\);/, "the duel archiver builds the entry from the game snapshot");
  assert.match(app, /refreshLatestArchiveLine\(\);\s*const bar = \$\("#save-home-bar"\);/, "the latest line paints even with no save in progress");
  assert.match(app, /readChallengeArchive\(activeAccount\(\)\?\.id \?\? null\)\[0\]/, "the line reads the newest record for this account (guest: device list)");
  assert.match(app, /meta\.textContent = archiveSummaryLine\(latest, getLang\(\)\);/, "the line is plain text, set via textContent");
  assert.match(app, /\$\("#btn-view-latest-archive"\)\?\.addEventListener\("click", \(\) => \{\s*activateHomeTab\?\.\("world"\);/, "the line's button jumps to My World");
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(index, /id="save-home-latest"/, "the latest line has its own bar under the save bar");
  assert.match(index, /id="btn-view-latest-archive"/, "the jump button exists");
});
