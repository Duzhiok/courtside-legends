import test from "node:test";
import assert from "node:assert/strict";
import { createCoachDrawer, drawerState } from "../js/ui/coachDrawer.js";

function fakeEl() {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  return {
    textContent: "",
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => { attrs[k] = v; },
    attrs,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    click: () => listeners.click?.(),
  };
}

test("drawerState: closed live, open when the player opens it, always open in a dead-ball window", () => {
  assert.deepEqual(drawerState({}), { open: false, forced: false });
  assert.deepEqual(drawerState({ userOpen: true }), { open: true, forced: false });
  assert.deepEqual(drawerState({ paused: true }), { open: true, forced: true });
  assert.deepEqual(drawerState({ paused: true, userOpen: true }), { open: true, forced: true });
});

test("starts collapsed with an honest toggle button", () => {
  const panel = fakeEl();
  const button = fakeEl();
  createCoachDrawer({ panel, button });
  assert.equal(panel.classList.contains("coach-open"), false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.textContent, "教练席 ▾");
});

test("the button opens and closes the drawer during live play", () => {
  const panel = fakeEl();
  const button = fakeEl();
  const d = createCoachDrawer({ panel, button });
  button.click();
  assert.equal(d.isOpen(), true);
  assert.equal(panel.classList.contains("coach-open"), true);
  assert.equal(button.attrs["aria-expanded"], "true");
  button.click();
  assert.equal(d.isOpen(), false);
  assert.equal(panel.classList.contains("coach-open"), false);
});

test("a dead-ball window forces it open and the toggle cannot close it; resuming restores the player's own choice", () => {
  const panel = fakeEl();
  const button = fakeEl();
  const d = createCoachDrawer({ panel, button });
  d.setPaused(true);
  assert.equal(panel.classList.contains("coach-open"), true);
  assert.equal(panel.classList.contains("coach-paused"), true);
  button.click(); // ignored while paused
  assert.equal(d.isOpen(), true);
  d.setPaused(false);
  assert.equal(d.isOpen(), false, "the player never opened it by hand, so it collapses on resume");
  assert.equal(panel.classList.contains("coach-paused"), false);

  button.click();
  d.setPaused(true);
  d.setPaused(false);
  assert.equal(d.isOpen(), true, "a drawer the player opened by hand stays open after the window");
});

test("English labels, and it tolerates a missing panel or button", () => {
  const button = fakeEl();
  createCoachDrawer({ panel: fakeEl(), button, getLang: () => "en" });
  assert.equal(button.textContent, "Coach ▾");
  const d = createCoachDrawer({ panel: null, button: null });
  d.setPaused(true);
  assert.equal(d.isOpen(), true);
});
