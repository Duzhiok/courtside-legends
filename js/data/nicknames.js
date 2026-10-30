/**
 * 球星外号展示（Nicknames）
 *
 * 纯展示层：不影响技能、属性或比赛模拟，只是在卡面上多露出一个身份标签。
 * 一人一个外号，取最广为人知的那个，不做多选列表。
 * 查找顺序：bref 精确匹配 → 赛季限定（如同一人不同时期称号不同）→ 姓名兜底
 * （复用 skills.js 里已经验证过的 signatureBrefForName，避免重复维护一套名字匹配）。
 */
import { signatureBrefForName } from "./skills.js";

/** bref → 外号（唯一，一人一个） */
export const NICKNAMES = {
  jordami01: "飞人",
  bryanko01: "黑曼巴",
  jamesle01: "詹皇",
  onealsh01: "鲨鱼",
  abdulka01: "天勾",
  johnsma02: "魔术师",
  birdla01: "大鸟",
  barklch01: "圆球",
  olajuha01: "大梦",
  chambwi01: "The Big Dipper",
  russebi01: "指环王",
  roberos01: "大O",
  westje01: "Logo Man",
  gervige01: "冰人",
  iversal01: "答案",
  anthoca01: "甜瓜",
  garneke01: "狼王",
  piercpa01: "真理",
  rodmade01: "大虫",
  antetgi01: "希腊怪物",
  jokicni01: "小丑",
  duncati01: "石佛",
  nowitdi01: "德国战车",
  curryst01: "萌神",
  duranke01: "死神",
  hardeja01: "大胡子",
  westbru01: "威少",
  irvinky01: "厨神",
  wadedw01: "闪电侠",
  pippesc01: "魔笛手",
  mutomdi01: "秘密武器",
  stockjo01: "毒蛇",
  paytoga01: "手套",
  nashst01: "小快灵",
  doncilu01: "魔法师",
  farieke01: "半兽人",
  gilgesh01: "SGA",
  millere01: "瑞吉传奇",
  allenra02: "雷阿伦",
};

/** 赛季限定外号：key 为 "bref:season"，用于同一人不同时期称号不同的情况 */
export const SEASON_NICKNAMES = {};

function nicknameBref(player) {
  const bref = String(player?.bref || "").toLowerCase();
  if (bref && (NICKNAMES[bref] || Object.keys(SEASON_NICKNAMES).some((k) => k.startsWith(`${bref}:`)))) {
    return bref;
  }
  return bref || signatureBrefForName(player);
}

/** 返回该球员的外号，没有则返回 null */
export function primaryNickname(player) {
  if (!player) return null;
  const bref = nicknameBref(player);
  if (!bref) return null;
  const season = Number(player.season) || 0;
  return SEASON_NICKNAMES[`${bref}:${season}`] || NICKNAMES[bref] || null;
}

/** 生成可直接插入卡面的外号徽章 HTML；没有外号时返回空字符串 */
export function nicknameBadgeHtml(player) {
  const nick = primaryNickname(player);
  if (!nick) return "";
  return `<span class="nickname-badge" title="外号：${nick}">「${nick}」</span>`;
}
