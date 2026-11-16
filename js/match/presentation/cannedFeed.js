/**
 * Canned deterministic feed — 3D-S1A.
 *
 * A fixed-seed, single-quarter exhibition feed (Home vs Away, 5v5) that lets
 * the standalone preview (`preview-3d-match.html`) and the integration
 * tests drive the normalizer → choreographer → scheduler pipeline without
 * the live game. Nothing here is random: the same seed always builds the
 * same events, and every snapshot is a plain GameSim-shaped snapshot
 * (quarter / clock / score / possession / home+away onCourt with tactic).
 *
 * The feed covers: a made shot, a missed shot + defensive rebound, a
 * substitution, a dunk, and match end. Score/clock on every event come
 * from these snapshots — the viewer displays them verbatim.
 */
export const CANNED_SEED = 20261116;

const ROSTER = {
  home: [
    { id: "home-pg", name: "Home PG" },
    { id: "home-sg", name: "Home SG" },
    { id: "home-sf", name: "Home SF" },
    { id: "home-pf", name: "Home PF" },
    { id: "home-c", name: "Home C" },
    { id: "home-6", name: "Home 6th" },
  ],
  away: [
    { id: "away-pg", name: "Away PG" },
    { id: "away-sg", name: "Away SG" },
    { id: "away-sf", name: "Away SF" },
    { id: "away-pf", name: "Away PF" },
    { id: "away-c", name: "Away C" },
  ],
};

function teamSnap(side, ids, ptsById = {}) {
  return {
    tactic: { id: "balanced" },
    onCourt: ids.map((id) => {
      const p = ROSTER[side].find((r) => r.id === id);
      return { id, name: p.name, cardName: p.name, stats: { pts: ptsById[id] || 0 } };
    }),
  };
}

function snap({ quarter, clock, score, possession, homeIds, awayIds, ptsById }) {
  return {
    quarter,
    clock,
    score: { ...score },
    possession,
    home: teamSnap("home", homeIds, ptsById),
    away: teamSnap("away", awayIds, ptsById),
    youSide: "home",
    paused: false,
  };
}

const HOME5 = ["home-pg", "home-sg", "home-sf", "home-pf", "home-c"];
const HOME_SUBBED = ["home-pg", "home-sg", "home-sf", "home-6", "home-c"];
const AWAY5 = ["away-pg", "away-sg", "away-sf", "away-pf", "away-c"];

/** Build the canned feed. Returns { seed, rawEvents, domainEvents }. */
export function buildCannedFeed({ seed = CANNED_SEED } = {}) {
  const rawEvents = [];
  const domainEvents = [];
  const raw = (type, text, s, meta) => {
    const evt = { type, text, ...s };
    if (meta) evt.meta = meta;
    rawEvents.push(evt);
  };
  const derived = (type, s, meta) => {
    domainEvents.push({ type, meta: meta || {}, snapshot: s });
  };

  // Possession 1 — home: push, pass, made jumper. Score 2–0.
  let s = snap({ quarter: 1, clock: 720, score: { home: 0, away: 0 }, possession: "home", homeIds: HOME5, awayIds: AWAY5 });
  derived("POSSESSION_START", s, { possession: "home", quarter: 1, clock: 720 });
  s = snap({ quarter: 1, clock: 712, score: { home: 0, away: 0 }, possession: "home", homeIds: HOME5, awayIds: AWAY5 });
  raw("pass", "Home PG swings it to Home SG", s, { pass: { passerId: "home-pg", receiverId: "home-sg", kind: "kick" } });
  s = snap({ quarter: 1, clock: 706, score: { home: 2, away: 0 }, possession: "home", homeIds: HOME5, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  raw("score", "Home SG scores", s, { shot: { shooterId: "home-sg", made: true, pts: 2 } });

  // Possession 2 — away: pass, missed jumper, home defensive rebound. Still 2–0.
  s = snap({ quarter: 1, clock: 690, score: { home: 2, away: 0 }, possession: "away", homeIds: HOME5, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  derived("POSSESSION_START", s, { possession: "away", quarter: 1, clock: 690 });
  s = snap({ quarter: 1, clock: 682, score: { home: 2, away: 0 }, possession: "away", homeIds: HOME5, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  raw("pass", "Away PG swings it to Away SF", s, { pass: { passerId: "away-pg", receiverId: "away-sf", kind: "kick" } });
  s = snap({ quarter: 1, clock: 676, score: { home: 2, away: 0 }, possession: "away", homeIds: HOME5, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  raw("miss", "Away SF misses", s, { shot: { shooterId: "away-sf", made: false, pts: 0 } });
  s = snap({ quarter: 1, clock: 672, score: { home: 2, away: 0 }, possession: "away", homeIds: HOME5, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  raw("reb", "Home C grabs the rebound", s, { reb: { rebounderId: "home-c", offensive: false } });

  // Home substitution: Home 6th in for Home PF.
  s = snap({ quarter: 1, clock: 670, score: { home: 2, away: 0 }, possession: "home", homeIds: HOME_SUBBED, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  derived("SUBSTITUTION", s, { sub: { inId: "home-6", outId: "home-pf", side: "home" } });

  // Possession 3 — home: dunk. Score 4–0, then the exhibition ends.
  s = snap({ quarter: 1, clock: 668, score: { home: 2, away: 0 }, possession: "home", homeIds: HOME_SUBBED, awayIds: AWAY5, ptsById: { "home-sg": 2 } });
  derived("POSSESSION_START", s, { possession: "home", quarter: 1, clock: 668 });
  s = snap({ quarter: 1, clock: 660, score: { home: 4, away: 0 }, possession: "home", homeIds: HOME_SUBBED, awayIds: AWAY5, ptsById: { "home-sg": 4 } });
  raw("dunk", "Home SG slams it home", s, { player: { id: "home-sg", name: "Home SG" } });
  s = snap({ quarter: 1, clock: 0, score: { home: 4, away: 0 }, possession: "home", homeIds: HOME_SUBBED, awayIds: AWAY5, ptsById: { "home-sg": 4 } });
  derived("MATCH_END", s, { score: { home: 4, away: 0 } });

  return { seed, rawEvents, domainEvents };
}
