// B6: poaching. Real-engine fixtures throughout (tests/helpers/careerFixtures.js).
import test from "node:test";
import assert from "node:assert/strict";
import {
  POACH_ACCEPT_REPUTATION_DELTA, POACH_BASE_CHANCE, POACH_COOLDOWN_SEASONS, POACH_DECLINE_TRUST_BONUS,
  COACH_BASE_SALARY, POACH_MAX_CHANCE, POACH_MIN_REPUTATION, POACH_MIN_SEASONS_IN_STINT, POACH_SIGNING_SALARY,
  POACH_SIGNING_TRUST_BONUS,
} from "../js/career/balance.js";
import { currentCoachSalary, settleCoachFinances } from "../js/career/finance.js";
import { burnedBridgeTeamIds } from "../js/career/stints.js";
import { readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import {
  acceptPoachOffer, declinePoachOffer, expirePoachOffer, maybeCreatePoachOffer, poachBlocker, poachChance,
  poachWindowOpen,
} from "../js/modes/poaching.js";
import { generateReemploymentOffers } from "../js/modes/timeTravelCareer.js";
import { evaluateCareerEmployment } from "../js/modes/careerContract.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  YEAR, badSeasons, goodSeasons, hiredRoot, poachReadyRoot, rootWithPoachRoll, withGamePlayed, withHistory,
} from "./helpers/careerFixtures.js";

const withStory = (root, patch) => ({ ...root, story: { ...root.story, ...patch } });
const withSeasonYear = (root, year) => ({ ...root, leagueCareer: { ...root.leagueCareer, season: { ...root.leagueCareer.season, year } } });
const offered = () => rootWithPoachRoll(poachReadyRoot(), maybeCreatePoachOffer, true);

test("poachChance: nothing below the threshold, a base chance at it, rising, and capped", () => {
  assert.equal(poachChance(POACH_MIN_REPUTATION - 1), 0);
  assert.equal(poachChance(POACH_MIN_REPUTATION), POACH_BASE_CHANCE);
  assert.ok(poachChance(POACH_MIN_REPUTATION + 10) > poachChance(POACH_MIN_REPUTATION));
  assert.equal(poachChance(100), POACH_MAX_CHANCE, "nobody is guaranteed an offer");
  assert.ok(POACH_MAX_CHANCE < 1);
});

test("poachBlocker: a ready coach is eligible; each closed gate says which one", () => {
  const ready = poachReadyRoot();
  assert.equal(poachBlocker(ready), null);
  assert.equal(poachBlocker(poachReadyRoot({ reputation: POACH_MIN_REPUTATION - 1 })), "low-reputation");
  assert.equal(poachBlocker(poachReadyRoot({ seasons: POACH_MIN_SEASONS_IN_STINT - 1 })), "too-early");
  assert.equal(poachBlocker(withStory(ready, { pendingDecision: { type: "story-event", year: YEAR, eventId: "x" } })), "pending-decision");
  assert.equal(poachBlocker(withStory(ready, { poachOffer: { id: "a" } })), "has-offer");
  assert.equal(poachBlocker(withStory(ready, { employment: { status: "renewal" } })), "not-active");
});

test("poachBlocker: cooldown after an offer, lifted once enough seasons have passed", () => {
  const ready = withStory(poachReadyRoot(), { eventLog: [{ type: "poach-offer", year: YEAR - 1, teamId: "X" }] });
  assert.equal(poachBlocker(ready), "cooldown", "offered one season ago");
  const later = withSeasonYear(ready, YEAR - 1 + POACH_COOLDOWN_SEASONS);
  assert.equal(poachBlocker(later), null, "cooldown elapsed");
});

test("maybeCreatePoachOffer: below the reputation bar it never fires, whatever the story id", () => {
  const low = poachReadyRoot({ reputation: POACH_MIN_REPUTATION - 1 });
  for (let i = 0; i < 40; i++) {
    const candidate = withStory(low, { storyId: `s${i}` });
    assert.equal(maybeCreatePoachOffer(candidate), candidate);
  }
});

test("maybeCreatePoachOffer: deterministic (a reload can't re-roll), and a real coin flip across stories", () => {
  const base = poachReadyRoot({ reputation: POACH_MIN_REPUTATION });
  const results = Array.from({ length: 60 }, (_, i) => Boolean(maybeCreatePoachOffer(withStory(base, { storyId: `s${i}` })).story.poachOffer));
  const again = Array.from({ length: 60 }, (_, i) => Boolean(maybeCreatePoachOffer(withStory(base, { storyId: `s${i}` })).story.poachOffer));
  assert.deepEqual(again, results, "same story + year always rolls the same");
  const hits = results.filter(Boolean).length;
  assert.ok(hits > 10 && hits < 40, `~40% of stories should be poached at the threshold, got ${hits}/60`);
  const star = Array.from({ length: 60 }, (_, i) => Boolean(maybeCreatePoachOffer(withStory(poachReadyRoot({ reputation: 100 }), { storyId: `s${i}` })).story.poachOffer)).filter(Boolean).length;
  assert.ok(star > hits, "a higher reputation gets poached more often");
});

test("the offer: a different team, from the strong end, stamped with its year, and logged", () => {
  const root = offered();
  const offer = root.story.poachOffer;
  assert.notEqual(offer.teamId, root.story.employer, "can't be poached by the team you already coach");
  assert.equal(offer.archetype, "contender");
  assert.equal(offer.year, root.leagueCareer.season.year);
  assert.ok(Number.isFinite(offer.trust) && Number.isFinite(offer.pressure) && Number.isFinite(offer.authority));
  const entry = root.story.eventLog.at(-1);
  assert.deepEqual({ type: entry.type, year: entry.year, teamId: entry.teamId }, { type: "poach-offer", year: YEAR, teamId: offer.teamId });
});

test("a coach already at a contender is never poached by his own club", () => {
  // The default fixture hires from the middle tier, which never overlaps the contender tier poachers
  // come from -- so this needs a coach whose CURRENT team is itself a contender (offers[2]).
  const base = poachReadyRoot({ reputation: 100, offerIndex: 2 });
  let offers = 0;
  for (let i = 0; i < 120; i++) {
    const rolled = maybeCreatePoachOffer(withStory(base, { storyId: `own-${i}` }));
    if (!rolled.story.poachOffer) continue;
    offers++;
    assert.notEqual(rolled.story.poachOffer.teamId, base.story.employer, `story own-${i}: poached by his own club`);
  }
  assert.ok(offers > 40, `test would be vacuous without enough offers, got ${offers}`);
});

test("an offer survives the save round-trip, and a malformed one is rejected by the validator", () => {
  const root = offered();
  const storage = createMemoryStorage();
  writeRootSave(root, storage);
  assert.deepEqual(readRootSave(storage).story.poachOffer, root.story.poachOffer);

  for (const [label, patch] of [
    ["year must be an integer", { year: "1995" }],
    ["teamId is required", { teamId: "" }],
    ["archetype must be a known tier", { archetype: "superteam" }],
  ]) {
    const broken = withStory(root, { poachOffer: { ...root.story.poachOffer, ...patch } });
    assert.throws(() => writeRootSave(broken, createMemoryStorage()), /invalid root save/, label);
  }
  const nulled = createMemoryStorage();
  writeRootSave(withStory(root, { poachOffer: null }), nulled);
  assert.ok(readRootSave(nulled), "null (no offer) is the normal state");
  assert.ok(writeRootSave(poachReadyRoot(), createMemoryStorage()) !== false, "and so is a save from before B6 (no field at all)");
});

test("the window: open before the first game, closed once a game is played", () => {
  const root = offered();
  assert.equal(poachWindowOpen(root), true);
  assert.equal(poachWindowOpen(withGamePlayed(root)), false);
  assert.equal(poachWindowOpen(withStory(root, { poachOffer: null })), false);
  assert.equal(poachWindowOpen(withStory(root, { employment: { status: "fired" } })), false);
});

test("declining: trust goes up (capped at 100), the offer is gone, and the refusal is on record", () => {
  const root = withStory(offered(), { frontOfficeTrust: 50 });
  const out = declinePoachOffer(root);
  assert.equal(out.story.poachOffer, null);
  assert.equal(out.story.frontOfficeTrust, 50 + POACH_DECLINE_TRUST_BONUS);
  assert.equal(out.story.eventLog.at(-1).type, "poach-declined");
  assert.equal(out.story.employer, root.story.employer, "still at the same team");
  assert.equal(declinePoachOffer(withStory(root, { frontOfficeTrust: 98 })).story.frontOfficeTrust, 100);
  assert.throws(() => declinePoachOffer(out), /no poach offer/);
});

test("accepting: stint archived as poached, reputation cost, fresh start, assets carried over", () => {
  const root = offered();
  const offer = root.story.poachOffer;
  const before = { employer: root.story.employer, reputation: root.coach.reputation, cash: root.coach.cash, stints: root.coach.stints.length };
  const out = acceptPoachOffer(root);

  assert.equal(out.story.employer, offer.teamId);
  assert.equal(out.story.employment.status, "active");
  assert.equal(out.story.poachOffer, null);
  assert.equal(out.story.eventLog[0].type, "poached-in");
  assert.equal(out.leagueCareer.season.userTeamId, offer.teamId);
  assert.equal(out.story.startYear, YEAR);

  assert.equal(out.coach.stints.length, before.stints + 1);
  const stint = out.coach.stints.at(-1);
  assert.equal(stint.reason, "poached");
  assert.equal(stint.teamId, before.employer);
  assert.equal(stint.seasons, 2);
  assert.equal(stint.wins, 116);

  assert.equal(out.coach.reputation, before.reputation + POACH_ACCEPT_REPUTATION_DELTA);
  assert.equal(out.coach.cash, before.cash, "your savings come with you");
});

test("accepting pays a signing bonus: trust on top of the club's own number, and a real raise", () => {
  const root = offered();
  const offer = root.story.poachOffer;
  const out = acceptPoachOffer(root);

  assert.equal(out.story.frontOfficeTrust, offer.trust + POACH_SIGNING_TRUST_BONUS);
  assert.equal(out.story.mediaPressure, offer.pressure, "the pressure of the new job is NOT discounted: that is the price");
  assert.equal(out.story.employment.offer.salary, POACH_SIGNING_SALARY);
  assert.equal(out.story.employment.contractYears, out.story.employment.offer.years);
  assert.ok(POACH_SIGNING_SALARY > COACH_BASE_SALARY, "otherwise the 'raise' is no raise");

  // Not just a field: the finance engine really pays it, and it beats what the old job paid.
  assert.equal(currentCoachSalary(root), COACH_BASE_SALARY);
  assert.equal(currentCoachSalary(out), POACH_SIGNING_SALARY);
  const paid = settleCoachFinances(out, () => 0.5);
  assert.equal(paid.coach.cash - out.coach.cash, POACH_SIGNING_SALARY);
  const paidBefore = settleCoachFinances(root, () => 0.5);
  assert.equal(paidBefore.coach.cash - root.coach.cash, COACH_BASE_SALARY);
});

test("the signing trust bonus is capped at 100, and the signed-up root survives a save round-trip", () => {
  const root = offered();
  const generous = withStory(root, { poachOffer: { ...root.story.poachOffer, trust: 95 } });
  assert.equal(acceptPoachOffer(generous).story.frontOfficeTrust, 100);

  const out = acceptPoachOffer(root);
  const storage = createMemoryStorage();
  writeRootSave(out, storage);
  const back = readRootSave(storage);
  assert.equal(back.story.employment.offer.salary, POACH_SIGNING_SALARY);
  assert.equal(currentCoachSalary(back), POACH_SIGNING_SALARY);
});

test("balance guard: after moving, trust is healthy and the pay is higher (the move is not a pure loss)", () => {
  // A contender's own trust is 45 and the old salary never changed while pressure jumped, so without
  // the signing terms no sensible player ever accepted. Both numbers the card advertises must hold.
  const out = acceptPoachOffer(offered());
  assert.ok(out.story.frontOfficeTrust >= 55, `trust after moving: ${out.story.frontOfficeTrust}`);
  assert.ok(currentCoachSalary(out) > COACH_BASE_SALARY);
});

test("accepting is refused without an offer, after the season has started, or while not employed", () => {
  assert.throws(() => acceptPoachOffer(poachReadyRoot()), /no poach offer/);
  assert.throws(() => acceptPoachOffer(withGamePlayed(offered())), /lapsed/);
  assert.throws(() => acceptPoachOffer(withStory(offered(), { employment: { status: "fired" } })), /lapsed/);
});

test("the club you walked out on is a burned bridge: it never shows up on a later job board", () => {
  const root = offered();
  const old = root.story.employer;
  const poached = acceptPoachOffer(root);
  assert.deepEqual(burnedBridgeTeamIds(poached), [old]);
  assert.deepEqual(burnedBridgeTeamIds(hiredRoot(60)), [], "nobody burned yet");

  // Get fired from the new job, many different timelines: the old club must never be offered.
  for (let i = 0; i < 30; i++) {
    const variant = withStory(poached, { storyId: `${poached.story.storyId}-b${i}` });
    const fired = evaluateCareerEmployment(withHistory(variant, badSeasons(variant)));
    assert.equal(fired.story.employment.status, "fired");
    const board = generateReemploymentOffers(withStory(fired, { storyId: variant.story.storyId }));
    assert.ok(board.every((offer) => offer.teamId !== old), `variant ${i} offered the burned club`);
    assert.ok(board.every((offer) => offer.teamId !== variant.story.employer), "nor the club that just fired you");
  }
});

test("a firing (not a poaching) leaves no burned bridges", () => {
  const hired = hiredRoot(60);
  const fired = evaluateCareerEmployment(withHistory(hired, badSeasons(hired)));
  assert.equal(fired.coach.stints.at(-1).reason, "two-bad-seasons");
  assert.deepEqual(burnedBridgeTeamIds(fired), []);
});

test("expirePoachOffer: a stale offer is cleared and logged; a current one is untouched", () => {
  const root = offered();
  assert.equal(expirePoachOffer(root), root, "same year: still live");
  const next = expirePoachOffer(withSeasonYear(root, YEAR + 1));
  assert.equal(next.story.poachOffer, null);
  assert.equal(next.story.eventLog.at(-1).type, "poach-expired");
  assert.equal(next.story.eventLog.at(-1).year, YEAR);
  const none = poachReadyRoot();
  assert.equal(expirePoachOffer(none), none);
});

test("a declined or lapsed offer still counts toward the cooldown (no instant re-offer)", () => {
  const declined = declinePoachOffer(offered());
  assert.equal(poachBlocker(withSeasonYear(declined, YEAR + 1)), "cooldown");
  const lapsed = expirePoachOffer(withSeasonYear(offered(), YEAR + 1));
  assert.equal(poachBlocker(lapsed), "cooldown");
});

test("good seasons fixture sanity: the stint the poacher saw really was two winning years", () => {
  const hired = hiredRoot(80);
  const history = goodSeasons(hired, 2);
  assert.deepEqual(history.map((s) => s.year), [YEAR - 2, YEAR - 1]);
});
