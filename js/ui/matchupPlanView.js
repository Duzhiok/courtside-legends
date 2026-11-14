/**
 * Opponent scouting + counter-plans for the season hub's next game. Pure string renderer, compact on purpose:
 * one collapsed <details>, two threat lines, four plan tabs, ONE selected plan at a time.
 */
import { tacticName, TACTICS } from "../data/coaches.js";
import { roleName } from "../myteam/playerRoleFit.js";
import { esc } from "./myTeamViewKit.js";

const KIND = { interior: ["内线威胁", "Interior threat"], perimeter: ["外线威胁", "Perimeter threat"] };
const LEVEL = { extreme: ["极高", "Extreme"], high: ["高", "High"], medium: ["中", "Medium"], low: ["较低", "Low"] };
const NAME = { contain: ["限制核心", "Contain"], exhaust: ["消耗对手", "Exhaust"], spacing: ["外线拉开", "Go around"], outscore: ["主动对轰", "Outscore"] };
const FOCUS = {
  contain: ["防守：护框、控制篮板，按对手外线威胁决定协防强度。进攻：均衡，避免不必要的强攻。", "Defence: protect the rim and own the glass; help only as far as his shooters allow. Offence: balanced."],
  exhaust: ["进攻：多打挡拆、加快节奏，让他在防守端消耗体力。防守：保持常规。", "Offence: more pick-and-roll and pace to make him work on defence. Defence: normal."],
  spacing: ["进攻：拉开空间、增加外线出手，不正面挑战禁区。防守：保持常规。", "Offence: stretch the floor, shoot more from outside, stay out of his paint. Defence: normal."],
  outscore: ["进攻：把资源集中在我们最好的创造者和射手身上。防守：接受他得分，不为此牺牲进攻火力。", "Offence: put the resources into our best creators and shooters. Defence: accept his points; don't pay for them with offence."],
};
const SACRIFICE = {
  contain: ["协防过多会放空外线投手，内线球员也可能陷入犯规麻烦。", "Heavy help can leave shooters open and put bigs in foul trouble."],
  exhaust: ["效果取决于体能和节奏；他不一定会被拖垮。", "Depends on stamina and pace; he may not wear down."],
  spacing: ["禁区防守和篮板会变薄。", "Interior defence and rebounding get thinner."],
  outscore: ["我们很可能挡不住他：这是用进攻换比分差的赌注。", "We probably can't stop him: a bet that our offence outruns his."],
};
const METRIC = [["counterEffect", "克制效果", "Counter effect"], ["execution", "我方执行", "Our execution"], ["proficiency", "教练熟练度", "Coach comfort"]];
const STRENGTH = { interiorDefense: ["内线防守", "Interior D"], perimeterDefense: ["外线防守", "Perimeter D"], rebounding: ["篮板", "Rebounding"], shooting: ["外线投射", "Shooting"], creation: ["持球创造", "Creation"], athleticism: ["运动能力", "Athleticism"], benchDepth: ["替补深度", "Bench"] };

export function matchupPlanHtml({ scout, strategy, cards, selected, lang = "zh", applied = false }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  const pick = (pair) => (lang === "en" ? pair[1] : pair[0]);
  if (!scout || !strategy) return "";
  const nm = (id) => esc(cards.find((c) => c.id === id)?.name || id);
  const plan = strategy.plans.find((p) => p.id === (selected || strategy.recommended)) || strategy.plans[0];
  const threats = scout.threats.map((t) => `<li><b>${esc(t.name)}</b> <small>${esc(t.pos)} · OVR ${t.ovr}</small> <span class="msc-pill">${pick(KIND[t.kind])} · ${pick(LEVEL[t.level])}</span><small class="msc-from">${L("来源", "from")}: ${esc(t.from)}</small></li>`).join("");
  const tabs = strategy.plans.map((p) => `<button class="mti-sys${p.id === plan.id ? " on" : ""}" data-act="scout-plan" data-plan="${p.id}">${pick(NAME[p.id])}${p.id === strategy.recommended ? ` <small>★ ${L("推荐", "pick")}</small>` : ""}</button>`).join("");
  const star = scout.threats[0];
  const cant = plan.id === "outscore" && !strategy.containViable && star
    ? `<p class="msc-warn">${L(`我们可能无法有效限制 ${esc(star.name)}。减少为他投入的防守资源，保留创造和得分，更高效地进攻是合理的选择。`, `We probably can't contain ${esc(star.name)}. Spending less on stopping him and more on efficient offence is a reasonable call.`)}</p>`
    : (!plan.viable ? `<p class="msc-warn">${L("这个方案对这个对手很可能行不通：我方相关属性不足以抵消他的优势。", "This plan is unlikely to work against this opponent: our relevant attributes don't offset his edge.")}</p>` : "");
  const chips = METRIC.map(([k, zh, en]) => `<span class="msc-chip"><small>${L(zh, en)}</small><b>${plan[k]}</b></span>`).join("");
  const t = plan.tradeoffs;
  const gain = t?.gains?.length ? `<p class="mti-gain">＋ ${t.gains.map((g) => `${pick(STRENGTH[g.key])} ${g.from}→${g.to}`).join(L("、", ", "))}</p>` : "";
  const loss = t?.losses?.length ? `<p class="mti-loss">－ ${t.losses.map((g) => `${pick(STRENGTH[g.key])} ${g.from}→${g.to}`).join(L("、", ", "))}</p>` : "";
  const stars = t?.benchedStars?.length ? `<p class="mti-loss">${t.benchedStars.map((s) => L(`${esc(s.name)}（OVR ${s.ovr}）将离开首发。`, `${esc(s.name)} (OVR ${s.ovr}) leaves the five.`)).join(" ")}</p>` : "";
  const rot = plan.rotation;
  const defs = rot.defenders.filter((d) => d.defenderId).map((d) => L(`${esc(d.defenderName)} 盯防 ${esc(d.threatName)}`, `${esc(d.defenderName)} guards ${esc(d.threatName)}`)).join(L("；", "; "));
  const sys = TACTICS[plan.tacticId] ? tacticName(TACTICS[plan.tacticId], lang) : plan.tacticId;
  return `<details class="msc"><summary>${L("对手球探 · 比赛方案", "Opponent scouting · game plans")} <small>${esc(scout.name)}</small></summary>
    <ul class="msc-threats">${threats}</ul>
    <p class="mti-note">${L("依据球员卡属性，不是今晚的真实轮换。", "Read from card attributes, not tonight's real rotation.")}</p>
    <div class="mti-systems" role="tablist">${tabs}</div>
    <div class="msc-plan">
      <p><b>${L("首发", "Starters")}</b>：${plan.ids.map(nm).join("、")} ${plan.changesFive ? "" : `<small>(${L("与当前相同", "same as now")})</small>`}</p>
      <p><b>${L("体系", "System")}</b>：${esc(sys)}${plan.native ? "" : ` <small>(${L("非教练专长", "not the coach's specialty")})</small>`}</p>
      <p>${pick(FOCUS[plan.id])}</p>
      <div class="msc-chips">${chips}</div>
      ${cant}${gain}${loss}${stars}
      <p class="mti-note">${L("代价", "Price")}：${pick(SACRIFICE[plan.id])}</p>
      <p>${defs ? `${L("职责安排", "Assignments")}：${defs}。` : ""}${rot.secondUnitLeaderId ? L(`二阵容由 ${nm(rot.secondUnitLeaderId)} 带队。`, `${nm(rot.secondUnitLeaderId)} leads the second unit.`) : ""}</p>
      <p class="mti-note">${L("遇到对方球星在场/休息时的换人暂时需要手动；应用方案只会设置首发与体系，并只在「亲自指挥」的比赛中生效。", "Subbing when his star enters or rests stays manual for now; applying sets starters and system, used in games you coach yourself.")}</p>
      <div class="msc-actions"><button class="btn primary" data-act="scout-apply">${L("应用此方案", "Apply plan")}</button><button class="btn" data-act="scout-keep">${L("保持现状", "Keep current")}</button></div>
      ${applied ? `<p class="mti-note">${L("已应用。", "Applied.")}</p>` : ""}
    </div></details>`;
}
