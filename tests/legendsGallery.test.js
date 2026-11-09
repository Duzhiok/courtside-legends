import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GALLERY_LEGENDS,
  GALLERY_PX_PER_SECOND,
  advanceOffset,
  challengeLegend,
  decorateHome,
  legendToken,
  renderLegendsGallery,
} from "../js/ui/homeShowcase.js";

/**
 * Minimal fake DOM for the marquee: only what renderLegendsGallery touches.
 * Same idea as tests/courtSimple.test.js — small element stubs, no jsdom.
 */
function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === undefined) set.has(c) ? set.delete(c) : set.add(c);
      else if (force) set.add(c);
      else set.delete(c);
    },
    contains: (c) => set.has(c),
  };
}

function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const attr = selector.slice(1, -1);
    if (attr.startsWith("data-")) return node.dataset?.[attr.slice(5)] !== undefined;
    return node[attr] !== undefined;
  }
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

function makeEl(tag = "div") {
  const children = [];
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children,
    parent: null,
    dataset: {},
    style: {},
    classList: makeClassList(),
    hidden: false,
    tabIndex: 0,
    textContent: "",
    scrollWidth: 0,
    clientWidth: 0,
    setAttribute(k, v) {
      el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    append(...nodes) {
      for (const n of nodes) {
        n.parent = el;
        children.push(n);
      }
      return el;
    },
    appendChild(n) {
      n.parent = el;
      children.push(n);
      return n;
    },
    replaceChildren(...nodes) {
      children.length = 0;
      for (const n of nodes) {
        n.parent = el;
        children.push(n);
      }
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (list) {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      }
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (matchesSelector(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    closest(sel) {
      let n = el;
      while (n) {
        if (matchesSelector(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    getBoundingClientRect() {
      return { width: 150, height: 200, left: 0, top: 0 };
    },
    _listeners: listeners,
  };
  let cls = "";
  Object.defineProperty(el, "className", {
    get: () => cls,
    set: (v) => {
      cls = v;
      el.classList = makeClassList();
      for (const c of String(v || "")
        .split(/\s+/)
        .filter(Boolean))
        el.classList.add(c);
    },
  });
  return el;
}

const fakeDoc = () => ({ createElement: (tag) => makeEl(tag), hidden: false });

const fire = (el, type, event = {}) => {
  const list = el._listeners.get(type) || [];
  for (const fn of [...list]) fn({ target: el, ...event });
};

const testEnv = (reduced) => ({
  matchMedia: () => ({ matches: reduced }),
  requestAnimationFrame: null,
  cancelAnimationFrame: null,
  IntersectionObserver: null,
});

const render = (lang = "zh", reduced = false) => {
  const doc = fakeDoc();
  const container = makeEl("div");
  const handle = renderLegendsGallery(container, GALLERY_LEGENDS, {
    doc,
    lang,
    env: testEnv(reduced),
    measureSetWidth: () => 1600,
    measureCardStep: () => 162,
  });
  return { doc, container, handle };
};

test("advanceOffset moves at px/s and wraps seamlessly at one set width", () => {
  assert.equal(advanceOffset(0, 1000, 24, 1600), 24);
  assert.equal(advanceOffset(1590, 1000, 24, 1600), 14);
  assert.equal(advanceOffset(0, 1000, GALLERY_PX_PER_SECOND, 1600), 24);
  assert.ok(GALLERY_PX_PER_SECOND >= 20 && GALLERY_PX_PER_SECOND <= 30, "speed in the 20-30px/s band");
  assert.equal(advanceOffset(100, 0, 24, 1600), 100, "no time, no movement");
  assert.equal(advanceOffset(100, 1000, 24, 0), 100, "no measured width, no movement");
  assert.equal(advanceOffset(100, -50, 24, 1600), 100, "negative dt ignored");
});

test("challengeLegend calls the Duel when loaded, falls back to the profile otherwise", () => {
  const calls = [];
  const duel = { challenge: (token) => calls.push(token) };
  assert.equal(challengeLegend(GALLERY_LEGENDS[12], duel), "challenged");
  assert.deepEqual(calls, ["jordami01:1991"]);
  assert.equal(legendToken(GALLERY_LEGENDS[12]), "jordami01:1991");
  assert.equal(challengeLegend(GALLERY_LEGENDS[12], null), "profile");
  assert.equal(challengeLegend(GALLERY_LEGENDS[12], {}), "profile");
  assert.equal(challengeLegend(GALLERY_LEGENDS[12]), "profile", "no window.CourtsideDuel in Node");
});

test("challengeLegend falls back to the profile when the Duel declines (returns false)", () => {
  const calls = [];
  const notReady = { challenge: (token) => { calls.push(token); return false; } };
  assert.equal(challengeLegend(GALLERY_LEGENDS[12], notReady), "profile");
  assert.deepEqual(calls, ["jordami01:1991"]);
  const ready = { challenge: () => true };
  assert.equal(challengeLegend(GALLERY_LEGENDS[12], ready), "challenged");
});

test("the gallery lives in My World only; the wall and the shared accordion are gone", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /home-legends-wall/);
  assert.doesNotMatch(html, /hint-panel/);
  const worldStart = html.indexOf('<div class="home-category-panel" data-category="world">');
  const playersStart = html.indexOf('<div class="home-category-panel" data-category="players">');
  const mount = html.indexOf('id="mw-legends-gallery"');
  assert.ok(worldStart >= 0 && mount > worldStart && mount < playersStart, "mount is inside the world panel");
  assert.doesNotMatch(html.slice(playersStart), /mw-legends-gallery/, "no gallery in the other panels");
  assert.match(html, /id="btn-how-to-play"/);
  assert.match(html, /id="btn-about"/);
  assert.match(html, /id="howto-dialog"/);
  assert.match(html, /id="about-dialog"/);
  // Attribution + maintenance tools are kept, ids preserved for the existing handlers.
  assert.match(html, /id="btn-open-credits"/);
  assert.match(html, /id="btn-clear-roster-cache"/);
  assert.match(html, /href="online.html"/);
  // The moved rules text is still in the file (now inside the How to Play dialog).
  assert.match(html, /重复卡：/);
});

test("the marquee duplicates the set for a seamless loop and renders bilingual cards", () => {
  const { container, handle } = render("zh");
  assert.ok(handle);
  assert.equal(container.querySelectorAll(".lg-card").length, 80, "40 legends x 2 copies");
  const cards = container.querySelectorAll(".lg-card");
  assert.equal(cards[40].getAttribute("aria-hidden"), "true", "loop copy is hidden from screen readers");
  assert.equal(cards[40].querySelector(".lg-card-open").tabIndex, -1, "loop copy is out of the tab order");
  assert.equal(container.querySelector("h2").textContent, "传奇长廊");
  assert.equal(cards[12].querySelector(".lg-name").textContent, "迈克尔·乔丹");
  assert.equal(cards[12].querySelector(".lg-era").textContent, "1990 年代");

  const { container: enContainer } = render("en");
  const enCards = enContainer.querySelectorAll(".lg-card");
  assert.equal(enContainer.querySelector("h2").textContent, "Legends Gallery");
  assert.equal(enCards[12].querySelector(".lg-name").textContent, "Michael Jordan");
  assert.equal(enCards[12].querySelector(".lg-era").textContent, "1990s");
});

test("the marquee advances on step, pauses on hover, and nudges on prev/next", () => {
  const { container, handle } = render("zh");
  handle.step(1000); // first frame only arms the clock
  handle.step(1100); // dt 100ms at the 24px/s speed -> +2.4px
  assert.ok(Math.abs(handle.offset - 2.4) < 1e-9, `offset after 100ms is 2.4, got ${handle.offset}`);
  const viewport = container.querySelector(".lg-viewport");
  fire(viewport, "mouseenter");
  handle.step(1200);
  assert.ok(Math.abs(handle.offset - 2.4) < 1e-9, "hover pauses the marquee");
  fire(viewport, "mouseleave");
  handle.step(1300);
  assert.ok(Math.abs(handle.offset - 4.8) < 1e-9, "leaving resumes it");
  fire(container.querySelector(".lg-next"), "click");
  assert.ok(Math.abs(handle.offset - (4.8 + 162)) < 1e-9, "next nudges one card");
  fire(container.querySelector(".lg-prev"), "click");
  assert.ok(Math.abs(handle.offset - 4.8) < 1e-9, "prev nudges back");
});

test("dragging moves the track and does not open a profile on release", () => {
  const { container, handle } = render("zh");
  handle.step(1000);
  handle.step(1100);
  assert.ok(Math.abs(handle.offset - 2.4) < 1e-9);
  const viewport = container.querySelector(".lg-viewport");
  fire(viewport, "pointerdown", { clientX: 500, pointerType: "touch", button: 0, pointerId: 1 });
  fire(viewport, "pointermove", { clientX: 400 });
  assert.ok(Math.abs(handle.offset - 102.4) < 1e-9, "drag left 100px moves the track 100px");
  fire(viewport, "pointerup", {});
  const track = container.querySelector(".lg-track");
  const card = container.querySelectorAll(".lg-card")[12];
  fire(track, "click", { target: card.querySelector(".lg-card-open") });
  assert.equal(container.querySelector(".lg-profile-slot").hidden, true, "release click is suppressed after a drag");
});

test("clicking a card opens its profile; the challenge button falls back to the profile pre-Duel", () => {
  const { container } = render("zh");
  const track = container.querySelector(".lg-track");
  const slot = container.querySelector(".lg-profile-slot");
  const jordan = container.querySelectorAll(".lg-card")[12];
  fire(track, "click", { target: jordan.querySelector(".lg-card-open") });
  assert.equal(slot.hidden, false);
  assert.equal(slot.querySelector(".lg-profile-name").textContent, "迈克尔·乔丹");
  assert.match(slot.querySelector(".lg-profile-meta").textContent, /1991 · 公牛 · SG/);
  assert.match(slot.querySelector(".lg-profile-stats").textContent, /31\.5 分/);
  // No Duel loaded in Node: the challenge button opens the same profile.
  fire(track, "click", { target: jordan.querySelector(".lg-challenge") });
  assert.equal(slot.hidden, false);
  assert.equal(slot.querySelector(".lg-profile-name").textContent, "迈克尔·乔丹");
  // Close hides it again.
  fire(slot.querySelector(".lg-profile-close"), "click");
  assert.equal(slot.hidden, true);
});

test("reduced motion renders a static, single-set strip that never auto-scrolls", () => {
  const { container, handle } = render("zh", true);
  assert.equal(container.querySelectorAll(".lg-card").length, 40, "no loop copy under reduced motion");
  assert.ok(container.querySelector(".lg-viewport").className.includes("lg-static"));
  handle.step(1000);
  handle.step(2000);
  assert.equal(handle.offset, 0);
});

test("opening credits from the About dialog closes the dialog first", () => {
  const doc = makeEl("div");
  const screenHome = makeEl("div");
  screenHome.id = "screen-home";
  const aboutBtn = makeEl("button");
  aboutBtn.id = "btn-about";
  const howtoBtn = makeEl("button");
  howtoBtn.id = "btn-how-to-play";
  const about = makeEl("dialog");
  about.id = "about-dialog";
  const howto = makeEl("dialog");
  howto.id = "howto-dialog";
  const creditsBtn = makeEl("button");
  creditsBtn.id = "btn-open-credits";
  let closed = false;
  about.close = () => { closed = true; };
  about.appendChild(creditsBtn);
  doc.appendChild(screenHome);
  doc.appendChild(aboutBtn);
  doc.appendChild(howtoBtn);
  doc.appendChild(about);
  doc.appendChild(howto);
  decorateHome(doc);
  fire(creditsBtn, "click");
  assert.equal(closed, true, "the About dialog closes when the credits button is used");
});
