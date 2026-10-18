/**
 * Legend identity metadata: NBA id, peak window, twilight floors.
 * BRef/NBA CDNs usually ship ONE career headshot (often young peak) —
 * twilight season cards must not be confused with that photo's era/jersey.
 */

export const TEAM_NAMES_ZH = {
  ATL: "老鹰",
  BOS: "凯尔特人",
  BKN: "篮网",
  NJN: "篮网",
  CHA: "黄蜂",
  CHI: "公牛",
  CLE: "骑士",
  DAL: "独行侠",
  DEN: "掘金",
  DET: "活塞",
  GSW: "勇士",
  HOU: "火箭",
  IND: "步行者",
  LAC: "快船",
  LAL: "湖人",
  MEM: "灰熊",
  MIA: "热火",
  MIL: "雄鹿",
  MIN: "森林狼",
  NOP: "鹈鹕",
  NOH: "黄蜂",
  NYK: "尼克斯",
  OKC: "雷霆",
  SEA: "超音速",
  LAS: "拉斯维加斯",
  LV: "拉斯维加斯",
  ORL: "魔术",
  PHI: "76人",
  PHO: "太阳",
  PHX: "太阳",
  POR: "开拓者",
  SAC: "国王",
  SAS: "马刺",
  TOR: "猛龙",
  UTA: "爵士",
  WAS: "奇才",
  WSB: "子弹士",
};

/** Known legends — twilight seasons keep skill floors; peak seasons use anchors. */
export const LEGEND_META = {
  mcgratr01: {
    nbaId: 1503,
    name: "Tracy McGrady",
    peakSeasons: [2001, 2002, 2003, 2004, 2005],
    twilightFrom: 2010,
    twilightOvrFloor: 72,
    twilightAttrFloor: {
      scoring: 72,
      mid: 80,
      three: 74,
      paint: 70,
      iq: 76,
      clutch: 78,
      pass: 68,
      speed: 64,
    },
  },
  jordami01: {
    nbaId: 893,
    peakSeasons: [1988, 1989, 1990, 1991, 1992, 1993, 1996, 1997, 1998],
    twilightFrom: 2002,
    twilightOvrFloor: 78,
    twilightAttrFloor: { scoring: 80, mid: 88, clutch: 90, iq: 88, defense: 70 },
  },
  ivorsal01: {
    nbaId: 947,
    peakSeasons: [2001, 2002, 2003, 2004, 2005],
    twilightFrom: 2009,
    twilightOvrFloor: 70,
    twilightAttrFloor: { scoring: 74, speed: 78, clutch: 80, ankle: 80 },
  },
  onealsh01: {
    nbaId: 406,
    peakSeasons: [1999, 2000, 2001, 2002, 2003, 2004],
    twilightFrom: 2009,
    twilightOvrFloor: 74,
    twilightAttrFloor: { paint: 88, strength: 92, scoring: 72 },
  },
  bryanko01: {
    nbaId: 977,
    peakSeasons: [2006, 2007, 2008, 2009, 2010],
    twilightFrom: 2014,
    twilightOvrFloor: 76,
    twilightAttrFloor: { scoring: 82, mid: 88, clutch: 90 },
  },
  garneke01: {
    nbaId: 708,
    peakSeasons: [2002, 2003, 2004, 2005, 2008],
    twilightFrom: 2014,
    twilightOvrFloor: 72,
    twilightAttrFloor: { defense: 82, mid: 78, iq: 84 },
  },
  nashst01: {
    nbaId: 959,
    peakSeasons: [2005, 2006, 2007, 2008, 2009, 2010],
    twilightFrom: 2013,
    twilightOvrFloor: 70,
    twilightAttrFloor: { pass: 88, three: 80, iq: 90 },
  },
  allenra02: {
    nbaId: 951,
    peakSeasons: [2001, 2005, 2006, 2007, 2008],
    twilightFrom: 2013,
    twilightOvrFloor: 72,
    twilightAttrFloor: { three: 88, mid: 82, clutch: 80 },
  },
};

export function legendMeta(bref) {
  return LEGEND_META[String(bref || "").toLowerCase()] || null;
}

export function teamLabel(team) {
  if (!team) return "";
  const zh = TEAM_NAMES_ZH[team];
  return zh ? `${zh}(${team})` : team;
}

export function isTwilightSeason(r) {
  const meta = legendMeta(r?.bref);
  if (!meta?.twilightFrom) return false;
  return (r.season || 0) >= meta.twilightFrom;
}

export function isPeakSeason(r) {
  const meta = legendMeta(r?.bref);
  if (!meta?.peakSeasons?.length) return false;
  return meta.peakSeasons.includes(r.season);
}

/** Apply twilight skill floors onto attrs + ovrHint. */
export function applyLegendTwilightFloor(r, attrs, ovrHint) {
  const meta = legendMeta(r?.bref);
  if (!meta || !isTwilightSeason(r)) return { attrs, ovrHint, twilight: false };
  const next = { ...attrs };
  const floors = meta.twilightAttrFloor || {};
  for (const [k, v] of Object.entries(floors)) {
    if (typeof next[k] === "number") next[k] = Math.max(next[k], v);
  }
  const floor = meta.twilightOvrFloor || 70;
  return {
    attrs: next,
    ovrHint: Math.max(ovrHint || 0, floor),
    twilight: true,
  };
}
