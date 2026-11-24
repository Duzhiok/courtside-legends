// B117: the app.js wiring behind the B116 tab bar (b4f155f4) and the starting-five
// card redesign (4d0b9b43) is not covered by the new modules' unit tests —
// bottomNav.test.js pins the pure module, setupCardView.test.js pins the pure
// view, but the boot-time click handler, the drawer guard and the re-render
// order live in app.js. Pin them here (source assertions, same pattern as
// courtTooltipsLang.test.js) so deleting a gate or a guard turns a test red.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

// The tab-bar click handler: from `$("[data-tabbar]")` to the `syncAppTabbar();` after it.
const tabbarHandler = (() => {
  const start = APP.indexOf('$("[data-tabbar]")');
  assert.notEqual(start, -1, "the tab bar click handler exists");
  return APP.slice(start, APP.indexOf("syncAppTabbar();", start));
})();

test("cards tab: opens the collection only behind the account gate", () => {
  assert.match(tabbarHandler, /btn\.dataset\.nav === "cards"/);
  const gate = tabbarHandler.indexOf("requireAccountReady");
  const open = tabbarHandler.indexOf("openCollection()");
  assert.ok(gate !== -1 && open !== -1, "gate + openCollection both wired");
  assert.ok(gate < open, "the gate runs before the collection opens");
  assert.match(tabbarHandler, /activeScreenName\(\) === "collection"/, "already on the collection: no-op");
  assert.match(tabbarHandler, /"我的球员卡", en: "My Player Cards"/, "gate prompt names the feature in both languages");
});

test("category tabs: bring the player back home from the collection / draw", () => {
  assert.match(tabbarHandler, /btn\.dataset\.category && activeScreenName\(\) !== "home"/);
  assert.match(tabbarHandler, /show\("home"\)/);
});

test("drawer clicks never toggle the player on/off the team", () => {
  const guard = 'if (e.target.closest(".setup-card-more")) return;';
  assert.ok(APP.includes(guard), "the drawer guard exists");
  // The guard must run before the toggle mutates the selection — scoped to the
  // toggle handler (an earlier `selected.delete` lives in another function).
  const handlerStart = APP.indexOf('box.querySelectorAll(\'[data-action="toggle"]\')');
  assert.notEqual(handlerStart, -1, "the toggle handler exists");
  const handler = APP.slice(handlerStart, APP.indexOf("refreshAfter();", handlerStart));
  assert.ok(handler.includes(guard), "the guard is inside the toggle handler");
  assert.ok(handler.indexOf(guard) < handler.indexOf("state.setup.selected.delete(id)"));
});

test("drawer open state survives re-renders", () => {
  assert.match(APP, /if \(!state\.setup\.openMore\) state\.setup\.openMore = new Set\(\);/);
  assert.match(APP, /box\.querySelectorAll\("\.setup-card-more"\)\.forEach/);
  assert.match(APP, /const id = d\.dataset\.moreFor;/);
  assert.match(APP, /open: !!state\.setup\.openMore\?\.has\(p\.id\)/);
});

test("focused input is blurred before the roster re-render", () => {
  const blur = "if (box.contains(document.activeElement)) document.activeElement.blur();";
  const paint = "box.innerHTML = setupBoardHtml(model, setupMiniCardHtml, getLang());";
  assert.ok(APP.includes(blur) && APP.includes(paint));
  assert.ok(APP.indexOf(blur) < APP.indexOf(paint), "blur first, or the input's change fires a nested re-render");
});

test("language flip redraws the setup roster in place", () => {
  assert.ok(
    APP.includes('if (state.setup?.you && $("#screen-setup")?.classList.contains("active")) renderSetupRoster();'),
    "the language handler re-renders the setup roster when it is showing",
  );
});
