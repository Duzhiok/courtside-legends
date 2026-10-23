/**
 * Who guards whom: ranking your roster against an opponent five, same-position-first with
 * adjacent-position and catch-all fallbacks, plus preserving any manual overrides the user
 * already picked. Extracted from js/app.js (R34 app.js-shrink pass) -- pure logic, no DOM, used
 * by both the pre-game setup screen and the live in-game matchup board.
 */
import { overall } from "../data/players.js";

export const MATCHUP_POS_ORDER = ["PG", "SG", "SF", "PF", "C"];
export const MATCHUP_NEAR_POS = {
  PG: ["SG", "SF"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF", "PG"],
  PF: ["C", "SF"],
  C: ["PF", "SF"],
};

/**
 * Local copy of app.js's normalizePos(), not a shared util: the codebase has several
 * independent position-normalizers (court.js, gameplan.js's normPos5, allTeam.js's
 * normAllTeamPos, app.js's normalizePos) that are each subtly different on compound labels
 * like "PG-SG" or "F-C" -- swapping one in for another would be a silent behavior change, not
 * a safe dedup, so this intentionally matches app.js's exact rules rather than importing
 * someone else's slightly-different version. Consolidating all of them is a bigger, separate
 * cleanup for later, not something to risk as a side effect of this extraction.
 */
function normMatchupPos(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (MATCHUP_POS_ORDER.includes(p)) return p;
  if (p.includes("G") && p.startsWith("P")) return "PG";
  if (p.includes("G")) return "SG";
  if (p.includes("C")) return "C";
  if (p.includes("F") && p.startsWith("P")) return "PF";
  return "SF";
}

export function matchupPosOf(p) {
  return normMatchupPos(p?.playPos || p?.pos);
}

export function sortByMatchupPos(list) {
  return [...(list || [])].sort((a, b) => {
    const da = MATCHUP_POS_ORDER.indexOf(matchupPosOf(a));
    const db = MATCHUP_POS_ORDER.indexOf(matchupPosOf(b));
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db) || (b.defense || 0) - (a.defense || 0);
  });
}

/** 同位置优先互防；同位置多人取防守更高者；再邻位，最后才随便补 */
export function buildSamePosMatchups(youPool, oppPool, saved = {}) {
  const you = sortByMatchupPos(youPool);
  const opp = sortByMatchupPos(oppPool);
  const youById = new Map(you.map((p) => [p.id, p]));
  const assignments = {};
  const used = new Set();

  const claim = (opId, defId) => {
    if (!opId || !defId || used.has(defId) || !youById.has(defId)) return false;
    assignments[opId] = defId;
    used.add(defId);
    return true;
  };

  // 保留玩家已选手动对位（含故意错位），只要防守人仍在名单里
  for (const op of opp) {
    const sid = saved[op.id];
    if (!sid || !youById.has(sid) || used.has(sid)) continue;
    claim(op.id, sid);
  }

  const pickBest = (op, pred) => {
    const cands = you
      .filter((p) => !used.has(p.id) && pred(p))
      .sort((a, b) => (b.defense || 0) - (a.defense || 0) || overall(b) - overall(a));
    return cands[0] || null;
  };

  // 1) 同位置
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const bp = matchupPosOf(op);
    const hit = pickBest(op, (p) => matchupPosOf(p) === bp);
    if (hit) claim(op.id, hit.id);
  }
  // 2) 邻位
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const near = MATCHUP_NEAR_POS[matchupPosOf(op)] || [];
    const hit = pickBest(op, (p) => near.includes(matchupPosOf(p)));
    if (hit) claim(op.id, hit.id);
  }
  // 3) 剩余
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const hit = pickBest(op, () => true);
    if (hit) claim(op.id, hit.id);
  }
  return assignments;
}
