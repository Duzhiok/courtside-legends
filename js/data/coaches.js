/**
 * 2K-inspired playbooks. Each coach only unlocks a subset (specialTactics).
 * needs[] boost chemistry when roster tags/archetypes match.
 */
export const TACTICS = {
  balanced: {
    id: "balanced",
    name: "均衡进攻",
    desc: "四平八稳，无明显偏科；适合阵容未定型时过渡。",
    offense: 1,
    defense: 1,
    pace: 1,
    threeRate: 1,
  },
  triangle: {
    id: "triangle",
    name: "三角进攻",
    desc: "强调站位与传球角度；适合高球商巨星+内线轴心，节奏偏慢。",
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
    offense: 1.04,
    defense: 0.94,
    pace: 0.92,
    threeRate: 0.95,
    needs: ["iso_scorer", "iso_creator", "mamba", "creator"],
  },
  grind: {
    id: "grind",
    name: "铁血半场",
    desc: "降节奏、拼防守与篮板；消耗主力体力，适合硬实力硬桥硬马。",
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
export function rosterTacticUnlocks(players = []) {
  const list = players.filter(Boolean);
  const passers = list.filter(isQualityPasser);
  const bigs = list.filter(isQualityBig);
  const centers = list.filter(isQualityCenter);
  const ids = new Set();
  const reasons = {};

  if (passers.length >= 2) {
    ids.add("motion");
    ids.add("pace_space");
    reasons.motion = `双组织（${passers
      .slice(0, 2)
      .map((p) => p.name)
      .join(" / ")}）→ 动态传导`;
    reasons.pace_space = `双组织 → 魔球节奏更流畅`;
  }
  if (bigs.length >= 1 || centers.length >= 1) {
    ids.add("pnr_spam");
    ids.add("horns");
    const who = (centers[0] || bigs[0])?.name || "内线";
    reasons.pnr_spam = `优质内线 ${who} → 挡拆轰炸`;
    reasons.horns = `优质内线 → 牛角挡拆`;
  }
  if (centers.length >= 1) {
    ids.add("post_up");
    ids.add("zone_drop");
    ids.add("paint_attack");
    reasons.post_up = `中锋级内线 → 低位强打`;
    reasons.zone_drop = `护框内线 → 沉退/收缩防守`;
    reasons.paint_attack = `优质内线 → 内线进攻`;
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
    reasons.twin_towers = `双塔（${names || "两名大个子"}）`;
    reasons.crash_boards = `多名内线 → 冲抢篮板`;
    reasons.second_chance = `多名内线 → 二次进攻`;
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
  const ids = [...new Set(["balanced", ...fromCoach, ...fromRoster])];
  return ids.map((id) => TACTICS[id]).filter(Boolean);
}

/** 短说明：为何能选某战术. */
export function tacticUnlockHint(tacticId, players = []) {
  const { reasons } = rosterTacticUnlocks(players);
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
    season: 1996,
    team: "CHI",
    record: { wins: 72, losses: 10, note: "常规赛史诗 · 总冠军" },
    style: "禅师",
    specialty: "三角进攻 · 巨星管控",
    buffs: { offense: 8, defense: 6, morale: 10, stamina: 4 },
    specialTactics: ["triangle", "princeton", "flex"],
    preferred: ["goat", "connector", "rebounder", "fundamentals"],
    note: "三角为核；高球商阵容吃满",
    hiddenTier: "hof",
    fame: 95,
    playerAutonomy: 25,
    sparkPotential: 40,
  },
  {
    id: "phil-2000-lal",
    name: "菲尔·杰克逊",
    season: 2000,
    team: "LAL",
    record: { wins: 67, losses: 15, note: "常规赛榜首 · 总冠军" },
    style: "禅师",
    specialty: "三角 · 内线轴心",
    buffs: { offense: 9, defense: 5, morale: 8, stamina: 3 },
    specialTactics: ["triangle", "post_up", "flex"],
    preferred: ["dominant_big", "mamba", "fundamentals"],
    note: "OK组合三角；低位与侧翼单打结合",
    hiddenTier: "hof",
    fame: 96,
    playerAutonomy: 22,
    sparkPotential: 42,
  },
  {
    id: "kerr-2016-gsw",
    name: "史蒂夫·科尔",
    season: 2016,
    team: "GSW",
    record: { wins: 73, losses: 9, note: "常规赛纪录 · 西决出局" },
    style: "小球空间",
    specialty: "五外 · 小球 · 换防",
    buffs: { offense: 10, defense: 4, morale: 8, stamina: 5 },
    specialTactics: ["smallball", "five_out", "motion", "switch_all"],
    preferred: ["spacing_guard", "catch_shoot", "connector", "3andD"],
    note: "水花体系；空间与换防一体",
    hiddenTier: "allstar",
    fame: 88,
    playerAutonomy: 45,
    sparkPotential: 55,
  },
  {
    id: "doc-2008-bos",
    name: "道格·里弗斯",
    season: 2008,
    team: "BOS",
    record: { wins: 66, losses: 16, note: "东部第一 · 总冠军" },
    style: "鼓舞型",
    specialty: "士气 · 简单挡拆",
    buffs: { offense: 5, defense: 7, morale: 14, stamina: 4 },
    specialTactics: ["morale_boost", "horns", "iso_heavy"],
    preferred: ["versatile_big", "closer", "shooter", "two_way_wing"],
    note: "更衣室发动机；战术偏简洁",
    hiddenTier: "star",
    fame: 78,
    playerAutonomy: 50,
    sparkPotential: 52,
  },
  {
    id: "thibs-2011-chi",
    name: "汤姆·锡伯杜",
    season: 2011,
    team: "CHI",
    record: { wins: 62, losses: 20, note: "东部第一 · 东决出局" },
    style: "防守铁血",
    specialty: "铁血半场 · 沉退护框",
    buffs: { offense: 2, defense: 14, morale: 4, stamina: -6 },
    specialTactics: ["grind", "zone_drop", "switch_all"],
    preferred: ["versatile_big", "pest", "two_way_star", "competitor"],
    note: "防守优先；主力消耗极大",
    hiddenTier: "star",
    fame: 80,
    playerAutonomy: 18,
    sparkPotential: 35,
  },
  {
    id: "pop-2003-sas",
    name: "格雷格·波波维奇",
    season: 2003,
    team: "SAS",
    record: { wins: 60, losses: 22, note: "西部第一 · 总冠军" },
    style: "体系纪律",
    specialty: "传导 · 普林斯顿 · 纪律防",
    buffs: { offense: 6, defense: 12, morale: 6, stamina: 6 },
    specialTactics: ["motion", "princeton", "grind", "flex"],
    preferred: ["fundamentals", "connector", "floor_general"],
    note: "石佛体系；基础扎实才开花",
    hiddenTier: "hof",
    fame: 98,
    playerAutonomy: 20,
    sparkPotential: 48,
  },
  {
    id: "dantonio-2018-hou",
    name: "迈克·德安东尼",
    season: 2018,
    team: "HOU",
    record: { wins: 65, losses: 17, note: "西部第一 · 西决出局" },
    style: "魔球",
    specialty: "魔球 · 挡拆 · 转换",
    buffs: { offense: 11, defense: -2, morale: 3, stamina: 2 },
    specialTactics: ["pace_space", "pnr_spam", "iso_heavy", "transition"],
    preferred: ["iso_creator", "floor_general", "shooter", "spacing_guard"],
    note: "三分或禁区；中投几乎不作数",
    hiddenTier: "star",
    fame: 76,
    playerAutonomy: 55,
    sparkPotential: 50,
  },
  {
    id: "spo-2020-mia",
    name: "埃里克·斯波尔斯特拉",
    season: 2020,
    team: "MIA",
    record: { wins: 44, losses: 29, note: "泡泡园 · 总决赛" },
    style: "硬派文化",
    specialty: "换防 · 铁血 · 底角",
    buffs: { offense: 6, defense: 10, morale: 10, stamina: 8 },
    specialTactics: ["switch_all", "grind", "corner", "horns"],
    preferred: ["competitor", "switch_big", "two_way_star"],
    note: "热火文化；能防能拼才进轮换",
    hiddenTier: "allstar",
    fame: 90,
    playerAutonomy: 30,
    sparkPotential: 58,
  },
  {
    id: "nurse-2019-tor",
    name: "尼克·纳斯",
    season: 2019,
    team: "TOR",
    record: { wins: 58, losses: 24, note: "东部第二 · 总冠军" },
    style: "灵活变阵",
    specialty: "变阵 · 牛角 · 沉退",
    buffs: { offense: 7, defense: 9, morale: 7, stamina: 5 },
    specialTactics: ["horns", "zone_drop", "motion", "switch_all"],
    preferred: ["two_way_star", "ascending", "connector"],
    note: "临场变阵多；一套打不通立刻换",
    hiddenTier: "star",
    fame: 72,
    playerAutonomy: 60,
    sparkPotential: 62,
  },
  {
    id: "malone-2023-den",
    name: "迈克尔·马龙",
    season: 2023,
    team: "DEN",
    record: { wins: 53, losses: 29, note: "西部第一 · 总冠军" },
    style: "枢纽进攻",
    specialty: "挡拆枢纽 · 牛角 · 低位",
    buffs: { offense: 9, defense: 6, morale: 6, stamina: 5 },
    specialTactics: ["pnr_spam", "horns", "post_up", "motion"],
    preferred: ["playmaking_big", "creator", "catch_shoot"],
    note: "大中锋组织一切；外线接应",
    hiddenTier: "star",
    fame: 82,
    playerAutonomy: 48,
    sparkPotential: 60,
  },
  {
    id: "bud-2021-mil",
    name: "迈克·布登霍尔泽",
    season: 2021,
    team: "MIL",
    record: { wins: 46, losses: 26, note: "东部第三 · 总冠军" },
    style: "简单高效",
    specialty: "转换 · 沉退 · 底角",
    buffs: { offense: 7, defense: 7, morale: 5, stamina: 4 },
    specialTactics: ["transition", "zone_drop", "corner"],
    preferred: ["freak", "shooter", "3andD"],
    note: "简化选择；靠巨星天赋收官",
    hiddenTier: "starter",
    fame: 70,
    playerAutonomy: 58,
    sparkPotential: 55,
  },
  {
    id: "rookie-hc-2024",
    name: "新人主帅·林",
    season: 2024,
    team: "自由身",
    record: { wins: 0, losses: 0, note: "尚无执教战绩" },
    style: "放权成长",
    specialty: "自由发挥 · 轻传导",
    buffs: { offense: 4, defense: 4, morale: 8, stamina: 4 },
    specialTactics: ["freestyle", "motion", "balanced"],
    preferred: ["draft_prospect", "ascending", "creator"],
    note: "少叫战术，让新人自己找感觉",
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
    season: 2019,
    team: "G League",
    record: { wins: 22, losses: 28, note: "发展联盟中游" },
    style: "青训摸索",
    specialty: "自由发挥 · 转换",
    buffs: { offense: 3, defense: 3, morale: 6, stamina: 5 },
    specialTactics: ["freestyle", "transition", "balanced"],
    preferred: ["draft_prospect", "ascending"],
    note: "习惯带新秀跑转换，半场设计少",
    hiddenTier: "undrafted_gleague",
    fame: 12,
    playerAutonomy: 88,
    sparkPotential: 78,
    starterPool: true,
  },
  {
    id: "college-hc-2015",
    name: "大学教练·沃克",
    season: 2015,
    team: "NCAA",
    record: { wins: 18, losses: 14, note: "大学联赛苦战" },
    style: "半场纪律",
    specialty: "Flex · 铁血半场",
    buffs: { offense: 2, defense: 5, morale: 5, stamina: 2 },
    specialTactics: ["flex", "grind", "princeton"],
    preferred: ["fundamentals", "competitor"],
    note: "大学半场底子，节奏偏慢",
    hiddenTier: "bench",
    fame: 18,
    playerAutonomy: 70,
    sparkPotential: 65,
    starterPool: true,
  },
  {
    id: "asst-promoted-2021",
    name: "临时主帅·陈",
    season: 2021,
    team: "自由身",
    record: { wins: 9, losses: 17, note: "赛季中途接手" },
    style: "过渡维稳",
    specialty: "鼓舞 · 均衡",
    buffs: { offense: 3, defense: 4, morale: 7, stamina: 3 },
    specialTactics: ["morale_boost", "balanced", "horns"],
    preferred: ["connector", "ascending"],
    note: "先稳住更衣室，战术板还在抄",
    hiddenTier: "bench",
    fame: 15,
    playerAutonomy: 80,
    sparkPotential: 72,
    starterPool: true,
  },
  {
    id: "euro-hc-2017",
    name: "欧洲来客·马尔科",
    season: 2017,
    team: "EuroLeague",
    record: { wins: 14, losses: 16, note: "欧陆联赛半区" },
    style: "团队传导",
    specialty: "传导 · 牛角 · 普林斯顿",
    buffs: { offense: 5, defense: 3, morale: 4, stamina: 4 },
    specialTactics: ["motion", "horns", "princeton"],
    preferred: ["connector", "floor_general"],
    note: "传球优先，身体对抗仍在适应",
    hiddenTier: "bench",
    fame: 24,
    playerAutonomy: 75,
    sparkPotential: 68,
    starterPool: true,
  },
  {
    id: "scout-hc-2012",
    name: "球探转正·里德",
    season: 2012,
    team: "自由身",
    record: { wins: 0, losses: 0, note: "首年执教" },
    style: "球探视角",
    specialty: "底角 · 3D 空间",
    buffs: { offense: 3, defense: 3, morale: 5, stamina: 6 },
    specialTactics: ["corner", "five_out", "balanced"],
    preferred: ["draft_prospect", "ascending", "3andD"],
    note: "爱用定点射手，临场叫停偏慢",
    hiddenTier: "water_cooler",
    fame: 10,
    playerAutonomy: 85,
    sparkPotential: 80,
    starterPool: true,
  },
  {
    id: "video-hc-2018",
    name: "录像分析师·金",
    season: 2018,
    team: "自由身",
    record: { wins: 11, losses: 22, note: "重建队过渡期" },
    style: "数据试错",
    specialty: "魔球 · 挡拆轰炸",
    buffs: { offense: 4, defense: 2, morale: 4, stamina: 5 },
    specialTactics: ["pace_space", "pnr_spam", "five_out"],
    preferred: ["shooter", "spacing_guard"],
    note: "录像室点子多，现场执行打折",
    hiddenTier: "bench",
    fame: 16,
    playerAutonomy: 82,
    sparkPotential: 74,
    starterPool: true,
  },
  {
    id: "player-coach-2006",
    name: "退役球员·老霍",
    season: 2006,
    team: "自由身",
    record: { wins: 27, losses: 55, note: "乐透区苦熬" },
    style: "老哥带弟",
    specialty: "士气 · 单打 · 自由",
    buffs: { offense: 4, defense: 4, morale: 9, stamina: 2 },
    specialTactics: ["morale_boost", "iso_heavy", "freestyle"],
    preferred: ["competitor", "ascending"],
    note: "更衣室有人缘，体系谈不上复杂",
    hiddenTier: "bench",
    fame: 28,
    playerAutonomy: 78,
    sparkPotential: 70,
    starterPool: true,
  },
  {
    id: "overseas-hc-2020",
    name: "海外回流·赵",
    season: 2020,
    team: "CBA/海外",
    record: { wins: 16, losses: 20, note: "海外联赛中游" },
    style: "身体对抗优先",
    specialty: "铁血 · 低位 · 双塔",
    buffs: { offense: 3, defense: 6, morale: 5, stamina: 3 },
    specialTactics: ["grind", "post_up", "twin_towers"],
    preferred: ["competitor", "pest", "dominant_big"],
    note: "对抗与内线为主，外线空间一般",
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
    season: 2010,
    role: "进攻助教",
    buffs: { offense: 3, defense: 0, morale: 2, stamina: 1 },
    fame: 40,
    playerAutonomy: 15,
    sparkPotential: 20,
    note: "空间与投射细节",
    hiddenTier: "starter",
  },
  {
    id: "asst-casey",
    name: "助教·凯西",
    season: 2012,
    role: "防守助教",
    buffs: { offense: 0, defense: 4, morale: 1, stamina: 0 },
    fame: 55,
    playerAutonomy: 10,
    sparkPotential: 15,
    note: "半场防守纪律",
    hiddenTier: "starter",
  },
  {
    id: "asst-prunty",
    name: "助教·普朗蒂",
    season: 2018,
    role: "防守助教",
    buffs: { offense: 1, defense: 3, morale: 1, stamina: 1 },
    fame: 35,
    playerAutonomy: 20,
    sparkPotential: 25,
    note: "换防沟通",
    hiddenTier: "bench",
  },
  {
    id: "asst-unknown-lee",
    name: "助教·李（边缘）",
    season: 2021,
    role: "球员发展",
    buffs: { offense: 1, defense: 1, morale: 4, stamina: 2 },
    fame: 12,
    playerAutonomy: 35,
    sparkPotential: 55,
    note: "不出名，但擅长点燃潜力新秀",
    hiddenTier: "water_cooler",
  },
  {
    id: "asst-rookie-maya",
    name: "新人助教·玛雅",
    season: 2024,
    role: "数据分析/发展",
    buffs: { offense: 2, defense: 1, morale: 3, stamina: 2 },
    fame: 8,
    playerAutonomy: 40,
    sparkPotential: 70,
    note: "新人视角，常给球星意外自由，奇效频出",
    hiddenTier: "undrafted_gleague",
  },
  {
    id: "asst-hammons",
    name: "助教·哈蒙斯",
    season: 2016,
    role: "进攻助教",
    buffs: { offense: 3, defense: 1, morale: 2, stamina: 0 },
    fame: 30,
    playerAutonomy: 25,
    sparkPotential: 30,
    note: "挡拆细节",
    hiddenTier: "bench",
  },
  {
    id: "asst-udoka",
    name: "助教·乌度卡",
    season: 2019,
    role: "防守助教",
    buffs: { offense: 1, defense: 4, morale: 3, stamina: 1 },
    fame: 50,
    playerAutonomy: 18,
    sparkPotential: 28,
    note: "强硬防守文化",
    hiddenTier: "starter",
  },
  {
    id: "asst-unknown-zhou",
    name: "助教·周（青训）",
    season: 2023,
    role: "潜力开发",
    buffs: { offense: 2, defense: 2, morale: 5, stamina: 3 },
    fame: 5,
    playerAutonomy: 45,
    sparkPotential: 85,
    note: "几乎没人认识；对高成长球员有奇效",
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

export function coachSpecialtyLabel(coach) {
  if (!coach) return "";
  if (coach.specialty) return coach.specialty;
  const names = coachTactics(coach)
    .map((t) => t.name)
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
