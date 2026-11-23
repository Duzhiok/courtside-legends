// Role + minutes transplanted onto the setup cards (user 2026-11-22):
// each card carries its own role select and minutes input at the bottom,
// so the card and its rotation settings are read together and nothing has
// to be matched by name in a separate "角色与分钟" list.
import test from "node:test";
import assert from "node:assert/strict";
import { setupCardRoleHtml } from "../js/ui/setupCardRoles.js";

// A 90-OVR scorer with good stamina: inferred role alpha, cap 42.
const star = {
  id: "p1",
  name: "Star",
  stamina: 90,
  raw: { ppg: 26 },
  skills: [],
  targetMinutes: 36,
};

test("card role block: role select shows the inferred role, minutes input shows the target", () => {
  const html = setupCardRoleHtml(star, "zh");
  assert.match(html, /<option value="alpha" selected>/, "a 26ppg scorer infers 进攻核心");
  assert.match(html, /type="number"[^>]*value="36"/, "minutes input shows the target");
  assert.match(html, /体能90 · 可稳打约 42 分钟/, "stamina hint shows the cap");
  assert.doesNotMatch(html, /over-min/, "36 minutes is inside the 42 cap");
});

test("card role block: a manual role wins over inference; over-cap minutes warn", () => {
  const html = setupCardRoleHtml({ ...star, roleExpectation: "sixth", targetMinutes: 44 }, "zh");
  assert.match(html, /<option value="sixth" selected>/, "manual 第六人 is kept");
  assert.match(html, /over-min/, "44 minutes over the 42 cap warns");
  assert.match(html, /长期 44 分钟易崩/, "the hint says the minutes will wear him down");
});

test("card role block: no target defaults to 24 minutes; role and minutes carry the player id", () => {
  const html = setupCardRoleHtml({ id: "p2", stamina: 60, raw: { ppg: 4 } }, "zh");
  assert.match(html, /data-role-for="p2"/, "role select is keyed to the player");
  assert.match(html, /data-min-for="p2"/, "minutes input is keyed to the player");
  assert.match(html, /type="number"[^>]*value="24"/, "minutes default to 24");
});

test("card role block speaks English when lang is en", () => {
  const html = setupCardRoleHtml(star, "en");
  assert.match(html, />Role </);
  assert.match(html, />Min </);
  assert.match(html, /title="Role on the floor"/);
  assert.match(html, /title="Target minutes \(stamina suggests 42\)"/);
  assert.match(html, /Stamina 90 · can carry about 42 min/);
  assert.doesNotMatch(html, /角色|分钟|体能/);
});
