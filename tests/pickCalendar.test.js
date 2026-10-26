// Draft-pick calendar: every club holds real picks for the next few drafts, the window rolls forward
// with the season, and trade-proposal sweeteners are real picks the proposing club actually owns.
//
// Before this, each club had exactly two stored tokens that were never consumed or replenished, and
// a proposal's "附带选秀权" were invented tokens with no source club (so they could not affect the
// draft, and there were never enough real ones for a "picks" listing preference that asks for three).
import test from "node:test";
import assert from "node:assert/strict";
import { acceptTradeProposal, ensureTradeProposals, generateTradeProposals, listPlayerForTrade } from "../js/engine/tradeProposals.js";
import { teamDraftAssets } from "../js/engine/seasonMarket.js";
import { setListingPref } from "../js/engine/tradeListing.js";
import { advanceLeagueOffseason } from "../js/engine/season.js";
import { picksOwnedBy, swapDraftPicks } from "../js/engine/leagueDraft.js";
import { beginCareerDraft, createLeagueCareer } from "../js/modes/leagueCareer.js";
import { PICK_HORIZON, ensurePickLedger, parsePickId, pickOwnerOf, prunePickLedger, setPickOwner } from "../js/engine/pickLedger.js";

const IDS = ["USER", "AAA", "BBB", "CCC"];
const ids = (picks) => picks.map((p) => p.id);

function player(id, ovr, salary = 60, age = 27) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age };
}

/** A regular-season market with four clubs and a 2024 calendar. */
function market(year = 2024) {
  const roster = (prefix) => Array.from({ length: 10 }, (_, i) => player(`${prefix}${i}`, 66));
  return {
    year,
    dayIndex: 10,
    phase: "regular",
    userTeamId: "USER",
    league: { teamIds: IDS },
    teams: Object.fromEntries(IDS.map((id) => [id, { id, name: id, players: roster(id) }])),
    standings: Object.fromEntries(IDS.map((id, i) => [id, { w: 20 + i * 10, l: 62 - i * 10, pf: 8000, pa: 8100 }])),
    tradeLog: [],
  };
}

/** Same shape as tradeListing's league: one listed player and one CPU club per preference. */
function listingLeague() {
  const filler = (prefix, n, ovr, salary, age = 27) => Array.from({ length: n }, (_, i) => player(`${prefix}${i}`, ovr, salary, age));
  return {
    year: 1994,
    dayIndex: 0,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: [player("wing", 80, 120), ...filler("u", 8, 70, 50)] },
      REB: { name: "重建队", players: [player("rebCheap", 66, 20), ...filler("r", 8, 68, 60)] },
      WIN: { name: "争冠队", players: [player("winStar", 82, 140), player("winVet", 79, 110), ...filler("w", 7, 86, 140)] },
      KID: { name: "青年队", players: [player("kidGem", 72, 30, 20), ...filler("k", 8, 75, 70, 29)] },
    },
    playerSeason: {},
    tradeLog: [],
  };
}

// ---------- the calendar itself ----------

test("every club holds a first and a second for each of the next drafts, and nothing is stored", () => {
  const st = market();
  const mine = teamDraftAssets(st, "USER");
  assert.equal(PICK_HORIZON, 3);
  assert.equal(mine.length, PICK_HORIZON * 2);
  assert.deepEqual(
    ids(mine).sort(),
    ["USER-r1-2024", "USER-r1-2025", "USER-r1-2026", "USER-r2-2024", "USER-r2-2025", "USER-r2-2026"],
  );
  assert.ok(mine.every((p) => p.year >= 2024 && p.year <= 2026 && (p.round === 1 || p.round === 2)));
  assert.ok(mine.filter((p) => p.round === 1).every((p) => p.protection === "lottery-protected"));
  assert.ok(mine.filter((p) => p.round === 2).every((p) => p.protection === "unprotected"));
  assert.ok(!st.draftAssets?.length, "the token list is derived from the ledger, not kept in the save");
  // Across the league each pick is held by exactly one club.
  const all = IDS.flatMap((id) => ids(teamDraftAssets(st, id)));
  assert.equal(all.length, IDS.length * PICK_HORIZON * 2);
  assert.equal(new Set(all).size, all.length, "no pick is held twice");
});

test("the window rolls forward with the calendar and trades survive the roll", () => {
  const st = market(2024);
  setPickOwner(st, { sourceTeamId: "USER", year: 2026, round: 1 }, "AAA"); // sold in 2024
  st.year = 2025;
  const later = ids(teamDraftAssets(st, "USER")).sort();
  assert.deepEqual(later, ["USER-r1-2025", "USER-r1-2027", "USER-r2-2025", "USER-r2-2026", "USER-r2-2027"], "2024 expired, 2027 issued, the sold 2026 first stays sold");
  assert.ok(ids(teamDraftAssets(st, "AAA")).includes("USER-r1-2026"), "and AAA still holds it");
  assert.ok(ids(teamDraftAssets(st, "AAA")).includes("AAA-r1-2027"), "every club is issued the new year's picks");
});

test("prunePickLedger drops ledger entries and stale legacy tokens for drafts that already happened", () => {
  const st = market(2024);
  setPickOwner(st, { sourceTeamId: "USER", year: 2024, round: 1 }, "AAA");
  setPickOwner(st, { sourceTeamId: "USER", year: 2026, round: 1 }, "AAA");
  st.draftAssets = [
    { id: "2023-USER-incoming-1", year: 2024, round: 2, source: "trade", protection: "unprotected" },
    { id: "2023-USER-incoming-2", year: 2026, round: 2, source: "trade", protection: "unprotected" },
  ];
  st.year = 2025;
  prunePickLedger(st);
  assert.equal(st.pickOwnership?.[2024], undefined, "the 2024 entry is gone");
  assert.equal(st.pickOwnership?.[2026]?.USER, "AAA", "the 2026 entry stays");
  assert.deepEqual(ids(st.draftAssets), ["2023-USER-incoming-2"], "only the unexpired legacy token stays");
});

function doneSeason(year = 2030) {
  const teamIds = ["A", "B", "C", "D"];
  const p = (id) => ({ id, bref: id, name: id, season: year, age: 24, pos: "PG", scoring: 60, three: 60, mid: 60, paint: 60, pass: 60, defense: 60, rebound: 60, steal: 60, block: 60, speed: 60, strength: 60, stamina: 60, iq: 60, clutch: 60, salary: 80 });
  return {
    v: 2, phase: "done", year, mode: "modern", seed: 77, userTeamId: "B", customNames: {},
    league: { teamIds, eastIds: ["A", "B"], westIds: ["C", "D"], labels: Object.fromEntries(teamIds.map((x) => [x, x])), confById: { A: "East", B: "East", C: "West", D: "West" } },
    teams: Object.fromEntries(teamIds.map((x, i) => [x, { id: x, name: x, players: [p(`${x}-${i}`)], isCpu: x !== "B" }])),
    standings: Object.fromEntries(teamIds.map((x, i) => [x, { w: 20 + i, l: 62 - i, pf: 8000 + i, pa: 8100 }])),
    schedule: [], playerSeason: {}, resultsLog: [], tradeLog: [], freeAgents: [],
    awards: { mvp: null, dpoy: null, roy: null },
    playoffs: { championId: "D", east: { series: [] }, west: { series: [] }, finals: { high: { id: "B" }, low: { id: "D" } } },
  };
}

test("a real offseason rolls the calendar and clears proposals that mention expired picks", () => {
  const st = doneSeason(2030);
  setPickOwner(st, { sourceTeamId: "B", year: 2030, round: 1 }, "A"); // used up in the 2030 draft
  setPickOwner(st, { sourceTeamId: "B", year: 2032, round: 1 }, "A"); // still in the future
  st.tradeProposals = [{ id: "stale", offerPicks: [{ id: "A-r1-2030", year: 2030, round: 1 }] }];
  const res = advanceLeagueOffseason(st, { seed: 9 });
  assert.equal(res.ok, true, res.reason);
  assert.equal(st.year, 2031);
  assert.equal(st.tradeProposals, undefined, "last year's proposals are not carried over");
  assert.equal(st.pickOwnership?.[2030], undefined, "the 2030 ledger entry was pruned");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "B", year: 2032, round: 1 }), "A", "the 2032 trade survived");
  assert.deepEqual(ids(teamDraftAssets(st, "B")).filter((x) => x.startsWith("B-r1-")).sort(), ["B-r1-2031", "B-r1-2033"], "B holds its 2031 and 2033 firsts; the 2032 one is A's");
});

// ---------- proposals attach real picks ----------

function listedProposal(pref) {
  const st = listingLeague();
  listPlayerForTrade(st, "wing");
  if (pref) assert.equal(setListingPref(st, "wing", pref).ok, true);
  const [proposal] = generateTradeProposals(st, 1);
  assert.ok(proposal, `${pref || "default"}: expected a proposal`);
  return { st, proposal };
}

test("a proposal's sweeteners are real picks the proposing club owns today", () => {
  const { st, proposal } = listedProposal("picks");
  assert.equal(proposal.offerPicks.length, 3, "the 'picks' preference can now actually get three");
  const held = new Set(ids(teamDraftAssets(st, proposal.fromTeamId)));
  for (const pick of proposal.offerPicks) {
    assert.ok(parsePickId(pick.id), `${pick.id} is tied to a source club`);
    assert.ok(held.has(pick.id), `${proposal.fromTeamId} really holds ${pick.id}`);
  }
  assert.equal(new Set(ids(proposal.offerPicks)).size, 3, "three different picks");
  assert.deepEqual(proposal.offerPicks.map((p) => p.round), [1, 2, 1], "first / second round alternate, nearest draft first");
});

test("one club making several offers in a batch never offers the same pick twice", () => {
  const st = listingLeague();
  // The other clubs are far over the cap, so the rebuilding club is the only one that can call:
  // every listed player gets an offer from it, and they must draw on its picks without repeating.
  for (const id of ["WIN", "KID"]) for (const pl of st.teams[id].players) pl.salary = 900;
  for (const id of ["wing", "u0", "u1"]) {
    listPlayerForTrade(st, id);
    setListingPref(st, id, "picks");
  }
  const proposals = generateTradeProposals(st, 3);
  assert.ok(proposals.length >= 2, "the same club made more than one offer");
  assert.ok(proposals.every((p) => p.fromTeamId === "REB"), "and it was always the rebuilding club");
  const all = proposals.flatMap((p) => ids(p.offerPicks));
  assert.ok(all.length > 3, "more than one offer carried picks");
  assert.equal(new Set(all).size, all.length, `no repeats in ${all.join(", ")}`);
  assert.ok(all.length <= PICK_HORIZON * 2, "and never more picks than the club actually holds");
});

test("accepting a proposal hands over the picks through the ledger", () => {
  const { st, proposal } = listedProposal("picks");
  const res = acceptTradeProposal(st, proposal.id);
  assert.equal(res.ok, true, res.reason);
  const mine = new Set(ids(teamDraftAssets(st, "USER")));
  const theirs = new Set(ids(teamDraftAssets(st, proposal.fromTeamId)));
  for (const pick of proposal.offerPicks) {
    assert.ok(mine.has(pick.id), `${pick.id} is now mine`);
    assert.ok(!theirs.has(pick.id), `${pick.id} left ${proposal.fromTeamId}`);
    assert.equal(pickOwnerOf(st, parsePickId(pick.id)), "USER", "the draft agrees");
  }
  assert.match(res.message, /3 个/);
});

test("a proposal whose pick has since gone elsewhere is refreshed, never accepted with a phantom pick", () => {
  const { st, proposal } = listedProposal("picks");
  const gone = proposal.offerPicks[0];
  st.tradeProposals = [proposal];
  setPickOwner(st, parsePickId(gone.id), "KID"); // the club traded it away after the offer was made
  const fresh = ensureTradeProposals(st);
  for (const p of fresh) {
    for (const pick of p.offerPicks) {
      assert.ok(ids(teamDraftAssets(st, p.fromTeamId)).includes(pick.id), `${pick.id} is still held by ${p.fromTeamId}`);
    }
  }
  const res = acceptTradeProposal(st, fresh[0].id);
  assert.equal(res.ok, true, res.reason);
  assert.equal(pickOwnerOf(st, parsePickId(gone.id)), "KID", "the pick that moved on stayed with its new owner");
});

test("proposals saved by the old version (invented picks) are refreshed instead of failing on accept", () => {
  const st = listingLeague();
  listPlayerForTrade(st, "wing");
  const [real] = generateTradeProposals(st, 1);
  st.tradeProposals = [{ ...real, offerPicks: [{ id: "1994-USER-incoming-1", year: 1995, round: 1, source: "trade", protection: "lottery-protected" }] }];
  const fresh = ensureTradeProposals(st);
  assert.ok(fresh.length >= 1);
  assert.ok(fresh.every((p) => p.offerPicks.every((pick) => parsePickId(pick.id))), "every attached pick is a real one");
});

// ---------- older saves ----------

test("older saves: pooled tokens become ledger entries, then the stored pools are dropped", () => {
  const st = market();
  st.draftAssets = [
    { id: "USER-r2-2025", year: 2025, round: 2, protection: "unprotected", source: "own" },
    { id: "BBB-r1-2026", year: 2026, round: 1, protection: "lottery-protected", source: "own" }, // bought from BBB
    { id: "2023-USER-incoming-1", year: 2025, round: 1, source: "trade", protection: "lottery-protected" }, // invented
    { id: "2020-USER-incoming-2", year: 2021, round: 1, source: "trade", protection: "lottery-protected" }, // long expired
  ];
  st.teams.AAA.draftAssets = [{ id: "USER-r1-2026", year: 2026, round: 1, protection: "lottery-protected", source: "own" }];
  ensurePickLedger(st);
  assert.equal(st.pickLedgerVersion, 2);
  assert.equal(pickOwnerOf(st, { sourceTeamId: "BBB", year: 2026, round: 1 }), "USER");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2026, round: 1 }), "AAA");
  assert.deepEqual(ids(st.draftAssets), ["2023-USER-incoming-1"], "only the unexpired invented token is kept");
  assert.deepEqual(st.teams.AAA.draftAssets, []);
  const before = JSON.stringify(st);
  ensurePickLedger(st);
  assert.equal(JSON.stringify(st), before, "running it again changes nothing");
  assert.ok(ids(teamDraftAssets(st, "USER")).includes("BBB-r1-2026"));
  assert.ok(ids(teamDraftAssets(st, "USER")).includes("2023-USER-incoming-1"), "the user still owns the old sweetener");
});

test("a save from the intermediate version keeps its ledger; stale pooled tokens never override it", () => {
  const st = market();
  st.pickLedgerVersion = 1;
  st.draftAssets = [];
  st.teams.AAA.draftAssets = [{ id: "USER-r1-2026", year: 2026, round: 1, protection: "lottery-protected", source: "own" }]; // stale
  ensurePickLedger(st);
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2026, round: 1 }), "USER", "the ledger was the truth");
  assert.deepEqual(st.teams.AAA.draftAssets, []);
});

test("an older save's token trade reaches the real career draft even if the market was never opened", () => {
  const st = doneSeason(2030);
  // Old model: B's 2030 first sat in A's pool, and no ownership map existed.
  st.teams.A.draftAssets = [{ id: "B-r1-2030", year: 2030, round: 1, protection: "lottery-protected", source: "own" }];
  const career = createLeagueCareer({ kind: "franchise", season: st, careerId: "legacy-pick-e2e" });
  const started = beginCareerDraft(career);
  const order = started.management.draft.order;
  assert.equal(order.slice(0, 4).filter((x) => x === "B").length, 0, "B no longer has a first-round slot");
  assert.equal(order.slice(0, 4).filter((x) => x === "A").length, 2, "A holds two");
  assert.equal(picksOwnedBy(started.season, 2030, "A").length, 2, "and the migrated season records it");
});

test("an older save that already traded this year's first away cannot swap it again", () => {
  const st = market();
  // Old model: USER's 2024 first sits in AAA's pool, and no ownership map exists yet.
  st.teams.AAA.draftAssets = [{ id: "USER-r1-2024", year: 2024, round: 1, protection: "lottery-protected", source: "own" }];
  const res = swapDraftPicks(st, { year: 2024, cpuTeamId: "BBB" });
  assert.equal(res.ok, false, "you cannot swap a pick you no longer own");
  assert.match(res.reason, /已有过交易/);
});
