/**
 * Coach selection + Team Intelligence panel for the My Team Clubhouse (v3). Pure string renderer: no DOM, no storage.
 * Honesty: items the sim really reads are tagged "sim", pure role reads are tagged "advice".
 */
import { coachName, coachSpecialty, coachStyle, tacticName, tacticDesc, TACTICS } from "../data/coaches.js";
import { roleName, ROLES } from "../myteam/playerRoleFit.js";
import { esc } from "./myTeamViewKit.js";

const bar = (v) => (v == null ? `<span class="mti-na">—</span>` : `<span class="mti-bar" role="img" aria-label="${v}"><i style="width:${Math.max(4, v)}%"></i><b>${v}</b></span>`);
const tag = (simBacked, L) => `<em class="mti-tag ${simBacked ? "sim" : "adv"}">${simBacked ? L("实战生效", "Gameplay active") : L("仅分析", "Analysis only")}</em>`;

const STRENGTH_LABEL = {
  interiorDefense: ["内线防守", "Interior D"], perimeterDefense: ["外线防守", "Perimeter D"], rebounding: ["篮板", "Rebounding"],
  shooting: ["外线投射", "Shooting"], creation: ["持球创造", "Creation"], athleticism: ["运动能力与体力", "Athleticism"], benchDepth: ["替补深度", "Bench depth"],
};
const PHILOSOPHY = { offense: ["进攻导向", "Offence-first"], defense: ["防守导向", "Defence-first"], balanced: ["攻守均衡", "Balanced"] };

export function conflictText(c, L) {
  const d = c.data || {};
  switch (c.code) {
    case "spacing": return L(`外线射手只有 ${d.shooters} 人（该体系至少需要 ${d.need}），对手容易收缩禁区。`, `Only ${d.shooters} real shooters (this system wants ${d.need}); defences can collapse the paint.`);
    case "ball_crowd": return L(`${d.creators} 名持球核心抢同一个球，球权会拥挤。`, `${d.creators} ball-dominant creators share one ball.`);
    case "bigs_in_small": return L(`${d.bigs} 名内线站在小球/五外体系里，空间被压缩。`, `${d.bigs} bigs in a small-ball / five-out system cramp the floor.`);
    case "no_rim": return L("这套防守体系需要护框者，首发里没有合格的内线防守。", "This defensive system needs a rim protector; none in the five.");
    case "role_mismatch": {
      const why = d.kind === "position"
        ? L("这个职责与他的位置不符", "this job doesn't fit his position")
        : d.kind === "gap" ? L("离他最擅长的职责差距很大", "far from the job he does best") : L("这个职责对他来说偏弱", "a weak fit for him");
      return L(`${esc(d.name)} 被安排为「${roleName(d.roleId, "zh")}」：${why}（他的天然价值是「${roleName(d.natural, "zh")}」，卡面适配 ${d.score}）。这是职责问题，球员本身没变弱。`, `${esc(d.name)} is asked to be ${roleName(d.roleId, "en")}: ${why} (his natural value is ${roleName(d.natural, "en")}; card fit ${d.score}). A job problem, not a weaker player.`);
    }
    case "off_system": return L("这是教练的非专长体系：可以打，但执行不如专长体系顺畅。", "Not this coach's specialty: playable, but executed less smoothly.");
    default: return "";
  }
}
const synergyText = (s, L) => ({
  pnr: L(`${s.names.join(" + ")}：挡拆发动机配顺下大个。`, `${s.names.join(" + ")}: PnR engine with a rolling big.`),
  spaced_creation: L(`${s.names[0]} 持球时弱侧有两名以上射手接应。`, `${s.names[0]} has two or more shooters on the weak side.`),
  two_level_defense: L(`${s.names.join(" + ")}：外线盯人与护框形成两层防守。`, `${s.names.join(" + ")}: stopper plus rim protector make two levels of defence.`),
})[s.code] || "";

function coachSection({ coach, owned, lang }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  const lean = PHILOSOPHY[coach.profile.philosophy] || PHILOSOPHY.balanced;
  const picks = owned.length > 1
    ? `<div class="mti-coaches" role="group" aria-label="${L("我的教练", "My coaches")}">${owned.map((c) => `<button class="btn tiny ${c.id === coach.card.id ? "primary" : ""}" data-act="intel-coach" data-coach="${esc(c.id)}">${esc(coachName(c, lang))}</button>`).join("")}</div>`
    : `<p class="mti-note">${L("目前只有这一位教练；抽到更多教练卡后可以在这里更换。", "This is your only coach so far; more coach cards from draws will show up here.")}</p>`;
  return `<div class="mti-coach">
    <p class="mtc-kicker">${L("MY TEAM · 我的教练席", "MY TEAM · COACHING STAFF")}</p>
    <h4>${esc(coachName(coach.card, lang))} <small>${esc(coachStyle(coach.card, lang))}</small></h4>
    <p class="mti-note">${esc(coachSpecialty(coach.card, lang))} · ${esc(L(lean[0], lean[1]))}</p>
    ${picks}
  </div>`;
}

function systemSection({ systems, tacticId, activeTacticId, lang }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  return `<div class="mti-systems" role="group" aria-label="${L("战术体系", "Tactical system")}">
    ${systems.map((s) => `<button class="mti-sys ${s.id === tacticId ? "on" : ""} ${s.native ? "native" : ""}" data-act="intel-tactic" data-tactic="${esc(s.id)}" aria-pressed="${s.id === tacticId}">${esc(tacticName(s.tactic, lang))}${s.native ? `<i>${L("专长", "specialty")}</i>` : ""}${s.id === activeTacticId ? `<i class="cur">${L("当前", "active")}</i>` : ""}</button>`).join("")}
  </div>
  <p class="mti-note">${esc(tacticDesc(TACTICS[tacticId], lang))}</p>`;
}

function rolesSection({ starters, analysis, lang }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  return `<table class="mti-roles"><thead><tr><th>${L("首发", "Starter")}</th><th>${L("体系中的职责", "Role in this system")}</th><th>${L("适配", "Fit")}</th></tr></thead><tbody>
    ${starters.map((p) => {
      const f = analysis.playerRoleFits[p.id];
      if (!f) return "";
      const opts = Object.keys(ROLES).map((id) => `<option value="${id}" ${id === f.roleId ? "selected" : ""}>${esc(roleName(id, lang))}</option>`).join("");
      return `<tr class="${f.mismatch ? "warn" : ""}"><td>${esc(p.name)}<small>${esc(L("天然：", "Natural: ") + roleName(f.natural.id, lang))}</small></td>
        <td><select data-role-for="${esc(p.id)}" aria-label="${esc(p.name)}">${opts}</select>${f.overridden ? `<small>${L("手动指定", "manual")}</small>` : ""}</td><td>${bar(f.fit)}</td></tr>`;
    }).join("")}
  </tbody></table>`;
}

function strengthsSection({ analysis, lang }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  const rows = Object.entries(analysis.intrinsicStrengths).map(([k, v]) => `<li><span>${esc(L(...STRENGTH_LABEL[k]))}</span>${bar(v.score)}</li>`).join("");
  return `<ul class="mti-strengths">${rows}</ul><p class="mti-note">${L("以上是球员卡本身的能力，换教练不会改变。", "These come from the cards themselves; a different coach does not change them.")}</p>`;
}

const metric = (k, lang) => (lang === "en" ? STRENGTH_LABEL[k][1] : STRENGTH_LABEL[k][0]);

function recSection({ rec, cards, lang, analysis }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  if (!rec) return `<p class="mti-note">${L("名单不足 5 人，暂无推荐。", "Fewer than five players on the roster; no recommendation yet.")}</p>`;
  const card = (id) => cards.find((c) => c.id === id);
  const name = (id) => esc(card(id)?.name || id);
  const score = rec.current ? `<small>${L("综合评分", "score")} ${rec.current.U} → ${rec.best.U}</small>` : "";
  if (rec.verdict === "keep") return `<div class="mti-rec"><p>${L("当前首发已经是这位教练 + 这套体系下的最佳选择，不需要换人。", "Your current five is already the best for this coach and system; no change needed.")}</p></div>`;
  if (rec.verdict === "reassign") return `<div class="mti-rec"><p>${L("先调整职责，不必换人：让系统给每名首发分配最合适的工作，就能化解现在的错配。", "Fix the roles before swapping anyone: letting the system give each starter the right job resolves the mismatch.")}</p>
    ${Object.values(analysis.playerRoleFits).some((r) => r.overridden) ? `<button class="btn" data-act="intel-reset-roles">${L("恢复自动职责", "Restore automatic roles")}</button>` : ""}</div>`;
  const t = rec.tradeoffs || { gains: [], losses: [], benchedStars: [] };
  const list = (xs) => xs.map((x) => `${esc(metric(x.key, lang))} ${x.from}→${x.to}`).join(L("、", ", "));
  const stars = t.benchedStars.map((s) => L(`${esc(s.name)}（OVR ${s.ovr}）被换下，他原本提供的「${s.role ? roleName(s.role, "zh") : "核心"}」价值会流失。`, `${esc(s.name)} (OVR ${s.ovr}) leaves the five; his ${s.role ? roleName(s.role, "en") : "core"} value is lost.`)).join(" ");
  return `<div class="mti-rec">
    <p>${L(`建议：换上 ${rec.swaps.in.map(name).join("、")}，换下 ${rec.swaps.out.map(name).join("、")}。`, `Suggestion: bring in ${rec.swaps.in.map(name).join(", ")}, take out ${rec.swaps.out.map(name).join(", ")}.`)} ${score}</p>
    ${t.gains.length ? `<p class="mti-gain">＋ ${L("换来：", "Gains: ")}${list(t.gains)}</p>` : ""}
    ${t.losses.length ? `<p class="mti-loss">－ ${L("代价：", "Costs: ")}${list(t.losses)}</p>` : ""}
    ${stars ? `<p class="mti-loss">${stars}</p>` : ""}
    <p class="mti-note">${L("评分权重（能力 40% / 体系适配 30% / 协同 20% / 冲突扣分 10%）是分析用的起点，并非胜率预测；如果收益不明确，保持现状也完全合理。", "Weights (ability 40 / fit 30 / synergy 20 / conflicts 10) are an analysis starting point, not a win predictor; keeping your five is perfectly reasonable when the gain is unclear.")}</p>
    <button class="btn primary" data-act="intel-apply">${L("应用推荐首发（会保存阵容）", "Apply recommended starters (saves lineup)")}</button>
  </div>`;
}

/**
 * @param {{lang:string, coach:{card:object,profile:object}, owned:object[], systems:object[], tacticId:string, activeTacticId:string,
 *          starters:object[], cards:object[], analysis:object, rec:object|null, notice?:string}} p
 */
export function teamIntelligenceHtml(p) {
  const { lang = "zh", analysis, notice = "" } = p;
  const L = (zh, en) => (lang === "en" ? en : zh);
  const conflicts = analysis.conflicts.map((c) => `<li class="${c.severity}">${tag(c.simBacked, L)}${conflictText(c, L)}</li>`).join("");
  const syn = analysis.tacticalSynergies.map((s) => `<li>${tag(false, L)}${esc(synergyText(s, L))}</li>`).join("");
  return `<section class="mtc-card mti" aria-label="Team Intelligence">
    ${coachSection(p)}
    <h3>${L("战术体系 · 同一首发，不同教练、不同结论", "Tactical system · same five, different coach, different verdict")}</h3>
    ${systemSection(p)}
    <div class="mti-score"><div><span>${L("教练体系适配（GameSim 实际读取）", "Coach-system fit (read by GameSim)")}</span>${bar(analysis.coachSystemFit.score)}</div>
      <div><span>${L("体系执行度（分析建议）", "Execution readiness (advice)")}</span>${bar(analysis.executionReadiness)}</div></div>
    ${rolesSection(p)}
    <h4>${L("冲突与风险", "Conflicts & risks")}</h4>
    <ul class="mti-list">${conflicts || `<li>${L("没有明显冲突。", "No obvious conflicts.")}</li>`}</ul>
    ${syn ? `<h4>${L("战术协同", "Synergies")}</h4><ul class="mti-list good">${syn}</ul>` : ""}
    <h4>${L("球队基础能力", "Team strengths")}</h4>
    ${strengthsSection(p)}
    <h4>${L("在这套体系下的最佳首发", "Best starting five for this system")}</h4>
    ${recSection(p)}
    ${notice ? `<p class="mtc-notice" role="status">${esc(notice)}</p>` : ""}
    <p class="mti-note">${L("预览不会改动已保存的阵容；只有点「应用」或「设为当前战术」才会保存。", "Previews never touch your saved lineup; only Apply / Set as active saves.")}</p>
    <button class="btn tiny" data-act="intel-set-tactic">${L("设为当前战术", "Set as active tactic")}</button>
  </section>`;
}
