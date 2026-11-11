/**
 * Hometown Challenge (ADR-009 H4, M4-B): your represented city's legends
 * vs a random historic strong team, played on the EXISTING GameSim — no
 * second simulator, no rule changes, no fabricated players.
 *
 * The lineup is generated from the sourced relation table only. When the
 * represented city itself has fewer than 5 people, the lineup fills from
 * the fallback levels (region, then country) and says which levels it used.
 * Still fewer than 5 distinct people -> the challenge is unavailable
 * (hidden), never padded with invented players.
 */
import { GameSim } from "../../engine/sim.js";
import { seededStream } from "../../core/seededRandom.js";
import { CURATED, locationChain, matchPlace } from "./hometown.js";

export const CHALLENGE_MIN_PLAYERS = 5;
export const CHALLENGE_TEAM_SIZE = 10;
const RELATION_ORDER = { BIRTHPLACE: 0, RAISED_IN: 1, TEAM_LEGACY: 2 };

/**
 * Build the hometown team for a place. `cardFor(bref)` must return that
 * person's best card (the caller owns the roster); a bref without a card
 * is skipped, never replaced by someone else.
 * Returns { available, players, brefs, filledFrom, team }.
 */
export function buildChallengeTeam({ placeText, cardFor, records = CURATED.records, locations, teamName = null } = {}) {
  const empty = { available: false, players: [], brefs: [], filledFrom: [], team: null };
  const location = matchPlace(placeText || "", locations);
  if (!location || typeof cardFor !== "function") return empty;
  const people = new Map(); // bref -> { relation, level }
  const filledFrom = [];
  for (const loc of locationChain(location, locations)) {
    const recs = records.filter((r) => r.locationId === loc.id)
      .sort((a, b) => (RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]) || a.bref.localeCompare(b.bref));
    let added = false;
    for (const r of recs) {
      if (!people.has(r.bref)) {
        people.set(r.bref, { relation: r.relation, level: loc.level });
        added = true;
      }
    }
    if (added) filledFrom.push(loc.level);
    if (people.size >= CHALLENGE_TEAM_SIZE) break;
  }
  if (people.size < CHALLENGE_MIN_PLAYERS) return empty;
  const brefs = [...people.keys()].slice(0, CHALLENGE_TEAM_SIZE);
  const players = brefs.map((b) => cardFor(b)).filter(Boolean);
  if (players.length < CHALLENGE_MIN_PLAYERS) return empty;
  return {
    available: true,
    players,
    brefs: players.map((p) => p.bref),
    filledFrom,
    team: { name: teamName || `${String(placeText).trim()} Legends`, players },
  };
}

/**
 * A random historic strong team from a card pool: a real (team, season)
 * group with at least 5 distinct people, chosen with the injected rng,
 * taking that group's best cards. Returns { name, players } or null.
 */
export function pickOpponentTeam(cards, { rng = Math.random, size = CHALLENGE_TEAM_SIZE, ovrOf = (c) => c.ovr2k ?? c.ovr ?? 0 } = {}) {
  const groups = new Map();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (!c?.team || !c?.season || !c?.bref) continue;
    const key = `${c.team}|${c.season}`;
    const byBref = groups.get(key) || new Map();
    const prev = byBref.get(c.bref);
    if (!prev || ovrOf(c) > ovrOf(prev)) byBref.set(c.bref, c);
    groups.set(key, byBref);
  }
  const strong = [...groups.entries()]
    .map(([key, byBref]) => ({ key, players: [...byBref.values()].sort((a, b) => ovrOf(b) - ovrOf(a)) }))
    .filter((g) => g.players.length >= CHALLENGE_MIN_PLAYERS)
    // "Strong": judge by the starting five, not by roster depth.
    .map((g) => ({ ...g, power: g.players.slice(0, 5).reduce((s, c) => s + ovrOf(c), 0) }))
    .sort((a, b) => b.power - a.power)
    .slice(0, 24);
  if (!strong.length) return null;
  const pick = strong[Math.min(strong.length - 1, Math.floor(rng() * strong.length))];
  const [team, season] = pick.key.split("|");
  return { name: `${team} ${season}`, players: pick.players.slice(0, size) };
}

/** Play one challenge game on the existing GameSim with a seeded rng. Pure result, nothing is saved here. */
export function playChallengeGame({ home, away, seed = 1, maxSteps = 4000 } = {}) {
  let ended = null;
  const sim = new GameSim({
    home, away, youSide: "home", injuries: false, speed: 3,
    rng: seededStream(seed),
    onEvent: () => {},
    onTick: () => {},
    onEnd: (snap) => { ended = snap; },
  });
  sim.autoRotation = true;
  sim.running = true;
  let steps = 0;
  while (sim.running && steps < maxSteps) {
    sim.step();
    steps += 1;
    if (sim.paused) sim.setPaused(false);
  }
  const snap = ended || sim.snapshot();
  const homeScore = snap.score?.home ?? 0;
  const awayScore = snap.score?.away ?? 0;
  return { homeScore, awayScore, won: homeScore > awayScore, steps };
}
