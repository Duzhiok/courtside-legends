import { effectChipsHtml, esc, tr } from "./format.js";

const KEYS = "ABCDEF";

/** Cards for an event / knowledge decision. `attr` is the data attribute that carries the choice id. */
export function choiceDeckHtml(choices, { attr, lang = "zh" }) {
  return choices.map((choice, index) => `<button type="button" class="tt-choice" role="radio" aria-checked="false" ${attr}="${esc(choice.id)}">
    <span class="tt-choice-key" aria-hidden="true">${KEYS[index] || index + 1}</span>
    <span class="tt-choice-body">
      <strong>${esc(choice.label)}</strong>
      <span class="tt-choice-desc">${esc(choice.description)}</span>
      ${effectChipsHtml(choice.effects, lang)}
    </span>
  </button>`).join("");
}

/** The "are you sure" bar. Hidden until something is selected. */
export function confirmBarHtml(lang = "zh", { confirmLabel } = {}) {
  return `<div class="tt-confirm" hidden>
    <p class="tt-confirm-text" aria-live="polite"></p>
    <div class="tt-confirm-actions">
      <button type="button" class="tt-btn tt-btn-ghost" data-act="cancel">${esc(tr(lang, "重新选择", "Pick again"))}</button>
      <button type="button" class="tt-btn tt-btn-primary" data-act="confirm">${esc(confirmLabel || tr(lang, "确认这个决定", "Lock it in"))}</button>
    </div>
  </div>`;
}

/**
 * Two-step commit for decisions that can't be undone: a tap only SELECTS a card (and the bar says
 * exactly what you are about to lock in); the confirm button commits. Stops a stray tap -- very
 * easy on a phone -- from rewriting a career. Assigns onclick (not addEventListener) so re-wiring
 * after a re-render replaces the old handler instead of stacking a second one.
 *
 * @param {Element} scope  holds exactly one `.tt-deck` and one `.tt-confirm`
 */
export function mountDeck(scope, { itemSelector = ".tt-choice", idOf, labelOf, confirmText, onConfirm }) {
  const deck = scope.querySelector(".tt-deck");
  const bar = scope.querySelector(".tt-confirm");
  if (!deck || !bar) return;
  let selected = null;
  const paint = () => {
    deck.querySelectorAll(itemSelector).forEach((item) => {
      const on = item === selected;
      item.classList.toggle("is-selected", on);
      item.setAttribute("aria-checked", String(on));
    });
    bar.hidden = !selected;
    if (selected) bar.querySelector(".tt-confirm-text").textContent = confirmText(labelOf(selected));
  };
  deck.onclick = (event) => {
    const item = event.target.closest(itemSelector);
    if (!item || !deck.contains(item) || item.disabled || deck.dataset.busy) return;
    selected = item;
    paint();
    bar.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  bar.onclick = async (event) => {
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "cancel") {
      selected = null;
      paint();
      return;
    }
    if (act !== "confirm" || !selected || deck.dataset.busy) return;
    deck.dataset.busy = "1";
    bar.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await onConfirm(idOf(selected), selected);
    } finally {
      delete deck.dataset.busy;
      bar.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  };
}
