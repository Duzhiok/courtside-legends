import { PHRASES } from "./i18n-phrases.js";

/**
 * i18n 层（T7 v1）：界面语言 zh / en。
 *
 * 两条翻译路径，职责分开：
 *  - JS 里现拼的文案用 L(zh, en) 在源头选语言——准确、无歧义
 *    （「中投」永远是 MID，不会再被翻成 China Investment Corporation）。
 *  - index.html 的静态文案走 PHRASES 词表 + DOM 遍历（applyStaticLang）：
 *    原文存 WeakMap，切回中文时逐字还原，不靠反向翻译。
 * 比赛播报（sim）在构造时收 lang 选项，默认 zh——既有测试断言的中文不变。
 */

const LS_KEY = "courtside.lang";
let current = null;

export function getLang() {
  if (current) return current;
  try {
    current = localStorage.getItem(LS_KEY) === "en" ? "en" : "zh";
  } catch {
    current = "zh";
  }
  return current;
}

export function setLang(lang) {
  current = lang === "en" ? "en" : "zh";
  try {
    localStorage.setItem(LS_KEY, current);
  } catch {
    /* private mode: language just won't persist */
  }
  return current;
}

/** Pick the string for the current language. */
export function L(zh, en) {
  return getLang() === "en" ? en : zh;
}

const phraseMap = new Map(PHRASES);
const phrasesByLength = [...PHRASES].sort((a, b) => b[0].length - a[0].length);

/** Translate one static string: exact phrase first, then longest-first phrase substitution. */
export function translateStatic(zh) {
  if (getLang() !== "en" || !zh) return zh;
  const exact = phraseMap.get(zh.trim());
  if (exact != null) {
    // preserve the original's surrounding whitespace
    const lead = zh.match(/^\s*/)[0];
    const trail = zh.match(/\s*$/)[0];
    return lead + exact + trail;
  }
  let out = zh;
  for (const [from, to] of phrasesByLength) {
    if (from.length >= 2 && out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

const origText = new WeakMap();
const origAttrs = new WeakMap();
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

function translatableText(node) {
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("[data-no-i18n]")) return false;
  return /[\u4e00-\u9fff]/.test(node.nodeValue || "");
}

/**
 * Translate (or restore) every static string in the live DOM: text nodes
 * plus placeholder / title / aria-label. Dynamic JS-rendered strings are
 * handled at their source with L(); this walker owns index.html chrome.
 */
export function applyStaticLang(root = document.body) {
  if (!root) return;
  const lang = getLang();
  try {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  } catch {
    /* non-DOM environment (tests) */
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (translatableText(walker.currentNode) || origText.has(walker.currentNode)) nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    if (!origText.has(node)) origText.set(node, node.nodeValue);
    const original = origText.get(node);
    node.nodeValue = lang === "en" ? translateStatic(original) : original;
  }
  for (const el of root.querySelectorAll("[placeholder], [title], [aria-label]")) {
    if (el.closest("[data-no-i18n]")) continue;
    let saved = origAttrs.get(el);
    if (!saved) {
      saved = {};
      origAttrs.set(el, saved);
    }
    for (const attr of ["placeholder", "title", "aria-label"]) {
      if (!el.hasAttribute(attr)) continue;
      if (!(attr in saved)) saved[attr] = el.getAttribute(attr);
      const original = saved[attr];
      el.setAttribute(attr, lang === "en" ? translateStatic(original) : original);
    }
  }
}

/** Skill names in English, keyed by skill id (source of truth: skills.js). */
export const SKILL_EN = {
  clutch_killer: "Clutch Killer", mid_maestro: "Mid-Range Maestro", freeze_iso: "Unstoppable Iso",
  dime_dropper: "Dime Magician", rainmaker: "Rain Maker", paint_bully: "Paint Bully",
  lockdown: "Lockdown", thief: "Pickpocket Pro", rim_protector: "Rim Protector",
  motor_engine: "Everlasting Motor", iron_lungs: "Iron Lungs", iron_body: "Iron Man",
  gravity_well: "Gravity Well", ankle_breaker: "Ankle Breaker", rhythm_master: "Rhythm Master",
  positionless: "Positionless", sticky_wrap: "Clingy Wrap", death_wrap: "Death Wrap",
  stopper_3d: "On-Ball Stopper · 3&D", charge_taker: "Charge Taker", hothead: "Hot Temper",
  enforcer: "Enforcer", spring_board: "Springboard", lone_wolf: "Lone Wolf",
  lean_in_jumper: "Lean-In Jumper", manimal: "Manimal", blind_pass: "Eyes Behind His Head",
  one_leg_fade: "One-Leg Fade", the_answer: "The Answer", mamba_spirit: "Mamba Mentality",
  offense_kaleidoscope: "Offensive Kaleidoscope", wolf_king: "Wolf King", the_truth: "The Truth",
  rebound_maniac: "Board Maniac", stamina_monster: "Stamina Monster", god_mode: "God Mode",
  block_artist: "Block Artist", qb_outlet: "QB Outlet", floor_commander: "Floor General",
  big_heart: "Big Heart", clean_dime: "Clean Dimes", glass_cleaner: "Glass Cleaner",
  first_step: "Lightning First Step", cold_mid: "Cold-Blooded Mid", corner_sniper: "Corner Sniper",
  paint_finisher: "Paint Finisher", wing_lock: "Wing Lock", lob_city: "Lob City",
  splash_bros: "Splash Bros", pick_roll_twins: "PnR Twins", pnr_master: "PnR Maestro", showtime_link: "Showtime Link",
  mamba_shark: "Mamba & Shaq", run_gun_link: "Seven-Seconds Run & Gun", heatles_link: "Wade-to-LeBron",
  bulls_wing: "Flying Wings", spurs_spine: "Spurs Spine", dirk_jet: "Dirk & Jet",
  joker_jamal: "Two-Man Game", death_lineup: "Death Lineup Core", mind_unlock: "Potential Unleashed",
  def_captain: "Defensive Captain", logo_range: "Logo Range", bully_step: "Bully Step",
  dream_shake: "Dream Shake", high_floater: "Floater Master", giant_stride: "Giant Stride",
  rim_wrecker: "Rim Wrecker", high_tower: "High Tower", uncle_drew: "Uncle Drew Handles",
  mountain_slam: "Mountain Slam", big_dipper: "Big Dipper Finger Roll", poster_slam: "Poster Slam",
  lob_finisher: "Lob Finisher", bank_45: "45° Bank", skyhook: "Skyhook",
  not_in_my_house: "Not In My House", chase_down_block: "Chase-Down Block", slowmo: "Slow-Mo Steps",
  fadeaway: "Fadeaway Killer", euro_step: "Euro Step", stepback: "Step-Back",
  teardrop: "Teardrop Master", dirk_fade: "One-Leg Dirk Fade", crossover: "Crossover Tai Chi",
  dame_time: "Dame Time", splash_spot: "Splash Spot-Up", coast_to_coast: "Coast to Coast",
  soft_touch: "Soft Touch", midrange_assassin: "Mid-Range Assassin", glove: "The Glove",
  board_man: "Board Man", big_shot: "Mr. Big Shot",
};

const SKILL_ZH_BY_ID = {
  clutch_killer: "杀手时刻", mid_maestro: "中投大师", freeze_iso: "无解单打", dime_dropper: "传球魔术",
  rainmaker: "三分雨", paint_bully: "篮下暴君", lockdown: "铁壁盯防", thief: "盗球鬼才",
  rim_protector: "护框神", motor_engine: "永动机", iron_lungs: "铁肺", iron_body: "铁人",
  gravity_well: "引力黑洞", ankle_breaker: "脚踝收割", rhythm_master: "节奏大师", positionless: "全能",
  sticky_wrap: "缠绕盯防", death_wrap: "死亡缠绕", stopper_3d: "持球克星·3D", charge_taker: "造进攻犯规",
  hothead: "火爆脾气", enforcer: "场上打手", spring_board: "弹跳怪物", lone_wolf: "独狼",
  lean_in_jumper: "前仰跳投", manimal: "半兽人", blind_pass: "脑后长眼", one_leg_fade: "单脚抛射",
  the_answer: "答案", mamba_spirit: "曼巴精神", offense_kaleidoscope: "进攻万花筒", wolf_king: "狼王",
  the_truth: "真理", rebound_maniac: "篮板痴汉", stamina_monster: "体能怪物", god_mode: "上帝附体",
  block_artist: "火锅大师", qb_outlet: "四分卫长传", floor_commander: "场上指挥家", big_heart: "大心脏",
  clean_dime: "传球稳准", glass_cleaner: "篮板嗅觉", first_step: "闪电第一步", cold_mid: "冷血中投",
  corner_sniper: "底角狙杀", paint_finisher: "禁区终结", wing_lock: "锋线锁死", lob_city: "空接之城",
  splash_bros: "水花兄弟", pick_roll_twins: "挡拆双子", pnr_master: "挡拆高手", showtime_link: "表演时刻", mamba_shark: "黑曼巴与大鲨",
  run_gun_link: "七秒跑轰", heatles_link: "詹韦连线", bulls_wing: "飞人双翼", spurs_spine: "马刺脊梁",
  dirk_jet: "诺天王与喷气机", joker_jamal: "二人转", death_lineup: "死亡五小核", mind_unlock: "潜能激发",
  def_captain: "防守统领", logo_range: "百步穿杨", bully_step: "霸王步", dream_shake: "梦幻脚步",
  high_floater: "高抛大师", giant_stride: "大步流星", rim_wrecker: "篮筐肆虐者", high_tower: "高塔",
  uncle_drew: "蝴蝶穿花", mountain_slam: "泰山压顶", big_dipper: "大北斗指滚", poster_slam: "暴力灌篮",
  lob_finisher: "空接终结", bank_45: "45打板", skyhook: "天勾", not_in_my_house: "遮天蔽日",
  chase_down_block: "追身定板", slowmo: "慢三步", fadeaway: "后仰杀手", euro_step: "迷踪步",
  stepback: "后撤步", teardrop: "抛投大师", dirk_fade: "金鸡独立", crossover: "变向太极",
  dame_time: "决胜时刻", splash_spot: "水花接投", coast_to_coast: "长驱直入", soft_touch: "柔顺手感",
  midrange_assassin: "中投刺客", glove: "手套", board_man: "篮板狂魔", big_shot: "关键先生",
};

const SKILL_EN_BY_NAME = new Map(
  Object.entries(SKILL_ZH_BY_ID).map(([id, zh]) => [zh, SKILL_EN[id]])
);

/** Translate a skill's Chinese display name (defaults to the app language). */
export function skillNameL(zhName, lang = getLang()) {
  if (lang !== "en" || !zhName) return zhName;
  return SKILL_EN_BY_NAME.get(zhName) || zhName;
}

export function skillNameEnById(id, fallback) {
  return getLang() === "en" ? SKILL_EN[id] || fallback : fallback;
}

/** Historical-season team names (historicalSeasons.js) in English, keyed by Chinese name. */
export const TEAM_NAME_EN = {
  "76人": "76ers", "公牛": "Bulls", "凯尔特人": "Celtics", "勇士": "Warriors",
  "勇士/水牛城": "Warriors / Buffalo", "国王": "Kings", "太阳": "Suns", "奇才": "Wizards",
  "子弹士": "Bullets", "尼克斯": "Knicks", "山猫": "Bobcats", "开拓者": "Trail Blazers",
  "快船": "Clippers", "掘金": "Nuggets", "森林狼": "Timberwolves", "步行者": "Pacers",
  "活塞": "Pistons", "湖人": "Lakers", "火箭": "Rockets", "灰熊": "Grizzlies",
  "热火": "Heat", "爵士": "Jazz", "独行侠": "Mavericks", "猛龙": "Raptors",
  "篮网": "Nets", "老鹰": "Hawks", "超音速": "SuperSonics", "雄鹿": "Bucks",
  "雷霆": "Thunder", "马刺": "Spurs", "骑士": "Cavaliers", "魔术": "Magic",
  "鹈鹕": "Pelicans", "黄蜂": "Hornets", "黄蜂/鹈鹕": "Hornets / Pelicans",
};

/** Translate a stored Chinese team name for display (user-named teams pass through). */
export function teamNameL(zhName, lang = getLang()) {
  if (lang !== "en" || !zhName) return zhName;
  if (TEAM_NAME_EN[zhName]) return TEAM_NAME_EN[zhName];
  if (zhName.startsWith("联盟队")) return `League Team ${zhName.slice(3).trim()}`;
  if (zhName.startsWith("时空队")) return `Time Team ${zhName.slice(3).trim()}`;
  return zhName;
}
