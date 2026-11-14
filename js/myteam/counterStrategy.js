/**
 * Counter-strategy engine (Team Intelligence v4). Pure, preview-only; nothing here writes a lineup or a tactic.
 *
 * For one opponent it builds four genuinely different game plans -- each picks its OWN system from what the active
 * coach can run, its OWN five from the roster, and its OWN player jobs:
 *   contain   limit his best weapon      exhaust  wear the star down / attack him in pick-and-roll
 *   spacing   go around his strength     outscore accept his points and win with ours
 * Three separate readings per plan, never summed into a fake win rate:
 *   counterEffect  does the plan hit what he is good at (card attributes, mine vs his)
 *   execution      can OUR five do the jobs the plan needs (best role assignment)
 *   proficiency    how at home is the coach in that system
 * Ranking uses an internal blend; it is a ranking, not a probability. GameSim stays the only match engine.
 */
import { TACTICS } from "../data/coaches.js";
import { selectableSystems, systemProficiency } from "../coaching/coachTacticalProfile.js";
import { lineupUtility, tradeoffs } from "./lineupRecommendations.js";
import { ovr, roleScore } from "./playerRoleFit.js";

const a = (p, k, d = 50) => (Number.isFinite(p?.[k]) ? p[k] : d);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const topMean = (xs, n) => mean([...xs].sort((x, y) => y - x).slice(0, n));
const clamp = (x) => Math.max(0, Math.min(99, Math.round(x)));

export const PLAN_IDS = ["contain", "exhaust", "spacing", "outscore"];
const SWAP_BAR = 3; // a plan only changes the saved five when it wins this much on utility over the current five
const STAR_OVR = 90;
const PLAN_TACTICS = {
  contain: ["pack_paint", "zone_drop", "crash_boards", "grind"],
  exhaust: ["pnr_spam", "pace_space", "second_chance", "motion"],
  spacing: ["five_out", "pace_space", "motion", "smallball"],
  outscore: ["pnr_spam", "freestyle", "motion", "pace_space", "horns", "iso_heavy"],
};

/** counterEffect 0-99 for one five against one scouted opponent (50 = even). */
function effectOf(planId, five, opp) {
  const star = opp.threats[0];
  const shoot = topMean(five.map((p) => a(p, "catchShoot", a(p, "three"))), 3);
  const create = topMean(five.map((p) => roleScore("creator", p)), 2);
  if (planId === "contain") {
    const perimeter = star?.kind === "perimeter";
    const mine = perimeter
      ? topMean(five.map((p) => a(p, "perimDef", a(p, "defense"))), 2)
      : 0.6 * topMean(five.map((p) => a(p, "interiorDef", a(p, "defense"))), 1) + 0.4 * topMean(five.map((p) => a(p, "rebound")), 2);
    const his = perimeter ? opp.profile.perimeterThreat : 0.7 * opp.profile.interiorThreat + 0.3 * opp.profile.reboundThreat;
    return clamp(50 + (mine - his) * 1.2);
  }
  if (planId === "exhaust") {
    const ath = mean(five.map((p) => (a(p, "speed") + a(p, "stamina")) / 2));
    return clamp(50 + (ath - (star?.athleticism ?? opp.profile.stamina)) + 0.3 * (create - (star?.perimDef ?? 60)));
  }
  if (planId === "spacing") return clamp(50 + 0.7 * (shoot - opp.profile.perimeterDefense) + 0.15 * (opp.profile.rimProtection - 60));
  return clamp(50 + ((shoot + create) / 2 - (opp.profile.perimeterDefense + opp.profile.rimProtection) / 2)); // outscore
}

function* fives(items) {
  const n = items.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) for (let m = l + 1; m < n; m++) yield [items[i], items[j], items[k], items[l], items[m]];
}

/** Who guards whom, and who leads the second unit -- as data. The engine cannot yet sub on "star on court", so this is advisory. */
export function rotationAdvice(five, roster, opp) {
  const used = new Set();
  const defenders = opp.threats.map((t) => {
    const key = t.kind === "interior" ? "interiorDef" : "perimDef";
    const d = [...five].filter((p) => !used.has(p.id)).sort((x, y) => a(y, key, a(y, "defense")) - a(x, key, a(x, "defense")))[0];
    if (d) used.add(d.id);
    return { threatId: t.id, threatName: t.name, kind: t.kind, defenderId: d?.id || null, defenderName: d?.name || null, score: d ? a(d, key, a(d, "defense")) : 0 };
  });
  const bench = roster.filter((p) => !five.includes(p));
  const leader = [...bench].sort((x, y) => roleScore("creator", y) - roleScore("creator", x))[0] || null;
  return {
    defenders,
    secondUnitLeaderId: leader?.id || null,
    benchOrder: [...bench].sort((x, y) => ovr(y) - ovr(x)).slice(0, 4).map((p) => p.id),
    rules: [
      ...opp.threats.map((t, i) => ({ when: "opponent_star_on_court", starId: t.id, preferDefenderId: defenders[i]?.defenderId || null })),
      { when: "opponent_star_resting", lineup: "offense" },
    ],
    engineSupport: { conditionalSubs: false }, // GameSim exposes no on-court condition for subs: apply sets starters + system, subs stay manual
  };
}

/**
 * @param {{coach: object, roster: object[], opponent: object, currentIds?: string[], currentTacticId?: string}} p `opponent` = scoutOpponent() output
 * @returns {null|{plans: object[], recommended: string, containViable: boolean}}
 */
export function counterStrategies({ coach, roster, opponent, currentIds = [], currentTacticId = null }) {
  const pool = (roster || []).filter(Boolean);
  if (pool.length < 5 || !opponent) return null;
  const sys = selectableSystems(coach, pool);
  const selectable = new Map(sys.map((s) => [s.id, s]));
  const cur = currentIds.map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  const hasCur = cur.length === 5;
  const all = [...fives(pool)];
  const cache = new Map(); // `${tactic}|${fiveIndex}` -> utility; plans that share a system share the work
  const utilOf = (tid, idx) => {
    const k = `${tid}|${idx}`;
    if (!cache.has(k)) cache.set(k, lineupUtility(coach, TACTICS[tid], all[idx]));
    return cache.get(k);
  };
  const curU = {};
  const curAt = (tid) => (curU[tid] ??= lineupUtility(coach, TACTICS[tid], cur));

  const usedTactics = new Set(); // four plans that all end up on the same system would be four copies of one plan
  const plans = PLAN_IDS.map((planId) => {
    const wanted = PLAN_TACTICS[planId].filter((t) => selectable.has(t));
    const tids = wanted.filter((t) => !usedTactics.has(t));
    if (!tids.length) tids.push(...wanted);
    if (!tids.length) tids.push(selectable.has("balanced") ? "balanced" : [...selectable.keys()][0]);
    let best = null;
    for (const tid of tids) {
      const prof = systemProficiency(coach, tid);
      for (let i = 0; i < all.length; i++) {
        const u = utilOf(tid, i);
        const effect = effectOf(planId, all[i], opponent);
        const stars = hasCur ? cur.filter((p) => ovr(p) >= STAR_OVR && !all[i].includes(p)).length : 0;
        const internal = 0.4 * u.U + 0.3 * effect + 0.3 * prof * 100 - stars * 2.5;
        if (!best || internal > best.internal) best = { tid, i, u, effect, prof, internal };
      }
    }
    usedTactics.add(best.tid);
    // Keep the saved five unless the plan's five wins clearly (role reassignment / system change comes first).
    let five = all[best.i];
    let u = best.u;
    if (hasCur) {
      const base = curAt(best.tid);
      if (best.u.U - base.U < SWAP_BAR) { five = cur; u = base; best = { ...best, effect: effectOf(planId, cur, opponent), internal: 0.4 * base.U + 0.3 * effectOf(planId, cur, opponent) + 0.3 * best.prof * 100 }; }
    }
    const t = hasCur && five !== cur ? tradeoffs(curAt(best.tid).analysis, u.analysis, cur.filter((p) => !five.includes(p)), five.filter((p) => !cur.includes(p))) : null;
    const star = opponent.threats[0];
    return {
      id: planId,
      tacticId: best.tid,
      native: selectable.get(best.tid)?.native ?? false,
      ids: five.map((p) => p.id),
      changesFive: hasCur ? five !== cur : true,
      changesTactic: currentTacticId ? best.tid !== currentTacticId : true,
      counterEffect: best.effect,
      execution: clamp(u.analysis.roleFitAverage),
      proficiency: Math.round(best.prof * 100),
      internal: Math.round(best.internal * 10) / 10,
      tradeoffs: t,
      targetsStar: star ? { id: star.id, name: star.name, kind: star.kind } : null,
      rotation: rotationAdvice(five, pool, opponent),
      // can this plan actually work? contain/exhaust below an even matchup are honest "unlikely" flags
      viable: planId === "contain" || planId === "exhaust" ? best.effect >= 52 : best.effect >= 48,
    };
  });
  const ranked = [...plans].sort((x, y) => y.internal - x.internal);
  return { plans, recommended: ranked[0].id, containViable: plans.find((p) => p.id === "contain").viable };
}
