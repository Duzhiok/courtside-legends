// Static dialogs (B70/B71): Player Voice and Radio both mount on a <dialog>
// declared in index.html (shop pattern) — the JS only renders content, never
// builds the element. Pins the migration contract: no createElement("dialog")
// anywhere, the radio open() guards showModal, and Esc / the close button
// close through the dialog's own path and give focus back to the opener.
// Drives the real createPlayerVoice / createRadio against minimal fake DOM
// stubs (same idea as tests/screenShellModal.test.js — no jsdom).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlayerVoice } from "../js/ui/playerVoice.js";
import { createRadio } from "../js/audio/radioPanel.js";

// Minimal fake <dialog>: listeners, queryable content slots, showModal/close
// spies. `withShowModal: false` simulates an environment without <dialog>.
function makeDialogStub({ withShowModal = true } = {}) {
  const listeners = new Map();
  const attrs = {};
  const slots = {
    ".radio-sliders": { innerHTML: "" },
    ".radio-dyn": { innerHTML: "" },
    "#pv-body": { innerHTML: "" },
  };
  const closeBtn = {
    dataset: { radio: "close" },
    setAttribute: (k, v) => { attrs[`close:${k}`] = v; },
    closest: (sel) => (sel === "button" ? closeBtn : null),
  };
  const dlg = {
    id: "",
    open: false,
    listeners,
    attrs,
    slots,
    closeBtn,
    querySelector: (sel) => slots[sel] || (sel === '[data-radio="close"]' ? closeBtn : null),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    setAttribute: (k, v) => { attrs[k] = v; },
    dispatch: (type, event) => { for (const fn of listeners.get(type) || []) fn(event); },
  };
  if (withShowModal) dlg.showModal = () => { dlg.open = true; };
  dlg.close = () => { dlg.open = false; };
  return dlg;
}

function makeOpener() {
  return { focused: false, focus() { this.focused = true; } };
}

// Fake document for the Player Voice controller (it takes `doc` as a param).
// body.appendChild throws: the static dialog must never be built or appended.
function makeDoc(dialog) {
  let created = 0;
  const opener = makeOpener();
  const doc = {
    getElementById: (id) => (dialog && id === dialog.id ? dialog : null),
    createElement: () => { created += 1; return {}; },
    querySelector: () => null,
    activeElement: opener,
    body: { appendChild: () => { throw new Error("static dialog must not be appended"); } },
  };
  return { doc, opener, created: () => created };
}

const cancelEvent = () => {
  let prevented = false;
  return { event: { preventDefault: () => { prevented = true; } }, prevented: () => prevented };
};

test("index.html declares both dialogs statically (shop pattern)", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<dialog id="player-voice" class="pv-dialog" aria-labelledby="pv-title" data-no-i18n>/);
  assert.match(html, /<div class="pv-form" id="pv-body"><\/div>/);
  assert.match(html, /<dialog id="radio-dialog" class="radio-dialog" aria-label="Courtside Radio">/);
  assert.match(html, /<div class="radio-sliders"><\/div>/);
  assert.match(html, /<div class="radio-dyn"><\/div>/);
});

test("Player Voice: open uses the static #player-voice dialog and never creates an element", () => {
  const dlg = makeDialogStub();
  dlg.id = "player-voice";
  const { doc, created } = makeDoc(dlg);
  const voice = createPlayerVoice({ doc, getLang: () => "zh" });
  voice.open();
  assert.equal(created(), 0, "no element is created");
  assert.equal(dlg.open, true, "showModal opened the static dialog");
  assert.match(dlg.slots["#pv-body"].innerHTML, /id="pv-title"/, "content renders into #pv-body");
  assert.equal(voice.isOpen(), true);
});

test("Player Voice: Esc closes through the dialog's own path and restores the opener's focus", () => {
  const dlg = makeDialogStub();
  dlg.id = "player-voice";
  const { doc, opener } = makeDoc(dlg);
  const voice = createPlayerVoice({ doc, getLang: () => "zh" });
  voice.open();
  const ev = cancelEvent();
  dlg.dispatch("cancel", ev.event);
  assert.equal(ev.prevented(), true, "Esc is claimed so the app's global Esc handler skips it");
  assert.equal(dlg.open, false);
  assert.equal(opener.focused, true, "focus returns to the control that opened the dialog");
  assert.equal(voice.isOpen(), false);
});

test("Player Voice: a click on the backdrop closes and restores focus", () => {
  const dlg = makeDialogStub();
  dlg.id = "player-voice";
  const { doc, opener } = makeDoc(dlg);
  const voice = createPlayerVoice({ doc, getLang: () => "zh" });
  voice.open();
  dlg.dispatch("click", { target: dlg });
  assert.equal(dlg.open, false);
  assert.equal(opener.focused, true);
});

test("Player Voice: open is a no-op when the static dialog is absent (stale page)", () => {
  const { doc, created } = makeDoc(null);
  const voice = createPlayerVoice({ doc, getLang: () => "zh" });
  assert.doesNotThrow(() => voice.open());
  assert.equal(created(), 0, "still no element is created as a fallback");
  assert.equal(voice.isOpen(), false);
});

test("Radio: open uses the static #radio-dialog and never creates an element", async () => {
  const dlg = makeDialogStub();
  dlg.id = "radio-dialog";
  const { doc, created } = makeDoc(dlg);
  globalThis.document = doc;
  const radio = createRadio({ setMode: async () => {}, getLang: () => "zh" });
  await radio.open();
  assert.equal(created(), 0, "no element is created");
  assert.equal(dlg.open, true, "showModal opened the static dialog");
  assert.match(dlg.slots[".radio-sliders"].innerHTML, /radio-vol/, "volume sliders are painted");
  assert.match(dlg.slots[".radio-dyn"].innerHTML, /radio-modes/, "mode buttons are painted");
  assert.equal(radio.isOpen(), true);
});

test("Radio: open without showModal falls back to the open attribute instead of throwing", async () => {
  const dlg = makeDialogStub({ withShowModal: false });
  dlg.id = "radio-dialog";
  const { doc } = makeDoc(dlg);
  globalThis.document = doc;
  const radio = createRadio({ setMode: async () => {}, getLang: () => "zh" });
  await assert.doesNotReject(() => radio.open());
  assert.equal(dlg.attrs.open, "", "falls back to the open attribute");
});

test("Radio: Esc claims the key, closes, and restores the opener's focus", async () => {
  const dlg = makeDialogStub();
  dlg.id = "radio-dialog";
  const { doc, opener } = makeDoc(dlg);
  globalThis.document = doc;
  const radio = createRadio({ setMode: async () => {}, getLang: () => "zh" });
  await radio.open();
  const ev = cancelEvent();
  dlg.dispatch("cancel", ev.event);
  assert.equal(ev.prevented(), true, "Esc is claimed so the app's global Esc handler skips it");
  assert.equal(dlg.open, false);
  assert.equal(opener.focused, true, "focus returns to the control that opened the panel");
  assert.equal(radio.isOpen(), false);
});

test("Radio: the close button closes and restores the opener's focus", async () => {
  const dlg = makeDialogStub();
  dlg.id = "radio-dialog";
  const { doc, opener } = makeDoc(dlg);
  globalThis.document = doc;
  const radio = createRadio({ setMode: async () => {}, getLang: () => "zh" });
  await radio.open();
  dlg.dispatch("click", { target: dlg.closeBtn });
  assert.equal(dlg.open, false);
  assert.equal(opener.focused, true);
  assert.equal(radio.isOpen(), false);
});
