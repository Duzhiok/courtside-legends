// HTML for the pick-and-roll roles panel (model: pnrBoardModel.js). Events are plain `data-tb` buttons handled by tacticsBoardView.js.
import { esc } from "../../core/html.js";
import { TL } from "../../i18n.js";

const badge = (cls, text) => ` <small class="tb-badge tb-badge-${cls}">${esc(text)}</small>`;

function marks(o, lang) {
  return (o.recommended && !o.changed ? badge("rec", TL(lang, "推荐", "Suggested")) : "")
    + (o.changed ? badge("set", TL(lang, "已改", "Changed")) : "")
    + (o.risky ? badge("risk", TL(lang, "高风险", "Risky")) : "");
}

const button = (kind, o, label, lang, extra = "") =>
  `<button type="button" class="tb-action${o.selected ? " is-active" : ""}${o.risky ? " is-risky" : ""}" data-tb="${kind}" data-id="${esc(o.id)}"${extra} aria-pressed="${o.selected}">${esc(label)}${marks(o, lang)}</button>`;

const group = (title, body, hint = "") =>
  `<div class="tb-pnr-group"><h4 class="tb-pnr-h">${esc(title)}</h4><div class="tb-actions">${body}</div>${hint ? `<p class="tb-pnr-hint">${esc(hint)}</p>` : ""}</div>`;

export function pnrPanelHtml(pnr, lang = "zh") {
  if (!pnr) return "";
  const screener = group(TL(lang, "掩护人", "Screener"), pnr.screener.map((p) => button("pnr-screener", p, `${p.short} · ${p.pos}`, lang)).join(""));
  const after = pnr.afterScreen.find((o) => o.selected);
  const afterScreen = group(TL(lang, "掩护之后", "After the screen"), pnr.afterScreen.map((o) => button("pnr-after", o, o.label, lang)).join(""), after?.hint);
  const offBall = `<div class="tb-pnr-group"><h4 class="tb-pnr-h">${esc(TL(lang, "其余球员", "Everyone else"))}</h4><ul class="tb-pnr-men">${pnr.offBall.map((p) => `<li class="tb-pnr-man"><span class="tb-pnr-name">${esc(p.short)} <small>${esc(p.pos)}</small></span><span class="tb-actions">${p.choices.map((c) => `<button type="button" class="tb-action${c.selected ? " is-active" : ""}" data-tb="pnr-off" data-id="${esc(p.id)}" data-val="${esc(c.id)}" aria-pressed="${c.selected}">${esc(c.label)}${c.selected && p.changed ? badge("set", TL(lang, "已改", "Changed")) : c.recommended && !p.changed ? badge("rec", TL(lang, "推荐", "Suggested")) : ""}</button>`).join("")}</span></li>`).join("")}</ul></div>`;
  const fin = pnr.finish.find((o) => o.selected);
  const finish = group(TL(lang, "持球人终结", "Handler finish"), pnr.finish.map((o) => button("pnr-finish", o, o.label, lang)).join(""), fin?.hint);
  const reset = pnr.anyChanged ? `<button type="button" class="btn ghost tb-pnr-reset" data-tb="pnr-reset">${esc(TL(lang, "全部恢复推荐", "Back to suggested"))}</button>` : "";
  return `<section class="tb-pnr" aria-label="${esc(TL(lang, "挡拆配合", "Pick-and-roll roles"))}">
    <h3 class="tb-h">${esc(TL(lang, "挡拆配合", "Pick-and-roll roles"))} <small>${esc(TL(lang, `${pnr.handlerName} 持球`, `${pnr.handlerName} has the ball`))}</small>${reset}</h3>
    ${screener}${afterScreen}${offBall}${finish}
  </section>`;
}
