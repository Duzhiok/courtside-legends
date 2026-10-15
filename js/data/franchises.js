/**
 * Modern franchise keys → historical team abbreviations in roster.json
 * Used by Legend Mode to pull anyone who ever played for that club.
 */
export const FRANCHISES = [
  { id: "LAL", name: "湖人", aliases: ["LAL", "MNL"] },
  { id: "BOS", name: "凯尔特人", aliases: ["BOS"] },
  { id: "CHI", name: "公牛", aliases: ["CHI"] },
  { id: "GSW", name: "勇士", aliases: ["GSW", "PHW", "SFW"] },
  { id: "SAS", name: "马刺", aliases: ["SAS"] },
  { id: "MIA", name: "热火", aliases: ["MIA"] },
  { id: "NYK", name: "尼克斯", aliases: ["NYK"] },
  { id: "PHI", name: "76人", aliases: ["PHI", "SYR"] },
  { id: "DET", name: "活塞", aliases: ["DET", "FTW"] },
  { id: "HOU", name: "火箭", aliases: ["HOU", "SDR"] },
  { id: "DAL", name: "独行侠", aliases: ["DAL"] },
  { id: "DEN", name: "掘金", aliases: ["DEN", "DNA", "DNR"] },
  { id: "MIL", name: "雄鹿", aliases: ["MIL"] },
  { id: "CLE", name: "骑士", aliases: ["CLE"] },
  { id: "ATL", name: "老鹰", aliases: ["ATL", "STL", "TRI", "MLH"] },
  { id: "POR", name: "开拓者", aliases: ["POR"] },
  { id: "UTA", name: "爵士", aliases: ["UTA", "NOJ"] },
  { id: "PHO", name: "太阳", aliases: ["PHO", "PHX"] },
  { id: "SAC", name: "国王", aliases: ["SAC", "KCK", "KCO", "CIN", "ROC"] },
  { id: "LAC", name: "快船", aliases: ["LAC", "SDC", "BUF"] },
  { id: "OKC", name: "雷霆", aliases: ["OKC", "SEA"] },
  { id: "ORL", name: "魔术", aliases: ["ORL"] },
  { id: "MIN", name: "森林狼", aliases: ["MIN"] },
  { id: "TOR", name: "猛龙", aliases: ["TOR"] },
  { id: "IND", name: "步行者", aliases: ["IND"] },
  { id: "WAS", name: "奇才", aliases: ["WAS", "WSB", "BAL", "CAP", "CHP", "CHZ"] },
  { id: "MEM", name: "灰熊", aliases: ["MEM", "VAN"] },
  { id: "NOP", name: "鹈鹕", aliases: ["NOP", "NOH", "NOK"] },
  { id: "BKN", name: "篮网", aliases: ["BRK", "BKN", "NJN", "NYA", "NYN"] },
  { id: "CHA", name: "黄蜂", aliases: ["CHA", "CHO", "CHH"] },
];

export const POS_SLOTS = [
  { id: "PG", label: "1号位 PG" },
  { id: "SG", label: "2号位 SG" },
  { id: "SF", label: "3号位 SF" },
  { id: "PF", label: "4号位 PF" },
  { id: "C", label: "5号位 C" },
];

export function franchiseById(id) {
  return FRANCHISES.find((f) => f.id === id);
}

export function playersForFranchise(allPlayers, franchise) {
  const set = new Set(franchise.aliases);
  return allPlayers.filter((p) => set.has(p.team));
}

/** Soft position fit score 0–100 for chemistry engine. */
export function positionFitScore(naturalPos, assignedPos) {
  if (!assignedPos || naturalPos === assignedPos) return 100;
  const order = ["PG", "SG", "SF", "PF", "C"];
  const a = order.indexOf(naturalPos);
  const b = order.indexOf(assignedPos);
  if (a < 0 || b < 0) return 70;
  const dist = Math.abs(a - b);
  if (dist === 1) return 78;
  if (dist === 2) return 55;
  return 35;
}
