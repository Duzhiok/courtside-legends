/**
 * Build a My Team Season (ADR-010 T2) from the account's saved lineup. Pure apart from the engine's own
 * randomness: returns the season object, never writes anything (seasonStore does that).
 *
 * The playable cards live ONCE, inside season.teams[userTeamId].players (what the engine reads and what injuries /
 * fatigue / stats accumulate on). They are cloned from the collection here, so later upgrades, sales or new pulls
 * never touch a season in progress. `myTeam.roster` is only the reference list (audit + a future explicit write-back).
 */
import { COACHES } from "../data/coaches.js";
import { resolveCoach } from "../data/account.js";
import { applyPlayerPrefs } from "../data/playerPrefs.js";
import { overall } from "../data/players.js";
import { createSeason } from "../engine/season.js";
import { resolveSavedLineup, validateMyTeamLineup } from "./lineup.js";

export const QUICK_GAMES = 20;
export const FULL_GAMES = 82;

const newSeasonId = () => `mts_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * @param {object} account  signed-in account (guests can't create)
 * @param {{variant?: "quick"|"full", seed?: number, acceptRepaired?: boolean}} opts
 * @returns {{ok: true, season: object} | {ok: false, reason: "guest"|"invalid"|"repaired", issues?: object[], draft?: object}}
 */
export function buildMyTeamSeason(account, { variant = "quick", seed = Date.now(), acceptRepaired = false } = {}) {
  if (!account) return { ok: false, reason: "guest" };
  // Never trust what was saved earlier: re-check against the collection as it is right now.
  const { draft, dropped } = resolveSavedLineup(account);
  const check = validateMyTeamLineup(account, draft);
  if (!check.eligible) return { ok: false, reason: "invalid", issues: check.issues, draft };
  if (dropped > 0 && !acceptRepaired) return { ok: false, reason: "repaired", draft }; // show the player the repaired lineup first

  const players = check.roster.map((card) => applyPlayerPrefs(structuredClone(card), account.playerPrefs?.[card.id]) ?? card);
  const coach = structuredClone(resolveCoach(account.coachId) || COACHES[0]);
  const tacticId = account.tacticId || "balanced";
  // The season reads its default tactic from coach.specialTactics[0] (same trick as ranked): put the chosen one first.
  coach.specialTactics = [tacticId, ...(coach.specialTactics || []).filter((t) => t !== tacticId)];
  const games = variant === "full" ? FULL_GAMES : QUICK_GAMES;

  const st = createSeason({
    userTeamId: "LAS",
    userTeamName: `${account.name} 班底`,
    userTeam: { players, coach },
    mode: "modern",
    year: new Date().getFullYear(),
    seed,
    gamesPerTeam: games,
  });
  // createSeason's team builder drops the starters: put the player's five back.
  const team = st.teams[st.userTeamId];
  team.starterIds = check.starters.map((c) => c.id);

  st.myTeam = {
    schema: 1,
    seasonId: newSeasonId(),
    mode: "myTeamSeason",
    ownerAccountId: account.id,
    createdAt: Date.now(),
    rules: { variant, seasonLength: games, injuries: true, market: false, allowMidSeasonPickups: false },
    roster: check.roster.map((c) => ({ ownedCardId: c.id, personId: c.bref || c.id, startOvr: overall(c) })),
    start: { starterIds: [...team.starterIds], coachId: account.coachId || null, tacticId },
    result: null,
  };
  return { ok: true, season: st };
}
