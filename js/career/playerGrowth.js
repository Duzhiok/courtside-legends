/**
 * C2: player XP and in-season growth (docs/CAREER_LIFE_ROADMAP.md 2.2).
 *
 * Every game your players earn XP (minutes x how well they played x how young they are). Enough XP
 * is a level, and a level is +1 on one attribute -- small, capped, and never past what the player's
 * REAL later cards ever reached (plus a sliver for "you changed his timeline").
 *
 * Pure functions: nothing here touches a season or a save. `awardGrowth` takes the state and the
 * game's lines and hands back the new state + which attribute values changed; the caller applies it.
 * State is only `{ [bref]: { year, xp, levels, deltas } }` for players who earned something, so it
 * stays tiny (roadmap principle: store aggregates, not per-game logs).
 */
import {
  GROWTH_AGE_TABLE,
  GROWTH_CARRYOVER,
  GROWTH_CEILING_SLACK,
  GROWTH_PERF_BASE,
  GROWTH_PERF_MAX,
  GROWTH_PERF_MIN,
  GROWTH_PERF_PER_SCORE,
  GROWTH_XP_PER_LEVEL,
} from "./balance.js";
import { FOCUS_ATTRIBUTES, resolvedAge } from "../modes/playerDevelopment.js";

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const ATTRIBUTE_MAX = 99;

/** Row of GROWTH_AGE_TABLE for an age: XP speed and the season's level cap. */
export const ageRow = (age) => GROWTH_AGE_TABLE.find((row) => age <= row.maxAge);

/** XP one game is worth. `line` is a settled report line ({ min, score }). */
export function gameXp(line, age) {
  const minutes = Number(line?.min) || 0;
  if (minutes <= 0) return 0;
  const perf = clamp(
    GROWTH_PERF_BASE + (Number(line.score) || 0) * GROWTH_PERF_PER_SCORE,
    GROWTH_PERF_MIN,
    GROWTH_PERF_MAX,
  );
  return Math.round(minutes * perf * ageRow(age).xp);
}

/** The attributes a player trains: his development plan's focus, else the balanced trio. */
export const trainedAttributes = (plan) => FOCUS_ATTRIBUTES[plan?.focus] || FOCUS_ATTRIBUTES.balanced;

/**
 * Highest value `attribute` may reach this season. `base` is the value at the start of the season
 * (current minus what he has gained since). With a real career, the best that attribute ever was on
 * a card from this season onward, plus the slack; without one, only the 99 wall.
 */
export function attributeCeiling(player, attribute, base, ladder) {
  const season = Number(player?.season) || 0;
  const later = (ladder || [])
    .filter((card) => Number(card.season) >= season)
    .map((card) => Number(card[attribute]))
    .filter(Number.isFinite);
  if (!later.length) return ATTRIBUTE_MAX;
  return Math.min(ATTRIBUTE_MAX, Math.max(base, ...later) + GROWTH_CEILING_SLACK);
}

/**
 * Award one game's XP to your players.
 *
 * @param {object} args
 * @param {object} args.growth     current state (`career.management.growth`); never mutated
 * @param {object} args.plans      `career.management.developmentPlans` (picks which attributes train)
 * @param {number} args.year       the season's year; entries from other years are dropped
 * @param {Array}  args.players    the user roster (cards with `id`, `bref`, attributes)
 * @param {Array}  args.lines      `report.lines` of the settled game
 * @param {Function} [args.ladderOf]  bref -> that player's real card ladder (injected: keeps this pure)
 * @returns {{ growth: object, changes: Object<string, Object<string, number>>, entries: Array }}
 *   `changes[playerId]` = the new VALUES of the attributes that levelled; `entries` feeds the card.
 */
export function awardGrowth({ growth = {}, plans = {}, year, players = [], lines = [], ladderOf = () => [] }) {
  const next = {};
  for (const [bref, entry] of Object.entries(growth || {})) {
    if (entry?.year === year) next[bref] = { ...entry, deltas: { ...entry.deltas } };
  }
  const changes = {};
  const entries = [];

  for (const line of lines) {
    const player = players.find((candidate) => candidate.id === line.id);
    if (!player?.bref) continue;
    const age = resolvedAge(player);
    const row = ageRow(age);
    const gain = gameXp(line, age);
    if (gain <= 0) continue;

    const entry = next[player.bref] || { year, xp: 0, levels: 0, deltas: {} };
    const attributes = trainedAttributes(plans?.[player.bref]);
    const ladder = ladderOf(player.bref);
    const leveled = [];
    let xp = entry.xp + gain;
    let blocked = false;

    while (xp >= GROWTH_XP_PER_LEVEL && entry.levels < row.levels) {
      const start = entry.levels % attributes.length;
      const order = attributes.map((_, i) => attributes[(start + i) % attributes.length]);
      const pick = order.find((attribute) => {
        const value = Number(changes[player.id]?.[attribute] ?? player[attribute] ?? 50);
        const base = value - (entry.deltas[attribute] || 0);
        return value < attributeCeiling(player, attribute, base, ladder);
      });
      if (!pick) { blocked = true; break; }
      const from = Number(changes[player.id]?.[pick] ?? player[pick] ?? 50);
      changes[player.id] = { ...changes[player.id], [pick]: from + 1 };
      entry.deltas[pick] = (entry.deltas[pick] || 0) + 1;
      entry.levels += 1;
      xp -= GROWTH_XP_PER_LEVEL;
      leveled.push({ attribute: pick, from, to: from + 1 });
    }
    // Nothing left to buy (level cap or ceiling): the bar sits full instead of overflowing forever.
    const capped = blocked || entry.levels >= row.levels;
    entry.xp = capped ? Math.min(xp, GROWTH_XP_PER_LEVEL) : xp;
    next[player.bref] = entry;

    entries.push({
      id: line.id,
      name: line.name,
      xp: gain,
      total: entry.xp,
      progress: Math.min(1, entry.xp / GROWTH_XP_PER_LEVEL),
      levels: entry.levels,
      levelCap: row.levels,
      capped,
      leveled,
    });
  }

  entries.sort((a, b) => b.leveled.length - a.leveled.length || b.xp - a.xp);
  return { growth: next, changes, entries };
}

/**
 * What survives the rollover into next year's real card: GROWTH_CARRYOVER of each attribute gain
 * (rounded half up). Entries from any other year carry nothing -- they are stale.
 */
export function carriedDeltas(entry, year) {
  if (!entry || entry.year !== year) return {};
  const kept = {};
  for (const [attribute, delta] of Object.entries(entry.deltas || {})) {
    const amount = Math.round(delta * GROWTH_CARRYOVER);
    if (amount > 0) kept[attribute] = amount;
  }
  return kept;
}
