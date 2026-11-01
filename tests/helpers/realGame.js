/** Real rosters and a real game for tests that must not stub the engine (growth, epiphany ...). */
import { readFileSync } from "node:fs";
import { PLAYERS, seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;

/** Every real season card of one player, oldest first (PLAYERS itself loads async in the browser only). */
export const realCards = (bref) => ROWS.filter((r) => r.bref === bref).sort((a, b) => a.season - b.season).map(seasonToCard);

/**
 * Put these players' real seasons into the app's PLAYERS list. In the browser it is loaded async; in Node
 * it stays EMPTY, and then anything that follows a real career curve (develop.js's ladder, a card's
 * real ceiling) silently falls back to "no history" -- a test that never reached the real branch.
 */
export function installRealCards(...brefs) {
  for (const bref of brefs) if (!PLAYERS.some((p) => p.bref === bref)) PLAYERS.push(...realCards(bref));
}

/** The top 10 real cards of a franchise's season. */
export const realTeam = (code, season) => ({
  name: code,
  players: ROWS.filter((r) => r.team === code && r.season === season).map(seasonToCard).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 10),
});

/** Play one whole game on the real engine and return its final snapshot. */
export function realGame(home, away, youSide = "home") {
  let end = null;
  const sim = new GameSim({ home, away, youSide, injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: (s) => { end = s; } });
  return sim.runFast() || end || sim.snapshot();
}
