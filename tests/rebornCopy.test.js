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

// The unified Career entry (ADR-006) replaced the old two-card presentation:
// the GM + Coach identity card still routes to the Time Travel mode, but the
// card no longer carries the catalog's one-line description — it explains
// role, control, progression and challenge, and the other identities carry
// honest status labels instead of being sold as playable.
test("the GM + Coach card names the playable Classic flow; unfinished identities are labelled, not sold", () => {
  const panel = careerPanelHtml();
  const gmCoach = panel.match(
    /<button[^>]*data-career-identity="gm_coach"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(gmCoach, "the GM + Coach identity card must exist");
  assert.match(gmCoach, /data-mode="timeTravel"/, "GM + Coach still routes to the Time Travel mode");
  assert.match(gmCoach, /经典玩法可玩/);
  assert.match(gmCoach, /经理兼教练/);
  assert.equal((panel.match(/开发中/g) || []).length, 2, "Player + Coach are in development");
  assert.match(panel, /待独立身份实现/, "GM awaits its independent identity");
  assert.ok(!panel.includes("穿越生涯"), "the old Time Travel card title is gone");
  assert.ok(!panel.includes("联盟经理"), "the old League Manager card title is gone");
});

test("the catalog description still names the playable Classic role and does not sell unfinished careers as playable", () => {
  const desc = modeById("timeTravel").description;
  assert.match(desc, /经典 · 经理兼教练/);
  assert.match(desc, /开发中/);
  assert.doesNotMatch(desc, /五年/, "five years is the initial contract, not the career length");
});
