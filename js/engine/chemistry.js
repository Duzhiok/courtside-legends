import { positionFitScore } from "../data/franchises.js";
import {
  ballRolePlayFactor,
  ballSharingFit,
  hiddenPlayFactor,
  systemFitScore,
} from "../data/intangibles.js";
import { overall } from "../data/players.js";
import { activeDuoIds } from "../data/skills.js";

function effPos(p) {
  return p.playPos || p.pos;
}

/** Chemistry, fit, and personality modifiers for on-court performance. */
export function teamChemistry(players, { primaryId = null } = {}) {
  if (!players.length) return 40;
  const egos = players.map((p) => p.personality?.ego ?? 50);
  const teams = players.map((p) => p.personality?.team ?? 50);
  const avgTeam = avg(teams);
  const egoClash = std(egos);

  let chem = 45 + avgTeam * 0.35 - egoClash * 0.45;
  // Too many ball-dominant egos hurt unless they are role-complementary
  const creators = players.filter((p) =>
    ["iso_scorer", "iso_creator", "mamba", "creator", "engine", "goat"].includes(p.archetype)
  ).length;
  if (creators >= 3) chem -= 12;
  if (creators >= 4) chem -= 10;

  // 持球冲突：仅当两人仍坚持要球（未设无球 / 无球能力不够）；教练指定持球人可化解
  const ball = ballSharingFit(players, { primaryId });
  chem += ball.chemDelta;

  // Shared era / franchise slight bonus
  const teamsCount = countBy(players, (p) => p.franchiseId || p.team);
  const maxSame = Math.max(...Object.values(teamsCount));
  if (maxSame >= 3) chem += 8;

  // Same-era bonus
  const eras = players.map((p) => Math.floor((p.season || 2000) / 10));
  const eraCount = countBy(eras, (x) => x);
  if (Math.max(...Object.values(eraCount)) >= 3) chem += 5;

  // Calm + fiery mix can work if team-first present
  const fiery = avg(players.map((p) => p.personality?.fiery ?? 50));
  if (fiery > 70 && avgTeam < 60) chem -= 8;

  // 化学反应核：暗属性，能力值看不出来
  const magnets = avg(players.map((p) => p.intangibles?.chemistryMagnet || 50));
  chem += (magnets - 50) * 0.22;
  const leaders = avg(players.map((p) => p.intangibles?.leadership || 50));
  chem += (leaders - 50) * 0.1;

  // Position mismatch hurts chemistry a bit (James at C etc.)
  const posFit = avg(players.map((p) => positionFitScore(p.pos, p.playPos || p.pos, p)));
  chem += (posFit - 80) * 0.15;

  // Organized backcourt: high-pass / high-APG PG lifts glue
  const point = players.find((p) => effPos(p) === "PG") || players.find((p) => effPos(p) === "SG");
  const pointOrg = point ? Math.max(point.pass || 0, (point.raw?.apg || 0) * 8) : 0;
  if (point && pointOrg >= 72) {
    chem += 3 + Math.min(5, Math.round((pointOrg - 72) * 0.2));
    chem += ((point.intangibles?.chemistryMagnet || 50) - 50) * 0.08;
  }
  // Two ball-handlers who actually share (pass+IQ) at 1/2
  const guards = players.filter((p) => ["PG", "SG"].includes(effPos(p)));
  if (guards.length >= 2) {
    const passAvg = avg(guards.map((p) => p.pass || 50));
    if (passAvg >= 70) chem += 4;
    else if (passAvg < 55) chem -= 3;
  }

  // Famous duo / trio chemistry
  const duos = activeDuoIds(players);
  if (duos.length) chem += Math.min(14, 5 + duos.length * 3);

  return clamp(Math.round(chem), 15, 95);
}

export function lineupFit(players, coach, tactic, { primaryId = null } = {}) {
  if (!players.length) return 40;
  let fit = 50;
  const arches = players.map((p) => p.archetype);
  const preferred = coach?.preferred || [];
  const hits = arches.filter((a) => preferred.includes(a)).length;
  fit += hits * 6;

  const needs = tactic?.needs || [];
  const needHits = arches.filter((a) => needs.includes(a)).length;
  fit += needHits * 5;

  // Spacing vs paint balance (use assigned playPos when set)
  const shooters = players.filter((p) => p.three >= 75).length;
  const bigs = players.filter((p) => ["C", "PF"].includes(effPos(p))).length;
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

  // Assigned position vs natural position (skills can soften 1↔2 slides)
  const posFit = avg(players.map((p) => positionFitScore(p.pos, p.playPos || p.pos, p)));
  fit += (posFit - 70) * 0.28;

  // Lineup needs one of each roughly
  const posSet = new Set(players.map(effPos));
  fit += Math.min(posSet.size, 5) * 2;

  // Passing / organization at the point of attack
  const pg = players.find((p) => effPos(p) === "PG");
  if (pg) {
    const org = Math.max(pg.pass || 50, (pg.raw?.apg || 0) * 8);
    fit += (org - 55) * 0.12;
    fit += ((pg.iq || 50) - 55) * 0.06;
    if (org >= 80) fit += 4;
  } else {
    // No PG slot filled among this group — slight tax unless a high-pass SG runs it
    const sgOrg = players.find(
      (p) => effPos(p) === "SG" && ((p.pass || 0) >= 75 || (p.raw?.apg || 0) >= 8)
    );
    if (sgOrg) fit += 1;
    else fit -= 4;
  }
  // Scoring PG moved to 2 beside a real organizer → unlock (Kyrie case)
  const pgOrg = pg ? Math.max(pg.pass || 0, (pg.raw?.apg || 0) * 8) : 0;
  const scoringAtTwo = players.find(
    (p) =>
      effPos(p) === "SG" &&
      p.pos === "PG" &&
      (p.scoring || 0) >= 85 &&
      pg &&
      pgOrg >= 68
  );
  if (scoringAtTwo) fit += 5;

  // Star stacking without connectors
  const ovr = players.map(overall);
  const stars = ovr.filter((x) => x >= 88).length;
  const connectors = players.filter((p) =>
    ["connector", "floor_general", "playmaking_big", "screen_setter"].includes(p.archetype)
  ).length;
  if (stars >= 3 && connectors === 0) fit -= 14;

  // 持球 / 无球：可指定持球人或设无球共存；真抢球才骤降适配
  const ball = ballSharingFit(players, { primaryId });
  fit += ball.fitDelta;
  // iso_heavy loves one alpha; motion loves spacers around a creator
  if (tactic?.id === "iso_heavy" && ball.highNeedCount === 1) fit += 5;
  if (tactic?.id === "iso_heavy" && ball.highNeedCount >= 2) fit -= 8;
  if (
    (tactic?.id === "motion" ||
      tactic?.id === "pace_space" ||
      tactic?.id === "smallball" ||
      tactic?.id === "five_out") &&
    ball.spacerCount >= 2 &&
    ball.highNeedCount <= 1
  ) {
    fit += 4;
  }
  if (tactic?.id === "motion" || tactic?.id === "pace_space") {
    const passers = players.filter(
      (p) => (p.pass || 50) >= 74 || (p.raw?.apg || 0) >= 5.5
    ).length;
    if (passers >= 2) fit += 6;
    else if (passers < 1) fit -= 5;
  }
  if ((tactic?.id === "pnr_spam" || tactic?.id === "horns") && ball.highNeedCount <= 2) fit += 3;
  if (
    tactic?.id === "post_up" ||
    tactic?.id === "twin_towers" ||
    tactic?.id === "paint_attack" ||
    tactic?.id === "crash_boards" ||
    tactic?.id === "second_chance"
  ) {
    const bigs = players.filter((p) => ["C", "PF"].includes(p.playPos || p.pos)).length;
    if (bigs >= 2) fit += 5;
    else if (bigs >= 1) fit += 2;
    if (ball.spacerCount >= 3 && tactic?.id === "twin_towers") fit -= 3;
  }
  if (tactic?.id === "switch_all" || tactic?.id === "zone_drop") fit += 2;
  if (tactic?.id === "freestyle" && ball.highNeedCount >= 2) fit -= 2;

  // 高薪低能在对口体系下抬适配；错体系拖累。妖人贡献稳定小幅加成。
  const sysFits = players.map((p) => systemFitScore(p, coach, tactic));
  const avgSys = avg(sysFits);
  fit += (avgSys - 50) * 0.12;
  const overpaid = players.filter((p) => p.valueArchetype === "overpaid");
  if (overpaid.length) {
    const oFit = avg(overpaid.map((p) => systemFitScore(p, coach, tactic)));
    if (oFit >= 70) fit += 5;
    else if (oFit <= 38) fit -= 6;
  }
  const bargains = players.filter((p) => p.valueArchetype === "bargain");
  if (bargains.length >= 2) fit += 3;

  // Coach buff subtle
  if (coach?.buffs) fit += ((coach.buffs.offense || 0) + (coach.buffs.defense || 0)) * 0.15;

  return clamp(Math.round(fit), 20, 96);
}

/** Expose ball-sharing note for UI (setup / live meters). */
export function lineupBallNote(players, { primaryId = null } = {}) {
  return ballSharingFit(players, { primaryId }).note || "";
}

export function personalityOnPlay(player, teamChem, onCourt = null, ctx = {}) {
  let mult = 1;
  const per = player.personality || {};
  if (per.ego > 80 && teamChem < 50) mult *= 0.92;
  if (per.team > 80) mult *= 1.03;
  if (per.fiery > 85) mult *= Math.random() < 0.15 ? 1.08 : 0.97;
  if (per.calm > 85) mult *= 1.02;
  // 妖人：多数体系都好用；高薪低能：对口教练/战术可打出身价
  mult *= hiddenPlayFactor(player, { coach: ctx.coach, tactic: ctx.tactic });
  if (onCourt) mult *= ballRolePlayFactor(player, onCourt, { primaryId: ctx.primaryId || null });
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
