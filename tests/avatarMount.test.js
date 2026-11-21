// Which avatar renderer a screen mounts: URL override > saved device choice > default 2D. One module, so My World and the duel preview agree.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const m = await import("../js/ui/avatarMount.js");
const r2d = await import("../js/ui/avatar2d/avatar2dRenderer.js");
const r3d = await import("../js/ui/avatar3d.js");

test("with nothing saved and no URL flag the figure is 2D", () => {
  assert.equal(m.chosenRenderer("", createMemoryStorage()), "2d");
  assert.equal(m.chosenRenderer(undefined, createMemoryStorage()), "2d");
  assert.equal(m.chooseAvatarMount("", createMemoryStorage()), r2d.mountAvatar2d);
});

test("?avatar=3d forces 3D, and ?avatar=2d forces 2D, whatever was saved", () => {
  const saved3d = createMemoryStorage(); m.writeRendererPref("3d", saved3d);
  const saved2d = createMemoryStorage(); m.writeRendererPref("2d", saved2d);
  assert.equal(m.chosenRenderer("?avatar=2d", saved3d), "2d");
  assert.equal(m.chosenRenderer("?avatar=3d", saved2d), "3d");
  assert.equal(m.chooseAvatarMount("?avatar=3d", createMemoryStorage()), r3d.mountAvatar3d);
  assert.equal(m.chosenRenderer("?avatar=2d-proto", saved3d), "2d-proto", "placeholder QA still wins");
});

test("the toggle's saved choice sticks per device and is read back; the default returns when nothing is saved", () => {
  const s = createMemoryStorage();
  assert.equal(m.readRendererPref(s), null);
  assert.equal(m.writeRendererPref("3d", s), true);
  assert.equal(m.readRendererPref(s), "3d");
  assert.equal(m.chosenRenderer("", s), "3d");
  assert.equal(m.chooseAvatarMount("", s), r3d.mountAvatar3d);
  assert.equal(m.writeRendererPref("2d", s), true);
  assert.equal(m.chosenRenderer("", s), "2d");
  assert.equal(s.getItem(m.RENDERER_PREF_KEY), "2d");
});

test("junk is ignored: a bad saved value or bad flag falls back to 2D, and only 2d/3d can be saved", () => {
  const s = createMemoryStorage();
  s.setItem(m.RENDERER_PREF_KEY, "bobblehead");
  assert.equal(m.readRendererPref(s), null);
  assert.equal(m.chosenRenderer("?avatar=bogus", s), "2d");
  assert.equal(m.writeRendererPref("2d-proto", s), false, "the QA renderer is never a player preference");
  assert.equal(m.writeRendererPref("", s), false);
  assert.equal(s.getItem(m.RENDERER_PREF_KEY), "bobblehead", "a refused write leaves the old value alone");
});

test("storage that throws or does not exist never breaks the screen (private mode)", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(m.readRendererPref(broken), null);
  assert.equal(m.writeRendererPref("3d", broken), false);
  assert.equal(m.chosenRenderer("", broken), "2d");
});

test("the URL override is detected, so the My World toggle can hide when it has nothing to decide", () => {
  assert.equal(m.hasRendererOverride("?avatar=3d"), true);
  assert.equal(m.hasRendererOverride("?x=1&avatar=2d"), true);
  assert.equal(m.hasRendererOverride("?avatarLight=studio"), false);
  assert.equal(m.hasRendererOverride(""), false);
  assert.equal(m.hasRendererOverride(undefined), false);
});

test("canReuseViewer: only a 2D canvas built from exactly what the panel would build now, and untouched since", async () => {
  const { canReuseViewer } = await import("../js/ui/avatarMount.js");
  const fig = { renderer: "2d", canvas: {} };
  assert.equal(canReuseViewer(fig, "k", "k"), true);
  assert.equal(canReuseViewer(fig, "k", "other"), false, "look / jersey / renderer choice changed");
  assert.equal(canReuseViewer(fig, null, "k"), false, "touched since (a slider preview or an edit) -- an unsaved preview must not survive a re-render");
  assert.equal(canReuseViewer(null, "k", "k"), false, "nothing mounted");
  assert.equal(canReuseViewer({ renderer: "3d", canvas: {} }, "k", "k"), false, "a WebGL figure is always rebuilt");
  assert.equal(canReuseViewer({ renderer: "2d" }, "k", "k"), false, "no canvas to carry over");
});
