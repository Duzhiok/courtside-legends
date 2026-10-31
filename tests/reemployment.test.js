import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptReemploymentOffer,
  generateInterviewOffers,
  generateReemploymentOffers,
} from "../js/modes/timeTravelCareer.js";
import {
  declineCareerContracts,
  evaluateCareerEmployment,
} from "../js/modes/careerContract.js";
import {
  INITIAL_CONTRACT_YEARS,
  REEMPLOYMENT_FULL_BOARD_REPUTATION,
  REEMPLOYMENT_LIMITED_BOARD_REPUTATION,
} from "../js/career/balance.js";
import { readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { YEAR, badSeasons, firedRoot, hiredRoot, withHistory } from "./helpers/careerFixtures.js";

test("a fired coach's board never includes the team that just fired them", () => {
  const root = firedRoot(80);
  const offers = generateReemploymentOffers(root);
  assert.ok(offers.length > 0);
  assert.ok(offers.every((offer) => offer.teamId !== root.story.employer));
});

test("the exclusion holds across many seeds, not just the one this save happens to roll", () => {
  // The seed folds in the stint count, so padding it walks the board through 40 different draws.
  // (A single draw can dodge the ex-employer by luck and hide a broken exclusion.)
  const base = firedRoot(80);
  let boardsWithExEmployerIfNotExcluded = 0;
  for (let stints = 1; stints <= 40; stints++) {
    const root = { ...base, coach: { ...base.coach, stints: Array.from({ length: stints }, () => ({})) } };
    assert.ok(
      generateReemploymentOffers(root).every((offer) => offer.teamId !== base.story.employer),
      `stint count ${stints} offered the team that just fired us`,
    );
    const unfiltered = generateInterviewOffers({
      year: YEAR, philosophy: base.story.philosophy, origin: base.story.origin, seed: stints,
    });
    if (unfiltered.some((offer) => offer.teamId === base.story.employer)) boardsWithExEmployerIfNotExcluded++;
  }
  assert.ok(boardsWithExEmployerIfNotExcluded > 0, "sanity: without the filter the ex-employer WOULD come up");
});

test("generateInterviewOffers can exclude teams and still fill the board", () => {
  const input = { year: YEAR, philosophy: "analytics", seed: 3 };
  const full = generateInterviewOffers(input);
  const trimmed = generateInterviewOffers({ ...input, excludeTeamIds: [full[0].teamId] });
  assert.equal(trimmed.length, 3);
  assert.ok(trimmed.every((offer) => offer.teamId !== full[0].teamId));
});

test("the board is deterministic: the same save always shows the same offers", () => {
  const root = firedRoot(80);
  assert.deepEqual(generateReemploymentOffers(root), generateReemploymentOffers(root));
});

test("reputation decides how many offers show up, and the board is never empty", () => {
  const countAt = (rep) => generateReemploymentOffers(firedRoot(rep)).length;
  assert.equal(countAt(REEMPLOYMENT_FULL_BOARD_REPUTATION), 3, "full board at the threshold");
  assert.equal(countAt(REEMPLOYMENT_FULL_BOARD_REPUTATION - 1), 2, "just under it: rebuild + middle");
  assert.equal(countAt(REEMPLOYMENT_LIMITED_BOARD_REPUTATION), 2);
  assert.equal(countAt(REEMPLOYMENT_LIMITED_BOARD_REPUTATION - 1), 1, "just under the floor: one job");
  assert.equal(countAt(0), 1, "even a zero-reputation coach is never soft-locked with no way to coach");
});

test("a low-reputation board keeps the BEST jobs off the table, not the worst", () => {
  const low = generateReemploymentOffers(firedRoot(10));
  assert.deepEqual(low.map((offer) => offer.archetype), ["rebuild"]);
  const mid = generateReemploymentOffers(firedRoot(40));
  assert.deepEqual(mid.map((offer) => offer.archetype), ["rebuild", "middle"]);
});

test("accepting an offer starts a fresh stint at the new team and keeps the coach + the timeline", () => {
  const fired = firedRoot(80);
  const offer = generateReemploymentOffers(fired)[0];
  const next = acceptReemploymentOffer(fired, offer.id);

  // the job is new...
  assert.equal(next.story.employer, offer.teamId);
  assert.equal(next.leagueCareer.season.userTeamId, offer.teamId);
  assert.deepEqual(next.story.employment, {
    status: "active", contractYears: INITIAL_CONTRACT_YEARS, tenureStartSeasonCount: 0,
  });
  assert.equal(next.story.ending, null, "the old stint's ending is gone");
  assert.equal(next.story.pendingDecision, null);
  assert.equal(next.story.startYear, fired.leagueCareer.season.year, "stint clock restarts");
  assert.equal(next.story.frontOfficeTrust, offer.trust);
  assert.equal(next.story.seasonGoal.status, "active");
  assert.deepEqual(next.leagueCareer.management.seasonHistory ?? [], [], "new club, empty record");

  // ...but the PERSON and the TIMELINE carry over
  assert.deepEqual(next.coach, fired.coach, "reputation, cash, stints are the coach's, not the job's");
  assert.equal(next.coach.stints.length, 1, "the fired stint stays archived");
  assert.equal(next.story.storyId, fired.story.storyId);
  assert.equal(next.story.origin, fired.story.origin);
  assert.equal(next.story.philosophy, fired.story.philosophy);
  assert.equal(next.story.futureKnowledge, fired.story.futureKnowledge);
  assert.equal(next.story.timelineDivergence, fired.story.timelineDivergence);
});

test("accepting is immutable and the result survives a save/load round trip", () => {
  const fired = firedRoot(80);
  const snapshot = JSON.stringify(fired);
  const next = acceptReemploymentOffer(fired, generateReemploymentOffers(fired)[0].id);
  assert.equal(JSON.stringify(fired), snapshot, "the input root was not mutated");

  const storage = createMemoryStorage();
  writeRootSave(next, storage);
  const loaded = readRootSave(storage);
  assert.ok(loaded, "saveRoot accepts the re-employed career");
  assert.equal(loaded.story.employer, next.story.employer);
});

test("a departed coach (declined renewal) can job-hunt too", () => {
  const hired = hiredRoot(80);
  const renewal = evaluateCareerEmployment(withHistory(hired, Array.from({ length: 5 }, (_, i) => ({
    year: YEAR + i, teamId: hired.story.employer, teamName: "T", record: { w: 50, l: 32 }, finish: "playoffs", championId: "LAL",
  }))));
  const departed = declineCareerContracts(renewal);
  assert.equal(departed.story.employment.status, "departed");
  const offer = generateReemploymentOffers(departed)[0];
  const next = acceptReemploymentOffer(departed, offer.id);
  assert.equal(next.story.employment.status, "active");
  assert.equal(next.coach.stints.length, 1);
});

test("you can only job-hunt after a stint actually ended", () => {
  const active = hiredRoot(80);
  assert.throws(() => acceptReemploymentOffer(active, "anything"), /not currently looking/);
});

test("accepting rejects an unknown offer and an offer your reputation can't reach", () => {
  const fired = firedRoot(10); // board trimmed to rebuild only
  assert.throws(() => acceptReemploymentOffer(fired, "nope"), /unknown reemployment offer/);
  const full = generateReemploymentOffers(firedRoot(80));
  const contender = full.find((offer) => offer.archetype === "contender");
  assert.ok(contender, "full board has a contender");
  assert.throws(() => acceptReemploymentOffer(fired, contender.id), /unknown reemployment offer/);
});

test("a second stint runs the whole firing machinery again and archives a second stint", () => {
  const fired = firedRoot(80);
  const next = acceptReemploymentOffer(fired, generateReemploymentOffers(fired)[0].id);
  const firedAgain = evaluateCareerEmployment(withHistory(next, badSeasons(next)));
  assert.equal(firedAgain.story.employment.status, "fired");
  assert.equal(firedAgain.coach.stints.length, 2);
  assert.equal(firedAgain.coach.stints[1].teamId, next.story.employer);
  assert.notEqual(firedAgain.coach.stints[0].teamId, firedAgain.coach.stints[1].teamId);
  // and the third board differs from the second only through the stint count in the seed
  const board3 = generateReemploymentOffers(firedAgain);
  assert.ok(board3.every((offer) => offer.teamId !== next.story.employer));
});
