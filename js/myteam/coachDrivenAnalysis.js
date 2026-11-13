/**
 * Coach-Driven Team Intelligence v3 — analyzeTeam(). Pure: no DOM, no storage, never mutates its input.
 *
 * Output keeps the two worlds apart:
 *   intrinsicStrengths  what the cards are (identical under every coach)
 *   coachSystemFit / playerRoleFits / conflicts / tacticalSynergies   what THIS coach + system makes of them
 * Each coach-dependent item carries `simBacked`: true when GameSim really reads that number (lineupFit, systemFitScore),
 * false when it's an advisory read of the roles (shown labelled "advice" in the UI).
 */
import { coachSystemFit, playerSystemFit } from "../coaching/coachSystemFit.js";
import { assignRoles, averageRoleFit, roleScore, ovr } from "./playerRoleFit.js";
import { TACTICS } from "../data/coaches.js";
import { coachProfile } from "../coaching/coachTacticalProfile.js";

const a = (p, k, d = 50) => (Number.isFinite(p?.[k]) ? p[k] : d);
const meanTop = (xs, n) => { const s = [...xs].sort((x, y) => y - x).slice(0, n); return s.length ? s.reduce((t, x) => t + x, 0) / s.length : 0; };
const clamp = (x) => Math.max(0, Math.min(99, Math.round(x)));

export function intrinsicStrengths(starters, bench = []) {
  const s = (starters || []).filter(Boolean);
  const b = (bench || []).filter(Boolean);
  return {
    interiorDefense: { score: clamp(meanTop(s.map((p) => a(p, "interiorDef", a(p, "defense"))), 2)), from: "interiorDef · block" },
    perimeterDefense: { score: clamp(meanTop(s.map((p) => a(p, "perimDef", a(p, "defense"))), 2)), from: "perimDef · steal" },
    rebounding: { score: clamp(meanTop(s.map((p) => a(p, "rebound")), 3)), from: "rebound" },
    shooting: { score: clamp(meanTop(s.map((p) => a(p, "catchShoot", a(p, "three"))), 3)), from: "catchShoot · three" },
    creation: { score: clamp(meanTop(s.map((p) => roleScore("creator", p)), 2)), from: "handle · pass · scoring" },
    athleticism: { score: clamp(s.reduce((t, p) => t + (a(p, "speed") + a(p, "stamina")) / 2, 0) / (s.length || 1)), from: "speed · stamina" },
    benchDepth: { score: b.length ? clamp(meanTop(b.map(ovr), 4)) : null, from: "bench overall" },
  };
}

function conflictsFor({ tactic, starters, assignment, native }) {
  const out = [];
  const id = tactic?.id;
  const shooters = starters.filter((p) => a(p, "catchShoot", a(p, "three")) >= 68).length;
  const creators = starters.filter((p) => roleScore("creator", p) >= 80).length;
  const bigs = starters.filter((p) => ["C", "PF"].includes(p.playPos || p.pos)).length;
  const rim = starters.some((p) => a(p, "interiorDef", a(p, "defense")) >= 70);
  const spacing = tactic?.group === "spacing";
  if (shooters < (spacing ? 3 : 2)) out.push({ code: "spacing", severity: spacing ? "high" : "medium", simBacked: false, data: { shooters, need: spacing ? 3 : 2 } });
  if (creators >= 3) out.push({ code: "ball_crowd", severity: "medium", simBacked: false, data: { creators } });
  if ((id === "smallball" || id === "five_out") && bigs >= 3) out.push({ code: "bigs_in_small", severity: "high", simBacked: id === "smallball", data: { bigs } });
  if (["zone_drop", "grind", "pack_paint", "twin_towers"].includes(id) && !rim) out.push({ code: "no_rim", severity: "high", simBacked: false, data: {} });
  for (const p of starters) {
    const r = assignment[p.id];
    if (r?.mismatch) out.push({ code: "role_mismatch", severity: "medium", simBacked: false, data: { id: p.id, name: p.name, roleId: r.roleId, score: r.score, kind: r.mismatchKind, natural: r.natural.id } });
  }
  if (!native) out.push({ code: "off_system", severity: "low", simBacked: false, data: {} }); // GameSim applies no off-system penalty
  return out;
}

function synergiesFor({ starters, assignment }) {
  const roles = (id) => starters.filter((p) => assignment[p.id]?.roleId === id);
  const out = [];
  const [c] = roles("creator");
  const [rb] = roles("rollBig");
  if (c && rb && roleScore("creator", c) >= 72 && roleScore("rollBig", rb) >= 65) out.push({ code: "pnr", names: [c.name, rb.name] });
  if (roles("spacer").length >= 2 && c) out.push({ code: "spaced_creation", names: [c.name] });
  const [rp] = roles("rimProtector");
  const [st] = roles("stopper");
  if (rp && st && roleScore("rimProtector", rp) >= 70 && roleScore("stopper", st) >= 65) out.push({ code: "two_level_defense", names: [st.name, rp.name] });
  return out;
}

/**
 * @param {{coach: object, tacticalSystem?: object|string, starters: object[], bench?: object[], playerRoles?: object}} p
 */
export function analyzeTeam({ coach, tacticalSystem, starters, bench = [], playerRoles = {} }) {
  const tactic = typeof tacticalSystem === "string" ? TACTICS[tacticalSystem] : tacticalSystem || TACTICS.balanced;
  const five = (starters || []).filter(Boolean).slice(0, 5);
  const lean = coachProfile(coach).philosophy;
  const assignment = assignRoles(five, tactic.id, playerRoles, lean);
  const fit = coachSystemFit(coach, tactic, five);
  const native = fit.proficiency >= 1;
  const roleFits = {};
  for (const p of five) {
    const r = assignment[p.id];
    const sys = playerSystemFit(p, coach, tactic);
    roleFits[p.id] = { ...r, systemFit: sys, simBacked: false, fit: Math.round(0.7 * r.score + 0.3 * sys) };
  }
  const conflicts = conflictsFor({ tactic, starters: five, assignment, native });
  const penalty = conflicts.reduce((t, c) => t + (c.severity === "high" ? 8 : c.severity === "medium" ? 4 : 0), 0);
  return {
    tactic: tactic.id,
    // Advisory headline (NOT simulated): how ready these five are to run this system under this coach.
    executionReadiness: Math.max(0, Math.min(99, averageRoleFit(assignment) + (native ? 4 : 0) - penalty)),
    intrinsicStrengths: intrinsicStrengths(five, bench),
    coachSystemFit: fit,
    playerRoleFits: roleFits,
    roleFitAverage: averageRoleFit(assignment),
    tacticalSynergies: synergiesFor({ starters: five, assignment }),
    conflicts,
  };
}
