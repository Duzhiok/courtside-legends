/**
 * Unified Career entry: three standard identities + one hidden prestige
 * identity (3+1, user decision 2026-11-09). Time travel is a shared
 * career-start era, not a fifth profession.
 *
 * The three standard cards are photo cards (portraits cropped from the
 * user's concept mock, assets/career/*). The Architect is a full-width
 * prestige card below them: locked by default, it shows the unlock
 * progress (Coach career + GM career, 0/2) and only routes to the
 * Classic GM + Coach flow once the account has completed both
 * qualifications (see js/career/careerAchievements.js). Clicking a
 * locked Architect card shows the requirements, never a flow.
 *
 * Honest labels, no fake buttons:
 * - Player: 可玩 — opens the Player Reborn creation flow (js/ui/reborn),
 *   then the season screen. Random destiny keeps the staged trust-40
 *   reveal; a chosen identity is known from the start.
 * - Coach: 开发中 — clicking shows an honest note, never a flow.
 * - GM: routes to the existing League Manager setup (coach permissions
 *   are not yet isolated — workstream B's slice).
 * - The Architect: locked until unlocked; unlocked routes to the era
 *   step, then the existing Time Travel creation (historical year
 *   1976–2025). The Modern League era does not exist yet and is shown
 *   disabled, never as playable.
 *
 * Static copy lives in index.html + PHRASES; this module owns the
 * behaviour, the Architect lock/progress paint, the era step, and the
 * clicks. The static HTML keeps the catalog's data-mode attributes on
 * the GM / GM + Coach cards (homeTabs pins the catalog mapping) and a
 * screen-reader-only "经理生涯" group label (same reason); the
 * .mode-card[data-mode] click wiring in app.js skips career cards.
 */
import { getLang } from "../i18n.js";
import {
  architectProgress,
  architectUnlocked,
  readArchitectDevOverride,
} from "../career/careerAchievements.js";

const tr = (lang, zh, en) => (lang === "en" ? en : zh);

/** Static card copy (names, taglines) lives in index.html + PHRASES. */
export const CAREER_IDENTITIES = [
  { id: "player", role: "PLAYER", status: "playable", route: "reborn" },
  {
    id: "coach",
    role: "COACH",
    status: "dev",
    route: null,
    devNote: [
      "教练生涯开发中：按 ADR-006 的权限拆分实现，教练专属成长与剧情随后到来。",
      "Coach Career is in development: it follows the ADR-006 permission split, with coach-only growth and storylines to come.",
    ],
  },
  { id: "gm", role: "GM", status: "awaiting", route: "franchise" },
  { id: "gm_coach", role: "GM_COACH", status: "prestige", route: "timeTravel", prestige: true },
];

export function careerIdentityById(id) {
  return CAREER_IDENTITIES.find((entry) => entry.id === id) || null;
}

/**
 * Which eras an identity can start in. "setup" means the era is picked on
 * the existing setup screen (League Manager already has the Modern /
 * Historical toggle + year selector); [] means no creation flow exists.
 * @returns {Array<{id:string,available:boolean}>|"setup"|[]}
 */
export function erasFor(identityId) {
  if (identityId === "gm_coach") {
    return [
      { id: "historical", available: true },
      { id: "modern", available: false },
    ];
  }
  if (identityId === "player") {
    // Player Reborn creation offers the historical start (1995 / 1996);
    // the Modern League era does not exist for a player career yet.
    return [
      { id: "historical", available: true },
      { id: "modern", available: false },
    ];
  }
  if (identityId === "gm") return "setup";
  return [];
}

/**
 * The era step for GM + Coach. Pure. The Modern era is disabled, not
 * hidden. `prestige` opens the step from the Architect card and adds the
 * prestige briefing (dual objectives, decision-chain reactions,
 * legendary dynasty titles).
 */
export function eraPanelHtml(lang = "zh", { prestige = false } = {}) {
  const brief = prestige
    ? `<p class="career-era-brief"><b>${tr(lang, "双重目标", "Dual objectives")}</b>${tr(
        lang,
        "董事会要求本赛季进入季后赛，同时控制薪资并培养新人。",
        "The board wants the playoffs this season — while you control the salary cap and develop rookies.",
      )}</p>
    <p class="career-era-brief"><b>${tr(lang, "决策连锁", "Every decision chains")}</b>${tr(
        lang,
        "你作为经理交易来的球员，作为教练必须自己使用。",
        "Every player you trade for as GM, you must coach yourself.",
      )}</p>
    <p class="career-era-brief"><b>${tr(lang, "传奇称号", "Legendary titles")}</b>${tr(
        lang,
        "The Architect · Dynasty Master · Basketball Immortal，进入 My World 终身荣誉墙。",
        "The Architect · Dynasty Master · Basketball Immortal — they join your My World lifetime honours wall.",
      )}</p>`
    : "";
  return `<div class="career-era-head">
      <strong>${
        prestige ? "The Architect" : tr(lang, "选择开局时代", "Choose your starting era")
      }</strong>
      <span>${
        prestige
          ? tr(lang, "隐藏职业 · 经理兼教练", "Hidden Career · GM + Coach")
          : tr(lang, "经理兼教练 · 经典玩法", "GM + Coach · Classic")
      }</span>
    </div>
    ${brief}
    <div class="career-era-choices">
      <button type="button" class="career-era-btn" data-career-era="historical">
        <strong>${tr(lang, "历史穿越（1976–2025）", "Historical Time Travel (1976–2025)")}</strong>
        <span>${tr(lang, "回到真实历史年份，改写篮球时间线。", "Start in a real historical year and rewrite the timeline.")}</span>
      </button>
      <button type="button" class="career-era-btn" data-career-era="modern" disabled aria-disabled="true">
        <strong>${tr(lang, "现代联盟", "Modern League")}</strong>
        <span>${tr(lang, "即将推出", "Coming soon")}</span>
      </button>
    </div>
    <p class="career-era-note">${
      prestige
        ? tr(lang, "以 The Architect 的身份穿越回历史，亲手打造王朝。", "Travel back as The Architect and build the dynasty yourself.")
        : tr(lang, "经理兼教练的现代开局尚未开放，先穿越回历史吧。", "A modern GM + Coach start is not open yet — travel back in time for now.")
    }</p>
    <button type="button" class="career-era-back" data-career-era-back>← ${tr(
      lang,
      "返回选择身份",
      "Back to identities",
    )}</button>`;
}

let wired = false;
let onPlayCb = null;
let getAccountCb = null;
/** Which identity's dev note is currently shown (for language re-render). */
let shownDevNote = null;
/** Whether the era panel is currently open (for language re-render). */
let eraOpen = false;
/** Whether the open era panel was opened from the Architect card. */
let eraPrestige = false;
/** Dev-only unlock override, re-read on every refresh. */
let devOverride = false;

function progressState() {
  const account = getAccountCb?.() || null;
  const progress = architectProgress(account);
  const unlocked = architectUnlocked(account, { devOverride });
  return { account, progress, unlocked };
}

function showNote(text) {
  const note = document.querySelector("#career-entry-note");
  if (!note) return;
  note.hidden = !text;
  note.textContent = text || "";
}

function showEraPanel(open, { prestige = false } = {}) {
  const panel = document.querySelector("#career-era-panel");
  if (!panel) return;
  eraOpen = open;
  eraPrestige = open ? prestige : false;
  if (open) {
    panel.innerHTML = eraPanelHtml(getLang(), { prestige });
    panel.hidden = false;
    panel.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  } else {
    panel.hidden = true;
    panel.innerHTML = "";
  }
}

function paintArchitect(lang) {
  const card = document.querySelector('[data-career-identity="gm_coach"]');
  if (!card) return;
  const { progress, unlocked } = progressState();
  card.classList.toggle("career-architect-card--locked", !unlocked);
  card.classList.toggle("career-architect-card--unlocked", unlocked);
  card.setAttribute("aria-disabled", unlocked ? "false" : "true");
  const closed = card.querySelector('[data-architect-lock="closed"]');
  const open = card.querySelector('[data-architect-lock="open"]');
  if (closed) closed.hidden = unlocked;
  if (open) open.hidden = !unlocked;
  const labels = {
    coach: [tr(lang, "教练生涯", "Coach Career"), progress.coach],
    gm: [tr(lang, "经理生涯", "General Manager Career"), progress.gm],
  };
  for (const [key, [label, done]] of Object.entries(labels)) {
    const pill = card.querySelector(`[data-architect-pill="${key}"]`);
    if (!pill) continue;
    pill.textContent = `${done ? "✓ " : ""}${label}`;
    pill.classList.toggle("career-architect-pill--done", done);
  }
  const count = card.querySelector("[data-architect-progress]");
  if (count) {
    count.textContent = unlocked
      ? tr(lang, "已解锁", "Unlocked")
      : tr(
          lang,
          `职业资历 ${progress.completed} / 2`,
          `Career standing ${progress.completed} / 2`,
        );
  }
}

function handleCardClick(identityId) {
  const identity = careerIdentityById(identityId);
  if (!identity) return;
  if (identityId === "gm_coach") {
    const { progress, unlocked } = progressState();
    if (!unlocked) {
      showEraPanel(false);
      shownDevNote = null;
      showNote(
        tr(
          getLang(),
          `The Architect 尚未解锁：完成一次完整教练生涯和一次完整经理生涯即可开启（当前 ${progress.completed} / 2${
            progress.coach ? "，教练生涯已完成" : ""
          }${progress.gm ? "，经理生涯已完成" : ""}）。`,
          `The Architect is still locked: complete one full Coach career and one full GM career to unlock it (currently ${progress.completed} / 2${
            progress.coach ? ", Coach done" : ""
          }${progress.gm ? ", GM done" : ""}).`,
        ),
      );
      return;
    }
    shownDevNote = null;
    showNote("");
    showEraPanel(true, { prestige: true });
    return;
  }
  if (identity.status === "dev") {
    showEraPanel(false);
    shownDevNote = identityId;
    showNote(tr(getLang(), identity.devNote[0], identity.devNote[1]));
    return;
  }
  shownDevNote = null;
  showNote("");
  showEraPanel(false);
  onPlayCb?.(identityId);
}

/**
 * Re-render every JS-owned string in the current language. Idempotent:
 * safe to call on every language flip and tab activation.
 */
export function refreshCareerEntry() {
  const lang = getLang();
  devOverride = readArchitectDevOverride(
    typeof location !== "undefined" ? location.search : "",
    typeof sessionStorage !== "undefined" ? sessionStorage : null,
  );
  paintArchitect(lang);
  // A completion that unlocked the Architect sets a one-time flag; show
  // the reveal animation + celebration note once, then clear it.
  let justUnlocked = false;
  try {
    justUnlocked = sessionStorage?.getItem("architect-just-unlocked") === "1";
    if (justUnlocked) sessionStorage?.removeItem("architect-just-unlocked");
  } catch {
    // Storage may be unavailable — the card simply shows its state.
  }
  const card = document.querySelector('[data-career-identity="gm_coach"]');
  if (justUnlocked && progressState().unlocked && card) {
    card.classList.add("career-architect-card--revealed");
    shownDevNote = null;
    showNote(
      tr(
        lang,
        "The Architect 已解锁：你完成了教练与经理两段职业人生，现在可以亲手打造属于自己的王朝了。",
        "The Architect is unlocked: you completed both a Coach and a GM career — now build a dynasty of your own.",
      ),
    );
  } else if (shownDevNote) {
    const identity = careerIdentityById(shownDevNote);
    if (identity?.devNote) showNote(tr(lang, identity.devNote[0], identity.devNote[1]));
  }
  if (eraOpen) {
    const panel = document.querySelector("#career-era-panel");
    if (panel) panel.innerHTML = eraPanelHtml(lang, { prestige: eraPrestige });
  }
}

/**
 * Wire the identity cards. `onPlay(identityId, era, opts)` routes the
 * playable flows: ("player"), ("gm") and ("gm_coach", "historical",
 * { prestige }). Coach never calls it — it only shows the honest dev
 * note. `getAccount` supplies the active account for the Architect
 * lock/progress paint; without it the card shows locked, 0/2.
 */
export function initCareerEntry({ onPlay, getAccount } = {}) {
  onPlayCb = typeof onPlay === "function" ? onPlay : null;
  getAccountCb = typeof getAccount === "function" ? getAccount : null;
  refreshCareerEntry();
  if (wired) return;
  wired = true;
  const root = document.querySelector("#career-entry-root");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const eraBack = event.target.closest("[data-career-era-back]");
    if (eraBack) {
      showEraPanel(false);
      return;
    }
    const eraBtn = event.target.closest("[data-career-era]");
    if (eraBtn) {
      if (eraBtn.disabled) return;
      if (eraBtn.dataset.careerEra === "historical") {
        showEraPanel(false);
        onPlayCb?.("gm_coach", "historical", { prestige: eraPrestige });
      }
      return;
    }
    const card = event.target.closest("[data-career-identity]");
    if (card) handleCardClick(card.dataset.careerIdentity);
  });
}
