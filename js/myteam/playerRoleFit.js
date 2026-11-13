/**
 * Player roles (Team Intelligence v3): three layers.
 *   Natural archetype  -> what the card is (derived from attributes; never changes with the coach)
 *   Assigned role      -> what the coach's system asks of him (recommended per tactic; the player may override)
 *   Live instruction   -> in-game, handled by the existing gameplan UI (not duplicated here)
 *
 * A role score is 0..99 from REAL card attributes. A weak fit means "this isn't his job", never "he got worse".
 */
import { permutations } from "./rolePermutations.js";
import { overall } from "../data/players.js";

const a = (p, k, d = 50) => (Number.isFinite(p?.[k]) ? p[k] : d);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const handle = (p) => a(p, "handle", a(p, "pass"));
export const ovr = (p) => (Number.isFinite(p?.ovr) ? p.ovr : overall(p)); // usage follows star power: the best player is the engine

export const ROLES = {
  creator: { zh: "持球核心", en: "Primary Creator", score: (p) => 0.2 * handle(p) + 0.12 * a(p, "offDribble", a(p, "scoring")) + 0.2 * a(p, "pass") + 0.2 * a(p, "scoring") + 0.08 * a(p, "iq") + 0.2 * ovr(p) },
  secondary: { zh: "第二持球点", en: "Secondary Handler", score: (p) => 0.34 * handle(p) + 0.3 * a(p, "pass") + 0.2 * a(p, "iq") + 0.16 * a(p, "catchShoot", a(p, "three")) },
  spacer: { zh: "弱侧接应射手", en: "Spot-up Shooter", score: (p) => 0.62 * a(p, "catchShoot", a(p, "three")) + 0.26 * a(p, "three") + 0.12 * a(p, "iq") },
  rollBig: { zh: "挡拆顺下大个", en: "Screen & Roll Big", score: (p) => 0.34 * a(p, "paint") + 0.22 * a(p, "strength") + 0.2 * a(p, "rebound") + 0.14 * a(p, "block") + 0.1 * a(p, "speed") },
  highPost: { zh: "高位策应", en: "High-Post Hub", score: (p) => 0.4 * a(p, "pass") + 0.24 * a(p, "iq") + 0.2 * a(p, "paint") + 0.16 * a(p, "mid") },
  postScorer: { zh: "低位终结", en: "Post Scorer", score: (p) => 0.42 * a(p, "paint") + 0.28 * a(p, "strength") + 0.2 * a(p, "scoring") + 0.1 * a(p, "rebound") },
  rimProtector: { zh: "护框", en: "Rim Protector", score: (p) => 0.6 * a(p, "interiorDef", a(p, "defense")) + 0.26 * a(p, "block") + 0.14 * a(p, "rebound") },
  stopper: { zh: "外线盯人", en: "Perimeter Stopper", score: (p) => 0.6 * a(p, "perimDef", a(p, "defense")) + 0.26 * a(p, "steal") + 0.14 * a(p, "speed") },
  rebounder: { zh: "篮板保障", en: "Board Man", score: (p) => 0.7 * a(p, "rebound") + 0.2 * a(p, "strength") + 0.1 * a(p, "offReb", a(p, "rebound")) },
  runner: { zh: "转换终结", en: "Transition Runner", score: (p) => 0.4 * a(p, "speed") + 0.3 * a(p, "stamina") + 0.3 * a(p, "scoring") },
};

/** The five jobs each system asks for (duplicates allowed: "two shooters"). Fallback by group, then balanced. */
const TEMPLATES = {
  balanced: ["creator", "spacer", "stopper", "highPost", "rimProtector"],
  pnr_spam: ["creator", "rollBig", "spacer", "spacer", "stopper"],
  horns: ["creator", "highPost", "rollBig", "spacer", "stopper"],
  motion: ["secondary", "spacer", "spacer", "highPost", "rimProtector"],
  flex: ["secondary", "spacer", "highPost", "rollBig", "stopper"],
  princeton: ["secondary", "spacer", "highPost", "spacer", "rimProtector"],
  triangle: ["secondary", "postScorer", "spacer", "highPost", "stopper"],
  smallball: ["creator", "spacer", "spacer", "spacer", "stopper"],
  five_out: ["creator", "spacer", "spacer", "spacer", "stopper"],
  pace_space: ["creator", "spacer", "spacer", "runner", "stopper"],
  corner: ["creator", "spacer", "spacer", "spacer", "rimProtector"],
  iso_heavy: ["creator", "spacer", "spacer", "stopper", "rimProtector"],
  freestyle: ["creator", "spacer", "runner", "stopper", "rebounder"],
  post_up: ["postScorer", "creator", "spacer", "spacer", "rimProtector"],
  paint_attack: ["postScorer", "creator", "spacer", "rebounder", "rimProtector"],
  twin_towers: ["postScorer", "rimProtector", "rebounder", "creator", "spacer"],
  grind: ["stopper", "stopper", "rimProtector", "rebounder", "secondary"],
  zone_drop: ["stopper", "rimProtector", "rebounder", "secondary", "spacer"],
  switch_all: ["stopper", "stopper", "stopper", "rimProtector", "creator"],
  pack_paint: ["stopper", "stopper", "rimProtector", "rebounder", "secondary"],
  transition: ["creator", "runner", "runner", "spacer", "rebounder"],
  crash_boards: ["rebounder", "rebounder", "rollBig", "creator", "spacer"],
  second_chance: ["rebounder", "rebounder", "rollBig", "creator", "spacer"],
};

/** The first job is the system's engine, so it counts more: a star creator must not be parked as a spot-up shooter. */
const JOB_WEIGHT = [1.5, 1.2, 1, 1, 1];
const LEAN = { offense: ["creator", "spacer", "postScorer", "runner"], defense: ["stopper", "rimProtector", "rebounder"] };
const leanBonus = (roleId, lean) => (LEAN[lean]?.includes(roleId) ? 1.06 : 1); // a coach's philosophy tilts, never overrules

export const roleTemplate = (tacticId) => TEMPLATES[tacticId] || TEMPLATES.balanced;
export const roleScore = (roleId, player) => Math.max(0, Math.min(99, Math.round(ROLES[roleId].score(player))));
export const roleName = (roleId, lang = "zh") => (lang === "en" ? ROLES[roleId].en : ROLES[roleId].zh);

/** What the card naturally is: its best role regardless of any system. */
export function naturalRole(player) {
  return Object.keys(ROLES).map((id) => ({ id, score: roleScore(id, player) })).sort((x, y) => y.score - x.score)[0];
}

/**
 * Best assignment of the five starters to the system's five jobs (brute force over 120 permutations).
 * `overrides` {cardId: roleId} pin a player to a job the user chose; the rest are solved around them.
 * @returns {{[cardId]: {roleId, score, natural, overridden, mismatch}}}
 */
export function assignRoles(starters, tacticId, overrides = {}, lean = "balanced") {
  const list = (starters || []).filter(Boolean).slice(0, 5);
  const jobs = roleTemplate(tacticId);
  const free = list.filter((p) => !overrides[p.id] || !ROLES[overrides[p.id]]);
  const remaining = [...jobs];
  for (const p of list) {
    const o = overrides[p.id];
    if (o && ROLES[o]) { const i = remaining.indexOf(o); if (i >= 0) remaining.splice(i, 1); }
  }
  const pool = remaining.length >= free.length ? remaining : jobs;
  const out = {};
  // The engine job (first in the template) goes to whoever is best at it; a star's shooting must not talk him out of the ball.
  let rest = free;
  let restJobs = pool;
  if (pool[0] === jobs[0] && free.length > 1) {
    const engine = [...free].sort((x, y) => roleScore(jobs[0], y) - roleScore(jobs[0], x) || ovr(y) - ovr(x))[0];
    out[engine.id] = { roleId: jobs[0], overridden: false };
    rest = free.filter((p) => p !== engine);
    restJobs = pool.slice(1);
  }
  let best = null;
  for (const perm of permutations(restJobs, rest.length)) {
    const total = perm.reduce((t, job, i) => t + roleScore(job, rest[i]) * (JOB_WEIGHT[jobs.indexOf(job)] || 1) * leanBonus(job, lean), 0);
    if (!best || total > best.total) best = { total, perm };
  }
  rest.forEach((p, i) => { out[p.id] = { roleId: best?.perm[i] || "secondary", overridden: false }; });
  for (const p of list) if (!out[p.id]) out[p.id] = { roleId: overrides[p.id], overridden: true };
  for (const p of list) {
    const r = out[p.id];
    r.score = roleScore(r.roleId, p);
    r.natural = naturalRole(p);
    r.mismatchKind = mismatchKind(p, r.roleId, r.score, r.natural);
    r.mismatch = !!r.mismatchKind;
  }
  return out;
}

const GUARD_POS = new Set(["PG", "SG"]);
const INTERIOR_ONLY = new Set(["rimProtector", "rollBig", "postScorer"]); // jobs a guard is not built for
const PERIMETER_ONLY = new Set(["creator", "stopper", "runner"]); // jobs a true center is not built for

/**
 * Why a job doesn't suit a player, judged on THREE things (never one score threshold):
 *   position  - a guard asked to anchor the paint / a center asked to run the offence or chase guards
 *   gap       - far below the job he'd be best at
 *   weak      - the job itself is a poor fit in absolute terms
 * @returns {null|"position"|"gap"|"weak"}
 */
export function mismatchKind(player, roleId, score, natural) {
  const pos = player?.playPos || player?.pos;
  if (GUARD_POS.has(pos) && INTERIOR_ONLY.has(roleId) && natural.score - score >= 8) return "position";
  if (pos === "C" && PERIMETER_ONLY.has(roleId) && natural.score - score >= 8) return "position";
  if (natural.score - score >= 18 && score < 65) return "gap"; // a 70 at a second-best job is a choice, not a red flag
  if (score < 55 && natural.score - score >= 12) return "weak";
  return null;
}

export const averageRoleFit = (assignment) => Math.round(mean(Object.values(assignment).map((r) => r.score)));
