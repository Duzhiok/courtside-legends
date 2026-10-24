/**
 * 技能包 = 成名技术 / 角色特质，不跟 OVR 绑定。
 * - 能力很高也可能没有技能；能力一般也可能有特殊技能（托尼·阿伦缠绕、巴蒂尔 3&D）
 * - 负面特质也算技能（慈世平/考辛斯：火爆易 T）
 * - 招牌绝技：随机触发，大幅提升命中/盖帽（非必中）
 */

import { shuffle } from "../core/seededRandom.js";
import { skillNameL } from "../i18n.js";

export const SKILL_PACKS = {
  clutch_killer: {
    id: "clutch_killer",
    name: "杀手时刻",
    desc: "胶着或末节命中提升",
    descEn: "Clutch shooting rises in close games and the fourth quarter",
    tone: "gold",
  },
  mid_maestro: {
    id: "mid_maestro",
    name: "中投大师",
    desc: "中距离出手更准",
    descEn: "Mid-range shots fall more often",
    tone: "gold",
  },
  freeze_iso: {
    id: "freeze_iso",
    name: "无解单打",
    desc: "强干扰下仍能挤出高效出手",
    descEn: "Still creates efficient looks under heavy pressure",
    tone: "gold",
  },
  dime_dropper: {
    id: "dime_dropper",
    name: "传球魔术",
    desc: "组织/分球更容易找到空位",
    descEn: "Playmaking finds open teammates more easily",
    tone: "blue",
  },
  rainmaker: {
    id: "rainmaker",
    name: "三分雨",
    desc: "外线开火更稳",
    descEn: "Perimeter shooting stays steadier",
    tone: "gold",
  },
  paint_bully: {
    id: "paint_bully",
    name: "篮下暴君",
    desc: "Bully ball：靠身体在禁区硬凿、强打造杀伤。只属于真正暴力冲击篮下的人（奥尼尔、巴克利、张伯伦…），偏技术流的内线没有",
    descEn: "Bully ball: uses strength to carve out space and draw fouls in the paint. Only for true physical interior forces (O'Neal, Barkley, Chamberlain...) — finesse bigs don't get it",
    tone: "gold",
    exclusive: true,
    curatedOnly: true,
  },
  lockdown: {
    id: "lockdown",
    name: "铁壁盯防",
    desc: "主防持球人压迫更强",
    descEn: "On-ball pressure on the ball handler gets stronger",
    tone: "blue",
  },
  thief: {
    id: "thief",
    name: "盗球鬼才",
    desc: "抢断概率提升",
    descEn: "Steal chance goes up",
    tone: "blue",
  },
  rim_protector: {
    id: "rim_protector",
    name: "护框神",
    desc: "禁区盖帽与干扰",
    descEn: "Rim blocks and contests improve",
    tone: "blue",
  },
  motor_engine: {
    id: "motor_engine",
    name: "永动机",
    desc: "体力消耗更慢，连场不轻易断电",
    descEn: "Stamina drains slower, back-to-backs rarely leave you gassed",
    tone: "purple",
  },
  iron_lungs: {
    id: "iron_lungs",
    name: "铁肺",
    desc: "恢复与连续上场极强：疲劳更慢，分钟上限接近满分",
    descEn: "Recovery and consecutive minutes are elite: fatigue builds slower, minute ceiling near max",
    tone: "purple",
    signature: true,
  },
  iron_body: {
    id: "iron_body",
    name: "铁人",
    desc: "伤病风险更低，连续作战更不易缺阵（不同于铁肺的体力）",
    descEn: "Lower injury risk, holds up better over long stretches (unlike Iron Lungs' stamina)",
    tone: "green",
  },
  gravity_well: {
    id: "gravity_well",
    name: "引力黑洞",
    desc: "吸引协防，队友空位更好",
    descEn: "Draws help defense, teammates get cleaner looks",
    tone: "purple",
  },
  ankle_breaker: {
    id: "ankle_breaker",
    name: "脚踝收割",
    desc: "一对一更容易甩开防守",
    descEn: "Easier to shake defenders one-on-one",
    tone: "gold",
  },
  rhythm_master: {
    id: "rhythm_master",
    name: "节奏大师",
    desc: "靠变速和试探步晃开防守人，不需要顶级速度——忽快忽慢打乱防守重心，持球单打更容易造出空位。对防守人的速度不敏感",
    descEn: "Uses change of pace and jab steps to lose defenders without top speed — speeding up and slowing down disrupts defensive rhythm, and isolation creation gets easier. Not sensitive to the defender's speed",
    tone: "gold",
  },
  positionless: {
    id: "positionless",
    name: "全能",
    desc: "五位置都能打；挡拆可持球可掩护；无限换防几乎不吃亏，对位谁都能顶住",
    descEn: "Can play all five spots; can handle or screen in the pick-and-roll; switching is nearly free, can hold up against anyone",
    tone: "purple",
    signature: true,
  },

  // —— 角色 / 性格特质（可挂在非巨星身上）——
  sticky_wrap: {
    id: "sticky_wrap",
    name: "缠绕盯防",
    desc: "托尼·阿伦式：贴身缠斗持球人，压迫与抢断更凶",
    descEn: "Tony Allen style: sticks to the ball handler, fiercer pressure and steals",
    tone: "blue",
    trait: true,
  },
  death_wrap: {
    id: "death_wrap",
    name: "死亡缠绕",
    desc: "卡哇伊招牌：铁钳贴防——大量榨干持球人体能，并显著抬高对位失误率",
    descEn: "Kawhi's signature: vice-grip on-ball defense — drains the ball handler's stamina heavily and sharply raises their turnover rate",
    tone: "blue",
    signature: true,
    proc: 0.48,
    stealBoost: 0.02,
  },
  stopper_3d: {
    id: "stopper_3d",
    name: "持球克星·3D",
    desc: "巴蒂尔式：防持球核很脏，定点三分也能惩罚放空",
    descEn: "Battier style: dirty defense on ball-dominant scorers, and spot-up threes punish help",
    tone: "blue",
    trait: true,
  },
  charge_taker: {
    id: "charge_taker",
    name: "造进攻犯规",
    desc: "卡位领冲好手，更容易造进攻犯规打断回合",
    descEn: "Good at taking position and drawing charges to break possessions",
    tone: "blue",
    trait: true,
  },
  hothead: {
    id: "hothead",
    name: "火爆脾气",
    desc: "慈世平/考辛斯式：情绪易燃，更容易吃技术犯规",
    descEn: "Artest/Cousins style: short fuse, more likely to pick up technicals",
    tone: "bad",
    trait: true,
    negative: true,
  },
  enforcer: {
    id: "enforcer",
    name: "场上打手",
    desc: "身体对抗凶悍，干扰强但犯规也更多",
    descEn: "Physical and disruptive, but fouls more too",
    tone: "bad",
    trait: true,
  },
  spring_board: {
    id: "spring_board",
    name: "弹跳怪物",
    desc: "半兽人式弹速：二次进攻、空接窗口与护框弹跳更炸",
    descEn: "Freak bounce: second-chance plays, lob windows and rim protection pop more",
    tone: "green",
    trait: true,
  },
  lone_wolf: {
    id: "lone_wolf",
    name: "独狼",
    desc: "一对一单打更凶；被包夹时容易忽略队友硬解（马布里 / 科比 / 艾弗森 / 安东尼）",
    descEn: "Isolation scoring gets nastier; when doubled, tends to force shots instead of finding teammates (Marbury / Kobe / Iverson / Anthony)",
    tone: "gold",
    trait: true,
  },

  // —— 球星称号技：绑定球员身份（exclusive 的不可购买）——
  lean_in_jumper: {
    id: "lean_in_jumper",
    name: "前仰跳投",
    desc: "亚历山大招牌：贴身时身体前倾起跳，中距离出手难封难盖",
    descEn: "SGA's signature: leaning into the defender on the rise, mid-range shots are hard to block or contest",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "mid",
    makeBoost: 0.24,
    openBoost: 0.08,
  },
  manimal: {
    id: "manimal",
    name: "半兽人",
    desc: "法里埃德 Manimal：身体素质暴涨 10%（速度、力量、体能、篮板、盖帽）",
    descEn: "Faried's Manimal: physical tools jump 10% (speed, strength, stamina, rebounds, blocks)",
    tone: "green",
    trait: true,
    exclusive: true,
    attributeBoost: { keys: ["speed", "strength", "stamina", "rebound", "block"], mult: 1.1 },
  },
  blind_pass: {
    id: "blind_pass",
    name: "脑后长眼",
    desc: "约基奇招牌：总能找到意想不到的空位队友，被包夹时也能传给背后的人——分球更多、接球人更空、包夹下失误更少",
    descEn: "Jokic's signature: always finds the unexpected open man, can hit the cutter behind him even when doubled — more dimes, more open receivers, fewer turnovers under pressure",
    tone: "purple",
    signature: true,
    kind: "pass",
  },
  one_leg_fade: {
    id: "one_leg_fade",
    name: "单脚抛射",
    desc: "约基奇招牌：单脚后仰高抛——被紧贴时超远三分有时也能进，禁区命中更进一步，出手点高很难被盖",
    descEn: "Jokic's signature: one-legged high-arc fade — sometimes drops from way downtown even when smothered, and paint finishing climbs further; release point is high and hard to block",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    makeBoost: 0.22,
    openBoost: 0.04,
    blockResist: 0.45,
  },
  the_answer: {
    id: "the_answer",
    name: "答案",
    desc: "艾弗森 The Answer：身材再小也敢硬冲禁区——对抗下禁区命中更稳、更难被盖；球队落后时越打越凶",
    descEn: "Iverson's The Answer: small frame or not, attacks the paint hard — steadier finishing through contact, harder to block; plays angrier when trailing",
    tone: "gold",
    exclusive: true,
    blockResist: 0.7,
  },
  mamba_spirit: {
    id: "mamba_spirit",
    name: "曼巴精神",
    desc: "科比 Mamba Spirit：永不服输——末节与落后时命中提升，被贴身的高难度出手更稳，体能消耗更慢",
    descEn: "Kobe's Mamba Spirit: never quits — fourth-quarter and comeback shooting rises, contested tough shots steady, stamina drains slower",
    tone: "gold",
    exclusive: true,
  },
  offense_kaleidoscope: {
    id: "offense_kaleidoscope",
    name: "进攻万花筒",
    desc: "卡梅隆·安东尼：三威胁持球，投、突、背身样样会——三分、中距离、禁区命中全面小幅提升，单打更容易创造空间",
    descEn: "Carmelo Anthony: triple-threat with the ball, can shoot, drive and post up — threes, mid-range and paint finishing all rise slightly, isolations create space more easily",
    tone: "gold",
  },
  wolf_king: {
    id: "wolf_king",
    name: "狼王",
    desc: "加内特的森林狼时代：场上嘶吼带动全队——同场队友防守强度提升（与防守统领效果相同），自己贴防与抢板更凶。只在森林狼赛季卡生效",
    descEn: "Garnett's Timberwolves era: roaring on court lifts the whole team — teammates defend harder on court (same effect as Defensive Captain), and his own on-ball defense and rebounding get nastier. Only active on Timberwolves season cards",
    tone: "blue",
    aura: true,
    exclusive: true,
  },
  the_truth: {
    id: "the_truth",
    name: "真理",
    desc: "皮尔斯 The Truth：不靠速度靠节奏——被紧逼时中距离和突破命中不降反升，关键时刻更稳",
    descEn: "Pierce's The Truth: rhythm over speed — mid-range and drives don't dip under tight pressure, steadier in crunch time",
    tone: "gold",
    exclusive: true,
  },
  rebound_maniac: {
    id: "rebound_maniac",
    name: "篮板痴汉",
    desc: "顶级篮板技能：扮演蓝领篮板 / 二次进攻角色（冲板、补篮指令或不拿球的角色球员）时频繁触发，抢到进攻板的概率大幅提升",
    descEn: "Elite rebounding skill: triggers often when playing a blue-collar rebounder / second-chance role (crash, putback, or off-ball role player), offensive rebound chance jumps sharply",
    tone: "green",
    signature: true,
    kind: "rebound",
    proc: 0.25,
    rebBoost: 1.7,
    blueCollarProc: 0.7,
    blueCollarOffBoost: 2.2,
  },
  stamina_monster: {
    id: "stamina_monster",
    name: "体能怪物",
    desc: "跑不死的体能：体力消耗比永动机更慢，整场保持强度",
    descEn: "Tireless stamina: drains even slower than Motor Engine, keeps intensity all game",
    tone: "purple",
  },
  god_mode: {
    id: "god_mode",
    name: "上帝附体",
    desc: "乔丹终极技能：中投偶尔触发——无论防守如何，那一球必进（末节胶着时更容易触发）",
    descEn: "Jordan's ultimate skill: mid-range shots occasionally trigger — no matter the defense, that shot goes in (more likely in close fourth quarters)",
    tone: "gold",
    signature: true,
    kind: "offense",
    exclusive: true,
    ultimate: true,
    proc: 0.045,
    zone: "mid",
    guaranteed: true,
    makeBoost: 0,
    openBoost: 0,
  },

  // —— 合卡领悟（重复抽卡合并时随机学会）——
  block_artist: {
    id: "block_artist",
    name: "火锅大师",
    desc: "盖帽嗅觉极佳，禁区干扰与火锅率提升",
    descEn: "Great block instincts, paint contests and block rate rise",
    tone: "blue",
    mergeSkill: true,
  },
  qb_outlet: {
    id: "qb_outlet",
    name: "四分卫长传",
    desc: "一传出球又远又准，突破分球/快发更容易找到空位",
    descEn: "Outlet passes fly far and true, breakout dimes and quick releases find open men more easily",
    tone: "blue",
    mergeSkill: true,
  },
  floor_commander: {
    id: "floor_commander",
    name: "场上指挥家",
    desc: "场上大脑：组织权重与传导效率提升",
    descEn: "Court general: playmaking weight and ball movement efficiency rise",
    tone: "purple",
    mergeSkill: true,
  },
  big_heart: {
    id: "big_heart",
    name: "大心脏",
    desc: "胶着与末节命中更稳，关键球不手软",
    descEn: "Steadier in close games and the fourth quarter, doesn't blink on big shots",
    tone: "gold",
    mergeSkill: true,
  },
  clean_dime: {
    id: "clean_dime",
    name: "传球稳准",
    desc: "低传球失误比：组织传导极少掉球，助攻含金量更高",
    descEn: "Low turnover passing: ball movement rarely coughs it up, assists carry more value",
    tone: "blue",
    signature: true,
    kind: "pass",
  },
  glass_cleaner: {
    id: "glass_cleaner",
    name: "篮板嗅觉",
    desc: "卡位与二次篮板更疯",
    descEn: "Box-outs and second-chance boards get wilder",
    tone: "green",
    mergeSkill: true,
  },
  first_step: {
    id: "first_step",
    name: "闪电第一步",
    desc: "启动第一步更快，更容易甩开对位",
    descEn: "Quicker first step, easier to blow past the matchup",
    tone: "gold",
    mergeSkill: true,
  },
  cold_mid: {
    id: "cold_mid",
    name: "冷血中投",
    desc: "中距离出手更冷静、更准",
    descEn: "Calmer, truer mid-range shooting",
    tone: "gold",
    mergeSkill: true,
  },
  corner_sniper: {
    id: "corner_sniper",
    name: "底角狙杀",
    desc: "弱侧/定点三分惩罚放空更狠",
    descEn: "Weak-side / spot-up threes punish help defense harder",
    tone: "gold",
    mergeSkill: true,
  },
  paint_finisher: {
    id: "paint_finisher",
    name: "禁区终结",
    desc: "杀筐与空切上篮更稳",
    descEn: "Rim attacks and cutting layups get steadier",
    tone: "gold",
    mergeSkill: true,
  },
  wing_lock: {
    id: "wing_lock",
    name: "锋线锁死",
    desc: "对位翼侧持球人压迫更强",
    descEn: "Stronger pressure on wing ball handlers",
    tone: "blue",
    mergeSkill: true,
  },

  // —— 组合技 / 光环（需队友同场或带动全队）——
  lob_city: {
    id: "lob_city",
    name: "空接之城",
    desc: "与空接搭档同场：吊传空接与篮下终结暴增（保罗×格里芬/小乔丹）",
    descEn: "With a lob partner on court: lob feeds and paint finishing explode (Paul x Griffin / Jordan)",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  splash_bros: {
    id: "splash_bros",
    name: "水花兄弟",
    desc: "Splash Brothers：库里+克莱同场时外线连携开火、无球跑位更毒，三分连带抬升",
    descEn: "Splash Brothers: Curry + Thompson together light up from outside, off-ball movement gets deadlier, threes lift each other",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  pick_roll_twins: {
    id: "pick_roll_twins",
    name: "挡拆双子",
    desc: "与挡拆搭档同场：挡拆后的中投/顺下近乎心有灵犀",
    descEn: "With a pick-and-roll partner on court: mid-range and rolls after the screen feel telepathic",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  showtime_link: {
    id: "showtime_link",
    name: "表演时刻",
    desc: "与天勾搭档同场：快攻长传与内线终结连成一体",
    descEn: "With the Skyhook partner on court: fast-break dimes and interior finishing flow as one",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  mamba_shark: {
    id: "mamba_shark",
    name: "黑曼巴与大鲨",
    desc: "科比×奥尼尔同场：内线碾压+侧翼单打互相拉开",
    descEn: "Kobe x Shaq together: interior dominance and wing isolations stretch each other",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  run_gun_link: {
    id: "run_gun_link",
    name: "七秒跑轰",
    desc: "纳什×小斯同场：提速空切与早攻暴增",
    descEn: "Nash x Stoudemire together: pace, cuts and early offense explode",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  heatles_link: {
    id: "heatles_link",
    name: "詹韦连线",
    desc: "詹姆斯×韦德同时在阵容才显示：互喂杀筐、转换连线与双持球杀伤（特殊组合技，不可学习）",
    descEn: "LeBron x Wade in the lineup to show: feeding each other at the rim, transition links and dual ball-handler damage (special combo, cannot be learned)",
    tone: "purple",
    duo: true,
    exclusive: true, // 不可购买 / 不可装给其他人
  },
  bulls_wing: {
    id: "bulls_wing",
    name: "飞人双翼",
    desc: "乔丹×皮蓬同场：攻防两端互换持球与领防",
    descEn: "Jordan x Pippen together: swapping ball-handling and lead defense on both ends",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  spurs_spine: {
    id: "spurs_spine",
    name: "马刺脊梁",
    desc: "邓肯与帕克/吉诺比利同场：基础扎实的传导与终结",
    descEn: "Duncan with Parker / Ginobili together: fundamentally sound ball movement and finishing",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  dirk_jet: {
    id: "dirk_jet",
    name: "诺天王与喷气机",
    desc: "诺维茨基×特里同场：高位策应与关键三分",
    descEn: "Nowitzki x Terry together: high-post playmaking and clutch threes",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  joker_jamal: {
    id: "joker_jamal",
    name: "二人转",
    desc: "约基奇×贾马尔·穆雷同场：偶发挡拆二人转——高位手递手、抛投与中距离互喂",
    descEn: "Jokic x Jamal Murray together: occasional two-man game — high handoffs, floaters and mid-range feeds",
    tone: "purple",
    duo: true,
    exclusive: true,
    proc: 0.42,
  },
  death_lineup: {
    id: "death_lineup",
    name: "死亡五小核",
    desc: "库里×汤普森×格林同场：空间+换防体系拉满",
    descEn: "Curry x Thompson x Green together: spacing + switching system maxed out",
    tone: "purple",
    duo: true,
    exclusive: true,
  },
  mind_unlock: {
    id: "mind_unlock",
    name: "潜能激发",
    desc: "高球商控场：同场队友得分手感与终结被激发（保罗/斯托克顿类）",
    descEn: "Unlocks potential: high-IQ floor general lifts teammates' scoring touch and finishing on court (Paul / Stockton types)",
    tone: "purple",
    aura: true,
  },
  def_captain: {
    id: "def_captain",
    name: "防守统领",
    desc: "领防核心在场：全队压迫、协防与护框同步抬升",
    descEn: "Defensive captain on court: team pressure, help and rim protection rise together",
    tone: "blue",
    aura: true,
  },

  // —— 成名绝技（signature）：随机触发 ——
  logo_range: {
    id: "logo_range",
    name: "百步穿杨",
    desc: "半场射程超远三分；手感火热时极难受干扰。慢防很难贴上，需高机动领防/缠绕才能有效压迫",
    descEn: "Logo range: ultra-deep threes from half court; nearly unguardable when hot. Slow defenders struggle to stick close — needs a high-motor lead guard or sticky defender to pressure effectively",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.13,
    zone: "three",
    makeBoost: 0.26,
    openBoost: 0.05,
  },
  bully_step: {
    id: "bully_step",
    name: "霸王步",
    desc: "詹姆斯招牌：强推弱防杀入禁区上篮",
    descEn: "LeBron's signature: bulldozes weaker defenders to the rim for layups",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.12,
    zone: "paint",
    makeBoost: 0.24,
    openBoost: 0.08,
  },
  dream_shake: {
    id: "dream_shake",
    name: "梦幻脚步",
    desc: "大梦招牌：禁区连续虚晃转身，把对手晃开再从容出手（姚明也学过）",
    descEn: "Olajuwon's signature: a string of fakes and spins in the paint, shaking defenders off before a calm finish (Yao learned it too)",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "paint",
    makeBoost: 0.25,
    openBoost: 0.14,
  },
  high_floater: {
    id: "high_floater",
    name: "高抛大师",
    desc: "约基奇式高抛：在护框人头顶把球高高抛起，弧线极高很难被盖，靠节奏而不是蛮力",
    descEn: "Jokic-style high floater: lofted over the rim protector on a huge arc, very hard to block, built on rhythm rather than power",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "paint",
    makeBoost: 0.22,
    openBoost: 0.08,
    blockResist: 0.55,
  },
  giant_stride: {
    id: "giant_stride",
    name: "大步流星",
    desc: "字母哥式大三步：一步跨过半个防守区，超大步幅直冲篮下拉杆上篮，很难被贴住",
    descEn: "Giannis-style giant strides: one step covers half the defense, huge strides straight to the rim for extended layups, hard to stick to",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "paint",
    makeBoost: 0.23,
    openBoost: 0.15,
  },
  rim_wrecker: {
    id: "rim_wrecker",
    name: "篮筐肆虐者",
    desc: "字母哥式暴力终结：快攻、转身、强起——能扣就扣，禁区终结更凶也更难被盖",
    descEn: "Giannis-style violent finishing: fast breaks, spins, power rises — dunks whenever possible, paint finishing nastier and harder to block",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "paint",
    makeBoost: 0.26,
    openBoost: 0.1,
    blockResist: 0.7,
  },
  high_tower: {
    id: "high_tower",
    name: "高塔",
    desc: "只属于身高超过奥尼尔（216cm）的特高内线：身高臂展压制，禁区与中距离高位出手更难干扰，护框存在感强",
    descEn: "Only for extra-tall bigs above O'Neal (216cm): size and length dominate, paint and high-post shots harder to contest, rim presence strong",
    tone: "gold",
    exclusive: true,
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "paint",
    makeBoost: 0.24,
    openBoost: 0.09,
  },
  uncle_drew: {
    id: "uncle_drew",
    name: "蝴蝶穿花",
    desc: "欧文招牌：变向过人后拉杆上篮 / 换手挑篮，禁区终结如蝴蝶穿花",
    descEn: "Uncle Drew: crossover into a scooping layup / hand-switch finish, paint finishing like butterflies through flowers",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "paint",
    makeBoost: 0.26,
    openBoost: 0.16,
  },
  mountain_slam: {
    id: "mountain_slam",
    name: "泰山压顶",
    desc: "奥尼尔招牌：内线强吃暴扣砸筐",
    descEn: "Shaq's signature: overpowering dunks that rattle the rim",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "paint",
    makeBoost: 0.28,
    openBoost: 0.06,
  },
  big_dipper: {
    id: "big_dipper",
    name: "大北斗指滚",
    desc: "张伯伦招牌：内线指尖柔拨 / 高举强吃",
    descEn: "Chamberlain's signature: fingertip soft touches / raised power finishes inside",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.17,
    zone: "paint",
    makeBoost: 0.29,
    openBoost: 0.07,
  },
  poster_slam: {
    id: "poster_slam",
    name: "暴力灌篮",
    desc: "起飞砸框、隔人暴扣，文字战报会写出灌篮细节",
    descEn: "Takeoff dunks, posterizing slams — the written recap spells out the dunk detail",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.19,
    zone: "paint",
    makeBoost: 0.27,
    openBoost: 0.08,
  },
  lob_finisher: {
    id: "lob_finisher",
    name: "空接终结",
    desc: "挡拆下顺空接暴扣 / 劈扣钉板",
    descEn: "Pick-and-roll lob dunks / rim-rattling slams off the bounce",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "paint",
    makeBoost: 0.26,
    openBoost: 0.14,
  },
  bank_45: {
    id: "bank_45",
    name: "45打板",
    desc: "邓肯招牌：45度打板",
    descEn: "Duncan's signature: 45-degree bank shot",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "mid",
    makeBoost: 0.27,
    openBoost: 0.04,
  },
  skyhook: {
    id: "skyhook",
    name: "天勾",
    desc: "贾巴尔招牌：天勾出手",
    descEn: "Kareem's signature: the skyhook",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "mid",
    makeBoost: 0.29,
    openBoost: 0.07,
  },
  not_in_my_house: {
    id: "not_in_my_house",
    name: "遮天蔽日",
    desc: "穆托姆博招牌：盖帽几率大幅上升",
    descEn: "Mutombo's signature: block chance jumps sharply",
    tone: "blue",
    signature: true,
    kind: "defense",
    proc: 0.18,
    blockBoost: 0.22,
  },
  chase_down_block: {
    id: "chase_down_block",
    name: "追身定板",
    desc: "詹姆斯招牌：从身后追防盖帽，钉死快攻上篮/扣篮（依赖速度，老年会失去）",
    descEn: "LeBron's signature: chase-down blocks from behind, pinning fast-break layups/dunks (relies on speed — fades with age)",
    tone: "gold",
    signature: true,
    kind: "defense",
    proc: 0.2,
    blockBoost: 0.28,
  },
  slowmo: {
    id: "slowmo",
    name: "慢三步",
    desc: "凯尔·安德森 Slow-Mo：减速变节奏造出空位后出手",
    descEn: "Kyle Anderson's Slow-Mo: slowing down and changing pace to create space before shooting",
    tone: "purple",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "mid",
    makeBoost: 0.22,
    openBoost: 0.16,
  },
  fadeaway: {
    id: "fadeaway",
    name: "后仰杀手",
    desc: "乔丹/科比类：后仰跳投，强干扰下仍高效",
    descEn: "Jordan/Kobe style: fadeaway jumpers, still efficient under heavy contest",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "mid",
    makeBoost: 0.25,
    openBoost: 0.04,
  },
  euro_step: {
    id: "euro_step",
    name: "迷踪步",
    desc: "韦德招牌迷踪步（欧洲步）：两步换向晃开防守上篮/抛投；哈登、马努同类",
    descEn: "Wade's signature Euro step: two steps changing direction to shake defenders for layups/floaters; Harden and Ginobili share the type",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "paint",
    makeBoost: 0.23,
    openBoost: 0.1,
  },
  stepback: {
    id: "stepback",
    name: "后撤步",
    desc: "哈登/东契奇类：后撤三分或中投",
    descEn: "Harden/Doncic style: step-back threes or mid-range shots",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "three",
    makeBoost: 0.24,
    openBoost: 0.08,
  },
  teardrop: {
    id: "teardrop",
    name: "抛投大师",
    desc: "纳什/保罗类：禁区前沿抛投",
    descEn: "Nash/Paul style: floaters at the edge of the paint",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "paint",
    makeBoost: 0.26,
    openBoost: 0.06,
  },
  dirk_fade: {
    id: "dirk_fade",
    name: "金鸡独立",
    desc: "诺维茨基招牌：金鸡独立后仰",
    descEn: "Nowitzki's signature: one-legged fadeaway",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.16,
    zone: "mid",
    makeBoost: 0.28,
    openBoost: 0.05,
  },
  crossover: {
    id: "crossover",
    name: "变向太极",
    desc: "艾弗森类：交叉步过人造投",
    descEn: "Iverson style: crossover dribbles to create shots",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "mid",
    makeBoost: 0.22,
    openBoost: 0.13,
  },
  dame_time: {
    id: "dame_time",
    name: "决胜时刻",
    desc: "利拉德 Dame Time：末节关键超远三分",
    descEn: "Lillard's Dame Time: clutch fourth-quarter bombs from deep",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.12,
    zone: "three",
    makeBoost: 0.27,
    openBoost: 0.04,
  },
  splash_spot: {
    id: "splash_spot",
    name: "水花接投",
    desc: "接球就投：无球跑出空位后瞬投三分（克莱本色；库里亦擅接投）",
    descEn: "Catch-and-shoot: instant threes after running off screens into space (Thompson's signature; Curry does it too)",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.15,
    zone: "three",
    makeBoost: 0.25,
    openBoost: 0.12,
  },
  coast_to_coast: {
    id: "coast_to_coast",
    name: "长驱直入",
    desc: "字母哥类：运球长驱直入暴扣/上篮",
    descEn: "Giannis style: dribbling coast to coast for dunks/layups",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "paint",
    makeBoost: 0.26,
    openBoost: 0.09,
  },
  soft_touch: {
    id: "soft_touch",
    name: "柔顺手感",
    desc: "指尖柔拨与巧打：禁区/中距离手感细腻（姚明 / 约基奇类）",
    descEn: "Soft touch: fingertip finesse and crafty finishes — delicate paint/mid-range touch (Yao / Jokic types)",
    tone: "purple",
    signature: true,
    kind: "offense",
    proc: 0.13,
    zone: "mid",
    makeBoost: 0.22,
    openBoost: 0.07,
  },
  midrange_assassin: {
    id: "midrange_assassin",
    name: "中投刺客",
    desc: "伦纳德/ defer 类：半场中距离冷血命中",
    descEn: "Leonard type: cold-blooded mid-range shooting from half court",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.14,
    zone: "mid",
    makeBoost: 0.26,
    openBoost: 0.05,
  },
  glove: {
    id: "glove",
    name: "手套",
    desc: "佩顿类：贴身抢断大幅提升",
    descEn: "Payton type: sticky steals jump sharply",
    tone: "blue",
    signature: true,
    kind: "defense",
    proc: 0.2,
    stealBoost: 0.04,
  },
  board_man: {
    id: "board_man",
    name: "篮板狂魔",
    desc: "罗德曼类：争抢篮板更疯",
    descEn: "Rodman type: rebounding goes wild",
    tone: "green",
    signature: true,
    kind: "rebound",
    proc: 0.35,
    rebBoost: 1.55,
  },
  big_shot: {
    id: "big_shot",
    name: "关键先生",
    desc: "比卢普斯/霍里类：胶着球命中暴涨",
    descEn: "Billups/Horry type: clutch shooting explodes in close games",
    tone: "gold",
    signature: true,
    kind: "offense",
    proc: 0.11,
    zone: "three",
    makeBoost: 0.3,
    openBoost: 0.03,
    clutchOnly: true,
  },
};

/**
 * 按成名技术绑定：名人堂 / 超巨可挂 2–4 个。
 * 有签名表的角色球员（如慢三步）也可持有。
 */
export const SIGNATURE_SKILLS = {
  // GOAT / 超巨
  jordami01: ["god_mode", "fadeaway", "clutch_killer", "ankle_breaker", "mid_maestro"],
  bryanko01: ["fadeaway", "mamba_spirit", "clutch_killer", "lone_wolf", "freeze_iso", "mid_maestro"],
  jamesle01: [
    "positionless",
    "bully_step",
    "chase_down_block",
    "dime_dropper",
    "clutch_killer",
    "coast_to_coast",
  ],
  duranke01: ["rainmaker", "mid_maestro", "freeze_iso", "midrange_assassin"],
  // 库里：百步穿杨（半场射程）+ 接投 + 自主变向创造 + 引力
  curryst01: ["logo_range", "splash_spot", "rainmaker", "gravity_well", "ankle_breaker"],
  hardeti01: ["stepback", "euro_step", "freeze_iso", "dime_dropper", "rainmaker", "rhythm_master"],
  hardeja01: ["stepback", "euro_step", "freeze_iso", "dime_dropper", "rainmaker", "rhythm_master"],
  westbru01: ["motor_engine", "dime_dropper", "ankle_breaker", "coast_to_coast"],
  // Derrick Rose — 劲爆第一步 / 杀筐，不是传球核
  rosede01: ["first_step", "coast_to_coast", "ankle_breaker", "clutch_killer"],
  onealsh01: ["mountain_slam", "paint_bully", "motor_engine", "rim_protector"],
  // Bully-ball 大前锋：之前一个技能都没有
  barklch01: ["paint_bully", "board_man", "coast_to_coast"],
  malonka01: ["paint_bully", "mid_maestro", "motor_engine"],
  malonmo01: ["paint_bully", "board_man", "motor_engine"],
  // Dwight Howard — 魔兽：暴扣王 / 护框 / 板霸（巅峰另有赛季叠加）
  howardw01: ["poster_slam", "rim_protector", "board_man", "paint_bully"],
  duncati01: ["bank_45", "rim_protector", "lockdown", "mid_maestro"],
  // 加内特：防守 + 中投；狼王仅森林狼赛季卡（见 SKILL_TEAM_GATES），无传球魔术 / 篮下暴君
  garneke01: ["lockdown", "mid_maestro"],
  ginobem01: ["euro_step", "clutch_killer", "ankle_breaker", "mid_maestro"],
  nashst01: ["teardrop", "dime_dropper", "rainmaker", "motor_engine"],
  stockjo01: ["teardrop", "dime_dropper", "thief", "lockdown"],
  paytoga01: ["glove", "thief", "lockdown", "dime_dropper"],
  mutomdi01: ["not_in_my_house", "rim_protector", "lockdown"],
  olajuha01: ["dream_shake", "rim_protector", "ankle_breaker"],
  robinda01: ["rim_protector", "lockdown", "motor_engine"],
  birdla01: ["clutch_killer", "rainmaker", "mid_maestro"],
  johnsma02: ["dime_dropper", "clutch_killer", "teardrop"],
  abdulka01: ["skyhook", "rim_protector", "mid_maestro"],
  // Wilt Chamberlain — 内线统治 + 篮板狂魔 + 铁人
  chambwi01: ["big_dipper", "paint_bully", "board_man", "motor_engine"],
  // 韦德：迷踪步（euro_step）+ 变向终结 + 关键球 + 抢断
  wadedw01: ["euro_step", "ankle_breaker", "clutch_killer", "thief"],
  iversal01: ["the_answer", "crossover", "lone_wolf", "ankle_breaker", "freeze_iso", "motor_engine"],
  irvinky01: ["uncle_drew", "ankle_breaker", "freeze_iso", "crossover"],
  nowitdi01: ["dirk_fade", "mid_maestro", "rainmaker", "freeze_iso"],
  // 字母哥「希腊怪物」：大步流星（大三步）+ 篮筐肆虐者（转身扣/暴扣）+ 长驱直入（快攻扣篮）
  antetgi01: ["giant_stride", "rim_wrecker", "coast_to_coast", "motor_engine", "lockdown"],
  // 约基奇：节奏型（偏软，不是 bully ball）—— 高抛 + 单脚抛射 + 脑后长眼，可当控球发起点
  jokicni01: ["one_leg_fade", "blind_pass", "high_floater", "soft_touch", "dime_dropper"],
  murraja01: ["mid_maestro", "rainmaker", "clutch_killer", "freeze_iso"],
  doncilu01: ["stepback", "dime_dropper", "freeze_iso", "mid_maestro", "rhythm_master"],
  // Joel Embiid — BRef id 是 embiijo01（旧键 embiiijo01 多了一个 i）
  // 没有篮下暴君：他是技术流，伤病体质用玻璃人标签体现（见 GLASS_CANNON_BREF）
  embiijo01: ["stepback", "mid_maestro", "freeze_iso"],
  georgpa01: ["rhythm_master", "lockdown", "midrange_assassin"],
  // Kawhi Leonard — BRef id is leonaka01（旧键 leonard01 保留兼容）
  leonaka01: ["death_wrap", "midrange_assassin", "lockdown", "clutch_killer"],
  leonard01: ["death_wrap", "midrange_assassin", "lockdown", "clutch_killer"],
  greendr01: ["lockdown", "thief", "rim_protector", "dime_dropper"],
  // Splash / Dame / 经典射手
  // 克莱：百步穿杨 + 水花接投（接球投本色）
  thompkl01: ["logo_range", "splash_spot", "rainmaker", "gravity_well"],
  lillada01: ["dame_time", "logo_range", "clutch_killer", "rainmaker"],
  allenra02: ["splash_spot", "rainmaker", "big_heart"], // 2013 Game 6：大心脏钉在史册
  // Reggie Miller — 无球跑动绕屏接投 + 大心脏（知名的 8 秒 8 分、Reggie! 时刻）
  millere01: ["splash_spot", "rainmaker", "big_heart"],
  // Oscar Robertson — 正常赛三重夹天王，组织谋划 + 中距离终结 + 场上大脑
  roberos01: ["dime_dropper", "mid_maestro", "floor_commander"],
  // Rajon Rondo — 两度联盟助攻王，08 冠军首发后卫：场上大脑 + 传球魔术 + 锁门防守
  // （他的得分数往往不高，但组织/防守站上 prod 门槛其实一直包裹了这两项）
  rondora01: ["floor_commander", "dime_dropper", "lockdown"],
  // Jimmy Butler — Heat Culture 极致：关键时刻关杀 + 无解单打 + 训练狂人一般的永动机
  butleji01: ["clutch_killer", "freeze_iso", "motor_engine"],
  // Jerry West — Mr. Clutch（真实历史外号）：无解单打 + 中距离 + 大心脏
  westje01: ["freeze_iso", "mid_maestro", "big_heart"],
  // George Gervin “冰人”—指尖柔拨的指尖打法 + 中距离 + 无解单打，四度得分王
  gervige01: ["soft_touch", "mid_maestro", "freeze_iso"],
  korveky01: ["splash_spot", "rainmaker"],
  millspa01: ["splash_spot", "rainmaker", "clutch_killer"],
  // 控卫 / 技巧
  paulch01: ["teardrop", "dime_dropper", "thief", "lockdown"],
  marbust01: ["lone_wolf", "freeze_iso", "ankle_breaker", "mid_maestro"], // 独狼
  willija02: ["dime_dropper", "ankle_breaker"], // Jason Williams flashy
  // 锋线 / 传奇
  pippesc01: ["lockdown", "thief", "dime_dropper", "motor_engine"],
  // Lob City finishers
  griffbl01: ["lob_finisher", "paint_bully", "poster_slam", "motor_engine"],
  jordade01: ["lob_finisher", "rim_protector", "paint_finisher", "board_man"],
  stoudam01: ["paint_bully", "lob_finisher", "spring_board", "motor_engine"],
  terryja01: ["splash_spot", "rainmaker", "clutch_killer"],
  // Dennis Rodman — BRef id 是 rodmade01（旧键 rodmak01 拼错，导致表内技能从未生效）
  rodmade01: ["rebound_maniac", "stamina_monster", "lockdown"],
  mcgratr01: ["stepback", "freeze_iso", "rainmaker", "clutch_killer"],
  // Vince Carter — BRef id 是 cartevi01（旧键 cartere01 其实是 Reggie Carter）
  cartevi01: ["coast_to_coast", "poster_slam", "ankle_breaker"],
  piercpa01: ["the_truth", "stepback", "clutch_killer", "mid_maestro", "freeze_iso"],
  anthoca01: ["offense_kaleidoscope", "lone_wolf", "mid_maestro", "freeze_iso"],
  billuch01: ["big_shot", "clutch_killer", "mid_maestro"],
  horryro01: ["big_shot", "clutch_killer", "rainmaker"],
  // 角色成名技
  anderky01: ["slowmo", "dime_dropper"], // Kyle Anderson Slow-Mo
  ibakase01: ["rim_protector", "mid_maestro", "lockdown"], // OKC 护框 + 中投
  // Kenneth Faried — Manimal 半兽人：身体素质 +10% / 暴扣 / 空接 / 护框
  farieke01: ["manimal", "poster_slam", "lob_finisher", "spring_board", "rim_protector"],
  // 其他超巨
  davisan02: ["rim_protector", "mid_maestro", "lockdown"],
  bookede01: ["freeze_iso", "mid_maestro", "rainmaker", "stepback"],
  youngtr01: ["teardrop", "dime_dropper", "rainmaker"],
  moranja01: ["coast_to_coast", "ankle_breaker"],
  gilgesh01: ["lean_in_jumper", "stepback", "rainmaker", "freeze_iso"],
  tatumja01: ["stepback", "mid_maestro", "freeze_iso"],
  stephcu01: ["logo_range", "splash_spot", "rainmaker", "ankle_breaker"], // alias safety
  // Zion — 篮下暴力终结：暴扣为主，暴君是强打底子
  willizi01: ["poster_slam", "paint_bully", "coast_to_coast", "first_step"],
  // 姚明 — 柔顺手感 / 梦幻脚步 / 高塔
  // 姚明：高塔 + 梦幻脚步 + 柔顺手感；伤病体质由「玻璃人」属性体现（intangibles），没有篮下暴君
  mingya01: ["soft_touch", "dream_shake", "high_tower"],
  // Tyrese Haliburton — base identity (2025 peak kit also in SEASON_SIGNATURE)
  halibty01: ["dime_dropper", "clean_dime"],
};

/**
 * Season-specific signature overlays (bref:season → skill ids).
 * Merged on top of SIGNATURE_SKILLS for that card year.
 */
export const SEASON_SIGNATURE_SKILLS = {
  // 2025 哈利：大心脏 + 极低传球失误
  "halibty01:2025": ["big_heart", "clean_dime", "dime_dropper", "floor_commander"],
  // 罗斯 MVP 峰：第一步 + 杀筐爆发拉满
  "rosede01:2011": ["first_step", "coast_to_coast", "ankle_breaker", "clutch_killer", "motor_engine"],
  "rosede01:2012": ["first_step", "coast_to_coast", "ankle_breaker", "clutch_killer"],
  // 魔兽巅峰（DPOY / 灌篮与护框统治）：暴扣 + 空接 + 弹跳 + 护框 + 板霸
  "howardw01:2008": ["poster_slam", "lob_finisher", "rim_protector", "board_man", "paint_bully", "spring_board"],
  "howardw01:2009": ["poster_slam", "lob_finisher", "rim_protector", "board_man", "paint_bully", "spring_board"],
  "howardw01:2010": ["poster_slam", "lob_finisher", "rim_protector", "board_man", "paint_bully", "spring_board"],
  "howardw01:2011": ["poster_slam", "lob_finisher", "rim_protector", "board_man", "paint_bully"],
};

/**
 * 依赖弹跳/机动/护框的技能：年龄或身体素质不达标则失去。
 * 球商/手感类（后仰、天勾、传球、关键球）不受此限。
 */
export const SKILL_ATHLETE_GATES = {
  // 比奥尼尔（216cm）还高才有高塔
  high_tower: { minHeightCm: 217 },
  giant_stride: { maxAge: 36, minSpeed: 66, minAth: 64 },
  rim_wrecker: { maxAge: 35, minSpeed: 60, minStrength: 70 },
  chase_down_block: { maxAge: 37, minSpeed: 74, minAth: 76 },
  coast_to_coast: { maxAge: 36, minSpeed: 72, minAth: 72 },
  spring_board: { maxAge: 34, minSpeed: 68, minAth: 70 },
  poster_slam: { maxAge: 33, minSpeed: 70, minAth: 70 },
  lob_finisher: { maxAge: 34, minSpeed: 64, minAth: 66 },
  first_step: { maxAge: 34, minSpeed: 74, minAth: 70 },
  ankle_breaker: { maxAge: 36, minSpeed: 68, minAth: 66 },
  crossover: { maxAge: 35, minSpeed: 70, minAth: 68 },
  euro_step: { maxAge: 36, minSpeed: 64, minAth: 60 },
  rim_protector: { maxAge: 37, minBlock: 68, minSpeed: 46, minAth: 54 },
  not_in_my_house: { maxAge: 36, minBlock: 78, minSpeed: 48, minAth: 58 },
  block_artist: { maxAge: 35, minBlock: 80, minSpeed: 50, minAth: 56 },
  motor_engine: { maxAge: 36, minStamina: 60, minAth: 52 },
  mountain_slam: { maxAge: 36, minStrength: 84, minSpeed: 36 },
  bully_step: { maxAge: 40, minStrength: 72, minSpeed: 48 },
  freeze_iso: { maxAge: 38, minSpeed: 58, minAth: 55 },
  uncle_drew: { maxAge: 35, minSpeed: 72, minAth: 68 },
  thief: { maxAge: 36, minSpeed: 66, minAth: 58 },
  glove: { maxAge: 35, minSpeed: 68, minAth: 60 },
  manimal: { maxAge: 32 },
};

/**
 * 球员专属：从该年龄起硬性失去（含该岁）。覆盖通用门槛更严的情况。
 * 例：41 岁詹姆斯失去追身定板；老年鲨鱼失去护框。
 */
export const SKILL_AGE_DROPS = {
  jamesle01: {
    chase_down_block: 38,
    coast_to_coast: 39,
  },
  onealsh01: {
    rim_protector: 34,
    motor_engine: 36,
    mountain_slam: 37,
  },
  wadedw01: {
    euro_step: 36,
    ankle_breaker: 35,
  },
  westbru01: {
    coast_to_coast: 34,
    motor_engine: 35,
  },
  antetgi01: {
    coast_to_coast: 35,
  },
  jordami01: {
    ankle_breaker: 38,
  },
  garneke01: {
    lockdown: 37,
  },
  mutomdi01: {
    not_in_my_house: 36,
    rim_protector: 37,
  },
  farieke01: {
    spring_board: 32,
    poster_slam: 33,
    lob_finisher: 34,
  },
  griffbl01: {
    lob_finisher: 32,
    poster_slam: 31,
  },
  howardw01: {
    spring_board: 32,
    poster_slam: 33,
    lob_finisher: 34,
  },
};

/** 只在特定球队的赛季卡上生效的技能（卡面 team 缩写） */
export const SKILL_TEAM_GATES = {
  wolf_king: ["MIN"],
};

/** 明确不需要任何身份技能的球员（也不吃随机通用技） */
export const SKILL_FREE_BREFS = new Set(["brownja02"]);

function athleteScore(p) {
  if (!p) return 50;
  const motor = p.intangibles?.motor ?? 50;
  return (
    (p.speed || 50) * 0.4 +
    (p.stamina || 50) * 0.2 +
    (p.steal || 40) * 0.1 +
    (p.block || 40) * 0.15 +
    motor * 0.15
  );
}

/** 是否为给该球员人工指定的身份技（签名表 / 赛季签名表） */
function isCuratedSkill(player, skillId) {
  const bref = String(player.bref || "").toLowerCase() || signatureBrefForName(player);
  if (!bref) return false;
  const season = Number(player.season) || 0;
  return (
    (SIGNATURE_SKILLS[bref] || []).includes(skillId) ||
    (SEASON_SIGNATURE_SKILLS[`${bref}:${season}`] || []).includes(skillId)
  );
}

/** 某技能在当前年龄/身体下是否仍可持有 */
export function canRetainSkill(player, skillId) {
  if (!player || !skillId) return false;
  const pack = SKILL_PACKS[skillId];
  if (!pack) return false;
  // 球队限定技能：不是该队的赛季卡就没有
  const teams = SKILL_TEAM_GATES[skillId];
  if (teams && !teams.includes(String(player.team || "").toUpperCase())) return false;
  // 人工名单技能（篮下暴君）：不在名单上就没有，买来的也不行
  if (pack.curatedOnly && !isCuratedSkill(player, skillId)) return false;
  // 身高硬门槛（高塔）：买来的也不行，矮个子学不会
  const minH = SKILL_ATHLETE_GATES[skillId]?.minHeightCm;
  if (minH != null && (player.heightCm || 0) < minH) return false;
  // 组合技 / 光环：身份链接，不因衰老脱落（仅同场才生效）
  if (pack.duo || pack.aura) return true;
  // 金币买来装上的技能：花钱学的就不因年龄/运动门槛再被摘掉
  if ((player.purchasedSkills || []).includes(skillId)) return true;

  const age = Number(player.age) || 26;
  const bref = String(player.bref || "").toLowerCase();
  const dropAt = SKILL_AGE_DROPS[bref]?.[skillId];
  if (dropAt != null && age >= dropAt) return false;

  const gate = SKILL_ATHLETE_GATES[skillId];
  if (!gate) return true;

  if (gate.maxAge != null && age > gate.maxAge) return false;
  // 人工指定的身份技只看年龄规则：卡面速度/盖帽由场均数据推算，
  // 对中锋偏低（大梦速度 43），不能因此在巨星巅峰期扣掉招牌技
  if (isCuratedSkill(player, skillId)) return true;
  if (gate.minSpeed != null && (player.speed || 50) < gate.minSpeed) return false;
  if (gate.minStamina != null && (player.stamina || 50) < gate.minStamina) return false;
  if (gate.minBlock != null && (player.block || 40) < gate.minBlock) return false;
  if (gate.minStrength != null && (player.strength || 50) < gate.minStrength) return false;
  if (gate.minAth != null && athleteScore(player) < gate.minAth) return false;
  return true;
}

/**
 * 按年龄与身体素质剪掉已失灵的技能。写回 player.skills / skillsLost。
 */
export function pruneAgedSkills(player) {
  if (!player) return player;
  const before = Array.isArray(player.skills) ? player.skills : [];
  if (!before.length) {
    player.skillsLost = player.skillsLost || [];
    return player;
  }
  const kept = [];
  const lost = [];
  for (const id of before) {
    if (canRetainSkill(player, id)) kept.push(id);
    else lost.push(id);
  }
  player.skills = kept;
  player.skillsLost = uniqSkills([...(player.skillsLost || []), ...lost]);
  return player;
}

/**
 * 组合技：双方都挂同名技能，仅当两人（或三人组）同时在场时生效。
 * pairs: [[brefA, brefB], ...]；trio: [bref, bref, bref]
 */
export const DUO_COMBOS = [
  {
    id: "lob_city",
    name: "空接之城",
    pairs: [
      ["paulch01", "griffbl01"],
      ["paulch01", "jordade01"],
    ],
  },
  {
    id: "splash_bros",
    name: "水花兄弟",
    pairs: [["curryst01", "thompkl01"]],
  },
  {
    id: "pick_roll_twins",
    name: "挡拆双子",
    pairs: [["stockjo01", "malonka01"]],
  },
  {
    id: "showtime_link",
    name: "表演时刻",
    pairs: [["johnsma02", "abdulka01"]],
  },
  {
    id: "mamba_shark",
    name: "黑曼巴与大鲨",
    pairs: [["bryanko01", "onealsh01"]],
  },
  {
    id: "run_gun_link",
    name: "七秒跑轰",
    pairs: [["nashst01", "stoudam01"]],
  },
  {
    id: "heatles_link",
    name: "詹韦连线",
    pairs: [["jamesle01", "wadedw01"]],
  },
  {
    id: "bulls_wing",
    name: "飞人双翼",
    pairs: [["jordami01", "pippesc01"]],
  },
  {
    id: "spurs_spine",
    name: "马刺脊梁",
    pairs: [
      ["duncati01", "parketo01"],
      ["duncati01", "ginobem01"],
      ["parketo01", "ginobem01"],
    ],
  },
  {
    id: "dirk_jet",
    name: "诺天王与喷气机",
    pairs: [["nowitdi01", "terryja01"]],
  },
  {
    id: "joker_jamal",
    name: "二人转",
    pairs: [["jokicni01", "murraja01"]],
  },
  {
    id: "death_lineup",
    name: "死亡五小核",
    // 库里+汤普森+格林 三人同场才满触发；两人时也能部分激活见 activeDuoIds
    trio: ["curryst01", "thompkl01", "greendr01"],
    pairs: [
      ["curryst01", "greendr01"],
      ["thompkl01", "greendr01"],
    ],
  },
];

/** 光环技能持有者（高球商激发 / 领防统领）。 */
export const AURA_HOLDERS = {
  // 潜能激发 — 传球核 / 球场大脑
  paulch01: ["mind_unlock"],
  stockjo01: ["mind_unlock"],
  nashst01: ["mind_unlock"],
  johnsma02: ["mind_unlock"],
  kiddja01: ["mind_unlock"],
  halibty01: ["mind_unlock"],
  jokicni01: ["mind_unlock"],
  // 防守统领 — 领防 / 体系防守核心
  pippesc01: ["def_captain"],
  paytoga01: ["def_captain"],
  leonaka01: ["def_captain"],
  holidjr01: ["def_captain"],
  allento01: ["def_captain"],
  greendr01: ["def_captain"],
  wallabe01: ["def_captain"],
  smartma01: ["def_captain"],
  bowenbr01: ["def_captain"],
  battish01: ["def_captain"],
  mutomdi01: ["def_captain"],
  duncati01: ["def_captain"],
  // 狼王 — 加内特：防守统领同等的全队防守光环 + 自身强度
  garneke01: ["wolf_king"],
};

/** bref → 其参与的组合技 id 列表 */
export function comboIdsForBref(bref) {
  const b = String(bref || "").toLowerCase();
  if (!b) return [];
  const ids = [];
  for (const duo of DUO_COMBOS) {
    let hit = false;
    if (duo.trio?.includes(b)) hit = true;
    for (const pair of duo.pairs || []) {
      if (pair.includes(b)) hit = true;
    }
    if (hit) ids.push(duo.id);
  }
  return uniqSkills(ids);
}

export function brefKey(p) {
  return String(p?.bref || "").toLowerCase();
}

/** 场上已激活的组合技 id */
export function activeDuoIds(onCourt = []) {
  const brefs = new Set((onCourt || []).map(brefKey).filter(Boolean));
  const out = [];
  for (const duo of DUO_COMBOS) {
    if (duo.trio?.length >= 3) {
      if (duo.trio.every((id) => brefs.has(id))) {
        out.push(duo.id);
        continue;
      }
    }
    for (const [a, b] of duo.pairs || []) {
      if (brefs.has(a) && brefs.has(b)) {
        out.push(duo.id);
        break;
      }
    }
  }
  return out;
}

export function hasActiveDuo(onCourt, duoId) {
  return activeDuoIds(onCourt).includes(duoId);
}

export function teammateHasAura(onCourt, skillId, exceptId = null) {
  return (onCourt || []).some(
    (p) => p && p.id !== exceptId && (p.skills || []).includes(skillId)
  );
}

/** 防守领袖型光环：防守统领与狼王效果相同 */
const DEFENSIVE_AURA_IDS = ["def_captain", "wolf_king"];

function isDefensiveLeader(p) {
  return DEFENSIVE_AURA_IDS.some((id) => hasSkill(p || {}, id));
}

function defensiveAuraOnCourt(onCourt, exceptId = null) {
  return DEFENSIVE_AURA_IDS.some((id) => teammateHasAura(onCourt, id, exceptId));
}

/**
 * 角色 / 性格特质：跟 OVR 无关。低能力也能有，高能力也不强制有。
 */
export const TRAIT_SKILLS = {
  // Serge Ibaka — also in SIGNATURE; keep trait empty (sig covers)
  // Tony Allen — 缠绕防守
  allento01: ["sticky_wrap", "thief", "lockdown"],
  // Shane Battier — 持球防守 + 3&D
  battish01: ["stopper_3d", "charge_taker", "rainmaker"],
  // Metta World Peace / Ron Artest — 铁防 + 火爆
  artesro01: ["sticky_wrap", "lockdown", "hothead", "enforcer"],
  // Matt Barnes — 场上恶汉：硬碰硬、干扰强、对抗凶悍
  barnema02: ["sticky_wrap", "lockdown", "enforcer"],
  // DeMarcus Cousins — 天赋内线 + 暴躁
  couside01: ["paint_bully", "hothead", "enforcer"],
  // Bruce Bowen — 脏防 / 底角三分
  bowenbr01: ["stopper_3d", "sticky_wrap", "rainmaker"],
  // Isaiah Thomas（微笑刺客，bref: thomais02 —— 注意别和活塞名宿 Isiah Thomas/thomais01 搞混，
  // 两人姓名只差一个字母，所以这里只用 bref 绑定，不走姓名正则）：5'9" 最小号里最能打的刺客，
  // 不是「场上打手」那种硬碰硬型——他的看家本领是逆天的强干扰单打效率、第四节大心脏、
  // 面对比他高一头的防守人靠抛投终结、变速晃开空间。
  thomais02: ["freeze_iso", "clutch_killer", "teardrop", "rhythm_master"],
  // Isiah Thomas（活塞坏小子队长，bref: thomais01 —— 上面那位是同姓氏的 Isaiah Thomas，两人只差一个
  // 字母，所以这里也只用 bref 绑定，不走姓名正则）：巅峰 1985 季场场均 13.9 助攻，连续一十年
  // 7-11 助攻，又是坏小子队队长；1988 总决赛 G6 拖着严重扁足的脚踝打进第四节 25 分是联盟历史最
  // 著名的忍痛打法之一。他个人身材不大（185cm），靠的是读秒和手技穿越人群，不是硬碎型，
  // 所以也不给场上打手——那是布莉姆伯/马霍金等队友的活。
  thomais01: ["floor_commander", "dime_dropper", "clutch_killer", "first_step"],
  // Draymond — already has D packs; temper is separate
  greendr01: ["hothead"],
  // Iggy
  igoudan01: ["stopper_3d", "lockdown", "dime_dropper"],
  // Avery Bradley / Jrue Holiday style stoppers (partial)
  bradlav01: ["sticky_wrap", "thief"],
  holidjr01: ["stopper_3d", "thief", "lockdown"],
  // Raja Bell
  bellra01: ["sticky_wrap", "lockdown"],
  // Kendrick Perkins / enforcer bigs
  perkike01: ["enforcer", "rim_protector"],
  // Rasheed Wallace — technicals
  wallara01: ["hothead", "mid_maestro", "lockdown"],
  // Draymond temper lite
  // already has lockdown packs; add hothead as trait merge
};

const STAR_TIERS = new Set(["star", "allstar", "superstar", "hof", "nba50"]);

function hasSkill(p, id) {
  return (p.skills || []).includes(id);
}

function pickStable(key, list, n) {
  if (!list.length || n <= 0) return [];
  const out = [];
  const pool = [...list];
  let h = 2166136261;
  const s = String(key || "x");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  while (out.length < n && pool.length) {
    const i = Math.abs(h) % pool.length;
    out.push(pool.splice(i, 1)[0]);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
  }
  return out;
}

function candidateSkills(p) {
  const a = p.archetype || "";
  const cands = new Set();
  if (/iso_|creator|mamba|scorer|versatile_scorer/.test(a)) {
    cands.add("freeze_iso");
    cands.add("ankle_breaker");
    cands.add("mid_maestro");
  }
  if (/floor_general|connector|playmaking/.test(a)) cands.add("dime_dropper");
  if (/shooter|spacing/.test(a) || (p.three || 0) >= 88) cands.add("rainmaker");
  if (/pest|two_way/.test(a) || (p.defense || 0) >= 88) cands.add("lockdown");
  if ((p.steal || 0) >= 85 || (p.raw?.spg || 0) >= 2.2) cands.add("thief");
  if ((p.block || 0) >= 85 || (p.raw?.bpg || 0) >= 2.5) cands.add("rim_protector");
  if ((p.clutch || 0) >= 85 || (p.intangibles?.killerInstinct || 0) >= 82) cands.add("clutch_killer");
  if ((p.stamina || 0) >= 88 || (p.intangibles?.motor || 0) >= 85) cands.add("motor_engine");
  if ((p.stamina || 0) >= 94 || ((p.stamina || 0) >= 90 && (p.intangibles?.motor || 0) >= 88)) {
    cands.add("iron_lungs");
  }
  if ((p.intangibles?.gravity || 0) >= 80) cands.add("gravity_well");
  if ((p.mid || 0) >= 88) cands.add("mid_maestro");
  if ((p.scoring || 0) >= 92) cands.add("freeze_iso");
  if (!cands.size) {
    cands.add("clutch_killer");
    cands.add("motor_engine");
  }
  return [...cands];
}

function uniqSkills(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (!id || !SKILL_PACKS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function namedIdentitySkills(player) {
  const bref = String(player.bref || "").toLowerCase();
  const season = Number(player.season) || 0;
  const fromSig = SIGNATURE_SKILLS[bref] || [];
  const fromSeason = SEASON_SIGNATURE_SKILLS[`${bref}:${season}`] || [];
  const fromTrait = TRAIT_SKILLS[bref] || [];
  const fromAura = AURA_HOLDERS[bref] || [];
  // 组合技（詹韦连线等）不写进单卡常驻技能——须队友同阵容才由 syncTeamDuoSkills 挂上
  let named = uniqSkills([...fromSeason, ...fromSig, ...fromTrait, ...fromAura]);
  if (!named.length) named = uniqSkills([...signatureByName(player), ...traitByName(player)]);
  else named = uniqSkills([...named, ...traitByName(player).filter((id) => !named.includes(id))]);
  if (!fromSig.length && !fromTrait.length && !fromSeason.length) {
    named = uniqSkills([...named, ...traitHeuristics(player)]);
  }
  named = uniqSkills([...named, ...fromAura]);
  return named;
}

/** 某组合技在当前名单是否已凑齐搭档（阵容级，不要求同时上场） */
export function duoActiveOnRoster(duo, rosterBrefs) {
  if (!duo || !rosterBrefs?.size) return false;
  if (duo.trio?.length >= 3 && duo.trio.every((id) => rosterBrefs.has(id))) return true;
  for (const [a, b] of duo.pairs || []) {
    if (rosterBrefs.has(a) && rosterBrefs.has(b)) return true;
  }
  return false;
}

/**
 * 按整队名单同步组合技显示：
 * 只有搭档都在阵容里时才挂上（如詹韦连线）；拆队则从技能栏移除。
 * 组合技不可被其他人学习，只由身份 + 阵容触发。
 */
export function syncTeamDuoSkills(roster = []) {
  const list = roster || [];
  const brefs = new Set(list.map(brefKey).filter(Boolean));
  for (const p of list) {
    const mine = brefKey(p);
    const keep = (p.skills || []).filter((id) => !SKILL_PACKS[id]?.duo);
    const add = [];
    for (const duo of DUO_COMBOS) {
      if (!duoActiveOnRoster(duo, brefs)) continue;
      // 仅挂在组合技身份成员身上
      let member = duo.trio?.includes(mine);
      if (!member) {
        for (const [a, b] of duo.pairs || []) {
          if (mine === a || mine === b) {
            member = true;
            break;
          }
        }
      }
      if (member) add.push(duo.id);
    }
    p.skills = uniqSkills([...keep, ...add]);
  }
  return list;
}

/**
 * Attach skills by identity — not by OVR.
 * High-tier stars without a named kit often get ZERO packs.
 * Role grinders (Tony Allen / Battier) get traits even at modest OVR.
 */
export function assignSkillPacks(player) {
  const tier = player.hiddenTier || "";
  const bref = String(player.bref || "").toLowerCase();
  if (SKILL_FREE_BREFS.has(bref)) {
    player.skills = [];
    pruneAgedSkills(player);
    return restorePurchasedSkills(player);
  }
  const named = namedIdentitySkills(player);
  const linkCount = (AURA_HOLDERS[bref] || []).length + comboIdsForBref(bref).length;
  // Duo/aura / 全能 / 多招牌身份技：放宽格数，避免巅峰魔兽等被截断
  const needsRoom = linkCount || named.includes("positionless") || named.length > 4;
  const softCap = Math.min(7, Math.max(needsRoom ? 7 : 4, named.length || 0));

  if (named.length) {
    // Prefer keeping duo/aura badges visible near the front of the chip row
    const links = named.filter((id) => SKILL_PACKS[id]?.duo || SKILL_PACKS[id]?.aura);
    const rest = named.filter((id) => !SKILL_PACKS[id]?.duo && !SKILL_PACKS[id]?.aura);
    // 金币买来装上的技能：重建身份技时必须保留，否则会「装上了但卡面消失」
    const bought = (player.purchasedSkills || []).filter(
      (id) => SKILL_PACKS[id] && !SKILL_PACKS[id].duo && !SKILL_PACKS[id].exclusive
    );
    // 已购技能优先保留，避免被招牌技挤掉后「装了却不显示」
    const room = Math.min(7, Math.max(softCap, named.length + bought.length, 4));
    player.skills = uniqSkills([...links, ...bought, ...rest]).slice(0, room);
    // Hotheads lean fiery in personality when skill present
    if (player.skills.includes("hothead") && player.personality) {
      player.personality.fiery = Math.max(player.personality.fiery || 50, 88);
      player.personality.calm = Math.min(player.personality.calm || 50, 28);
    }
    pruneAgedSkills(player);
    return restorePurchasedSkills(player);
  }

  // Famous-tier but no named kit: usually blank — 能力好≠有技能
  // Tiny stable chance of a single generic badge so the pool isn't sterile
  if (STAR_TIERS.has(tier)) {
    const roll = Math.abs(hashStr(player.id || bref)) % 100;
    if (roll < 28) {
      const cands = candidateSkills(player);
      player.skills = pickStable(player.id || bref, cands, 1);
    } else {
      player.skills = [];
    }
    pruneAgedSkills(player);
    return restorePurchasedSkills(player);
  }

  player.skills = [];
  pruneAgedSkills(player);
  return restorePurchasedSkills(player);
}

/** 把已购技能重新挂回卡面（防重建/衰老门槛误删） */
function restorePurchasedSkills(player) {
  if (!player) return player;
  const bought = (player.purchasedSkills || []).filter(
    (id) => SKILL_PACKS[id] && !SKILL_PACKS[id].duo && !SKILL_PACKS[id].exclusive
  );
  if (!bought.length) return player;
  const have = new Set(player.skills || []);
  for (const id of bought) {
    if (!have.has(id)) {
      player.skills = [...(player.skills || []), id];
      have.add(id);
    }
  }
  if (player.skillsLost?.length) {
    player.skillsLost = player.skillsLost.filter((id) => !bought.includes(id));
  }
  return player;
}

function hashStr(key) {
  let h = 2166136261;
  const s = String(key || "x");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

/** Name-based trait fallback when bref missing. */
function traitByName(player) {
  const name = `${player.nameEn || ""} ${player.name || ""}`.toLowerCase();
  if (/tony allen|托尼.?阿伦/.test(name)) return ["sticky_wrap", "thief", "lockdown"];
  if (/shane battier|巴蒂尔/.test(name)) return ["stopper_3d", "charge_taker", "rainmaker"];
  if (/metta|ron artest|world peace|慈世平|阿泰斯特/.test(name)) {
    return ["sticky_wrap", "lockdown", "hothead", "enforcer"];
  }
  if (/demarcus cousins|考辛斯|德马库斯/.test(name)) return ["paint_bully", "hothead", "enforcer"];
  if (/bruce bowen|鲍文/.test(name)) return ["stopper_3d", "sticky_wrap", "rainmaker"];
  if (/rasheed wallace|拉希德.?华莱士/.test(name)) return ["hothead", "mid_maestro", "lockdown"];
  if (/andre iguodala|伊戈达拉/.test(name)) return ["stopper_3d", "lockdown", "dime_dropper"];
  if (/jrue holiday|霍勒迪/.test(name)) return ["stopper_3d", "thief", "lockdown"];
  return [];
}

/**
 * Unlisted role players: infer a specialty from profile, not from star tier.
 * Returns 0–2 trait ids.
 */
function traitHeuristics(player) {
  const out = [];
  const def = player.defense || 50;
  const stl = player.steal || 40;
  const three = player.three || 40;
  const scoring = player.scoring || 50;
  const paint = player.paint || 50;
  const threeTend = player.threeTend || 30;
  const fiery = player.personality?.fiery || 50;
  const calm = player.personality?.calm || 50;
  const spg = player.raw?.spg || 0;
  const ppg = player.raw?.ppg || 0;

  // Lockdown wing with modest scoring → sticky wrap (Tony Allen archetype)
  if (def >= 82 && scoring <= 78 && (stl >= 72 || spg >= 1.4) && ppg < 16) {
    out.push("sticky_wrap");
  }
  // 3&D: can shoot + defend, not a primary creator
  if (def >= 78 && three >= 78 && threeTend >= 48 && scoring <= 82 && ppg < 18) {
    out.push("stopper_3d");
  }
  // Charge specialist: IQ + defense, low usage
  if (def >= 80 && (player.iq || 50) >= 78 && scoring <= 75 && ppg < 12) {
    out.push("charge_taker");
  }
  // Hothead: fiery personality or low composure bigs
  if (fiery >= 82 && calm <= 40) out.push("hothead");
  if ((player.intangibles?.composure || 50) <= 32 && (paint >= 78 || def >= 75)) {
    if (!out.includes("hothead")) out.push("hothead");
  }
  // Enforcer big / wing
  if ((player.strength || 50) >= 86 && def >= 76 && scoring <= 80) out.push("enforcer");

  return out.slice(0, 2);
}

/**
 * Name → bref for cards that arrive without a bref (custom / legacy data).
 * Kits themselves live ONLY in SIGNATURE_SKILLS / SEASON_SIGNATURE_SKILLS,
 * so a fix there automatically applies to the name fallback too.
 * Order matters: more specific patterns first.
 */
const SIGNATURE_NAME_TO_BREF = [
  [/michael jordan|乔丹/, "jordami01"],
  [/kobe|科比/, "bryanko01"],
  [/lebron|勒布朗/, "jamesle01"],
  [/durant|杜兰特/, "duranke01"],
  [/stephen curry|斯蒂芬.?库里|curry/, "curryst01"],
  [/lillard|利拉德/, "lillada01"],
  [/klay|汤普森/, "thompkl01"],
  [/wade|韦德|dwyane/, "wadedw01"],
  [/harden|哈登/, "hardeja01"],
  [/ginob|吉诺比利|manu/, "ginobem01"],
  [/magic johnson|魔术师/, "johnsma02"],
  [/iverson|艾弗森/, "iversal01"],
  [/kyrie|欧文|uncle drew/, "irvinky01"],
  [/shaq|奥尼尔|oneal|o'neal/, "onealsh01"],
  [/dwight howard|霍华德|魔兽/, "howardw01", /juwan|jaylen|jaden|howarje|howarju|howarma/i],
  [/olajuwon|大梦|奥拉朱旺/, "olajuha01"],
  [/duncan|邓肯/, "duncati01"],
  [/abdul.?jabbar|kareem abdul|贾巴尔/, "abdulka01", /rush/],
  [/kevin garnett|加内特/, "garneke01", /bill|marlon/],
  [/russell westbrook|威斯布鲁克|威少/, "westbru01"],
  [/derrick rose|德里克.?罗斯/, "rosede01"],
  [/wilt|chamberlain|张伯伦/, "chambwi01"],
  [/mutombo|穆托姆博/, "mutomdi01"],
  [/nowitzki|诺维茨基|dirk/, "nowitdi01"],
  [/giannis|字母|antetokounmpo/, "antetgi01"],
  [/joki[cć]|约基奇/, "jokicni01"],
  [/donci[cć]|东契奇|luka/, "doncilu01"],
  [/kawhi|伦纳德|卡哇伊/, "leonaka01"],
  [/chris paul|保罗/, "paulch01", /battier|george|millsap|pierce|皮尔斯/i],
  [/kyle anderson|凯尔.?安德森|slow.?mo|慢三步/, "anderky01"],
  [/haliburton|哈利伯顿/, "halibty01"],
  [/rodman|罗德曼/, "rodmade01"],
  [/pippen|皮蓬/, "pippesc01"],
  [/mcgrady|麦迪|t-?mac/, "mcgratr01"],
  [/billups|比卢普斯/, "billuch01"],
  [/horry|霍里/, "horryro01"],
  [/gary payton|加里.?佩顿|手套/, "paytoga01"],
  [/faried|法里埃德|半兽人|manimal/, "farieke01"],
  [/zion|锡安|williamson/, "willizi01"],
  [/yao ming|姚明/, "mingya01"],
  [/marbury|马布里/, "marbust01"],
  [/gilgeous|吉尔杰斯|谢伊|\bsga\b/, "gilgesh01"],
  [/carmelo|卡梅隆.?安东尼|甜瓜/, "anthoca01"],
  [/paul pierce|保罗.?皮尔斯/, "piercpa01"],
  [/charles barkley|查尔斯.?巴克利|巴克利/, "barklch01"],
  [/karl malone|卡尔.?马龙/, "malonka01", /moses/i],
  [/moses malone|摩西.?马龙/, "malonmo01"],
  [/oscar robertson|奥斯卡.?罗伯特森/, "roberos01"],
  [/jerry west|杰里.?韦斯特/, "westje01"],
  [/george gervin|乔治.?格文|冰人/, "gervige01"],
  [/reggie miller|雷吉.?米勒/, "millere01"],
  [/ray allen|雷.?阿伦/, "allenra02"],
];

export function signatureBrefForName(player) {
  const name = `${player?.nameEn || ""} ${player?.name || ""}`.toLowerCase();
  for (const [pattern, bref, exclude] of SIGNATURE_NAME_TO_BREF) {
    if (pattern.test(name) && !(exclude && exclude.test(name))) return bref;
  }
  return null;
}

function signatureByName(player) {
  const bref = signatureBrefForName(player);
  if (!bref) return [];
  const season = Number(player.season) || 0;
  return [
    ...(SEASON_SIGNATURE_SKILLS[`${bref}:${season}`] || []),
    ...(SIGNATURE_SKILLS[bref] || []),
    ...(AURA_HOLDERS[bref] || []),
  ];
}

function signatureZone(move) {
  if (move.id === "dream_shake") return Math.random() < 0.55 ? "paint" : "mid";
  if (move.id === "big_dipper") return Math.random() < 0.85 ? "paint" : "mid";
  if (move.id === "bank_45") return Math.random() < 0.65 ? "mid" : "paint";
  if (move.id === "slowmo") return Math.random() < 0.55 ? "mid" : "paint";
  if (move.id === "stepback") return Math.random() < 0.55 ? "three" : "mid";
  if (move.id === "soft_touch") return Math.random() < 0.5 ? "mid" : "paint";
  if (move.id === "high_tower") return Math.random() < 0.62 ? "paint" : "mid";
  if (move.id === "euro_step") return Math.random() < 0.75 ? "paint" : "mid";
  // 单脚抛射：禁区为主，也会超远三分
  if (move.id === "one_leg_fade") {
    const r = Math.random();
    if (r < 0.45) return "paint";
    if (r < 0.8) return "mid";
    return "three";
  }
  // 蝴蝶穿花：以拉杆上篮为主，偶发中投
  if (move.id === "uncle_drew") {
    return Math.random() < 0.78 ? "paint" : "mid";
  }
  if (move.id === "crossover") {
    const r = Math.random();
    if (r < 0.3) return "three";
    if (r < 0.7) return "mid";
    return "paint";
  }
  return move.zone || "mid";
}

/** 招牌绝技触发时的战报短句（暴扣 / 拉杆等） */
const SIG_FLAVOR_EN = {
    poster_slam: ["violent rim slam", "soaring poster off the glass", "slam tears the defence apart", "two-hand power slam"],
    mountain_slam: ["mountain slam dunk", "bullying finish at the rim", "heavy power jam"],
    lob_finisher: ["alley-oop off the glass", "rising tomahawk lob", "lob jam"],
    uncle_drew: ["butterfly crossover — up-and-under", "crossover into a finger roll", "switch-hand butterfly layup", "shakes him — scoop finish"],
    euro_step: ["euro step layup", "two-step change-of-direction roll", "euro shakes him — good", "euro step fools the defence"],
    logo_range: ["fires from half-court — good", "ultra-deep three splashes", "logo three — good", "from way downtown"],
    splash_spot: ["catch-and-shoot — good", "runs free off-ball — instant shot falls", "splash spot-up — good"],
    bully_step: ["bully step through contact — layup", "powers through the weak defence — layup"],
    coast_to_coast: ["coast-to-coast slam", "full-court drive — jam", "one-man fast break dunk"],
    teardrop: ["teardrop — good", "high soft floater drops"],
    soft_touch: ["soft touch — good", "fingertip tap falls", "feather touch rolls in"],
    dream_shake: ["dream shake fake — good", "back-to-back fakes shake him loose", "dream shake turnaround — good"],
    lean_in_jumper: ["lean-in jumper — good", "leans into contact and hits", "leaning mid-range over the defence"],
    one_leg_fade: ["one-leg floater — good", "one-leg fade, high arc — good", "creates space — one-leg shot falls"],
    god_mode: ["god mode — mid-range swish", "ignores the defence from mid-range", "for a moment, he IS god"],
    high_tower: ["high tower shot — good", "fingertip release from up high", "wingspan overwhelms — good"],
    spring_board: ["springboard slam", "second-jump dunk"],
    high_floater: ["high floater over the rim protector", "parabola floater — swish", "rhythm-stop floater off the glass"],
    giant_stride: ["giant stride past the defence — layup", "one stride into the paint — scoop", "giant strides straight to the rim"],
    rim_wrecker: ["turnaround rim-wrecker slam", "rim wrecker — power dunk", "fast-break tomahawk", "through the rim protector — dunk"],
  };
export function signatureFeedFlavor(sigId, lang = "zh") {
  if (lang === "en") {
    const poolEn = SIG_FLAVOR_EN[sigId];
    if (poolEn?.length) return poolEn[Math.floor(Math.random() * poolEn.length)];
  }
  const lines = {
    poster_slam: ["暴力灌篮砸框", "起飞隔扣钉板", "暴扣撕开防守", "双手暴扣怒砸"],
    mountain_slam: ["泰山压顶暴扣", "内线强吃砸筐", "势大力沉灌进"],
    lob_finisher: ["空接暴扣钉板", "拔地而起劈扣", "空中接力砸筐"],
    uncle_drew: ["蝴蝶穿花·拉杆上篮", "变向后拉杆挑篮", "换手蝴蝶穿花上篮", "晃过防守拉杆打进"],
    euro_step: ["迷踪步上篮", "两步换向挑篮", "迷踪步晃开打进", "欧洲步骗防上篮"],
    logo_range: ["半场开火命中", "超远三分砸进", "LOGO 三分打进", "百步穿杨"],
    splash_spot: ["接球就投命中", "无球跑出空位瞬投", "水花接投打进"],
    bully_step: ["霸王步挤抗上篮", "强推弱防杀入上篮"],
    coast_to_coast: ["全场推进暴扣", "长驱直入砸筐", "一条龙灌进"],
    teardrop: ["抛投打进", "高抛软打进筐"],
    soft_touch: ["柔拨打进", "指尖轻点入网", "柔顺手感拨进"],
    dream_shake: ["梦幻脚步虚晃打进", "连续虚晃把对手晃开出手", "梦幻脚步翻身打进"],
    lean_in_jumper: ["前仰跳投命中", "贴身前倾起跳打进", "顶着防守前仰中投"],
    one_leg_fade: ["单脚抛射打进", "单脚后仰高抛入网", "拉开身位单脚抛投"],
    god_mode: ["上帝附体，中投空心入网", "无视防守的中距离跳投", "那一刻他就是上帝"],
    high_tower: ["高塔俯射打进", "高位指尖拨进", "臂展压制砸进"],
    spring_board: ["弹跳暴起砸筐", "二次起飞灌篮"],
    high_floater: ["高抛越过护框人入网", "抛物线高抛空心", "节奏一顿高抛打板"],
    giant_stride: ["大三步跨过防守上篮", "一步跨进禁区拉杆", "大步流星直冲篮下"],
    rim_wrecker: ["转身暴扣砸筐", "篮筐肆虐·强起灌篮", "快攻起飞劈扣", "硬撼护框人扣进"],
  };
  const pool = lines[sigId];
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 非招牌触发时，禁区出手的战报风味：暴扣 / 拉杆上篮等。
 * 扣篮手、欧文类上篮手更容易刷出对应文案。
 */
export function paintFinishFeedLabel(baller, { open = 0.5, kickedOut = false, scheme = null, lang = "zh" } = {}) {
  const en = lang === "en";
  if (!baller) return null;
  const sk = baller.skills || [];
  const paint = baller.paint || 50;
  const speed = baller.speed || 50;
  const str = baller.strength || 50;
  const dunkSkill =
    sk.includes("poster_slam") ||
    sk.includes("mountain_slam") ||
    sk.includes("rim_wrecker") ||
    sk.includes("lob_finisher") ||
    sk.includes("spring_board") ||
    sk.includes("coast_to_coast");
  // 篮下暴君 + 力量型杀筐：偏暴扣，不只是上篮文案
  const bullyDunker = sk.includes("paint_bully") && paint >= 84 && str >= 72;
  const dunkAth = (paint >= 82 && speed >= 70 && str >= 66) || bullyDunker;
  const craftSkill =
    sk.includes("uncle_drew") ||
    sk.includes("euro_step") ||
    sk.includes("giant_stride") ||
    sk.includes("teardrop") ||
    sk.includes("soft_touch") ||
    sk.includes("dream_shake") ||
    sk.includes("high_tower") ||
    sk.includes("crossover");
  const craftAth = paint >= 78 && speed >= 78 && str < 82 && !dunkSkill && !bullyDunker;
  const lobWindow =
    kickedOut &&
    (sk.includes("lob_finisher") || sk.includes("spring_board")) &&
    (scheme === "pnr" || scheme === "drive_kick" || open >= 0.42);

  // 扣将略提高扣篮出镜率（招牌 > 暴君/运动型 > 高 paint）
  let dunkChance = dunkSkill ? 0.74 : bullyDunker ? 0.52 : dunkAth ? 0.4 : paint >= 88 && speed >= 68 ? 0.22 : 0.06;
  if (lobWindow) dunkChance = Math.min(0.95, dunkChance + 0.18);
  if (open >= 0.55) dunkChance = Math.min(0.92, dunkChance + 0.08);
  else if (open < 0.35 && (dunkSkill || bullyDunker)) dunkChance = Math.min(0.85, dunkChance + 0.06); // 对抗更愿砸
  const craftChance = craftSkill ? 0.55 : craftAth ? 0.28 : 0.06;

  if (Math.random() < dunkChance) {
    if (lobWindow && (sk.includes("lob_finisher") || Math.random() < 0.7)) {
      const lobs = en
        ? ["alley-oop slam", "lob jam at the rim", "rising alley-oop dunk", "lob off the glass — dunk", "rolling alley-oop dunk"]
        : ["空接暴扣", "空中接力砸筐", "拔地空接劈扣", "吊传空接钉板", "顺下空接灌篮"];
      return lobs[Math.floor(Math.random() * lobs.length)];
    }
    const dunks =
      open >= 0.55
        ? en
          ? ["two-hand slam", "soaring dunk at the rim", "uncontested slam", "windmill dunk", "tomahawk off the glass"]
          : ["双手暴扣", "起飞灌篮砸框", "无人防守暴扣", "大风车灌篮", "劈扣钉板"]
        : en
          ? ["poster dunk", "slam through contact", "power dunk", "bulldozer dunk", "rises through traffic — dunk"]
          : ["隔人暴扣", "对抗中砸筐", "强起灌篮", "硬凿暴扣", "挤抗起飞扣进"];
    return dunks[Math.floor(Math.random() * dunks.length)];
  }
  if (Math.random() < craftChance) {
    const lays = sk.includes("uncle_drew")
      ? en
        ? ["butterfly crossover — up-and-under layup", "switch-hand finger roll", "shakes the defender — layup", "soft underhand floater layup"]
        : ["蝴蝶穿花·拉杆上篮", "拉杆换手挑篮", "晃过防守上篮", "低手柔拨上篮"]
      : sk.includes("giant_stride")
        ? en
          ? ["giant-stride layup", "huge-stride scoop", "one giant step — layup", "strides over the defence — finger roll"]
          : ["大三步上篮", "超大步幅拉杆", "大步流星一步上篮", "跨过防守挑篮"]
        : sk.includes("high_tower") || sk.includes("soft_touch") || sk.includes("dream_shake")
          ? en
            ? ["high soft touch", "fingertip tap-in", "dream-shake turnaround", "hook shot — good", "crafty bank shot"]
            : ["高位柔拨", "指尖轻点入网", "梦幻脚步翻身", "勾手打进", "擦板巧打"]
          : en
            ? ["up-and-under layup", "switch-hand layup", "floater finger roll", "bank shot — good", "cutting layup"]
            : ["拉杆上篮", "换手上篮", "抛投挑篮", "擦板打进", "空切上篮"];
    return lays[Math.floor(Math.random() * lays.length)];
  }
  if (paint >= 80 && Math.random() < (bullyDunker || dunkSkill ? 0.22 : 0.35)) {
    return Math.random() < 0.45 ? (en ? "power layup" : "强打上篮") : en ? "rim attack — good" : "杀筐打进";
  }
  return null;
}

function bullyProcChance(baller, defender, base) {
  let proc = base;
  if (!defender) return proc;
  const strGap = (baller.strength || 50) - (defender.strength || 50);
  const weak =
    (defender.strength || 50) <= 58 ||
    (defender.weightKg || 95) + 12 < (baller.weightKg || 100) ||
    strGap >= 10;
  if (weak) proc += 0.12;
  else if (strGap < 0) proc *= 0.4;
  else proc += strGap * 0.004;
  return Math.min(0.38, proc);
}

/**
 * Random signature offense proc among all owned signature moves.
 */
export function trySignatureOffense(baller, defender, gameCtx = {}) {
  let sigs = (baller?.skills || [])
    .map((id) => SKILL_PACKS[id])
    .filter((m) => m?.signature && m.kind === "offense");
  if (!sigs.length) return null;
  sigs = shuffle(sigs);
  const late = (gameCtx.quarter || 1) >= 4;
  const close = Math.abs(gameCtx.scoreDiff || 0) <= 8;
  const lobFeed =
    !!gameCtx.kickedOut &&
    (gameCtx.scheme === "pnr" || gameCtx.scheme === "drive_kick" || gameCtx.fromPasser);
  for (const m of sigs) {
    if (m.clutchOnly && !(late && close)) continue;
    let proc = m.proc;
    if (m.id === "bully_step") proc = bullyProcChance(baller, defender, m.proc);
    if (m.id === "dame_time" && late) proc += 0.08;
    if (m.id === "big_shot" && late && close) proc += 0.1;
    // 挡拆/分球喂到空接手：大幅提高「空接终结」出场率
    if (m.id === "lob_finisher" && lobFeed) proc = Math.min(0.55, proc + 0.28);
    // 水花接投：被喂到空位时更易发动
    if (m.id === "splash_spot" && (lobFeed || gameCtx.kickedOut)) {
      proc = Math.min(0.48, proc + 0.14);
    }
    // 百步穿杨：手感火 / 自主持球超远开火
    if (m.id === "logo_range") {
      if ((baller.hot || 0) >= 2) proc += 0.07;
      if (!gameCtx.kickedOut) proc += 0.05; // 自主进攻拉投
      if ((baller.scoreForm ?? 50) >= 70) proc += 0.04;
    }
    // 韦德迷踪步略提高出场
    if (m.id === "euro_step" && brefKey(baller) === "wadedw01") proc += 0.04;
    // 上帝附体：末节胶着时更容易降临
    if (m.id === "god_mode" && late && close) proc += 0.045;
    if (Math.random() > proc) continue;
    const zone = signatureZone(m);
    return {
      id: m.id,
      name: m.name,
      shot: { zone, pts: zone === "three" ? 3 : 2 },
      makeBoost: m.makeBoost,
      openBoost: m.openBoost || 0,
      guaranteed: !!m.guaranteed,
      label: m.name,
    };
  }
  return null;
}

export function trySignatureBlock(defender, shot) {
  let sigs = (defender?.skills || [])
    .map((id) => SKILL_PACKS[id])
    .filter((m) => m?.signature && m.kind === "defense" && m.blockBoost);
  if (!sigs.length) return null;
  sigs = shuffle(sigs);
  for (const m of sigs) {
    let proc = m.proc;
    // 追身定板：更吃禁区/快攻终结
    if (m.id === "chase_down_block") {
      if (shot?.zone === "paint") proc = Math.min(0.42, proc + 0.12);
      else if (shot?.zone === "three") proc *= 0.55;
    }
    if (Math.random() > proc) continue;
    let boost = m.blockBoost || 0.2;
    if (m.id === "chase_down_block" && shot?.zone === "paint") boost *= 1.2;
    if (shot?.zone === "three") boost *= m.id === "chase_down_block" ? 0.45 : 0.35;
    if (shot?.zone === "mid") boost *= 0.75;
    return { id: m.id, name: m.name, blockBoost: boost, label: m.name };
  }
  return null;
}

/** Extra steal chance from Glove-type signatures (random proc). */
export function trySignatureSteal(defender) {
  const sigs = (defender?.skills || [])
    .map((id) => SKILL_PACKS[id])
    .filter((m) => m?.signature && m.stealBoost);
  for (const m of sigs) {
    if (Math.random() > m.proc) continue;
    return { id: m.id, name: m.name, stealBoost: m.stealBoost, label: m.name };
  }
  return null;
}

/** Skill description in the requested language (mirrors tacticDesc). */
export function skillDesc(packOrId, lang = "zh") {
  const pack = typeof packOrId === "string" ? SKILL_PACKS[packOrId] : packOrId;
  if (!pack) return "";
  return lang === "en" ? pack.descEn || pack.desc || "" : pack.desc || "";
}

export function skillChipsHtml(player, lang = "zh") {
  const skills = player?.skills || [];
  const nameL = (s) => skillNameL(s.name, lang);
  if (!skills.length) return "";
  const bought = new Set(player.purchasedSkills || []);
  return skills
    .map((id) => {
      const s = SKILL_PACKS[id];
      if (!s) return "";
      const tag = lang === "en"
        ? s.duo ? "Duo" : s.aura ? "Aura" : s.signature ? "Signature" : bought.has(id) ? "Owned" : ""
        : s.duo ? "组合" : s.aura ? "光环" : s.signature ? "招牌" : bought.has(id) ? "已购" : "";
      const title = tag ? `【${tag}】${skillDesc(s, lang) || s.name}` : skillDesc(s, lang) || s.name;
      const boughtCls = bought.has(id) ? " bought" : "";
      return `<span class="skill-chip ${s.tone}${s.duo ? " duo" : ""}${s.aura ? " aura" : ""}${boughtCls}" title="${title}">${nameL(s)}</span>`;
    })
    .join("");
}

export function skillsLabel(player) {
  return (player?.skills || [])
    .map((id) => SKILL_PACKS[id]?.name)
    .filter(Boolean)
    .join(" · ");
}

/** Rating keys bumped +1 on each card merge (capped at 100). */
export const MERGE_ATTR_KEYS = [
  "scoring",
  "three",
  "mid",
  "paint",
  "defense",
  "rebound",
  "pass",
  "speed",
  "strength",
  "stamina",
  "iq",
  "clutch",
  "steal",
  "block",
];

/** 是否可被购买 / 学习（组合技与专属技一律否） */
export function isLearnableSkill(skillId) {
  const s = SKILL_PACKS[skillId];
  if (!s) return false;
  if (s.negative || s.tone === "bad") return false;
  if (s.duo || s.exclusive) return false;
  return true;
}

/** 给球员挂上一个技能包（已有则 false）。组合技不可学习。 */
export function grantSkillToPlayer(player, skillId) {
  if (!player || !skillId || !SKILL_PACKS[skillId]) return false;
  if (!isLearnableSkill(skillId)) return false;
  const have = new Set(player.skills || []);
  if (have.has(skillId)) return false;
  player.skills = [...(player.skills || []), skillId];
  return true;
}

/** 非组合技技能位占用数（上限约 7） */
export function nonDuoSkillCount(player) {
  return (player?.skills || []).filter((id) => !SKILL_PACKS[id]?.duo).length;
}

/** 可卸下的技能：组合技除外，且必须是用技能碎片买来装上的。
 * 球员自带的签名技/领悟技/随机获得的不列在内——不过是不能卸，列出来让人点了再被拒绝没意义。 */
export function removableSkills(player) {
  const purchased = new Set(player?.purchasedSkills || []);
  return (player?.skills || []).filter((id) => SKILL_PACKS[id] && !SKILL_PACKS[id].duo && purchased.has(id));
}

/**
 * 卸下技能。组合技不可卸；球员自带的技能（签名技/领悟/随机获得的，总之没花过技能碎片买）
 * 同样不可卸——卸了既不会退任何东西（它本来就不是买来的，没有碎片可退），也会让同一张卡
 * 下次重建（存档迁移、roster 刷新）时又把技能加回来，卸的动作只是糊弄自己。
 * 只有「用技能碎片买来装上的」才能卸下，并退回技能库。
 */
export function removeSkillFromPlayer(player, skillId) {
  if (!player || !skillId) return { ok: false, reason: "无效" };
  const pack = SKILL_PACKS[skillId];
  if (!pack) return { ok: false, reason: "未知技能" };
  if (pack.duo) return { ok: false, reason: "组合技随阵容显隐，不可手动卸" };
  if (!(player.skills || []).includes(skillId)) return { ok: false, reason: "球员没有该技能" };

  const wasPurchased = (player.purchasedSkills || []).includes(skillId);
  if (!wasPurchased) {
    return { ok: false, reason: "球员自带的技能（非购买获得），不能卸下" };
  }

  player.skills = (player.skills || []).filter((id) => id !== skillId);
  const paid = Number(player.purchasedSkillCosts?.[skillId]) || skillPackShopPrice(skillId);
  player.purchasedSkills = (player.purchasedSkills || []).filter((id) => id !== skillId);
  if (player.purchasedSkillCosts) delete player.purchasedSkillCosts[skillId];
  return {
    ok: true,
    returnToInv: {
      id: skillId,
      name: pack.name,
      desc: pack.desc || "",
      rarity: skillRarity(skillId),
      rarityLabel: SKILL_RARITY_LABEL[skillRarity(skillId)] || "",
      cost: paid,
    },
  };
}

/** 金币商店可售技能（不含组合技 / 专属技 / 负面）. */
export function listBuyableSkillPacks() {
  return Object.values(SKILL_PACKS).filter((s) => s && isLearnableSkill(s.id));
}

/**
 * 技能稀有度 → 标价（对齐球员金币身价）：
 * mythic ≈ 超级球星（¤500+）；legendary ≈ 全明星；epic ≈ 优质首发；rare/common 更便宜。
 */
export const SKILL_RARITY_PRICE = {
  mythic: 520,
  legendary: 360,
  epic: 220,
  rare: 130,
  common: 70,
};

export const SKILL_RARITY_LABEL = {
  mythic: "神话",
  legendary: "传奇",
  epic: "史诗",
  rare: "稀有",
  common: "普通",
};

/** 显式稀有度（未列出的按 signature/tone 推断） */
export const SKILL_RARITY = {
  // 神话：最好的技能，定价≈超巨
  iron_lungs: "mythic",
  motor_engine: "mythic",
  iron_body: "legendary",
  positionless: "mythic",
  chase_down_block: "mythic",
  logo_range: "mythic",
  mountain_slam: "mythic",
  dame_time: "mythic",
  fadeaway: "mythic",
  mind_unlock: "mythic",
  def_captain: "mythic",
  gravity_well: "mythic",
  bully_step: "mythic",
  dream_shake: "mythic",
  high_tower: "mythic",
  skyhook: "mythic",
  not_in_my_house: "mythic",
  uncle_drew: "mythic",
  rim_wrecker: "mythic",
  giant_stride: "legendary",
  high_floater: "legendary",
  big_dipper: "mythic",
  god_mode: "mythic",
  one_leg_fade: "mythic",
  blind_pass: "mythic",
  mamba_spirit: "mythic",
  wolf_king: "mythic",
  stamina_monster: "mythic",
  // 传奇
  lean_in_jumper: "legendary",
  the_answer: "legendary",
  the_truth: "legendary",
  offense_kaleidoscope: "legendary",
  manimal: "legendary",
  rebound_maniac: "mythic",
  clutch_killer: "legendary",
  freeze_iso: "legendary",
  ankle_breaker: "legendary",
  rainmaker: "legendary",
  paint_bully: "legendary",
  big_heart: "legendary",
  stepback: "legendary",
  euro_step: "legendary",
  crossover: "legendary",
  dirk_fade: "legendary",
  splash_spot: "legendary",
  coast_to_coast: "legendary",
  soft_touch: "legendary",
  midrange_assassin: "legendary",
  bank_45: "legendary",
  poster_slam: "legendary",
  lob_finisher: "legendary",
  teardrop: "legendary",
  slowmo: "legendary",
  // 史诗
  mid_maestro: "epic",
  lockdown: "epic",
  death_wrap: "mythic",
  rim_protector: "epic",
  first_step: "epic",
  cold_mid: "epic",
  corner_sniper: "epic",
  paint_finisher: "epic",
  floor_commander: "epic",
  spring_board: "epic",
  lone_wolf: "epic",
  board_man: "epic",
  glove: "epic",
  big_shot: "epic",
  // 稀有
  dime_dropper: "rare",
  thief: "rare",
  sticky_wrap: "rare",
  stopper_3d: "rare",
  charge_taker: "rare",
  block_artist: "rare",
  qb_outlet: "rare",
  clean_dime: "rare",
  wing_lock: "rare",
  // 普通
  glass_cleaner: "common",
};

export function skillRarity(packOrId) {
  const id = typeof packOrId === "string" ? packOrId : packOrId?.id;
  if (id && SKILL_RARITY[id]) return SKILL_RARITY[id];
  const pack = typeof packOrId === "string" ? SKILL_PACKS[packOrId] : packOrId;
  if (!pack) return "common";
  if (pack.signature) return "legendary";
  if (pack.aura) return "legendary";
  if (pack.tone === "purple") return "epic";
  if (pack.tone === "gold") return "epic";
  if (pack.mergeSkill || pack.trait) return "rare";
  return "common";
}

/** 技能包市场标价（按稀有度；神话≈超巨身价） */
export function skillPackShopPrice(packOrId) {
  const rarity = skillRarity(packOrId);
  return SKILL_RARITY_PRICE[rarity] ?? SKILL_RARITY_PRICE.common;
}

/** 卖掉球员时，已购并装上的技能包变现比例（相对买入价） */
export const SKILL_SELL_RATE = 0.55;

/** 记录「金币买来并装上」的技能，卖人时可按价变现 */
export function markPurchasedSkill(player, skillId, paidCost) {
  if (!player || !skillId) return;
  if (!Array.isArray(player.purchasedSkills)) player.purchasedSkills = [];
  if (!player.purchasedSkills.includes(skillId)) player.purchasedSkills.push(skillId);
  if (!player.purchasedSkillCosts || typeof player.purchasedSkillCosts !== "object") {
    player.purchasedSkillCosts = {};
  }
  const cost = Number(paidCost);
  player.purchasedSkillCosts[skillId] =
    Number.isFinite(cost) && cost > 0 ? cost : skillPackShopPrice(skillId);
}

/** 身上仍带着的已购技能可变现总额 */
export function purchasedSkillsRefund(player, rate = SKILL_SELL_RATE) {
  const have = new Set(player?.skills || []);
  const ids = (player?.purchasedSkills || []).filter((id) => have.has(id));
  let gold = 0;
  const lines = [];
  for (const id of ids) {
    const base = Number(player.purchasedSkillCosts?.[id]) || skillPackShopPrice(id);
    const refund = Math.round(base * rate);
    gold += refund;
    lines.push({
      id,
      name: SKILL_PACKS[id]?.name || id,
      paid: base,
      refund,
    });
  }
  return { gold, lines };
}

/** 货架高光：体力 / 耐久类（玩家常找的铁肺·永动机·铁人） */
const SHOP_DURABILITY_IDS = ["iron_lungs", "motor_engine", "iron_body"];

function offerFromPack(s, lang = "zh") {
  const rarity = skillRarity(s);
  return {
    id: s.id,
    name: skillNameL(s.name, lang),
    desc: skillDesc(s, lang),
    tone: s.tone || "blue",
    rarity,
    rarityLabel: SKILL_RARITY_LABEL[rarity] || rarity,
    cost: skillPackShopPrice(s),
  };
}

// Tier-ordered pick that NEVER falls back to an avoided skill: it returns
// null when the ordered tiers hold no fresh skill, so the caller can try
// other tiers and only top up from avoided skills as a last resort.
function pickFromTier(tiers, order, seen, avoid = null) {
  for (const r of order) {
    const list = (tiers[r] || []).filter((s) => !seen.has(s.id));
    if (!list.length) continue;
    const fresh = avoid ? list.filter((s) => !avoid.has(s.id)) : list;
    if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  }
  return null;
}

function buildRarityTiers(block) {
  const tiers = { mythic: [], legendary: [], epic: [], rare: [], common: [] };
  for (const s of listBuyableSkillPacks()) {
    if (block.has(s.id)) continue;
    const r = skillRarity(s);
    (tiers[r] || tiers.common).push(s);
  }
  return tiers;
}

/**
 * 随机抽出一柜技能包货架。
 * 分层保底：至少 1 个神话/传奇、1 个史诗，并提高铁肺/永动机/铁人曝光；
 * excludeIds 用于刷新时避开上一柜，减少「来回就那几样」。
 * @returns {{ id, name, desc, tone, cost, rarity, rarityLabel }[]}
 */
export function rollSkillShopOffers(size = 6, excludeIds = [], avoidIds = null, lang = "zh") {
  const softBlock = new Set(excludeIds || []);
  let tiers = buildRarityTiers(softBlock);
  // 若软屏蔽把某档抽空，放开该档重来
  const refillIfEmpty = (r) => {
    if ((tiers[r] || []).length) return;
    for (const s of listBuyableSkillPacks()) {
      if (skillRarity(s) === r) (tiers[r] || (tiers[r] = [])).push(s);
    }
  };
  ["mythic", "legendary", "epic", "rare", "common"].forEach(refillIfEmpty);

  const picks = [];
  const seen = new Set();
  const take = (s) => {
    if (!s || seen.has(s.id) || picks.length >= size) return false;
    seen.add(s.id);
    picks.push(offerFromPack(s, lang));
    return true;
  };

  // ① 高光位：约 28% 神话、42% 传奇、30% 史诗；其中一半偏向体力三件套
  const roll = Math.random();
  const highOrder =
    roll < 0.28 ? ["mythic", "legendary", "epic"] : roll < 0.7 ? ["legendary", "mythic", "epic"] : ["epic", "legendary", "mythic"];
  if (Math.random() < 0.5) {
    const dura = SHOP_DURABILITY_IDS.map((id) => SKILL_PACKS[id]).filter(
      (s) => s && isLearnableSkill(s.id) && !seen.has(s.id)
    );
    // 仍尊重软屏蔽，但若全被屏蔽则忽略屏蔽；同档内优先非已拥有技能
    let duraPool = dura.filter((s) => !softBlock.has(s.id));
    if (!duraPool.length) duraPool = dura;
    const duraFresh = avoidIds ? duraPool.filter((s) => !avoidIds.has(s.id)) : duraPool;
    if (duraFresh.length) duraPool = duraFresh;
    if (duraPool.length) take(duraPool[Math.floor(Math.random() * duraPool.length)]);
  }
  if (picks.length < 1) take(pickFromTier(tiers, highOrder, seen, avoidIds));

  // ② 史诗保底
  take(pickFromTier(tiers, ["epic", "legendary", "rare"], seen, avoidIds));

  // ③ 再补一档偏传奇/史诗，避免货架全是普通
  if (Math.random() < 0.65) {
    take(pickFromTier(tiers, ["legendary", "epic", "mythic", "rare"], seen, avoidIds));
  }

  // ④ 其余：稀有/普通为主，偶尔塞史诗
  const fillOrder =
    Math.random() < 0.2
      ? ["epic", "rare", "common", "legendary"]
      : ["rare", "common", "epic", "legendary"];
  let guard = 0;
  while (picks.length < size && guard++ < 80) {
    const s = pickFromTier(tiers, fillOrder, seen, avoidIds);
    if (!s) break;
    take(s);
  }

  // 最后补位：先取未屏蔽的 fresh 技能，实在不够再放宽到已拥有技能，
  // 保证货架永远满格，同时已拥有技能只在别无选择时出现。
  while (picks.length < size) {
    const base = listBuyableSkillPacks().filter((x) => !seen.has(x.id));
    const unblocked = base.filter((x) => !softBlock.has(x.id));
    const poolA = unblocked.length ? unblocked : base;
    const fresh = avoidIds ? poolA.filter((x) => !avoidIds.has(x.id)) : poolA;
    const pool = fresh.length ? fresh : poolA;
    if (!pool.length) break;
    take(pool[Math.floor(Math.random() * pool.length)]);
  }

  return shuffle(picks);
}

export function skillMakeBonus(baller, shot, { quarter = 1, scoreDiff = 0, open = 0.5, onCourt = null } = {}) {
  let b = 0;
  if (!baller) return 0;
  const close = Math.abs(scoreDiff) <= 8;
  const late = quarter >= 4;
  const court = onCourt || [];
  const duos = activeDuoIds(court);
  if (hasSkill(baller, "clutch_killer") && (close || late)) b += close && late ? 0.045 : 0.028;
  if (hasSkill(baller, "big_heart") && (close || late)) b += close && late ? 0.04 : 0.022;
  if (hasSkill(baller, "mid_maestro") && shot?.zone === "mid") b += 0.038;
  if (hasSkill(baller, "cold_mid") && shot?.zone === "mid") b += 0.032;
  if (hasSkill(baller, "rainmaker") && shot?.zone === "three") b += 0.032;
  if (hasSkill(baller, "corner_sniper") && shot?.zone === "three" && open >= 0.45) b += 0.03;
  // 百步穿杨：半场射程；手感来了时强干扰仍稳
  if (hasSkill(baller, "logo_range") && shot?.zone === "three") {
    b += 0.02;
    const hot = baller.hot || 0;
    const form = baller.scoreForm ?? 50;
    if (hot >= 2 || form >= 68) {
      b += 0.032 + Math.max(0, 0.45 - open) * 0.14;
    } else if (open < 0.38) {
      b += 0.012; // 冷手也比普通人更敢超远硬解
    }
  }
  // 水花接投：空位/传导后的接球投更准
  if (hasSkill(baller, "splash_spot") && shot?.zone === "three" && open >= 0.4) {
    b += 0.026 + (open - 0.4) * 0.04;
  }
  if (hasSkill(baller, "paint_bully") && shot?.zone === "paint") b += 0.035;
  if (hasSkill(baller, "big_dipper") && shot?.zone === "paint") b += 0.04;
  if (hasSkill(baller, "soft_touch") && (shot?.zone === "paint" || shot?.zone === "mid")) b += 0.028;
  if (hasSkill(baller, "high_tower")) {
    if (shot?.zone === "paint") b += 0.032;
    else if (shot?.zone === "mid") b += 0.022;
  }
  if (hasSkill(baller, "paint_finisher") && shot?.zone === "paint") b += 0.028;
  if (hasSkill(baller, "spring_board") && shot?.zone === "paint") b += 0.02;
  if (hasSkill(baller, "lob_finisher") && shot?.zone === "paint" && open >= 0.4) b += 0.022;
  if (hasSkill(baller, "freeze_iso") && open < 0.42) b += 0.04;
  if (hasSkill(baller, "ankle_breaker") && open >= 0.5) b += 0.012;
  if (hasSkill(baller, "first_step") && open >= 0.42) b += 0.015;
  if (hasSkill(baller, "midrange_assassin") && shot?.zone === "mid") b += 0.02;
  // 独狼：一对一窗口准；极度挤压（包夹感）时硬解掉准
  if (hasSkill(baller, "lone_wolf")) {
    if (open >= 0.38 && open <= 0.62) b += 0.038; // 单打甜区
    else if (open < 0.3) b -= 0.045; // 被包夹仍硬解
  }
  // Battier 3&D: punish open catch-and-shoot
  if (hasSkill(baller, "stopper_3d") && shot?.zone === "three" && open >= 0.48) b += 0.028;

  // —— 球星称号技 ——
  const trailing = scoreDiff < 0;
  // 单脚抛射：禁区更进一步；被紧贴的超远三分也有机会
  if (hasSkill(baller, "one_leg_fade")) {
    if (shot?.zone === "paint") b += 0.03;
    else if (shot?.zone === "three" && open < 0.4) b += 0.024;
    else if (shot?.zone === "mid") b += 0.012;
  }
  // 答案：对抗下硬冲禁区；落后时越打越凶
  if (hasSkill(baller, "the_answer")) {
    if (shot?.zone === "paint" && open < 0.5) b += 0.035;
    if (trailing) b += 0.02;
  }
  // 曼巴精神：末节、落后、高难度出手更稳
  if (hasSkill(baller, "mamba_spirit")) {
    if (late) b += 0.022;
    if (trailing) b += 0.015;
    if (open < 0.4) b += 0.02;
  }
  // 真理：被紧逼时中距离/突破不降反升，关键时刻更稳
  if (hasSkill(baller, "the_truth")) {
    if ((shot?.zone === "mid" || shot?.zone === "paint") && open < 0.42) b += 0.032;
    if (late && close) b += 0.02;
  }
  // 进攻万花筒：三个区域全面小幅提升
  if (hasSkill(baller, "offense_kaleidoscope") && shot?.zone) b += 0.022;

  // —— 光环：高球商激发队友 ——
  if (teammateHasAura(court, "mind_unlock", baller.id) && !hasSkill(baller, "mind_unlock")) {
    if (shot?.zone === "paint") b += 0.028;
    else if (shot?.zone === "mid") b += 0.018;
    else if (shot?.zone === "three" && open >= 0.42) b += 0.014;
    if ((baller.scoring || 50) >= 78 || (baller.raw?.ppg || 0) >= 16) b += 0.01;
  }

  // —— 组合技（双方同场才吃满）——
  if (duos.includes("lob_city") && shot?.zone === "paint") {
    const bref = brefKey(baller);
    if (bref === "griffbl01" || bref === "jordade01" || hasSkill(baller, "lob_finisher")) b += 0.045;
    if (bref === "paulch01" && open >= 0.35) b += 0.012; // CP3 mid-range pocket off lob threat
  }
  if (duos.includes("splash_bros") && shot?.zone === "three") b += 0.032;
  if (duos.includes("death_lineup") && shot?.zone === "three") b += 0.018;
  if (duos.includes("pick_roll_twins")) {
    if (shot?.zone === "mid") b += 0.028;
    if (shot?.zone === "paint") b += 0.022;
  }
  if (duos.includes("showtime_link") && shot?.zone === "paint") b += 0.03;
  if (duos.includes("mamba_shark")) {
    if (shot?.zone === "paint" && brefKey(baller) === "onealsh01") b += 0.035;
    if (shot?.zone === "mid" && brefKey(baller) === "bryanko01") b += 0.025;
  }
  if (duos.includes("run_gun_link") && (shot?.zone === "paint" || open >= 0.48)) b += 0.024;
  if (duos.includes("heatles_link")) {
    const bref = brefKey(baller);
    if (bref === "jamesle01" || bref === "wadedw01") {
      if (shot?.zone === "paint") b += 0.038;
      else if (shot?.zone === "mid") b += 0.028;
      else if (shot?.zone === "three" && open >= 0.45) b += 0.012;
    } else if (shot?.zone === "paint" || shot?.zone === "mid") {
      b += 0.012; // 弱侧吃到双核扯防
    }
  }
  if (duos.includes("bulls_wing") && (close || late || shot?.zone === "mid")) b += 0.02;
  if (duos.includes("spurs_spine") && (shot?.zone === "mid" || shot?.zone === "paint")) b += 0.018;
  if (duos.includes("dirk_jet")) {
    if (shot?.zone === "mid" && brefKey(baller) === "nowitdi01") b += 0.03;
    if (shot?.zone === "three" && brefKey(baller) === "terryja01") b += 0.028;
  }
  if (duos.includes("joker_jamal")) {
    const bref = brefKey(baller);
    const proc = Math.random() < (SKILL_PACKS.joker_jamal.proc || 0.42);
    if (bref === "jokicni01" || bref === "murraja01") {
      // 常驻小默契；触发「二人转」时再抬一档
      if (shot?.zone === "mid") b += proc ? 0.042 : 0.014;
      else if (shot?.zone === "paint") b += proc ? 0.038 : 0.012;
      else if (shot?.zone === "three" && bref === "murraja01") b += proc ? 0.036 : 0.01;
      if (proc) baller._duoProc = "joker_jamal";
    } else if (shot?.zone === "mid" || shot?.zone === "paint") {
      b += 0.01; // 弱侧吃二人转扯防
    }
  }
  return b;
}

/** 高机动领防/缠绕型：才能有效干扰百步穿杨半场射程 */
function isMobileChaser(defender) {
  if (!defender) return false;
  if ((defender.speed || 50) >= 76) return true;
  if (hasSkill(defender, "sticky_wrap")) return true;
  if (hasSkill(defender, "death_wrap")) return true;
  if (hasSkill(defender, "first_step")) return true;
  if (hasSkill(defender, "glove")) return true;
  if (hasSkill(defender, "thief") && (defender.speed || 50) >= 70) return true;
  return false;
}

export function skillOpennessDelta(baller, defender, off) {
  let d = 0;
  const offCourt = off?.onCourt || [];
  if (hasSkill(baller, "ankle_breaker")) d += 0.045;
  if (hasSkill(baller, "rhythm_master")) d += 0.05; // 变速/试探步造空间，不靠速度，对快防守人也有效
  if (hasSkill(baller, "first_step")) d += 0.04;
  if (hasSkill(baller, "freeze_iso")) d += 0.02;
  if (hasSkill(baller, "slowmo")) d += 0.025; // tempo shift always helps a bit
  if (hasSkill(baller, "spring_board")) d += 0.03;
  if (hasSkill(baller, "lob_finisher")) d += 0.015;
  if (hasSkill(baller, "high_tower")) d += 0.035; // 高位出手更难贴防
  if (hasSkill(baller, "soft_touch")) d += 0.012;
  if (hasSkill(baller, "lone_wolf")) d += 0.035; // 造一对一空间
  if (hasSkill(baller, "offense_kaleidoscope")) d += 0.02; // 三威胁持球
  // 半场射程：慢防贴不上；高机动词/缠绕才能真正压缩空位
  if (hasSkill(baller, "logo_range")) {
    if (isMobileChaser(defender)) d -= 0.06;
    else d += 0.045;
  }
  if (hasSkill(defender, "lockdown")) d -= 0.05;
  if (hasSkill(defender, "wing_lock")) d -= 0.045;
  // 全能：换防对位几乎不漏空位
  if (hasSkill(defender, "positionless")) d -= 0.075;
  // Tony Allen wrap / Battier on-ball
  if (hasSkill(defender, "sticky_wrap")) d -= 0.065;
  // Kawhi 死亡缠绕：铁钳贴防，空位大幅压缩
  if (hasSkill(defender, "death_wrap")) {
    d -= 0.085;
    if ((baller?.scoring || 50) >= 86 || (baller?.raw?.ppg || 0) >= 22) d -= 0.03;
  }
  if (hasSkill(defender, "stopper_3d")) {
    d -= 0.04;
    // Extra bite on primary scorers
    if ((baller?.scoring || 50) >= 86 || (baller?.raw?.ppg || 0) >= 22) d -= 0.025;
  }
  if (hasSkill(defender, "enforcer")) d -= 0.02;
  // 狼王：自己贴防更凶
  if (hasSkill(defender, "wolf_king")) d -= 0.035;
  for (const p of offCourt) {
    if (p.id !== baller?.id && hasSkill(p, "gravity_well")) d += 0.018;
  }
  // 潜能激发：队友造出更好空位窗口
  if (teammateHasAura(offCourt, "mind_unlock", baller?.id)) d += 0.022;
  const duos = activeDuoIds(offCourt);
  if (duos.includes("lob_city")) d += 0.03;
  if (duos.includes("splash_bros") || duos.includes("death_lineup")) d += 0.02;
  if (duos.includes("run_gun_link") || duos.includes("showtime_link")) d += 0.018;
  if (duos.includes("heatles_link")) {
    const bref = brefKey(baller);
    d += bref === "jamesle01" || bref === "wadedw01" ? 0.032 : 0.014;
  }
  if (duos.includes("joker_jamal")) {
    const bref = brefKey(baller);
    d += bref === "jokicni01" || bref === "murraja01" ? 0.028 : 0.012;
  }
  if (duos.includes("bulls_wing")) d += 0.015;
  if (isDefensiveLeader(defender)) d -= 0.028;
  return d;
}

/** Extra contest from defensive captain aura on the defending five. */
export function skillDefCaptainOpenPenalty(defOnCourt) {
  if (!defensiveAuraOnCourt(defOnCourt)) return 0;
  return -0.032;
}

export function skillStealBonus(defender, defOnCourt = null) {
  let b = 0;
  if (hasSkill(defender, "thief")) b += 0.022;
  if (hasSkill(defender, "lockdown")) b += 0.01;
  if (hasSkill(defender, "glove")) b += 0.015;
  if (hasSkill(defender, "sticky_wrap")) b += 0.018;
  if (hasSkill(defender, "death_wrap")) b += 0.022;
  if (hasSkill(defender, "stopper_3d")) b += 0.008;
  if (isDefensiveLeader(defender)) b += 0.01;
  if (defensiveAuraOnCourt(defOnCourt, defender?.id)) b += 0.008;
  return b;
}

/**
 * 对位防守技给持球人加的体能税（每回合开打时结算）。
 * 死亡缠绕最狠；缠绕/铁壁也有可见消耗。
 * @returns {{ tax: number, label: string|null }}
 */
export function skillOnBallWrapPressure(baller, defender) {
  if (!baller || !defender) return { tax: 0, label: null };
  let tax = 0;
  let label = null;
  if (hasSkill(defender, "death_wrap")) {
    tax = 3.4 + Math.random() * 2.2; // 大量榨干
    if (Math.random() < (SKILL_PACKS.death_wrap.proc || 0.48)) label = "死亡缠绕";
  } else if (hasSkill(defender, "sticky_wrap")) {
    tax = 1.15 + Math.random() * 0.7;
    if (Math.random() < 0.28) label = "缠绕盯防";
  } else if (hasSkill(defender, "lockdown")) {
    tax = 0.55 + Math.random() * 0.45;
    if (Math.random() < 0.16) label = "铁壁盯防";
  } else if (hasSkill(defender, "stopper_3d")) {
    tax = 0.7;
    if (Math.random() < 0.14) label = "持球克星";
  }
  if (tax > 0) {
    baller.fatigue = Math.min(100, (baller.fatigue || 0) + tax);
  }
  return { tax, label };
}

/** 对位防守技抬高持球人失误率 */
export function skillDefenderTovBonus(defender) {
  if (!defender) return 0;
  let b = 0;
  if (hasSkill(defender, "death_wrap")) b += 0.062;
  if (hasSkill(defender, "sticky_wrap")) b += 0.02;
  if (hasSkill(defender, "lockdown")) b += 0.012;
  if (hasSkill(defender, "stopper_3d")) b += 0.01;
  if (hasSkill(defender, "thief") || hasSkill(defender, "glove")) b += 0.008;
  return b;
}

/** 抢断战报里挂防守技名（有则返回） */
export function skillStealFeedLabel(defender) {
  if (!defender) return null;
  if (hasSkill(defender, "death_wrap") && Math.random() < 0.55) return "死亡缠绕";
  if (hasSkill(defender, "sticky_wrap") && Math.random() < 0.4) return "缠绕盯防";
  if (hasSkill(defender, "glove") && Math.random() < 0.45) return "手套";
  if (hasSkill(defender, "thief") && Math.random() < 0.35) return "盗球鬼才";
  if (hasSkill(defender, "lockdown") && Math.random() < 0.25) return "铁壁盯防";
  return null;
}

/** Chance this defender draws an offensive foul (charge). */
export function skillChargeChance(defender) {
  if (hasSkill(defender, "charge_taker")) return 0.035;
  if (hasSkill(defender, "stopper_3d")) return 0.012;
  return 0;
}

/** Extra personal foul risk when contesting (enforcer). */
export function skillFoulRisk(defender) {
  let r = 0;
  if (hasSkill(defender, "enforcer")) r += 0.04;
  if (hasSkill(defender, "sticky_wrap")) r += 0.012;
  return r;
}

/**
 * Technical foul propensity 0–1 contribution (hothead / fiery).
 * Used once per possession by either side's hotheads.
 */
export function skillTechChance(player) {
  if (!player) return 0;
  let c = 0;
  if (hasSkill(player, "hothead")) c += 0.028;
  if (hasSkill(player, "enforcer")) c += 0.006;
  const fiery = player.personality?.fiery || 50;
  const calm = player.personality?.calm || 50;
  if (fiery >= 80) c += (fiery - 80) * 0.0009;
  if (calm <= 35) c += (35 - calm) * 0.0005;
  if ((player.intangibles?.composure || 50) <= 35) c += 0.008;
  return c;
}

export function skillBlockBonus(defender, shot, defOnCourt = null) {
  let b = 0;
  // 全能换防：对位大个子不至于完全无干扰
  if (hasSkill(defender, "positionless")) {
    if (shot?.zone === "paint") b += 0.018;
    else if (shot?.zone === "mid") b += 0.012;
    else b += 0.006;
  }
  if (hasSkill(defender, "rim_protector")) {
    if (shot?.zone === "paint") b += 0.035;
    else if (shot?.zone === "mid") b += 0.012;
    else b += 0.004;
  }
  // 高塔：护框存在感（身高臂展）
  if (hasSkill(defender, "high_tower") && shot?.zone === "paint") b += 0.022;
  else if (hasSkill(defender, "high_tower") && shot?.zone === "mid") b += 0.01;
  if (hasSkill(defender, "block_artist")) {
    if (shot?.zone === "paint") b += 0.04;
    else if (shot?.zone === "mid") b += 0.018;
    else b += 0.006;
  }
  // Manimal vertical — extra paint contests even without elite rim-protector label alone
  if (hasSkill(defender, "spring_board") && shot?.zone === "paint") b += 0.018;
  if (defensiveAuraOnCourt(defOnCourt) && shot?.zone === "paint") b += 0.012;
  return b;
}

/** 进攻方抗盖帽倍率：单脚抛射、答案等出手更难被盖（1 = 无影响） */
export function skillBlockResist(baller) {
  let m = 1;
  for (const id of baller?.skills || []) {
    const resist = SKILL_PACKS[id]?.blockResist;
    if (resist) m *= resist;
  }
  return m;
}

/**
 * 脑后长眼：组织者分球后，接球人额外空位。被包夹时传给背后队友，空位更大。
 * @returns {{ bonus: number, label: string|null }}
 */
export function skillKickOpenBonus(organizer, { doubled = false } = {}) {
  if (!hasSkill(organizer || {}, "blind_pass")) return { bonus: 0, label: null };
  return doubled
    ? { bonus: 0.09, label: "被包夹中「脑后长眼」传给背后的队友" }
    : { bonus: 0.06, label: "「脑后长眼」找到意想不到的空位队友" };
}

/**
 * 上场前按技能提升能力值（如半兽人身体素质 +10%）。
 * 只应用于比赛副本，重复调用不会叠加。
 */
export function applySkillAttributeBoosts(player) {
  if (!player || player._attrBoosted) return player;
  for (const id of player.skills || []) {
    const boost = SKILL_PACKS[id]?.attributeBoost;
    if (!boost) continue;
    for (const key of boost.keys) {
      if (typeof player[key] === "number") player[key] = Math.min(99, Math.round(player[key] * boost.mult));
    }
  }
  player._attrBoosted = true;
  return player;
}

/**
 * Kick-out / pass-out multiplier. Lone wolf ignores open teammates,
 * especially when doubled.
 */
export function skillKickMult(baller, { doubled = false } = {}) {
  let m = 1;
  if (hasSkill(baller, "lone_wolf")) m *= doubled ? 0.08 : 0.38;
  if (hasSkill(baller, "blind_pass")) m *= doubled ? 1.9 : 1.3;
  if (hasSkill(baller, "qb_outlet")) m *= doubled ? 1.55 : 1.35;
  if (hasSkill(baller, "floor_commander")) m *= 1.18;
  return m;
}

/** Extra TO risk when lone wolf forces through a double. */
export function skillTunnelVisionTov(baller, { doubled = false, open = 0.5 } = {}) {
  if (!hasSkill(baller, "lone_wolf")) return 0;
  if (doubled) return 0.055;
  if (open < 0.32) return 0.028;
  return 0;
}

/** Negative TO chance from careful passers (Haliburton-type clean dime). */
export function skillPassCareTov(baller) {
  let d = 0;
  if (hasSkill(baller, "clean_dime")) d -= 0.028;
  if (hasSkill(baller, "blind_pass")) d -= 0.015;
  if (hasSkill(baller, "floor_commander")) d -= 0.008;
  if (hasSkill(baller, "dime_dropper")) d -= 0.006;
  return d;
}

/**
 * 体力消耗倍率：普通球员≈1（约 8 分钟连场疲劳到 60）。
 * 铁肺 / 永动机等显著更省；无高体力技能的人不再靠隐藏抵抗硬顶。
 */
export function skillFatigueMult(baller) {
  if (hasSkill(baller, "iron_lungs")) return 0.36;
  if (hasSkill(baller, "stamina_monster")) return 0.4;
  if (hasSkill(baller, "motor_engine")) return 0.52;
  if (hasSkill(baller, "mamba_spirit")) return 0.82;
  if (hasSkill(baller, "slowmo")) return 0.88;
  return 1;
}

/** 是否挂了「高体力」类技能（铁肺 / 体能怪物 / 永动机） */
export function hasEliteStaminaSkill(p) {
  return hasSkill(p, "iron_lungs") || hasSkill(p, "stamina_monster") || hasSkill(p, "motor_engine");
}

export function skillPassWeight(p) {
  let w = 1;
  if (hasSkill(p, "dime_dropper")) w *= 1.35;
  if (hasSkill(p, "soft_touch")) w *= 1.2;
  if (hasSkill(p, "qb_outlet")) w *= 1.28;
  if (hasSkill(p, "floor_commander")) w *= 1.32;
  if (hasSkill(p, "clean_dime")) w *= 1.22;
  if (hasSkill(p, "blind_pass")) w *= 1.3;
  return w;
}

/** 詹韦连线 / 二人转等：互喂目标权重 */
export function skillDuoKickTargetMult(organizer, target, onCourt = []) {
  if (!organizer || !target) return 1;
  const duos = activeDuoIds(onCourt);
  const a = brefKey(organizer);
  const b = brefKey(target);
  let w = 1;
  if (
    duos.includes("heatles_link") &&
    ((a === "jamesle01" && b === "wadedw01") || (a === "wadedw01" && b === "jamesle01"))
  ) {
    w *= 2.15;
  }
  if (
    duos.includes("joker_jamal") &&
    ((a === "jokicni01" && b === "murraja01") || (a === "murraja01" && b === "jokicni01"))
  ) {
    w *= 2.35; // 高位手递手 / 挡拆互喂
  }
  return w;
}

/** 是否本回合触发了约基奇×穆雷「二人转」演出（得分反馈用） */
export function isJokerJamalTwoMan(baller, passer, onCourt = []) {
  if (!activeDuoIds(onCourt).includes("joker_jamal")) return false;
  if (baller?._duoProc === "joker_jamal") return true;
  const scorer = brefKey(baller);
  const ast = brefKey(passer);
  const duoPair =
    (scorer === "jokicni01" && ast === "murraja01") ||
    (scorer === "murraja01" && ast === "jokicni01");
  if (duoPair && Math.random() < (SKILL_PACKS.joker_jamal.proc || 0.42)) return true;
  return false;
}

/** Rebound weight multiplier when Board Man / glass / spring bounce procs. */
export function isBlueCollarRebounder(p) {
  const o = p?.orders || {};
  if (o.usage === "hustle" || o.action === "crash" || o.attack === "putback") return true;
  const role = p?.roleExpectation;
  const lowUsage = (p?.raw?.ppg ?? 99) < 12;
  return lowUsage && (role === "role" || role === "bench" || role === "sixth");
}

/** 篮板权重倍率；篮板痴汉在蓝领二次进攻角色下更常触发、进攻板加成更大 */
export function skillReboundMult(p, { offensive = false } = {}) {
  if (hasSkill(p, "rebound_maniac")) {
    const pack = SKILL_PACKS.rebound_maniac;
    const blue = isBlueCollarRebounder(p);
    const proc = blue ? pack.blueCollarProc * (offensive ? 1 : 0.75) : pack.proc * 0.5;
    if (Math.random() <= proc) return blue && offensive ? pack.blueCollarOffBoost : pack.rebBoost;
  }
  if (hasSkill(p, "board_man") && Math.random() <= SKILL_PACKS.board_man.proc) {
    return SKILL_PACKS.board_man.rebBoost;
  }
  if (hasSkill(p, "glass_cleaner") && Math.random() < 0.32) return 1.4;
  if (hasSkill(p, "spring_board") && Math.random() < 0.28) return 1.35;
  if (hasSkill(p, "wolf_king") && Math.random() < 0.25) return 1.3;
  return 1;
}

export function isStarSkillTier(tier) {
  return STAR_TIERS.has(tier);
}
