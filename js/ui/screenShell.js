/**
 * Screen Shell: the one lifecycle + layout contract for the game's secondary screens (museum, inbox, network, ...).
 *
 * Why: nine screens each re-implemented "build <main class=screen>, a panel-head with a back button and a title, wire
 * the back click once, append it somewhere". They drifted (bilingual-in-one-string titles, a duplicated <h2> in the
 * body, no focus handling, no cleanup). This module owns exactly that and nothing else; each screen keeps its OWN
 * business state and renders into `shell.body`.
 *
 * Hosts (explicit, never "wherever"):
 *   "app"     (default) inside #app, the padded page column every static screen lives in.
 *   "overlay" on <body>, position:fixed full-viewport and independently scrolling (css/screenShell.css), for
 *             screens that must cover the page or need their own scroll container / stacking.
 *
 * Variants:
 *   "screen" (default) the full frame: panel-head with a back button and ONE heading, Esc goes back via the
 *             app's global handler, like every migrated screen.
 *   "modal"  a Promise-style question (takeover dialog): no panel-head and no back button — the dialog
 *             carries its own heading — opened/closed with shell.open()/shell.close(), Esc dismisses it
 *             (onDismiss) instead of navigating back. The shell owns the overlay element, the focus restore
 *             and the Esc claim; the dialog keeps its own keys (1/2/3) and backdrop-click behaviour.
 *
 * Lifecycle (all driven by the screen's own `.active` class, so back button, Esc and any other `show()` behave the
 * same): on activation remember the opener, reset (or aim) the scroll and focus the heading; on deactivation give
 * focus back to the opener. `destroy()` removes the element, listeners and observer.
 *
 * Navigation itself stays with the app: `onBack` is whatever the app's back action is (goBack). Esc is handled
 * globally by the app and arrives at the same place.
 */

import { TL } from "../i18n.js";

const SHELL_HOSTS = Object.freeze(["app", "overlay"]);

const hostElement = (host, doc) => (host === "overlay" ? doc.body : doc.querySelector("#app") || doc.body);

/** The head markup: back button first, then ONE heading in the current language. Pure, so it is unit-testable. */
export function screenHeadHtml({ id, title, lang }) {
  const back = TL(lang, "返回", "Back");
  return `<div class="panel-head"><button class="nav-back" id="btn-${id}-back" type="button" aria-label="${back}"><span>${back}</span></button><h2 id="${id}-title" tabindex="-1">${TL(lang, title.zh, title.en)}</h2></div>`;
}

/** A selector that finds "the same control" again after a re-render: its id, else tag + data-* attributes. */
function openerSignature(node) {
  if (!node?.tagName) return null;
  if (node.id) return `#${CSS.escape(node.id)}`;
  const data = Object.entries(node.dataset || {}).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v)}"]`);
  return data.length ? `${node.tagName.toLowerCase()}${data.join("")}` : null;
}

const SHELL_VARIANTS = Object.freeze(["screen", "modal"]);

/**
 * Scroll a screen to the top: overlay-hosted screens scroll their own
 * element, app-hosted screens scroll the window. Shared by the Shell's
 * activate() and by the app's show() for static screens (A-P2-11).
 */
export function scrollScreenToTop(el, doc = globalThis.document) {
  if (!el) return;
  if (el.dataset?.shellHost === "overlay") el.scrollTo?.(0, 0);
  else doc?.defaultView?.scrollTo?.(0, 0);
}

/**
 * Focus a screen's first heading (the Shell's h2 title, or a static
 * screen's h1/h2 — tabindex="-1" in markup so the focus lands).
 * Returns false when the screen has no heading (e.g. the loading and
 * game screens) — the caller then simply skips focusing. Shared by the
 * Shell's activate() and by the app's show() (A-P2-11).
 */
export function focusScreenHeading(el) {
  const heading = el?.querySelector?.("h2") || el?.querySelector?.("h1");
  if (!heading?.focus) return false;
  heading.focus({ preventScroll: true });
  return true;
}

/** Focusable controls, in tab order: the modal variant focuses the first of these on open. */
const FOCUSABLE_SELECTOR = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function mountScreen({ id, title, host = "app", variant = "screen", getLang = () => "zh", onBack, onDismiss, onRelocalize, doc = globalThis.document } = {}) {
  if (!id || (!title && variant !== "modal")) throw new Error("mountScreen needs an id and a { zh, en } title");
  if (!SHELL_HOSTS.includes(host)) throw new Error(`mountScreen: unknown host "${host}" (use ${SHELL_HOSTS.join(" | ")})`);
  if (!SHELL_VARIANTS.includes(variant)) throw new Error(`mountScreen: unknown variant "${variant}" (use ${SHELL_VARIANTS.join(" | ")})`);
  const elId = `screen-${id}`;
  const existing = doc.getElementById(elId);
  if (existing?.__shell) return existing.__shell; // one instance per screen: never a duplicate element

  const el = doc.createElement("main");
  el.id = elId;
  el.className = "screen screen-shell";
  el.dataset.shellHost = host;
  if (variant === "modal") el.classList.add("screen-shell-modal");
  el.setAttribute("data-no-i18n", ""); // the shell and its screen localise themselves (relocalize), not the static walker
  if (variant === "screen") el.setAttribute("aria-labelledby", `${id}-title`);
  // Modal: no panel-head/back button — the dialog carries its own heading. Screen: the shared head.
  el.innerHTML = variant === "modal"
    ? `<div class="screen-shell-body" id="${id}-body" tabindex="-1"></div>`
    : `${screenHeadHtml({ id, title, lang: getLang() })}<div class="screen-shell-body" id="${id}-body"></div>`;
  hostElement(host, doc).appendChild(el);

  const body = el.querySelector(`#${id}-body`);
  const heading = variant === "screen" ? el.querySelector(`#${id}-title`) : null;
  const controller = new AbortController();
  let opener = null;
  let openerSig = null;
  let scrollTarget = null;
  let wasActive = el.classList.contains("active");

  if (variant === "screen") {
    el.querySelector(`#btn-${id}-back`).addEventListener("click", () => onBack?.(), { signal: controller.signal });
  }
  if (variant === "modal") {
    // Esc dismisses the modal (and claims the key: the app's global handler skips defaultPrevented keys,
    // so Esc never reaches goBack while a modal is open). stopPropagation keeps a bubble-phase listener
    // on window from seeing it either. Removed with the shell (controller signal).
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !el.classList.contains("active")) return;
      event.preventDefault();
      event.stopPropagation?.();
      onDismiss?.();
    }, { signal: controller.signal, capture: true });
  }

  const activate = () => {
    const current = doc.activeElement;
    opener = current && current !== doc.body && !el.contains(current) ? current : null;
    openerSig = openerSignature(opener);
    const target = scrollTarget ? body.querySelector(scrollTarget) : null;
    scrollTarget = null;
    if (target) target.scrollIntoView?.({ block: "start" });
    else scrollScreenToTop(el, doc);
    if (variant === "modal") {
      // The dialog carries its own heading: focus its first control (the takeover's first option),
      // falling back to the body itself so keyboard users land inside the modal.
      const first = body.querySelector(FOCUSABLE_SELECTOR);
      if (first?.focus) first.focus({ preventScroll: true });
      else body.focus?.({ preventScroll: true });
    } else {
      focusScreenHeading(el);
    }
  };
  const deactivate = () => {
    const sig = openerSig;
    const node = opener;
    opener = null;
    openerSig = null;
    const refocus = () => {
      const target = node?.isConnected ? node : sig ? doc.querySelector(sig) : null;
      if (target && doc.activeElement !== target) target.focus({ preventScroll: true });
      return !!target && doc.activeElement === target;
    };
    // The page may re-render the opener as it comes back (e.g. My World repaints): try now, then once more next frame.
    if (!refocus()) doc.defaultView?.requestAnimationFrame?.(refocus);
  };
  const observer = new MutationObserver(() => {
    const isActive = el.classList.contains("active");
    if (isActive === wasActive) return;
    wasActive = isActive;
    if (isActive) activate();
    else deactivate();
  });
  observer.observe(el, { attributes: true, attributeFilter: ["class"] });

  const shell = {
    el,
    body,
    /** Show the shell (modal: starts the Promise-style question; the MutationObserver drives activate()). */
    open() {
      el.classList.add("active");
      return shell;
    },
    /** Hide the shell (the MutationObserver drives deactivate(), which restores the opener's focus). */
    close() {
      el.classList.remove("active");
      return shell;
    },
    /** Re-render the shell's own text for the current language, then let the screen re-render its body. */
    relocalize() {
      const lang = getLang();
      if (variant === "screen") {
        heading.textContent = TL(lang, title.zh, title.en);
        const back = el.querySelector(`#btn-${id}-back`);
        back.setAttribute("aria-label", TL(lang, "返回", "Back"));
        back.querySelector("span").textContent = TL(lang, "返回", "Back");
      }
      onRelocalize?.(lang);
    },
    /** Scroll to a body element (instead of the top) the next time the screen activates. */
    aimScrollAt(selector) {
      scrollTarget = selector || null;
    },
    destroy() {
      observer.disconnect();
      controller.abort();
      el.remove();
      delete el.__shell;
    },
  };
  el.__shell = shell;
  el.__shellRelocalize = () => shell.relocalize();
  return shell;
}

/** Re-localise every shell-owned screen in the registry (called from the app's language toggle). */
export function relocalizeShellScreens(screens) {
  for (const el of Object.values(screens || {})) el?.__shellRelocalize?.();
}
