/**
 * Team colours for the generated avatars. Colours only — no logos, no wordmarks.
 *
 * Keyed by the roster's team code (64 of them, including defunct and renamed
 * franchises). A relocated or renamed team uses its franchise's colours, except a
 * few eras whose look is far from the franchise's today (SEA, CHH, NJN).
 * NEUTRAL_TEAMS get the neutral palette: the roster's "NBA" code is a mid-season combined
 * row, and BLB / INO / WSC are 1950s teams that folded without a successor.
 */

const pair = (primary, secondary) => ({ primary, secondary });

const HAWKS = pair("#C8102E", "#FDB927");
const CELTICS = pair("#007A33", "#F2EDE1");
const NETS = pair("#1B1B1B", "#E8E8E8");
const BOBCATS = pair("#1D4F91", "#F26C22");
const HORNETS = pair("#00788C", "#2E1A6B");
const BULLS = pair("#CE1141", "#F4F4F4");
const CAVS = pair("#6F263D", "#FDBB30");
const MAVS = pair("#00538C", "#B8C4CA");
const NUGGETS = pair("#0E2240", "#FEC524");
const PISTONS = pair("#1D428A", "#C8102E");
const WARRIORS = pair("#1D428A", "#FFC72C");
const ROCKETS = pair("#CE1141", "#C4CED4");
const PACERS = pair("#002D62", "#FDBB30");
const CLIPPERS = pair("#C8102E", "#1D428A");
const LAKERS = pair("#552583", "#FDB927");
const GRIZZLIES = pair("#5D76A9", "#12173F");
const HEAT = pair("#98002E", "#F9A01B");
const BUCKS = pair("#00471B", "#EEE1C6");
const TIMBERWOLVES = pair("#0C2340", "#78BE20");
const PELICANS = pair("#0C2340", "#C8102E");
const KNICKS = pair("#006BB6", "#F58426");
const THUNDER = pair("#007AC1", "#EF3B24");
const SONICS = pair("#00653A", "#FFC200");
const MAGIC = pair("#0077C0", "#C4CED4");
const SIXERS = pair("#006BB6", "#DB1440"); // a shade deeper than the brand red so white initials pass AA
const SUNS = pair("#1D1160", "#E56020");
const BLAZERS = pair("#E03A3E", "#1A1A1A");
const KINGS = pair("#5A2D81", "#C4CED4");
const SPURS = pair("#2B2B2B", "#C4CED4");
const RAPTORS = pair("#CE1141", "#1A1A1A");
const JAZZ = pair("#002B5C", "#F9A01B");
const WIZARDS = pair("#002B5C", "#E31837");
const GRIZZLIES_VAN = pair("#00B2A9", "#6F263D");

export const NEUTRAL_COLORS = pair("#1A3A2A", "#F3EFE4");
export const NEUTRAL_TEAMS = ["NBA", "BLB", "INO", "WSC"];

export const TEAM_COLORS = {
  ATL: HAWKS, MLH: HAWKS, STL: HAWKS, TRI: HAWKS,
  BOS: CELTICS,
  BRK: NETS, NYN: NETS,
  NJN: pair("#002A60", "#CD1041"),
  CHA: BOBCATS, CHR: BOBCATS,
  CHH: HORNETS, CHO: HORNETS,
  CHI: BULLS,
  CLE: CAVS,
  DAL: MAVS,
  DEN: NUGGETS,
  DET: PISTONS, FTW: PISTONS,
  GSW: WARRIORS, PHW: WARRIORS, SFW: WARRIORS,
  HOU: ROCKETS, SDR: ROCKETS,
  IND: PACERS,
  LAC: CLIPPERS, BUF: CLIPPERS, SDC: CLIPPERS,
  LAL: LAKERS, MNL: LAKERS,
  MEM: GRIZZLIES, VAN: GRIZZLIES_VAN,
  MIA: HEAT,
  MIL: BUCKS,
  MIN: TIMBERWOLVES,
  NOP: PELICANS, NOH: PELICANS, NOK: PELICANS,
  NYK: KNICKS,
  OKC: THUNDER,
  SEA: SONICS,
  ORL: MAGIC,
  PHI: SIXERS, SYR: SIXERS,
  PHO: SUNS,
  POR: BLAZERS,
  SAC: KINGS, CIN: KINGS, ROC: KINGS, KCK: KINGS, KCO: KINGS,
  SAS: SPURS,
  TOR: RAPTORS,
  UTA: JAZZ, NOJ: JAZZ,
  WAS: WIZARDS, WSB: WIZARDS, BAL: WIZARDS, CAP: WIZARDS, CHP: WIZARDS, CHZ: WIZARDS,
};

export function teamColors(code) {
  return TEAM_COLORS[code] || NEUTRAL_COLORS;
}
