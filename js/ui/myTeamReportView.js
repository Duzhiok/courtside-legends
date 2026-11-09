/** My Team Season end-of-season panel + objectives strip (pure HTML strings; every dynamic value is escaped). */
import { objectiveText } from "../myteam/seasonReport.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MARK = { done: "✓", failed: "✗", open: "·" };

const FINISH = {
  champion: ["🏆 总冠军", "🏆 Champions"],
  finals: ["总决赛", "Reached the Finals"],
  playoffs: ["打进季后赛", "Made the playoffs"],
  missed: ["未进季后赛", "Missed the playoffs"],
  pending: ["赛季进行中", "In progress"],
};

export function objectivesHtml(list, lang = "zh") {
  if (!list?.length) return "";
  const en = lang === "en";
  return `<span class="mtg-title">${en ? "Season goals" : "赛季目标"}</span>${list
    .map((o) => `<span class="mtg-chip is-${esc(o.status)}" aria-label="${esc(objectiveText(o, lang))}: ${o.status}">${MARK[o.status]} ${esc(objectiveText(o, lang))}</span>`)
    .join("")}`;
}

/** @param {{report:object, gold:{total:number,parts:object|null}|null, lang?:string}} p */
export function reportHtml({ report, gold, lang = "zh" }) {
  if (!report) return "";
  const en = lang === "en";
  const t = (zh, e) => (en ? e : zh);
  const finish = FINISH[report.finish] || FINISH.pending;
  const parts = gold?.parts;
  const goldLine = gold?.total
    ? `<p class="mtr-gold">🪙 ${t("本赛季金币", "Season gold")} +¤${gold.total}${parts ? ` <span>(${t("场次", "games")} ${parts.games} · ${t("完赛", "finish")} ${parts.completion}${parts.playoffs ? ` · ${t("季后赛", "playoffs")} ${parts.playoffs}` : ""}${parts.champion ? ` · ${t("冠军", "title")} ${parts.champion}` : ""})</span>` : ""}</p>`
    : "";
  const mvp = report.mvp
    ? `<p>${t("联赛 MVP", "League MVP")}：<strong>${esc(report.mvp.name)}</strong>${report.mvp.mine ? ` <em>${t("（是你的球员！）", "(your player!)")}</em>` : ""}</p>`
    : "";
  const rows = report.players.slice(0, 8).map((p) =>
    `<tr><td class="mtr-name">${esc(p.name)} <small>${esc(p.pos || "")}</small></td><td>${p.gp}</td><td class="mtr-min">${p.mpg}</td><td><b>${p.ppg}</b></td><td>${p.rpg}</td><td>${p.apg}</td></tr>`).join("");
  const table = rows
    ? `<p class="mtr-note">${t("球员数据含季后赛", "Player stats include the playoffs")}</p><div class="mtr-scroll"><table class="mtr-table"><thead><tr><th>${t("球员", "Player")}</th><th>${t("场", "GP")}</th><th class="mtr-min">${t("分钟", "MIN")}</th><th>${t("得分", "PTS")}</th><th>${t("篮板", "REB")}</th><th>${t("助攻", "AST")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : "";
  const star = report.star ? `<p>${t("本季球队核心", "Team leader")}：<strong>${esc(report.star.name)}</strong> ${report.star.ppg} PTS / ${report.star.rpg} REB / ${report.star.apg} AST</p>` : "";
  return `<h4>${t("赛季报告", "Season report")}</h4>
    <p class="mtr-head"><strong>${esc(t(...finish))}</strong> · ${report.w}${t("胜", "W")} ${report.l}${t("负", "L")}${report.rank ? ` · ${t(`联盟第 ${report.rank}/${report.teams}`, `Rank ${report.rank}/${report.teams}`)}` : ""}</p>
    ${mvp}${star}
    <div class="mtg-row">${objectivesHtml(report.objectives, lang)}</div>
    ${goldLine}${table}`;
}
