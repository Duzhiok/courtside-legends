/**
 * Stateless DOM painters for the time-travel screen. Each takes explicit data (never reads app
 * state), writes into elements that already exist in index.html, and returns nothing -- so the
 * controller (screen.js) decides WHAT to show and these decide HOW it looks.
 */
import { SEASON_GOAL_TRUST_BONUS, SEASON_GOAL_TRUST_PENALTY, FIRING_TRUST_FLOOR } from "../../career/balance.js";
import { listCoachOrigins, coachOrigin } from "../../career/coachOrigins.js";
import { stintCardHtml, verdictHtml } from "./epilogue.js";
import { $ } from "./dom.js";
import { esc, tr } from "./format.js";
import { houseRowHtml, investRowHtml } from "./finance.js";
import { careerHeaderHtml, teamThemeStyle, timelineHtml } from "./hq.js";
import { icon } from "./icons.js";
import { kpiStripHtml } from "./kpis.js";
import { onThinIce, teamColorsFor, teamNameFor } from "./viewModel.js";
import {
  decadeChipsHtml, eraNote, originChipsHtml, originDeltasHtml, philosophyCardsHtml,
} from "./wizard.js";


/** Re-theme the whole screen to one team (or back to neutral when there is no career). */
export function paintTheme(colors) {
  const shell = $(".tt-shell");
  if (!shell) return;
  const style = teamThemeStyle(colors);
  for (const part of style.split(";")) {
    const [name, value] = part.split(":");
    shell.style.setProperty(name, value);
  }
}

export function paintHq(vm, lang) {
  const hq = $("#tt-hq");
  if (!hq) return;
  hq.hidden = false;
  $("#tt-hq-head").innerHTML = careerHeaderHtml(vm, lang);
  const timeline = $("#time-travel-stepper");
  timeline.hidden = false;
  timeline.innerHTML = timelineHtml(vm, lang);
  paintTheme(vm.colors);
}

export function hideHq() {
  $("#tt-hq").hidden = true;
  $("#time-travel-stepper").hidden = true;
  $("#time-travel-resources").hidden = true;
  paintTheme(null);
}

export function paintKpis(model, lang) {
  const strip = $("#time-travel-resources");
  strip.hidden = false;
  strip.innerHTML = kpiStripHtml(model, lang);
}

/** The "time machine": year dial + philosophy + origin, all driven by the three real <select>s. */
export function paintWizard(lang) {
  const yearSelect = $("#time-travel-year");
  const philosophySelect = $("#time-travel-philosophy");
  const originSelect = $("#time-travel-origin");
  const years = [...yearSelect.options].map((option) => Number(option.value)).sort((a, b) => a - b);
  if (!years.length) return;
  const year = years.includes(Number(yearSelect.value)) ? Number(yearSelect.value) : years.at(-1);
  const range = $("#tt-year-range");
  range.min = 0;
  range.max = years.length - 1;
  range.value = years.indexOf(year);
  range.setAttribute("aria-label", tr(lang, "穿越年份", "Year to travel to"));
  range.setAttribute("aria-valuetext", String(year));
  $("#tt-year-readout").textContent = year;
  $("#tt-era-note").textContent = eraNote(year, lang);
  $("#tt-decade-chips").innerHTML = decadeChipsHtml(years, year, lang);
  $("#tt-philosophy-cards").innerHTML = philosophyCardsHtml(philosophySelect.value, lang);
  const origins = listCoachOrigins();
  const origin = coachOrigin(originSelect.value);
  $("#tt-origin-chips").innerHTML = originChipsHtml(origins, origin.id, lang);
  $("#time-travel-origin-desc").textContent = tr(lang, origin.description, origin.descriptionEn);
  $("#tt-origin-deltas").innerHTML = originDeltasHtml(origin, lang);
  const philosophyLabel = philosophySelect.selectedOptions[0]?.textContent ?? "";
  $("#tt-wizard-summary").textContent = tr(
    lang,
    `${year} 年 · ${philosophyLabel} · ${origin.label}`,
    `${year} · ${philosophyLabel} · ${origin.labelEn}`,
  );
  $("#btn-time-travel-interview").textContent = tr(lang, "参加球队面试", "Go to the interviews");
}

/** coach + housing/investment rows. `model` is built by screen.js from the real finance module. */
export function paintFinance(model, lang) {
  $("#tt-finance-title").innerHTML = `${icon("coin", { size: 18 })}<h3>${esc(tr(lang, "个人财务", "Personal finance"))}</h3>`;
  $("#time-travel-finance-summary").textContent = tr(
    lang,
    `现金 ¤${model.cash} · 年薪 ¤${model.salary} · 住房：${model.housingLabel || "暂无"}`,
    `Cash ¤${model.cash} · Salary ¤${model.salary} · Housing: ${model.housingLabel || "none"}`,
  );
  $("#time-travel-house-list").innerHTML = model.houses.map((house) => houseRowHtml(house, model.cash, lang)).join("");
  const houseButtons = $("#time-travel-house-list").querySelectorAll("button");
  model.houses.forEach((house, index) => { houseButtons[index].dataset.house = house.id; });
  $("#time-travel-invest-list").innerHTML = model.investments.length
    ? model.investments.map((position) => investRowHtml(position, model.cash, lang)).join("")
    : `<p class="tt-faint">${esc(tr(lang, "这个年代还没有任何可投资的资产类别。", "No asset classes exist in this era yet."))}</p>`;
  const investButtons = $("#time-travel-invest-list").querySelectorAll("button");
  model.investments.forEach((position, index) => { investButtons[index].dataset.asset = position.id; });
}

/** The board goal for this season + the two ways to lose the job, in plain words. */
export function paintGoal(root, lang) {
  const goal = root.story.seasonGoal;
  const card = $("#tt-goal");
  if (!goal) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  $("#tt-goal-title").innerHTML = `${icon("flag", { size: 18 })}<h3>${esc(tr(lang, "董事会目标", "Board goal"))}</h3>`;
  const warning = onThinIce(root)
    ? `<p class="tt-goal-meta"><span class="tt-pill tt-pill-alert">${esc(tr(lang, "上季目标落空：再落空一次就会被解雇", "Missed last season — miss again and you're out"))}</span></p>`
    : "";
  $("#tt-goal-body").innerHTML = `<p class="tt-goal-text">${esc(tr(lang, goal.label, goal.labelEn || goal.label))}</p>
    <div class="tt-goal-meta">
      <span class="tt-eff tt-eff-good"><span class="tt-eff-name">${esc(tr(lang, "达成", "Hit"))}</span><span class="tt-eff-num">${esc(tr(lang, "信任", "Trust"))} +${Math.abs(SEASON_GOAL_TRUST_BONUS)}</span></span>
      <span class="tt-eff tt-eff-bad"><span class="tt-eff-name">${esc(tr(lang, "落空", "Miss"))}</span><span class="tt-eff-num">${esc(tr(lang, "信任", "Trust"))} −${Math.abs(SEASON_GOAL_TRUST_PENALTY)}</span></span>
    </div>
    ${warning}
    <p class="tt-faint">${esc(tr(lang, `连续两季落空，或信任跌到 ${FIRING_TRUST_FLOOR} 以下，都会被解雇。`, `Two missed goals in a row — or trust below ${FIRING_TRUST_FLOOR} — gets you fired.`))}</p>`;
}

/** Season cards + "history rewritten" diff rows (replaces the old bullet lists). */
export function paintReport(report, lang) {
  const finish = (season) => (season.champion
    ? `${icon("trophy", { size: 13 })}${esc(tr(lang, "夺冠", "Champions"))}`
    : esc(season.finish || tr(lang, "赛季进行中", "In progress")));
  $("#time-travel-report-seasons").innerHTML = report.seasons.map((season) => `<li class="tt-season" data-champ="${season.champion}">
      <span class="tt-season-year">${esc(season.year)}</span>
      <span class="tt-season-rec">${season.record ? `${season.record.w}-${season.record.l}` : "—"}</span>
      <span class="tt-season-fin">${finish(season)}</span>
    </li>`).join("");
  $("#time-travel-report-list").innerHTML = report.historyChanges.length
    ? report.historyChanges.map((change) => `<li class="tt-change"><b>${esc(change.year)}</b><span>${esc(tr(lang, "史实冠军", "Real champion"))}</span><s>${esc(change.historicalChampion)}</s><span aria-hidden="true">→</span><strong>${esc(change.currentChampion)}</strong></li>`).join("")
    : `<li class="tt-change tt-change-empty">${esc(tr(lang, "目前还没有改写史实冠军，分叉仍在积累。", "No real-world champion rewritten yet — the fork is still building."))}</li>`;
}

/**
 * "How it ended": verdict banner + the career-so-far stint cards (completed stints only). While the
 * coach is still employed (`over: false`) only the record is drawn -- there is no verdict yet.
 */
export function paintEpilogue(root, report, lang, { over = true } = {}) {
  const story = root.story;
  const tier = report.ending?.narrativeTier;
  $("#tt-verdict").innerHTML = over ? verdictHtml({
    status: story.employment?.status,
    tone: tier?.tone || report.ending?.tone,
    tierLabel: tier ? tr(lang, tier.label, tier.labelEn || tier.label) : "",
    endingLabel: report.ending ? tr(lang, report.ending.label, report.ending.labelEn || report.ending.label) : "",
  }, lang) : "";
  const stints = root.coach?.stints || [];
  $("#tt-stints").innerHTML = stints.map((stint) => {
    const year = stint.startYear ?? report.startYear;
    return stintCardHtml(stint, { teamName: teamNameFor(year, stint.teamId), colors: teamColorsFor(year, stint.teamId) }, lang);
  }).join("");
}

