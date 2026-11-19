/**
 * Career fragments in the Reborn screen (decision 4): the balance + intensive-training button under the weekly
 * training block, and the "+N fragments" lines on the post-game report. Rules live in js/reborn/fragments.js.
 */
import { INTENSIVE_COST, INTENSIVE_XP_MULTIPLIER, buyIntensive, fragmentLedger, intensiveBlocker } from "../../reborn/fragments.js";

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

/** Balance + the one thing fragments buy. `week` is the current season week. */
export function fragmentsPanelHtml({ reborn, week, lang = "zh" } = {}) {
  const ledger = fragmentLedger(reborn);
  const blocker = intensiveBlocker(reborn, week);
  const on = ledger.intensiveWeek === week && reborn?.player?.training?.week === week;
  const status = on
    ? `<p class="reborn-fragments-on">${L(`本周强化训练已开启：训练经验 ×${INTENSIVE_XP_MULTIPLIER}（能力上限不变）`, `Intensive training on this week: training XP ×${INTENSIVE_XP_MULTIPLIER} (ceilings unchanged)`, lang)}</p>`
    : `<button type="button" class="btn" data-buy-intensive ${blocker ? "disabled" : ""} title="${blocker ? BLOCKER[blocker][lang === "en" ? "en" : "zh"] : ""}">${L(`强化训练（−${INTENSIVE_COST} 碎片，本周训练经验 ×${INTENSIVE_XP_MULTIPLIER}）`, `Intensive training (−${INTENSIVE_COST} fragments, this week's training XP ×${INTENSIVE_XP_MULTIPLIER})`, lang)}</button>${blocker ? `<small> ${BLOCKER[blocker][lang === "en" ? "en" : "zh"]}</small>` : ""}`;
  return `<section class="reborn-fragments"><h3>${L("职业碎片", "Career fragments", lang)} <strong data-fragment-balance>${ledger.balance}</strong></h3><p>${L("只能靠比赛表现获得：高光表现、宿敌对决获胜。", "Earned only by play: standout games and rivalry wins.", lang)}</p>${status}</section>`;
}

/** Post-game lines: what this game paid and whether it trained intensively. */
export function fragmentsReportLines(report, lang = "zh") {
  const lines = [];
  for (const reason of report?.fragments?.reasons || []) {
    lines.push(L(`职业碎片 +1：${REASON[reason]?.zh || reason}`, `Career fragment +1: ${REASON[reason]?.en || reason}`, lang));
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
