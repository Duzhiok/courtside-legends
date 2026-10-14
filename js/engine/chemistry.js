import { overall } from "../data/players.js";

/** Chemistry, fit, and personality modifiers for on-court performance. */
export function teamChemistry(players) {
  if (!players.length) return 40;
  const egos = players.map((p) => p.personality.ego);
  const teams = players.map((p) => p.personality.team);
  const avgEgo = avg(egos);
  const avgTeam = avg(teams);
  const egoClash = std(egos);

  let chem = 45 + avgTeam * 0.35 - egoClash * 0.45;
  // Too many ball-dominant egos hurt unless they are role-complementary
  const creators = players.filter((p) =>
    ["iso_scorer", "iso_creator", "mamba", "creator", "engine", "goat"].includes(p.archetype)
  ).length;
  if (creators >= 3) chem -= 12;
  if (creators >= 4) chem -= 10;

  // Shared era / franchise slight bonus
  const teamsCount = countBy(players, (p) => p.team);
  const maxSame = Math.max(...Object.values(teamsCount));
  if (maxSame >= 3) chem += 8;

  // Calm + fiery mix can work if team-first present
  const fiery = avg(players.map((p) => p.personality.fiery));
  if (fiery > 70 && avgTeam < 60) chem -= 8;

  return clamp(Math.round(chem), 15, 95);
}

export function lineupFit(players, coach, tactic) {
  if (!players.length) return 40;
  let fit = 50;
  const arches = players.map((p) => p.archetype);
  const preferred = coach?.preferred || [];
  const hits = arches.filter((a) => preferred.includes(a)).length;
  fit += hits * 6;

  const needs = tactic?.needs || [];
  const needHits = arches.filter((a) => needs.includes(a)).length;
  fit += needHits * 5;

  // Spacing vs paint balance
  const shooters = players.filter((p) => p.three >= 75).length;
  const bigs = players.filter((p) => ["C", "PF"].includes(p.pos)).length;
  if (tactic?.id === "smallball") {
    fit += shooters * 4;
    if (bigs >= 3) fit -= 10;
  }
  if (tactic?.id === "triangle") {
    if (players.some((p) => p.iq >= 90)) fit += 6;
    if (players.some((p) => p.archetype === "dominant_big" || p.archetype === "goat")) fit += 8;
  }
  if (tactic?.id === "grind") {
    fit += avg(players.map((p) => p.defense)) * 0.15 - 8;
  }

  // Star stacking without connectors
  const ovr = players.map(overall);
  const stars = ovr.filter((x) => x >= 88).length;
  const connectors = players.filter((p) =>
    ["connector", "floor_general", "playmaking_big", "screen_setter"].includes(p.archetype)
  ).length;
  if (stars >= 3 && connectors === 0) fit -= 14;

  // Coach buff subtle
  if (coach) fit += (coach.buffs.offense + coach.buffs.defense) * 0.15;

  return clamp(Math.round(fit), 20, 96);
}

export function personalityOnPlay(player, teamChem) {
  let mult = 1;
  if (player.personality.ego > 80 && teamChem < 50) mult *= 0.92;
  if (player.personality.team > 80) mult *= 1.03;
  if (player.personality.fiery > 85) mult *= Math.random() < 0.15 ? 1.08 : 0.97;
  if (player.personality.calm > 85) mult *= 1.02;
  return mult;
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}
function std(arr) {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map((x) => (x - m) ** 2)));
}
function countBy(arr, fn) {
  const o = {};
  for (const x of arr) {
    const k = fn(x);
    o[k] = (o[k] || 0) + 1;
  }
  return o;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
