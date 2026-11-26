/**
 * PA3 interaction level L1: the ask bubble. A small floating line + one chip per option, NOT a Shell screen: the Shell's overlay
 * covers the whole viewport and traps focus, which is exactly what an ordinary teammate remark must not do.
 *
 * - Never steals focus. Keys 1-8 answer it (ignored while typing or with a modifier held).
 * - An unanswered bubble resolves null after `bubbleWindow()`: he plays the possession on his own read, nothing is graded.
 * - WCAG 2.2.1 (timing adjustable): hovering or focusing the bubble pauses the countdown; leaving restarts it.
 * - A click in its first 250ms is ignored (it may have appeared under a pointer that was clicking something else); keys are not.
 * - Two unanswered in a row make the next window short (see participation.js): a player who is not engaging is not made to wait.
 */
import { agencyBubbleHtml } from "./agencyView.js";
import { BUBBLE_CLICK_GUARD_MS, bubbleWindow, nextIgnored } from "../../reborn/participation.js";

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** @returns {Promise<string|null>} the chosen option id, or null when nobody answered. `pace` is shared across a game's bubbles. */
export function showAskBubble({ context, lang = "zh", pace = { ignored: 0 }, doc = globalThis.document, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  if (!doc?.body) return Promise.resolve(null);
  return new Promise((resolve) => {
    const host = doc.createElement("div");
    host.className = "reborn-bubble-host";
    host.innerHTML = agencyBubbleHtml({ lang, context });
    const ms = bubbleWindow(pace.ignored);
    host.style.setProperty("--bubble-ms", `${ms}ms`);
    let timer = null;
    let settled = false;
    const shownAt = now();
    const done = (choice) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      doc.removeEventListener("keydown", onKey, true);
      host.remove();
      pace.ignored = nextIgnored(pace.ignored, choice != null);
      resolve(choice);
    };
    const start = () => {
      clearTimer(timer);
      host.classList.remove("paused", "running");
      void host.offsetWidth; // restart the CSS countdown
      host.classList.add("running");
      timer = setTimer(() => done(null), ms);
    };
    const hold = () => {
      clearTimer(timer);
      host.classList.remove("running");
      host.classList.add("paused");
    };
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || TYPING.has(event.target?.tagName)) return;
      const id = context.options[["1", "2", "3", "4", "5", "6", "7", "8"].indexOf(event.key)];
      if (id) done(id);
    };
    host.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-option]");
      if (button && now() - shownAt >= BUBBLE_CLICK_GUARD_MS) done(button.dataset.option);
    });
    host.addEventListener("pointerenter", hold);
    host.addEventListener("focusin", hold);
    host.addEventListener("pointerleave", () => { if (!host.contains(doc.activeElement)) start(); });
    host.addEventListener("focusout", (event) => { if (!host.contains(event.relatedTarget)) start(); });
    doc.addEventListener("keydown", onKey, true);
    doc.body.appendChild(host);
    start();
  });
}
