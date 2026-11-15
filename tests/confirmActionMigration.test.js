// A-P2-18: the three `window.confirm` bypasses now go through the standard
// in-app confirm dialog (`confirmAction`, js/ui/confirmModal.js). Pins the
// migration contract: no `window.confirm` in the three call sites, each one
// awaits `confirmAction`, the quick-sim prompt is bilingual, and the only
// remaining `window.confirm` is confirmModal's own no-dialog fallback.
// The fallback and the dialog accept/cancel paths are driven against minimal
// fake-DOM stubs (same idea as tests/staticDialogs.test.js — no jsdom).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmAction } from "../js/ui/confirmModal.js";

const SITES = [
  "js/ui/reborn/rebornView.js",
  "js/ui/scoutingView.js",
  "js/app.js",
];

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

test("A-P2-18: no window.confirm in the three migrated call sites", () => {
  for (const rel of SITES) {
    const s = src(rel);
    assert.equal(s.includes("window.confirm"), false, `${rel} must not call window.confirm`);
    assert.equal(s.includes("await confirmAction("), true, `${rel} must await confirmAction`);
  }
});

test("A-P2-18: the only window.confirm left is confirmModal's no-dialog fallback", () => {
  const s = src("js/ui/confirmModal.js");
  const hits = s.match(/window\.confirm/g) || [];
  assert.equal(hits.length, 1, "confirmModal.js keeps exactly one window.confirm (fallback)");
  assert.match(s, /if \(!dialog \|\| !titleEl/);
});

test("A-P2-18: quick-sim prompt is bilingual (was Chinese-only)", () => {
  const s = src("js/app.js");
  assert.match(s, /Quick-sim the rest of the game\?/);
  assert.match(s, /Finish the rest of this game instantly/);
  assert.match(s, /将用当前阵容、战术与指令立刻打完剩余比赛/);
  assert.match(s, /\$\("#btn-quick-sim"\)\.onclick = async \(\) =>/);
});

function withGlobals(doc, win, fn) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = win;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    });
}

test("A-P2-18: confirmAction falls back to window.confirm when the dialog is missing", async () => {
  let asked = null;
  const win = { confirm: (msg) => { asked = msg; return false; }, alert: () => {} };
  const doc = { querySelector: () => null };
  const ok = await withGlobals(doc, win, () => confirmAction("fallback?"));
  assert.equal(ok, false, "fallback returns the native confirm answer");
  assert.equal(asked, "fallback?");
});

test("A-P2-18: confirmAction resolves true on accept / false on cancel through the dialog", async () => {
  const titleEl = { textContent: "" };
  const messageEl = { textContent: "" };
  const accept = { textContent: "", onclick: null, focus() {} };
  const cancel = { textContent: "", hidden: false, onclick: null };
  const dialog = {
    shown: false,
    closed: false,
    listeners: new Map(),
    showModal() { this.shown = true; },
    close() { this.closed = true; },
    addEventListener: (t, fn) => dialog.listeners.set(t, fn),
    removeEventListener: (t) => dialog.listeners.delete(t),
  };
  const doc = {
    querySelector: (sel) =>
      ({
        "#app-confirm-dialog": dialog,
        "#app-confirm-title": titleEl,
        "#app-confirm-message": messageEl,
        "#app-confirm-accept": accept,
        "#app-confirm-cancel": cancel,
      })[sel] || null,
  };
  const win = { confirm: () => { throw new Error("must not reach native confirm"); }, alert: () => {} };

  const accepted = await withGlobals(doc, win, async () => {
    const p = confirmAction("proceed?", { title: "T" });
    assert.equal(dialog.shown, true, "dialog is shown modally");
    assert.equal(messageEl.textContent, "proceed?");
    accept.onclick();
    return p;
  });
  assert.equal(accepted, true);
  assert.equal(dialog.closed, true);

  dialog.shown = false;
  dialog.closed = false;
  const cancelled = await withGlobals(doc, win, async () => {
    const p = confirmAction("proceed?");
    cancel.onclick();
    return p;
  });
  assert.equal(cancelled, false);
});
