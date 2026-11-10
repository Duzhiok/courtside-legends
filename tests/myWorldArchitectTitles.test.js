/**
 * My World honours wall: Prestige (Architect) titles (workstream E follow-up).
 *
 * Pins: the Legacy card shows the account's earned Architect titles
 * (derived from its completed-career records, never a stored boolean);
 * before the unlock it shows honest Coach/GM progress instead of titles;
 * a Classic GM + Coach completion does not qualify; guests see no block.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { architectTitlesHtml, legacyFromAccount, legacyHtml } from "../js/ui/myWorldView.js";

function completion({ careerId, role, prestige = false, championships = 0 }) {
  return { careerId, role, prestige, year: 2001, seasons: 3, championships, tier: "contender", reason: "voluntary", at: 1 };
}

const account = (completions = []) => ({ playerIds: [], careerCompletions: completions });

// ---------------------------------------------------------------- derivation

test("legacyFromAccount: architect summary derives from completion records; guest is null", () => {
  assert.equal(legacyFromAccount(null), null);
  const locked = legacyFromAccount(account());
  assert.deepEqual(locked.architect.earned, []);
  assert.deepEqual(locked.architect.progress, { coach: false, gm: false, completed: 0 });
  const unlocked = legacyFromAccount(account([
    completion({ careerId: "c1", role: "COACH" }),
    completion({ careerId: "c2", role: "GM" }),
  ]));
  assert.deepEqual(unlocked.architect.earned.map((t) => t.id), ["architect"]);
  assert.deepEqual(unlocked.architect.progress, { coach: true, gm: true, completed: 2 });
});

test("legacyFromAccount: prestige completions feed the dynasty titles", () => {
  const legacy = legacyFromAccount(account([
    completion({ careerId: "c1", role: "COACH" }),
    completion({ careerId: "c2", role: "GM" }),
    completion({ careerId: "c3", role: "GM_COACH", prestige: true, championships: 1 }),
  ]));
  assert.deepEqual(legacy.architect.earned.map((t) => t.id), ["architect", "dynasty-master", "basketball-immortal"]);
});

test("legacyFromAccount: a Classic GM + Coach completion alone qualifies for nothing", () => {
  const legacy = legacyFromAccount(account([completion({ careerId: "c1", role: "GM_COACH" })]));
  assert.deepEqual(legacy.architect.earned, []);
  assert.deepEqual(legacy.architect.progress, { coach: false, gm: false, completed: 0 });
});

// ---------------------------------------------------------------- rendering

test("architectTitlesHtml: locked account shows progress, no title; halfway marks the done half", () => {
  const locked = architectTitlesHtml({ earned: [], progress: { coach: false, gm: false, completed: 0 } }, "zh");
  assert.match(locked, /建筑师称号/);
  assert.match(locked, /教练生涯 ○/);
  assert.match(locked, /经理生涯 ○/);
  assert.doesNotMatch(locked, /👑/);
  const halfway = architectTitlesHtml({ earned: [], progress: { coach: true, gm: false, completed: 1 } }, "en");
  assert.match(halfway, /Coach career ✓/);
  assert.match(halfway, /GM career ○/);
});

test("architectTitlesHtml: unlocked account lists earned titles in the page language", () => {
  const zh = architectTitlesHtml({ earned: [{ id: "architect", zh: "王朝缔造者", en: "The Architect" }] }, "zh");
  assert.match(zh, /👑 王朝缔造者/);
  assert.doesNotMatch(zh, /The Architect/);
  const en = architectTitlesHtml(
    { earned: [{ id: "architect", zh: "王朝缔造者", en: "The Architect" }, { id: "dynasty-master", zh: "传奇掌舵者", en: "Dynasty Master" }] },
    "en",
  );
  assert.match(en, /👑 The Architect/);
  assert.match(en, /👑 Dynasty Master/);
});

test("architectTitlesHtml: no block for guests", () => {
  assert.equal(architectTitlesHtml(null, "zh"), "");
  assert.equal(architectTitlesHtml(undefined, "en"), "");
});

test("legacyHtml: the Legacy card carries the titles block for accounts, none for guests", () => {
  const withTitles = legacyHtml(
    legacyFromAccount(account([completion({ careerId: "c1", role: "COACH" }), completion({ careerId: "c2", role: "GM" })])),
    null,
    "zh",
  );
  assert.match(withTitles, /👑 王朝缔造者/);
  const locked = legacyHtml(legacyFromAccount(account()), null, "zh");
  assert.match(locked, /教练生涯 ○ · 经理生涯 ○/);
  assert.doesNotMatch(locked, /👑/);
  const guest = legacyHtml(null, null, "zh");
  assert.match(guest, /访客没有永久收藏/);
  assert.doesNotMatch(guest, /建筑师称号/);
});
