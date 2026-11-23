// The season hub's rotation board ("排兵布阵"): the page's HTML plus the numbers it shows (lineup fit, chemistry, minute clashes).
// Pure -- it reads the team and writes nothing. app.js (renderSeasonRotation) keeps the state it must tidy up before drawing
// (roles, orders, the first rotation plan) and every handler that edits the team.
//
// Moved out of app.js unchanged (B61): the markup is byte-for-byte what it inlined. `learnedOf` stands in for app.js's
// epiphanyLearned closure (it reads the live career), and `lang` for the getLang() it read.
import { esc } from "../core/html.js";
import { coachTactics, TACTICS } from "../data/coaches.js";
import { POS_SLOTS } from "../data/franchises.js";
import { photoImg } from "../data/photo.js";
import { PLAYER_ROLES, inferPlayerRole, staminaMinuteCap, staminaMinuteHint } from "../data/playerMinutes.js";
import { overall } from "../data/players.js";
import { normalizePos } from "../data/positions.js";
import { skillChipsHtml } from "../data/skills.js";
import { lineupFit, teamChemistry } from "../engine/chemistry.js";
import { liveStarterIds, recommendPlayPos, roleName } from "../engine/gameplan.js";
import { TL } from "../i18n.js";
import { benchSectionHtml, budgetBarHtml, fitLabel, rotationRowHtml, starterMinuteConflicts, startersSectionHtml } from "./rotationBoard.js";

/**
 * @param {object} you  the user's team (roles / orders / rotation already filled in)
 * @param {{ lang: string, learnedOf: (p: object) => string[] }} io
 * @returns {string}
 */
export function rotationBoardHtml(you, { lang, learnedOf }) {
  const starters = new Set(liveStarterIds(you));
  const tactics = coachTactics(you.coach || { specialTactics: ["balanced"] });
  const focusId = you.gameplan?.offenseFocusId || you.rotation?.offenseFocusId || "";
  const tacticId = you.coach?.specialTactics?.[0] || tactics[0]?.id || "balanced";
  const sorted = [...you.players].sort(
    (a, b) => (b.targetMinutes || 0) - (a.targetMinutes || 0) || overall(b) - overall(a)
  );
  const chem = teamChemistry(sorted.slice(0, 8));
  const fit = lineupFit(
    sorted.filter((p) => starters.has(p.id)).slice(0, 5),
    you.coach,
    TACTICS[tacticId]
  );

  const clashes = new Map(starterMinuteConflicts(sorted, starters).map((c) => [c.id, c]));
  const rowHtml = (p) => {
    const role = p.roleExpectation || inferPlayerRole(p);
    const roleOpts = Object.values(PLAYER_ROLES)
      .map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${roleName(r, lang)}</option>`)
      .join("");
    const recPos = recommendPlayPos(p);
    const posOpts = POS_SLOTS.map(
      (s) => `<option value="${s.id}" ${normalizePos(p.playPos || p.pos) === s.id ? "selected" : ""}>${s.id}${s.id === recPos ? TL(lang, "（推荐）", " (rec.)") : ""}</option>`
    ).join("");
    const cap = staminaMinuteCap(p);
    return rotationRowHtml(p, {
      lang,
      cap,
      posOpts,
      roleOpts,
      starter: starters.has(p.id),
      over: (p.targetMinutes || 0) > cap,
      cardPos: normalizePos(p.playPos || p.pos),
      ovr: overall(p),
      hint: staminaMinuteHint(p, lang),
      photo: photoImg(p),
      skillChips: p.skills?.length ? skillChipsHtml(p, lang) : "",
      learned: learnedOf(p),
      clash: clashes.get(p.id),
    });
  };
  const startersNow = sorted.filter((p) => starters.has(p.id));
  const bench = sorted.filter((p) => !starters.has(p.id));

  return `
    <div class="sm-cap-card rot-card">
      <div class="rot-card-head">
        <h4>${TL(lang, "排兵布阵", "Rotation board")}<small>${TL(lang, "默认轮换", "default rotation")}</small></h4>
        <div class="rot-stats">
          <span class="rot-stat" title="${TL(lang, "要选满 5 个首发才有意义", "Only meaningful with a full five")}"><em>${TL(lang, "首发适配", "Lineup fit")}</em><strong>${fitLabel(startersNow.length, fit)}</strong></span>
          <span class="rot-stat"><em>${TL(lang, "化学反应", "Chemistry")}</em><strong>${chem ?? "—"}</strong></span>
        </div>
      </div>
      ${budgetBarHtml(sorted, [...starters], lang)}
      <p class="tiny">${TL(lang, "设定首发、位置、角色、目标分钟与持球人；会在每场「亲自指挥」时自动套用。一场共 240 分钟；分钟条上的黑线是这个人能稳打的上限，体能差的人不宜长期 35+ 分钟。", "Set starters, positions, roles, target minutes and the ball handler; they apply whenever you coach a game yourself. A game has 240 player-minutes; the dark tick on a minutes bar is how many he can carry without tiring, and tired players shouldn't play 35+ for long.")}</p>
      <div class="rot-toolbar">
        <label class="rot-field"><span>${TL(lang, "默认战术", "Default tactic")}</span>
          <select id="rot-tactic">${tactics
            .map((t) => `<option value="${t.id}" ${t.id === tacticId ? "selected" : ""}>${esc(t.name)}</option>`)
            .join("")}</select>
        </label>
        <label class="rot-field"><span>${TL(lang, "默认持球人", "Ball handler")}</span>
          <select id="rot-focus">
            <option value="">${TL(lang, "（不指定）", "(none)")}</option>
            ${sorted
              .map((p) => `<option value="${p.id}" ${p.id === focusId ? "selected" : ""}>${esc(p.name)}</option>`)
              .join("")}
          </select>
        </label>
        <span class="rot-actions">
          <button type="button" class="btn small" id="btn-rot-suggest">${TL(lang, "按体能建议分钟", "Suggest minutes")}</button>
          <button type="button" class="btn small" id="btn-rot-top5">${TL(lang, "OVR 前五当首发", "Top 5 by OVR")}</button>
          <button type="button" class="btn primary small" id="btn-rot-save">${TL(lang, "保存默认轮换", "Save rotation")}</button>
        </span>
      </div>
    </div>
    ${startersSectionHtml(startersNow.map(rowHtml).join(""), startersNow.length, lang, { clashes: clashes.size })}
    ${benchSectionHtml(bench.map(rowHtml).join(""), bench.length, lang, { noStarters: !startersNow.length })}
  `;
}
