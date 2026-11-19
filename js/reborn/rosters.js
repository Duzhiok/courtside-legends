/**
 * The roster of one franchise in one season, as sim-ready cards. Lives apart from season.js so the league simulation (league.js) and the season
 * loop can both use it without importing each other.
 */
import { seasonToCard, overall } from "../data/players.js";
import { rosterCode } from "./franchises.js";

/**
 * All cards of one team in one season, best first. `team` is a stable Reborn team id; the roster data may call that franchise
 * something else that year (WSB is WAS from 1998), see franchises.js: without it the later seasons play against empty teams.
 */
export function rosterCards(players, team, season) {
  const code = rosterCode(team, season);
  return (players || [])
    .filter((r) => r && r.team === code && Number(r.season) === season)
    .map(seasonToCard)
    .sort((a, b) => overall(b) - overall(a));
}

/** The five who start for a team nobody coaches: the best five by overall. */
export const bestFive = (cards) => [...cards].sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => p.id);

/** A game nobody plays by hand: the same three automatic coaching switches the player's own games run with. */
export function autoCoach(sim) {
  sim.autoOffense = true;
  sim.autoDefense = true;
  sim.autoRotation = true;
  return sim;
}
