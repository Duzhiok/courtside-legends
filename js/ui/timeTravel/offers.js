import {
  REEMPLOYMENT_FULL_BOARD_REPUTATION,
  REEMPLOYMENT_LIMITED_BOARD_REPUTATION,
} from "../../career/balance.js";
import { icon } from "./icons.js";
import { clamp, esc, gaugeTone, tr } from "./format.js";
import { crestHtml, teamThemeStyle } from "./hq.js";

const ARCHETYPES = {
  rebuild: { zh: "重建队", en: "Rebuilding", blurb: ["耐心、权限大", "Patient, big say"] },
  middle: { zh: "中游队", en: "Bubble team", blurb: ["取舍、均衡", "Balanced stakes"] },
  contender: { zh: "争冠队", en: "Contender", blurb: ["高压、容错低", "High heat, no slack"] },
};
export const archetypeLabel = (id, lang) => tr(lang, ARCHETYPES[id]?.zh ?? id, ARCHETYPES[id]?.en ?? id);

function bar(label, value, tone) {
  const v = clamp(value);
  return `<span class="tt-bar" data-tone="${tone}"><span class="tt-bar-label">${esc(label)}</span><span class="tt-bar-track"><i style="width:${v}%"></i></span><b>${v}</b></span>`;
}

function coreRow(core, lang) {
  if (!core?.length) return "";
  const players = core.map((p) => `<span class="tt-core-p"><b>${esc(p.ovr)}</b><span>${esc(p.name)}</span></span>`).join("");
  return `<span class="tt-core"><span class="tt-core-label">${esc(tr(lang, "核心球员", "Core players"))}</span>${players}</span>`;
}

/**
 * One interview / job-search offer as a selectable team card.
 * ctx: { colors, core:[{name,ovr}], lang }
 */
export function interviewOfferCardHtml(offer, { colors, core = [], lang = "zh" } = {}) {
  const arch = esc(offer.archetype);
  const label = archetypeLabel(offer.archetype, lang);
  const aria = tr(
    lang,
    `${offer.teamName}，${label}。${offer.summary}。首年目标：${offer.firstYearGoal}。权限 ${offer.authority}，信任 ${offer.trust}，压力 ${offer.pressure}`,
    `${offer.teamName}, ${label}. ${offer.summary} First-year goal: ${offer.firstYearGoal}. Authority ${offer.authority}, trust ${offer.trust}, pressure ${offer.pressure}`,
  );
  return `<button type="button" class="tt-offer" role="radio" aria-checked="false" data-offer-id="${esc(offer.id)}" data-archetype="${arch}" data-team="${esc(offer.teamName)}" style="${teamThemeStyle(colors)}" aria-label="${esc(aria)}">
    <span class="tt-offer-head">
      ${crestHtml(offer.teamId, colors)}
      <span class="tt-offer-title"><span class="tt-arch" data-arch="${arch}">${esc(label)}</span><strong>${esc(offer.teamName)}</strong></span>
    </span>
    <span class="tt-offer-sum">${esc(offer.summary)}</span>
    ${coreRow(core, lang)}
    <span class="tt-offer-goal">${icon("flag", { size: 14 })}<span>${esc(tr(lang, "首年目标", "Year-one goal"))}：<strong>${esc(offer.firstYearGoal)}</strong></span></span>
    <span class="tt-bars">
      ${bar(tr(lang, "权限", "Authority"), offer.authority, "good")}
      ${bar(tr(lang, "信任", "Trust"), offer.trust, gaugeTone(offer.trust, true))}
      ${bar(tr(lang, "压力", "Pressure"), offer.pressure, gaugeTone(offer.pressure, false))}
    </span>
  </button>`;
}

/** The slot of an offer your reputation can't reach yet: explains WHY it isn't there. */
export function lockedOfferHtml(archetype, reputation, lang = "zh") {
  const need = archetype === "contender" ? REEMPLOYMENT_FULL_BOARD_REPUTATION : REEMPLOYMENT_LIMITED_BOARD_REPUTATION;
  return `<div class="tt-offer tt-offer-locked" data-archetype="${esc(archetype)}" aria-disabled="true">
    <span class="tt-offer-head">
      <span class="tt-crest tt-crest-md tt-crest-locked" aria-hidden="true">${icon("lock", { size: 20 })}</span>
      <span class="tt-offer-title"><span class="tt-arch" data-arch="${esc(archetype)}">${esc(archetypeLabel(archetype, lang))}</span><strong>${esc(tr(lang, "暂无人邀请", "No interest yet"))}</strong></span>
    </span>
    <span class="tt-offer-sum">${esc(tr(lang, `需要教练声望 ≥ ${need}（你现在 ${reputation}）。多打出成绩，下次再来。`, `Needs coach reputation ≥ ${need} (you have ${reputation}). Win more, then come back.`))}</span>
  </div>`;
}

/** The three archetype slots in order, locked ones included, so the board is never confusingly short. */
export function jobBoardHtml(offers, { reputation, colorsOf, coreOf, lang = "zh" }) {
  return ["rebuild", "middle", "contender"].map((arch) => {
    const offer = offers.find((candidate) => candidate.archetype === arch);
    return offer
      ? interviewOfferCardHtml(offer, { colors: colorsOf(offer.teamId), core: coreOf(offer), lang })
      : lockedOfferHtml(arch, reputation, lang);
  }).join("");
}

const TIER_TONE = {
  "dynasty-extension": "gold",
  "contender-extension": "red",
  "rebuild-extension": "teal",
  "trial-extension": "grey",
};

/** A renewal offer as a comparable card: years / salary / authority up front, perks as chips. */
export function contractOfferCardHtml(offer, lang = "zh") {
  const perks = offer.privileges?.length
    ? offer.privileges.map((perk) => `<span class="tt-perk">${icon("check", { size: 12 })}${esc(perk)}</span>`).join("")
    : `<span class="tt-perk tt-perk-none">${esc(tr(lang, "无（先证明自己）", "None (prove yourself first)"))}</span>`;
  return `<button type="button" class="tt-contract" role="radio" aria-checked="false" data-offer-id="${esc(offer.id)}" data-tier="${esc(TIER_TONE[offer.id] || "grey")}">
    <span class="tt-contract-title">${icon("scroll", { size: 16 })}<strong>${esc(offer.title)}</strong></span>
    <span class="tt-contract-desc">${esc(offer.description)}</span>
    <span class="tt-contract-nums">
      <span><b>${esc(offer.years)}</b><i>${esc(tr(lang, "年", "yrs"))}</i></span>
      <span><b>¤${esc(offer.salary)}</b><i>${esc(tr(lang, "年薪", "salary"))}</i></span>
      <span><b>${esc(offer.authority)}</b><i>${esc(tr(lang, "权限", "authority"))}</i></span>
    </span>
    <span class="tt-perks"><span class="tt-perks-label">${esc(tr(lang, "特权", "Perks"))}</span>${perks}</span>
  </button>`;
}
