import { historicalSeason } from "../data/historicalSeasons.js";
import { PLAYERS, overall } from "../data/players.js";
import { buildCpuTeamForYear, createSeason } from "../engine/season.js";
import { createRootState } from "../data/saveRoot.js";
import { createLeagueCareer, recordCareerEvent } from "./leagueCareer.js";

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

function validateInput({ year, philosophy, seed } = {}) {
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
  const { year, philosophy, seed } = input;
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
    return {
      id: `${year}-${team.id}-${archetype}`,
      teamId: team.id,
      teamName: team.name,
      archetype,
      ...OFFER_DETAILS[archetype],
    };
  });
}

export function createTimeTravelPrologue(input) {
  const { year, philosophy, seed } = input || {};
  return {
    year,
    philosophy,
    seed,
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

  return createRootState({
    activeMode: "timeTravel",
    leagueCareer,
    story: {
      storyId,
      startYear: prologue.year,
      currentChapter: "prologue",
      philosophy: prologue.philosophy,
      employer: offer.teamId,
      futureKnowledge: 3,
      frontOfficeTrust: offer.trust,
      mediaPressure: offer.pressure,
      timelineDivergence: 0,
      relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
      promises: [
        { id: "first-year-goal", text: offer.firstYearGoal, status: "active" },
      ],
      flags: {},
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
