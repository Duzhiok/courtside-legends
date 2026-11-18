/**
 * B61: team builders for the Gold Challenge brackets, split out of app.js. Pure data -> team objects (no DOM, no
 * `state`, no saves): they only read the player/coach pools and the `used` set the caller passes in, and draw gold
 * and coaches through rand() (js/core/rng.js): with no source injected that is Math.random, so default play is
 * unchanged -- and, living outside app.js, these builders can now be replayed with a fixed seed.
 */
import { PLAYERS, overall, clonePlayer } from "../data/players.js";
import { COACHES, ensureTeamStaff } from "../data/coaches.js";
import { playersForFranchise } from "../data/franchises.js";
import { autoFillTeam } from "../engine/draft.js";
import { buildCpuTeamForYear } from "../engine/season.js";
import { shuffle } from "../core/seededRandom.js";
import { rand } from "../core/rng.js";

/** Best unique-bref cards who ever suited up for a franchise. */
function buildFranchiseRoster(franchise, used, n = 10, power = 0) {
  const byBref = new Map();
  for (const p of playersForFranchise(PLAYERS, franchise)) {
    if (used.has(p.id)) continue;
    const prev = byBref.get(p.bref);
    if (!prev || overall(p) > overall(prev)) byBref.set(p.bref, p);
  }
  let picks = [...byBref.values()].sort((a, b) => overall(b) - overall(a));
  if (power > 0 && picks.length > n) {
    // Slightly deeper pool then keep top n after shuffle of top band
    const band = picks.slice(0, Math.min(picks.length, n + power * 3));
    picks = shuffle(band).sort((a, b) => overall(b) - overall(a));
  }
  picks = picks.slice(0, n).map((p) => clonePlayer(p));
  for (const p of picks) used.add(p.id);
  if (picks.length < n) {
    const fill = autoFillTeam(franchise.name, n - picks.length, { excludeIds: used, power });
    for (const p of fill.players) {
      if (picks.length >= n) break;
      picks.push(p);
      used.add(p.id);
    }
  }
  return picks;
}

const CHALLENGER_NAMES = [
  "星火联队",
  "黑翼军",
  "银狼",
  "赤焰",
  "北境游侠",
  "湾区海盗",
  "高原猎鹰",
  "港口铁卫",
  "沙漠蝎",
  "雾都影",
  "雷鸣骑兵",
  "寒霜",
  "翡翠城",
  "铜锤",
  "夜鹰",
  "白浪",
  "赤兔",
  "青锋",
  "岚队",
  "潮汐",
  "磐石",
  "流星",
  "苍穹",
  "金戈",
  "玄铁",
  "飞羽",
  "破晓",
  "残阳",
  "孤狼",
  "群鸦",
  "猎手",
];

export function makeFranchiseCareerTeam(franchise, { used, isYou = false, power = 0, index = 0 } = {}) {
  const name = isYou ? `你的${franchise.name}` : franchise.name;
  const players = buildFranchiseRoster(franchise, used, isYou ? 8 : 9 + Math.min(2, power), power);
  const starters = COACHES.filter((c) =>
    ["bench", "water_cooler", "undrafted_gleague", "starter"].includes(c.hiddenTier || "")
  );
  const coach = isYou
    ? structuredClone(starters[Math.floor(rand() * starters.length)] || COACHES[0])
    : structuredClone(
        COACHES[Math.floor(rand() * COACHES.length)] || starters[0] || COACHES[0]
      );
  const team = {
    name,
    franchiseId: franchise.id,
    players,
    coach,
    assistant: null,
    gold: isYou ? 600 : 260 + Math.floor(rand() * 140) + power * 40,
    isCpu: !isYou,
    bracketId: isYou ? "you" : `cpu-${franchise.id}-${index}`,
    losses: 0,
  };
  ensureTeamStaff(team, { preferStarter: isYou });
  return team;
}

/** 金币晋级赛：非历史绑定的随机联队（越往后升级越狠） */
export function makeRandomCareerTeam({ used, isYou = false, power = 0, index = 0, name = null } = {}) {
  const label =
    name ||
    (isYou
      ? "你的联队"
      : CHALLENGER_NAMES[index % CHALLENGER_NAMES.length] +
        (index >= CHALLENGER_NAMES.length ? `·${index + 1}` : ""));
  const n = isYou ? 8 : 9 + Math.min(3, power);
  const fill = autoFillTeam(label, n, {
    excludeIds: used,
    power: power + (isYou ? 1 : 0),
  });
  for (const p of fill.players) used.add(p.id);
  if (fill.coach?.id) used.add(fill.coach.id);
  if (fill.assistant?.id) used.add(fill.assistant.id);
  const team = {
    name: label,
    franchiseId: null,
    players: fill.players,
    coach: fill.coach || null,
    assistant: fill.assistant || null,
    gold: isYou ? 600 : 240 + Math.floor(rand() * 160) + power * 55,
    isCpu: !isYou,
    bracketId: isYou ? "you" : `cpu-r${index}`,
    losses: 0,
  };
  ensureTeamStaff(team, { preferStarter: isYou });
  return team;
}

/** 用史实某年某队阵容做挑战对手 */
export function makeYearChallengeTeam(def, used, index, power = 2) {
  const meta = {
    id: def.teamId,
    bref: def.bref || def.teamId,
    name: def.name,
  };
  const built = buildCpuTeamForYear(def.year, meta, used);
  const team = {
    name: def.label || `${def.year} ${def.name}`,
    franchiseId: def.teamId,
    players: built.players || [],
    coach: built.coach || null,
    assistant: built.assistant || null,
    gold: 200 + power * 40,
    isCpu: true,
    bracketId: `cpu-${def.year}-${def.teamId}-${index}`,
    losses: 0,
    challengeYear: def.year,
  };
  ensureTeamStaff(team, { preferStarter: false });
  if (team.coach?.id) used.add(team.coach.id);
  if (team.assistant?.id) used.add(team.assistant.id);
  return team;
}
