// B116 bottom tab bar: which screens show it, which button is lit, and the markup keeps the ADR-008 home tabs intact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TABBAR_SCREENS, tabbarActiveId, syncTabbar } from "../js/ui/bottomNav.js";
import { PHRASES } from "../js/i18n-phrases.js";

const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("bar shows on the hub screens only, never in a match / setup / result / season flow", () => {
  assert.deepEqual([...TABBAR_SCREENS].sort(), ["collection", "draw", "home"]);
  for (const s of ["game", "result", "setup", "season", "market", "onboard", "account", "clutchPlay"]) {
    assert.equal(TABBAR_SCREENS.has(s), false, s);
  }
});

test("active button: the home tab on home, cards on the collection and the draw", () => {
  assert.equal(tabbarActiveId("home", "players"), "players");
  assert.equal(tabbarActiveId("home", undefined), null);
  assert.equal(tabbarActiveId("collection", "world"), "cards");
  assert.equal(tabbarActiveId("draw", "world"), "cards");
  assert.equal(tabbarActiveId("setup", "world"), null);
});

test("markup: one bar, five buttons in Stitch order, the four ADR-008 tabs unchanged", () => {
  const bar = INDEX.slice(INDEX.indexOf('class="home-category-tabs" data-tabbar'));
  const row = bar.slice(0, bar.indexOf("</div>"));
  const keys = [...row.matchAll(/data-(?:category|nav)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["world", "players", "cards", "career", "custom"]);
  assert.equal((INDEX.match(/data-tabbar/g) || []).length, 1, "a single bar in the page");
  assert.ok(PHRASES.some(([zh, en]) => zh === "卡牌抽卡" && en === "Cards"), "cards label translated");
});

/** Minimal DOM stand-in: enough for syncTabbar (querySelector, classList, dataset, appendChild). */
function fakeDoc() {
  const mkClass = () => {
    const set = new Set();
    return { toggle: (c, on) => (on ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) };
  };
  const btn = (attrs) => ({ dataset: attrs, classList: mkClass(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const buttons = [btn({ category: "world" }), btn({ category: "players" }), btn({ nav: "cards" }), btn({ category: "career" }), btn({ category: "custom" })];
  const home = { id: "screen-home" };
  const bar = { parentElement: home, querySelectorAll: () => buttons };
  const body = { classList: mkClass(), appendChild(n) { n.parentElement = this; } };
  return { doc: { body, querySelector: (s) => (s === "[data-tabbar]" ? bar : null) }, bar, buttons, body };
}

test("syncTabbar moves the bar under <body> (out of the screens' transform) and lights one button", () => {
  const { doc, bar, buttons, body } = fakeDoc();
  assert.equal(syncTabbar(doc, "home", "career"), true);
  assert.equal(bar.parentElement, body, "fixed bar is never inside an animated screen");
  assert.equal(body.classList.contains("has-tabbar"), true);
  assert.deepEqual(buttons.map((b) => b.attrs["aria-selected"]), ["false", "false", "false", "true", "false"]);

  assert.equal(syncTabbar(doc, "collection", "career"), true);
  assert.deepEqual(buttons.filter((b) => b.classList.contains("active")).map((b) => b.dataset.nav || b.dataset.category), ["cards"]);

  assert.equal(syncTabbar(doc, "game", "career"), false);
  assert.equal(body.classList.contains("has-tabbar"), false);
});
