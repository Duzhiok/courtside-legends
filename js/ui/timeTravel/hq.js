import { icon } from "./icons.js";
import { teamNameL } from "../../i18n.js";
import { esc, readableInk, tr } from "./format.js";

const NEUTRAL = { primary: "#1a3a2a", secondary: "#f3efe4" };

/** Inline CSS custom properties that re-theme a whole card to one team. */
export function teamThemeStyle(colors) {
  const c = { ...NEUTRAL, ...(colors || {}) };
  return `--team-1:${c.primary};--team-2:${c.secondary};--team-ink:${readableInk(c.primary)}`;
}

/** Round crest: team colours + the roster team code. Colours only -- no logos or wordmarks. */
export function crestHtml(teamId, colors, { size = "md" } = {}) {
  return `<span class="tt-crest tt-crest-${size}" style="${teamThemeStyle(colors)}" aria-hidden="true"><span>${esc(String(teamId || "").slice(0, 3))}</span></span>`;
}

function recordText(season) {
  return season?.record ? `${season.record.w}-${season.record.l}` : "";
}

/**
 * Contract timeline: one node per year of the CURRENT contract (B4: renewals restart it), labelled
 * with the real historical year, plus a final "decision" node. Past nodes show that season's record.
 */
export function timelineHtml(vm, lang = "zh") {
  const nodes = [];
  for (let i = 0; i < vm.contractYears; i++) {
    const done = i < vm.yearsPlayed;
    const current = !vm.finished && i === vm.yearsPlayed;
    const season = vm.currentContractSeasons[i];
    const state = done ? "done" : current ? "current" : "future";
    const stateWord = done ? tr(lang, "已完成", "done") : current ? tr(lang, "进行中", "in progress") : tr(lang, "未开始", "upcoming");
    const champ = done && season?.champion ? icon("trophy", { size: 12 }) : "";
    nodes.push(
      `<li class="tt-node tt-node-${state}" aria-label="${esc(`${vm.startYear + i} ${stateWord}`)}">
        <span class="tt-node-dot">${done ? icon("check", { size: 12 }) : i + 1}</span>
        <span class="tt-node-year">${vm.startYear + i}</span>
        <span class="tt-node-note">${champ}${esc(done ? recordText(season) : "")}</span>
      </li>`,
    );
  }
  // The last node is the decision point: it becomes "current" once the contract's years are played.
  const atDecision = !vm.finished && vm.yearsPlayed >= vm.contractYears;
  const endState = vm.finished ? "done" : atDecision ? "current" : "future";
  nodes.push(
    `<li class="tt-node tt-node-end tt-node-${endState}">
      <span class="tt-node-dot">${icon(vm.finished ? "flag" : "scroll", { size: 12 })}</span>
      <span class="tt-node-year">${esc(vm.finished ? tr(lang, "结局", "Ending") : tr(lang, "续约", "Renewal"))}</span>
      <span class="tt-node-note"></span>
    </li>`,
  );
  return nodes.join("");
}

/**
 * The always-on career header. vm:
 *  { teamId, teamName, year, colors, coach:{level,reputation,age,mood}, yearsPlayed, contractYears,
 *    record:{w,l}|null, titles, finished, label }
 */
export function careerHeaderHtml(vm, lang = "zh") {
  const seasonsCoached = vm.currentContractSeasons.length;
  const contractPill = vm.finished
    ? tr(lang, `执教 ${seasonsCoached} 个赛季`, `${seasonsCoached} seasons coached`)
    : tr(lang, `合同第 ${Math.min(vm.yearsPlayed + 1, vm.contractYears)}/${vm.contractYears} 年`, `Contract yr ${Math.min(vm.yearsPlayed + 1, vm.contractYears)}/${vm.contractYears}`);
  const pills = [`<span class="tt-pill">${icon("clock", { size: 13 })}${esc(contractPill)}</span>`];
  if (vm.record) pills.push(`<span class="tt-pill">${esc(tr(lang, "上季", "Last"))} ${vm.record.w}-${vm.record.l}</span>`);
  if (vm.titles) pills.push(`<span class="tt-pill tt-pill-gold">${icon("trophy", { size: 13 })}×${vm.titles}</span>`);
  if (vm.label) pills.push(`<span class="tt-pill tt-pill-alert">${esc(vm.label)}</span>`);
  const c = vm.coach || {};
  const stats = [
    [tr(lang, "等级", "Level"), `Lv.${c.level ?? 1}`],
    [tr(lang, "声望", "Reputation"), c.reputation ?? 0],
    [tr(lang, "年龄", "Age"), c.age ?? "—"],
    [tr(lang, "心情", "Mood"), c.mood ?? "—"],
  ].map(([label, value]) => `<div class="tt-coach-stat"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
  return `<div class="tt-hq-team" style="${teamThemeStyle(vm.colors)}">
      ${crestHtml(vm.teamId, vm.colors, { size: "lg" })}
      <div class="tt-hq-id">
        <p class="tt-kicker">${esc(tr(lang, `${vm.year} 赛季 · 主教练`, `${vm.year} season · Head coach`))}</p>
        <h3 class="tt-hq-name">${esc(teamNameL(vm.teamName, lang))}</h3>
        <div class="tt-hq-pills">${pills.join("")}</div>
      </div>
    </div>
    <dl class="tt-coach">${stats}</dl>`;
}
