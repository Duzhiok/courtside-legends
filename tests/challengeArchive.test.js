// B50: a finished gold-challenge run leaves a read-only record instead of vanishing with its save slot.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const { createAccount, getAccount } = await import("../js/data/account.js");
const { MAX_ARCHIVE, challengeArchiveEntry, normalizeArchive, readChallengeArchive, recordChallengeArchive } = await import("../js/data/challengeArchive.js");
const view = await import("../js/ui/myWorldView.js");

const CJK = /[\u4e00-\u9fff]/;
const players = [10, 30, 20].map((v, i) => ({ id: `p${i}`, name: `Star ${i}`, scoring: v + 60, three: v + 50, mid: v + 50, paint: v + 50, pass: 60, iq: 60, speed: 60, strength: 60, defense: 60, rebound: 60 }));
const run = (extra = {}) => ({ kind: "career", challengeTier: "gold", stageSize: 8, round: 2, losses: { you: 2 }, team: { name: "<b>Hawks</b>", players }, ...extra });

test("an entry keeps the outcome and a few facts, nothing that could resume the run", () => {
  const e = challengeArchiveEntry(run(), "eliminated", 1000);
  assert.equal(e.outcome, "eliminated");
  assert.equal(e.round, 2);
  assert.equal(e.losses, 2);
  assert.equal(e.finals, false);
  assert.equal(e.roster.length, 3);
  assert.ok(e.roster[0].ovr >= e.roster[1].ovr, "best player first");
  assert.deepEqual(Object.keys(e).sort(), ["finals", "finishedAt", "id", "losses", "outcome", "roster", "round", "teamName", "tier"]);
  assert.equal(challengeArchiveEntry(run({ stageSize: 2 }), "eliminated").finals, true);
  assert.equal(challengeArchiveEntry(run({ fromCustom: true, challengeTier: undefined }), "champion").tier, "custom");
  assert.equal(challengeArchiveEntry(run(), "continued"), null, "only real finishes");
  assert.equal(challengeArchiveEntry(null, "champion"), null);
});

test("records live on the account, newest first, once per id, capped, and survive a re-read", () => {
  const acc = createAccount("Arch");
  const a = challengeArchiveEntry(run(), "eliminated", 1);
  assert.equal(recordChallengeArchive(acc.id, a).changed, true);
  assert.equal(recordChallengeArchive(acc.id, a).changed, false, "same record twice is a no-op");
  const b = challengeArchiveEntry(run(), "champion", 2);
  recordChallengeArchive(acc.id, b);
  assert.deepEqual(readChallengeArchive(acc.id).map((e) => e.id), [b.id, a.id]);
  assert.equal(getAccount(acc.id).challengeArchive.length, 2);
  for (let i = 0; i < MAX_ARCHIVE + 5; i++) recordChallengeArchive(acc.id, challengeArchiveEntry(run(), "eliminated", 10 + i));
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

test("garbage in storage is dropped and storage failures never throw", () => {
  assert.deepEqual(normalizeArchive("nope"), []);
  assert.deepEqual(normalizeArchive([null, { id: 1 }, { id: "a", outcome: "won", finishedAt: 1 }, { id: "b", outcome: "champion", finishedAt: "x" }]), []);
  assert.equal(normalizeArchive([{ id: "ok", outcome: "champion", finishedAt: 1, roster: [null, { name: "A", ovr: "9" }] }])[0].roster.length, 1);
  assert.equal(recordChallengeArchive("no-such-account", challengeArchiveEntry(run(), "champion")).ok, false);
  assert.equal(recordChallengeArchive(null, null).ok, false);
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(readChallengeArchive(null), []);
  assert.equal(recordChallengeArchive(null, challengeArchiveEntry(run(), "champion")).ok, false);
  globalThis.localStorage = real;
});

test("My World lists records as read-only rows: no Continue/Delete/Claim, escaped, bilingual, capped at 5", () => {
  const list = normalizeArchive([1, 2, 3, 4, 5, 6, 7].map((i) => challengeArchiveEntry(run(), i === 1 ? "champion" : "eliminated", 100 + i)));
  for (const lang of ["zh", "en"]) {
    const html = view.gamesHtml({ archive: list, canClaim: true }, lang);
    assert.equal((html.match(/mw-archive/g) || []).length, 6, "5 rows + the 'older records' line");
    assert.doesNotMatch(html, /data-mw-action/, "a record has no buttons at all");
    assert.ok(!html.includes("<b>Hawks"), "team name escaped");
    assert.doesNotMatch(html, /No career in progress|还没有进行中的生涯/, "records are not 'nothing here'");
    if (lang === "en") assert.doesNotMatch(html.replace(/Star \d/g, ""), CJK, "English has no Chinese");
  }
  assert.match(view.gamesHtml({ archive: list.slice(0, 1) }, "zh"), /通关夺冠|淘汰出局/);
  assert.match(view.gamesHtml({ archive: [challengeArchiveEntry(run({ stageSize: 2 }), "eliminated")] }, "zh"), /总决赛出局/);
  assert.match(view.gamesHtml({ archive: [] }, "zh"), /还没有进行中的生涯/);
});

test("wiring: both ends of a finished run archive BEFORE clearing the slot; moving on to the next tier does not", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /archiveFinishedChallenge\(c, "eliminated"\);\s*clearSave\(\);/);
  assert.match(app, /archiveFinishedChallenge\(c, "champion"\);\s*clearSave\(\);/);
  assert.equal((app.match(/(?<!function )archiveFinishedChallenge\(c,/g) || []).length, 2, "exactly two call sites (no duplicate records)");
});
