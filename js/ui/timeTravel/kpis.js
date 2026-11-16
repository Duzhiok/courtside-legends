import { FIRING_TRUST_FLOOR } from "../../career/balance.js";
import { icon } from "./icons.js";
import { clampPct, esc, gaugeTone } from "./format.js";
import { TL } from "../../i18n.js";

/** One word for each gauge so the number is never the only signal (and never colour-only). */
function trustWord(value, lang) {
  if (value <= FIRING_TRUST_FLOOR) return TL(lang, "解雇边缘", "On the brink");
  if (value >= 65) return TL(lang, "稳固", "Secure");
  if (value >= 35) return TL(lang, "摇摆", "Wavering");
  return TL(lang, "危险", "Danger");
}
function pressureWord(value, lang) {
  if (value >= 65) return TL(lang, "高压", "Intense");
  if (value >= 35) return TL(lang, "适中", "Steady");
  return TL(lang, "平静", "Calm");
}
function divergenceWord(value, lang) {
  if (value >= 40) return TL(lang, "蝴蝶效应", "Butterfly effect");
  if (value >= 15) return TL(lang, "分叉", "Forking");
  return TL(lang, "微扰", "Ripples");
}

function gauge(label, value, markAt, markLabel = "") {
  const mark = markAt == null
    ? ""
    : `<i class="tt-gauge-mark" style="left:${clampPct(markAt)}%" title="${esc(markLabel)}"></i>`;
  return `<span class="tt-gauge" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clampPct(value)}"><span class="tt-gauge-fill" style="width:${clampPct(value)}%"></span>${mark}</span>`;
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
  const shown = clampPct(count, 0, 5);
  return `<span class="tt-pips" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < shown ? "on" : ""}"></i>`).join("")}</span>`;
}

/** The persistent HUD: the five numbers a coach checks before every decision. */
export function kpiStripHtml({ trust = 0, pressure = 0, divergence = 0, knowledge = 0, cash = null }, lang = "zh") {
  const tiles = [
    tile({
      kpi: "trust", tone: gaugeTone(trust, true), ico: "shield",
      label: TL(lang, "管理层信任", "Front-office trust"), value: trust, word: trustWord(trust, lang),
      gaugeHtml: gauge(TL(lang, "管理层信任", "Front-office trust"), trust, FIRING_TRUST_FLOOR, TL(lang, "解雇线", "Firing line")),
    }),
    tile({
      kpi: "pressure", tone: gaugeTone(pressure, false), ico: "flame",
      label: TL(lang, "媒体压力", "Media pressure"), value: pressure, word: pressureWord(pressure, lang),
      gaugeHtml: gauge(TL(lang, "媒体压力", "Media pressure"), pressure),
    }),
    tile({
      kpi: "divergence", tone: "violet", ico: "branch",
      label: TL(lang, "时间线偏离", "Timeline drift"), value: divergence, word: divergenceWord(divergence, lang),
      gaugeHtml: gauge(TL(lang, "时间线偏离", "Timeline drift"), divergence),
    }),
    tile({
      kpi: "knowledge", tone: knowledge > 0 ? "gold" : "mid", ico: "eye",
      label: TL(lang, "未来知识", "Foresight"), value: knowledge,
      word: knowledge > 0 ? TL(lang, "可动用", "Available") : TL(lang, "已耗尽", "Spent"),
      gaugeHtml: pips(knowledge),
    }),
  ];
  if (cash != null) {
    tiles.push(tile({
      kpi: "cash", tone: "gold", ico: "coin",
      label: TL(lang, "个人现金", "Personal cash"), value: `¤${Math.round(cash)}`,
      word: TL(lang, "可支配", "Spendable"),
    }));
  }
  return tiles.join("");
}
