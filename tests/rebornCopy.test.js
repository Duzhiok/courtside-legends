import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { modeById } from "../js/data/modeCatalog.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Crude slice of the career panel (same technique as homeTabs.test.js). */
function careerPanelHtml() {
  const marker = '<div class="home-category-panel" data-category="career">';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, "index.html is missing the career panel");
  const rest = html.slice(start + marker.length);
  const nextPanel = rest.indexOf('<div class="home-category-panel"');
  return rest.slice(0, nextPanel >= 0 ? nextPanel : undefined);
}

// The unified Career entry (3+1, user decision 2026-11-09) replaced the
// old two-card presentation and the four-card entry: the Architect card
// is a locked prestige card that routes to the Time Travel mode only
// once unlocked, the Player card routes to the Reborn flow, and the
// Coach card is honestly in development — no identity is sold as
// playable when it is not.
test("the Architect card is a locked prestige card; Player routes to Reborn; Coach is honestly in development", () => {
  const panel = careerPanelHtml();
  const architect = panel.match(
    /<button[^>]*data-career-identity="gm_coach"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(architect, "the Architect card must exist");
  assert.match(architect, /data-mode="timeTravel"/, "the Architect routes to the Time Travel mode");
  assert.match(architect, /THE ARCHITECT/);
  assert.match(architect, /隐藏职业 · 经理兼教练/);
  assert.match(architect, /data-architect-lock="closed"/, "the lock icon is present");
  assert.match(architect, /data-architect-pill="coach"/, "Coach progress pill is present");
  assert.match(architect, /data-architect-pill="gm"/, "GM progress pill is present");
  const player = panel.match(
    /<button[^>]*data-career-identity="player"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(player, "the Player card must exist");
  assert.match(player, /assets\/career\/player\.jpg/, "the Player card shows the mock portrait");
  assert.ok(!player.includes("开发中"), "the Player card no longer carries a dev pill");
  assert.ok(!panel.includes("穿越生涯"), "the old Time Travel card title is gone");
  assert.ok(!panel.includes("联盟经理"), "the old League Manager card title is gone");
  assert.ok(!panel.includes("经典玩法可玩"), "the old playable pill is gone");
  assert.ok(!panel.includes("待独立身份实现"), "the old awaiting pill is gone");
});

test("the catalog description still names the playable Classic role and does not sell unfinished careers as playable", () => {
  const desc = modeById("timeTravel").description;
  assert.match(desc, /经典 · 经理兼教练/);
  assert.match(desc, /球员生涯/, "Player Career is playable now");
  assert.match(desc, /开发中/, "Coach and GM are still in development");
  assert.doesNotMatch(desc, /五年/, "five years is the initial contract, not the career length");
});
