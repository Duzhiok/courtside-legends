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
 * Lifecycle (all driven by the screen's own `.active` class, so back button, Esc and any other `show()` behave the
 * same): on activation remember the opener, reset (or aim) the scroll and focus the heading; on deactivation give
 * focus back to the opener. `destroy()` removes the element, listeners and observer.
 *
 * Navigation itself stays with the app: `onBack` is whatever the app's back action is (goBack). Esc is handled
 * globally by the app and arrives at the same place.
 */
const T = (lang, zh, en) => (lang === "en" ? en : zh);

export const SHELL_HOSTS = Object.freeze(["app", "overlay"]);

const hostElement = (host, doc) => (host === "overlay" ? doc.body : doc.querySelector("#app") || doc.body);

/** The head markup: back button first, then ONE heading in the current language. Pure, so it is unit-testable. */
export function screenHeadHtml({ id, title, lang }) {
  const back = T(lang, "返回", "Back");
  return `<div class="panel-head"><button class="nav-back" id="btn-${id}-back" type="button" aria-label="${back}"><span>${back}</span></button><h2 id="${id}-title" tabindex="-1">${T(lang, title.zh, title.en)}</h2></div>`;
}

/** A selector that finds "the same control" again after a re-render: its id, else tag + data-* attributes. */
export function openerSignature(node) {
  if (!node?.tagName) return null;
  if (node.id) return `#${CSS.escape(node.id)}`;
  const data = Object.entries(node.dataset || {}).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v)}"]`);
  return data.length ? `${node.tagName.toLowerCase()}${data.join("")}` : null;
}

export function mountScreen({ id, title, host = "app", getLang = () => "zh", onBack, onRelocalize, doc = globalThis.document } = {}) {
  if (!id || !title) throw new Error("mountScreen needs an id and a { zh, en } title");
  if (!SHELL_HOSTS.includes(host)) throw new Error(`mountScreen: unknown host "${host}" (use ${SHELL_HOSTS.join(" | ")})`);
  const elId = `screen-${id}`;
  const existing = doc.getElementById(elId);
  if (existing?.__shell) return existing.__shell; // one instance per screen: never a duplicate element

  const el = doc.createElement("main");
  el.id = elId;
  el.className = "screen screen-shell";
  el.dataset.shellHost = host;
  el.setAttribute("data-no-i18n", ""); // the shell and its screen localise themselves (relocalize), not the static walker
  el.setAttribute("aria-labelledby", `${id}-title`);
  el.innerHTML = `${screenHeadHtml({ id, title, lang: getLang() })}<div class="screen-shell-body" id="${id}-body"></div>`;
  hostElement(host, doc).appendChild(el);

  const body = el.querySelector(`#${id}-body`);
  const heading = el.querySelector(`#${id}-title`);
  const controller = new AbortController();
  let opener = null;
  let openerSig = null;
  let scrollTarget = null;
  let wasActive = el.classList.contains("active");

  el.querySelector(`#btn-${id}-back`).addEventListener("click", () => onBack?.(), { signal: controller.signal });

  const activate = () => {
    const current = doc.activeElement;
    opener = current && current !== doc.body && !el.contains(current) ? current : null;
    openerSig = openerSignature(opener);
    const target = scrollTarget ? body.querySelector(scrollTarget) : null;
    scrollTarget = null;
    if (target) target.scrollIntoView?.({ block: "start" });
    else (host === "overlay" ? el : doc.defaultView)?.scrollTo?.(0, 0);
    heading.focus({ preventScroll: true });
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
    /** Re-render the shell's own text for the current language, then let the screen re-render its body. */
    relocalize() {
      const lang = getLang();
      heading.textContent = T(lang, title.zh, title.en);
      const back = el.querySelector(`#btn-${id}-back`);
      back.setAttribute("aria-label", T(lang, "返回", "Back"));
      back.querySelector("span").textContent = T(lang, "返回", "Back");
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
