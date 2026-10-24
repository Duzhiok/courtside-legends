/**
 * 金币晋级赛冠军后的挑战阶梯：
 * 金牌联赛冠军 → 15 支历史季后赛强队 → 7 支历史总冠军
 * （year = 赛季截止年，与 PLAYERS.season / historicalSeasons 一致）
 */

/** 15 支：打进总决赛或极深季后赛的经典阵容（非「七冠」名单） */
export const HISTORICAL_PLAYOFF_CHALLENGERS = [
  { year: 1993, teamId: "PHO", bref: "PHO", name: "太阳", label: "93太阳·巴克利" },
  { year: 1995, teamId: "ORL", bref: "ORL", name: "魔术", label: "95魔术·鲨/便士" },
  { year: 1998, teamId: "UTA", bref: "UTA", name: "爵士", label: "98爵士·邮差连线" },
  { year: 2001, teamId: "PHI", bref: "PHI", name: "76人", label: "01六人·艾弗森" },
  { year: 2003, teamId: "NJN", bref: "NJN", name: "篮网", label: "03篮网·基德" },
  { year: 2004, teamId: "LAL", bref: "LAL", name: "湖人", label: "04湖人·OK组合" },
  { year: 2005, teamId: "DET", bref: "DET", name: "活塞", label: "05活塞·五虎" },
  { year: 2006, teamId: "DAL", bref: "DAL", name: "独行侠", label: "06独行侠·诺天王" },
  { year: 2007, teamId: "CLE", bref: "CLE", name: "骑士", label: "07骑士·詹皇单核" },
  { year: 2010, teamId: "BOS", bref: "BOS", name: "凯尔特人", label: "10绿军·三巨头" },
  { year: 2012, teamId: "OKC", bref: "OKC", name: "雷霆", label: "12雷霆·三少" },
  { year: 2015, teamId: "CLE", bref: "CLE", name: "骑士", label: "15骑士·詹皇归来" },
  { year: 2018, teamId: "HOU", bref: "HOU", name: "火箭", label: "18火箭·魔球双核" },
  { year: 2020, teamId: "MIA", bref: "MIA", name: "热火", label: "20热火·泡泡园" },
  { year: 2021, teamId: "PHO", bref: "PHO", name: "太阳", label: "21太阳·布克/保罗" },
];

/** 7 支：史实总冠军巅峰班底 */
export const HISTORICAL_CHAMPION_CHALLENGERS = [
  { year: 1992, teamId: "CHI", bref: "CHI", name: "公牛", label: "92公牛·飞人王朝" },
  { year: 1996, teamId: "CHI", bref: "CHI", name: "公牛", label: "96公牛·72胜" },
  { year: 2001, teamId: "LAL", bref: "LAL", name: "湖人", label: "01湖人·三连冠" },
  { year: 2008, teamId: "BOS", bref: "BOS", name: "凯尔特人", label: "08绿军·三巨头" },
  { year: 2014, teamId: "SAS", bref: "SAS", name: "马刺", label: "14马刺·五星" },
  { year: 2016, teamId: "CLE", bref: "CLE", name: "骑士", label: "16骑士·逆转73胜" },
  { year: 2017, teamId: "GSW", bref: "GSW", name: "勇士", label: "17勇士·杜兰特元年" },
];

export const CAREER_CHALLENGE_TIERS = {
  gold: {
    id: "gold",
    name: "金币联赛", nameEn: "Gold League",
    next: "playoff15",
    nextLabel: "挑战 15 支历史季后赛球队",
    nextLabelEn: "the 15-team Historical Playoff Challenge",
  },
  playoff15: {
    id: "playoff15",
    name: "历史季后赛挑战", nameEn: "Historical Playoff Challenge",
    next: "champ7",
    nextLabel: "挑战 7 支历史总冠军",
    nextLabelEn: "the 7-team Historical Champions Challenge",
  },
  champ7: {
    id: "champ7",
    name: "历史总冠军挑战", nameEn: "Historical Champions Challenge",
    next: null,
    nextLabel: null,
    nextLabelEn: null,
  },
};

export function challengeTierMeta(tier) {
  return CAREER_CHALLENGE_TIERS[tier] || CAREER_CHALLENGE_TIERS.gold;
}

/** Tier display name in the given language (defaults to zh). */
export function challengeTierName(tier, lang = "zh") {
  const meta = challengeTierMeta(tier);
  return lang === "en" ? meta.nameEn || meta.name : meta.name;
}
