/**
 * Player Reborn PR1 — identity draw (ADR-005 §3, prep doc).
 *
 * Pure functions: the same seed + the same roster rows always draw the same
 * person. No Math.random anywhere — determinism is pinned by tests.
 *
 * Rules (ADR-005 Q4 defaults):
 * - 1996-97 preseason, Player, random destiny, UNDERDOG difficulty.
 * - 70% historical bench player (1996-97, mpg < 12, gp >= 10 — 80 players,
 *   ADR-005's "100" is an outdated number, the pool is measured at 80) /
 *   30% fictional training-camp player (generated rookie, assigned to a team).
 * - The drawn identity is a CLONE: the original roster row is never modified
 *   and never appears twice (applyIdentityToRoster replaces it).
 * - Staged reveal (the standing small-to-large reveal rule): a historical
 *   identity starts as an unnamed camp player; the real name is revealed
 *   once coach trust reaches REVEAL_TRUST. A fictional identity is yours
 *   from the start, so it is revealed immediately.
 */
import { hashSeed, seededStream } from "../core/seededRandom.js";
import { rookieClassForYear } from "../engine/leagueDraft.js";
import { seasonToCard } from "../data/players.js";

export const REBORN_START_YEAR = 1996;
/** roster.json season = end year, so the 1996-97 season is season 1997. */
export const REBORN_SEASON = 1997;
export const HISTORICAL_SHARE = 0.7;
/** Trust at which a historical identity's real name is revealed. */
export const REVEAL_TRUST = 40;
export const REBORN_IDENTITY_VERSION = 1;

/** 1996-97 alignment, using the roster.json season=1997 team codes. */
export const REBORN_EAST_IDS = [
  "ATL", "BOS", "CHH", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NJN", "NYK", "ORL", "PHI", "TOR", "WSB",
];
export const REBORN_WEST_IDS = [
  "DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MIN", "PHO", "POR", "SAC", "SAS", "SEA", "UTA", "VAN",
];
export const REBORN_TEAM_IDS = [...REBORN_EAST_IDS, ...REBORN_WEST_IDS];

/** The 1996-97 bench pool, sorted by id so the draw never depends on file order. */
export function benchPool(players) {
  return (players || [])
    .filter(
      (r) =>
        r &&
        Number(r.season) === REBORN_SEASON &&
        Number(r.mpg) < 12 &&
        Number(r.gp) >= 10,
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Seeded identity draw. Returns the identity object stored in root.reborn.
 * Historical identities start unrevealed; fictional ones are revealed at once.
 */
export function drawIdentity(seed, players) {
  const seedText = String(seed ?? "");
  if (!seedText) throw new TypeError("drawIdentity requires a seed");
  const pool = benchPool(players);
  if (!pool.length) throw new Error("drawIdentity: empty 1996-97 bench pool");
  const rng = seededStream(hashSeed(seedText));
  const kind = rng() < HISTORICAL_SHARE ? "historical" : "fictional";
  if (kind === "historical") {
    const row = pool[Math.floor(rng() * pool.length)];
    return {
      kind,
      bref: row.bref,
      name: row.name,
      nameEn: row.nameEn || row.name,
      team: row.team,
      pos: row.pos,
      season: REBORN_SEASON,
      cardId: row.id,
      revealed: false,
    };
  }
  // Fictional: a generated rookie from the 1997 debut class, assigned to a
  // team as a camp invitee. rookieClassForYear only generates prospects up to
  // minimumSize, so first count the real debutants, then ask for more.
  const historical = rookieClassForYear(REBORN_START_YEAR, {
    seed: seedText,
    minimumSize: 0,
    players,
  });
  const generated = rookieClassForYear(REBORN_START_YEAR, {
    seed: seedText,
    minimumSize: historical.length + 20,
    players,
  }).filter((p) => String(p.bref || "").startsWith("generated-"));
  if (!generated.length) throw new Error("drawIdentity: no generated prospect");
  // A generated prospect is a wrapper ({ prospectId, bref, player, ... });
  // the playable card is the nested player object.
  const pick = generated[Math.floor(rng() * generated.length)].player;
  const team = REBORN_TEAM_IDS[Math.floor(rng() * REBORN_TEAM_IDS.length)];
  return {
    kind,
    bref: pick.bref,
    name: pick.name,
    nameEn: pick.nameEn || pick.name,
    team,
    pos: pick.pos,
    season: REBORN_SEASON,
    cardId: pick.id,
    revealed: true,
    generated: pick,
  };
}

/** What the identity card shows. Unrevealed historical identities hide the name. */
export function identityCard(identity) {
  if (!identity) return null;
  if (identity.kind === "fictional" || identity.revealed) {
    return {
      name: identity.name,
      nameEn: identity.nameEn || identity.name,
      team: identity.team,
      pos: identity.pos,
      kind: identity.kind,
      revealed: true,
    };
  }
  return {
    name: "无名训练营球员",
    nameEn: "Unnamed Camp Player",
    team: identity.team,
    pos: identity.pos,
    kind: "historical",
    revealed: false,
    hint: "随信任提升揭示真实身份",
  };
}

/** Reveal the real name once trust reaches REVEAL_TRUST. Pure; returns a copy on change. */
export function maybeReveal(identity, trust) {
  if (!identity || identity.revealed || identity.kind !== "historical") return identity;
  if (Number(trust) >= REVEAL_TRUST) return { ...identity, revealed: true };
  return identity;
}

/**
 * Build the sim-ready card for an identity (a clone; the roster row is never
 * mutated). Growth deltas from root.reborn.player.growth are applied on read,
 * clamped to the attribute range — the original row stays untouched.
 */
export function buildPlayerCard(identity, players, { growth = {}, season = REBORN_SEASON } = {}) {
  if (!identity) throw new TypeError("buildPlayerCard requires an identity");
  let card;
  if (identity.kind === "historical") {
    // The requested season's real card; a later season falls back to the
    // 1997 card (the player's last real card) so a rollover never strands
    // a player whose real career had already ended.
    const row = (players || []).find(
      (r) => r?.bref === identity.bref && Number(r.season) === season,
    ) || (season !== REBORN_SEASON
      ? (players || []).find((r) => r?.bref === identity.bref && Number(r.season) === REBORN_SEASON)
      : null);
    if (!row) throw new Error(`buildPlayerCard: no ${season} row for ${identity.bref}`);
    card = seasonToCard(row);
  } else {
    const generated = identity.generated;
    if (!generated) throw new Error("buildPlayerCard: fictional identity has no generated prospect");
    card = { ...generated, team: identity.team };
  }
  const deltas = growth?.[identity.bref]?.deltas || {};
  for (const [attribute, delta] of Object.entries(deltas)) {
    if (Number.isFinite(card[attribute]) && Number.isFinite(delta)) {
      // Deltas are small (+1 per level); only the 99 wall binds them.
      card[attribute] = Math.max(1, Math.min(99, card[attribute] + delta));
    }
  }
  card.rebornClone = true;
  return card;
}

/**
 * Put the cloned player into his team's roster: the original card (same bref)
 * is replaced, never duplicated. A fictional identity is appended as the
 * camp invitee. Returns a new array; the input is untouched. Pass a
 * prebuilt `clone` to insert that exact card object (season driver).
 */
export function applyIdentityToRoster(teamCards, identity, { players, growth = {}, clone = null } = {}) {
  const card = clone || buildPlayerCard(identity, players, { growth });
  const next = (teamCards || []).filter((p) => p?.bref !== identity.bref);
  next.push(card);
  return next;
}

/** The root.reborn state for a fresh run (ADR-005 §4 data model). */
export function createRebornState(seed, players) {
  const identity = drawIdentity(seed, players);
  return {
    version: 1,
    seed: String(seed),
    startYear: REBORN_START_YEAR,
    boundary: "preseason",
    role: "player",
    origin: "random-destiny",
    difficulty: "underdog",
    identity,
    player: {
      teamId: identity.team,
      coachTrust: 25,
      rotationRole: "garbage",
      contractStatus: "camp",
      seasonYear: REBORN_SEASON,
      growth: {},
      seasonLog: [],
    },
    timeline: { events: [] },
  };
}
