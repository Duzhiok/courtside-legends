import { deriveEnding } from "../story/eventEngine.js";
import {
  FIRING_TRUST_FLOOR,
  RENEWAL_DYNASTY_CHAMPIONSHIPS,
  RENEWAL_TRIAL_GOAL_RATE,
  RENEWAL_TRIAL_REPUTATION_CEILING,
  SEASON_GOAL_TRUST_BONUS,
  SEASON_GOAL_TRUST_PENALTY,
} from "../career/balance.js";
import { buildSeasonGoal, goalAchieved } from "../career/seasonGoals.js";

// B3 of the roadmap: the menu is sized to the actual tenure, not a fixed two-option pair for
// everyone. trial-extension and dynasty-extension are the new floor/ceiling; rebuild-extension and
// contender-extension are untouched so every save/test built around those two ids keeps working.
const OFFER_TEMPLATES = [
  {
    id: "trial-extension",
    title: "试用续约",
    description: "战绩和目标完成度都不够亮眼，老板只愿意给一年观察期——证明自己才能换来下一份合同。",
    years: 1,
    salary: 4,
    authority: 30,
    privileges: [],
    effects: { trust: -2, pressure: 10, divergence: 1 },
  },
  {
    id: "rebuild-extension",
    title: "重建续约",
    description: "老板愿意给你长期时间和更大权限，但薪资保守。",
    years: 4,
    salary: 7,
    authority: 88,
    privileges: ["自定义训练计划", "发展联盟优先权"],
    effects: { trust: 5, pressure: -4, divergence: 2 },
  },
  {
    id: "contender-extension",
    title: "争冠续约",
    description: "更高薪资和更大预算，但每年都必须证明自己配得上争冠窗口。",
    years: 2,
    salary: 13,
    authority: 54,
    privileges: ["额外教练预算", "季中补强额度"],
    effects: { trust: 3, pressure: 8, divergence: 5 },
  },
  {
    id: "dynasty-extension",
    title: "王朝续约",
    description: "你已经证明自己能带队夺冠——老板给你近乎无限的信任、预算和人事权。",
    years: 5,
    salary: 20,
    authority: 96,
    privileges: ["完全人事决定权", "顶薪续约优先权", "专属训练设施预算"],
    effects: { trust: 8, pressure: 2, divergence: 8 },
  },
];

/**
 * B3: which offer ids a tenure actually earns, from worst to best. A great tenure (2+ rings)
 * only ever ADDS a stronger option on top of the familiar rebuild/contender pair; a tenure with
 * zero rings AND a poor full-career goal record AND below-average reputation gets boiled down to
 * a single trial offer -- everything in between (most careers) sees exactly what the game always
 * offered, so this only changes outcomes at the two tails.
 */
function renewalOfferIds(performance, reputation) {
  if (performance.championships >= RENEWAL_DYNASTY_CHAMPIONSHIPS) {
    return ["dynasty-extension", "contender-extension", "rebuild-extension"];
  }
  const roughRide =
    performance.championships === 0 &&
    performance.goalHitRate !== null &&
    performance.goalHitRate <= RENEWAL_TRIAL_GOAL_RATE &&
    reputation < RENEWAL_TRIAL_REPUTATION_CEILING;
  if (roughRide) return ["trial-extension"];
  return ["contender-extension", "rebuild-extension"];
}

function clone(value) {
  return structuredClone(value);
}

function requireCareerRoot(root) {
  if (!root?.story || !root?.leagueCareer) {
    throw new TypeError("root with a career story is required");
  }
}

function winRate(summary) {
  const wins = Number(summary?.record?.w) || 0;
  const losses = Number(summary?.record?.l) || 0;
  return wins + losses > 0 ? wins / (wins + losses) : 0;
}

export function careerPerformance(root) {
  requireCareerRoot(root);
  const history = root.leagueCareer.management?.seasonHistory || [];
  const rates = history.map(winRate);
  const wins = history.reduce((total, summary) => total + (Number(summary.record?.w) || 0), 0);
  const games = history.reduce(
    (total, summary) => total + (Number(summary.record?.w) || 0) + (Number(summary.record?.l) || 0),
    0,
  );
  const championships = history.filter((summary) => summary.championId === summary.teamId).length;
  const lastTwo = rates.slice(-2);
  // B1 logs one "season-goal-result" entry per resolved goal (chronological, since advanceSeasonGoal
  // only ever appends). Filtering eventLog rather than tracking a separate counter keeps this a
  // read-only derived value with a single source of truth, same as how wins/games/championships
  // above are all derived from seasonHistory rather than duplicated counters.
  const goalResults = (root.story.eventLog || []).filter((entry) => entry.type === "season-goal-result");
  const lastTwoGoals = goalResults.slice(-2);
  return {
    seasons: history.length,
    wins,
    games,
    winRate: games ? wins / games : 0,
    championships,
    lastSeasonRate: rates.at(-1) || 0,
    consecutiveBadSeasons: lastTwo.length === 2 && lastTwo.every((rate) => rate < 0.4),
    consecutiveMissedGoals: lastTwoGoals.length === 2 && lastTwoGoals.every((entry) => !entry.achieved),
    // B3: the full-tenure hit rate (not just the last two like consecutiveMissedGoals above) is
    // what sizes the renewal menu. null -- not 0 -- when there's no goal history at all (very old
    // saves, or a tenure that never got far enough for a goal to resolve), so renewalOfferIds()
    // can tell "never had a goal judged" apart from "had goals and whiffed every one".
    goalHitRate: goalResults.length ? goalResults.filter((entry) => entry.achieved).length / goalResults.length : null,
  };
}

/**
 * Resolve the season goal that was pending for the year that just finished (trust up on a hit,
 * down on a miss -- B1 of the roadmap), then hand down a new one sized to the roster as it
 * stands right now for the season about to be played. Safe to call every offseason transition:
 * if there's no pending goal yet (very old saves, or called before a goal was ever set) it just
 * assigns one without touching trust. If the next season's teams/userTeamId aren't available yet
 * for some reason, the pending goal is left as-is rather than crashing -- this is called from a
 * UI flow, not a place that should blow up the whole offseason over a goal.
 */
export function advanceSeasonGoal(root) {
  requireCareerRoot(root);
  const history = root.leagueCareer.management?.seasonHistory || [];
  const pending = root.story.seasonGoal;
  let trust = root.story.frontOfficeTrust || 0;
  let eventLog = root.story.eventLog;

  if (pending?.status === "active") {
    const summary = history.find((entry) => entry.year === pending.year);
    if (summary) {
      const achieved = goalAchieved(pending, summary);
      const trustDelta = achieved ? SEASON_GOAL_TRUST_BONUS : SEASON_GOAL_TRUST_PENALTY;
      trust += trustDelta;
      eventLog = [
        ...eventLog,
        {
          type: "season-goal-result",
          year: pending.year,
          goal: clone(pending),
          achieved,
          trustDelta,
          at: Date.now(),
        },
      ];
    }
  }

  const season = root.leagueCareer.season;
  const nextYear = season?.year;
  const nextGoal =
    Number.isInteger(nextYear) && season?.teams && season?.userTeamId
      ? { ...buildSeasonGoal(season.teams, season.userTeamId), year: nextYear, status: "active" }
      : pending;

  return {
    ...root,
    story: {
      ...root.story,
      frontOfficeTrust: Math.max(0, trust),
      seasonGoal: nextGoal,
      eventLog,
    },
  };
}

// B2 of the roadmap: firing used to be a single hardcoded win-rate check. Now there are three
// independent triggers, checked in this order (most personal/direct reason first):
//   1. Front-office trust has collapsed below the floor -- the board has simply stopped believing
//      in you, regardless of the scoreboard (this is what makes B1's trust swings actually matter).
//   2. Two straight missed season goals -- you keep failing what the board explicitly asked for,
//      even if the raw win rate isn't catastrophic.
//   3. Two straight seasons under a 40% win rate -- the original blunt safety net, kept as a
//      fallback for saves/situations with no goal history yet (very old saves predate B1 entirely).
// Returns null when none apply (still employed).
function resolveFiringReason(root, performance) {
  if ((root.story.frontOfficeTrust || 0) < FIRING_TRUST_FLOOR) {
    return { reason: "trust-collapsed", label: "信任破产下课" };
  }
  if (performance.consecutiveMissedGoals) {
    return { reason: "missed-goals", label: "连续两季目标落空下课" };
  }
  if (performance.consecutiveBadSeasons) {
    return { reason: "two-bad-seasons", label: "在低谷中下课" };
  }
  return null;
}

export function evaluateCareerEmployment(root) {
  requireCareerRoot(root);
  const performance = careerPerformance(root);
  const employment = root.story.employment || { status: "active" };
  if (employment.status !== "active") return root;

  const firing = resolveFiringReason(root, performance);
  if (firing) {
    const ending = {
      id: "fired-before-finale",
      label: firing.label,
      tone: "hard",
      // Without this the rich 4-tier narrative verdict (deriveEnding: Dynasty
      // Builder / History Maker / Unfinished Revolution / Departed Under
      // Pressure) was 100% dead code -- getting fired always showed this same
      // flat label no matter how the tenure actually went up to that point.
      narrativeTier: deriveEnding(root),
    };
    return {
      ...root,
      story: {
        ...root.story,
        employment: { status: "fired", reason: firing.reason, performance },
        currentChapter: "epilogue",
        ending,
        pendingDecision: null,
        eventLog: [
          ...root.story.eventLog,
          { type: "employment-ended", reason: firing.reason, year: root.leagueCareer.season.year, ending: clone(ending), at: Date.now() },
        ],
      },
    };
  }

  if (performance.seasons >= 5) {
    const offerIds = renewalOfferIds(performance, root.coach?.reputation ?? 50);
    const offers = offerIds.map((id) => clone(OFFER_TEMPLATES.find((offer) => offer.id === id)));
    return {
      ...root,
      story: {
        ...root.story,
        employment: {
          status: "renewal",
          offers,
          performance,
        },
        currentChapter: "contract",
        pendingDecision: { type: "contract-renewal", year: root.leagueCareer.season.year },
        eventLog: [
          ...root.story.eventLog,
          { type: "renewal-offers", year: root.leagueCareer.season.year, offers: offerIds, at: Date.now() },
        ],
      },
    };
  }
  return root;
}

export function acceptCareerContract(root, offerId) {
  requireCareerRoot(root);
  const employment = root.story.employment;
  if (employment?.status !== "renewal" || root.story.pendingDecision?.type !== "contract-renewal") {
    throw new Error("career renewal is not pending");
  }
  // B3: validate against the offers this tenure actually earned (employment.offers), not the
  // full OFFER_TEMPLATES catalog -- a trial-only tenure should not be able to accept
  // "dynasty-extension" just because that id exists somewhere in the module.
  const offer = (employment.offers || []).find((candidate) => candidate.id === offerId);
  if (!offer) throw new RangeError("unknown career contract offer");
  return {
    ...root,
    story: {
      ...root.story,
      employment: {
        status: "renewed",
        offer: clone(offer),
        performance: employment.performance,
      },
      currentChapter: "postscript",
      ending: {
        id: "renewed-career",
        label: `${offer.title} · ${offer.years}年${offer.salary}薪资`,
        tone: "success",
        narrativeTier: deriveEnding(root),
      },
      frontOfficeTrust: (root.story.frontOfficeTrust || 0) + offer.effects.trust,
      mediaPressure: Math.max(0, (root.story.mediaPressure || 0) + offer.effects.pressure),
      timelineDivergence: (root.story.timelineDivergence || 0) + offer.effects.divergence,
      pendingDecision: null,
      eventLog: [
        ...root.story.eventLog,
        { type: "contract-signed", offerId, year: root.leagueCareer.season.year, at: Date.now() },
      ],
    },
  };
}

export function declineCareerContracts(root) {
  requireCareerRoot(root);
  const employment = root.story.employment;
  if (employment?.status !== "renewal" || root.story.pendingDecision?.type !== "contract-renewal") {
    throw new Error("career renewal is not pending");
  }
  const ending = {
    id: "left-as-legend",
    label: "带着成果离开",
    tone: "success",
    narrativeTier: deriveEnding(root),
  };
  return {
    ...root,
    story: {
      ...root.story,
      employment: { status: "departed", performance: employment.performance },
      currentChapter: "epilogue",
      ending,
      pendingDecision: null,
      eventLog: [
        ...root.story.eventLog,
        { type: "contract-declined", year: root.leagueCareer.season.year, ending: clone(ending), at: Date.now() },
      ],
    },
  };
}

export function contractOffers(root) {
  requireCareerRoot(root);
  return root.story.employment?.status === "renewal"
    ? clone(root.story.employment.offers || [])
    : [];
}
