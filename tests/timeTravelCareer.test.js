import test from "node:test";
import assert from "node:assert/strict";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import { PLAYERS } from "../js/data/players.js";
import {
  acceptInterviewOffer,
  createTimeTravelPrologue,
  generateInterviewOffers,
  resolveFutureKnowledgeChoice,
} from "../js/modes/timeTravelCareer.js";

const INPUT = { year: 1991, philosophy: "analytics", seed: 42 };

function playerCard(team, index) {
  const rating = 55 + ((team.charCodeAt(0) + index) % 35);
  return {
    id: `test-${team}-${index}`,
    name: `${team} Player ${index}`,
    season: 1991,
    team,
    pos: "SF",
    scoring: rating,
    three: rating,
    mid: rating,
    paint: rating,
    defense: rating,
    rebound: rating,
    pass: rating,
    speed: rating,
    strength: rating,
    stamina: rating,
    iq: rating,
    clutch: rating,
    steal: rating,
    block: rating,
  };
}

for (const team of historicalSeason(1991).teams) {
  for (let index = 0; index < 12; index++) {
    PLAYERS.push(playerCard(team.bref || team.id, index));
  }
}
for (let index = 0; index < 12; index++) {
  PLAYERS.push(playerCard("FREE", index));
}

function acceptedRoot() {
  const prologue = createTimeTravelPrologue(INPUT);
  return acceptInterviewOffer(prologue, prologue.offers[0].id);
}

test("time-travel interview offers are deterministic without Math.random", () => {
  const expected = generateInterviewOffers(INPUT);
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error("interview generation called Math.random");
  };
  try {
    assert.deepEqual(generateInterviewOffers(INPUT), expected);
  } finally {
    Math.random = originalRandom;
  }
});

test("interview offers contain one distinct team from every archetype", () => {
  const offers = generateInterviewOffers(INPUT);

  assert.equal(offers.length, 3);
  assert.equal(new Set(offers.map((offer) => offer.teamId)).size, 3);
  assert.deepEqual(offers.map((offer) => offer.archetype), [
    "rebuild",
    "middle",
    "contender",
  ]);
});

test("interview generation rejects unsupported inputs", () => {
  assert.throws(
    () => generateInterviewOffers({ ...INPUT, year: 1900 }),
    /supported|historical|year/i,
  );
  assert.throws(
    () => generateInterviewOffers({ ...INPUT, year: 1991.5 }),
    /year|integer/i,
  );
  assert.throws(
    () => generateInterviewOffers({ ...INPUT, philosophy: "luck" }),
    /philosophy/i,
  );
  assert.throws(
    () => generateInterviewOffers({ ...INPUT, seed: 4.2 }),
    /seed|integer/i,
  );
  assert.throws(
    () => generateInterviewOffers({ ...INPUT, seed: Infinity }),
    /seed|integer|finite/i,
  );
});

test("time-travel prologue accepts an offer into a historical career", () => {
  const prologue = createTimeTravelPrologue(INPUT);
  const offer = prologue.offers[0];
  const root = acceptInterviewOffer(prologue, offer.id);

  assert.deepEqual(
    { ...prologue, offers: undefined },
    { ...INPUT, offers: undefined, selectedOfferId: null },
  );
  assert.equal(root.activeMode, "timeTravel");
  assert.equal(root.leagueCareer.kind, "timeTravel");
  assert.equal(root.leagueCareer.storyId, "tt-1991-42");
  assert.equal(root.leagueCareer.season.mode, "historical");
  assert.equal(root.leagueCareer.season.year, 1991);
  assert.equal(root.leagueCareer.season.userTeamId, offer.teamId);
  assert.equal(root.story.storyId, "tt-1991-42");
  assert.equal(root.story.employer, offer.teamId);
  // B1 of docs/CAREER_LIFE_ROADMAP.md: the tracked promise text now comes from the same computed
  // seasonGoal every later season also uses (buildSeasonGoal off the constructed roster), not the
  // offer's static firstYearGoal copy -- so the two can never drift out of sync with each other.
  assert.ok(root.story.seasonGoal, "accepting an offer must set an initial season goal");
  assert.equal(root.story.seasonGoal.year, 1991);
  assert.equal(root.story.seasonGoal.status, "active");
  assert.deepEqual(root.story.promises, [
    { id: "first-year-goal", text: root.story.seasonGoal.label, status: "active" },
  ]);
  assert.deepEqual(root.story.eventLog, [
    { type: "accepted-offer", year: 1991, teamId: offer.teamId, teamName: offer.teamName },
  ]);
  assert.equal(root.leagueCareer.history.length, 1);
  assert.equal(root.leagueCareer.history[0].type, "accepted-offer");
  assert.equal(root.leagueCareer.history[0].year, 1991);
  assert.equal(root.leagueCareer.history[0].teamId, offer.teamId);
  assert.equal(root.leagueCareer.history[0].teamName, offer.teamName);
});

test("offer acceptance rejects unknown offers and preserves the prologue", () => {
  const prologue = createTimeTravelPrologue(INPUT);
  const before = structuredClone(prologue);

  assert.throws(() => acceptInterviewOffer(prologue, "missing"), /offer/i);
  acceptInterviewOffer(prologue, prologue.offers[0].id);
  assert.deepEqual(prologue, before);
});

const CHOICE_EFFECTS = {
  "share-draft-sleeper": {
    knowledge: -1,
    trust: 8,
    mediaPressure: 0,
    divergence: 6,
  },
  "introduce-load-management": {
    knowledge: -1,
    trust: 4,
    mediaPressure: 5,
    divergence: 4,
  },
  "keep-quiet": {
    knowledge: 0,
    trust: -2,
    mediaPressure: 0,
    divergence: 0,
  },
};

for (const [choiceId, effects] of Object.entries(CHOICE_EFFECTS)) {
  test(`future knowledge choice ${choiceId} applies exact deltas immutably`, () => {
    const root = acceptedRoot();
    const before = structuredClone(root);
    const next = resolveFutureKnowledgeChoice(root, choiceId);

    assert.notEqual(next, root);
    assert.notEqual(next.story, root.story);
    assert.deepEqual(root, before);
    assert.equal(
      next.story.futureKnowledge,
      root.story.futureKnowledge + effects.knowledge,
    );
    assert.equal(
      next.story.frontOfficeTrust,
      root.story.frontOfficeTrust + effects.trust,
    );
    assert.equal(
      next.story.mediaPressure,
      root.story.mediaPressure + effects.mediaPressure,
    );
    assert.equal(
      next.story.timelineDivergence,
      root.story.timelineDivergence + effects.divergence,
    );
    assert.equal(next.story.pendingDecision, null);
    assert.equal(next.story.flags.futureKnowledgeIntroResolved, true);
    assert.deepEqual(next.story.eventLog.at(-1), {
      type: "future-knowledge-intro",
      choiceId,
      effects,
    });
  });
}

test("future knowledge rejects invalid or repeated resolutions", () => {
  const root = acceptedRoot();
  const resolved = resolveFutureKnowledgeChoice(root, "keep-quiet");
  assert.throws(
    () => resolveFutureKnowledgeChoice(resolved, "keep-quiet"),
    /pending|resolved|duplicate/i,
  );
  assert.throws(
    () => resolveFutureKnowledgeChoice(root, "unknown"),
    /choice/i,
  );
  assert.throws(
    () =>
      resolveFutureKnowledgeChoice(
        { ...root, story: { ...root.story, pendingDecision: null } },
        "keep-quiet",
      ),
    /pending/i,
  );
  assert.throws(
    () =>
      resolveFutureKnowledgeChoice(
        { ...root, story: { ...root.story, futureKnowledge: 0 } },
        "share-draft-sleeper",
      ),
    /knowledge/i,
  );
});
