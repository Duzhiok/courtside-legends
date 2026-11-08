import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { installRealCards, realCards } = await import("./helpers/realGame.js");
const { overall } = await import("../js/data/players.js");
const { accountToTeam, createAccount, getAccount, saveAccount, setActiveAccountId } = await import("../js/data/account.js");
const lineup = await import("../js/myteam/lineup.js");
const store = await import("../js/myteam/lineupStore.js");
const { MY_TEAM_RULES, autoLineup, ownedCards, resolveSavedLineup, sanitizeDraft, toggleRoster, toggleStarter, validateMyTeamLineup } = lineup;

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
installRealCards(...STARS);
const peak = (bref) => realCards(bref).sort((a, b) => overall(b) - overall(a))[0];
const idsOf = (...brefs) => brefs.map((b) => peak(b).id);
const acct = (extra = {}) => ({ id: "acc-t", playerIds: idsOf(...STARS), cardMods: {}, gold: 5, ...extra });
const validDraft = (a) => autoLineup(a);

test("the auto lineup is 5 starters inside a roster of at most 12, one card per person", () => {
  const a = acct();
  const d = autoLineup(a);
  assert.equal(d.starterIds.length, MY_TEAM_RULES.starters);
  assert.ok(d.rosterIds.length >= MY_TEAM_RULES.minRoster && d.rosterIds.length <= MY_TEAM_RULES.maxRoster);
  assert.ok(d.starterIds.every((id) => d.rosterIds.includes(id)));
  const people = d.rosterIds.map((id) => ownedCards(a).find((c) => c.id === id).bref);
  assert.equal(new Set(people).size, people.length);
  assert.equal(validateMyTeamLineup(a, d).eligible, true);
});

test("8-12 players is the eligibility window: 7 and 13 are blocked, 8 and 12 pass", () => {
  const a = acct({ playerIds: idsOf(...STARS) });
  const all = autoLineup(a).rosterIds;
  const withN = (n) => ({ rosterIds: all.slice(0, n), starterIds: all.slice(0, 5) });
  assert.equal(validateMyTeamLineup(a, withN(7)).issues.find((i) => i.code === "roster_small").have, 7);
  assert.equal(validateMyTeamLineup(a, withN(8)).eligible, true);
  assert.equal(validateMyTeamLineup(a, withN(10)).eligible, true);
  // 13 distinct people do not exist in this fixture, so prove the upper bound with a custom rule set.
  const tight = { minRoster: 2, maxRoster: 3, starters: 2 };
  const v = validateMyTeamLineup(a, { rosterIds: all.slice(0, 4), starterIds: all.slice(0, 2) }, tight);
  assert.ok(v.issues.some((i) => i.code === "roster_large" && i.max === 3));
});

test("exactly 5 starters: 4 and 6 are blocked, starters must be on the roster", () => {
  const a = acct();
  const d = validDraft(a);
  const codes = (draft) => validateMyTeamLineup(a, draft).issues.map((i) => i.code);
  assert.ok(codes({ ...d, starterIds: d.starterIds.slice(0, 4) }).includes("starters_count"));
  assert.ok(codes({ ...d, starterIds: [...d.starterIds, d.rosterIds.find((id) => !d.starterIds.includes(id))] }).includes("starters_count"));
  const outsider = idsOf("garneke01")[0];
  const without = { rosterIds: d.rosterIds.filter((id) => id !== outsider), starterIds: [...d.starterIds.slice(0, 4), outsider] };
  assert.ok(codes(without).includes("starter_not_in_roster"));
});

test("a second card of the same person is blocked in validation and replaces the first in the editor", () => {
  const two = realCards("jordami01").sort((x, y) => overall(y) - overall(x)).slice(0, 2).map((c) => c.id);
  const a = acct({ playerIds: [...two, ...idsOf(...STARS.filter((s) => s !== "jordami01"))] });
  const base = autoLineup(a);
  const twin = validateMyTeamLineup(a, { rosterIds: [...base.rosterIds, ...two.filter((id) => !base.rosterIds.includes(id))], starterIds: base.starterIds });
  assert.ok(twin.issues.some((i) => i.code === "duplicate_person" && i.people.includes("jordami01")));
  const first = toggleRoster(a, { rosterIds: [], starterIds: [] }, two[0]).draft;
  const swapped = toggleRoster(a, first, two[1]);
  assert.deepEqual(swapped.draft.rosterIds, [two[1]]);
  assert.equal(swapped.replaced, two[0]);
});

test("cards the account does not own are blocked and never enter a sanitised draft", () => {
  const a = acct({ playerIds: idsOf("curryst01") });
  const stolen = idsOf("jordami01")[0];
  const v = validateMyTeamLineup(a, { rosterIds: [stolen], starterIds: [stolen] });
  assert.ok(v.issues.some((i) => i.code === "not_owned"));
  assert.deepEqual(sanitizeDraft(a, { rosterIds: [stolen, "nonsense", 7, null], starterIds: [stolen] }).draft, { rosterIds: [], starterIds: [] });
  assert.equal(toggleRoster(a, { rosterIds: [], starterIds: [] }, stolen).blocked, "not_owned");
});

test("a guest has no lineup; an incomplete lineup is still editable and merely not eligible", () => {
  const g = validateMyTeamLineup(null, { rosterIds: ["x"], starterIds: [] });
  assert.equal(g.eligible, false);
  assert.deepEqual(g.issues.map((i) => i.code), ["guest"]);
  const a = acct({ playerIds: idsOf("curryst01", "jordami01", "jamesle01") });
  const d = autoLineup(a);
  const v = validateMyTeamLineup(a, d);
  assert.equal(v.eligible, false);
  assert.equal(v.counts.roster, 3);
  assert.ok(v.issues.some((i) => i.code === "roster_small") && v.issues.some((i) => i.code === "starters_count"));
  const r = toggleStarter(d, d.rosterIds[0]);
  assert.ok(r.draft.starterIds.length < d.starterIds.length, "editing an incomplete lineup works");
});

test("position oddities only warn, they never block", () => {
  const bigs = ["duncati01", "onealsh01", "olajuha01", "garneke01"];
  const a = acct();
  const rows = ownedCards(a);
  const d = autoLineup(a);
  const stack = rows.filter((c) => bigs.includes(c.bref)).map((c) => c.id);
  const draft = { rosterIds: [...new Set([...stack, ...d.rosterIds])].slice(0, 10), starterIds: stack.slice(0, 5) };
  const v = validateMyTeamLineup(a, { rosterIds: draft.rosterIds, starterIds: [...stack.slice(0, 4), draft.rosterIds.find((id) => !stack.includes(id))] });
  assert.equal(v.eligible, true);
  assert.ok(v.issues.some((i) => i.level === "warn"));
  assert.ok(v.issues.every((i) => i.level === "warn"));
});

test("a coach the account does not own blocks; the default (no coach) does not", () => {
  const a = acct();
  const d = autoLineup(a);
  assert.equal(validateMyTeamLineup(a, d).eligible, true);
  assert.ok(validateMyTeamLineup({ ...a, coachId: "phil-2000-lal", coachIds: [] }, d).issues.some((i) => i.code === "coach_not_owned"));
  assert.equal(validateMyTeamLineup({ ...a, coachId: "phil-2000-lal", coachIds: ["phil-2000-lal"] }, d).eligible, true);
});

test("the limits are the My Team configuration, passed in: a different rule set changes the verdict", () => {
  const a = acct();
  const d = autoLineup(a);
  assert.equal(validateMyTeamLineup(a, d, { minRoster: 11, maxRoster: 15, starters: 5 }).eligible, false);
  assert.equal(validateMyTeamLineup(a, d, { minRoster: 8, maxRoster: 15, starters: 5 }).eligible, true);
});

test("pure: validating, auto-filling and toggling leave the account byte-identical", () => {
  const a = acct({ myTeamLineup: { rosterIds: ["junk"], starterIds: [], savedAt: 1 } });
  const before = JSON.stringify(a);
  validateMyTeamLineup(a, autoLineup(a));
  resolveSavedLineup(a);
  toggleRoster(a, autoLineup(a), idsOf("garneke01")[0]);
  toggleStarter(autoLineup(a), autoLineup(a).rosterIds[0]);
  sanitizeDraft(a, { rosterIds: ["x"] });
  assert.equal(JSON.stringify(a), before);
});

test("an old account without myTeamLineup falls back to the auto lineup; a stale one is repaired, not rejected", () => {
  const a = acct();
  const none = resolveSavedLineup(a);
  assert.equal(none.source, "auto");
  assert.deepEqual(none.draft, autoLineup(a));
  const good = autoLineup(a);
  const stale = resolveSavedLineup({ ...a, myTeamLineup: { rosterIds: [...good.rosterIds, "sold-card"], starterIds: good.starterIds } });
  assert.equal(stale.source, "repaired");
  assert.equal(stale.dropped, 1);
  assert.deepEqual(stale.draft.rosterIds, good.rosterIds);
  assert.equal(resolveSavedLineup({ ...a, myTeamLineup: { rosterIds: ["gone"], starterIds: [] } }).source, "auto");
  assert.equal(resolveSavedLineup({ ...a, myTeamLineup: "garbage" }).source, "auto");
  const saved = resolveSavedLineup({ ...a, myTeamLineup: { rosterIds: good.rosterIds, starterIds: good.starterIds } });
  assert.equal(saved.source, "saved");
});

test("only an explicit save writes myTeamLineup, and it touches nothing else on the account", () => {
  const acc = createAccount("T1");
  setActiveAccountId(acc.id);
  const full = { ...getAccount(acc.id), playerIds: idsOf(...STARS), gold: 77, coachId: null, tacticId: "balanced", rankedWins: 3 };
  saveAccount(full);
  const raw = () => localStorage.getItem("cls_accounts_v1");
  // Reading / validating never writes.
  const stored = getAccount(acc.id);
  const untouched = raw();
  validateMyTeamLineup(stored, autoLineup(stored));
  resolveSavedLineup(stored);
  assert.equal(raw(), untouched);
  // An explicit save writes only the new field.
  const draft = autoLineup(stored);
  const res = store.saveMyTeamLineup(acc.id, draft, () => 42);
  assert.equal(res.ok, true);
  const after = getAccount(acc.id);
  assert.deepEqual(after.myTeamLineup, { rosterIds: draft.rosterIds, starterIds: draft.starterIds, savedAt: 42 });
  const { myTeamLineup: _saved, ...rest } = after;
  assert.deepEqual(rest, stored, "cards, gold, coach, tactic and ranked record are unchanged");
  assert.equal(store.saveMyTeamLineup("no-such-account", draft).reason, "no_account");
  // Reset removes just that field.
  assert.deepEqual(store.clearMyTeamLineup(acc.id), { ok: true, changed: true });
  assert.deepEqual(getAccount(acc.id), stored);
  assert.deepEqual(store.clearMyTeamLineup(acc.id), { ok: true, changed: false });
});

test("a tampered draft cannot smuggle foreign cards into the saved preference", () => {
  const acc = createAccount("T2");
  saveAccount({ ...getAccount(acc.id), playerIds: idsOf("curryst01", "jamesle01") });
  const stolen = idsOf("jordami01")[0];
  const res = store.saveMyTeamLineup(acc.id, { rosterIds: [stolen, ...idsOf("curryst01")], starterIds: [stolen] });
  assert.deepEqual(res.lineup.rosterIds, idsOf("curryst01"));
  assert.deepEqual(res.lineup.starterIds, []);
});

test("ranked is unchanged: accountToTeam still returns the best 12, one per person, ignoring the saved lineup", () => {
  const base = { ...acct(), name: "R", coachId: null, tacticId: "balanced" };
  const plain = accountToTeam(base);
  const withPref = accountToTeam({ ...base, myTeamLineup: { rosterIds: idsOf("garneke01"), starterIds: idsOf("garneke01"), savedAt: 1 } });
  assert.deepEqual(withPref.players.map((p) => p.id), plain.players.map((p) => p.id));
  assert.ok(plain.players.length <= 12);
});
