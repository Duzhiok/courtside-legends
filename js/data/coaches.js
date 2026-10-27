/**
 * 2K-inspired playbooks. Each coach only unlocks a subset (specialTactics).
 * needs[] boost chemistry when roster tags/archetypes match.
 */
export const TACTICS = {
  balanced: {
    id: "balanced",
    name: "均衡进攻",
    desc: "四平八稳，无明显偏科；适合阵容未定型时过渡。",
    nameEn: "Balanced Offense",
    descEn: "Steady all-around, no glaring weakness; a good bridge while the roster is still unsettled.",
    offense: 1,
    defense: 1,
    pace: 1,
    threeRate: 1,
  },
  triangle: {
    id: "triangle",
    name: "三角进攻",
    desc: "强调站位与传球角度；适合高球商巨星+内线轴心，节奏偏慢。",
    nameEn: "Triangle Offense",
    descEn: "Spacing and passing angles; suits high-IQ stars plus a post hub, at a slower pace.",
    offense: 1.08,
    defense: 1.02,
    pace: 0.95,
    threeRate: 0.85,
    needs: ["fundamentals", "connector", "mamba", "goat"],
  },
  smallball: {
    id: "smallball",
    name: "小球空间",
    desc: "拉空禁区、提速三分；射手多时收益大，内线堆叠会吃亏。",
    nameEn: "Small Ball",
    descEn: "Empties the paint and speeds up threes; big returns with shooters, punished by stacked bigs inside.",
    offense: 1.06,
    defense: 0.96,
    pace: 1.12,
    threeRate: 1.25,
    needs: ["spacing_guard", "catch_shoot", "connector", "3andD"],
  },
  iso_heavy: {
    id: "iso_heavy",
    name: "单打为核心",
    desc: "球权集中给一到两位持球核；双大核容易打架，纯无球阵容吃亏。",
    nameEn: "Iso Heavy",
    descEn: "Possessions funnel to one or two ball-handling cores; two alpha bigs can clash, and a pure off-ball roster suffers.",
    offense: 1.04,
    defense: 0.94,
    pace: 0.92,
    threeRate: 0.95,
    needs: ["iso_scorer", "iso_creator", "mamba", "creator"],
  },
  pack_paint: {
    id: "pack_paint",
    name: "收缩篮下",
    desc: "全员收缩禁区：篮下更难打、更容易被帽；代价是分球后的外线大空位。对面没三分时纯赚，对面有射手群时会被惩罚。",
    nameEn: "Pack the Paint",
    descEn: "Everyone collapses inside: the rim gets crowded and blocks go up — but kick-out shooters get wide open. Free against teams with no shooting, punished by real spacing.",
    offense: 1,
    defense: 1,
    pace: 1,
    threeRate: 1,
    // Defensive stance, not a system: the sim reads this flag, never the flat multipliers.
    packPaint: true,
  },
  grind: {
    id: "grind",
    name: "铁血半场",
    desc: "降节奏、拼防守与篮板；消耗主力体力，适合硬实力硬桥硬马。",
    nameEn: "Grind It Out",
    descEn: "Slow pace, defense and rebounding; wears starters down, suits hard-nosed talent.",
    offense: 0.96,
    defense: 1.12,
    pace: 0.88,
    threeRate: 0.9,
    needs: ["versatile_big", "fundamentals", "two_way_star", "pest"],
  },
  motion: {
    id: "motion",
    name: "动态传导",
    desc: "多点持球与无球切入；需要组织点+连接者，适配度看传球网。",
    nameEn: "Motion Offense",
    descEn: "Multiple handlers and off-ball cuts; needs playmakers and connectors — fit depends on the passing web.",
    offense: 1.05,
    defense: 1.0,
    pace: 1.05,
    threeRate: 1.1,
    needs: ["floor_general", "playmaking_big", "connector"],
  },
  pace_space: {
    id: "pace_space",
    name: "魔球节奏",
    desc: "极致三分与转换；适合持球魔球核+射手群，防守端略冒险。",
    nameEn: "Moreyball Pace",
    descEn: "Extreme threes and transition; suits a Moreyball hub plus shooters, a bit of a gamble defensively.",
    offense: 1.07,
    defense: 0.95,
    pace: 1.15,
    threeRate: 1.3,
    needs: ["iso_creator", "spacing_guard", "shooter"],
  },
  morale_boost: {
    id: "morale_boost",
    name: "鼓舞士气",
    desc: "立刻抬升士气与参与感；体系加成一般，关键时刻提气很有用。",
    nameEn: "Morale Boost",
    descEn: "Lifts morale and engagement immediately; modest system bonus, great for lifting a team in big moments.",
    offense: 1.03,
    defense: 1.03,
    pace: 1.0,
    threeRate: 1.0,
    morale: 12,
  },
  // —— 扩充：2K 风体系 ——
  horns: {
    id: "horns",
    name: "牛角挡拆",
    desc: "高位双挡起步，内外联动；需要掩护质量与决策后卫。",
    nameEn: "Horns PnR",
    descEn: "Starts with a high double screen, inside-out action; needs screen quality and a decision-making guard.",
    offense: 1.06,
    defense: 1.0,
    pace: 1.02,
    threeRate: 1.05,
    needs: ["floor_general", "playmaking_big", "connector", "screen"],
  },
  princeton: {
    id: "princeton",
    name: "普林斯顿",
    desc: "背切、反跑与弱侧时机；球商高、愿意无球跑动才吃香。",
    nameEn: "Princeton",
    descEn: "Back cuts, counters, and weak-side timing; rewards high IQ and willingness to move without the ball.",
    offense: 1.04,
    defense: 1.04,
    pace: 0.94,
    threeRate: 0.95,
    needs: ["fundamentals", "connector", "off_ball", "iq"],
  },
  five_out: {
    id: "five_out",
    name: "五外拉开",
    desc: "五人站外线清空禁区；射手+持球突破收益高，传统中锋难受。",
    nameEn: "Five Out",
    descEn: "All five stand outside and clear the paint; shooters and driving handlers gain most, traditional centers suffer.",
    offense: 1.05,
    defense: 0.97,
    pace: 1.08,
    threeRate: 1.22,
    needs: ["shooter", "spacing_guard", "catch_shoot", "3andD"],
  },
  pnr_spam: {
    id: "pnr_spam",
    name: "挡拆轰炸",
    desc: "回合堆挡拆选择；拖曳、短滚、外弹都要有人能完成。",
    nameEn: "PnR Spam",
    descEn: "Possessions stacked with pick-and-roll reads; drags, short rolls, and pops all need someone who can finish them.",
    offense: 1.07,
    defense: 0.98,
    pace: 1.06,
    threeRate: 1.08,
    needs: ["floor_general", "playmaking_big", "iso_creator", "roll_man"],
  },
  post_up: {
    id: "post_up",
    name: "低位强打",
    desc: "球喂到低位背身；需要吨位与脚步，外线多为定点等待。",
    nameEn: "Post Up",
    descEn: "Feed the low post and play with your back to the basket; needs size and footwork, wings mostly spot up.",
    offense: 1.05,
    defense: 1.01,
    pace: 0.9,
    threeRate: 0.82,
    needs: ["dominant_big", "post", "fundamentals", "finisher"],
  },
  transition: {
    id: "transition",
    name: "转换突击",
    desc: "抢板或造失误后秒推；速度与体力决定上限。",
    nameEn: "Transition Attack",
    descEn: "Push the second you grab a board or force a turnover; speed and stamina set the ceiling.",
    offense: 1.06,
    defense: 0.96,
    pace: 1.18,
    threeRate: 1.05,
    needs: ["athlete", "coast", "finisher", "motor"],
  },
  switch_all: {
    id: "switch_all",
    name: "无限换防",
    desc: "挡拆直接换人；锋线机动性要够，否则被错位点名。",
    nameEn: "Switch Everything",
    descEn: "Switch every screen; wings must be mobile enough or you get hunted on mismatches.",
    offense: 0.99,
    defense: 1.1,
    pace: 1.0,
    threeRate: 1.0,
    needs: ["switch_big", "two_way_star", "pest", "versatile_big"],
  },
  zone_drop: {
    id: "zone_drop",
    name: "沉退联防",
    desc: "护框优先、放中距离；适合护框大闸，怕优质中投与底角。",
    nameEn: "Drop Zone",
    descEn: "Rim protection first, concede the mid-range; suits a rim-protecting anchor, fears quality mid-range and corner shooting.",
    offense: 0.98,
    defense: 1.08,
    pace: 0.95,
    threeRate: 1.05,
    needs: ["rim_protector", "versatile_big", "pest", "help"],
  },
  corner: {
    id: "corner",
    name: "底角体系",
    desc: "强侧突破吸引，弱侧底角惩罚；需要稳定定点射手。",
    nameEn: "Corner System",
    descEn: "Strong-side drives draw help, weak-side corners punish; needs reliable spot-up shooters.",
    offense: 1.05,
    defense: 0.99,
    pace: 1.02,
    threeRate: 1.18,
    needs: ["catch_shoot", "3andD", "shooter", "spacer"],
  },
  freestyle: {
    id: "freestyle",
    name: "自由发挥",
    desc: "少叫战术多靠球员自主；放权型教练常用，纪律型阵容会散。",
    nameEn: "Freestyle",
    descEn: "Few called plays, lots of player freedom; a staple for empowering coaches, undisciplined rosters drift.",
    offense: 1.02,
    defense: 0.97,
    pace: 1.06,
    threeRate: 1.05,
    needs: ["creator", "ascending", "iso_creator"],
    morale: 4,
  },
  twin_towers: {
    id: "twin_towers",
    name: "双塔内线",
    desc: "两名大个子占禁区；篮板与护框拉满，空间压力大。",
    nameEn: "Twin Towers",
    descEn: "Two bigs occupy the paint; rebounding and rim protection maxed out, spacing under pressure.",
    offense: 1.02,
    defense: 1.1,
    pace: 0.9,
    threeRate: 0.78,
    needs: ["dominant_big", "rebounder", "rim_protector", "versatile_big"],
  },
  flex: {
    id: "flex",
    name: "Flex 切入",
    desc: "侧翼掩护后切入接球；老派半场，考验时机与无球。",
    nameEn: "Flex Cut",
    descEn: "Wing screens into cuts for the catch; old-school half-court, timing and off-ball work matter.",
    offense: 1.03,
    defense: 1.02,
    pace: 0.96,
    threeRate: 0.92,
    needs: ["fundamentals", "connector", "off_ball"],
  },
  crash_boards: {
    id: "crash_boards",
    name: "冲抢篮板",
    desc: "多人冲进攻篮板；二次机会增多，回防略慢。需要内线吨位与弹性。",
    nameEn: "Crash the Boards",
    descEn: "Send numbers to the offensive glass; more second chances, slightly slower to get back. Needs interior size and spring.",
    offense: 1.03,
    defense: 0.96,
    pace: 0.98,
    threeRate: 0.9,
    orbBoost: 0.07,
    needs: ["rebounder", "dominant_big", "versatile_big", "athlete"],
  },
  second_chance: {
    id: "second_chance",
    name: "二次进攻",
    desc: "强调补篮与进攻篮板后的立刻终结；高大禁区收益最大。",
    nameEn: "Second-Chance Points",
    descEn: "Putbacks and immediate finishes after offensive boards; the biggest paint presence gains most.",
    offense: 1.05,
    defense: 0.97,
    pace: 0.96,
    threeRate: 0.85,
    orbBoost: 0.05,
    paintBias: 1.35,
    needs: ["dominant_big", "finisher", "rebounder", "roll_man"],
  },
  paint_attack: {
    id: "paint_attack",
    name: "内线进攻",
    desc: "优先杀筐与油漆区；外线比重下降，适合优质中锋/锋线终结点。",
    nameEn: "Paint Attack",
    descEn: "Rim runs and paint touches first; perimeter share drops, suits quality centers and wing finishers.",
    offense: 1.06,
    defense: 1.0,
    pace: 0.94,
    threeRate: 0.72,
    paintBias: 1.5,
    needs: ["dominant_big", "finisher", "paint", "post"],
  },
};

/** 高质量传球手：可解锁动态传导 / 魔球. */
export function isQualityPasser(p) {
  if (!p) return false;
  const pass = Number(p.pass) || 50;
  const apg = Number(p.raw?.apg) || 0;
  const iq = Number(p.iq) || 50;
  return pass >= 78 || apg >= 6.5 || (pass >= 72 && apg >= 5) || (pass >= 74 && iq >= 82);
}

/** 能掩护/终结的内线（挡拆搭档）. */
export function isQualityBig(p) {
  if (!p) return false;
  const pos = p.playPos || p.pos;
  if (!["C", "PF"].includes(pos)) return false;
  const reb = Number(p.rebound) || 50;
  const paint = Number(p.paint) || 50;
  const def = Number(p.defense) || 50;
  const blk = Number(p.block) || 40;
  const str = Number(p.strength) || 50;
  return reb >= 72 || paint >= 78 || def >= 78 || blk >= 70 || str >= 82;
}

/** 真正能撑双塔/低位的中锋级大个子. */
export function isQualityCenter(p) {
  if (!p) return false;
  const pos = p.playPos || p.pos;
  const reb = Number(p.rebound) || 50;
  const paint = Number(p.paint) || 50;
  const blk = Number(p.block) || 40;
  const str = Number(p.strength) || 50;
  if (pos === "C") return reb >= 70 || paint >= 75 || blk >= 68 || str >= 80;
  // 够壮的 PF 也算第二塔
  if (pos === "PF") return reb >= 78 && (paint >= 78 || str >= 84 || blk >= 72);
  return false;
}

/**
 * 阵容解锁的战术（不占用教练本能战术栏，可直接在比赛中选用）.
 * @returns {{ ids: string[], reasons: Record<string,string> }}
 */
export function rosterTacticUnlocks(players = [], lang = "zh") {
  const en = lang === "en";
  const list = players.filter(Boolean);
  const passers = list.filter(isQualityPasser);
  const bigs = list.filter(isQualityBig);
  const centers = list.filter(isQualityCenter);
  const ids = new Set();
  const reasons = {};

  if (passers.length >= 2) {
    ids.add("motion");
    ids.add("pace_space");
    reasons.motion = en ? `Two playmakers (${passers.slice(0, 2).map((p) => p.name).join(" / ")}) → Motion Offense` : `双组织（${passers.slice(0, 2).map((p) => p.name).join(" / ")}）→ 动态传导`;
    reasons.pace_space = en ? `Two playmakers → smoother Moreyball pace` : `双组织 → 魔球节奏更流畅`;
  }
  if (bigs.length >= 1 || centers.length >= 1) {
    ids.add("pnr_spam");
    ids.add("horns");
    const who = (centers[0] || bigs[0])?.name || "内线";
    reasons.pnr_spam = en ? `Quality big ${who} → PnR Spam` : `优质内线 ${who} → 挡拆轰炸`;
    reasons.horns = en ? `Quality big → Horns PnR` : `优质内线 → 牛角挡拆`;
  }
  if (centers.length >= 1) {
    ids.add("post_up");
    ids.add("zone_drop");
    ids.add("paint_attack");
    reasons.post_up = en ? `Center-grade big → Post Up` : `中锋级内线 → 低位强打`;
    reasons.zone_drop = en ? `Rim-protecting big → Drop defense` : `护框内线 → 沉退/收缩防守`;
    reasons.paint_attack = en ? `Quality big → Paint Attack` : `优质内线 → 内线进攻`;
  }
  if (centers.length >= 2 || bigs.filter((p) => (p.playPos || p.pos) === "C" || (p.rebound || 0) >= 80).length >= 2) {
    ids.add("twin_towers");
    ids.add("crash_boards");
    ids.add("second_chance");
    ids.add("post_up");
    ids.add("zone_drop");
    ids.add("paint_attack");
    const names = centers
      .slice(0, 2)
      .map((p) => p.name)
      .join(" / ");
    reasons.twin_towers = en ? `Twin towers (${names || "two bigs"})` : `双塔（${names || "两名大个子"}）`;
    reasons.crash_boards = en ? `Multiple bigs → Crash the Boards` : `多名内线 → 冲抢篮板`;
    reasons.second_chance = en ? `Multiple bigs → Second-Chance Points` : `多名内线 → 二次进攻`;
  }

  return { ids: [...ids], reasons };
}

/**
 * 教练战术 ∪ 阵容解锁 ∪ 均衡.
 * @param {object} coach
 * @param {object[]} [players] 场上或本队球员
 */
export function availableTactics(coach, players = null) {
  const fromCoach = coachTactics(coach).map((t) => t.id);
  const fromRoster = players?.length ? rosterTacticUnlocks(players).ids : [];
  // Pack the paint is a stance, not a coach system: every team can choose it.
  const ids = [...new Set(["balanced", "pack_paint", ...fromCoach, ...fromRoster])];
  return ids.map((id) => TACTICS[id]).filter(Boolean);
}

/** 短说明：为何能选某战术. */
export function tacticUnlockHint(tacticId, players = [], lang = "zh") {
  const { reasons } = rosterTacticUnlocks(players, lang);
  return reasons[tacticId] || "";
}

/** Slider help shown on setup + in-game philosophy panels. */
export const PHILOSOPHY_HELP = {
  offense: {
    label: "进攻倾向",
    desc: "抓机会倾向：见空档就攻。过高时弱攻/偏防球员也会强行出手，浪费球权与体力；若阵容多为进攻型，则抓机会极强。",
  },
  defense: {
    label: "防守倾向",
    desc: "防守压迫强度：抬高盯防与协防，但更吃体力。体力好的球员（如威少）几乎无感；体力差的会快速透支。",
  },
  morale: {
    label: "士气管理",
    desc: "开场士气与抗压底线；高则关键球更敢出手，低则容易情绪波动。",
  },
  stamina: {
    label: "负荷管理",
    desc: "正值保护主力体力（轮换更积极）；负值铁血连场，疲劳涨得更快。",
  },
};

export const COACHES = [
  {
    id: "phil-1996-chi",
    name: "菲尔·杰克逊",
    nameEn: "Phil Jackson",
    season: 1996,
    team: "CHI",
    record: { wins: 72, losses: 10, note: "常规赛史诗 · 总冠军", noteEn: "Historic regular season · Champions" },
    style: "禅师",
    styleEn: "Zen Master",
    specialty: "三角进攻 · 巨星管控",
    specialtyEn: "Triangle Offense · Superstar Management",
    buffs: { offense: 8, defense: 6, morale: 10, stamina: 4 },
    specialTactics: ["triangle", "princeton", "flex"],
    preferred: ["goat", "connector", "rebounder", "fundamentals"],
    note: "三角为核；高球商阵容吃满",
    noteEn: "Triangle at the core; high-IQ rosters feast",
    hiddenTier: "hof",
    fame: 95,
    playerAutonomy: 25,
    sparkPotential: 40,
  },
  {
    id: "phil-2000-lal",
    name: "菲尔·杰克逊",
    nameEn: "Phil Jackson",
    season: 2000,
    team: "LAL",
    record: { wins: 67, losses: 15, note: "常规赛榜首 · 总冠军", noteEn: "Conference best · Champions" },
    style: "禅师",
    styleEn: "Zen Master",
    specialty: "三角 · 内线轴心",
    specialtyEn: "Triangle · Post Hub",
    buffs: { offense: 9, defense: 5, morale: 8, stamina: 3 },
    specialTactics: ["triangle", "post_up", "flex"],
    preferred: ["dominant_big", "mamba", "fundamentals"],
    note: "OK组合三角；低位与侧翼单打结合",
    noteEn: "OK duo triangle; post play mixed with wing iso",
    hiddenTier: "hof",
    fame: 96,
    playerAutonomy: 22,
    sparkPotential: 42,
  },
  {
    id: "kerr-2016-gsw",
    name: "史蒂夫·科尔",
    nameEn: "Steve Kerr",
    season: 2016,
    team: "GSW",
    record: { wins: 73, losses: 9, note: "常规赛纪录 · 西决出局", noteEn: "Record regular season · Out in the West Finals" },
    style: "小球空间",
    styleEn: "Small Ball",
    specialty: "五外 · 小球 · 换防",
    specialtyEn: "Five Out · Small Ball · Switching",
    buffs: { offense: 10, defense: 4, morale: 8, stamina: 5 },
    specialTactics: ["smallball", "five_out", "motion", "switch_all"],
    preferred: ["spacing_guard", "catch_shoot", "connector", "3andD"],
    note: "水花体系；空间与换防一体",
    noteEn: "The Splash system; spacing and switching as one",
    hiddenTier: "allstar",
    fame: 88,
    playerAutonomy: 45,
    sparkPotential: 55,
  },
  {
    id: "doc-2008-bos",
    name: "道格·里弗斯",
    nameEn: "Doc Rivers",
    season: 2008,
    team: "BOS",
    record: { wins: 66, losses: 16, note: "东部第一 · 总冠军", noteEn: "East first · Champions" },
    style: "鼓舞型",
    styleEn: "Motivator",
    specialty: "士气 · 简单挡拆",
    specialtyEn: "Morale · Simple PnR",
    buffs: { offense: 5, defense: 7, morale: 14, stamina: 4 },
    specialTactics: ["morale_boost", "horns", "iso_heavy"],
    preferred: ["versatile_big", "closer", "shooter", "two_way_wing"],
    note: "更衣室发动机；战术偏简洁",
    noteEn: "Locker-room engine; keeps tactics simple",
    hiddenTier: "star",
    fame: 78,
    playerAutonomy: 50,
    sparkPotential: 52,
  },
  {
    id: "thibs-2011-chi",
    name: "汤姆·锡伯杜",
    nameEn: "Tom Thibodeau",
    season: 2011,
    team: "CHI",
    record: { wins: 62, losses: 20, note: "东部第一 · 东决出局", noteEn: "East first · Out in the East Finals" },
    style: "防守铁血",
    styleEn: "Iron Defense",
    specialty: "铁血半场 · 沉退护框",
    specialtyEn: "Grind It Out · Drop Coverage",
    buffs: { offense: 2, defense: 14, morale: 4, stamina: -6 },
    specialTactics: ["grind", "zone_drop", "switch_all"],
    preferred: ["versatile_big", "pest", "two_way_star", "competitor"],
    note: "防守优先；主力消耗极大",
    noteEn: "Defense first; starters pay a heavy toll",
    hiddenTier: "star",
    fame: 80,
    playerAutonomy: 18,
    sparkPotential: 35,
  },
  {
    id: "pop-2003-sas",
    name: "格雷格·波波维奇",
    nameEn: "Gregg Popovich",
    season: 2003,
    team: "SAS",
    record: { wins: 60, losses: 22, note: "西部第一 · 总冠军", noteEn: "West first · Champions" },
    style: "体系纪律",
    styleEn: "System Discipline",
    specialty: "传导 · 普林斯顿 · 纪律防",
    specialtyEn: "Ball Movement · Princeton · Disciplined Defense",
    buffs: { offense: 6, defense: 12, morale: 6, stamina: 6 },
    specialTactics: ["motion", "princeton", "grind", "flex"],
    preferred: ["fundamentals", "connector", "floor_general"],
    note: "石佛体系；基础扎实才开花",
    noteEn: "The Duncan system; fundamentals first, then it blooms",
    hiddenTier: "hof",
    fame: 98,
    playerAutonomy: 20,
    sparkPotential: 48,
  },
  {
    id: "dantonio-2018-hou",
    name: "迈克·德安东尼",
    nameEn: "Mike D'Antoni",
    season: 2018,
    team: "HOU",
    record: { wins: 65, losses: 17, note: "西部第一 · 西决出局", noteEn: "West first · Out in the West Finals" },
    style: "魔球",
    styleEn: "Moreyball",
    specialty: "魔球 · 挡拆 · 转换",
    specialtyEn: "Moreyball · PnR · Transition",
    buffs: { offense: 11, defense: -2, morale: 3, stamina: 2 },
    specialTactics: ["pace_space", "pnr_spam", "iso_heavy", "transition"],
    preferred: ["iso_creator", "floor_general", "shooter", "spacing_guard"],
    note: "三分或禁区；中投几乎不作数",
    noteEn: "Threes or layups; the mid-range barely counts",
    hiddenTier: "star",
    fame: 76,
    playerAutonomy: 55,
    sparkPotential: 50,
  },
  {
    id: "spo-2020-mia",
    name: "埃里克·斯波尔斯特拉",
    nameEn: "Erik Spoelstra",
    season: 2020,
    team: "MIA",
    record: { wins: 44, losses: 29, note: "泡泡园 · 总决赛", noteEn: "Bubble · Finals" },
    style: "硬派文化",
    styleEn: "Tough Culture",
    specialty: "换防 · 铁血 · 底角",
    specialtyEn: "Switching · Grit · Corner",
    buffs: { offense: 6, defense: 10, morale: 10, stamina: 8 },
    specialTactics: ["switch_all", "grind", "corner", "horns"],
    preferred: ["competitor", "switch_big", "two_way_star"],
    note: "热火文化；能防能拼才进轮换",
    noteEn: "Heat culture; only the tough and scrappy crack the rotation",
    hiddenTier: "allstar",
    fame: 90,
    playerAutonomy: 30,
    sparkPotential: 58,
  },
  {
    id: "nurse-2019-tor",
    name: "尼克·纳斯",
    nameEn: "Nick Nurse",
    season: 2019,
    team: "TOR",
    record: { wins: 58, losses: 24, note: "东部第二 · 总冠军", noteEn: "East second · Champions" },
    style: "灵活变阵",
    styleEn: "Flexible Schemes",
    specialty: "变阵 · 牛角 · 沉退",
    specialtyEn: "Scheme Changes · Horns · Drop",
    buffs: { offense: 7, defense: 9, morale: 7, stamina: 5 },
    specialTactics: ["horns", "zone_drop", "motion", "switch_all"],
    preferred: ["two_way_star", "ascending", "connector"],
    note: "临场变阵多；一套打不通立刻换",
    noteEn: "Changes looks constantly; if one set stalls, he switches instantly",
    hiddenTier: "star",
    fame: 72,
    playerAutonomy: 60,
    sparkPotential: 62,
  },
  {
    id: "malone-2023-den",
    name: "迈克尔·马龙",
    nameEn: "Michael Malone",
    season: 2023,
    team: "DEN",
    record: { wins: 53, losses: 29, note: "西部第一 · 总冠军", noteEn: "West first · Champions" },
    style: "枢纽进攻",
    styleEn: "Hub Offense",
    specialty: "挡拆枢纽 · 牛角 · 低位",
    specialtyEn: "PnR Hub · Horns · Post",
    buffs: { offense: 9, defense: 6, morale: 6, stamina: 5 },
    specialTactics: ["pnr_spam", "horns", "post_up", "motion"],
    preferred: ["playmaking_big", "creator", "catch_shoot"],
    note: "大中锋组织一切；外线接应",
    noteEn: "The big center runs everything; shooters spot up around him",
    hiddenTier: "star",
    fame: 82,
    playerAutonomy: 48,
    sparkPotential: 60,
  },
  {
    id: "bud-2021-mil",
    name: "迈克·布登霍尔泽",
    nameEn: "Mike Budenholzer",
    season: 2021,
    team: "MIL",
    record: { wins: 46, losses: 26, note: "东部第三 · 总冠军", noteEn: "East third · Champions" },
    style: "简单高效",
    styleEn: "Simple & Efficient",
    specialty: "转换 · 沉退 · 底角",
    specialtyEn: "Transition · Drop · Corner",
    buffs: { offense: 7, defense: 7, morale: 5, stamina: 4 },
    specialTactics: ["transition", "zone_drop", "corner"],
    preferred: ["freak", "shooter", "3andD"],
    note: "简化选择；靠巨星天赋收官",
    noteEn: "Simplifies choices; lets star talent close games",
    hiddenTier: "starter",
    fame: 70,
    playerAutonomy: 58,
    sparkPotential: 55,
  },
  {
    id: "rookie-hc-2024",
    name: "新人主帅·林",
    nameEn: "Rookie Head Coach Lin",
    season: 2024,
    team: "自由身",
    record: { wins: 0, losses: 0, note: "尚无执教战绩", noteEn: "No head-coaching record yet" },
    style: "放权成长",
    styleEn: "Empowering Growth",
    specialty: "自由发挥 · 轻传导",
    specialtyEn: "Freestyle · Light Movement",
    buffs: { offense: 4, defense: 4, morale: 8, stamina: 4 },
    specialTactics: ["freestyle", "motion", "balanced"],
    preferred: ["draft_prospect", "ascending", "creator"],
    note: "少叫战术，让新人自己找感觉",
    noteEn: "Calls few plays, lets rookies find their own feel",
    hiddenTier: "bench",
    fame: 22,
    playerAutonomy: 92,
    sparkPotential: 90,
    customizable: true,
    starterPool: true,
  },
  // —— 开局可用：每位菜鸟侧重点不同 ——
  {
    id: "gleague-hc-2019",
    name: "发展联盟主帅·卡伦",
    nameEn: "G League Head Coach Callen",
    season: 2019,
    team: "G League",
    record: { wins: 22, losses: 28, note: "发展联盟中游", noteEn: "Mid-table in the G League" },
    style: "青训摸索",
    styleEn: "Youth Development",
    specialty: "自由发挥 · 转换",
    specialtyEn: "Freestyle · Transition",
    buffs: { offense: 3, defense: 3, morale: 6, stamina: 5 },
    specialTactics: ["freestyle", "transition", "balanced"],
    preferred: ["draft_prospect", "ascending"],
    note: "习惯带新秀跑转换，半场设计少",
    noteEn: "Used to running rookies in transition, thin on half-court design",
    hiddenTier: "undrafted_gleague",
    fame: 12,
    playerAutonomy: 88,
    sparkPotential: 78,
    starterPool: true,
  },
  {
    id: "college-hc-2015",
    name: "大学教练·沃克",
    nameEn: "College Coach Walker",
    season: 2015,
    team: "NCAA",
    record: { wins: 18, losses: 14, note: "大学联赛苦战", noteEn: "Grinding in college ball" },
    style: "半场纪律",
    styleEn: "Half-Court Discipline",
    specialty: "Flex · 铁血半场",
    specialtyEn: "Flex · Grind It Out",
    buffs: { offense: 2, defense: 5, morale: 5, stamina: 2 },
    specialTactics: ["flex", "grind", "princeton"],
    preferred: ["fundamentals", "competitor"],
    note: "大学半场底子，节奏偏慢",
    noteEn: "College half-court roots, slower pace",
    hiddenTier: "bench",
    fame: 18,
    playerAutonomy: 70,
    sparkPotential: 65,
    starterPool: true,
  },
  {
    id: "asst-promoted-2021",
    name: "临时主帅·陈",
    nameEn: "Interim Head Coach Chen",
    season: 2021,
    team: "自由身",
    record: { wins: 9, losses: 17, note: "赛季中途接手", noteEn: "Took over mid-season" },
    style: "过渡维稳",
    styleEn: "Steady Transition",
    specialty: "鼓舞 · 均衡",
    specialtyEn: "Morale · Balanced",
    buffs: { offense: 3, defense: 4, morale: 7, stamina: 3 },
    specialTactics: ["morale_boost", "balanced", "horns"],
    preferred: ["connector", "ascending"],
    note: "先稳住更衣室，战术板还在抄",
    noteEn: "Steady the locker room first; still copying the playbook",
    hiddenTier: "bench",
    fame: 15,
    playerAutonomy: 80,
    sparkPotential: 72,
    starterPool: true,
  },
  {
    id: "euro-hc-2017",
    name: "欧洲来客·马尔科",
    nameEn: "European Visitor Marco",
    season: 2017,
    team: "EuroLeague",
    record: { wins: 14, losses: 16, note: "欧陆联赛半区", noteEn: "Mid-table in Euro leagues" },
    style: "团队传导",
    styleEn: "Team Ball Movement",
    specialty: "传导 · 牛角 · 普林斯顿",
    specialtyEn: "Ball Movement · Horns · Princeton",
    buffs: { offense: 5, defense: 3, morale: 4, stamina: 4 },
    specialTactics: ["motion", "horns", "princeton"],
    preferred: ["connector", "floor_general"],
    note: "传球优先，身体对抗仍在适应",
    noteEn: "Passing first; still adjusting to the physicality",
    hiddenTier: "bench",
    fame: 24,
    playerAutonomy: 75,
    sparkPotential: 68,
    starterPool: true,
  },
  {
    id: "scout-hc-2012",
    name: "球探转正·里德",
    nameEn: "Scout-Turned-Coach Reed",
    season: 2012,
    team: "自由身",
    record: { wins: 0, losses: 0, note: "首年执教", noteEn: "First year as head coach" },
    style: "球探视角",
    styleEn: "Scout's Eye",
    specialty: "底角 · 3D 空间",
    specialtyEn: "Corner · 3&D Spacing",
    buffs: { offense: 3, defense: 3, morale: 5, stamina: 6 },
    specialTactics: ["corner", "five_out", "balanced"],
    preferred: ["draft_prospect", "ascending", "3andD"],
    note: "爱用定点射手，临场叫停偏慢",
    noteEn: "Loves spot-up shooters; a beat slow to call timeouts",
    hiddenTier: "water_cooler",
    fame: 10,
    playerAutonomy: 85,
    sparkPotential: 80,
    starterPool: true,
  },
  {
    id: "video-hc-2018",
    name: "录像分析师·金",
    nameEn: "Video Analyst Kim",
    season: 2018,
    team: "自由身",
    record: { wins: 11, losses: 22, note: "重建队过渡期", noteEn: "Rebuilding-team transition" },
    style: "数据试错",
    styleEn: "Data Trial & Error",
    specialty: "魔球 · 挡拆轰炸",
    specialtyEn: "Moreyball · PnR Spam",
    buffs: { offense: 4, defense: 2, morale: 4, stamina: 5 },
    specialTactics: ["pace_space", "pnr_spam", "five_out"],
    preferred: ["shooter", "spacing_guard"],
    note: "录像室点子多，现场执行打折",
    noteEn: "Plenty of film-room ideas; execution on the floor lags",
    hiddenTier: "bench",
    fame: 16,
    playerAutonomy: 82,
    sparkPotential: 74,
    starterPool: true,
  },
  {
    id: "player-coach-2006",
    name: "退役球员·老霍",
    nameEn: "Retired Player Huo",
    season: 2006,
    team: "自由身",
    record: { wins: 27, losses: 55, note: "乐透区苦熬", noteEn: "Grinding in the lottery" },
    style: "老哥带弟",
    styleEn: "Veteran Mentorship",
    specialty: "士气 · 单打 · 自由",
    specialtyEn: "Morale · Iso · Freestyle",
    buffs: { offense: 4, defense: 4, morale: 9, stamina: 2 },
    specialTactics: ["morale_boost", "iso_heavy", "freestyle"],
    preferred: ["competitor", "ascending"],
    note: "更衣室有人缘，体系谈不上复杂",
    noteEn: "Popular in the locker room; the system is nothing fancy",
    hiddenTier: "bench",
    fame: 28,
    playerAutonomy: 78,
    sparkPotential: 70,
    starterPool: true,
  },
  {
    id: "overseas-hc-2020",
    name: "海外回流·赵",
    nameEn: "Overseas Returnee Zhao",
    season: 2020,
    team: "CBA/海外",
    record: { wins: 16, losses: 20, note: "海外联赛中游", noteEn: "Mid-table overseas" },
    style: "身体对抗优先",
    styleEn: "Physicality First",
    specialty: "铁血 · 低位 · 双塔",
    specialtyEn: "Grit · Post · Twin Towers",
    buffs: { offense: 3, defense: 6, morale: 5, stamina: 3 },
    specialTactics: ["grind", "post_up", "twin_towers"],
    preferred: ["competitor", "pest", "dominant_big"],
    note: "对抗与内线为主，外线空间一般",
    noteEn: "Physicality and interior first; perimeter spacing is average",
    hiddenTier: "undrafted_gleague",
    fame: 14,
    playerAutonomy: 76,
    sparkPotential: 66,
    starterPool: true,
  },
];

/** 开局可选：菜鸟 / 边缘主帅（名帅需抽卡）。 */
export function isStarterCoach(c) {
  if (!c) return false;
  if (c.starterPool) return true;
  const fame = c.fame ?? 50;
  const tier = c.hiddenTier || "";
  return fame <= 35 || tier === "bench" || tier === "water_cooler" || tier === "undrafted_gleague";
}

/** 名帅 / 冠军教头：与超巨同档，后期抽卡。 */
export function isLegendCoach(c) {
  if (!c) return false;
  if (c.starterPool) return false;
  const fame = c.fame ?? 50;
  const tier = c.hiddenTier || "";
  return fame >= 70 || ["star", "allstar", "hof"].includes(tier);
}

export function coachDrawWeight(c) {
  const fame = c.fame ?? 50;
  if (fame >= 95) return 1;
  if (fame >= 88) return 3;
  if (fame >= 78) return 8;
  if (fame >= 70) return 18;
  if (fame >= 45) return 40;
  return 120;
}

/** 助教卡：可选，叠加到主教练上 */
export const ASSISTANTS = [
  {
    id: "asst-kerr-young",
    name: "助教·科尔（早期）",
    nameEn: "Assistant Coach Kerr (Early)",
    season: 2010,
    role: "进攻助教",
    roleEn: "Offensive Assistant",
    buffs: { offense: 3, defense: 0, morale: 2, stamina: 1 },
    fame: 40,
    playerAutonomy: 15,
    sparkPotential: 20,
    note: "空间与投射细节",
    noteEn: "Spacing and shooting details",
    hiddenTier: "starter",
  },
  {
    id: "asst-casey",
    name: "助教·凯西",
    nameEn: "Assistant Coach Casey",
    season: 2012,
    role: "防守助教",
    roleEn: "Defensive Assistant",
    buffs: { offense: 0, defense: 4, morale: 1, stamina: 0 },
    fame: 55,
    playerAutonomy: 10,
    sparkPotential: 15,
    note: "半场防守纪律",
    noteEn: "Half-court defensive discipline",
    hiddenTier: "starter",
  },
  {
    id: "asst-prunty",
    name: "助教·普朗蒂",
    nameEn: "Assistant Coach Prunty",
    season: 2018,
    role: "防守助教",
    roleEn: "Defensive Assistant",
    buffs: { offense: 1, defense: 3, morale: 1, stamina: 1 },
    fame: 35,
    playerAutonomy: 20,
    sparkPotential: 25,
    note: "换防沟通",
    noteEn: "Switching communication",
    hiddenTier: "bench",
  },
  {
    id: "asst-unknown-lee",
    name: "助教·李（边缘）",
    nameEn: "Assistant Coach Lee (Fringe)",
    season: 2021,
    role: "球员发展",
    roleEn: "Player Development",
    buffs: { offense: 1, defense: 1, morale: 4, stamina: 2 },
    fame: 12,
    playerAutonomy: 35,
    sparkPotential: 55,
    note: "不出名，但擅长点燃潜力新秀",
    noteEn: "Unknown, but great at igniting potential rookies",
    hiddenTier: "water_cooler",
  },
  {
    id: "asst-rookie-maya",
    name: "新人助教·玛雅",
    nameEn: "Rookie Assistant Maya",
    season: 2024,
    role: "数据分析/发展",
    roleEn: "Analytics / Development",
    buffs: { offense: 2, defense: 1, morale: 3, stamina: 2 },
    fame: 8,
    playerAutonomy: 40,
    sparkPotential: 70,
    note: "新人视角，常给球星意外自由，奇效频出",
    noteEn: "A fresh perspective; often gives stars surprising freedom, to great effect",
    hiddenTier: "undrafted_gleague",
  },
  {
    id: "asst-hammons",
    name: "助教·哈蒙斯",
    nameEn: "Assistant Coach Hammons",
    season: 2016,
    role: "进攻助教",
    roleEn: "Offensive Assistant",
    buffs: { offense: 3, defense: 1, morale: 2, stamina: 0 },
    fame: 30,
    playerAutonomy: 25,
    sparkPotential: 30,
    note: "挡拆细节",
    noteEn: "Pick-and-roll details",
    hiddenTier: "bench",
  },
  {
    id: "asst-udoka",
    name: "助教·乌度卡",
    nameEn: "Assistant Coach Udoka",
    season: 2019,
    role: "防守助教",
    roleEn: "Defensive Assistant",
    buffs: { offense: 1, defense: 4, morale: 3, stamina: 1 },
    fame: 50,
    playerAutonomy: 18,
    sparkPotential: 28,
    note: "强硬防守文化",
    noteEn: "Tough defensive culture",
    hiddenTier: "starter",
  },
  {
    id: "asst-unknown-zhou",
    name: "助教·周（青训）",
    nameEn: "Assistant Coach Zhou (Youth)",
    season: 2023,
    role: "潜力开发",
    roleEn: "Potential Development",
    buffs: { offense: 2, defense: 2, morale: 5, stamina: 3 },
    fame: 5,
    playerAutonomy: 45,
    sparkPotential: 85,
    note: "几乎没人认识；对高成长球员有奇效",
    noteEn: "Barely anyone knows him; magical with high-growth players",
    hiddenTier: "undrafted_gleague",
  },
];

/**
 * 随机抽一位主教练（默认偏向菜鸟/边缘，适合「没请教练就随便 roll」）。
 * @param {{ excludeIds?: string[], preferStarter?: boolean }} [opts]
 */
export function rollRandomCoach({ excludeIds = [], preferStarter = true } = {}) {
  const blocked = new Set((excludeIds || []).filter(Boolean));
  let pool = COACHES.filter((c) => c?.id && !blocked.has(c.id));
  if (preferStarter) {
    const starters = pool.filter(isStarterCoach);
    if (starters.length) pool = starters;
  }
  if (!pool.length) pool = COACHES.filter((c) => c?.id);
  const pick = pool[Math.floor(Math.random() * pool.length)] || COACHES[0];
  return pick ? structuredClone(pick) : null;
}

/**
 * 随机抽一位助教（默认偏向低名气 / 高激发）。
 * @param {{ excludeIds?: string[], preferObscure?: boolean }} [opts]
 */
export function rollRandomAssistant({ excludeIds = [], preferObscure = true } = {}) {
  const blocked = new Set((excludeIds || []).filter(Boolean));
  let pool = ASSISTANTS.filter((a) => a?.id && !blocked.has(a.id));
  if (preferObscure) {
    const obscure = pool.filter((a) => (a.fame ?? 50) < 40 || (a.sparkPotential ?? 0) >= 55);
    if (obscure.length) pool = obscure;
  }
  if (!pool.length) pool = ASSISTANTS.filter((a) => a?.id);
  const pick = pool[Math.floor(Math.random() * pool.length)] || ASSISTANTS[0];
  return pick ? structuredClone(pick) : null;
}

/** 球队没有主教练时自动 roll 一位，写回 team.coach。 */
export function ensureTeamCoach(team, opts = {}) {
  if (!team) return null;
  if (team.coach?.id) return team.coach;
  const exclude = [...(opts.excludeIds || []), team.assistant?.id].filter(Boolean);
  team.coach = rollRandomCoach({ ...opts, excludeIds: exclude });
  return team.coach;
}

/** 球队没有助教时自动 roll 一位，写回 team.assistant。 */
export function ensureTeamAssistant(team, opts = {}) {
  if (!team) return null;
  if (team.assistant?.id) return team.assistant;
  const exclude = [...(opts.excludeIds || []), team.coach?.id].filter(Boolean);
  team.assistant = rollRandomAssistant({ ...opts, excludeIds: exclude });
  return team.assistant;
}

/**
 * 主教练 + 助教都保底有人：缺谁 roll 谁。
 * @returns {{ coach: object|null, assistant: object|null, rolledCoach: boolean, rolledAsst: boolean }}
 */
export function ensureTeamStaff(team, opts = {}) {
  if (!team) return { coach: null, assistant: null, rolledCoach: false, rolledAsst: false };
  const hadCoach = !!team.coach?.id;
  const hadAsst = !!team.assistant?.id;
  ensureTeamCoach(team, opts);
  ensureTeamAssistant(team, {
    preferObscure: opts.preferStarter !== false,
    excludeIds: [...(opts.excludeIds || []), team.coach?.id].filter(Boolean),
  });
  return {
    coach: team.coach || null,
    assistant: team.assistant || null,
    rolledCoach: !hadCoach && !!team.coach?.id,
    rolledAsst: !hadAsst && !!team.assistant?.id,
  };
}

/** Only this coach's playbook — no longer auto-adds「均衡」to everyone. */
export function coachTactics(coach) {
  const raw = coach?.specialTactics?.length ? coach.specialTactics : ["balanced"];
  const ids = [...new Set(raw)];
  return ids.map((id) => TACTICS[id]).filter(Boolean);
}

/** Language-aware display fields for coaches and tactics (defaults to zh). */
export const tacticName = (t, lang = "zh") => (t ? (lang === "en" ? t.nameEn || t.name : t.name) : "");
export const tacticDesc = (t, lang = "zh") => (t ? (lang === "en" ? t.descEn || t.desc : t.desc) : "");
export const coachName = (c, lang = "zh") => (c ? (lang === "en" ? c.nameEn || c.name : c.name) : "");
export const coachStyle = (c, lang = "zh") => (c ? (lang === "en" ? c.styleEn || c.style : c.style) : "");
export const coachSpecialty = (c, lang = "zh") => (c ? (lang === "en" ? c.specialtyEn || c.specialty : c.specialty) : "");
export const coachRecordNote = (c, lang = "zh") => (c?.record ? (lang === "en" ? c.record.noteEn || c.record.note : c.record.note) : "");
export const coachNote = (c, lang = "zh") => (c ? (lang === "en" ? c.noteEn || c.note : c.note) : "");

export const asstName = (a, lang = "zh") => (a ? (lang === "en" ? a.nameEn || a.name : a.name) : "");
export const asstRole = (a, lang = "zh") => (a ? (lang === "en" ? a.roleEn || a.role : a.role) : "");
export const asstNote = (a, lang = "zh") => (a ? (lang === "en" ? a.noteEn || a.note : a.note) : "");

export function coachSpecialtyLabel(coach, lang = "zh") {
  if (!coach) return "";
  if (lang === "en" && coach.specialtyEn) return coach.specialtyEn;
  if (coach.specialty) return coach.specialty;
  const names = coachTactics(coach)
    .map((t) => tacticName(t, lang))
    .slice(0, 3);
  return names.join(" · ");
}

/** Combine HC + assistant into effective staff profile for sim. */
export function composeStaff(coach, assistant) {
  const hc = coach ? structuredClone(coach) : null;
  if (!hc) return null;
  const asst = assistant ? structuredClone(assistant) : null;
  if (asst) {
    hc.assistant = asst;
    hc.buffs = {
      offense: (hc.buffs?.offense || 0) + (asst.buffs?.offense || 0),
      defense: (hc.buffs?.defense || 0) + (asst.buffs?.defense || 0),
      morale: (hc.buffs?.morale || 0) + (asst.buffs?.morale || 0),
      stamina: (hc.buffs?.stamina || 0) + (asst.buffs?.stamina || 0),
    };
    // Obscure assistants raise autonomy/spark; famous HC alone is more rigid
    hc.playerAutonomy = clamp(
      (hc.playerAutonomy ?? fameToAutonomy(hc.fame)) + (asst.playerAutonomy || 0) * 0.85,
      5,
      99
    );
    hc.sparkPotential = clamp(
      (hc.sparkPotential ?? fameToSpark(hc.fame)) + (asst.sparkPotential || 0) * 0.9,
      5,
      99
    );
    hc.fame = Math.round(((hc.fame ?? 50) + (asst.fame || 0) * 0.25) / 1.1);
    hc.note = `${hc.note || ""}｜助教：${asst.name}（${asst.note || asst.role}）`;
  } else {
    hc.playerAutonomy = hc.playerAutonomy ?? fameToAutonomy(hc.fame);
    hc.sparkPotential = hc.sparkPotential ?? fameToSpark(hc.fame);
  }
  return hc;
}

function fameToAutonomy(fame = 50) {
  // Famous coaches control more; unknowns free the floor
  return clamp(Math.round(100 - fame * 0.75), 15, 95);
}
function fameToSpark(fame = 50) {
  return clamp(Math.round(70 - fame * 0.35 + 20), 20, 90);
}

export function isObscureStaff(coach) {
  if (!coach) return true;
  return (coach.fame ?? 50) < 40 || (coach.playerAutonomy ?? 50) >= 70;
}

/** Build / override a coach with custom philosophy sliders. */
export function applyCoachPhilosophy(coach, philosophy = {}) {
  const c = structuredClone(coach || {
    id: "custom-coach",
    name: "自定义教头",
    season: 2025,
    team: "自由身",
    style: "自定义",
    buffs: { offense: 5, defense: 5, morale: 5, stamina: 3 },
    specialTactics: ["balanced"],
    preferred: [],
    note: "玩家自定义执教方针",
    hiddenTier: "starter",
    customizable: true,
  });
  const off = clamp(Number(philosophy.offense ?? c.buffs.offense), 0, 18);
  const def = clamp(Number(philosophy.defense ?? c.buffs.defense), 0, 18);
  const morale = clamp(Number(philosophy.morale ?? c.buffs.morale), 0, 18);
  const stamina = clamp(Number(philosophy.stamina ?? c.buffs.stamina), -10, 12);
  c.buffs = { offense: off, defense: def, morale, stamina };
  c.style = philosophy.styleName || c.style || "自定义方针";
  if (Array.isArray(philosophy.tactics) && philosophy.tactics.length) {
    c.specialTactics = philosophy.tactics.filter((id) => TACTICS[id]);
  }
  if (philosophy.note) c.note = philosophy.note;
  c.philosophy = { offense: off, defense: def, morale, stamina, tactics: c.specialTactics };
  return c;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
