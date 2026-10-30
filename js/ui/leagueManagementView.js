import { overall } from "../data/players.js";
import {
  buildCareerTimeline,
  filterCareerTimeline,
} from "../modes/careerTimeline.js";

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
  queueMicrotask(() => {
    button.disabled = false;
  });
  return result;
}

function selectionRow(selection, career, teamNames) {
  if (selection?.forfeited) {
    return `<div class="sm-row draft-board-selection">
    <div>
      <strong>#${escapeHtml(selection?.pickNumber)} ${escapeHtml(teamName(career, teamNames, selection?.teamId))}</strong>
      <div>放弃此签 · 未选人，不占名单</div>
    </div>
  </div>`;
  }
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
    const userPicks = (draft.selections || []).filter(
      (selection) => selection.teamId === career.season?.userTeamId,
    );
    if (draft.status === "complete") {
      container.innerHTML = `<section class="draft-board-panel">
        <header class="draft-board-head"><div><h4>${escapeHtml(draft.year)} 年选秀完成</h4>
        <p class="tiny">你的选择：${escapeHtml(userPicks.map((s) => (s.forfeited ? "放弃此签" : s.name)).join("、") || "—")}</p></div></header>
        <div class="draft-board-selections">${selections || "<p class=\"tiny\">暂无选择记录</p>"}</div>
        <div class="btn-row"><button type="button" class="btn primary" data-action="complete-offseason">开始新赛季</button></div>
      </section>`;
    } else {
      const currentTeamId = draft.order?.[draft.currentPick];
      const userTurn = currentTeamId === career.season?.userTeamId;
      const userRoster =
        career.season?.teams?.[career.season?.userTeamId]?.players || [];
      const waiverControl =
        userTurn && userRoster.length >= 15
          ? `<label class="draft-waiver-control">为新秀腾位置
              <select class="draft-waiver-select">
                <option value="" disabled selected>选择要裁掉的球员</option>${userRoster
                .map(
                  (player) =>
                    `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name || player.bref || player.id)}</option>`,
                )
                .join("")}</select>
              <span class="draft-waiver-error" hidden></span>
            </label>`
          : "";
      const waiverRequired = userTurn && userRoster.length >= 15;
      const prospects = [...(draft.prospects || [])].sort(
        (left, right) =>
          Number(right.scoutingRange?.max || 0) - Number(left.scoutingRange?.max || 0) ||
          Number(right.scoutingRange?.min || 0) - Number(left.scoutingRange?.min || 0) ||
          String(left.name || "").localeCompare(String(right.name || "")),
      );
      const cards = userTurn
        ? prospects
            .map((prospect) => `<button type="button" class="draft-board-prospect" data-action="pick" data-prospect-id="${escapeHtml(prospect.prospectId)}"${waiverRequired ? " disabled" : ""}>
              <strong>${escapeHtml(prospect.name)}</strong>
              <span>${escapeHtml(prospect.pos || prospect.player?.pos || "—")} · ${escapeHtml(sourceLabel(prospect.source))}</span>
              <span>球探区间 ${escapeHtml(prospect.scoutingRange?.min ?? "—")}–${escapeHtml(prospect.scoutingRange?.max ?? "—")}</span>
              <span>年龄 ${escapeHtml(prospect.player?.age ?? "—")} · 当前卡年 ${escapeHtml(prospect.player?.season ?? "—")}</span>
            </button>`)
            .join("")
        : `<p class="draft-board-recovery">电脑球队仍在选秀计时中，暂时不能代替其选人。请重新载入存档以恢复自动推进。</p>`;
      const userSlots = (draft.order || []).filter((id) => id === career.season?.userTeamId).length;
      const userSelections = (draft.selections || []).filter((s) => s.teamId === career.season?.userTeamId);
      const userPicked = userSelections.filter((s) => !s.forfeited).length;
      const userForfeited = userSelections.filter((s) => s.forfeited).length;
      const slotsLine =
        userSlots > 1 ? `<p class="tiny">我方本届签位共 ${userSlots} 个，已选 ${userPicked} 个${userForfeited ? `，放弃 ${userForfeited} 个` : ""}</p>` : "";
      const forfeitControl = userTurn
        ? `<div class="btn-row"><button type="button" class="btn small ghost" data-action="forfeit">放弃此签（不选人，不占名单）</button></div>`
        : "";
      container.innerHTML = `<section class="draft-board-panel">
        <header class="draft-board-head"><div><h4>${escapeHtml(draft.year)} 年选秀</h4>
        <p>${draft.round > 1 ? `第 ${escapeHtml(draft.round)} 轮 · ` : ""}当前第 ${escapeHtml(Number(draft.currentPick) + 1)} 顺位 · ${escapeHtml(teamName(career, teamNames, currentTeamId))} 选择</p>${slotsLine}</div></header>
        ${waiverControl}
        ${forfeitControl}
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
      const waivePlayerId =
        container.querySelector?.(".draft-waiver-select")?.value || null;
      const waiverError = container.querySelector?.(".draft-waiver-error");
      if (container.querySelector?.(".draft-waiver-select") && !waivePlayerId) {
        if (waiverError) {
          waiverError.textContent = "请先选择要裁掉的球员。";
          waiverError.hidden = false;
        }
        return undefined;
      }
      return invoke(
        handlers.pickProspect,
        button,
        button.dataset.prospectId,
        waivePlayerId ? { waivePlayerId } : {},
      );
    }
    if (button.dataset.action === "forfeit") {
      return invoke(handlers.forfeitPick, button);
    }
    if (button.dataset.action === "complete-offseason") {
      return invoke(handlers.completeOffseason, button);
    }
    return undefined;
  };
  container.onchange = (event) => {
    if (!event?.target?.matches?.(".draft-waiver-select")
      && event?.target !== container.querySelector?.(".draft-waiver-select")) return;
    const selected = Boolean(container.querySelector?.(".draft-waiver-select")?.value);
    container.querySelectorAll?.('[data-action="pick"]').forEach((button) => {
      button.disabled = !selected;
    });
    const waiverError = container.querySelector?.(".draft-waiver-error");
    if (waiverError) {
      waiverError.textContent = selected ? "" : "请先选择要裁掉的球员。";
      waiverError.hidden = selected;
    }
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
const FOCUS_VALUES = new Set(FOCUS_OPTIONS.map(([value]) => value));
const ROLE_VALUES = new Set(ROLE_OPTIONS.map(([value]) => value));
const LOAD_VALUES = new Set(LOAD_OPTIONS.map(([value]) => value));

function isDisplayPlan(value, source = null) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      FOCUS_VALUES.has(value.focus) &&
      ROLE_VALUES.has(value.role) &&
      LOAD_VALUES.has(value.load) &&
      (value.mentorBref === null || typeof value.mentorBref === "string") &&
      (!source || value.source === source),
  );
}

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
      const validManual = isDisplayPlan(manual[player.bref], "manual");
      const executablePlan = isDisplayPlan(executable[player.bref])
        ? executable[player.bref]
        : null;
      const recommendedPlan = isDisplayPlan(recommendations[player.bref])
        ? recommendations[player.bref]
        : null;
      const plan = ownsManual && !validManual
        ? {
            focus: "balanced",
            role: "role",
            mentorBref: null,
            load: "normal",
          }
        : executablePlan || recommendedPlan || {
        focus: "balanced",
        role: "role",
        mentorBref: null,
        load: "normal",
      };
      const marker = ownsManual
        ? validManual
          ? "手动"
          : "手动（无效）"
        : recommendedPlan
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

const HISTORY_FILTERS = [
  ["all", "全部", "All"],
  ["seasons", "赛季", "Seasons"],
  ["drafts", "选秀", "Drafts"],
  ["transactions", "交易", "Transactions"],
];

const FINISH_LABELS = {
  champion: "总冠军",
  finals: "总决赛",
  playoffs: "季后赛",
  lottery: "乐透区",
};

const FINISH_LABELS_EN = {
  champion: "Champion",
  finals: "Finals",
  playoffs: "Playoffs",
  lottery: "Lottery",
};

function historyCard(entry, career, lang = "zh") {
  const en = lang === "en";
  const finishLabels = en ? FINISH_LABELS_EN : FINISH_LABELS;
  const awards = [
    ["MVP", entry.awards?.mvp],
    ["DPOY", entry.awards?.dpoy],
    ["ROY", entry.awards?.roy],
  ]
    .filter(([, award]) => award?.name)
    .map(([label, award]) => `<li>${label}：${escapeHtml(award.name)}</li>`)
    .join("");
  const transactions = entry.transactions
    .map(
      (transaction) =>
        `<li>${en ? `Day ${escapeHtml(Number(transaction.day) + 1)}` : `第 ${escapeHtml(Number(transaction.day) + 1)} 日`} · ${escapeHtml(en ? transaction.descriptionEn || transaction.description : transaction.description)}</li>`,
    )
    .join("");
  const events = entry.events
    .map(
      (event) =>
        `<li>${escapeHtml(event.label || event.description || event.choice || event.type)}</li>`,
    )
    .join("");
  const pick = entry.userDraftPick
    ? `<p><strong>${en ? "Your draft pick:" : "本队选秀："}</strong>#${escapeHtml(entry.userDraftPick.pickNumber)} ${escapeHtml(entry.userDraftPick.name || entry.userDraftPick.bref || "—")} · ${escapeHtml(sourceLabel(entry.userDraftPick.source))}</p>`
    : "";
  const champion = entry.championId
    ? teamName(career, {}, entry.championId)
    : "—";
  return `<article class="career-history-card" data-history-year="${escapeHtml(entry.year)}">
    <header><div><h4>${escapeHtml(entry.year)} · ${escapeHtml(entry.teamName)}</h4>
      <p>${entry.record ? (en ? `${escapeHtml(entry.record.w)}W-${escapeHtml(entry.record.l)}L` : `${escapeHtml(entry.record.w)} 胜 ${escapeHtml(entry.record.l)} 负`) : (en ? "No season summary" : "无赛季总结")} · ${escapeHtml(finishLabels[entry.finish] || entry.finish || "—")}</p></div>
      <span>${en ? "Champion:" : "冠军："}${escapeHtml(champion)}</span></header>
    ${pick}
    <details><summary>${en ? "Awards, transactions & events" : "奖项、交易与大事记"}</summary>
      ${awards ? `<h5>${en ? "Awards" : "奖项"}</h5><ul>${awards}</ul>` : ""}
      ${transactions ? `<h5>${en ? "Transactions" : "交易记录"}</h5><ul>${transactions}</ul>` : ""}
      ${events ? `<h5>${en ? "Career events" : "生涯事件"}</h5><ul>${events}</ul>` : ""}
      ${!awards && !transactions && !events ? `<p class=\"tiny\">${en ? "No more records this year." : "本年暂无更多记录。"}</p>` : ""}
    </details>
  </article>`;
}

export function renderCareerHistory(container, { career, lang = "zh" } = {}) {
  const en = lang === "en";
  if (!container) return container;
  if (!career?.management) {
    container.onclick = null;
    container.innerHTML = `<p class=\"tiny\">${en ? "Career history belongs to long-career mode. Create or load a long career first." : "生涯历史属于长期生涯模式，请先创建或载入长期生涯。"}</p>`;
    return container;
  }
  const timeline = buildCareerTimeline(career);
  if (!HISTORY_FILTERS.some(([value]) => value === container.dataset.historyFilter)) {
    container.dataset.historyFilter = "all";
  }

  const render = () => {
    const activeFilter = container.dataset.historyFilter;
    const entries = filterCareerTimeline(timeline, activeFilter).reverse();
    const filterLabel =
      HISTORY_FILTERS.find(([value]) => value === activeFilter)?.[en ? 2 : 1] || (en ? "History" : "历史");
    const buttons = HISTORY_FILTERS.map(
      ([value, label, labelEn]) =>
        `<button type="button" class="btn small${value === activeFilter ? " active" : ""}" data-history-filter="${value}">${en ? labelEn : label}</button>`,
    ).join("");
    container.innerHTML = `<section class="career-history-panel">
      <header class="career-history-head"><div><h4>${en ? "Career History" : "长期生涯历史"}</h4><p class="tiny">${en ? "Compact seasons, drafts, transactions and milestones only." : "仅保留紧凑赛季、选秀、交易和大事记。"}</p></div>
        <div class="btn-row career-history-filters">${buttons}</div></header>
      <div class="career-history-list">${
        entries.length
          ? entries.map((entry) => historyCard(entry, career, lang)).join("")
          : `<p class="career-history-empty">${en ? `No ${escapeHtml(filterLabel)} records yet.` : `暂无${escapeHtml(filterLabel)}记录。`}</p>`
      }</div>
    </section>`;
  };

  container.onclick = (event) => {
    const button = event?.target?.closest?.("[data-history-filter]");
    if (!button || !HISTORY_FILTERS.some(([value]) => value === button.dataset.historyFilter)) {
      return;
    }
    container.dataset.historyFilter = button.dataset.historyFilter;
    render();
  };
  render();
  return container;
}
