/**
 * Dynamic In-Match Events MVP — UI (Lychee).
 *
 * Pure HTML builders for the three first-slice event families, plus the thin
 * mounts/controller the engine's minimal integration calls. No game logic
 * lives here: the engine decides eligibility, timing and effects; this file
 * only shows an event and forwards the player's pick.
 *
 * Event shape (the engine contract — see the board line 2026-11-14):
 *   {
 *     id: string,              // explicit dedup key, stable across reload
 *     family: "takeover" | "weakness" | "foulTrouble",
 *     severity: "info" | "decision",
 *     title: { zh, en } | string,
 *     body: { zh, en } | string,
 *     clock?: "Q2 · 07:32",
 *     score?: { home, away, homeName?, awayName? },
 *     player?: { name, pos?, fouls? },
 *     choices?: [{ id, label, hint?, recommended?, disabled?, disabledReason? }],
 *     defaultChoiceId?: string,  // the choice fast sim auto-resolves with
 *     choiceLabel?: string,      // what the player picked (history)
 *     outcome?: { zh, en } | string, // what actually happened (history)
 *   }
 * A decision event MUST carry at least one choice, and the engine must
 * include an Ignore choice (the spec's Ignore / Default behaviour lives in
 * the choice list, not in the UI — the UI never invents a decision).
 * Severity decides the surface: info -> court-side toast; decision ->
 * coach-panel card on desktop, bottom sheet on narrow screens.
 * Boundaries come from js/engine/domainEvents.js (POSSESSION_START,
 * SUBSTITUTION, PERIOD_START, PERIOD_END, MATCH_END); nothing here picks
 * when an event fires.
 */
export const MATCH_EVENT_FAMILIES = ["takeover", "weakness", "foulTrouble"];
export const MATCH_EVENT_SEVERITIES = ["info", "decision"];

const FAMILY_LABEL = {
  takeover: ["球星接管", "Star takeover"],
  weakness: ["对手弱点", "Opponent weakness"],
  foulTrouble: ["犯规麻烦", "Foul trouble"],
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pick = (pair, lang) => {
  if (pair == null) return "";
  if (typeof pair === "string") return pair;
  return lang === "en" ? pair.en || pair.zh || "" : pair.zh || pair.en || "";
};
const L = (lang, zh, en) => (lang === "en" ? en : zh);

export function matchEventFamilyLabel(family, lang = "zh") {
  const pair = FAMILY_LABEL[family];
  return pair ? (lang === "en" ? pair[1] : pair[0]) : family || "";
}

/** The engine contract, checked at the boundary so a malformed event never renders half a card. */
export function validateMatchEvent(event) {
  if (!event || typeof event !== "object") return { ok: false, reason: "not an event" };
  if (!event.id) return { ok: false, reason: "missing id" };
  if (!MATCH_EVENT_FAMILIES.includes(event.family)) return { ok: false, reason: "unknown family" };
  if (!MATCH_EVENT_SEVERITIES.includes(event.severity)) return { ok: false, reason: "unknown severity" };
  if (!event.title) return { ok: false, reason: "missing title" };
  if (event.severity === "decision" && (!Array.isArray(event.choices) || !event.choices.length)) {
    return { ok: false, reason: "a decision needs choices (including Ignore)" };
  }
  return { ok: true };
}

function contextLine(event, lang) {
  const parts = [];
  if (event.clock) parts.push(esc(event.clock));
  if (event.score) {
    const home = esc(event.score.homeName || L(lang, "主队", "Home"));
    const away = esc(event.score.awayName || L(lang, "客队", "Away"));
    parts.push(`${home} ${event.score.home}–${event.score.away} ${away}`);
  }
  if (event.player?.name) {
    const fouls = Number.isFinite(event.player.fouls) ? ` · ${L(lang, `${event.player.fouls} 犯`, `${event.player.fouls} fouls`)}` : "";
    parts.push(`${esc(event.player.name)}${event.player.pos ? ` · ${esc(event.player.pos)}` : ""}${fouls}`);
  }
  return parts.join(" · ");
}

function choicesHtml(event, lang) {
  const choices = event.choices || [];
  if (!choices.length) return "";
  return `<div class="mev-choices">${choices.map((c) => {
    const rec = c.recommended ? ` <small>★ ${L(lang, "推荐", "pick")}</small>` : "";
    const isDefault = event.defaultChoiceId && c.id === event.defaultChoiceId;
    const def = isDefault ? ` <small>(${L(lang, "默认", "default")})</small>` : "";
    const why = c.disabled && c.disabledReason ? `<span class="mev-why">${esc(pick(c.disabledReason, lang))}</span>` : "";
    return `<button type="button" class="mev-choice${c.recommended ? " rec" : ""}" data-choice="${esc(c.id)}" ${c.disabled ? "disabled" : ""}>
      <b>${esc(pick(c.label, lang))}${rec}${def}</b>
      ${c.hint ? `<span class="mev-hint">${esc(pick(c.hint, lang))}</span>` : ""}
      ${why}
    </button>`;
  }).join("")}</div>`;
}

function bodyHtml(event, lang) {
  const ctx = contextLine(event, lang);
  return `<p class="mev-body">${esc(pick(event.body, lang))}</p>
    ${ctx ? `<p class="mev-ctx">${ctx}</p>` : ""}
    ${choicesHtml(event, lang)}`;
}

/** Ordinary event: a small court-side notification. No choices, never covers the court. */
export function matchEventToastHtml(event, lang = "zh") {
  if (!validateMatchEvent(event).ok) return "";
  return `<div class="mev-toast mev-fam-${esc(event.family)}" data-event-id="${esc(event.id)}" role="status">
    <b>${esc(matchEventFamilyLabel(event.family, lang))}</b>
    <span>${esc(pick(event.title, lang))}</span>
    <button type="button" class="mev-dismiss" data-act="mev-dismiss" aria-label="${L(lang, "关闭", "Dismiss")}">×</button>
  </div>`;
}

/** Important decision, desktop: a card for the coach panel. */
export function matchEventCardHtml(event, lang = "zh") {
  if (!validateMatchEvent(event).ok) return "";
  return `<section class="mev-card mev-fam-${esc(event.family)}" data-event-id="${esc(event.id)}" aria-label="${esc(pick(event.title, lang))}">
    <header class="mev-head"><span class="mev-fam">${esc(matchEventFamilyLabel(event.family, lang))}</span>${event.clock ? `<span class="mev-clock">${esc(event.clock)}</span>` : ""}</header>
    <h4>${esc(pick(event.title, lang))}</h4>
    ${bodyHtml(event, lang)}
  </section>`;
}

/**
 * Important decision, mobile web: a responsive bottom sheet. The score and
 * game context stay in the sheet header, and the sheet caps at 62vh so the
 * scoreboard and court remain visible above it.
 */
export function matchEventSheetHtml(event, lang = "zh") {
  if (!validateMatchEvent(event).ok) return "";
  const score = event.score
    ? `<div class="mev-sheet-score"><span>${esc(event.score.homeName || L(lang, "主队", "Home"))} <b>${event.score.home}</b></span><span class="mev-sheet-clock">${esc(event.clock || "")}</span><span><b>${event.score.away}</b> ${esc(event.score.awayName || L(lang, "客队", "Away"))}</span></div>`
    : "";
  return `<div class="mev-sheet mev-fam-${esc(event.family)}" data-event-id="${esc(event.id)}" role="dialog" aria-label="${esc(pick(event.title, lang))}">
    <div class="mev-sheet-handle" aria-hidden="true"></div>
    ${score}
    <div class="mev-sheet-body">
      <header class="mev-head"><span class="mev-fam">${esc(matchEventFamilyLabel(event.family, lang))}</span></header>
      <h4>${esc(pick(event.title, lang))}</h4>
      ${bodyHtml(event, lang)}
    </div>
    <button type="button" class="mev-dismiss" data-act="mev-dismiss" aria-label="${L(lang, "关闭", "Dismiss")}">×</button>
  </div>`;
}

/** Decisions taken and what actually happened — one line per event, newest first. */
export function matchEventHistoryHtml(events, lang = "zh") {
  const list = (events || []).filter(Boolean);
  if (!list.length) return `<p class="mev-history-empty">${L(lang, "本场还没有触发事件。", "No events yet this game.")}</p>`;
  return `<ul class="mev-history">${list.map((e) => {
    const decision = e.choiceLabel ? esc(e.choiceLabel) : L(lang, "已忽略", "Ignored");
    const outcome = e.outcome ? ` — ${esc(pick(e.outcome, lang))}` : "";
    return `<li class="mev-history-row mev-fam-${esc(e.family)}"><span class="mev-history-clock">${esc(e.clock || "")}</span><b>${esc(matchEventFamilyLabel(e.family, lang))}</b><span>${esc(pick(e.title, lang))}</span><span class="mev-history-decision">${decision}${outcome}</span></li>`;
  }).join("")}</ul>`;
}

// ---------------------------------------------------------------- mounting
// Idempotent containers. The engine integration calls ensureMatchEventMounts()
// once; the controller below renders into whichever container fits the event.

export function ensureMatchEventMounts(doc = globalThis.document) {
  if (!doc || typeof doc.querySelector !== "function") return null;
  const mount = (id, parent, before = null) => {
    let el = doc.getElementById(id);
    if (el) return el;
    el = doc.createElement("div");
    el.id = id;
    if (before) parent.insertBefore(el, before);
    else parent.appendChild(el);
    return el;
  };
  const courtCol = doc.querySelector(".court-column");
  const toast = courtCol ? mount("match-event-toast", courtCol, doc.getElementById("play-feed")) : null;
  const panel = doc.querySelector(".coach-panel");
  const card = panel ? mount("match-event-card", panel) : null;
  const sheet = doc.body ? mount("match-event-sheet", doc.body) : null;
  return { toast, card, sheet };
}

/**
 * Thin controller: show(event) picks the surface, forwards picks to the
 * engine, and clears on dismiss. Sheet on narrow screens (<=700px), card in
 * the coach panel otherwise; info events are always a toast. No DOM in node:
 * without a document it returns a no-op controller so imports never crash.
 */
export function createMatchEventController({ onDecide, onDismiss, getLang = () => "zh" } = {}) {
  const doc = typeof globalThis.document !== "undefined" ? globalThis.document : null;
  if (!doc) return { show: () => false, clear: () => {}, mounts: null };
  const mounts = ensureMatchEventMounts(doc);
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  const narrow = () => typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(max-width: 700px)").matches;

  function wire(box, event) {
    if (!box) return;
    box.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (typeof onDecide === "function") onDecide(btn.dataset.choice, event);
      }),
    );
    box.querySelectorAll('[data-act="mev-dismiss"]').forEach((btn) =>
      btn.addEventListener("click", () => {
        clear();
        if (typeof onDismiss === "function") onDismiss(event);
      }),
    );
  }

  function show(event) {
    if (!validateMatchEvent(event).ok) return false;
    clear();
    const l = lang();
    if (event.severity === "info" && mounts?.toast) {
      mounts.toast.innerHTML = matchEventToastHtml(event, l);
      wire(mounts.toast, event);
      return true;
    }
    if (narrow() && mounts?.sheet) {
      mounts.sheet.innerHTML = matchEventSheetHtml(event, l);
      wire(mounts.sheet, event);
      return true;
    }
    if (mounts?.card) {
      mounts.card.innerHTML = matchEventCardHtml(event, l);
      wire(mounts.card, event);
      return true;
    }
    return false;
  }

  function clear() {
    for (const box of [mounts?.toast, mounts?.card, mounts?.sheet]) {
      if (box) box.innerHTML = "";
    }
  }

  return { show, clear, mounts };
}
