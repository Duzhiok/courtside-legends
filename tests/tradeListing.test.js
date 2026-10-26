// 挂牌出售倾向: a listed player's preference decides who calls and what comes back.
import test from "node:test";
import assert from "node:assert/strict";
import { overall } from "../js/data/players.js";
import { generateTradeProposals, listPlayerForTrade, unlistPlayerForTrade } from "../js/engine/tradeProposals.js";
import { playerSalary } from "../js/engine/seasonMarket.js";
import { LISTING_PREFERENCES, listingPref, setListingPref } from "../js/engine/tradeListing.js";

function player(id, ovr, salary = 60, age = 27) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age };
}
const filler = (prefix, n, ovr, salary, age = 27) =>
  Array.from({ length: n }, (_, i) => player(`${prefix}${i}`, ovr, salary, age));

/** Four CPU teams, each the obvious best fit for exactly one preference. */
function league() {
  return {
    year: 1994,
    dayIndex: 0,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: [player("wing", 80, 120), ...filler("u", 8, 70, 50)] },
      REB: { name: "重建队", players: [player("rebCheap", 66, 20), ...filler("r", 8, 68, 60)] },
      WIN: { name: "争冠队", players: [player("winStar", 82, 140), player("winVet", 79, 110), ...filler("w", 7, 86, 140)] },
      CAP: { name: "空间队", players: [player("capRole", 77, 40), ...filler("c", 8, 74, 25)] },
      KID: { name: "青年队", players: [player("kidGem", 72, 30, 20), ...filler("k", 8, 75, 70, 29)] },
    },
    playerSeason: {},
    tradeLog: [],
    draftAssets: [],
  };
}

function proposalFor(pref) {
  const st = league();
  listPlayerForTrade(st, "wing");
  if (pref) assert.equal(setListingPref(st, "wing", pref).ok, true);
  const [proposal] = generateTradeProposals(st, 1);
  assert.ok(proposal, `${pref || "default"}: expected a proposal`);
  return { st, proposal };
}

test("listing pref: defaults to 'any' and an unknown pref is refused", () => {
  const st = league();
  listPlayerForTrade(st, "wing");
  assert.equal(listingPref(st, "wing"), "any");
  assert.equal(setListingPref(st, "wing", "lottery-ticket").ok, false);
  assert.equal(listingPref(st, "wing"), "any");
});

test("listing pref 'picks': a rebuilding team sends a cheap filler plus the most picks", () => {
  const { proposal } = proposalFor("picks");
  assert.equal(proposal.fromTeamId, "REB");
  assert.equal(proposal.receivePlayers[0].id, "rebCheap");
  assert.equal(proposal.offerPicks.length, 3);
  assert.match(proposal.reason, /选秀权优先/);
});

test("listing pref 'winNow': strongest fair current player back, no prospect, no picks", () => {
  const { proposal } = proposalFor("winNow");
  assert.equal(proposal.fromTeamId, "WIN");
  assert.equal(proposal.receivePlayers[0].id, "winStar", "best player within +3 OVR of the listed one");
  assert.ok(overall(proposal.receivePlayers[0]) <= 83);
  assert.equal(proposal.offerPicks.length, 0);
  assert.equal(proposal.receivePlayers.length, 1, "no prospect sweetener");
});

test("listing pref 'salary': the cap-room team takes the contract and less salary comes back", () => {
  const { proposal } = proposalFor("salary");
  assert.equal(proposal.fromTeamId, "CAP");
  const back = proposal.receivePlayers.reduce((s, p) => s + playerSalary(p), 0);
  assert.ok(back < 120, `incoming ${back} should be below the outgoing 120`);
});

test("listing pref 'youth': the best young high-upside player comes back", () => {
  const { proposal } = proposalFor("youth");
  assert.equal(proposal.fromTeamId, "KID");
  assert.equal(proposal.receivePlayers[0].id, "kidGem");
});

test("listing pref: every preference produces a distinct package for the same player", () => {
  const shapes = Object.keys(LISTING_PREFERENCES)
    .filter((pref) => pref !== "any")
    .map((pref) => proposalFor(pref).proposal.receivePlayers[0].id);
  assert.equal(new Set(shapes).size, shapes.length, shapes.join(","));
});

test("listing pref: unlisting clears the preference so a relist starts neutral", () => {
  const st = league();
  listPlayerForTrade(st, "wing");
  setListingPref(st, "wing", "picks");
  unlistPlayerForTrade(st, "wing");
  listPlayerForTrade(st, "wing");
  assert.equal(listingPref(st, "wing"), "any");
});
