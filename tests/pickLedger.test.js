// Draft-pick ownership: the trade market and the real draft must agree.
//
// Before this, the market moved pick TOKENS between per-team lists (team.draftAssets) while the
// draft only ever read season.pickOwnership -- so a first-rounder traded away in the market was
// still used by its original owner on draft night, and one acquired was never used at all.
// Separately, an emptied pool was treated as "never seeded" and refilled, so giving both picks
// away minted two new ones.
import test from "node:test";
import assert from "node:assert/strict";
import { executeTrade, teamDraftAssets } from "../js/engine/seasonMarket.js";
import {
  advanceDraftRoundIfNeeded,
  applyPickOwnership,
  buildNaturalPicks,
  createDraftState,
  picksOwnedBy,
  swapDraftPicks,
} from "../js/engine/leagueDraft.js";
import { parsePickId, pickOwnerOf, setPickOwner } from "../js/engine/pickLedger.js";
import { beginCareerDraft, createLeagueCareer } from "../js/modes/leagueCareer.js";

const IDS = ["USER", "AAA", "BBB", "CCC"];

function player(id, ovr) {
  return { id, name: id, season: 2024, ovr2k: ovr, ratingSource: "anchor", salary: 60, age: 27 };
}

function fixture(extra = {}) {
  const roster = (prefix) => Array.from({ length: 10 }, (_, i) => player(`${prefix}${i}`, 66));
  return {
    year: 2024,
    dayIndex: 10,
    phase: "regular",
    userTeamId: "USER",
    league: { teamIds: IDS },
    teams: Object.fromEntries(IDS.map((id) => [id, { id, name: id, players: roster(id) }])),
    standings: Object.fromEntries(IDS.map((id, i) => [id, { w: 20 + i * 10, l: 62 - i * 10, pf: 8000, pa: 8100 }])),
    tradeLog: [],
    ...extra,
  };
}

const pickIdsOf = (st, teamId, round) => teamDraftAssets(st, teamId).filter((p) => p.round === round).map((p) => p.id);
const owners = (st, year) => applyPickOwnership(buildNaturalPicks(st), st.pickOwnership?.[year]);

test("parsePickId reads source team, round and year out of a token id", () => {
  assert.deepEqual(parsePickId("USER-r1-2026"), { sourceTeamId: "USER", round: 1, year: 2026 });
  assert.deepEqual(parsePickId("GS-r2-2025"), { sourceTeamId: "GS", round: 2, year: 2025 });
  for (const junk of ["2024-USER-incoming-1", "r1-2026", "", null, undefined, 5, "USER-r3-2026"]) {
    assert.equal(parsePickId(junk), null, String(junk));
  }
});

test("trading a first-round pick away in the market removes it from the real draft", () => {
  const st = fixture();
  const [r1] = pickIdsOf(st, "USER", 1);
  assert.equal(r1, "USER-r1-2026");
  const aaaR2 = pickIdsOf(st, "AAA", 2)[0];
  const res = executeTrade(st, { givePickIds: [r1], wantPickIds: [aaaR2], cpuTeamId: "AAA", acceptedProposal: true });
  assert.equal(res.ok, true, res.reason);
  // The draft reads ownership, not the token lists.
  assert.deepEqual(picksOwnedBy(st, 2026, "USER"), [], "the user no longer owns a 2026 first-rounder");
  assert.deepEqual(picksOwnedBy(st, 2026, "AAA").sort(), ["AAA", "USER"], "AAA owns its own and the user's");
  const draft = createDraftState({ season: st, seed: "s", picks: owners(st, 2026), rounds: 1 });
  assert.equal(draft.order.filter((id) => id === "AAA").length, 2, "AAA picks twice on draft night");
  assert.equal(draft.order.includes("USER"), false, "the user does not pick at all");
});

test("acquiring a CPU first-round pick gives the user a second slot in that draft", () => {
  const st = fixture();
  const cpuR1 = pickIdsOf(st, "BBB", 1)[0];
  const mine = pickIdsOf(st, "USER", 2)[0];
  const res = executeTrade(st, { givePickIds: [mine], wantPickIds: [cpuR1], cpuTeamId: "BBB", acceptedProposal: true });
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(picksOwnedBy(st, 2026, "USER").sort(), ["BBB", "USER"]);
  const draft = createDraftState({ season: st, seed: "s", picks: owners(st, 2026), rounds: 1 });
  assert.equal(draft.order.filter((id) => id === "USER").length, 2);
});

test("a second-round-only trade moves the 2nd rounder and leaves the 1st where it was", () => {
  const st = fixture();
  const myR2 = pickIdsOf(st, "USER", 2)[0]; // USER-r2-2025
  const theirR1 = pickIdsOf(st, "CCC", 1)[0];
  assert.equal(executeTrade(st, { givePickIds: [myR2], wantPickIds: [theirR1], cpuTeamId: "CCC", acceptedProposal: true }).ok, true);
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2025, round: 2 }), "CCC", "round 2 moved");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2025, round: 1 }), "USER", "round 1 of the same year did not");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "CCC", year: 2026, round: 1 }), "USER");
});

test("setPickOwner: moving round 1 does not drag a retained round 2 along, and moving back restores natural", () => {
  const st = fixture();
  setPickOwner(st, { sourceTeamId: "USER", year: 2026, round: 1 }, "AAA");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2026, round: 1 }), "AAA");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2026, round: 2 }), "USER", "round 2 stays with its owner");
  setPickOwner(st, { sourceTeamId: "USER", year: 2026, round: 1 }, "USER");
  assert.equal(st.pickOwnership?.[2026]?.USER, undefined, "no stale override left behind");
  assert.equal(st.pickOwnershipR2?.[2026]?.USER, undefined);
});

test("the real round-2 order honours a traded second-rounder", () => {
  const st = fixture();
  setPickOwner(st, { sourceTeamId: "USER", year: 2024, round: 2 }, "AAA"); // USER's 2nd goes to AAA
  const base = createDraftState({ season: st, seed: "s", picks: owners(st, 2024), rounds: 2 });
  const finished = { ...base, status: "complete", round: 1, selections: [], currentPick: base.order.length };
  const next = advanceDraftRoundIfNeeded(finished, st);
  const round2 = next.order.slice(base.order.length);
  assert.equal(round2.length, 4);
  assert.equal(round2.filter((id) => id === "USER").length, 0, "USER has no round-2 pick");
  assert.equal(round2.filter((id) => id === "AAA").length, 2, "AAA has two");
});

test("giving every pick away does not mint new ones", () => {
  const st = fixture();
  const mine = teamDraftAssets(st, "USER").map((p) => p.id);
  assert.equal(mine.length, 2);
  // Trade both away for one of AAA's.
  const res = executeTrade(st, { givePickIds: mine, wantPickIds: [pickIdsOf(st, "AAA", 2)[0]], cpuTeamId: "AAA", acceptedProposal: true });
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(teamDraftAssets(st, "USER").map((p) => p.id), ["AAA-r2-2025"]);
  // Now give that last one away too: the pool is empty and must STAY empty.
  const res2 = executeTrade(st, { givePickIds: ["AAA-r2-2025"], wantPickIds: [pickIdsOf(st, "BBB", 2)[0]], cpuTeamId: "BBB", acceptedProposal: true });
  assert.equal(res2.ok, true, res2.reason);
  assert.equal(teamDraftAssets(st, "USER").length, 1);
  const res3 = executeTrade(st, { givePickIds: teamDraftAssets(st, "USER").map((p) => p.id), wantIds: ["BBB0"], cpuTeamId: "BBB", acceptedProposal: true });
  assert.equal(res3.ok, true, res3.reason);
  assert.deepEqual(teamDraftAssets(st, "USER"), [], "an emptied pool is empty, not 'unseeded'");
  assert.deepEqual(teamDraftAssets(st, "USER"), [], "and still empty on the next call");
});

test("a pick swap keeps the market tokens in step with the draft", () => {
  const st = fixture();
  teamDraftAssets(st, "USER");
  teamDraftAssets(st, "AAA");
  const swapped = swapDraftPicks(st, { year: 2026, cpuTeamId: "AAA" });
  assert.equal(swapped.ok, true, swapped.reason);
  assert.equal(pickIdsOf(st, "USER", 1).includes("AAA-r1-2026"), true, "USER now holds AAA's token");
  assert.equal(pickIdsOf(st, "USER", 1).includes("USER-r1-2026"), false, "and no longer holds its own");
  assert.equal(pickIdsOf(st, "AAA", 1).includes("USER-r1-2026"), true);
});

test("a pool seeded AFTER a swap still respects who owns what", () => {
  const st = fixture();
  assert.equal(swapDraftPicks(st, { year: 2026, cpuTeamId: "AAA" }).ok, true);
  // Nobody has opened the market yet; pools are created lazily now.
  assert.equal(pickIdsOf(st, "USER", 1).includes("AAA-r1-2026"), true);
  assert.equal(pickIdsOf(st, "USER", 1).includes("USER-r1-2026"), false);
  const everyOne = IDS.flatMap((id) => teamDraftAssets(st, id).filter((p) => p.year === 2026 && p.round === 1).map((p) => p.id));
  assert.deepEqual([...everyOne].sort(), ["AAA-r1-2026", "BBB-r1-2026", "CCC-r1-2026", "USER-r1-2026"], "each token held exactly once");
});

test("legacy saves: a token already traded away in the old model is adopted, not handed back", () => {
  const st = fixture();
  // An old save: USER's 2026 first sits in AAA's pool, and no ownership map exists.
  st.draftAssets = [{ id: "USER-r2-2025", year: 2025, round: 2, protection: "unprotected", source: "own" }];
  st.teams.AAA.draftAssets = [
    { id: "AAA-r1-2026", year: 2026, round: 1, protection: "lottery-protected", source: "own" },
    { id: "USER-r1-2026", year: 2026, round: 1, protection: "lottery-protected", source: "own" },
    { id: "AAA-r2-2025", year: 2025, round: 2, protection: "unprotected", source: "own" },
  ];
  assert.equal(pickIdsOf(st, "AAA", 1).includes("USER-r1-2026"), true, "the token stays with AAA");
  assert.equal(pickIdsOf(st, "USER", 1).includes("USER-r1-2026"), false, "it is not silently returned");
  assert.equal(pickOwnerOf(st, { sourceTeamId: "USER", year: 2026, round: 1 }), "AAA", "and the draft now agrees");
});

test("synthetic sweetener tokens (not tied to a team) are left alone", () => {
  const st = fixture();
  st.draftAssets = [{ id: "2024-USER-incoming-1", year: 2025, round: 1, source: "trade", protection: "lottery-protected" }];
  assert.deepEqual(teamDraftAssets(st, "USER").map((p) => p.id), ["2024-USER-incoming-1"]);
  assert.deepEqual(teamDraftAssets(st, "USER").map((p) => p.id), ["2024-USER-incoming-1"], "stable across calls");
});

test("end to end: a first-rounder sold in the market is gone on draft night in a real career draft", () => {
  const st = fixture();
  const sold = pickIdsOf(st, "USER", 1)[0]; // USER-r1-2026
  const got = pickIdsOf(st, "AAA", 2)[0];
  assert.equal(executeTrade(st, { givePickIds: [sold], wantPickIds: [got], cpuTeamId: "AAA", acceptedProposal: true }).ok, true);
  // Two seasons later the 2026 draft arrives; the same season object carries the ledger forward.
  st.year = 2026;
  st.phase = "done";
  const career = createLeagueCareer({ kind: "franchise", season: st, careerId: "pick-ledger-e2e" });
  const order = beginCareerDraft(career).management.draft.order;
  // Round 1 is the first four entries, round 2 the next four.
  assert.equal(order.slice(0, 4).filter((id) => id === "USER").length, 0, "no first-round slot for the user");
  assert.equal(order.slice(0, 4).filter((id) => id === "AAA").length, 2, "AAA holds two first-round slots");
  assert.equal(order.slice(4).filter((id) => id === "USER").length, 1, "the user still has their round-2 slot");
});
