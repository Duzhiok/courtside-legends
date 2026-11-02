/**
 * C4 of docs/CAREER_LIFE_ROADMAP.md: highlight nights and the market buzz they cause.
 *
 *   season.buzz = { [playerId]: number }     (lives on the season, so a new season starts cold)
 *
 * A highlight (30+ points, triple-double, 5+ blocks, 8+ threes) adds buzz; every team game the old
 * buzz cools by a fixed factor. The trade market reads it (`engine/tradeProposals.js`): a hot player
 * draws calls, and the club on the line pays a bit more than his ratings say. Aggregates only, no
 * game log. Pure: nothing here is mutated or saved.
 */
import {
  BUZZ_BONUS_PER_POINT, BUZZ_DECAY, BUZZ_GAME_CAP, BUZZ_HOT, BUZZ_MAX, BUZZ_MAX_BONUS,
  HIGHLIGHT_BLOCKS, HIGHLIGHT_SCORING, HIGHLIGHT_THREES, HIGHLIGHT_TRIPLE_DOUBLE,
} from "./balance.js";

const num = (value) => Number(value) || 0;
const round2 = (value) => Math.round(value * 100) / 100;
/** Junk in a save (NaN, negatives, strings) reads as "no buzz" instead of poisoning the maths. */
const clean = (value) => (Number.isFinite(value) && value > 0 ? Math.min(BUZZ_MAX, value) : 0);

/** The highlights one box-score line earns: `[{ id, value, points }]` (value is the figure to show). */
export function highlightTags(line) {
  if (!line) return [];
  const tags = [];
  const scoring = HIGHLIGHT_SCORING.find((tier) => num(line.pts) >= tier.min);
  if (scoring) tags.push({ id: scoring.id, value: num(line.pts), points: scoring.points });
  const { categories, min, points } = HIGHLIGHT_TRIPLE_DOUBLE;
  if (["pts", "reb", "ast", "stl", "blk"].filter((key) => num(line[key]) >= min).length >= categories) {
    tags.push({ id: "tripleDouble", value: null, points });
  }
  if (num(line.blk) >= HIGHLIGHT_BLOCKS.min) tags.push({ id: "blk5", value: num(line.blk), points: HIGHLIGHT_BLOCKS.points });
  if (num(line.tpm) >= HIGHLIGHT_THREES.min) tags.push({ id: "tpm8", value: num(line.tpm), points: HIGHLIGHT_THREES.points });
  return tags;
}

export const isHot = (buzz) => clean(buzz) >= BUZZ_HOT;
/** What the market adds to a player's value, in OVR. Nothing until he is hot: the market either has noticed him or it hasn't. */
export const buzzBonus = (buzz) => (isHot(buzz) ? round2(Math.min(BUZZ_MAX_BONUS, clean(buzz) * BUZZ_BONUS_PER_POINT)) : 0);
export const buzzOf = (season, playerId) => clean(season?.buzz?.[playerId]);

/**
 * A fingerprint of who is hot and how much. A cached offer list is only good while this is unchanged:
 * after a big night the offers must rise, and once he cools the old generous ones must go.
 */
export function buzzKey(season) {
  return Object.entries(season?.buzz || {})
    .filter(([, value]) => isHot(value))
    .map(([id, value]) => `${id}:${buzzBonus(value)}`)
    .sort()
    .join("|");
}

/**
 * Settle one team game.
 * @param buzz     `{ [playerId]: number }` as it was before this game (undefined for a career with none yet)
 * @param players  the user's live roster cards -- everyone cools every game, played or not
 * @param lines    this game's box-score lines for the user's side
 * @returns { buzz, highlights: [{ id, name, tags, gain }], hot: [{ id, name, buzz }] }
 *   `highlights` is tonight's; `hot` is everyone at or above BUZZ_HOT afterwards, hottest first.
 */
export function settleBuzz({ buzz = {}, players = [], lines = [] } = {}) {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const next = {};
  const highlights = [];
  const hot = [];
  for (const player of players) {
    const line = lineById.get(player.id);
    const tags = highlightTags(line);
    const gain = Math.min(BUZZ_GAME_CAP, tags.reduce((sum, tag) => sum + tag.points, 0));
    const value = round2(Math.min(BUZZ_MAX, clean(buzz?.[player.id]) * BUZZ_DECAY + gain));
    // A cold player is just noise in the save. (Players who left the roster are dropped here too.)
    if (value >= 0.05) next[player.id] = value;
    const name = line?.name || player.cardName || player.name;
    if (tags.length) highlights.push({ id: player.id, name, tags: tags.map(({ id, value: shown }) => ({ id, value: shown })), gain });
    if (isHot(value)) hot.push({ id: player.id, name, buzz: value });
  }
  // Biggest buzz first; on a tie the bigger scoring night leads (so the night's top scorer is never the one folded into "+N more").
  const scored = (entry) => Number(lineById.get(entry.id)?.pts) || 0;
  highlights.sort((a, b) => b.gain - a.gain || scored(b) - scored(a));
  hot.sort((a, b) => b.buzz - a.buzz);
  return { buzz: next, highlights, hot };
}
