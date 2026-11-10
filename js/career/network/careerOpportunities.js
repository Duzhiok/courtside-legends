/**
 * Workstream G — Basketball Career Network: the SHARED Career
 * Opportunity system.
 *
 * Job opportunities depend on experience, reputation, achievements,
 * relationships, available positions and previous decisions. The player
 * picks a starting point in the basketball industry; abilities, network
 * and achievements decide the next job. Careers are a NETWORK, not a
 * ladder — a scout may become a GM, an analyst may enter team
 * management, an assistant may become a head coach. Nothing here forces
 * a fixed sequence of jobs.
 *
 * Boundaries (workstream G):
 * - This engine GENERATES what is offered. Workstream E (relationships /
 *   legacy) RECORDS what happened — transitions, stints, honours. This
 *   module returns transition records in E's shape but never writes E's
 *   stores itself.
 * - Career events from opportunities go through the shared Career Inbox
 *   (workstream A) — this module exposes them as data + handlers; it
 *   does not build a second inbox.
 * - Player Agent and Strength & Conditioning Coach are listed as future
 *   roles (available: false) — P2 follow-ups, not built here.
 *
 * Pure module: no DOM, no Math.random (seeded tie-breaking only).
 */
import { seededStream } from "../../core/seededRandom.js";

/**
 * Roles in the network. `entry: true` means a player can START here.
 * `available: false` means a listed future role (P2) — shown, never offered.
 * `from` lists the roles that can plausibly lead here (a network, not a ladder).
 */
export const NETWORK_ROLES = Object.freeze({
  scout: { id: "scout", entry: true, labelZh: "球探", labelEn: "Scout", from: [] },
  videoAnalyst: { id: "videoAnalyst", entry: true, labelZh: "录像分析师", labelEn: "Video Analyst", from: [] },
  analytics: { id: "analytics", entry: true, labelZh: "数据分析师", labelEn: "Analytics Specialist", from: [] },
  assistantCoach: { id: "assistantCoach", entry: true, labelZh: "助教", labelEn: "Assistant Coach", from: ["scout", "videoAnalyst", "analytics"] },
  strengthCoach: { id: "strengthCoach", entry: true, available: false, labelZh: "体能训练师", labelEn: "Strength & Conditioning Coach", from: [] },
  agent: { id: "agent", entry: true, available: false, labelZh: "球员经纪人", labelEn: "Player Agent", from: [] },
  headCoach: { id: "headCoach", entry: false, labelZh: "主教练", labelEn: "Head Coach", from: ["assistantCoach", "scout", "videoAnalyst"] },
  gm: { id: "gm", entry: false, labelZh: "总经理", labelEn: "General Manager", from: ["scout", "analytics", "assistantCoach", "headCoach"] },
});

export const ENTRY_ROLES = Object.freeze(
  Object.values(NETWORK_ROLES).filter((r) => r.entry && r.available !== false).map((r) => r.id),
);

/**
 * A career profile in the network. Reputation is 0–100 (same scale as
 * the coach reputation in js/career/reputation.js). `decisions` records
 * the judgments that matter for future offers: correct film reports,
 * scout hits, analytics verifications.
 */
export function emptyNetworkProfile({ role = "scout", team = null } = {}) {
  return {
    currentRole: role,
    team: team || null,
    reputation: 40,
    experienceSeasons: 0,
    jobs: [],
    achievements: [],
    relationships: [],
    decisions: { filmCorrect: 0, filmTotal: 0, scoutHits: 0, scoutTotal: 0, analyticsVerified: 0 },
    unemployed: false,
    firedCount: 0,
  };
}

/** One requirement check: returns null when met, else a short reason. */
export function checkRequirements(profile, requirements = {}) {
  const missing = [];
  if ((requirements.minReputation ?? 0) > (profile?.reputation ?? 0)) {
    missing.push(`reputation:${requirements.minReputation}`);
  }
  if ((requirements.minExperience ?? 0) > (profile?.experienceSeasons ?? 0)) {
    missing.push(`experience:${requirements.minExperience}`);
  }
  for (const ach of requirements.achievements || []) {
    if (!(profile?.achievements || []).some((a) => a.type === ach)) missing.push(`achievement:${ach}`);
  }
  if (requirements.fromRole && !(profile?.jobs || []).some((j) => j.role === requirements.fromRole)
    && profile?.currentRole !== requirements.fromRole) {
    missing.push(`fromRole:${requirements.fromRole}`);
  }
  return missing;
}

/**
 * Generate offers from a job board. `board` is supplied by the caller
 * (available positions from season state); the engine filters, ranks and
 * explains. Unemployed profiles still get lower-tier offers — dismissal
 * is a new story, never Game Over. Returns { offers, unemployedNote }.
 * Deterministic: same profile + board + seed → same offers.
 */
export function generateOpportunities(profile, board, { seed = 1 } = {}) {
  const p = profile || emptyNetworkProfile({});
  const rng = seededStream(seed);
  const offers = [];
  for (const job of board || []) {
    const role = NETWORK_ROLES[job?.role];
    if (!role || role.available === false) continue;
    if (job.role === p.currentRole && job.team === p.team) continue; // not an offer to stay put
    const missing = checkRequirements(p, job.requirements || {});
    const reachable = missing.length === 0;
    // A role is only on the network if the player can plausibly reach it:
    // either it is an entry role, or the player has held (or holds) one
    // of its feeder roles, or their reputation is high enough to jump.
    const feeders = role.from || [];
    const networked = role.entry || feeders.length === 0
      || feeders.some((f) => f === p.currentRole || (p.jobs || []).some((j) => j.role === f))
      || (p.reputation ?? 0) >= 75;
    offers.push({
      id: job.id || `${job.role}-${job.team || "open"}`,
      role: job.role,
      team: job.team || null,
      level: job.level || "staff",
      titleZh: role.labelZh,
      titleEn: role.labelEn,
      eligible: reachable && networked,
      missing,
      networked,
      // Risk: jumping to a bigger job at low reputation is a gamble.
      risk: (job.level === "head" || job.level === "executive") && (p.reputation ?? 0) < 60 ? "high" : "normal",
      order: rng(),
    });
  }
  offers.sort((a, b) => (a.eligible === b.eligible ? a.order - b.order : (a.eligible ? -1 : 1)));
  const unemployedNote = p.unemployed
    ? (offers.some((o) => o.eligible)
      ? "失业中：以下职位愿意给你机会，先站稳脚跟再谈下一步。"
      : "失业中：暂时没有符合条件的职位，先接受低级别工作或等待下一批空缺。")
    : null;
  return { offers, unemployedNote };
}

/**
 * Accept an offer. Returns the new profile plus a transition record in
 * the shape workstream E consumes (from / to / team / year / reason).
 * The old job is appended to `jobs` (history), never overwritten.
 */
export function acceptOpportunity(profile, offer, { year = null } = {}) {
  const p = profile || emptyNetworkProfile({});
  const from = { role: p.currentRole, team: p.team };
  const jobs = [...(p.jobs || [])];
  if (from.role) jobs.push({ ...from, seasons: p.experienceSeasons, endedYear: year });
  const next = {
    ...p,
    currentRole: offer.role,
    team: offer.team || null,
    jobs,
    unemployed: false,
    experienceSeasons: 0,
  };
  const transition = {
    from: from.role, fromTeam: from.team,
    to: offer.role, toTeam: offer.team || null,
    year, reason: "opportunity-accepted",
  };
  return { profile: next, transition };
}

/**
 * Dismissal: reputation takes a hit, the player is unemployed, and the
 * engine answers with fallback offers (lower-tier jobs in any reachable
 * role). Never a Game Over.
 */
export function dismissalOutcome(profile, { reason = "fired", year = null } = {}) {
  const p = profile || emptyNetworkProfile({});
  const reputation = Math.max(0, Math.round((p.reputation ?? 40) - 12));
  const next = {
    ...p,
    reputation,
    unemployed: true,
    firedCount: (p.firedCount || 0) + 1,
    jobs: [...(p.jobs || []), { role: p.currentRole, team: p.team, seasons: p.experienceSeasons, endedYear: year, ended: reason }],
    experienceSeasons: 0,
  };
  return {
    profile: next,
    transition: {
      from: p.currentRole, fromTeam: p.team,
      to: null, toTeam: null, year, reason,
    },
    noteZh: "被解雇不是终点：声望下降，但低级别职位和海外机会仍然向你敞开。",
    noteEn: "Being fired is not the end: reputation dips, but lower-tier jobs and overseas openings stay available.",
  };
}

/** Fold one judged slice result into the profile's decision record. */
export function recordSliceResult(profile, { kind, correct }) {
  const p = profile || emptyNetworkProfile({});
  const decisions = { ...(p.decisions || {}) };
  if (kind === "film") {
    decisions.filmTotal = (decisions.filmTotal || 0) + 1;
    if (correct) decisions.filmCorrect = (decisions.filmCorrect || 0) + 1;
  } else if (kind === "scout") {
    decisions.scoutTotal = (decisions.scoutTotal || 0) + 1;
    if (correct) decisions.scoutHits = (decisions.scoutHits || 0) + 1;
  } else if (kind === "analytics") {
    if (correct) decisions.analyticsVerified = (decisions.analyticsVerified || 0) + 1;
  }
  // Reputation moves are small and symmetric: good judgments build it.
  const reputation = Math.max(0, Math.min(100, Math.round((p.reputation ?? 40) + (correct ? 2 : -2))));
  return { ...p, decisions, reputation };
}

/** Reputation standing, for offer text and the inbox. */
export function reputationStanding(reputation) {
  const v = Number(reputation) || 0;
  if (v >= 80) return { id: "renowned", labelZh: "业内闻名", labelEn: "Renowned" };
  if (v >= 60) return { id: "respected", labelZh: "备受尊重", labelEn: "Respected" };
  if (v >= 40) return { id: "known", labelZh: "小有名气", labelEn: "Known" };
  return { id: "unknown", labelZh: "默默无闻", labelEn: "Unknown" };
}

/** Inbox events for workstream A: new offers and dismissal fallout. */
export function opportunityInboxEvents(profile, offers) {
  const eligible = (offers || []).filter((o) => o.eligible);
  const events = eligible.map((o) => ({
    type: "career-opportunity",
    source: "career-network",
    role: o.role,
    team: o.team,
    level: o.level,
    risk: o.risk,
    titleZh: `${o.team ? `${o.team} · ` : ""}${o.titleZh}职位邀请`,
    titleEn: `Job offer: ${o.titleEn}${o.team ? ` (${o.team})` : ""}`,
  }));
  if (profile?.unemployed && !eligible.length) {
    events.push({
      type: "career-opportunity-none",
      source: "career-network",
      titleZh: "暂无合适职位：先等待下一批空缺，或接受更低级别的工作",
      titleEn: "No suitable opening yet: wait for the next vacancies or take a lower-tier job",
    });
  }
  return events;
}
