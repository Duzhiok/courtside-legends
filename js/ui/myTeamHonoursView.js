/**
 * Honours Room (pure HTML). ONE chronological list: each season appears exactly once, newest first. A champion row opens
 * to show the five who started that season — but only when the record actually holds that lineup. Older seasons
 * (saved before lineups were recorded) show just their real result; nothing is rebuilt from today's collection.
 */
import { photoImg } from "../data/photo.js";
import { SLOT_ORDER } from "../myteam/courtSlots.js";
import { recordLineup, seasonRecordSummary } from "../myteam/seasonRecord.js";
import { myTeamSeasonLine } from "./myWorldView.js";
import { esc, T, displayName } from "./myTeamViewKit.js";

/** The recorded five in court order, each as a player-like object for photoImg (it only needs bref/season/team/name). */
function lineupFigures(record, lang) {
  const byPos = new Map(recordLineup(record).map((e) => [e.pos, e]));
  const entries = SLOT_ORDER.map((pos) => byPos.get(pos)).filter(Boolean);
  const ordered = entries.length === SLOT_ORDER.length ? entries : recordLineup(record); // two on one position: keep recorded order
  if (!ordered.length) return "";
  const figs = ordered.map((e) => `<li class="mtc-five-card" data-card="${esc(e.id)}">
      <span class="mtc-five-photo">${photoImg({ id: e.id, bref: e.bref, name: e.name, season: e.season, team: e.team }, "headshot")}</span>
      <span class="mtc-five-name">${esc(displayName(e, lang))}</span>
      <span class="mtc-five-meta">${esc(e.pos)} · OVR ${esc(e.ovr)}</span>
    </li>`).join("");
  return `<ul class="mtc-five" aria-label="${T(lang, "当年首发五虎", "Starting five that season")}">${figs}</ul>`;
}

function seasonRow(r, lang) {
  const date = r.finishedAt ? new Date(r.finishedAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-CN") : "";
  const line = `${date ? `${esc(date)} · ` : ""}${myTeamSeasonLine(r, lang)}`;
  if (!r.champion) return `<li class="mtc-season">${line}</li>`;
  const five = lineupFigures(r, lang);
  return five
    ? `<li class="mtc-season is-champion"><details><summary><span class="mtc-cup" aria-hidden="true">🏆</span><span class="mtc-season-line">${line}</span><span class="mtc-more">${T(lang, "当年首发", "Starting five")}</span></summary>${five}</details></li>`
    : `<li class="mtc-season is-champion"><span class="mtc-cup" aria-hidden="true">🏆</span> ${line}</li>`;
}

export function honoursHtml(s, lang) {
  if (!s.seasons.length) {
    return `<section class="mtc-card"><h3>${T(lang, "王朝荣誉", "Dynasty Honours")}</h3>
      <p class="mtc-empty">${T(lang, "还没有赛季记录。打完一个我的赛季，战绩与冠军会出现在这里。", "No season records yet. Finish a My Team season and your results and titles will show up here.")}</p></section>`;
  }
  const formats = ["quick", "full"].filter((v) => s.seasons.some((r) => r?.variant === v)).map((v) => esc(seasonRecordSummary(s.seasons, v, lang))).join(" · ");
  return `<section class="mtc-card"><h3>${T(lang, "王朝荣誉", "Dynasty Honours")}</h3>
    <ul class="mtc-honours-list">${s.seasons.map((r) => seasonRow(r, lang)).join("")}</ul>
    <p class="mtc-note">${T(lang, `季后赛 ${s.playoffs} 次 · 总决赛 ${s.finals} 次 · 共打了 ${s.played} 个赛季`, `${s.playoffs} playoff runs · ${s.finals} Finals · ${s.played} seasons played`)}</p>
    ${formats ? `<p class="mtc-note">${formats}</p>` : ""}
  </section>`;
}
