// B50: a finished gold-challenge run leaves a read-only record instead of vanishing with its save slot.
// Review fixes: dedup by runId, design fields (wins / gold / finals score / eliminated by, no lineup), all 20
// shown under a History head with View result + Delete.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const { createAccount, getAccount } = await import("../js/data/account.js");
const { MAX_ARCHIVE, challengeArchiveEntry, deleteChallengeArchive, makeRunId, normalizeArchive, readChallengeArchive, recordChallengeArchive } = await import("../js/data/challengeArchive.js");
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
