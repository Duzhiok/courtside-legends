import { FIRING_TRUST_FLOOR } from "../../career/balance.js";
import { icon } from "./icons.js";
import { clamp, esc, gaugeTone, tr } from "./format.js";

/** One word for each gauge so the number is never the only signal (and never colour-only). */
export function trustWord(value, lang) {
  if (value <= FIRING_TRUST_FLOOR) return tr(lang, "解雇边缘", "On the brink");
  if (value >= 65) return tr(lang, "稳固", "Secure");
  if (value >= 35) return tr(lang, "摇摆", "Wavering");
  return tr(lang, "危险", "Danger");
}
export function pressureWord(value, lang) {
  if (value >= 65) return tr(lang, "高压", "Intense");
  if (value >= 35) return tr(lang, "适中", "Steady");
  return tr(lang, "平静", "Calm");
}
export function divergenceWord(value, lang) {
  if (value >= 40) return tr(lang, "蝴蝶效应", "Butterfly effect");
  if (value >= 15) return tr(lang, "分叉", "Forking");
  return tr(lang, "微扰", "Ripples");
}

function gauge(label, value, markAt, markLabel = "") {
  const mark = markAt == null
    ? ""
    : `<i class="tt-gauge-mark" style="left:${clamp(markAt)}%" title="${esc(markLabel)}"></i>`;
  return `<span class="tt-gauge" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clamp(value)}"><span class="tt-gauge-fill" style="width:${clamp(value)}%"></span>${mark}</span>`;
}

function tile({ kpi, tone, ico, label, value, word, gaugeHtml = "" }) {
  return `<div class="tt-kpi" data-kpi="${kpi}" data-tone="${tone}">
    <div class="tt-kpi-top"><span class="tt-kpi-ico">${icon(ico, { size: 16 })}</span><span class="tt-kpi-label">${esc(label)}</span></div>
    <div class="tt-kpi-value"><strong>${esc(value)}</strong><span class="tt-kpi-word">${esc(word)}</span></div>
    ${gaugeHtml}
  </div>`;
}

/** Foresight is a small stock, not a 0-100 meter: show it as pips (max 5 drawn, number is exact). */
function pips(count) {
  const shown = clamp(count, 0, 5);
  return `<span class="tt-pips" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < shown ? "on" : ""}"></i>`).join("")}</span>`;
}

/** The persistent HUD: the five numbers a coach checks before every decision. */
export function kpiStripHtml({ trust = 0, pressure = 0, divergence = 0, knowledge = 0, cash = null }, lang = "zh") {
  const tiles = [
    tile({
      kpi: "trust", tone: gaugeTone(trust, true), ico: "shield",
      label: tr(lang, "管理层信任", "Front-office trust"), value: trust, word: trustWord(trust, lang),
      gaugeHtml: gauge(tr(lang, "管理层信任", "Front-office trust"), trust, FIRING_TRUST_FLOOR, tr(lang, "解雇线", "Firing line")),
    }),
    tile({
      kpi: "pressure", tone: gaugeTone(pressure, false), ico: "flame",
      label: tr(lang, "媒体压力", "Media pressure"), value: pressure, word: pressureWord(pressure, lang),
      gaugeHtml: gauge(tr(lang, "媒体压力", "Media pressure"), pressure),
    }),
    tile({
      kpi: "divergence", tone: "violet", ico: "branch",
      label: tr(lang, "时间线偏离", "Timeline drift"), value: divergence, word: divergenceWord(divergence, lang),
      gaugeHtml: gauge(tr(lang, "时间线偏离", "Timeline drift"), divergence),
    }),
    tile({
      kpi: "knowledge", tone: knowledge > 0 ? "gold" : "mid", ico: "eye",
      label: tr(lang, "未来知识", "Foresight"), value: knowledge,
      word: knowledge > 0 ? tr(lang, "可动用", "Available") : tr(lang, "已耗尽", "Spent"),
      gaugeHtml: pips(knowledge),
    }),
  ];
  if (cash != null) {
    tiles.push(tile({
      kpi: "cash", tone: "gold", ico: "coin",
      label: tr(lang, "个人现金", "Personal cash"), value: `¤${Math.round(cash)}`,
      word: tr(lang, "可支配", "Spendable"),
    }));
  }
  return tiles.join("");
}
