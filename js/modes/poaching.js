/**
 * B6 of docs/CAREER_LIFE_ROADMAP.md: another team tries to poach a well-regarded coach.
 *
 * Shape of the feature:
 *  - An offer is rolled at the season rollover (maybeCreatePoachOffer), only for a coach with the
 *    reputation, track record and quiet desk to deserve it. It is stored as `story.poachOffer` and,
 *    deliberately, is NOT a pendingDecision: the single pendingDecision slot already belongs to story
 *    events and contract renewals, and a poach offer must neither starve nor be starved by them.
 *  - It stays valid until the new season's first game: acceptance rebuilds the league career from
 *    scratch (same as B5), so letting a coach jump halfway through a season would silently throw that
 *    season's progress away. Once a game is played it lapses, and is cleaned up at the next rollover.
 *  - Accepting costs something (the stint is archived as "poached", a little reputation, and that club
 *    won't hire you again); declining is rewarded (front-office trust) -- so it is a real choice.
 *
 * All functions are pure: root in, new root out. The offer roll is deterministic per (story, year) so
 * reloading the save can't re-roll it.
 */
import { hashSeed, seededStream } from "../core/seededRandom.js";
import { ensureCoachProfile } from "../career/coachProfile.js";
import { buildStintRecord, burnedBridgeTeamIds } from "../career/stints.js";
import {
  COACH_START_REPUTATION, POACH_ACCEPT_REPUTATION_DELTA, POACH_BASE_CHANCE, POACH_CHANCE_PER_REPUTATION,
  POACH_COOLDOWN_SEASONS, POACH_DECLINE_TRUST_BONUS, POACH_MAX_CHANCE, POACH_MIN_REPUTATION,
  POACH_MIN_SEASONS_IN_STINT, POACH_SIGNING_SALARY, POACH_SIGNING_TRUST_BONUS,
} from "../career/balance.js";
import { userGamesPlayed } from "../engine/season.js";
import { careerPerformance } from "./careerContract.js";
import { generateInterviewOffers, startNewStint } from "./timeTravelCareer.js";

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function requireRoot(root) {
  if (!root?.story || !root?.leagueCareer) throw new TypeError("root with a career story is required");
}

const reputationOf = (root) => root.coach?.reputation ?? COACH_START_REPUTATION;

/** Chance an eligible coach is poached this offseason: 0 below the threshold, then BASE rising by
 * PER_REPUTATION per point, capped -- nobody is ever guaranteed an offer. */
export function poachChance(reputation) {
  if (reputation < POACH_MIN_REPUTATION) return 0;
  return clamp(POACH_BASE_CHANCE + (reputation - POACH_MIN_REPUTATION) * POACH_CHANCE_PER_REPUTATION, 0, POACH_MAX_CHANCE);
}

/**
 * Why this coach can't be poached right now, or null if they can. A string (not a boolean) so tests
 * and callers can say exactly which gate closed.
 */
export function poachBlocker(root) {
  requireRoot(root);
  if (root.story.employment?.status !== "active") return "not-active";
  if (root.story.pendingDecision) return "pending-decision";
  if (root.story.poachOffer) return "has-offer";
  if (reputationOf(root) < POACH_MIN_REPUTATION) return "low-reputation";
  if (careerPerformance(root).seasons < POACH_MIN_SEASONS_IN_STINT) return "too-early";
  const year = root.leagueCareer.season?.year;
  const lastOffer = [...(root.story.eventLog || [])].reverse().find((entry) => entry.type === "poach-offer");
  if (lastOffer && year - lastOffer.year < POACH_COOLDOWN_SEASONS) return "cooldown";
  return null;
}

/** Roll for a poach offer at the season rollover. Returns the same root if nothing happens. */
export function maybeCreatePoachOffer(root) {
  if (poachBlocker(root)) return root;
  const year = root.leagueCareer.season.year;
  const rng = seededStream(hashSeed(`${root.story.storyId}:poach:${year}`));
  if (rng() >= poachChance(reputationOf(root))) return root;

  const board = generateInterviewOffers({
    year,
    philosophy: root.story.philosophy,
    seed: hashSeed(`${root.story.storyId}:poach-board:${year}`),
    origin: root.story.origin,
    excludeTeamIds: [root.story.employer, ...burnedBridgeTeamIds(root)],
  });
  // Poachers come from the top: a contender if the year has one to offer, else a solid middle team.
  const offer = board.find((candidate) => candidate.archetype === "contender")
    ?? board.find((candidate) => candidate.archetype === "middle")
    ?? board[0];
  return {
    ...root,
    story: {
      ...root.story,
      poachOffer: { ...offer, year },
      eventLog: [...root.story.eventLog, { type: "poach-offer", year, teamId: offer.teamId, teamName: offer.teamName, at: Date.now() }],
    },
  };
}

/** True while the offer can still be acted on: it exists and the season hasn't started. */
export function poachWindowOpen(root) {
  const offer = root?.story?.poachOffer;
  if (!offer || root.story.employment?.status !== "active") return false;
  return offer.year === root.leagueCareer?.season?.year && userGamesPlayed(root.leagueCareer.season) === 0;
}

/** Clear an offer that is stale (a new year has begun) and log that it lapsed. */
export function expirePoachOffer(root) {
  const offer = root?.story?.poachOffer;
  if (!offer) return root;
  const year = root.leagueCareer?.season?.year;
  if (offer.year >= year) return root;
  return {
    ...root,
    story: {
      ...root.story,
      poachOffer: null,
      eventLog: [...root.story.eventLog, { type: "poach-expired", year: offer.year, teamId: offer.teamId, teamName: offer.teamName, at: Date.now() }],
    },
  };
}

/** Say no. Remembered in the log, and the front office notices the loyalty. */
export function declinePoachOffer(root) {
  requireRoot(root);
  const offer = root.story.poachOffer;
  if (!offer) throw new Error("no poach offer is pending");
  return {
    ...root,
    story: {
      ...root.story,
      poachOffer: null,
      frontOfficeTrust: clamp((root.story.frontOfficeTrust || 0) + POACH_DECLINE_TRUST_BONUS, 0, 100),
      eventLog: [...root.story.eventLog, { type: "poach-declined", year: offer.year, teamId: offer.teamId, teamName: offer.teamName, at: Date.now() }],
    },
  };
}

/** Say yes: archive this stint as "poached", pay the reputation cost, start fresh at the new club. */
export function acceptPoachOffer(root) {
  requireRoot(root);
  const offer = root.story.poachOffer;
  if (!offer) throw new Error("no poach offer is pending");
  if (!poachWindowOpen(root)) throw new Error("the poach offer has lapsed");
  const coach = ensureCoachProfile(root);
  const stint = buildStintRecord(root, careerPerformance(root), "poached");
  const archived = {
    ...root,
    coach: {
      ...coach,
      reputation: clamp(Math.round(coach.reputation ?? 0) + POACH_ACCEPT_REPUTATION_DELTA, 0, 100),
      stints: [...(coach.stints || []), stint],
    },
  };
  const signed = startNewStint(archived, offer, "poached-in");
  // The signing terms ride on the new employment record the same way a renewal's do, which is where
  // finance.js reads the salary from.
  return {
    ...signed,
    story: {
      ...signed.story,
      frontOfficeTrust: clamp((signed.story.frontOfficeTrust || 0) + POACH_SIGNING_TRUST_BONUS, 0, 100),
      employment: {
        ...signed.story.employment,
        offer: {
          id: "poach-signing",
          title: "挖角签约",
          years: signed.story.employment.contractYears,
          salary: POACH_SIGNING_SALARY,
        },
      },
    },
  };
}
