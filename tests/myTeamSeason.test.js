// ADR-010 T2 smoke: a My Team Season is built from the saved lineup, saved in its own owner-guarded slot,
// resumes with the player's five intact, can be played through (20 games) and never touches other saves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { autoLineup } = await import("../js/myteam/lineup.js");
const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");
const store = await import("../js/myteam/seasonStore.js");
const own = await import("../js/data/saveOwnership.js");
const { computeAwards, simUserNextGame, seasonGames } = await import("../js/engine/season.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
const peak = (b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0];
const acct = (id = "acc-a", extra = {}) => ({ id, name: "Zed", playerIds: STARS.map((b) => peak(b).id), cardMods: {}, gold: 5, tacticId: "pace_space", ...extra });

function device(...ids) {
  own._resetOwnershipForTests();
  const storage = createMemoryStorage({ [ACCOUNTS_KEY]: JSON.stringify({ accounts: ids.map((id) => ({ id })) }) });
  globalThis.localStorage = storage;
  const as = (id) => storage.setItem(ACTIVE_ACCOUNT_KEY, id);
  as(ids[0]);
  own.stampLegacySaves({}, storage); // boot: ownership tracking on
  return { storage, as };
}

const quick = (account = acct()) => {
  const r = buildMyTeamSeason(account, { variant: "quick", seed: 7 });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.season;
};

test("builds a 20-game season from the saved lineup: the player's five and tactic survive, collection untouched", () => {
  const a = acct();
  const before = JSON.stringify(a);
  const st = quick(a);
  const lineup = autoLineup(a);
  const team = st.teams[st.userTeamId];
  assert.deepEqual(team.starterIds, lineup.starterIds, "starters come back after createSeason dropped them");
  assert.equal(team.coach.specialTactics[0], "pace_space");
  assert.equal(st.rsGames, 20);
  assert.equal(st.schedule.length, 20);
  assert.equal(st.myTeam.rules.variant, "quick");
  assert.equal(st.myTeam.roster.length, lineup.rosterIds.length);
  assert.equal(team.players.length, lineup.rosterIds.length, "only the chosen roster plays, not the whole collection");
  assert.equal(JSON.stringify(a), before, "building a season never writes the account");
});

test("refuses guests and invalid lineups instead of building something else", () => {
  assert.equal(buildMyTeamSeason(null).reason, "guest");
  const few = buildMyTeamSeason(acct("acc-a", { playerIds: acct().playerIds.slice(0, 5) }));
  assert.equal(few.ok, false);
  assert.equal(few.reason, "invalid");
});

test("save slot: round-trip keeps the season; the file is owned by whoever created it", () => {
  const { storage } = device("acc-a", "acc-b");
  const st = quick();
  assert.deepEqual(store.saveMyTeamSeason(st, storage), { ok: true });
  const back = store.loadMyTeamSeason(storage);
  assert.equal(back.myTeam.seasonId, st.myTeam.seasonId);
  assert.deepEqual(back.teams[back.userTeamId].starterIds, st.teams[st.userTeamId].starterIds);
  assert.equal(own.saveVisibility("myteam", own.myTeamSig(back), storage), "mine");
  assert.deepEqual(store.saveMyTeamSeason(back, storage), { ok: true }, "continuing the same season keeps saving");
});

test("another account's season is never overwritten; an unlinked one needs a confirmed delete", () => {
  const { storage, as } = device("acc-a", "acc-b");
  const mine = quick();
  store.saveMyTeamSeason(mine, storage);
  const raw = storage.getItem(store.MYTEAM_SEASON_KEY);
  as("acc-b");
  const theirs = quick(acct("acc-b"));
  assert.deepEqual(store.saveMyTeamSeason(theirs, storage), { ok: false, reason: "other" });
  assert.throws(() => store.clearMyTeamSeason({}, storage), own.ForeignSaveError);
  assert.equal(storage.getItem(store.MYTEAM_SEASON_KEY), raw, "slot untouched");

  // A pre-ownership (unlinked) copy: protected, deletable only with release.
  own._resetOwnershipForTests();
  const s2 = createMemoryStorage({ [ACCOUNTS_KEY]: JSON.stringify({ accounts: [{ id: "acc-a" }] }), [ACTIVE_ACCOUNT_KEY]: "acc-a", [store.MYTEAM_SEASON_KEY]: raw });
  globalThis.localStorage = s2;
  own.stampLegacySaves({ myteam: mine }, s2);
  assert.deepEqual(store.saveMyTeamSeason(quick(), s2), { ok: false, reason: "unassociated" });
  assert.throws(() => store.clearMyTeamSeason({}, s2), own.ForeignSaveError);
  store.clearMyTeamSeason({ release: true }, s2);
  assert.equal(store.hasMyTeamSeason(s2), false);
});

test("a damaged slot is 'no save', never a crash; other slots are never touched by this store", () => {
  const { storage } = device("acc-a");
  storage.setItem("cls_season_v1", "QUICK-SEASON-BYTES");
  storage.setItem(store.MYTEAM_SEASON_KEY, "{not json");
  assert.equal(store.readMyTeamSeason(storage), null);
  assert.equal(store.saveMyTeamSeason({ nope: 1 }, storage).reason, "invalid");
  store.saveMyTeamSeason(quick(), storage);
  assert.equal(storage.getItem("cls_season_v1"), "QUICK-SEASON-BYTES");
});

test("a 20-game season can be played to the end and still hands out awards (thresholds scale)", { timeout: 120000 }, () => {
  const st = quick();
  let guard = 0;
  while (simUserNextGame(st) && guard++ < 40);
  assert.equal(seasonGames(st), 20);
  const user = st.standings[st.userTeamId];
  assert.equal(user.w + user.l, 20, "the user's team played exactly 20");
  const awards = computeAwards(st);
  assert.ok(awards.mvp, "MVP is awarded at 20 games");
  assert.ok(awards.roy || awards.mip || awards.sixth, "scaled gates let at least one secondary award through");
});

test("saving after play stays small: played games don't drag their live snapshots into storage (quota regression)", () => {
  // Real bug found in the browser: 0.7 MB fresh -> 6.4 MB after five games, over the ~5 MB localStorage quota.
  const inner = createMemoryStorage();
  const quota = 2.5 * 1024 * 1024; // chars; the real limit is ~5 MB shared with everything else
  const capped = { ...inner, setItem(k, v) { if (String(v).length > quota) throw new DOMException("quota", "QuotaExceededError"); inner.setItem(k, v); } };
  const { storage } = device("acc-a");
  const st = quick();
  for (let i = 0; i < 5; i++) assert.ok(simUserNextGame(st));
  assert.ok(JSON.stringify(st).length > quota, "precondition: uncompacted state really is over the quota");
  assert.deepEqual(store.saveMyTeamSeason(st, { getItem: storage.getItem, removeItem: storage.removeItem, setItem: capped.setItem.bind(capped) }), { ok: true });
  assert.ok(inner.getItem(store.MYTEAM_SEASON_KEY).length < 1.5 * 1024 * 1024, "compacted size");
  const hopeless = { getItem: () => null, removeItem() {}, setItem() { throw new DOMException("quota", "QuotaExceededError"); } };
  assert.equal(store.saveMyTeamSeason(quick(), hopeless).reason, "storage", "a real failure reports storage and writes nothing");
});
