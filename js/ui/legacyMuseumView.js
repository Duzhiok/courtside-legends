/**
 * Legacy Museum view (篮球人生博物馆): the career legacy detail view the
 * My World honours wall opens (user decision 2026-11-10, after 375b75d).
 *
 * Pure HTML builders (legacyMuseumHtml) plus a controller (createLegacyMuseumView)
 * built on the shared Screen Shell (screenShell.js: mount, title, back, focus,
 * scroll, language). The shell owns the ONE page title; the body below never
 * repeats it. The honours wall is the only entry point:
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
import { mountScreen } from "./screenShell.js";

/** The page title, rendered once by the shell in the current language. */
export const LEGACY_MUSEUM_TITLE = Object.freeze({ zh: "篮球人生博物馆", en: "Legacy Museum" });

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

/** Headline kinds written by the legacy log. An unknown kind is left off the line rather than shown as an internal word. */
const HEADLINE_TYPE = {
  transition: ["转岗", "Move"],
  trade: ["交易", "Trade"],
  draft: ["选秀", "Draft"],
  divergence: ["历史偏离", "Divergence"],
  promise: ["承诺", "Promise"],
  "promise-resolved": ["承诺结算", "Promise settled"],
  "rivalry-game": ["宿敌对决", "Rivalry game"],
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

/** One completed career: the role plus one chip per REAL field. Missing fields are skipped, never filled in. */
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
  const chips = facts.length
    ? facts.map((f) => `<span class="lm-chip">${f}</span>`).join("")
    : `<span class="lm-chip lm-chip--muted">${T(lang, "记录不完整", "Incomplete record")}</span>`;
  return `<li class="lm-career"><strong>${esc(T(lang, role[0], role[1]))}</strong><span class="lm-chips">${chips}</span></li>`;
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

/** One badge per title: an icon and a palette of its own (the name is always written out, colour is never the only cue). */
const TITLE_ICON = { architect: "🏛️", "dynasty-master": "🏆", "basketball-immortal": "🌟" };
export const titleIconOf = (id) => TITLE_ICON[id] || "🏅";

function titleSection(model, title, lang, selectedTitleId) {
  const id = esc(title.id);
  const name = esc(lang === "en" ? title.en : title.zh);
  const requirement = TITLE_REQUIREMENT[title.id] || null;
  const evidence = titleEvidence(model, title.id, lang);
  const evidenceHtml = evidence.length
    ? `<ul class="lm-careers">${evidence.join("")}</ul>`
    : `<p class="mw-empty">${T(lang, "暂无相关生涯记录。", "No career records for this title yet.")}</p>`;
  return `<section class="lm-title lm-title--${id}${title.id === selectedTitleId ? " is-selected" : ""}" data-lm-title="${id}">
    <header class="lm-title-head">
      <span class="lm-icon" aria-hidden="true">${titleIconOf(title.id)}</span>
      <div class="lm-title-text">
        <h3>${name}</h3>
        ${requirement ? `<p class="lm-req">${esc(T(lang, requirement[0], requirement[1]))}</p>` : ""}
      </div>
    </header>
    ${evidenceHtml}
  </section>`;
}

function legacyRecordHtml(legacy, lang) {
  if (!legacy) return "";
  const promises = legacy.promises || { open: 0, fulfilled: 0, broken: 0 };
  const tiles = [
    [legacy.transitions?.length || 0, T(lang, "转会 / 转岗", "Transitions")],
    [legacy.trades?.length || 0, T(lang, "交易", "Trades")],
    [legacy.drafts?.length || 0, T(lang, "选秀", "Drafts")],
    [legacy.divergences?.length || 0, T(lang, "历史偏离", "Divergences")],
    [legacy.rivalries || 0, T(lang, "宿敌", "Rivals")],
  ];
  const tilesHtml = tiles.map(([n, label]) => `<div class="lm-stat"><b>${n}</b><span>${label}</span></div>`).join("");
  const promisesHtml = `<p class="lm-promises"><strong>${T(lang, "承诺", "Promises")}</strong>
      <span class="lm-chip">${T(lang, "待处理", "Open")} ${promises.open}</span>
      <span class="lm-chip lm-chip--ok">${T(lang, "兑现", "Kept")} ${promises.fulfilled}</span>
      <span class="lm-chip lm-chip--bad">${T(lang, "落空", "Broken")} ${promises.broken}</span></p>`;
  const headlines = Array.isArray(legacy.headlines) ? legacy.headlines : [];
  const headlinesHtml = headlines.length
    ? `<ul class="lm-headlines">${headlines.map((h) => {
        const meta = [h.season != null ? h.season : null, HEADLINE_TYPE[h.type] ? esc(T(lang, HEADLINE_TYPE[h.type][0], HEADLINE_TYPE[h.type][1])) : null].filter((v) => v != null).join(" · ");
        return `<li><span>${esc(lang === "en" ? h.en : h.zh)}</span>${meta ? `<span class="lm-meta">${meta}</span>` : ""}</li>`;
      }).join("")}</ul>`
    : `<p class="mw-empty">${T(lang, "还没有 legacy 记录。承诺结算、宿敌对决和历史偏离会写在这里。", "No legacy records yet. Resolved promises, rivalry games and divergences land here.")}</p>`;
  return `<section class="lm-record">
    <h3>${T(lang, "生涯记录", "Career record")}</h3>
    <div class="lm-stats">${tilesHtml}</div>
    ${promisesHtml}
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
    <p class="lm-lead">${esc(unlockLine)} · ${T(lang, "以下全部来自你的生涯记录。", "Everything below comes from your career records.")}</p>
    ${titles.map((title) => titleSection(model, title, lang, selectedTitleId)).join("")}
    ${legacyRecordHtml(model.legacy, lang)}
  </div>`;
}

export function createLegacyMuseumView({ getLang, getAccount, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let selectedTitle = null;
  let shell = null;

  function render() {
    if (!shell) return false;
    const model = legacyMuseumFor(typeof getAccount === "function" ? getAccount() : null);
    if (!model) {
      shell.body.innerHTML = `<p class="mw-empty">${T(lang(), "还没有可以展示的传承。完成一次完整教练生涯与一次完整经理生涯后，这里会打开。", "Nothing to show yet. Complete one full Coach career and one full GM career and this museum opens.")}</p>`;
      return false;
    }
    shell.body.innerHTML = legacyMuseumHtml(model, lang(), selectedTitle);
    return true;
  }

  /** Mount once (boot) so the screen registry has the element; open() only renders and shows. */
  function mount() {
    shell ||= mountScreen({ id: "legacy-museum", title: LEGACY_MUSEUM_TITLE, getLang: lang, onBack: () => goBack?.(), onRelocalize: render });
    return shell.el;
  }

  /** Open the museum from the honours wall. `titleId` is the tapped title (or null); its section is highlighted and scrolled to. */
  function open(titleId = null) {
    mount();
    selectedTitle = typeof titleId === "string" ? titleId : null;
    render();
    shell.aimScrollAt(selectedTitle ? `[data-lm-title="${selectedTitle}"]` : null);
    show?.("legacyMuseum");
  }

  return { mount, open, render };
}
