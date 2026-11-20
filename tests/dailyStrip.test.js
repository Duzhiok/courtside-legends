// Daily strip: tasks + draw must be findable on the home screen, not only
// in the account menu / at the bottom of the draw screen (the user could not
// find either, 2026-11-19).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHRASES } from "../js/i18n-phrases.js";

const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const APP = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("daily strip: both buttons live on the home screen above the category tabs", () => {
  const home = INDEX.slice(INDEX.indexOf('id="screen-home"'));
  const strip = home.indexOf('id="daily-strip"');
  assert.ok(strip > 0, "daily strip exists on the home screen");
  assert.ok(home.indexOf('id="btn-home-daily-tasks"', strip) > strip, "tasks button in the strip");
  assert.ok(home.indexOf('id="btn-home-daily-draw"', strip) > strip, "draw button in the strip");
  assert.ok(
    strip < home.indexOf('class="home-category-tabs"'),
    "strip sits above the category tabs, on the first screen",
  );
});

test("daily strip: no second primary CTA on home (B16)", () => {
  // B46 follow-up: the draw button shipped with `primary`, so
  // scripts/qa/home-first-screen.mjs failed B16 ("the only visible primary
  // button on the first screen") 6/69. Home keeps exactly one primary CTA
  // (#btn-play-now); the strip stays prominent by position + the gold dot,
  // not by a second primary style.
  const home = INDEX.slice(INDEX.indexOf('id="screen-home"'));
  const strip = home.slice(
    home.indexOf('id="daily-strip"'),
    home.indexOf('class="home-category-tabs"'),
  );
  assert.ok(!strip.includes("primary"), "neither strip button is a primary button");
  assert.ok(
    home.includes('class="btn primary hero-cta" id="btn-play-now"'),
    "Play Now is still the one primary CTA on home",
  );
});

test("daily strip: the new static labels are in PHRASES", () => {
  const dict = new Map(PHRASES);
  assert.equal(dict.get("每日任务"), "Daily Tasks");
  assert.equal(dict.get("每日抽卡"), "Daily Draw");
  assert.ok(
    dict.has("你的永久班底：抽卡、养成、排位。收藏在上方账号条里，每日任务和抽卡在首页就有。"),
    "players-tab hint points at the home strip, not the account bar",
  );
});

test("daily strip: both buttons open the draw screen; tasks scrolls to the task list", () => {
  assert.ok(
    APP.includes('$("#btn-home-daily-draw")?.addEventListener("click", () => openDailyDraw());'),
    "draw button opens the draw screen",
  );
  assert.ok(APP.includes('$("#btn-home-daily-tasks")?.addEventListener("click", () => {'));
  assert.ok(APP.includes('$("#draw-tasks")?.scrollIntoView({ block: "start" })'));
  assert.ok(APP.includes("refreshDailyStrip(acc)"), "strip state syncs with the account bar");
  assert.ok(APP.includes("refreshDailyStrip(null)"), "guest state syncs too");
});
