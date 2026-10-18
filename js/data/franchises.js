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
  { id: "OKC", name: "雷霆", aliases: ["OKC"] },
  { id: "SEA", name: "超音速", aliases: ["SEA"] },
  { id: "LAS", name: "拉斯维加斯", aliases: ["LAS", "LV"] },
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

/**
 * Soft position fit score 0–100 for chemistry engine.
 * Optional player: high-pass guards slide 1↔2 cleanly; wings with size tolerate 3↔4.
 */
export function positionFitScore(naturalPos, assignedPos, player = null) {
  if (!assignedPos || naturalPos === assignedPos) return 100;
  const order = ["PG", "SG", "SF", "PF", "C"];
  const nat = order.includes(naturalPos) ? naturalPos : String(naturalPos || "SF").toUpperCase();
  const asg = order.includes(assignedPos) ? assignedPos : String(assignedPos || "SF").toUpperCase();
  const a = order.indexOf(nat);
  const b = order.indexOf(asg);
  if (a < 0 || b < 0) return 70;
  const dist = Math.abs(a - b);
  let score = dist === 1 ? 78 : dist === 2 ? 55 : 35;
  if (!player) return score;
  const pass = player.pass || 50;
  const three = player.three || 50;
  const strength = player.strength || 50;
  const iq = player.iq || 50;
  // Kyrie / scoring PG → SG next to an organizer: still natural enough
  if (nat === "PG" && asg === "SG") score = Math.max(score, pass >= 70 ? 92 : pass >= 55 ? 86 : 80);
  if (nat === "SG" && asg === "PG") score = Math.max(score, pass >= 78 ? 94 : pass >= 68 ? 86 : 72);
  if (nat === "SF" && asg === "PF" && (strength >= 70 || three >= 75)) score = Math.max(score, 84);
  if (nat === "PF" && asg === "SF" && three >= 70) score = Math.max(score, 82);
  if (nat === "SF" && asg === "SG" && three >= 75) score = Math.max(score, 84);
  if (iq >= 85 && dist === 1) score = Math.min(100, score + 4);

  // —— 奇效 / 惨案：跨位实验 ——
  const rebound = player.rebound || 50;
  const paint = player.paint || 50;
  const speed = player.speed || 50;
  const defense = player.defense || 50;
  // 传球怪兽大个子打控卫：约基奇 / 詹姆斯 / 字母哥类
  const nm = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  const pointForward =
    pass >= 78 ||
    /jokic|约基奇|lebron|詹姆斯|antetokounmpo|字母|donci|东契奇/.test(nm);
  if (["PF", "C", "SF"].includes(nat) && asg === "PG") {
    if (pass >= 88 && iq >= 82) score = Math.max(score, 92); // Jokic-tier
    else if (pointForward && pass >= 75) score = Math.max(score, 84); // LeBron / Giannis
    else if (pass >= 80 && iq >= 75) score = Math.max(score, 76);
    else if (pass < 65) score = Math.min(score, 42); // 不会组织硬打1号 → 崩
  }
  if (["PF", "C"].includes(nat) && asg === "SG") {
    if (pass >= 82 && three >= 70) score = Math.max(score, 72);
    else score = Math.min(score, 48);
  }
  // 强壮篮板前锋/后卫打中锋：可能奇效，也可能被锤
  if (["PF", "SF", "SG"].includes(nat) && asg === "C") {
    if (rebound >= 82 && strength >= 82) score = Math.max(score, 86);
    else if (rebound >= 75 && strength >= 74) score = Math.max(score, 74);
    else if (strength < 60 || rebound < 55) score = Math.min(score, 38);
  }
  // 纯后卫硬顶中锋且没吨位 → 惨
  if (["PG", "SG"].includes(nat) && asg === "C" && strength < 70) {
    score = Math.min(score, 32);
  }
  // 中锋去控卫但传球不行
  if (nat === "C" && asg === "PG" && pass < 70) score = Math.min(score, 36);
  // 小快灵打大前：需要投射/速度
  if (["PG", "SG"].includes(nat) && asg === "PF") {
    if (three >= 80 && speed >= 80) score = Math.max(score, 68);
    else score = Math.min(score, 45);
  }
  // 防守钉 + 力量 → 小前顶四号尚可
  if (nat === "SF" && asg === "PF" && defense >= 80 && strength >= 72) {
    score = Math.max(score, 86);
  }

  return clamp(score, 22, 100);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
