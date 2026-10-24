/**
 * T6 P0 online frame builder (server side).
 *
 * Why not broadcast sim.snapshot() directly? Measured 2026-10-24 with two
 * 12-man rosters: snapshot() is ~70KB, because publicTeam() repeats every
 * player three times (onCourt + bench + roster) with full ratings, skills
 * and labels. The online frame below carries only what changes per
 * possession, plus on-court/bench membership as id lists resolved against
 * the joined rosters the client already holds. Measured frame size stays
 * under the 8KB target (see tests/onlineFrame.test.js).
 */

/** Mutable per-player fields that can change between ticks. */
export function framePlayer(p) {
  const s = p.stats || {};
  return {
    id: p.id,
    playPos: p.playPos || p.pos,
    stats: {
      pts: s.pts || 0,
      reb: s.reb || 0,
      ast: s.ast || 0,
      stl: s.stl || 0,
      blk: s.blk || 0,
      tov: s.tov || 0,
      pf: s.pf || 0,
      fgm: s.fgm || 0,
      fga: s.fga || 0,
      tpm: s.tpm || 0,
      tpa: s.tpa || 0,
      ftm: s.ftm || 0,
      fta: s.fta || 0,
      min: Math.round(s.min || 0),
    },
    fatigue: Math.round(p.fatigue ?? 0),
    hot: p.hot || 0,
    mood: Math.round(p.mood ?? 50),
    injuredGames: p.injuredGames || 0,
    injuryStatus: p.injuryStatus || null,
  };
}

export function frameTeam(sim, sideKey) {
  const t = sideKey === "away" ? sim.away : sim.home;
  return {
    name: t.name,
    side: sideKey,
    chem: t.chem,
    fit: t.fit,
    morale: Math.round(t.morale ?? 0),
    tactic: t.tactic ? { id: t.tactic.id, name: t.tactic.name } : null,
    // Per-side focus lives on each team's gameplan (see sim.js sideKey work).
    focusId: t.gameplan?.offenseFocusId || null,
    onCourt: t.onCourt.map(framePlayer),
    bench: t.bench.map(framePlayer),
  };
}

export function buildOnlineFrame(sim, tick) {
  return {
    type: "frame",
    tick,
    quarter: sim.quarter,
    clock: sim.clock,
    score: { ...sim.score },
    possession: sim.possession,
    timeouts: { ...sim.timeouts },
    paused: !!sim.paused,
    breakReason: sim.breakReason || null,
    momentum: sim.momentum ? { ...sim.momentum } : { side: null, points: 0, streak: 0 },
    home: frameTeam(sim, "home"),
    away: frameTeam(sim, "away"),
  };
}
