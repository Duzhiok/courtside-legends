import { historicalSeason } from "../data/historicalSeasons.js";
import { PLAYERS, overall } from "../data/players.js";
import { buildCpuTeamForYear, createSeason } from "../engine/season.js";
import { createRootState } from "../data/saveRoot.js";
import { createLeagueCareer, recordCareerEvent } from "./leagueCareer.js";
import { buildSeasonGoal } from "../career/seasonGoals.js";
import { createCoachProfile } from "../career/coachProfile.js";
import { burnedBridgeTeamIds } from "../career/stints.js";
import {
  COACH_START_REPUTATION,
  INITIAL_CONTRACT_YEARS,
  REEMPLOYMENT_FULL_BOARD_REPUTATION,
  REEMPLOYMENT_LIMITED_BOARD_REPUTATION,
} from "../career/balance.js";
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

/** Read-only copy of what each opening future-knowledge choice does, so the UI's consequence chips
 * read the SAME numbers resolveFutureKnowledgeChoice() applies (they can't drift apart). */
export function futureKnowledgeEffects(choiceId) {
  const effects = KNOWLEDGE_CHOICES[choiceId];
  return effects ? { ...effects } : null;
}

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
  const { year, philosophy, seed, origin, excludeTeamIds } = input;
  const rng = mulberry32((seed >>> 0) ^ hashString(`${year}:${philosophy}`));
  const excluded = excludeTeamIds instanceof Set ? excludeTeamIds : new Set(excludeTeamIds || []);
  const candidates = excluded.size
    ? historical.teams.filter((team) => !excluded.has(team.id))
    : historical.teams;
  const ranked = candidates
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
      // B4: an explicit contract from day one, instead of leaving employment undefined and letting
      // careerContract.js's `employment || { status: "active" }` default paper over it. years is
      // the STARTING contract's length (not a lifetime cap -- every renewal after this one carries
      // its own years); tenureStartSeasonCount is 0 because no season has been coached yet.
      employment: { status: "active", contractYears: INITIAL_CONTRACT_YEARS, tenureStartSeasonCount: 0 },
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

/**
 * B5 of docs/CAREER_LIFE_ROADMAP.md: how many offers a fired/departed coach's reputation buys
 * them. Always at least 1 -- a true zero-offer board would permanently soft-lock the save (see
 * REEMPLOYMENT_FULL_BOARD_REPUTATION's comment in balance.js), so the worst case is "only a
 * rebuild job wants you", never "nobody wants you, forever".
 */
function reemploymentOfferCount(reputation) {
  if (reputation >= REEMPLOYMENT_FULL_BOARD_REPUTATION) return 3;
  if (reputation >= REEMPLOYMENT_LIMITED_BOARD_REPUTATION) return 2;
  return 1;
}

/**
 * B5: the job-search board for a coach whose last stint just ended (fired or departed). This is
 * a PURE, deterministic read of `root` -- nothing is persisted here, the same way
 * buildCareerReport() is recomputed on demand rather than cached. Calling this twice on the same
 * root (same storyId, same upcoming year, same stint count) always returns the same offers, so
 * there is no "stale offer board that doesn't match the current save" class of bug to worry about.
 *
 * Reuses generateInterviewOffers() (the exact same archetype-bucketing machinery a brand-new
 * hire sees) rather than inventing a second offer-generation algorithm -- the only differences
 * are: the candidate pool excludes the team that just let the coach go, and reputation trims how
 * much of the 3-offer board is actually shown.
 */
export function generateReemploymentOffers(root) {
  if (!root?.story || !root?.leagueCareer) {
    throw new TypeError("root with a career story is required");
  }
  const year = root.leagueCareer.season?.year;
  if (!Number.isInteger(year)) {
    throw new RangeError("root has no upcoming season year to search for a job in");
  }
  const reputation = root.coach?.reputation ?? COACH_START_REPUTATION;
  const stintsPlayed = Array.isArray(root.coach?.stints) ? root.coach.stints.length : 0;
  // Deterministic rather than Math.random() so the board doesn't reshuffle on every re-render,
  // but still different from the ORIGINAL hire's seed (which the player chose at career start) and
  // different again after every subsequent stint -- folding in stintsPlayed means getting fired a
  // second time doesn't just redraw the exact same three teams from the first firing.
  const seed = hashString(`${root.story.storyId}:reemployment:${year}:${stintsPlayed}`);
  const board = generateInterviewOffers({
    year,
    philosophy: root.story.philosophy,
    seed,
    origin: root.story.origin,
    excludeTeamIds: [...(root.story.employer ? [root.story.employer] : []), ...burnedBridgeTeamIds(root)],
  });
  return board.slice(0, reemploymentOfferCount(reputation));
}

/**
 * B5: accept a re-employment offer and start the next stint at a new team, in the same timeline.
 * Unlike acceptInterviewOffer() (a brand-new career), this carries the coach and the overarching
 * timeline forward -- root.coach (age/reputation/cash/stints/perks, the PERSON) and
 * story.origin/philosophy/futureKnowledge/timelineDivergence/storyId (the TIMELINE) are untouched.
 * Everything scoped to the PREVIOUS job -- leagueCareer, employment, startYear, trust/pressure,
 * relationships, promises, flags, eventLog -- starts fresh, exactly like a new hire's does. This
 * composes for free with B1-B4's season-goal/firing/renewal machinery: those all read from
 * root.leagueCareer.management.seasonHistory, which is empty again once createLeagueCareer()
 * below builds a brand new one, so the new stint's goals/firing-risk/contract clock all start at
 * zero without this function needing to reset any of them itself.
 */
export function acceptReemploymentOffer(root, offerId) {
  if (!root?.story || !root?.leagueCareer) {
    throw new TypeError("root with a career story is required");
  }
  if (!["fired", "departed"].includes(root.story.employment?.status)) {
    throw new Error("not currently looking for a job");
  }
  const offer = generateReemploymentOffers(root).find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new RangeError("unknown reemployment offer");
  }
  return startNewStint(root, offer);
}

/**
 * Begin a fresh stint at the team in `offer`, carrying the coach and the timeline forward (see
 * acceptReemploymentOffer's notes on what resets and what survives). Shared by B5 (hired after a
 * firing / walk-out) and B6 (poached mid-career): both build the same new season + league career,
 * they differ only in the preconditions and consequences their callers apply FIRST, and in the
 * `eventType` that marks the start of the new stint in the log ("re-employed" | "poached-in").
 */
export function startNewStint(root, offer, eventType = "re-employed") {
  const year = root.leagueCareer.season.year;
  const historical = historicalSeason(year);
  const teamMeta = historical.teams.find((team) => team.id === offer.teamId);
  if (!teamMeta) {
    throw new RangeError("reemployment offer references an unknown historical team");
  }

  const userTeam = buildCpuTeamForYear(year, teamMeta, new Set());
  const season = createSeason({
    userTeamId: offer.teamId,
    userTeamName: offer.teamName,
    userTeam,
    mode: "historical",
    year,
    seed: hashString(`${root.story.storyId}:reemployment:${year}:${offer.teamId}`),
  });
  let leagueCareer = createLeagueCareer({
    kind: "timeTravel",
    season,
    storyId: root.story.storyId,
    careerId: root.story.storyId,
  });
  leagueCareer = recordCareerEvent(
    leagueCareer,
    { type: eventType, year, teamId: offer.teamId, teamName: offer.teamName },
    0,
  );

  // Same reasoning as acceptInterviewOffer(): size the first goal off the actual constructed
  // roster rather than trusting the offer card's static firstYearGoal text.
  const seasonGoal = { ...buildSeasonGoal(season.teams, offer.teamId), year, status: "active" };

  return {
    ...root,
    leagueCareer,
    story: {
      ...root.story,
      // B4's stint model reads story.startYear as THIS stint's start year (see
      // js/career/stints.js's buildStintRecord and eventEngine.js's tenureYear calculation) -- not
      // the year the coach first arrived from the future, which story.storyId/the share card's
      // overall timeline framing still remembers separately.
      startYear: year,
      currentChapter: "active-tenure",
      employer: offer.teamId,
      employment: { status: "active", contractYears: INITIAL_CONTRACT_YEARS, tenureStartSeasonCount: 0 },
      frontOfficeTrust: offer.trust,
      mediaPressure: offer.pressure,
      relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
      promises: [{ id: "first-year-goal", text: seasonGoal.label, status: "active" }],
      // Flags from the old job (e.g. a story choice's longPlanProtected) were about a relationship
      // with a front office that no longer employs this coach -- only origin survives the move.
      flags: { origin: root.story.origin },
      seasonGoal,
      eventLog: [{ type: eventType, year, teamId: offer.teamId, teamName: offer.teamName }],
      pendingDecision: null,
      poachOffer: null,
      ending: null,
    },
  };
}
