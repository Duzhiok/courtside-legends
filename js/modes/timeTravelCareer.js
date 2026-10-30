import { historicalSeason } from "../data/historicalSeasons.js";
import { PLAYERS, overall } from "../data/players.js";
import { buildCpuTeamForYear, createSeason } from "../engine/season.js";
import { createRootState } from "../data/saveRoot.js";
import { createLeagueCareer, recordCareerEvent } from "./leagueCareer.js";
import { buildSeasonGoal } from "../career/seasonGoals.js";
import { createCoachProfile } from "../career/coachProfile.js";
import {
  DEFAULT_COACH_ORIGIN,
  applyOriginToCoach,
  applyOriginToOffer,
  isKnownCoachOrigin,
} from "../career/coachOrigins.js";

const PHILOSOPHIES = new Set([
  "analytics",
  "relationships",
  "tactics",
  "scouting",
]);

const OFFER_DETAILS = {
  rebuild: {
    authority: 80,
    firstYearGoal: "培养两名核心轮换",
    pressure: 35,
    trust: 58,
    summary: "阵容仍在重建期，你将获得充分权限，但需要耐心培养年轻轮换。",
  },
  middle: {
    authority: 60,
    firstYearGoal: "进入季后赛",
    pressure: 55,
    trust: 52,
    summary: "阵容具备季后赛基础，管理层期待你在竞争力与长期建设间取舍。",
  },
  contender: {
    authority: 40,
    firstYearGoal: "进入分区决赛",
    pressure: 80,
    trust: 45,
    summary: "阵容拥有争冠实力，但容错空间有限，短期成绩将决定你的处境。",
  },
};

const KNOWLEDGE_CHOICES = {
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

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validateInput({ year, philosophy, seed, origin } = {}) {
  if (!Number.isInteger(year)) {
    throw new TypeError("year must be an integer");
  }
  const historical = historicalSeason(year);
  if (!historical) {
    throw new RangeError(`year ${year} is not a supported historical season`);
  }
  if (!PHILOSOPHIES.has(philosophy)) {
    throw new TypeError("philosophy is not supported");
  }
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new TypeError("seed must be a finite integer");
  }
  // origin is optional (defaults to the zero-modifier "generalist") so every existing caller that
  // predates this feature -- tests, QA scripts, old saves resuming a prologue -- keeps working
  // unchanged; only an explicitly-passed unknown id is rejected.
  if (origin !== undefined && !isKnownCoachOrigin(origin)) {
    throw new TypeError("origin is not supported");
  }
  return historical;
}

function fallbackTeamScore(year, team) {
  return 40 + (hashString(`${year}:${team.id}`) % 5001) / 100;
}

function teamStrength(year, team) {
  const exactYearCards = PLAYERS.filter(
    (player) =>
      Number(player.season) === year
      && player.team === (team.bref || team.id),
  )
    .sort((left, right) => overall(right) - overall(left))
    .slice(0, 8);

  if (exactYearCards.length < 8) {
    return fallbackTeamScore(year, team);
  }
  return (
    exactYearCards.reduce((total, player) => total + overall(player), 0)
    / exactYearCards.length
  );
}

function selectFromThird(rng, teams) {
  return teams[Math.floor(rng() * teams.length)];
}

export function generateInterviewOffers(input) {
  const historical = validateInput(input);
  const { year, philosophy, seed, origin } = input;
  const rng = mulberry32((seed >>> 0) ^ hashString(`${year}:${philosophy}`));
  const ranked = historical.teams
    .map((team) => ({ team, score: teamStrength(year, team) }))
    .sort(
      (left, right) =>
        left.score - right.score || left.team.id.localeCompare(right.team.id),
    );
  const firstCut = Math.floor(ranked.length / 3);
  const secondCut = Math.floor((ranked.length * 2) / 3);
  const thirds = [
    ranked.slice(0, firstCut),
    ranked.slice(firstCut, secondCut),
    ranked.slice(secondCut),
  ];
  const archetypes = ["rebuild", "middle", "contender"];

  return thirds.map((third, index) => {
    const team = selectFromThird(rng, third).team;
    const archetype = archetypes[index];
    const offer = {
      id: `${year}-${team.id}-${archetype}`,
      teamId: team.id,
      teamName: team.name,
      archetype,
      ...OFFER_DETAILS[archetype],
    };
    // Every offer on the board reads the origin's spin, not just the one the player eventually
    // accepts -- a grassroots climber looks more trustworthy-but-lower-authority across the board.
    return applyOriginToOffer(offer, origin ?? DEFAULT_COACH_ORIGIN);
  });
}

export function createTimeTravelPrologue(input) {
  const { year, philosophy, seed, origin } = input || {};
  return {
    year,
    philosophy,
    seed,
    origin: origin ?? DEFAULT_COACH_ORIGIN,
    offers: generateInterviewOffers(input),
    selectedOfferId: null,
  };
}

export function acceptInterviewOffer(prologue, offerId) {
  const historical = validateInput(prologue);
  const offer = prologue.offers?.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new RangeError("unknown interview offer");
  }
  const teamMeta = historical.teams.find((team) => team.id === offer.teamId);
  if (!teamMeta) {
    throw new RangeError("interview offer references an unknown historical team");
  }

  const userTeam = buildCpuTeamForYear(prologue.year, teamMeta, new Set());
  const season = createSeason({
    userTeamId: offer.teamId,
    userTeamName: offer.teamName,
    userTeam,
    mode: "historical",
    year: prologue.year,
    seed: prologue.seed,
  });
  const storyId = `tt-${prologue.year}-${prologue.seed}`;
  let leagueCareer = createLeagueCareer({
    kind: "timeTravel",
    season,
    storyId,
    careerId: storyId,
  });
  leagueCareer = recordCareerEvent(
    leagueCareer,
    {
      type: "accepted-offer",
      year: prologue.year,
      teamId: offer.teamId,
      teamName: offer.teamName,
    },
    0,
  );

  // B1 of docs/CAREER_LIFE_ROADMAP.md: the first season's goal is sized the same way every later
  // season's is (buildSeasonGoal off the actual constructed roster), not just copied from the
  // interview offer's static firstYearGoal text -- which stays in `promises` below purely as the
  // original flavor-text summary shown on the offer card, now driven by the same computed goal so
  // the two can't drift out of sync.
  const seasonGoal = { ...buildSeasonGoal(season.teams, offer.teamId), year: prologue.year, status: "active" };
  const origin = prologue.origin ?? DEFAULT_COACH_ORIGIN;

  return createRootState({
    activeMode: "timeTravel",
    // The origin only ever touches reputation (wired into B3's renewal menu since R101) -- not
    // coach.perks or story.relationships, which no gameplay code reads yet (see coachOrigins.js's
    // applyOriginToCoach comment for why that's deliberate, not an oversight).
    coach: applyOriginToCoach(createCoachProfile(), origin),
    leagueCareer,
    story: {
      storyId,
      startYear: prologue.year,
      currentChapter: "prologue",
      philosophy: prologue.philosophy,
      origin,
      employer: offer.teamId,
      futureKnowledge: 3,
      frontOfficeTrust: offer.trust,
      mediaPressure: offer.pressure,
      timelineDivergence: 0,
      relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
      promises: [
        { id: "first-year-goal", text: seasonGoal.label, status: "active" },
      ],
      // origin is mirrored into flags too (not just the top-level story.origin field above) so A2's
      // existing eventPool.js condition matcher -- which only knows how to read story.flags -- can
      // gate a future origin-flavored event without any changes to that engine.
      flags: { origin },
      seasonGoal,
      eventLog: [
        {
          type: "accepted-offer",
          year: prologue.year,
          teamId: offer.teamId,
          teamName: offer.teamName,
        },
      ],
      pendingDecision: "future-knowledge-intro",
      ending: null,
    },
  });
}

export function resolveFutureKnowledgeChoice(root, choiceId) {
  if (!root?.story || typeof root.story !== "object") {
    throw new TypeError("root with a story is required");
  }
  if (root.story.flags?.futureKnowledgeIntroResolved) {
    throw new Error("future knowledge intro was already resolved");
  }
  if (root.story.pendingDecision !== "future-knowledge-intro") {
    throw new Error("future knowledge intro decision is not pending");
  }
  const effects = KNOWLEDGE_CHOICES[choiceId];
  if (!effects) {
    throw new RangeError("unknown future knowledge choice");
  }
  if ((root.story.futureKnowledge ?? 0) + effects.knowledge < 0) {
    throw new Error("insufficient future knowledge");
  }

  return {
    ...root,
    story: {
      ...root.story,
      futureKnowledge: root.story.futureKnowledge + effects.knowledge,
      frontOfficeTrust: root.story.frontOfficeTrust + effects.trust,
      mediaPressure: root.story.mediaPressure + effects.mediaPressure,
      timelineDivergence:
        root.story.timelineDivergence + effects.divergence,
      flags: {
        ...(root.story.flags || {}),
        futureKnowledgeIntroResolved: true,
      },
      eventLog: [
        ...(root.story.eventLog || []),
        { type: "future-knowledge-intro", choiceId, effects: { ...effects } },
      ],
      pendingDecision: null,
    },
  };
}
