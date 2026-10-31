import { icon } from "./icons.js";
import { clamp, esc, tr } from "./format.js";

/** Progress toward something you can't afford yet: tells the player HOW FAR, not just "greyed out". */
function fund(cash, cost, lang) {
  const pct = clamp((cash / Math.max(1, cost)) * 100);
  return `<span class="tt-fund" aria-hidden="true"><i style="width:${pct}%"></i></span><span class="tt-fund-note">${esc(tr(lang, `还差 ¤${Math.max(0, Math.ceil(cost - cash))}`, `¤${Math.max(0, Math.ceil(cost - cash))} short`))}</span>`;
}

/** house: { label, cost, moodBonus, owned, affordable } */
export function houseRowHtml(house, cash, lang = "zh") {
  const locked = !house.owned && !house.affordable;
  const action = house.owned
    ? tr(lang, "已拥有", "Owned")
    : house.affordable ? tr(lang, "购买", "Buy") : "";
  return `<button type="button" class="tt-asset" data-state="${house.owned ? "owned" : house.affordable ? "ready" : "locked"}"${house.owned || !house.affordable ? " disabled" : ""}>
    <span class="tt-asset-ico">${icon("home", { size: 20 })}</span>
    <span class="tt-asset-main">
      <strong>${esc(house.label)}${house.owned ? tr(lang, "（已拥有）", " (owned)") : ""}</strong>
      <span>${esc(tr(lang, `花费 ¤${house.cost} · 每季心情 +${house.moodBonus}`, `Cost ¤${house.cost} · +${house.moodBonus} mood per season`))}</span>
      ${locked ? fund(cash, house.cost, lang) : ""}
    </span>
    ${action ? `<span class="tt-asset-act">${esc(action)}</span>` : ""}
  </button>`;
}

/** position: { label, forecast (fraction), stake, pending (¤ already staked this season), affordable } */
export function investRowHtml(position, cash, lang = "zh") {
  const pct = (position.forecast * 100).toFixed(1);
  const up = position.forecast >= 0;
  const sign = up ? "+" : "";
  return `<button type="button" class="tt-asset" data-state="${position.affordable ? "ready" : "locked"}"${position.affordable ? "" : " disabled"}>
    <span class="tt-asset-ico">${icon("chart", { size: 20 })}</span>
    <span class="tt-asset-main">
      <strong>${esc(position.label)}</strong>
      <span class="tt-forecast ${up ? "up" : "down"}">${esc(tr(lang, "预期走势", "Expected trend"))} ${sign}${pct}%</span>
      <span>${esc(tr(lang, `投入 ¤${position.stake}`, `Stake ¤${position.stake}`))}${position.pending ? esc(tr(lang, ` · 本季已投入 ¤${position.pending}`, ` · ¤${position.pending} staked this season`)) : ""}</span>
      ${position.affordable ? "" : fund(cash, position.stake, lang)}
    </span>
    <span class="tt-asset-act">${esc(position.affordable ? tr(lang, "投入", "Invest") : "")}</span>
  </button>`;
}
