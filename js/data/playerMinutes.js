/**
 * Player role + minute targets (data layer).
 *
 * Moved here from js/engine/gameplan.js (A-P2-5): js/data/playerPrefs.js
 * needs suggestTargetMinutes to tell a hand-set target from the auto
 * recommendation, and a data module must not import the engine layer.
 * These are pure reference rules — role definitions, stamina ceilings,
 * role inference from production — with no dependency on the sim, so
 * they live in data/ and engine/gameplan.js, engine/sim.js and app.js
 * import them back from here. Depends only on ./players.js (overall).
 */
import { overall } from "./players.js";

export const PLAYER_ROLES = {
  alpha: { id: "alpha", name: "进攻核心", wantMin: 36, wantUsage: "high" },
  starter: { id: "starter", name: "稳定首发", wantMin: 30, wantUsage: "mid" },
  sixth: { id: "sixth", name: "第六人", wantMin: 24, wantUsage: "mid" },
  role: { id: "role", name: "角色球员", wantMin: 18, wantUsage: "low" },
  bench: { id: "bench", name: "板凳蓝领", wantMin: 12, wantUsage: "low" },
};

/** Infer default role from production / value archetype. */
export function inferPlayerRole(p) {
  if (p.roleExpectation) return p.roleExpectation;
  const o = overall(p);
  const ppg = p.raw?.ppg ?? 0;
  if (p.valueArchetype === "bargain" && o < 86) return "sixth";
  if (ppg >= 25 || o >= 90) return "alpha";
  if (ppg >= 16 || o >= 82) return "starter";
  if (ppg >= 10 || o >= 74) return "sixth";
  if (o >= 65) return "role";
  return "bench";
}

/** Soft minute ceiling from stamina — low gas can't safely play 35+. */
export function staminaMinuteCap(p) {
  const stam = Number(p?.stamina) || 50;
  let cap = 20;
  if (stam >= 94) cap = 48;
  else if (stam >= 88) cap = 42;
  else if (stam >= 80) cap = 36;
  else if (stam >= 70) cap = 32;
  else if (stam >= 60) cap = 28;
  else if (stam >= 50) cap = 24;
  const skills = p?.skills || [];
  if (skills.includes("iron_lungs")) cap = Math.min(48, cap + 8);
  else if (skills.includes("motor_engine")) cap = Math.min(48, cap + 4);
  return cap;
}

export function staminaMinuteHint(p, lang = "zh") {
  const en = lang === "en";
  const stam = Number(p?.stamina) || 50;
  const cap = staminaMinuteCap(p);
  const t = Number(p?.targetMinutes) || 0;
  if (t > cap) return en ? `⚠ Stamina ${stam}: ${t} min will wear him down (keep ≤${cap})` : `⚠ 体能${stam}，长期 ${t} 分钟易崩（建议 ≤${cap}）`;
  if (t >= cap - 2) return en ? `Stamina ${stam} · near his limit of ${cap}` : `体能${stam} · 已接近上限 ${cap}`;
  return en ? `Stamina ${stam} · can carry about ${cap} min` : `体能${stam} · 可稳打约 ${cap} 分钟`;
}

/** Suggest target minutes from role + stamina. */
export function suggestTargetMinutes(p) {
  const roleMin = PLAYER_ROLES[p.roleExpectation || inferPlayerRole(p)]?.wantMin ?? 22;
  const cap = staminaMinuteCap(p);
  return Math.max(8, Math.min(cap, roleMin));
}
