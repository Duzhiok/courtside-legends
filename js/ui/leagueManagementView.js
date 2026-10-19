import { overall } from "../data/players.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sourceLabel(source) {
  return source === "historical-debut"
    ? "历史首秀班（非精确选秀史）"
    : "架空新秀";
}

function teamName(career, teamNames, teamId) {
  return teamNames?.[teamId] || career?.season?.teams?.[teamId]?.name || teamId || "—";
}

function actionTarget(event) {
  return event?.target?.closest?.("[data-action]") || null;
}

function invoke(handler, button, ...args) {
  if (typeof handler !== "function" || button?.disabled) return undefined;
  button.disabled = true;
  let result;
  try {
    result = handler(...args);
  } catch (error) {
    button.disabled = false;
    throw error;
  }
  if (result && typeof result.finally === "function") {
    return result.finally(() => {
      button.disabled = false;
    });
  }
  button.disabled = false;
  return result;
}

function selectionRow(selection, career, teamNames) {
  const contract = selection?.contract || {};
  const years = contract.yearsRemaining ?? contract.years ?? 4;
  const contractLength = Number(years) === 4 ? "四年" : `${escapeHtml(years)}年`;
  const waived = selection?.waived?.name
    ? ` · 裁掉 ${escapeHtml(selection.waived.name)}`
    : "";
  return `<div class="sm-row draft-board-selection">
    <div>
      <strong>#${escapeHtml(selection?.pickNumber)} ${escapeHtml(teamName(career, teamNames, selection?.teamId))}</strong>
      <div>${escapeHtml(selection?.name || selection?.bref || "—")} · ${escapeHtml(sourceLabel(selection?.source))}</div>
      <div class="tiny">${contractLength}合同 · ¤${escapeHtml(contract.salary ?? "—")}${waived}</div>
    </div>
  </div>`;
}

export function renderDraftBoard(container, { career, teamNames = {} } = {}, handlers = {}) {
  if (!container) return container;
  container.onclick = null;
  container.onchange = null;

  if (!career?.management) {
    container.innerHTML = "<p class=\"tiny\">选秀属于长期生涯模式，请先创建或载入长期生涯。</p>";
    return container;
  }

  const storedDraft = career.management.draft;
  const draft =
    storedDraft?.year === career.season?.year || career.phase === "draft"
      ? storedDraft
      : null;
  const seasonDone = career.season?.phase === "done";
  if (!draft) {
    const nextYear = Number(career.season?.year || 0);
    container.innerHTML = seasonDone
      ? `<div class="draft-board-empty"><p>赛季已经结束，可以进入休赛期选秀。</p>
          <button type="button" class="btn primary" data-action="prepare-draft">进入休赛期选秀</button></div>`
      : `<div class="draft-board-empty"><p>下一届选秀：${escapeHtml(nextYear)} 年。</p>
          <p class="tiny">完成总决赛后即可查看新秀并亲自做出选择。</p></div>`;
  } else {
    const selections = (draft.selections || [])
      .map((selection) => selectionRow(selection, career, teamNames))
      .join("");
    const userPick = (draft.selections || []).find(
      (selection) => selection.teamId === career.season?.userTeamId,
    );
    if (draft.status === "complete") {
      container.innerHTML = `<section class="draft-board-panel">
        <header class="draft-board-head"><div><h4>${escapeHtml(draft.year)} 年选秀完成</h4>
        <p class="tiny">你的选择：${escapeHtml(userPick?.name || "—")}</p></div></header>
        <div class="draft-board-selections">${selections || "<p class=\"tiny\">暂无选择记录</p>"}</div>
        <div class="btn-row"><button type="button" class="btn primary" data-action="complete-offseason">开始新赛季</button></div>
      </section>`;
    } else {
      const currentTeamId = draft.order?.[draft.currentPick];
      const userTurn = currentTeamId === career.season?.userTeamId;
      const prospects = [...(draft.prospects || [])].sort(
        (left, right) =>
          Number(right.scoutingRange?.max || 0) - Number(left.scoutingRange?.max || 0) ||
          Number(right.scoutingRange?.min || 0) - Number(left.scoutingRange?.min || 0) ||
          String(left.name || "").localeCompare(String(right.name || "")),
      );
      const cards = userTurn
        ? prospects
            .map((prospect) => `<button type="button" class="draft-board-prospect" data-action="pick" data-prospect-id="${escapeHtml(prospect.prospectId)}">
              <strong>${escapeHtml(prospect.name)}</strong>
              <span>${escapeHtml(prospect.pos || prospect.player?.pos || "—")} · ${escapeHtml(sourceLabel(prospect.source))}</span>
              <span>球探区间 ${escapeHtml(prospect.scoutingRange?.min ?? "—")}–${escapeHtml(prospect.scoutingRange?.max ?? "—")}</span>
              <span>年龄 ${escapeHtml(prospect.player?.age ?? "—")} · 当前卡年 ${escapeHtml(prospect.player?.season ?? "—")}</span>
            </button>`)
            .join("")
        : `<p class="draft-board-recovery">电脑球队仍在选秀计时中，暂时不能代替其选人。请重新载入存档以恢复自动推进。</p>`;
      container.innerHTML = `<section class="draft-board-panel">
        <header class="draft-board-head"><div><h4>${escapeHtml(draft.year)} 年选秀</h4>
        <p>当前第 ${escapeHtml(Number(draft.currentPick) + 1)} 顺位 · ${escapeHtml(teamName(career, teamNames, currentTeamId))} 选择</p></div></header>
        <div class="draft-board-prospects">${cards}</div>
        <h4>已完成选择</h4>
        <div class="draft-board-selections">${selections || "<p class=\"tiny\">尚无选择</p>"}</div>
      </section>`;
    }
  }

  container.onclick = (event) => {
    const button = actionTarget(event);
    if (!button) return undefined;
    if (button.dataset.action === "prepare-draft") {
      return invoke(handlers.prepareDraft, button);
    }
    if (button.dataset.action === "pick") {
      return invoke(handlers.pickProspect, button, button.dataset.prospectId);
    }
    if (button.dataset.action === "complete-offseason") {
      return invoke(handlers.completeOffseason, button);
    }
    return undefined;
  };
  return container;
}

const FOCUS_OPTIONS = [
  ["balanced", "均衡"],
  ["shooting", "投射"],
  ["playmaking", "组织"],
  ["defense", "防守"],
  ["conditioning", "体能"],
];
const ROLE_OPTIONS = [
  ["alpha", "核心"],
  ["starter", "首发"],
  ["sixth", "第六人"],
  ["role", "角色球员"],
  ["bench", "替补"],
];
const LOAD_OPTIONS = [
  ["low", "低"],
  ["normal", "正常"],
  ["high", "高"],
];

function options(entries, selected) {
  return entries
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function developmentEffects(player) {
  const effect = player?._developmentEffects;
  if (!effect || typeof effect !== "object") return "";
  const reasons = Array.isArray(effect.reasons) ? effect.reasons.join("、") : "";
  return `<div class="development-plan-effects tiny">上次休赛期：成长 ${escapeHtml(effect.totalPoints ?? 0)} 点 ·
    士气 ${Number(effect.moraleDelta) >= 0 ? "+" : ""}${escapeHtml(effect.moraleDelta ?? 0)} ·
    负荷/伤病风险 ${Number(effect.injuryRiskDelta) >= 0 ? "+" : ""}${escapeHtml(effect.injuryRiskDelta ?? 0)}
    ${reasons ? ` · ${escapeHtml(reasons)}` : ""}</div>`;
}

export function renderDevelopmentPlans(container, { career } = {}, handlers = {}) {
  if (!container) return container;
  container.onclick = null;
  container.onchange = null;
  if (!career?.management) {
    container.innerHTML = "<p class=\"tiny\">发展方案属于长期生涯模式，请先创建或载入长期生涯。</p>";
    return container;
  }
  const roster = career.season?.teams?.[career.season?.userTeamId]?.players || [];
  const manual = career.manualOverrides?.training || {};
  const recommendations = career.recommendations?.training || {};
  const executable = career.management?.developmentPlans || {};
  const rows = [...roster]
    .sort((left, right) => overall(right) - overall(left) || String(left.name || "").localeCompare(String(right.name || "")))
    .map((player) => {
      const ownsManual = Object.prototype.hasOwnProperty.call(manual, player.bref);
      const plan = executable[player.bref] || recommendations[player.bref] || {
        focus: "balanced",
        role: "role",
        mentorBref: null,
        load: "normal",
      };
      const marker = ownsManual
        ? "手动"
        : recommendations[player.bref]
          ? "自动建议"
          : "未设置";
      const mentors = [
        ["", "无导师"],
        ...roster
          .filter((entry) => entry.bref !== player.bref)
          .map((entry) => [entry.bref, entry.name || entry.bref]),
      ];
      return `<div class="development-plan-row" data-plan-row="${escapeHtml(player.bref)}">
        <div class="development-plan-player">
          <strong>${escapeHtml(player.pos || player.playPos || "—")} ${escapeHtml(player.name || player.bref)}</strong>
          <span class="development-plan-marker">${escapeHtml(marker)}</span>
          <div class="tiny">OVR ${escapeHtml(overall(player))} · 年龄 ${escapeHtml(player.age ?? "—")} ·
            当前角色 ${escapeHtml(player.roleExpectation || "—")} / ${escapeHtml(player.targetMinutes ?? "—")} 分钟</div>
          ${developmentEffects(player)}
        </div>
        <label>重点<select class="development-plan-focus">${options(FOCUS_OPTIONS, plan.focus)}</select></label>
        <label>角色<select class="development-plan-role">${options(ROLE_OPTIONS, plan.role)}</select></label>
        <label>导师<select class="development-plan-mentor">${options(mentors, plan.mentorBref || "")}</select></label>
        <label>负荷<select class="development-plan-load">${options(LOAD_OPTIONS, plan.load)}</select></label>
        <button type="button" class="btn small primary" data-action="save-plan" data-bref="${escapeHtml(player.bref)}">保存方案</button>
      </div>`;
    })
    .join("");

  container.innerHTML = `<section class="development-plan-panel">
    <header class="development-plan-head"><div><h4>球员发展方案</h4>
      <p class="tiny">手动方案拥有最高优先级，生成建议不会覆盖它。</p></div>
      <button type="button" class="btn small" data-action="recommend-plans">生成自动建议</button>
    </header>
    <div class="development-plan-list">${rows || "<p class=\"tiny\">当前阵容没有球员。</p>"}</div>
  </section>`;

  container.onclick = (event) => {
    const button = actionTarget(event);
    if (!button) return undefined;
    if (button.dataset.action === "recommend-plans") {
      return invoke(handlers.recommendPlans, button);
    }
    if (button.dataset.action !== "save-plan") return undefined;
    const row = event.target.closest?.("[data-plan-row]");
    if (!row) return undefined;
    const plan = {
      focus: row.querySelector(".development-plan-focus")?.value,
      role: row.querySelector(".development-plan-role")?.value,
      mentorBref: row.querySelector(".development-plan-mentor")?.value || null,
      load: row.querySelector(".development-plan-load")?.value,
    };
    return invoke(handlers.savePlan, button, button.dataset.bref, plan);
  };
  return container;
}
