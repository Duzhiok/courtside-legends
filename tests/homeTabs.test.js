/**
 * Regression for T1 (home page 3-category reorg: 我的球员 / 职业经理 / 自定义).
 *
 * The category -> mode mapping lives in js/ui/homeTabs.js as plain data specifically so it can be
 * checked against index.html's actual markup, instead of only trusting two files stay in sync by
 * eye. Mirrors the regex-over-raw-HTML technique already used by tests/homeShowcase.test.js (no
 * DOM/jsdom dependency in this project).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HOME_CATEGORIES,
  DEFAULT_HOME_CATEGORY,
  categoryForMode,
  allKnownModes,
} from "../js/ui/homeTabs.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function allModeCardModes(source) {
  return [...source.matchAll(/class="mode-card[^"]*"\s+data-mode="([^"]+)"/g)].map((m) => m[1]);
}

/** Crude slice from one <div class="home-category-panel" data-category="X"> to the next one. */
function categoryPanelHtml(categoryId) {
  const marker = `<div class="home-category-panel" data-category="${categoryId}">`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `index.html is missing the ${categoryId} panel`);
  const rest = html.slice(start + marker.length);
  const nextPanel = rest.indexOf('<div class="home-category-panel"');
  const end = nextPanel >= 0 ? nextPanel : rest.indexOf("</main>");
  return rest.slice(0, end >= 0 ? end : undefined);
}

test("there are exactly 3 categories and a valid default", () => {
  assert.equal(HOME_CATEGORIES.length, 3);
  assert.deepEqual(
    HOME_CATEGORIES.map((c) => c.id),
    ["players", "career", "custom"],
  );
  assert.ok(HOME_CATEGORIES.some((c) => c.id === DEFAULT_HOME_CATEGORY));
});

test("every mode-card button in index.html belongs to EXACTLY one category (no orphans, no duplicates)", () => {
  const modesInHtml = allModeCardModes(html);
  assert.ok(modesInHtml.length >= 10, "sanity: the home page should still have a double-digit number of mode cards");
  for (const mode of modesInHtml) {
    const category = categoryForMode(mode);
    assert.ok(category, `data-mode="${mode}" in index.html is not assigned to any home category`);
  }
  const known = allKnownModes();
  const duplicates = known.filter((m, i) => known.indexOf(m) !== i);
  assert.deepEqual(duplicates, [], "a mode must not be claimed by two categories at once");
});

test("every mode HOME_CATEGORIES claims for a category actually renders inside that category's panel", () => {
  for (const category of HOME_CATEGORIES) {
    const panelHtml = categoryPanelHtml(category.id);
    const modesInPanel = allModeCardModes(panelHtml);
    for (const mode of category.modes) {
      assert.ok(
        modesInPanel.includes(mode),
        `js/ui/homeTabs.js says "${mode}" is in the "${category.id}" tab, but index.html's ${category.id} panel doesn't contain that button`,
      );
    }
  }
});

test("categoryForMode: known modes resolve, unknown modes don't", () => {
  assert.equal(categoryForMode("ranked"), "players");
  assert.equal(categoryForMode("timeTravel"), "career");
  assert.equal(categoryForMode("sandbox"), "custom");
  assert.equal(categoryForMode("not-a-real-mode"), null);
  assert.equal(categoryForMode(undefined), null);
});

test("index.html has a tab button for each category, wired to the right data-category", () => {
  for (const category of HOME_CATEGORIES) {
    assert.match(
      html,
      new RegExp(`class="home-tab"\\s+data-category="${category.id}"`),
      `missing a .home-tab button for "${category.id}"`,
    );
  }
});
