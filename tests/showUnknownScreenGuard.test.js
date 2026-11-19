// U-P1-1 + U-P2-8 (2026-11-13 global review): the 1996 draft gamble screen
// crashed on every open, and show() had no unknown-name guard.
//
// U-P1-1: js/ui/scoutingView.js called show("draft-gamble") but the screen is
// registered as screens.draftGamble (js/app.js boot); show() cleared every
// screen's .active and then threw on screens["draft-gamble"].classList —
// a blank page only a refresh could fix.
// U-P2-8: show() dereferenced screens[name] with no guard, so any future
// typo would do the same. The guard logs and stays on the current screen.
//
// show() lives in js/app.js and has no unit-test entry point (no test imports
// app.js), so these are source assertions, same as tests/backButtons.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const APP = readFileSync(join(ROOT, "js/app.js"), "utf8");
const SCOUTING = readFileSync(join(ROOT, "js/ui/scoutingView.js"), "utf8");

test("U-P1-1: draft gamble open() shows the registered key, never the DOM id", () => {
  assert.equal(
    (SCOUTING.match(/show\("draft-gamble"\)/g) || []).length,
    0,
    'scoutingView.js must not call show("draft-gamble") — no such registry key',
  );
  assert.equal(
    (SCOUTING.match(/show\("draftGamble"\)/g) || []).length,
    2,
    "both open() branches (empty roster + built gamble) must show(\"draftGamble\")",
  );
  assert.ok(
    APP.includes("screens.draftGamble = draftGambleView.mount();"),
    "screens.draftGamble must be the registered key in app.js boot",
  );
});

test("U-P2-8: show() guards unknown names before touching .active or the stack", () => {
  const start = APP.indexOf("function show(name) {");
  assert.notEqual(start, -1, "show() not found in js/app.js");
  const end = APP.indexOf("\n}\n", start);
  assert.notEqual(end, -1, "show() body end not found");
  const body = APP.slice(start, end);
  assert.ok(body.includes("!screens[name]"), "guard must test screens[name]");
  assert.ok(body.includes("console.error"), "guard must log the unknown name");
  const guardAt = body.indexOf("!screens[name]");
  const returnAt = body.indexOf("return;", guardAt);
  assert.ok(returnAt !== -1, "guard must return early");
  for (const sideEffect of [
    'classList.remove("active")',
    "navPush(",
    "refreshGoldChip()",
    "audio.screen(",
  ]) {
    const at = body.indexOf(sideEffect);
    assert.ok(at !== -1, `show() should still contain ${sideEffect}`);
    assert.ok(
      returnAt < at,
      `guard return must come before ${sideEffect} (unknown name must not clear screens or push the stack)`,
    );
  }
});

function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walkJs(path, out);
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

test("U-P2-8: every literal show(\"…\") call in js/ + index.html names a registered screen", () => {
  // Registry keys: the `const screens = { … }` literal plus boot assignments
  // (`screens.duel = …`, `screens.draftGamble = …`, …).
  const literalStart = APP.indexOf("const screens = {");
  assert.notEqual(literalStart, -1, "screens literal not found in js/app.js");
  const literalEnd = APP.indexOf("\n};", literalStart);
  const literalKeys = new Set(
    [...APP.slice(literalStart, literalEnd).matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(
      (m) => m[1],
    ),
  );
  const assignedKeys = new Set(
    [...APP.matchAll(/screens\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
  );
  const keys = new Set([...literalKeys, ...assignedKeys]);
  assert.ok(keys.size >= 30, `expected 30+ registry keys, got ${keys.size}`);

  const names = new Map(); // name -> first file that uses it
  const files = [...walkJs(join(ROOT, "js")), join(ROOT, "index.html")];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/show\("([A-Za-z-]+)"\)/g)) {
      if (!names.has(m[1])) names.set(m[1], file.replace(ROOT, ""));
    }
  }
  const unknown = [...names].filter(([name]) => !keys.has(name));
  assert.deepEqual(
    unknown,
    [],
    `show() called with unregistered name(s): ${unknown
      .map(([name, file]) => `${name} (${file})`)
      .join(", ")}`,
  );
});
