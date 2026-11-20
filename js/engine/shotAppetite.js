/**
 * B35: how much a player looks for his own shot. Ratings decide whether a shot goes in; this decides how often he takes
 * one. One yardstick for both the engine (who gets the ball, who gets the kick-out) and the recommended coach orders
 * (is he a scorer or a role player), so the two cannot disagree.
 *
 * The engine hands the ball out per possession, so the signal is the real season's shots PER 36 MINUTES (card.raw
 * fga/mpg), not per game: Mutombo 1995 took 7.7 shots in 37.8 min (7.3 per 36) yet his per-game numbers read like an
 * average scorer. Few games are pulled toward the league middle (Manute Bol 1995 played 5). Without real numbers
 * (custom / Reborn players) the card's shotTend stands in; with neither, neutral.
 */
const LEAGUE_FGA_PER_36 = 13;
const PRIOR_GAMES = 10;
const SHOT_TEND_NEUTRAL = 60;

/** True when the card carries a real season's minutes and shots (custom / Reborn players do not). */
export function hasRealShotVolume(p) {
  return (Number(p?.raw?.mpg) || 0) >= 6 && Number.isFinite(Number(p?.raw?.fga));
}

/** Real shot volume relative to the league middle: 1 = ~13 shots per 36, 0.56 = Mutombo 1995, 1.4 = Olajuwon. */
export function shotAppetiteRatio(p) {
  if (hasRealShotVolume(p)) {
    const raw = p.raw;
    const mpg = Number(raw.mpg);
    const fga = Number(raw.fga);
    const gp = Math.max(0, Number(raw.gp) || 0);
    const per36 = (fga / mpg) * 36;
    return (per36 * gp + LEAGUE_FGA_PER_36 * PRIOR_GAMES) / (gp + PRIOR_GAMES) / LEAGUE_FGA_PER_36;
  }
  return Number.isFinite(p?.shotTend) ? p.shotTend / SHOT_TEND_NEUTRAL : 1;
}

/**
 * Touch weight multiplier: below the league middle it falls linearly (Mutombo 1995 -> ~0.56), above it stays 1.
 * Rebuilt on the calibrated sim (Phases A-F), measured with scripts/measure/reb-ast-pairing.mjs (6 eras, paired seeds):
 * linear brings the real low-volume third from 1.14x its real FGA/36 to 1.00x (per-player corr 0.50 -> 0.62) with the
 * high-volume third at 1.06x. The old square overshot here (low third 0.86x, top third 1.12x shots / 1.18x points:
 * the touches it took from role players piled onto stars). Rewarding high volume too did the same.
 */
export function shotAppetite(p) {
  const ratio = Math.max(0.2, shotAppetiteRatio(p));
  return Math.min(1, ratio);
}
