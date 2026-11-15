import { icon } from "./icons.js";
import { teamNameL } from "../../i18n.js";
import { crestHtml } from "./hq.js";
import { esc } from "./format.js";
import { TL } from "../../i18n.js";
import { stintSpan } from "../../career/stints.js";

/** Every value careerContract.js can write as an employment/stint reason (plus the status names). */
const REASON = {
  fired: ["被解雇", "Fired"],
  "trust-collapsed": ["信任破产被解雇", "Fired: trust collapsed"],
  "missed-goals": ["目标落空被解雇", "Fired: missed goals"],
  "two-bad-seasons": ["战绩低迷被解雇", "Fired: losing seasons"],
  departed: ["主动离队", "Walked away"],
  poached: ["被挖角", "Poached away"],
  retired: ["已退休", "Retired"],
};
/** Never leak a raw id to the player: unknown reasons fall back to a neutral "left the team". */
export const reasonLabel = (reason, lang) => TL(lang, REASON[reason]?.[0] ?? "已离任", REASON[reason]?.[1] ?? "Left the team");

/** stint + { teamName, colors } -> one card in the career-so-far strip */
export function stintCardHtml(stint, { teamName, colors }, lang = "zh") {
  const record = `${stint.wins}-${stint.losses}`;
  const titles = stint.championships
    ? `<span class="tt-pill tt-pill-gold">${icon("trophy", { size: 13 })}×${stint.championships}</span>`
    : "";
  return `<li class="tt-stint" data-reason="${esc(["departed", "poached", "retired"].includes(stint.reason) ? stint.reason : "fired")}">
    ${crestHtml(stint.teamId, colors)}
    <span class="tt-stint-main">
      <strong>${esc(teamNameL(teamName || stint.teamId, lang))}</strong>
      <span class="tt-stint-years">${esc(stintSpan(stint))} · ${esc(TL(lang, `${stint.seasons} 个赛季`, `${stint.seasons} seasons`))}</span>
    </span>
    <span class="tt-stint-stats"><b>${esc(record)}</b>${titles}<span class="tt-stint-reason">${esc(reasonLabel(stint.reason, lang))}</span></span>
  </li>`;
}

/**
 * The "how it ended" banner. vm: { tierLabel, endingLabel, note?, tone, status }. `note` (retirement:
 * the age and whether it was your choice) replaces the usual sub-line.
 */
export function verdictHtml(vm, lang = "zh") {
  const headline = vm.tierLabel || vm.endingLabel || TL(lang, "这一段执教结束了", "This chapter is over");
  const sub = vm.note || (vm.tierLabel && vm.endingLabel ? vm.endingLabel : "");
  return `<div class="tt-verdict" data-tone="${esc(vm.tone || "neutral")}" data-status="${esc(vm.status)}">
    <span class="tt-verdict-ico">${icon(vm.status === "fired" ? "briefcase" : vm.status === "retired" && vm.tone === "success" ? "trophy" : "flag", { size: 26 })}</span>
    <div>
      <p class="tt-kicker">${esc(reasonLabel(vm.status, lang))}</p>
      <h3>${esc(headline)}</h3>
      ${sub ? `<p class="tt-verdict-sub">${esc(sub)}</p>` : ""}
    </div>
  </div>`;
}
