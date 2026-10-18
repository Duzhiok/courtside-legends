/**
 * 32-team NBA league: original 30 + Seattle SuperSonics + Las Vegas (player-named).
 * Conferences balanced 16 / 16 for clean playoff brackets.
 */

import { FRANCHISES } from "./franchises.js";

/** East (16) — Las Vegas expansion joins East. */
export const EAST_IDS = [
  "ATL",
  "BOS",
  "BKN",
  "CHA",
  "CHI",
  "CLE",
  "DET",
  "IND",
  "LAS",
  "MIA",
  "MIL",
  "NYK",
  "ORL",
  "PHI",
  "TOR",
  "WAS",
];

/** West (16) — SuperSonics return. */
export const WEST_IDS = [
  "DAL",
  "DEN",
  "GSW",
  "HOU",
  "LAC",
  "LAL",
  "MEM",
  "MIN",
  "NOP",
  "OKC",
  "PHO",
  "POR",
  "SAC",
  "SAS",
  "SEA",
  "UTA",
];

export const LEAGUE_TEAM_META = {
  LAS: {
    id: "LAS",
    name: "拉斯维加斯",
    conf: "East",
    expansion: true,
    renameable: true,
    defaultDisplayName: "拉斯维加斯 ***",
    aliases: ["LAS", "LV"],
  },
  SEA: {
    id: "SEA",
    name: "超音速",
    conf: "West",
    expansion: true,
    renameable: false,
    defaultDisplayName: "西雅图超音速",
    aliases: ["SEA"],
  },
};

export function allLeagueTeamIds() {
  return [...EAST_IDS, ...WEST_IDS];
}

export function conferenceOf(teamId) {
  if (EAST_IDS.includes(teamId)) return "East";
  if (WEST_IDS.includes(teamId)) return "West";
  return null;
}

export function leagueTeamLabel(teamId, customNames = {}) {
  if (customNames[teamId]) return customNames[teamId];
  const meta = LEAGUE_TEAM_META[teamId];
  if (meta) return meta.defaultDisplayName || meta.name;
  const f = FRANCHISES.find((x) => x.id === teamId);
  return f?.name || teamId;
}

/** Franchise-style entry for legend/history pulls (SEA split from OKC). */
export function leagueFranchiseRecord(teamId) {
  const meta = LEAGUE_TEAM_META[teamId];
  if (meta) return { id: meta.id, name: meta.name, aliases: meta.aliases };
  return FRANCHISES.find((f) => f.id === teamId) || null;
}
