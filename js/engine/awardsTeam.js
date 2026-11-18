/**
 * Team-aware inputs for two season awards. Pure; both take `standingsList(st)` so there is no import cycle with season.js.
 *
 *  - DPOY: a defender's personal stocks (steals, blocks, boards) are scaled by how well his TEAM defends. A rim protector on
 *    the league's 24th-ranked defence is not the best defender of the year (measured: 2 of 5 simulated winners were).
 *  - Coach of the Year: rewards beating the pre-season expectation, not just owning the best roster. "Expected" is read off
 *    this season's own league (a straight line from roster strength to win %), so it carries no hand-picked constant.
 */
import { overall } from "../data/players.js";

export const DEFENSE_FACTOR_BEST = 1.15; // fewest points allowed
export const DEFENSE_FACTOR_WORST = 0.85; // most points allowed
const COTY_MIN_WIN_PCT = 0.5; // a coach of the year has a winning team

const gamesOf = (t) => (t.w || 0) + (t.l || 0);
const mean = (xs) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);

/** teamId -> multiplier for a defender's DPOY score, from points allowed per game (best defence first). */
export function teamDefenseFactors(list) {
  const rated = list.filter((t) => gamesOf(t) > 0).map((t) => ({ id: t.id, pa: t.pa / gamesOf(t) })).sort((a, b) => a.pa - b.pa);
  const out = new Map();
  rated.forEach((t, i) => {
    const share = rated.length > 1 ? i / (rated.length - 1) : 0;
    out.set(t.id, DEFENSE_FACTOR_BEST - (DEFENSE_FACTOR_BEST - DEFENSE_FACTOR_WORST) * share);
  });
  return out;
}

/** Mean overall of a team's best eight cards. */
export function teamStrength(team) {
  return mean((team?.players || []).map((c) => overall(c)).sort((a, b) => b - a).slice(0, 8));
}

/**
 * The coach whose team most beat the expectation for its roster while still winning. Score = win % + (win % - expected %),
 * so the record matters and so does overachieving. Returns { team, basis } or null.
 */
export function coachOfTheYear(st, list) {
  const rows = list.filter((t) => gamesOf(t) > 0).map((t) => ({ t, pct: t.pct, strength: teamStrength(st.teams[t.id]) }));
  if (!rows.length) return null;
  const mp = mean(rows.map((r) => r.pct));
  const ms = mean(rows.map((r) => r.strength));
  const varS = mean(rows.map((r) => (r.strength - ms) ** 2));
  const slope = rows.length >= 4 && varS > 0 ? mean(rows.map((r) => (r.strength - ms) * (r.pct - mp))) / varS : 0;
  const scored = rows.map((r) => {
    const expected = mp + slope * (r.strength - ms);
    return { ...r, expected, over: r.pct - expected, score: r.pct + (r.pct - expected) };
  });
  const eligible = scored.filter((r) => r.pct >= COTY_MIN_WIN_PCT);
  const pool = eligible.length ? eligible : scored;
  const best = [...pool].sort((a, b) => b.score - a.score || b.pct - a.pct)[0];
  const gp = gamesOf(best.t);
  const strengthRank = 1 + rows.filter((r) => r.strength > best.strength).length;
  return {
    team: best.t,
    basis: {
      expectedW: Math.round(best.expected * gp * 10) / 10,
      aboveW: Math.round(best.over * gp * 10) / 10,
      strengthRank,
      teams: rows.length,
    },
  };
}
