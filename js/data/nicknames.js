/**
 * 球星外号展示（Nicknames）
 *
 * 纯展示层：不影响技能、属性或比赛模拟，只是在卡面上多露出一个身份标签。
 * 查找顺序：bref 精确匹配 → 赛季限定（如老鹰时代 vs 老鹰外） → 姓名兜底
 * （复用 skills.js 里已经验证过的 signatureBrefForName，避免重复维护一套名字匹配）。
 */
import { signatureBrefForName } from "./skills.js";

/** bref → 外号（一人可有多个，展示时取第一个） */
export const NICKNAMES = {
  jordami01: ["飞人"],
  bryanko01: ["黑曼巴"],
  jamesle01: ["詹皇", "小皇帝"],
  onealsh01: ["鲨鱼", "大鲨鱼"],
  abdulka01: ["天勾"],
  johnsma02: ["魔术师"],
  birdla01: ["大鸟"],
  barklch01: ["圆球"],
  olajuha01: ["大梦"],
  chambwi01: ["张伯伦", "飞人张"],
  russebi01: ["指环王"],
  roberos01: ["大O"],
  westje01: ["Logo Man", "Mr. Clutch"],
  gervige01: ["冰人"],
  iversal01: ["答案"],
  anthoca01: ["甜瓜"],
  garneke01: ["狼王"],
  piercpa01: ["真理"],
  rodmade01: ["大虫"],
  antetgi01: ["希腊怪物"],
  jokicni01: ["小丑", "大约"],
  duncati01: ["石佛"],
  nowitdi01: ["德国战车"],
  curryst01: ["萌神", "小库里"],
  stephcu01: ["萌神"],
  duranke01: ["死神"],
  hardeja01: ["大胡子"],
  hardeti01: ["大胡子"],
  westbru01: ["少狼王", "威少"],
  irvinky01: ["厨神", "歐文"],
  wadedw01: ["闪电侠"],
  pippesc01: ["魔笛手"],
  mutomdi01: ["秘密武器"],
  stockjo01: ["毒蛇"],
  paytoga01: ["手套"],
  nashst01: ["小快灵", "纳什"],
  doncilu01: ["魔法师"],
  farieke01: ["半兽人"],
  gilgesh01: ["头号球星", "SGA"],
  millere01: ["瑞吉传奇"],
  allenra02: ["雷阿伦"],
};

/** 赛季限定外号：key 为 "bref:season"，用于同一人不同时期有不同称号的情况 */
export const SEASON_NICKNAMES = {};

function nicknameBref(player) {
  const bref = String(player?.bref || "").toLowerCase();
  if (bref && (NICKNAMES[bref] || Object.keys(SEASON_NICKNAMES).some((k) => k.startsWith(`${bref}:`)))) {
    return bref;
  }
  return bref || signatureBrefForName(player);
}

/** 返回该球员的外号列表（可能为空数组） */
export function nicknamesFor(player) {
  if (!player) return [];
  const bref = nicknameBref(player);
  if (!bref) return [];
  const season = Number(player.season) || 0;
  return SEASON_NICKNAMES[`${bref}:${season}`] || NICKNAMES[bref] || [];
}

/** 取第一个外号用于展示，没有则返回 null */
export function primaryNickname(player) {
  return nicknamesFor(player)[0] || null;
}

/** 生成可直接插入卡面的外号徽章 HTML；没有外号时返回空字符串 */
export function nicknameBadgeHtml(player) {
  const nick = primaryNickname(player);
  if (!nick) return "";
  const all = nicknamesFor(player);
  const title = all.length > 1 ? `外号：${all.join(" / ")}` : `外号：${nick}`;
  return `<span class="nickname-badge" title="${title}">「${nick}」</span>`;
}
