import { LEGACY_TIERS } from "../../career/legacy.js";
import { esc, tr } from "./format.js";
import { icon } from "./icons.js";

/** Tier label for a legacy tier id; an unknown id falls back to the id's own neutral wording, never a raw key. */
export function legacyTierLabel(tierId, lang = "zh") {
  const tier = LEGACY_TIERS[tierId];
  return tier ? tr(lang, tier.label, tier.labelEn) : tr(lang, "生涯总评", "Career verdict");
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;

/** "1995–2003 · retired at 61 · legacy score 84". Pieces that aren't known are simply left out. */
function legacyFootnote(legacy, lang) {
  const span = Number.isInteger(legacy.firstYear) && Number.isInteger(legacy.lastYear)
    ? (legacy.lastYear > legacy.firstYear ? `${legacy.firstYear}–${legacy.lastYear}` : String(legacy.firstYear))
    : "";
  const age = Number.isFinite(legacy.age) ? tr(lang, `${legacy.age} 岁`, `age ${legacy.age}`) : "";
  const score = tr(lang, `生涯评分 ${legacy.score}`, `legacy score ${legacy.score}`);
  return [span, age, score].filter(Boolean).join(" · ");
}

/** The four lifetime numbers + the one-line footnote. legacy = career/legacy.js buildLegacy(). */
export function legacyTilesHtml(legacy, lang = "zh") {
  const tiles = [
    [String(legacy.seasons), tr(lang, "个赛季", "seasons")],
    [`${legacy.wins}-${legacy.losses}`, tr(lang, `总战绩 · ${percent(legacy.winPct)}`, `record · ${percent(legacy.winPct)}`)],
    [String(legacy.titles), tr(lang, "总冠军", "titles")],
    [String(legacy.teams), tr(lang, "支球队", "clubs")],
  ];
  return `<ul class="tt-legacy-tiles">${tiles.map(([value, label]) => `<li><strong>${esc(value)}</strong><span>${esc(label)}</span></li>`).join("")}</ul>
    <p class="tt-faint tt-legacy-foot">${esc(legacyFootnote(legacy, lang))}</p>`;
}

/** Body of the "hang up the whistle?" card: how the career would be remembered if it ended today. */
export function retirePreviewHtml(legacy, lang = "zh") {
  const tier = LEGACY_TIERS[legacy.tier];
  return `<div class="tt-retire-tier" data-tone="${esc(tier?.tone || "neutral")}">
    <span class="tt-verdict-ico">${icon(tier?.tone === "success" ? "trophy" : "flag", { size: 22 })}</span>
    <div>
      <p class="tt-kicker">${esc(tr(lang, "如果今天挂靴，你会被记作", "If you retired today, you'd be remembered as"))}</p>
      <h4>${esc(legacyTierLabel(legacy.tier, lang))}</h4>
    </div>
  </div>
  ${legacyTilesHtml(legacy, lang)}`;
}
