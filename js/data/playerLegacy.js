/**
 * Real-basketball "name" badges for player cards -- a presentation-only layer, separate from
 * `hiddenTier` (which drives game-balance math in intangibles.js/skills.js and must stay untouched).
 *
 * The old `rarityLabel(ovr)` in account.js only looked at OVR, so a hot Paul George season (90+ OVR)
 * showed the same "超巨" tag as a Kobe/LeBron/Duncan peak -- OVR tells you how good a card plays,
 * not how the real league remembered the player. This module adds a second axis: real reputation.
 *
 * Priority (a card gets exactly one badge, the most exclusive it qualifies for):
 *   1. Legendary  -- a specific, stand-alone iconic season (hand-curated LEGENDARY_SEASONS below),
 *      OR any season >= "star" production from a player on the NBA 75th Anniversary Team (reusing
 *      customPool.js's curated NBA_TOP10/TOP50/75_EXTRA lists instead of re-curating a 4th list).
 *      Only the hand-curated seasons get the team-colored card background -- NBA75-fallback legends
 *      still show the "传奇" text, just without the special paint job.
 *   2. Superstar  -- era-defining, MVP-level, multi-year dominance (CAREER_SUPERSTAR_BREFS), but
 *      gated on that *season* actually being good (>= "star" hiddenTier) so a legend's rookie-year
 *      or washed-up-decline card doesn't falsely wear the crown.
 *   3. All-Star / Star / Go-To Guy -- generic buckets straight off the existing hiddenTier the
 *      season already computed (allstar/superstar-tier production -> All-Star, star-tier -> Star,
 *      starter-tier -> Go-To Guy), for the thousands of cards with no curated entry.
 *   4. Everyone else (and any card whose identity checks all miss) falls back to the original
 *      pure-OVR bands, renamed slightly for vocabulary consistency with tier 2 ("超巨" -> "超级球星").
 *      This keeps merged/starred-up role-player cards still escalating through exciting tags.
 */

// NOTE: customPool.js's NBA_75_EXTRA_BREF is a *pricing* floor for the custom-mode draft pool
// (deliberately generous -- it includes Booker, Tatum, Ja Morant, even Jaylen Brown so the
// custom-draft fantasy mode has enough "good modern names" at a 3-coin floor). It is NOT an
// accurate register of the real NBA 75th Anniversary Team, so it must not feed this module's
// "is this player a real, formally recognized legend" check -- that caused Booker and Westbrook
// to wrongly show Legendary during testing. NBA_TOP10_BREF + NBA_TOP50_BREF are the real, fixed,
// historically accurate 1996 NBA 50 Greatest Players list (plus the top 10 subset) -- genuinely
// legendary and safe to reuse here.
import { NBA_TOP10_BREF, NBA_TOP50_BREF } from "./customPool.js";
import { teamColors } from "./teamColors.js";

/**
 * Hand-picked, stand-alone iconic seasons -- the kind of year that gets its own documentary.
 * bref -> array of season years (the roster's "ending year" convention, e.g. the 1995-96 Bulls
 * season is 1996). Keep this curated and small; it is not meant to cover every great season a
 * legend ever had, only the ones commonly recognized as THE defining year.
 */
export const LEGENDARY_SEASONS = {
  jordami01: [1991, 1996, 1998], // first title breakthrough / 72-10 / "Last Dance" repeat-three-peat
  bryanko01: [2006, 2008, 2010], // 81-point season / MVP / back-to-back champion
  jamesle01: [2012, 2013, 2016], // first Heat title / repeat / the 3-1 Cavs comeback
  duncati01: [2003], // two-way Finals MVP peak
  onealsh01: [2000], // unanimous MVP, start of the three-peat
  johnsma02: [1987], // Showtime peak, junior-skyhook Finals
  birdla01: [1986], // peak Celtics title run
  olajuha01: [1993, 1994], // back-to-back MVP/DPOY, back-to-back titles
  abdulka01: [1971, 1977], // Bucks title peak / Lakers MVP peak
  chambwi01: [1962], // 100-point game season
  russebi01: [1964], // dynasty-anchor peak year
  nowitdi01: [2011], // Mavs title run against the Heat superteam
  garneke01: [2004], // MVP season with Minnesota
  curryst01: [2016], // unanimous MVP, 73-9
  duranke01: [2014], // MVP season and speech, OKC peak
  antetgi01: [2021], // Finals MVP, 50-point Game 6
  jokicni01: [2023], // Finals MVP, Nuggets' first title
  iversal01: [2001], // MVP, Sixers' Finals run against the Lakers dynasty
  wadedw01: [2006], // Finals MVP heroics for the Heat
  ervinju01: [1983], // "Fo-Fo-Fo" Sixers title
  westbru01: [2017], // first 82-game triple-double average since Oscar Robertson in 1962
  rosede01: [2011], // youngest MVP ever
  nashst01: [2005, 2006], // back-to-back MVP, Seven Seconds or Less Suns
};

/**
 * Era-defining, multi-year dominant careers (MVP-caliber, not a single great season). Still gated
 * on the season being >= "star" production (see playerLegacyBadge), so this is a floor on WHICH of
 * their seasons count, not a blanket stamp on every card they ever had.
 */
export const CAREER_SUPERSTAR_BREFS = new Set([
  "jordami01",
  "bryanko01",
  "jamesle01",
  "duncati01",
  "nowitdi01",
  "onealsh01",
  "johnsma02",
  "birdla01",
  "olajuha01",
  "abdulka01",
  "wadedw01",
  "garneke01",
  "curryst01",
  "duranke01",
  "antetgi01",
  "jokicni01",
  "embiijo01",
  "hardeja01",
  "doncilu01",
  "barklch01",
  "robinda01",
  "iversal01",
  "ervinju01",
  "leonaka01",
]);

/** hiddenTier (players.js's seasonToCard) -> a 0-4 rank for this module's own gating. Deliberately
 * NOT reusing hiddenTier's string values as display text -- that vocabulary belongs to the balance
 * layer, this module owns its own player-facing words. */
const BASE_RANK = { starter: 1, star: 2, allstar: 3, superstar: 4, hof: 4, nba50: 4 };

function isNba75Legend(bref) {
  return bref in NBA_TOP10_BREF || bref in NBA_TOP50_BREF;
}

function iconicCardStyle(teamCode) {
  const { primary, secondary } = teamColors(teamCode);
  return `background: linear-gradient(135deg, ${primary} 0%, ${primary}cc 55%, ${secondary}40 100%); border-color: ${secondary};`;
}

/** The original OVR-only bands, renamed "超巨" -> "超级球星" so the fallback path and the
 * identity-driven tiers above share one vocabulary. Used whenever no curated/hiddenTier match
 * applies -- almost all of the roster's 23k+ role-player cards, plus merged/starred-up cards
 * whose OVR climbed past a legend's own curated floor. */
function legacyOvrBadge(ovr) {
  const o = Number(ovr) || 0;
  if (o >= 100) return { label: "满值", labelEn: "Maxed", cls: "myth", cardStyle: null };
  if (o >= 96) return { label: "神话", labelEn: "Mythic", cls: "myth", cardStyle: null };
  if (o >= 93) return { label: "传奇", labelEn: "Legendary", cls: "legend", cardStyle: null };
  if (o >= 90) return { label: "超级球星", labelEn: "Superstar", cls: "super", cardStyle: null };
  if (o >= 85) return { label: "全明星", labelEn: "All-Star", cls: "allstar", cardStyle: null };
  if (o >= 80) return { label: "先发", labelEn: "Starter", cls: "", cardStyle: null };
  if (o >= 74) return { label: "轮换", labelEn: "Rotation", cls: "", cardStyle: null };
  if (o >= 68) return { label: "角色", labelEn: "Role Player", cls: "", cardStyle: null };
  return { label: "", labelEn: "", cls: "", cardStyle: null };
}

/**
 * The one function callers should use. `card` needs `.bref`, `.season`, `.team`, `.hiddenTier`
 * (all present on every card from seasonToCard); `ovr` is passed in since every call site already
 * computes it via overall(card) for its own display anyway.
 *
 * The NBA50/superstar fallbacks require rank >= 3 (an All-Star-caliber *season*, not just "starter"
 * or "star" production) -- otherwise a legend's rookie year or decline season falsely inherits the
 * badge just from their name being on a list. Garnett's raw-rookie 1996 season (rank 1) correctly
 * stays "当家球星" even though 2004-MVP Garnett is a curated LEGENDARY_SEASONS entry.
 */
export function playerLegacyBadge(card, ovr) {
  const bref = card?.bref;
  const year = card?.season;
  const rank = BASE_RANK[card?.hiddenTier] || 0;

  if (bref && LEGENDARY_SEASONS[bref]?.includes(year)) {
    return { label: "传奇", labelEn: "Legendary", cls: "legend", cardStyle: iconicCardStyle(card.team) };
  }
  if (bref && rank >= 3 && isNba75Legend(bref)) {
    return { label: "传奇", labelEn: "Legendary", cls: "legend", cardStyle: null };
  }
  if (bref && rank >= 3 && CAREER_SUPERSTAR_BREFS.has(bref)) {
    return { label: "超级球星", labelEn: "Superstar", cls: "super", cardStyle: null };
  }
  if (rank >= 3) return { label: "全明星", labelEn: "All-Star", cls: "allstar", cardStyle: null };
  if (rank === 2) return { label: "球星", labelEn: "Star", cls: "star", cardStyle: null };
  if (rank === 1) return { label: "当家球星", labelEn: "Go-To Guy", cls: "goto", cardStyle: null };
  return legacyOvrBadge(ovr);
}
