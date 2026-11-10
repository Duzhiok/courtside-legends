/**
 * Player Reborn PR5 — season-end contract (ADR-005 §4, prep doc).
 *
 * The contract is decided by the coach's trust — the season's performance
 * summary, already earned on court (no interview, no prophecy):
 *   trust >= 50 (rotation or better)  -> re-sign, a real contract
 *   trust 30-49 (bench)               -> minimum deal
 *   trust < 30 (garbage / DNP)        -> cut
 * Being cut is NOT a Game Over: the player goes to tryout / free agency and
 * the timeline continues into the next season. The timeline stays
 * continuous across 2 seasons: growth carries over at the engine's rate
 * (carriedDeltas), the coach's trust carries on the same team and resets to
 * camp for a cut player, and timeline events store aggregate values only.
 */
import { carriedDeltas } from "../career/playerGrowth.js";
import { awakenedSkillIds } from "../career/player/signatureAwakening.js";
import { buildPlayerCard, REBORN_SEASON } from "./identity.js";
import { roleForTrust, TRUST_START } from "./trust.js";

export const CONTRACT_OUTCOMES = ["resign", "minimum", "cut"];

export const CONTRACT_LABEL = {
  resign: { zh: "续约", en: "Re-signed" },
  minimum: { zh: "底薪留队", en: "Minimum deal" },
  cut: { zh: "被裁", en: "Cut" },
};

/** Trust thresholds for the contract decision. */
export const CONTRACT_TRUST = { resign: 50, minimum: 30 };

/** Season aggregates from the log (aggregates only — no per-play data). */
export function seasonSummary(reborn, year) {
  const log = (reborn?.player?.seasonLog || []).filter((g) => g.year === year);
  const games = log.length;
  const wins = log.filter((g) => g.won).length;
  const minutes = log.reduce((n, g) => n + (g.min || 0), 0);
  const points = log.reduce((n, g) => n + (g.pts || 0), 0);
  return {
    year,
    games,
    wins,
    avgMin: games ? Math.round((minutes / games) * 10) / 10 : 0,
    avgPts: games ? Math.round((points / games) * 10) / 10 : 0,
    takeovers: log.reduce((n, g) => n + (g.takeovers || 0), 0),
  };
}

/** The contract decision: trust is the season's performance summary. */
export function contractDecision(reborn, year) {
  const trust = reborn?.player?.coachTrust ?? 0;
  const summary = seasonSummary(reborn, year);
  const type = trust >= CONTRACT_TRUST.resign
    ? "resign"
    : trust >= CONTRACT_TRUST.minimum
      ? "minimum"
      : "cut";
  return { type, trust, ...summary };
}

/**
 * Settle the season-end contract. Returns the new state + the outcome.
 * Cut is not a Game Over — the player goes to tryout / free agency.
 */
export function settleContract(reborn, { year } = {}) {
  const seasonYear = year ?? reborn?.player?.seasonYear ?? REBORN_SEASON;
  const decision = contractDecision(reborn, seasonYear);
  const next = structuredClone(reborn);
  next.player.contractStatus = decision.type;
  if (decision.type === "cut") {
    next.player.freeAgency = { status: "tryout", sinceYear: seasonYear };
  } else {
    delete next.player.freeAgency;
  }
  const events = [...(next.timeline?.events || [])];
  events.push({
    year: seasonYear,
    event: "contract",
    outcome: decision.type,
    trust: decision.trust,
    games: decision.games,
    avgMin: decision.avgMin,
  });
  next.timeline = { ...(next.timeline || {}), events };
  return { reborn: next, outcome: decision };
}

/**
 * The player's card for the next season: the new year's real card when it
 * exists (else the last real card), with the carried growth on top.
 */
export function nextSeasonCard(reborn, { year, players } = {}) {
  const nextYear = year ?? (reborn?.player?.seasonYear ?? REBORN_SEASON) + 1;
  const oldYear = nextYear - 1;
  const carried = carriedDeltas(reborn?.player?.growth?.[reborn.identity.bref], oldYear);
  const growth = {
    [reborn.identity.bref]: { year: nextYear, xp: 0, levels: 0, deltas: carried },
  };
  return buildPlayerCard(reborn.identity, players, {
    growth,
    season: nextYear,
    // Signature Awakening (workstream D): awakened skills survive the
    // rollover — the next season's card is a new roster row.
    extraSkills: awakenedSkillIds(reborn.player.awakening),
  });
}

/**
 * Start the next season. The growth ledger carries over at the engine's
 * rate; the coach's trust carries on the same team and resets to camp for
 * a cut player. The season log is append-only (summaries filter by year),
 * so the timeline stays continuous.
 */
export function rolloverSeason(reborn, { year, players } = {}) {
  const seasonYear = year ?? reborn?.player?.seasonYear ?? REBORN_SEASON;
  const nextYear = seasonYear + 1;
  // The card is built from the ORIGINAL ledger — the rollover below
  // overwrites it with the carried deltas, and carriedDeltas only reads
  // the old year's entry.
  const card = players ? nextSeasonCard(reborn, { year: nextYear, players }) : null;
  const next = structuredClone(reborn);
  const carried = carriedDeltas(next.player.growth?.[next.identity.bref], seasonYear);
  next.player.growth = {
    [next.identity.bref]: { year: nextYear, xp: 0, levels: 0, deltas: carried },
  };
  next.player.seasonYear = nextYear;
  delete next.player.training;
  if (next.player.contractStatus === "cut") {
    next.player.coachTrust = TRUST_START;
    next.player.contractStatus = "camp";
  }
  next.player.rotationRole = roleForTrust(next.player.coachTrust);
  const events = [...(next.timeline?.events || [])];
  events.push({
    year: nextYear,
    event: "season_start",
    outcome: next.player.contractStatus,
    trust: next.player.coachTrust,
  });
  next.timeline = { ...(next.timeline || {}), events };
  return { reborn: next, year: nextYear, card };
}

/** Render a contract outcome for the card, zh + en. */
export function describeContract(outcome, lang = "zh") {
  if (!outcome) return null;
  const zh = lang !== "en";
  const label = CONTRACT_LABEL[outcome.type]?.[zh ? "zh" : "en"] || outcome.type;
  const base = zh
    ? `${outcome.year} 赛季结束：${label}（信任 ${outcome.trust}，出战 ${outcome.games} 场，场均 ${outcome.avgMin} 分钟）`
    : `End of ${outcome.year}: ${label} (trust ${outcome.trust}, ${outcome.games} games, ${outcome.avgMin} min/game)`;
  if (outcome.type === "cut") {
    return zh ? `${base}——不是结束，去试训，继续打球。` : `${base} — not the end. Go to tryouts and keep playing.`;
  }
  return base;
}
