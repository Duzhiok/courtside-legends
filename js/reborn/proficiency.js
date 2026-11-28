/**
 * Skills M2: signature-move PROFICIENCY. Five levels per move, earned only by real use in real games (the engine's own per-game counts),
 * settled once per game, capped per game, with a hard top level. Pure rules, no DOM, no dice.
 *
 * - XP per game per move = 2 per fired use + 1 per make, capped at XP_GAME_CAP (= the most one game can honestly produce: 2 uses and
 *   2 makes under the shared budget). Refused attempts never count (the engine did not fire them).
 * - Thresholds come from measured pace (scripts/measure/proficiency-pace.mjs, 16 real seasons): a regular who carries ONE move uses it
 *   ~1.84 times and makes ~1.12 a game, ~390 XP a season: Lv2 in ~21 games, Lv3 in ~0.75 season, Lv4 in ~1.8, Lv5 in ~3.8. Spread over
 *   three moves the shared budget makes each one ~3x slower: specialising is the choice.
 * - A level changes ONE thing, and only slightly: the move's make boost, +PROFICIENCY_BOOST_PER_LEVEL per level above 1 (Lv5 = +0.04 on a
 *   move that already adds +0.22..0.30). It never changes the budget (still 2 a game), the stamina, or the rest of the engine.
 * - No retroactive XP: an existing run starts every move at Lv1 / 0 XP.
 */
import { PROFICIENCY_BOOST_PER_LEVEL } from "../data/skills.js";

export { PROFICIENCY_BOOST_PER_LEVEL };

export const PROFICIENCY_LEVELS = Object.freeze([
  { level: 1, xp: 0, zh: "初学", en: "Novice" },
  { level: 2, xp: 100, zh: "熟练", en: "Proficient" },
  { level: 3, xp: 300, zh: "精通", en: "Expert" },
  { level: 4, xp: 700, zh: "大师", en: "Master" },
  { level: 5, xp: 1500, zh: "传奇", en: "Legend" },
]);
export const MAX_LEVEL = PROFICIENCY_LEVELS.length;
export const MAX_XP = PROFICIENCY_LEVELS[MAX_LEVEL - 1].xp;
export const XP_PER_USE = 2;
export const XP_PER_MAKE = 1;
export const XP_GAME_CAP = 6;

/** XP one game gives one move from the engine's counts `{ u, m }`: bounded, makes never above uses, garbage in -> 0. */
export function gameXp(counts) {
  const u = Number.isFinite(counts?.u) ? Math.max(0, Math.floor(counts.u)) : 0;
  const m = Number.isFinite(counts?.m) ? Math.max(0, Math.min(Math.floor(counts.m), u)) : 0;
  return Math.min(XP_GAME_CAP, XP_PER_USE * u + XP_PER_MAKE * m);
}

export const clampXp = (xp) => (Number.isFinite(xp) ? Math.max(0, Math.min(MAX_XP, Math.floor(xp))) : 0);

/** The level (1..5) a total XP is worth. */
export function levelOf(xp) {
  const x = clampXp(xp);
  let level = 1;
  for (const row of PROFICIENCY_LEVELS) if (x >= row.xp) level = row.level;
  return level;
}

/** Everything the screen needs about one move's proficiency. `next` is null at the top level. */
export function progressOf(xp) {
  const x = clampXp(xp);
  const level = levelOf(x);
  const row = PROFICIENCY_LEVELS[level - 1];
  const next = level < MAX_LEVEL ? PROFICIENCY_LEVELS[level] : null;
  return { level, xp: x, name: row, next, toNext: next ? next.xp - x : 0, maxed: !next, boost: boostOf(level) };
}

/** The make-boost a level adds to the move (0 at Lv1). The ONLY thing a level changes. */
export const boostOf = (level) => Math.round(PROFICIENCY_BOOST_PER_LEVEL * (Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1)) - 1) * 1000) / 1000;

/** Add one settled game to an `xp` map. Returns a new map; moves that did nothing keep their entry untouched. */
export function addGameXp(xp, sig) {
  const out = { ...(xp || {}) };
  for (const [id, counts] of Object.entries(sig && typeof sig === "object" ? sig : {})) {
    const gained = gameXp(counts);
    if (gained > 0) out[id] = clampXp((out[id] || 0) + gained);
  }
  return out;
}

/** `{ move: level }` for the moves above Lv1 (what the engine reads from his card; empty when nothing has leveled). */
export function levelsMap(xp, owned) {
  const out = {};
  for (const id of owned) {
    const level = levelOf(xp?.[id]);
    if (level > 1) out[id] = level;
  }
  return out;
}
