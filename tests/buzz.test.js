import test from "node:test";
import assert from "node:assert/strict";
import { BUZZ_DECAY, BUZZ_EXTRA_PICK, BUZZ_GAME_CAP, BUZZ_HOT, BUZZ_MAX, BUZZ_MAX_BONUS } from "../js/career/balance.js";
import { buzzBonus, buzzKey, buzzOf, highlightTags, isHot, settleBuzz } from "../js/career/buzz.js";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { declineTradeProposal, ensureTradeProposals, generateTradeProposals, listPlayerForTrade } from "../js/engine/tradeProposals.js";
import { setListingPref } from "../js/engine/tradeListing.js";

const line = (over = {}) => ({ id: "p1", name: "Pat", pts: 10, reb: 4, ast: 3, stl: 1, blk: 0, tpm: 1, ...over });
const ids = (tags) => tags.map((tag) => tag.id);

// ---------------------------------------------------------------- what counts as a highlight
test("scoring is one ladder: 29 nothing, 30 is a 30, 39 is still a 30, 40 is a 40 (never both)", () => {
  assert.deepEqual(ids(highlightTags(line({ pts: 29 }))), []);
  assert.deepEqual(ids(highlightTags(line({ pts: 30 }))), ["pts30"]);
  assert.deepEqual(ids(highlightTags(line({ pts: 39 }))), ["pts30"]);
  assert.deepEqual(ids(highlightTags(line({ pts: 40 }))), ["pts40"]);
  assert.equal(highlightTags(line({ pts: 41 }))[0].value, 41, "carries the figure to show");
});

test("triple-double: ten in ANY three of five categories, nine does not count", () => {
  assert.deepEqual(ids(highlightTags(line({ pts: 12, reb: 11, ast: 10 }))), ["tripleDouble"]);
  assert.deepEqual(ids(highlightTags(line({ pts: 10, reb: 4, ast: 10, stl: 10, blk: 0 }))), ["tripleDouble"], "steals count");
  assert.deepEqual(ids(highlightTags(line({ pts: 10, reb: 10, ast: 3, stl: 0, blk: 10 }))), ["tripleDouble", "blk5"], "blocks count (and ten of them is also 5+)");
  assert.deepEqual(ids(highlightTags(line({ pts: 12, reb: 11, ast: 9 }))), [], "9 assists is a double-double");
  assert.deepEqual(ids(highlightTags(line({ pts: 22, reb: 12, ast: 9 }))), []);
});

test("5 blocks and 8 threes are highlights, 4 and 7 are not", () => {
  assert.deepEqual(ids(highlightTags(line({ blk: 5 }))), ["blk5"]);
  assert.deepEqual(ids(highlightTags(line({ blk: 4 }))), []);
  assert.deepEqual(ids(highlightTags(line({ tpm: 8 }))), ["tpm8"]);
  assert.deepEqual(ids(highlightTags(line({ tpm: 7 }))), []);
});

test("a monster night earns several tags; missing or junk stats earn none", () => {
  assert.deepEqual(ids(highlightTags(line({ pts: 41, reb: 12, ast: 10, blk: 5, tpm: 8 }))), ["pts40", "tripleDouble", "blk5", "tpm8"]);
  assert.deepEqual(highlightTags(null), []);
  assert.deepEqual(highlightTags({ id: "x", pts: "lots", reb: NaN }), []);
});

// ---------------------------------------------------------------- the ledger
const roster = [{ id: "p1", name: "Pat" }, { id: "p2", name: "Quinn" }];

test("a 40-point night gives buzz 4, capped per night, and the player is hot", () => {
  const out = settleBuzz({ players: roster, lines: [line({ pts: 40 })] });
  assert.equal(out.buzz.p1, 4);
  assert.deepEqual(out.hot, [{ id: "p1", name: "Pat", buzz: 4 }]);
  assert.equal(out.highlights[0].gain, 4);
  const monster = settleBuzz({ players: roster, lines: [line({ pts: 41, reb: 12, ast: 10, blk: 5, tpm: 8 })] });
  assert.equal(monster.highlights[0].gain, BUZZ_GAME_CAP, "4+3+2+2 = 11, but one night is worth at most the cap");
  assert.equal(monster.buzz.p1, BUZZ_GAME_CAP);
});

test("buzz cools every game: hot for a few games after a 40, then it falls off the list", () => {
  let buzz = settleBuzz({ players: roster, lines: [line({ pts: 40 })] }).buzz;
  const hotAfter = [];
  for (let game = 1; game <= 8; game += 1) {
    const out = settleBuzz({ buzz, players: roster, lines: [line({ pts: 8 })] });
    buzz = out.buzz;
    hotAfter.push(out.hot.length === 1);
  }
  assert.deepEqual(hotAfter.slice(0, 3), [true, true, true], "still hot for three more games");
  assert.equal(hotAfter[3], false, "and then the market moves on");
  assert.ok(!(buzz.p1 >= BUZZ_HOT), "and the ledger agrees he is no longer hot");
  assert.ok(!hotAfter.slice(3).includes(true), "never hot again without another highlight");
});

test("a player who did not play still cools, and one who left the roster is dropped", () => {
  const out = settleBuzz({ buzz: { p1: 4, gone: 5 }, players: roster, lines: [] });
  assert.equal(out.buzz.p1, 4 * BUZZ_DECAY);
  assert.equal("gone" in out.buzz, false, "he is not on your team any more");
});

test("buzz stacks across nights but never past the max", () => {
  let buzz = {};
  for (let game = 0; game < 30; game += 1) buzz = settleBuzz({ buzz, players: roster, lines: [line({ pts: 45 })] }).buzz;
  assert.ok(buzz.p1 <= BUZZ_MAX);
  assert.equal(buzz.p1, BUZZ_MAX);
});

test("on equal buzz the bigger scoring night is listed first (the top scorer is never the one hidden behind \"+N more\")", () => {
  const four = [{ id: "p1", name: "Pat" }, { id: "p2", name: "Quinn" }, { id: "p3", name: "Ray" }];
  const out = settleBuzz({ players: four, lines: [line({ id: "p1", pts: 31 }), line({ id: "p2", name: "Quinn", pts: 38 }), line({ id: "p3", name: "Ray", pts: 33 })] });
  assert.deepEqual(out.highlights.map((h) => h.id), ["p2", "p3", "p1"]);
});

test("hot list is hottest first; tiny leftovers are not saved at all", () => {
  const out = settleBuzz({ players: roster, lines: [line({ id: "p1", pts: 31 }), line({ id: "p2", name: "Quinn", pts: 45 })] });
  assert.deepEqual(out.hot.map((hot) => hot.id), ["p2", "p1"]);
  const cooled = settleBuzz({ buzz: { p1: 0.04 }, players: roster, lines: [] });
  assert.deepEqual(cooled.buzz, {}, "0.03 is noise, not data");
});

test("junk in a saved ledger reads as no buzz instead of poisoning the maths", () => {
  const out = settleBuzz({ buzz: { p1: "hot", p2: -3 }, players: roster, lines: [line({ pts: 30 })] });
  assert.equal(out.buzz.p1, 2);
  assert.equal(buzzOf({ buzz: { p1: NaN } }, "p1"), 0);
  assert.equal(buzzOf({ buzz: { p1: 99 } }, "p1"), BUZZ_MAX);
  assert.equal(buzzOf(undefined, "p1"), 0);
});

test("settleBuzz never mutates what it is given", () => {
  const buzz = { p1: 3 };
  const lines = [line({ pts: 40 })];
  const frozen = JSON.stringify({ buzz, lines, roster });
  settleBuzz({ buzz, players: roster, lines });
  assert.equal(JSON.stringify({ buzz, lines, roster }), frozen);
});

test("bonus and hotness line up with the balance table", () => {
  assert.equal(isHot(BUZZ_HOT), true);
  assert.equal(isHot(BUZZ_HOT - 0.01), false);
  assert.equal(buzzBonus(0), 0);
  assert.equal(buzzBonus(BUZZ_HOT - 0.01), 0, "lukewarm buys nothing");
  assert.equal(buzzBonus(BUZZ_HOT), 1.5);
  assert.equal(buzzBonus(4), 3, "a 40-point night is worth about +3 OVR to a buyer");
  assert.equal(buzzBonus(BUZZ_MAX), BUZZ_MAX_BONUS, "capped");
  assert.equal(buzzBonus(-5), 0);
});

test("the offer-cache fingerprint changes when somebody gets hotter or cools, and only while he is hot", () => {
  assert.equal(buzzKey({}), "");
  assert.equal(buzzKey({ buzz: { p1: 1 } }), "", "lukewarm is not on the market's radar");
  const a = buzzKey({ buzz: { p1: 4 } });
  assert.notEqual(a, "");
  assert.notEqual(buzzKey({ buzz: { p1: 3.2 } }), a);
  assert.equal(buzzKey({ buzz: { p1: 4, p2: 3 } }), buzzKey({ buzz: { p2: 3, p1: 4 } }), "order does not matter");
});

// ---------------------------------------------------------------- the market reads it
const card = (id, ovr, salary = 80, age = 27) => ({ id, name: id, season: 1996, ovr2k: ovr, ratingSource: "anchor", salary, age });

/**
 * A bench man (70) and a star (86) on your side. Three other clubs, each with a ladder of players to pay
 * with (one caller per target, so there must be as many clubs as targets).
 */
function market(buzz = {}) {
  const user = [card("star", 86, 150), card("bench", 70, 60), ...Array.from({ length: 6 }, (_, i) => card(`u${i}`, 65, 50))];
  const club = (name, key) => ({
    name,
    players: [60, 64, 66, 68, 70, 72, 74, 76, 80, 83, 85, 88].map((ovr) => card(`${key}-${ovr}`, ovr, 40 + ovr / 2)),
  });
  return {
    year: 1996,
    dayIndex: 12,
    phase: "regular",
    userTeamId: "USER",
    teams: { USER: { name: "我方", players: user }, CPU1: club("一队", "a"), CPU2: club("二队", "b"), CPU3: club("三队", "c") },
    playerSeason: {},
    tradeLog: [],
    draftAssets: [],
    buzz,
  };
}
const offerFor = (st, id) => generateTradeProposals(st, 3).find((proposal) => proposal.giveIds.includes(id));
const offerOvr = (proposal) => Math.max(...proposal.receivePlayers.map((p) => p.ovr2k));

test("a hot bench player draws a call that a cold one never gets", () => {
  assert.equal(offerFor(market(), "bench"), undefined, "70 OVR, no minutes of note: nobody calls");
  const hot = offerFor(market({ bench: 3 }), "bench");
  assert.ok(hot, "a 30-point night puts him on the market's radar");
  assert.ok(hot.buzz && hot.buzz.bonus > 0);
  assert.match(hot.reason, /热度/);
});

test("a star coming off a 40-point night gets a clearly better offer than the same star cold", () => {
  const cold = offerFor(market(), "star");
  const hot = offerFor(market({ star: 4 }), "star");
  assert.equal(cold.buzz, null, "no price-up claimed when there is none");
  assert.ok(offerOvr(hot) > offerOvr(cold), `hot ${offerOvr(hot)} vs cold ${offerOvr(cold)}`);
  assert.ok(hot.offerPicks.length >= cold.offerPicks.length);
  assert.equal(hot.buzz.bonus, 3);
});

test("past the pick threshold the club adds one more pick", () => {
  const warm = offerFor(market({ star: BUZZ_EXTRA_PICK - 1.5 }), "star");
  const blazing = offerFor(market({ star: BUZZ_EXTRA_PICK }), "star");
  assert.ok(blazing.offerPicks.length > warm.offerPicks.length, `${blazing.offerPicks.length} vs ${warm.offerPicks.length}`);
});

test("when he cools down the offer goes back to the ordinary one", () => {
  const cold = offerFor(market(), "star");
  let st = market({ star: 4 });
  let buzz = st.buzz;
  for (let game = 0; game < 8; game += 1) {
    buzz = settleBuzz({ buzz, players: st.teams.USER.players, lines: [] }).buzz;
  }
  st = market(buzz);
  const later = offerFor(st, "star");
  assert.equal(later.buzz, null);
  assert.equal(offerOvr(later), offerOvr(cold));
});

test("a hot player who can't be priced up (salary) still gets the ordinary offer, not nothing", () => {
  const st = market({ star: 6 });
  // every better player on the other side is on a contract the salary check refuses
  for (const id of ["CPU1", "CPU2", "CPU3"]) st.teams[id].players.forEach((p, i) => { if (p.ovr2k >= 76) p.salary = 900 + i; });
  const offer = offerFor(st, "star");
  assert.ok(offer, "the call still comes");
});

test("a hot player is offered by whichever club can afford him; a cold one only by the club whose turn it is", () => {
  const build = (buzz, dayIndex) => {
    const st = market(buzz);
    st.dayIndex = dayIndex;
    // clubs one and two are capped out: nothing they could send back fits
    for (const id of ["CPU1", "CPU2"]) st.teams[id].players.forEach((p) => { p.salary = 9999; });
    return offerFor(st, "star");
  };
  const days = [0, 1, 2, 3, 4, 5];
  assert.ok(days.every((day) => build({ star: 4 }, day)), "hot: the one club that can pay always gets to call, whatever day it is");
  assert.ok(days.some((day) => !build({}, day)), "cold: on days when a capped-out club is next in line, nobody calls (the old behaviour, unchanged)");
});

test("a target with no valid offer does not use up an offer slot: the next one still gets his call", () => {
  const st = market({ bench: 3 });
  // The user already turned the star's offer down, so nobody may make it again.
  const first = ensureTradeProposals(st).find((p) => p.giveIds.includes("star"));
  declineTradeProposal(st, first.id);
  assert.equal(offerFor(st, "star"), undefined, "the star has no offer left");
  const offers = generateTradeProposals(st, 1);
  assert.equal(offers.length, 1, "the single slot goes to the next real offer, not to the star's empty one");
  assert.deepEqual(offers[0].giveIds, ["bench"]);
});

test("an explicit listing preference is not overridden by buzz", () => {
  const hotStar = (pref) => {
    const st = market({ star: 6 });
    listPlayerForTrade(st, "star");
    assert.equal(setListingPref(st, "star", pref).ok, true);
    return offerFor(st, "star");
  };
  for (const pref of ["picks", "winNow"]) {
    const offer = hotStar(pref);
    assert.ok(offer, `a ${pref}-listed hot star still gets a call`);
    assert.equal(offer.listingPref, pref);
    assert.equal(offer.buzz, null, "the user asked for something specific; the house does not reprice it");
  }
});

test("cached offers are refreshed when the market's mood changes, and left alone when it did not", () => {
  const st = market({ star: 4 });
  const first = ensureTradeProposals(st);
  assert.equal(ensureTradeProposals(st), first, "same mood, same list (cached)");
  st.buzz = { star: 4 * BUZZ_DECAY };
  assert.notEqual(ensureTradeProposals(st), first, "he cooled a little: re-priced");
  const cool = market();
  const list = ensureTradeProposals(cool);
  assert.equal(ensureTradeProposals(cool), list, "nobody hot: stable, no churn");
});

// ---------------------------------------------------------------- the report and the stretch card
const snapshotWith = (rows) => ({
  score: { home: 100, away: 90 },
  home: { name: "H", roster: rows.map((row) => ({ id: row.id, name: row.id, stats: { min: 30, fga: 10, ...row } })) },
  away: { name: "A", roster: [] },
});

test("a stretch keeps every highlight, merged per player, and reads who is hot after the LAST game", () => {
  const reports = [
    { ...settleGame(snapshotWith([{ id: "p1", pts: 41 }]), "home") },
    { ...settleGame(snapshotWith([{ id: "p1", pts: 31 }, { id: "p2", pts: 8 }]), "home") },
  ];
  reports[0].rewards.highlights = [{ id: "p1", name: "Pat", tags: [{ id: "pts40", value: 41 }], gain: 4 }];
  reports[0].rewards.hot = [{ id: "p1", name: "Pat", buzz: 4 }];
  reports[1].rewards.highlights = [{ id: "p1", name: "Pat", tags: [{ id: "pts30", value: 31 }], gain: 2 }];
  reports[1].rewards.hot = [{ id: "p1", name: "Pat", buzz: 5.2 }];
  const folded = foldBatch(reports);
  assert.equal(folded.highlights.length, 1);
  assert.deepEqual(folded.highlights[0].tags.map((tag) => tag.id), ["pts40", "pts30"]);
  assert.equal(folded.highlights[0].gain, 6);
  assert.deepEqual(folded.hot, [{ id: "p1", name: "Pat", buzz: 5.2 }]);
});
