/**
 * C5: the coach's level, XP bar and the four perk lines on career HQ. perkModel() / perkCardHtml()
 * are pure (unit-tested); createPerkCard() runs the "spend a point" click through the screen's commit.
 */
import { COACH_PERK_LINES, COACH_PERK_MAX_LEVEL } from "../../career/balance.js";
import { ensureCoachProfile, spendPerkPoint, xpToNextLevel } from "../../career/coachProfile.js";
import { PERK_LINE_INFO, perkEffectText, perkLevel } from "../../career/coachPerks.js";
import { $ } from "./dom.js";
import { esc, tr } from "./format.js";
import { icon } from "./icons.js";

const LINE_ICONS = { tactics: "chart", development: "users", negotiation: "briefcase", media: "chat" };

export function perkModel(root, lang = "zh") {
  const coach = ensureCoachProfile(root);
  const points = Math.max(0, coach.perkPoints || 0);
  const next = xpToNextLevel(coach.level);
  return {
    level: coach.level,
    xp: Math.floor(coach.xp || 0),
    next,
    progress: Math.min(1, (coach.xp || 0) / next),
    perkPoints: points,
    lines: COACH_PERK_LINES.map((id) => {
      const level = perkLevel(coach, id);
      return {
        id,
        label: PERK_LINE_INFO[id].label[lang === "en" ? 1 : 0],
        level,
        max: COACH_PERK_MAX_LEVEL,
        now: perkEffectText(id, level, lang),
        next: level < COACH_PERK_MAX_LEVEL ? perkEffectText(id, level + 1, lang) : "",
        canSpend: points > 0 && level < COACH_PERK_MAX_LEVEL,
      };
    }),
  };
}

function lineHtml(line, lang) {
  const pips = Array.from({ length: line.max }, (_, i) => `<i${i < line.level ? ' class="on"' : ""}></i>`).join("");
  const now = line.now || tr(lang, "尚未投入", "No points yet");
  const next = line.next ? tr(lang, `下一级：${line.next}`, `Next: ${line.next}`) : tr(lang, "已满级", "Maxed");
  const state = line.level >= line.max ? "owned" : line.canSpend ? "ready" : "locked";
  return `<button type="button" class="tt-asset tt-perk" data-perk="${esc(line.id)}" data-state="${state}"${line.canSpend ? "" : " disabled"}>
    <span class="tt-asset-ico">${icon(LINE_ICONS[line.id] || "star", { size: 20 })}</span>
    <span class="tt-asset-main">
      <strong>${esc(line.label)} <span class="tt-perk-pips" role="img" aria-label="${esc(`Lv.${line.level}/${line.max}`)}">${pips}</span></strong>
      <span>${esc(now)}</span>
      <span class="tt-faint">${esc(next)}</span>
    </span>
    ${line.canSpend ? `<span class="tt-asset-act">+1</span>` : ""}
  </button>`;
}

export function perkCardHtml(model, lang = "zh") {
  const pct = Math.round(model.progress * 100);
  const points = model.perkPoints
    ? `<span class="tt-pill tt-pill-gold">${esc(tr(lang, `${model.perkPoints} 点天赋点可分配`, `${model.perkPoints} perk point${model.perkPoints === 1 ? "" : "s"} to spend`))}</span>`
    : "";
  return `<p class="tt-perk-level"><strong>Lv.${model.level}</strong> <span class="tt-faint">${esc(`${model.xp} / ${model.next} XP`)}</span> ${points}</p>
    <span class="tt-fund tt-perk-bar" role="img" aria-label="${esc(`XP ${pct}%`)}"><i style="width:${pct}%"></i></span>
    <p class="tt-faint">${esc(tr(lang, "每场比赛都给教练经验：赢球更多，爆冷再加，季后赛翻倍。每升一级得 1 点天赋点。", "Every game earns coach XP: more for a win, extra for an upset, double in the playoffs. Each level is one perk point."))}</p>
    <div class="tt-assets">${model.lines.map((line) => lineHtml(line, lang)).join("")}</div>`;
}

export function createPerkCard({ lang, commit, currentRootState, onChange = () => {} }) {
  function render(root) {
    const l = lang();
    $("#tt-perks-title").innerHTML = `${icon("star", { size: 18 })}<h3>${esc(tr(l, "教练天赋", "Coach perks"))}</h3>`;
    $("#tt-perks-body").innerHTML = perkCardHtml(perkModel(root, l), l);
  }

  function wire() {
    $("#tt-perks-body")?.addEventListener("click", (event) => {
      const line = event.target.closest("[data-perk]")?.dataset.perk;
      if (!line) return;
      try {
        const root = currentRootState();
        commit({ ...root, coach: spendPerkPoint(ensureCoachProfile(root), line) }, tr(lang(), "无法分配天赋点", "Couldn't spend the perk point"), { full: false });
        render(currentRootState());
        onChange();
      } catch (error) {
        alert(error?.message || tr(lang(), "无法分配天赋点", "Couldn't spend the perk point"));
      }
    });
  }

  return { render, wire };
}
