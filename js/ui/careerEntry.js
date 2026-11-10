/**
 * Unified Career entry: four identities in parallel (ADR-006, user direction
 * 2026-11-09). Time travel is a shared career-start era, not a fifth
 * profession — so this screen replaces the old two-card presentation
 * (穿越生涯 / 联盟经理), whose cards overlapped and mixed two different
 * classification dimensions.
 *
 * The four cards are static HTML in index.html (so homeTabs.test.js can
 * still see the two catalog modes, and the i18n coverage test can see the
 * static copy). This module owns the behaviour: the per-card detail lines,
 * the Coach icon header, the era step for GM + Coach, and the clicks.
 *
 * Honest labels, no fake buttons:
 * - Player / Coach: 开发中 — clicking shows an honest note, never a flow.
 * - GM: 待独立身份实现 — opens the existing League Manager setup (which
 *   already lets you pick Modern / Historical there); the card says
 *   plainly that coach permissions are not yet isolated.
 * - GM + Coach: 经典玩法可玩 — opens the era step, then the existing
 *   Time Travel creation (historical year dial 1976–2025). The Modern
 *   League era for GM + Coach does not exist yet and is shown disabled,
 *   never as playable.
 *
 * Player Reborn is NOT implemented here (the M3 playtest gate was lifted
 * 2026-11-09 and the Reborn slice is built in parallel in its own worktree;
 * this landing keeps the Player card 开发中 until the integration point
 * lands). The Coach/GM permission separation is NOT implemented here
 * (Code's slice). This module only routes to existing flows.
 */
import { getLang } from "../i18n.js";
import { icon } from "./timeTravel/icons.js";

const tr = (lang, zh, en) => (lang === "en" ? en : zh);

/** [zh, en] pairs — static card copy lives in index.html + PHRASES. */
export const CAREER_IDENTITIES = [
  {
    id: "player",
    role: "PLAYER",
    status: "dev",
    route: null,
    legend: "jordami01:1991",
    iconName: null,
    details: [
      {
        label: ["执掌", "Control"],
        text: ["亲自打比赛，关键回合由你接管", "Play the games yourself and take over clutch moments"],
      },
      {
        label: ["成长", "Growth"],
        text: ["新秀 → 轮换 → 明星 → 传奇", "Rookie → rotation → star → legend"],
      },
      {
        label: ["挑战", "Challenge"],
        text: ["争取上场时间，面对伤病与交易风险", "Fight for minutes; injuries and trades loom"],
      },
    ],
    devNote: [
      "球员生涯开发中：按 ADR-005 的 Player Reborn 路线实现，球员生涯线正在并行开发中。",
      "Player Career is in development: it follows the ADR-005 Player Reborn plan and is being built in a parallel slice.",
    ],
  },
  {
    id: "coach",
    role: "COACH",
    status: "dev",
    route: null,
    legend: null,
    iconName: "scroll",
    details: [
      {
        label: ["执掌", "Control"],
        text: ["完全掌控战术、轮换与临场指挥", "Full control of tactics, rotation and in-game calls"],
      },
      {
        label: ["成长", "Growth"],
        text: ["助教 → 主教练 → 王朝教头", "Assistant → head coach → dynasty builder"],
      },
      {
        label: ["挑战", "Challenge"],
        text: ["战绩压力、更衣室信任与续约", "Results pressure, locker-room trust and contracts"],
      },
    ],
    devNote: [
      "教练生涯开发中：按 ADR-006 的权限拆分实现，教练专属成长与剧情随后到来。",
      "Coach Career is in development: it follows the ADR-006 permission split, with coach-only growth and storylines to come.",
    ],
  },
  {
    id: "gm",
    role: "GM",
    status: "awaiting",
    route: "franchise",
    legend: "curryst01:2016",
    iconName: null,
    details: [
      {
        label: ["执掌", "Control"],
        text: ["完全掌控选秀、交易与球队合同", "Full control of draft, trades and team contracts"],
      },
      {
        label: ["成长", "Growth"],
        text: ["球探 → 总经理 → 王朝缔造者", "Scout → general manager → dynasty maker"],
      },
      {
        label: ["挑战", "Challenge"],
        text: ["经营业绩压力与薪资空间", "Front-office results pressure and the salary cap"],
      },
    ],
    note: [
      "复用联盟经理流程：时代在设置页选，教练权限尚未隔离。",
      "Reuses the League Manager flow — pick the era on its setup screen; coach permissions are not yet isolated.",
    ],
  },
  {
    id: "gm_coach",
    role: "GM_COACH",
    status: "playable",
    route: "timeTravel",
    legend: "jamesle01:2013",
    iconName: null,
    details: [
      {
        label: ["执掌", "Control"],
        text: ["建队、交易、战术与临场指挥全都要管", "Roster building, trades, tactics and live coaching — all yours"],
      },
      {
        label: ["成长", "Growth"],
        text: ["新任教头 → 王朝缔造者", "New head coach → dynasty maker"],
      },
      {
        label: ["挑战", "Challenge"],
        text: ["双重压力：战绩与经营目标都要达标", "Double pressure: results and front-office goals both count"],
      },
    ],
  },
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
  if (identityId === "gm") return "setup";
  return [];
}

/** The three detail lines (+ the optional honest note) for one card. Pure. */
export function careerDetailsHtml(identity, lang = "zh") {
  const lines = identity.details.map(
    (line) =>
      `<span class="career-detail"><b>${tr(lang, line.label[0], line.label[1])}</b>${tr(
        lang,
        line.text[0],
        line.text[1],
      )}</span>`,
  );
  if (identity.note) {
    lines.push(
      `<span class="career-detail career-detail--note"><b>${tr(lang, "提醒", "Note")}</b>${tr(
        lang,
        identity.note[0],
        identity.note[1],
      )}</span>`,
    );
  }
  return lines.join("");
}

/** The era step for GM + Coach. Pure. The Modern era is disabled, not hidden. */
export function eraPanelHtml(lang = "zh") {
  return `<div class="career-era-head">
      <strong>${tr(lang, "选择开局时代", "Choose your starting era")}</strong>
      <span>${tr(lang, "经理兼教练 · 经典玩法", "GM + Coach · Classic")}</span>
    </div>
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
    <p class="career-era-note">${tr(
      lang,
      "经理兼教练的现代开局尚未开放，先穿越回历史吧。",
      "A modern GM + Coach start is not open yet — travel back in time for now.",
    )}</p>
    <button type="button" class="career-era-back" data-career-era-back>← ${tr(
      lang,
      "返回选择身份",
      "Back to identities",
    )}</button>`;
}

let wired = false;
let onPlayCb = null;
/** Which identity's dev note is currently shown (for language re-render). */
let shownDevNote = null;
/** Whether the era panel is currently open (for language re-render). */
let eraOpen = false;

function paintDetails(lang) {
  for (const identity of CAREER_IDENTITIES) {
    const slot = document.querySelector(`[data-career-details="${identity.id}"]`);
    if (slot) slot.innerHTML = careerDetailsHtml(identity, lang);
  }
}

function paintCoachIcon() {
  const card = document.querySelector('[data-career-identity="coach"]');
  if (!card || card.querySelector(".career-card-icon")) return;
  const slot = document.createElement("span");
  slot.className = "mode-card-photo career-card-icon";
  slot.dataset.photoSlot = "";
  slot.setAttribute("aria-hidden", "true");
  slot.innerHTML = icon("scroll", { size: 44 });
  card.prepend(slot);
  card.classList.add("has-photo");
}

function showNote(text) {
  const note = document.querySelector("#career-entry-note");
  if (!note) return;
  note.hidden = !text;
  note.textContent = text || "";
}

function showEraPanel(open) {
  const panel = document.querySelector("#career-era-panel");
  if (!panel) return;
  eraOpen = open;
  if (open) {
    panel.innerHTML = eraPanelHtml(getLang());
    panel.hidden = false;
    panel.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  } else {
    panel.hidden = true;
    panel.innerHTML = "";
  }
}

function handleCardClick(identityId) {
  const identity = careerIdentityById(identityId);
  if (!identity) return;
  if (identity.status === "dev") {
    showEraPanel(false);
    shownDevNote = identityId;
    showNote(tr(getLang(), identity.devNote[0], identity.devNote[1]));
    return;
  }
  shownDevNote = null;
  showNote("");
  if (identityId === "gm_coach") {
    showEraPanel(true);
    return;
  }
  showEraPanel(false);
  onPlayCb?.(identityId);
}

/**
 * Re-render every JS-owned string in the current language. Idempotent:
 * safe to call on every language flip and tab activation.
 */
export function refreshCareerEntry() {
  const lang = getLang();
  paintDetails(lang);
  paintCoachIcon();
  if (shownDevNote) {
    const identity = careerIdentityById(shownDevNote);
    if (identity?.devNote) showNote(tr(lang, identity.devNote[0], identity.devNote[1]));
  }
  if (eraOpen) {
    const panel = document.querySelector("#career-era-panel");
    if (panel) panel.innerHTML = eraPanelHtml(lang);
  }
}

/**
 * Wire the four identity cards. `onPlay(identityId, era)` routes the
 * playable flows: ("gm") and ("gm_coach", "historical"). Player/Coach
 * never call it — they only show the honest dev note.
 */
export function initCareerEntry({ onPlay } = {}) {
  onPlayCb = onPlay || null;
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
        onPlayCb?.("gm_coach", "historical");
      }
      return;
    }
    const card = event.target.closest("[data-career-identity]");
    if (card) handleCardClick(card.dataset.careerIdentity);
  });
}
