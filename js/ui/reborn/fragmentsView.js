/**
 * Career fragments in the Reborn screen (decision 4): the balance and the three ways to spend it (intensive training,
 * a one-week specialisation of a skill the player has, the season's legacy jersey) under the weekly training block,
 * and the fragment lines on the post-game report. Rules live in js/reborn/fragments.js.
 */
import {
  INTENSIVE_COST, INTENSIVE_XP_MULTIPLIER, LEGACY_COST, SPECIALIZE_COST, activeSpecialty, buyIntensive, buyLegacyJersey, buySpecialization,
  fragmentLedger, intensiveBlocker, legacyBlocker, specializableSkills, specializeBlocker,
} from "../../reborn/fragments.js";
import { SKILL_PACKS } from "../../data/skills.js";
import { skillNameL } from "../../i18n.js";
import { esc } from "../../core/html.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);

const REASON = {
  standout: { zh: "高光表现（超出角色预期）", en: "standout game (above your role's expectation)" },
  "rivalry-win": { zh: "宿敌对决获胜", en: "won a rivalry meeting" },
};

const BLOCKER = {
  "no-focus": { zh: "先选本周训练方向", en: "Pick this week's focus first" },
  already: { zh: "本周已开启", en: "Already on this week" },
  short: { zh: `需要 ${INTENSIVE_COST} 个碎片`, en: `Needs ${INTENSIVE_COST} fragments` },
};
const SPECIAL_BLOCKER = { ...BLOCKER, short: { zh: `需要 ${SPECIALIZE_COST} 个碎片`, en: `Needs ${SPECIALIZE_COST} fragments` } };
const LEGACY_BLOCKER = {
  already: { zh: "本赛季已兑换", en: "Already redeemed this season" },
  short: { zh: `需要 ${LEGACY_COST} 个碎片`, en: `Needs ${LEGACY_COST} fragments` },
  unrevealed: { zh: "真实身份揭晓后才能兑换（球衣上印着名字）", en: "Unlocks once your identity is revealed (the name is printed on it)" },
  "no-season": { zh: "赛季未开始", en: "No season yet" },
};
const ATTR = {
  pass: { zh: "传球", en: "passing" }, iq: { zh: "球商", en: "IQ" }, three: { zh: "三分", en: "three" }, mid: { zh: "中投", en: "mid-range" },
  scoring: { zh: "得分", en: "scoring" }, paint: { zh: "内线", en: "paint" }, strength: { zh: "力量", en: "strength" },
  rebound: { zh: "篮板", en: "rebounding" }, block: { zh: "盖帽", en: "blocks" }, defense: { zh: "防守", en: "defense" }, steal: { zh: "抢断", en: "steals" },
};
const pick = (map, key, lang) => (map[key] ? map[key][lang === "en" ? "en" : "zh"] : key);
const skillName = (id, lang) => skillNameL(SKILL_PACKS[id]?.name || id, lang === "en" ? "en" : "zh");
const attrList = (attrs, lang) => attrs.map((a) => pick(ATTR, a, lang)).join(lang === "en" ? ", " : "、");

/** One-week specialisation: a button per skill the player has that can be specialised (none = no block at all). */
function specializeHtml(reborn, week, card, lang) {
  const skills = specializableSkills(card);
  if (!skills.length) return "";
  const on = activeSpecialty(reborn, week);
  const head = `<h4>${L("技能专精", "Skill specialisation", lang)}</h4><p class="tiny">${L(`本周训练的升级全部投向所选技能对应的能力（−${SPECIALIZE_COST} 碎片）。不增加升级次数，能力上限不变。`, `This week's training levels all go into the chosen skill's attributes (−${SPECIALIZE_COST} fragments). No extra levels; ceilings unchanged.`, lang)}</p>`;
  if (on) {
    const s = skills.find((x) => x.skillId === on);
    return `${head}<p class="reborn-fragments-on" data-specialty-on="${esc(on)}">${L(`本周专精：${skillName(on, lang)}（${attrList(s?.attributes || [], lang)}）`, `Specialising this week: ${skillName(on, lang)} (${attrList(s?.attributes || [], lang)})`, lang)}</p>`;
  }
  const buttons = skills.map((s) => {
    const blocker = specializeBlocker(reborn, week, card, s.skillId);
    const why = blocker ? pick(SPECIAL_BLOCKER, blocker, lang) : "";
    return `<button type="button" class="btn small" data-specialize="${esc(s.skillId)}" ${blocker ? "disabled" : ""} title="${esc(why)}">${esc(skillName(s.skillId, lang))} → ${esc(attrList(s.attributes, lang))}</button>`;
  }).join(" ");
  const blocker = specializeBlocker(reborn, week, card, skills[0].skillId);
  return `${head}<div class="reborn-specialize">${buttons}</div>${blocker && blocker !== "not-owned" ? `<small> ${pick(SPECIAL_BLOCKER, blocker, lang)}</small>` : ""}`;
}

/** The season's legacy jersey: the player's own jersey for the collection, once per season. */
function legacyHtml(reborn, year, lang) {
  const blocker = legacyBlocker(reborn, year);
  const head = `<h4>${L("传承球衣", "Legacy jersey", lang)}</h4>`;
  if (blocker === "already") return `${head}<p class="reborn-fragments-on" data-legacy-owned>${L(`${year} 赛季的传承球衣已进入你的球衣收藏，可以在「我的世界」穿上。`, `Your ${year} legacy jersey is in your collection; wear it in My World.`, lang)}</p>`;
  return `${head}<button type="button" class="btn small" data-buy-legacy ${blocker ? "disabled" : ""}>${L(`兑换本赛季球衣（−${LEGACY_COST} 碎片，外观收藏，商城不卖）`, `Redeem this season's jersey (−${LEGACY_COST} fragments, cosmetic, never sold in the Shop)`, lang)}</button>${blocker ? `<small> ${pick(LEGACY_BLOCKER, blocker, lang)}</small>` : ""}`;
}

/** Balance + what fragments buy. `week` is the current season week, `card` the player's current card, `year` the season. */
export function fragmentsPanelHtml({ reborn, week, card = null, year = null, lang = "zh" } = {}) {
  const ledger = fragmentLedger(reborn);
  const blocker = intensiveBlocker(reborn, week);
  const on = ledger.intensiveWeek === week && reborn?.player?.training?.week === week;
  const status = on
    ? `<p class="reborn-fragments-on">${L(`本周强化训练已开启：训练经验 ×${INTENSIVE_XP_MULTIPLIER}（能力上限不变）`, `Intensive training on this week: training XP ×${INTENSIVE_XP_MULTIPLIER} (ceilings unchanged)`, lang)}</p>`
    : `<button type="button" class="btn" data-buy-intensive ${blocker ? "disabled" : ""} title="${blocker ? BLOCKER[blocker][lang === "en" ? "en" : "zh"] : ""}">${L(`强化训练（−${INTENSIVE_COST} 碎片，本周训练经验 ×${INTENSIVE_XP_MULTIPLIER}）`, `Intensive training (−${INTENSIVE_COST} fragments, this week's training XP ×${INTENSIVE_XP_MULTIPLIER})`, lang)}</button>${blocker ? `<small> ${BLOCKER[blocker][lang === "en" ? "en" : "zh"]}</small>` : ""}`;
  return `<section class="reborn-fragments"><h3>${L("职业碎片", "Career fragments", lang)} <strong data-fragment-balance>${ledger.balance}</strong></h3><p>${L("只能靠比赛表现获得：高光表现、宿敌对决获胜。", "Earned only by play: standout games and rivalry wins.", lang)}</p>${status}${specializeHtml(reborn, week, card, lang)}${legacyHtml(reborn, year, lang)}</section>`;
}

/** Post-game lines: what this game paid and whether it trained intensively. */
export function fragmentsReportLines(report, lang = "zh") {
  const lines = [];
  for (const reason of report?.fragments?.reasons || []) {
    lines.push(L(`职业碎片 +1：${REASON[reason]?.zh || reason}`, `Career fragment +1: ${REASON[reason]?.en || reason}`, lang));
  }
  if (report?.specialty) {
    const attrs = attrList(specializableSkills({ skills: [report.specialty] })[0]?.attributes || [], lang);
    lines.push(L(`本周技能专精：${skillName(report.specialty, "zh")}（训练升级投向${attrs}）`, `This week's specialisation: ${skillName(report.specialty, "en")} (training levels go to ${attrs})`, lang));
  }
  if (report?.intensive) lines.push(L(`强化训练：本场训练经验 ×${INTENSIVE_XP_MULTIPLIER}`, `Intensive training: this game's training XP ×${INTENSIVE_XP_MULTIPLIER}`, lang));
  return lines;
}

/** Click on the intensive-training button: the new reborn state, or null when the click wasn't for it / it's blocked. */
export function intensiveClick(event, reborn, week) {
  if (!event?.target?.closest?.("[data-buy-intensive]")) return null;
  try {
    return buyIntensive(reborn, week);
  } catch (e) {
    console.warn(e);
    return null;
  }
}

/** Click on a specialisation button: the new reborn state, or null. */
export function specializeClick(event, reborn, week, card) {
  const button = event?.target?.closest?.("[data-specialize]");
  if (!button) return null;
  try {
    return buySpecialization(reborn, week, card, button.dataset.specialize);
  } catch (e) {
    console.warn(e);
    return null;
  }
}

/** Click on the legacy-jersey button: the new reborn state (the jersey is in its collection), or null. */
export function legacyClick(event, reborn, year, week) {
  if (!event?.target?.closest?.("[data-buy-legacy]")) return null;
  try {
    return buyLegacyJersey(reborn, year, { week }).reborn;
  } catch (e) {
    console.warn(e);
    return null;
  }
}
