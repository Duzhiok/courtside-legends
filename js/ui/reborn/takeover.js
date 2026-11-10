/**
 * Player Reborn PR4 — the takeover moment (ADR-005 §3, prep doc).
 *
 * When the season driver reaches the 4th quarter / OT, last 2:00, margin
 * ≤ 5, you on court with the ball, it asks the player: drive, pull up, or
 * pass. The choice goes through the M2b decision interface — a
 * ClutchController issues the attempt id and validates the pick (shooter on
 * court, hint in {"three", "attack"}), and the driver submits it via
 * submitDecision; the outcome is read back from sim.clutchLog (the same
 * object the coach event's meta.clutchOutcome carries). This module never
 * rolls dice and never shows a win probability — there is no calibrated one
 * to show, and the choice is yours to feel, not to optimize.
 */
import { createClutchController } from "../../engine/clutchController.js";

/** The three takeover options. `pass` declines the moment (no decision). */
export const TAKEOVER_OPTIONS = Object.freeze([
  {
    id: "drive",
    actionHint: "attack",
    zh: "突破上篮",
    en: "Drive to the rim",
    descZh: "自己持球杀向篮下",
    descEn: "Take it to the rim yourself",
  },
  {
    id: "pullup",
    actionHint: "three",
    zh: "急停跳投",
    en: "Pull-up jumper",
    descZh: "在外线急停出手",
    descEn: "Pull up for the jumper",
  },
  {
    id: "pass",
    actionHint: null,
    zh: "传给队友",
    en: "Pass to a teammate",
    descZh: "把球交给队友，让进攻流动",
    descEn: "Let the offense flow through a teammate",
  },
]);

export function takeoverOption(id) {
  const option = TAKEOVER_OPTIONS.find((o) => o.id === id);
  if (!option) throw new TypeError(`takeover option is invalid: ${id}`);
  return option;
}

/**
 * Map a chosen option to the decision the driver submits. `pass` (and any
 * falsy choice) declines the moment — returns null, no decision is armed.
 */
export function takeoverDecisionFor(optionId) {
  if (!optionId) return null;
  const option = takeoverOption(optionId);
  if (!option.actionHint) return null;
  return { actionHint: option.actionHint };
}

/**
 * Ask the player what to do with the ball. The ClutchController issues the
 * attempt id and validates the pick; the caller (the season driver) submits
 * the returned decision — the attempt id travels with it so the sim honors
 * exactly this pick. Returns null when the moment is declined or the pick
 * cannot be validated.
 */
export async function askTakeover({ sim, playerId, onAsk }) {
  const controller = createClutchController({ sim });
  const opened = controller.openDecision();
  if (!opened.ok) return null;
  const choice = await onAsk({ sim, playerId, options: TAKEOVER_OPTIONS });
  const decision = takeoverDecisionFor(choice);
  if (!decision) return null;
  const selected = controller.select(playerId, decision.actionHint);
  if (!selected.ok) return null;
  return { ...controller.selection, attemptId: controller.attemptId };
}

/** The season driver's onTakeover hook. `onAsk` is the view's dialog. */
export function createTakeoverHook({ onAsk } = {}) {
  const ask = onAsk || showTakeoverDialog;
  return ({ sim, playerId }) => askTakeover({ sim, playerId, onAsk: ask });
}

/** Pure HTML for the takeover dialog (no percentages, no win probability). */
export function takeoverDialogHtml({ sim, playerId, lang = "zh" } = {}) {
  const zh = lang !== "en";
  const player = sim?.you?.()?.onCourt?.find((p) => p.id === playerId)
    || sim?.you?.()?.roster?.find((p) => p.id === playerId);
  const name = player?.name || "";
  const youSide = sim?.youSide || "home";
  const oppSide = youSide === "home" ? "away" : "home";
  const score = sim?.score || { home: 0, away: 0 };
  const clock = Number(sim?.clock) || 0;
  const mmss = `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}`;
  const quarter = Number(sim?.quarter) || 4;
  const qLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;
  const buttons = TAKEOVER_OPTIONS.map((o, i) => {
    const label = zh ? o.zh : o.en;
    const desc = zh ? o.descZh : o.descEn;
    return `<button type="button" class="reborn-takeover-option" data-option="${o.id}" data-key="${i + 1}">`
      + `<span class="reborn-takeover-key">${i + 1}</span> `
      + `<span class="reborn-takeover-label">${label}</span> `
      + `<span class="reborn-takeover-desc">${desc}</span></button>`;
  }).join("");
  return `<div class="reborn-takeover-dialog" role="dialog" aria-modal="true" aria-label="${zh ? "关键回合" : "Takeover moment"}">`
    + `<h2>${zh ? "关键时刻，球在你手里" : "Takeover moment — the ball is yours"}</h2>`
    + `<p class="reborn-takeover-situation">${qLabel} ${mmss} · ${score[youSide]} – ${score[oppSide]}${name ? ` · ${name}` : ""}</p>`
    + `<div class="reborn-takeover-options">${buttons}</div>`
    + `<p class="reborn-takeover-hint">${zh ? "按 1 / 2 / 3 选择" : "Press 1 / 2 / 3 to choose"}</p>`
    + `</div>`;
}

/**
 * Default dialog: mounts the takeover overlay and resolves with the chosen
 * option id (or null on dismiss). Keys 1/2/3 choose. Requires a DOM.
 */
export function showTakeoverDialog({ sim, playerId, lang = "zh" } = {}) {
  if (typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "reborn-takeover-overlay";
    overlay.innerHTML = takeoverDialogHtml({ sim, playerId, lang });
    const done = (choice) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(choice);
    };
    const onKey = (event) => {
      const index = ["1", "2", "3"].indexOf(event.key);
      if (index >= 0) done(TAKEOVER_OPTIONS[index].id);
      else if (event.key === "Escape") done(null);
    };
    overlay.addEventListener("click", (event) => {
      const button = event.target.closest("[data-option]");
      if (button) done(button.dataset.option);
      else if (event.target === overlay) done(null);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector("[data-option]")?.focus?.();
  });
}

/** Render a settled takeover outcome for the card (what happened, no odds). */
export function describeTakeoverOutcome(outcome, lang = "zh") {
  if (!outcome) return null;
  const zh = lang !== "en";
  if (outcome.attempted) {
    const zone = outcome.zone === "three" ? (zh ? "三分" : "three") : (zh ? "两分" : "two");
    const verb = outcome.made ? (zh ? "打进" : "made") : (zh ? "没进" : "missed");
    return zh
      ? `关键回合：${zone}${verb}（${outcome.points || 0} 分）`
      : `Takeover: ${verb} the ${zone} (${outcome.points || 0} pts)`;
  }
  const reasons = {
    turnover: zh ? "关键回合：失误了" : "Takeover: turnover",
    foul: zh ? "关键回合：被犯规，进攻中断" : "Takeover: fouled, possession stopped",
    doubled: zh ? "关键回合：被包夹，球没到手" : "Takeover: doubled, never got the ball",
    kicked_out: zh ? "关键回合：球被传了出去" : "Takeover: kicked out",
    not_handed_off: zh ? "关键回合：球没交到手里" : "Takeover: never got the ball",
    not_on_court: zh ? "关键回合：你不在场上" : "Takeover: you were not on court",
    no_possession: zh ? "关键回合：没有进攻机会" : "Takeover: no possession",
  };
  return reasons[outcome.reason] || (zh ? "关键回合：没有出手" : "Takeover: no shot");
}
