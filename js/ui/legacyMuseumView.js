/**
 * Legacy Museum view (篮球人生博物馆): the career legacy detail view the
 * My World honours wall opens (user decision 2026-11-10, after 375b75d).
 *
 * Pure HTML builders (legacyMuseumHtml) plus a screen controller
 * (ensureLegacyMuseumScreen / createLegacyMuseumView) following the
 * relationshipsView.js pattern. The honours wall is the only entry point:
 * earned titles open the museum; locked/progress state has nothing to
 * show and stays non-clickable. Guests see no museum (no account records).
 *
 * Honesty rules, same as the honours wall: every line comes from a real
 * record (legacyMuseumFor); a missing field is omitted, never filled in
 * with a plausible value. Title names come from the model (which passes
 * ARCHITECT_TITLES through) — no Chinese title names are hardcoded here.
 */
import { LEGACY_TIERS } from "../career/legacy.js";
import { legacyMuseumFor } from "../career/legacyMuseum.js";

const T = (lang, zh, en) => (lang === "en" ? en : zh);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const ROLE_LABEL = {
  COACH: ["教练生涯", "Coach career"],
  GM: ["经理生涯", "GM career"],
  GM_COACH: ["建筑师生涯", "Architect career"],
};

/** Employment reasons written by retireCoach (retirement.js). Anything else is shown as-is. */
const REASON_LABEL = {
  voluntary: ["主动退役", "Retired by choice"],
  forced: ["因年龄退役", "Retired on age"],
};

/** What each title required — the rules from careerAchievements.js, not data. */
const TITLE_REQUIREMENT = {
  architect: ["完成一次完整教练生涯与一次完整经理生涯", "Complete one full Coach career and one full GM career"],
  "dynasty-master": ["在建筑师生涯中赢得总冠军", "Win a championship in an Architect career"],
  "basketball-immortal": ["完成一次建筑师生涯", "Complete an Architect career"],
};

const fmtDate = (ms, lang) => {
  try {
    return new Date(ms).toLocaleDateString(lang === "en" ? "en-US" : "zh-CN");
  } catch {
    return null;
  }
};

/** One completed career, as a single line of real fields only. Missing fields are skipped, never filled in. */
export function museumCareerLine(career, lang) {
  if (!career) return "";
  const role = ROLE_LABEL[career.role] || [career.role || "", career.role || ""];
  const tier = career.tier && LEGACY_TIERS[career.tier] ? LEGACY_TIERS[career.tier] : null;
  const reason = career.reason ? REASON_LABEL[career.reason] || [career.reason, career.reason] : null;
  const facts = [];
  if (career.year != null) facts.push(T(lang, `结束于 ${career.year} 赛季`, `Ended in the ${career.year} season`));
  if (career.seasons != null) facts.push(T(lang, `${career.seasons} 个赛季`, `${career.seasons} season(s)`));
  if (career.championships != null) facts.push(T(lang, `${career.championships} 座总冠军`, `${career.championships} title(s)`));
  if (tier) facts.push(esc(lang === "en" ? tier.labelEn : tier.label));
  else if (career.tier) facts.push(esc(career.tier));
  if (reason) facts.push(esc(T(lang, reason[0], reason[1])));
  const detail = facts.length ? facts.join(" · ") : T(lang, "记录不完整", "Incomplete record");
  return `<li><strong>${esc(T(lang, role[0], role[1]))}</strong> — ${detail}</li>`;
}

/** The evidence careers behind one title: qualifications for The Architect, prestige careers for the other two. */
function titleEvidence(model, titleId, lang) {
  if (titleId === "architect") {
    return [model.qualifications?.coach, model.qualifications?.gm].filter(Boolean).map((c) => museumCareerLine(c, lang));
  }
  const prestige = Array.isArray(model.architectCareers) ? model.architectCareers : [];
  const careers = titleId === "dynasty-master" ? prestige.filter((c) => (c.championships || 0) >= 1) : prestige;
  return careers.map((c) => museumCareerLine(c, lang));
}

function titleSection(model, title, lang, selectedTitleId) {
  const name = esc(lang === "en" ? title.en : title.zh);
  const requirement = TITLE_REQUIREMENT[title.id] || null;
  const evidence = titleEvidence(model, title.id, lang);
  const evidenceHtml = evidence.length
    ? `<ul>${evidence.join("")}</ul>`
    : `<p class="mw-empty">${T(lang, "暂无相关生涯记录。", "No career records for this title yet.")}</p>`;
  return `<section data-lm-title="${esc(title.id)}"${title.id === selectedTitleId ? ' class="is-selected"' : ""}>
    <h3>👑 ${name}</h3>
    ${requirement ? `<p class="mw-line tiny">${esc(T(lang, requirement[0], requirement[1]))}</p>` : ""}
    ${evidenceHtml}
  </section>`;
}

function legacyRecordHtml(legacy, lang) {
  if (!legacy) return "";
  const promises = legacy.promises || { open: 0, fulfilled: 0, broken: 0 };
  const counts = [
    T(lang, `转会 / 转岗 ${legacy.transitions?.length || 0} 次`, `${legacy.transitions?.length || 0} transition(s)`),
    T(lang, `交易 ${legacy.trades?.length || 0} 笔`, `${legacy.trades?.length || 0} trade(s)`),
    T(lang, `选秀 ${legacy.drafts?.length || 0} 次`, `${legacy.drafts?.length || 0} draft(s)`),
    T(lang, `历史偏离 ${legacy.divergences?.length || 0} 次`, `${legacy.divergences?.length || 0} divergence(s)`),
    T(lang, `宿敌 ${legacy.rivalries || 0} 个`, `${legacy.rivalries || 0} rival(s)`),
    T(lang, `承诺 ${promises.open} 待处理 / ${promises.fulfilled} 兑现 / ${promises.broken} 落空`, `Promises: ${promises.open} open / ${promises.fulfilled} kept / ${promises.broken} broken`),
  ];
  const headlines = Array.isArray(legacy.headlines) ? legacy.headlines : [];
  const headlinesHtml = headlines.length
    ? `<ul>${headlines.map((h) => `<li>${esc(lang === "en" ? h.en : h.zh)} <span class="tiny">· ${h.season ?? "?"} · ${esc(h.type)}</span></li>`).join("")}</ul>`
    : `<p class="mw-empty">${T(lang, "还没有 legacy 记录。承诺结算、宿敌对决和历史偏离会写在这里。", "No legacy records yet. Resolved promises, rivalry games and divergences land here.")}</p>`;
  return `<section>
    <h3>${T(lang, "生涯记录", "Career record")}</h3>
    <p class="mw-line tiny">${counts.join(" · ")}</p>
    ${headlinesHtml}
  </section>`;
}

/**
 * The museum page for an account's model (legacyMuseumFor). null = no
 * museum (guest, or not unlocked yet) — renders nothing.
 * `selectedTitleId` marks the title the player tapped on the honours wall.
 */
export function legacyMuseumHtml(model, lang, selectedTitleId = null) {
  if (!model) return "";
  const titles = Array.isArray(model.titles) ? model.titles : [];
  if (!titles.length) return "";
  const unlocked = model.unlockedAt != null ? fmtDate(model.unlockedAt, lang) : null;
  const unlockLine = unlocked
    ? T(lang, `解锁于 ${unlocked}`, `Unlocked ${unlocked}`)
    : T(lang, "解锁日期未知", "Unlock date unknown");
  return `<div class="lm-museum">
    <p class="mw-kicker">LEGACY MUSEUM</p>
    <h2>${T(lang, "篮球人生博物馆", "Legacy Museum")}</h2>
    <p class="mw-line tiny">${esc(unlockLine)} · ${T(lang, "以下全部来自你的生涯记录。", "Everything below comes from your career records.")}</p>
    ${titles.map((title) => titleSection(model, title, lang, selectedTitleId)).join("")}
    ${legacyRecordHtml(model.legacy, lang)}
  </div>`;
}

export function ensureLegacyMuseumScreen() {
  let el = document.querySelector("#screen-legacy-museum");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-legacy-museum";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-legacy-museum-back" type="button"><span>返回</span></button><h2>${"篮球人生博物馆 · Legacy Museum"}</h2></div><div id="legacy-museum-body"></div>`;
  document.body.appendChild(el);
  return el;
}

export function createLegacyMuseumView({ getLang, getAccount, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let body = null;
  let backWired = false;
  let selectedTitle = null;

  function render() {
    const account = typeof getAccount === "function" ? getAccount() : null;
    if (!body) return false;
    const model = legacyMuseumFor(account);
    if (!model) {
      body.innerHTML = `<p class="mw-empty">${T(lang(), "还没有可以展示的传承。完成一次完整教练生涯与一次完整经理生涯后，这里会打开。", "Nothing to show yet. Complete one full Coach career and one full GM career and this museum opens.")}</p>`;
      return false;
    }
    body.innerHTML = legacyMuseumHtml(model, lang(), selectedTitle);
    return true;
  }

  /** Open the museum from the honours wall. `titleId` is the tapped title (or null); its section is highlighted. */
  function open(titleId = null) {
    ensureLegacyMuseumScreen();
    el = document.querySelector("#screen-legacy-museum");
    body = document.querySelector("#legacy-museum-body");
    if (!body) return;
    selectedTitle = typeof titleId === "string" ? titleId : null;
    if (!backWired) {
      backWired = true;
      el.querySelector("#btn-legacy-museum-back")?.addEventListener("click", () => {
        if (typeof goBack === "function") goBack();
        else el.classList.remove("active");
      });
    }
    render();
    if (typeof show === "function") show("legacyMuseum");
    else el.classList.add("active");
    const target = selectedTitle ? body.querySelector(`[data-lm-title="${selectedTitle}"]`) : null;
    target?.scrollIntoView?.({ block: "start" });
  }

  return { open, render };
}
