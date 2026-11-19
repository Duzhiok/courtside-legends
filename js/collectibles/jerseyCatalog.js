/**
 * Jersey catalog: what a jersey IS (template), never who owns it (instance, see jerseyCollection.js).
 *
 * Release levels (the licensing boundary, decided in the design doc):
 *   original              original teams / art, safe to sell                          -> in the store
 *   historical_reference  real player / season / number as DATA only (unlicensed)     -> never sold, never claimed official
 *   story                 minted at runtime from a real game's evidence (an exchange) -> not for sale, a game story, not a signed relic
 *   licensed              rights cleared                                              -> may be sold (none yet)
 *
 * Numbers are never guessed: the roster data has no jersey numbers, so a template carries a number only when it was
 * entered by hand (`number`), otherwise `number: null` and the art shows none. `numberVerified` records whether a human
 * checked a hand-entered number against a historical source (reference entries start unverified).
 *
 * Prices are initial dev-playtest values, not final balance. Gold is the Lifestyle currency: nothing here changes a
 * rating, a shot or a result.
 */
import { endYearOf, eraForSeason, familyForSeason } from "./jerseyEras.js";
import { teamColors } from "../data/teamColors.js";

const base = (t) => ({
  numberVerified: true,
  licensed: false,
  variants: ["replica"],
  ...t,
  era: eraForSeason(t.season)?.id || null,
  family: familyForSeason(t.season),
});

/** Original fictional clubs: the MVP store. Colours are original, there are no logos and no real names. */
const ORIGINAL = [
  { id: "orig_tide_1962_11", teamName: { zh: "港湾潮汐", en: "Harbor Tide" }, season: "1961-62", number: "11", colors: { primary: "#1F4E79", secondary: "#F2E8CF", trim: "#F2E8CF" }, price: 150, rarity: "common" },
  { id: "orig_foundry_1974_7", teamName: { zh: "钢铁熔炉", en: "Iron Foundry" }, season: "1973-74", number: "7", colors: { primary: "#8C2F1B", secondary: "#222222", trim: "#E8C547" }, price: 180, rarity: "common" },
  { id: "orig_neon_1986_23", teamName: { zh: "霓虹海岸", en: "Neon Coast" }, season: "1985-86", number: "23", colors: { primary: "#6A2C91", secondary: "#2EC4B6", trim: "#FFFFFF" }, price: 220, rarity: "rare" },
  { id: "orig_summit_1989_8", teamName: { zh: "峰顶孤狼", en: "Summit Wolves" }, season: "1988-89", number: "8", colors: { primary: "#14532D", secondary: "#E5E7EB", trim: "#F59E0B" }, price: 220, rarity: "rare" },
  { id: "orig_tide_1996_33", teamName: { zh: "港湾潮汐", en: "Harbor Tide" }, season: "1995-96", number: "33", colors: { primary: "#B91C1C", secondary: "#111827", trim: "#FFFFFF" }, price: 300, rarity: "rare" },
  { id: "orig_foundry_2002_5", teamName: { zh: "钢铁熔炉", en: "Iron Foundry" }, season: "2001-02", number: "5", colors: { primary: "#1D3557", secondary: "#E9C46A", trim: "#FFFFFF" }, price: 300, rarity: "rare" },
  { id: "orig_neon_2014_30", teamName: { zh: "霓虹海岸", en: "Neon Coast" }, season: "2013-14", number: "30", colors: { primary: "#0F766E", secondary: "#FDE68A", trim: "#FFFFFF" }, price: 400, rarity: "epic" },
  { id: "orig_summit_2023_0", teamName: { zh: "峰顶孤狼", en: "Summit Wolves" }, season: "2022-23", number: "0", colors: { primary: "#111827", secondary: "#38BDF8", trim: "#F8FAFC" }, price: 400, rarity: "epic" },
].map((t) => base({ ...t, releaseLevel: "original", category: "original", playerName: null, label: { zh: `${t.teamName.zh} ${t.season} #${t.number}`, en: `${t.teamName.en} ${t.season} #${t.number}` } }));

/**
 * Real players, seasons and numbers as REFERENCE DATA. Not sold, never presented as an official or signed product.
 * Numbers here are commonly documented but still `numberVerified: false` until checked against a source.
 */
const REFERENCE = [
  { id: "ref_jordan_1996_23", bref: "jordami01", playerName: "Michael Jordan", teamCode: "CHI", season: "1995-96", number: "23" },
  { id: "ref_kobe_2000_8", bref: "bryanko01", playerName: "Kobe Bryant", teamCode: "LAL", season: "1999-00", number: "8" },
  { id: "ref_kobe_2010_24", bref: "bryanko01", playerName: "Kobe Bryant", teamCode: "LAL", season: "2009-10", number: "24" },
  { id: "ref_magic_1987_32", bref: "johnsma02", playerName: "Magic Johnson", teamCode: "LAL", season: "1986-87", number: "32" },
  { id: "ref_bird_1986_33", bref: "birdla01", playerName: "Larry Bird", teamCode: "BOS", season: "1985-86", number: "33" },
  { id: "ref_kareem_1980_33", bref: "abdulka01", playerName: "Kareem Abdul-Jabbar", teamCode: "LAL", season: "1979-80", number: "33" },
].map((t) =>
  base({
    ...t,
    releaseLevel: "historical_reference",
    category: "nba",
    numberVerified: false,
    colors: { ...teamColors(t.teamCode), trim: "#FFFFFF" },
    variants: ["replica", "signed", "exchange"],
    price: null,
  }),
);

/**
 * National teams are keyed by YEAR, not by a "Dream Team N" counter: only the 1992 team is strictly "the Dream Team",
 * and no unified official numbering of later teams exists. Nicknames are display text only. Rosters/numbers are
 * unverified reference data; only 1992 is entered so far (the rest is tracked in docs/implementation/JERSEY-COLLECTION.md).
 */
export const NATIONAL_TEAMS = Object.freeze({
  USA_1992: {
    id: "USA_1992", country: "USA", tournament: "olympics_1992", year: 1992, nickname: "Dream Team", verified: false,
    roster: [
      ["jordami01", "Michael Jordan", "9"], ["johnsma02", "Magic Johnson", "15"], ["birdla01", "Larry Bird", "10"],
      ["barklch01", "Charles Barkley", "4"], ["malonka01", "Karl Malone", "14"], ["stockjo01", "John Stockton", "12"],
      ["robinda01", "David Robinson", "13"], ["ewingpa01", "Patrick Ewing", "6"], ["pippesc01", "Scottie Pippen", "8"],
      ["mullich01", "Chris Mullin", "17"], ["drexlcl01", "Clyde Drexler", "5"], ["laettch01", "Christian Laettner", "7"],
    ],
  },
});

const NATIONAL = Object.values(NATIONAL_TEAMS).flatMap((team) =>
  team.roster.map(([bref, playerName, number]) =>
    base({
      id: `ref_${team.id.toLowerCase()}_${bref}`, bref, playerName, number, teamCode: team.id, season: String(team.year),
      releaseLevel: "historical_reference", category: "national", tournament: team.tournament, numberVerified: false,
      colors: { primary: "#FFFFFF", secondary: "#1D3F8A", trim: "#BF0A30" }, variants: ["replica", "signed"], price: null,
    }),
  ),
);

const ALL = Object.freeze([...ORIGINAL, ...REFERENCE, ...NATIONAL].map((t) => Object.freeze(t)));
const BY_ID = new Map(ALL.map((t) => [t.id, t]));

const SELLABLE_LEVELS = new Set(["original", "licensed"]);
/** A template may enter the public store only when its release level says it is cleared and it has a price. */
export const isForSale = (t) => !!t && SELLABLE_LEVELS.has(t.releaseLevel) && Number.isInteger(t.price) && t.price >= 0;

/**
 * Mint a story template (never sold): `kind` is how it was earned. Colours come from the real team code via
 * teamColors() (colours only); the number stays null because nothing in the data states it.
 */
function storyTemplate(kind, { bref, name, nameEn, team, year }) {
  if (!bref || !year) return null;
  return {
    id: `${kind}:${bref}:${year}`, releaseLevel: "story", category: kind, bref,
    playerName: name || nameEn || bref, playerNameEn: nameEn || name || bref, teamCode: team || null,
    season: Number(year), number: null, numberVerified: false, licensed: false, variants: [kind], price: null,
    colors: { ...teamColors(team), trim: "#FFFFFF" },
    era: eraForSeason(Number(year))?.id || null, family: familyForSeason(Number(year)),
  };
}

/** A jersey earned from a real game: an opponent's, swapped after the final whistle (jerseyExchange.js). */
export const exchangeTemplate = (args) => storyTemplate("exchange", args);

/** The Reborn player's OWN season jersey, redeemed with career fragments (js/reborn/fragments.js): one per season. */
export const legacyTemplate = (args) => storyTemplate("legacy", args);

/** One template by id (catalog entries only; story templates travel inside their own offer / instance). */
export const getJerseyTemplate = (id) => BY_ID.get(id) || null;

/** The raw catalog, filterable. `onSale: true` is the public store view. */
export function listJerseyCatalog({ era, category, family, bref, onSale } = {}) {
  return ALL.filter(
    (t) =>
      (!era || t.era === era) && (!category || t.category === category) && (!family || t.family === family) &&
      (!bref || t.bref === bref) && (onSale == null || isForSale(t) === onSale),
  );
}

/** Shop-catalog items (same shape as shopCatalog.js entries) for every template that may be sold. */
export function jerseyShopItems() {
  return listJerseyCatalog({ onSale: true }).map((t) => ({
    id: `jersey-${t.id}`, category: "jersey", kind: "cosmetic", price: t.price,
    zh: `${t.label?.zh || t.playerName} 复古球衣`, en: `${t.label?.en || t.playerName} Throwback Jersey`,
    descZh: `原创复古球衣（${t.season}，${t.family === "classic_short" ? "经典短裤款" : t.family === "retro_80s" ? "80 年代款" : t.family === "oversized_2000s" ? "宽松款" : "现代修身款"}）。只改外观，不加任何比赛属性。`,
    descEn: `An original throwback jersey (${t.season}). Looks only — no match attributes.`,
    effect: { type: "jersey", templateId: t.id },
  }));
}

export { endYearOf };
