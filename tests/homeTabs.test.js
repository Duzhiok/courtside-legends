/**
 * M1 (ADR-001): home tabs derive from the mode catalog — no second table.
 *
 * The category -> mode mapping used to live here as hardcoded data, which is
 * exactly how it drifted from the catalog (it listed `sandbox` before the
 * catalog knew it). Now js/ui/homeTabs.js derives membership from each
 * mode's `homeTab` field, so these tests check derivation against
 * index.html's actual markup instead of re-asserting a hardcoded list.
 * Mirrors the regex-over-raw-HTML technique already used by
 * tests/homeShowcase.test.js (no DOM/jsdom dependency in this project).
 *
 * Hub entries (legend / duel / familyDuel) deliberately carry NO
 * data-mode: their buttons already have id-based handlers, and the
 * generic `.mode-card[data-mode]` click wiring in app.js would
 * double-dispatch (and misroute familyDuel through startMode's draft
 * fallback). Their DOM presence is asserted via button id instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLang, setLang, translateStatic } from "../js/i18n.js";
import {
  HOME_CATEGORIES,
  DEFAULT_HOME_CATEGORY,
  categoryForMode,
  allKnownModes,
} from "../js/ui/homeTabs.js";
import { allModes, modeById, validateCatalog } from "../js/data/modeCatalog.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

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

/** Custom-hub entry points for modes that have no home-panel card. */
const HUB_ENTRIES = {
  legend: ['id="btn-custom-legend"'],
  duel: ['id="btn-custom-duel"'],
  familyDuel: ['id="btn-custom-father-son"', 'id="btn-custom-brothers"'],
};

test("tabs in index.html are exactly the derived categories, and the default is valid", () => {
  const tabIds = [...html.matchAll(/class="home-tab"\s+data-category="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...HOME_CATEGORIES.map((c) => c.id)].sort(),
    [...tabIds].sort(),
    "homeTabs categories must match the tab buttons actually rendered",
  );
  assert.ok(HOME_CATEGORIES.some((c) => c.id === DEFAULT_HOME_CATEGORY));
});

test("every panel card's mode is in the catalog, and panel membership equals the catalog's homeTab", () => {
  assert.equal(validateCatalog(), true);
  for (const category of HOME_CATEGORIES) {
    const modesInPanel = allModeCardModes(categoryPanelHtml(category.id));
    assert.deepEqual(
      [...modesInPanel].sort(),
      [...category.modes].sort(),
      `panel "${category.id}" must render exactly the modes the catalog assigns to it`,
    );
    for (const mode of modesInPanel) {
      assert.equal(
        modeById(mode)?.homeTab,
        category.id,
        `data-mode="${mode}" sits in the "${category.id}" panel but the catalog assigns it elsewhere`,
      );
    }
  }
  const known = allKnownModes();
  const duplicates = known.filter((m, i) => known.indexOf(m) !== i);
  assert.deepEqual(duplicates, [], "a mode must not be claimed by two categories at once");
});

test("every catalog mode has a DOM entry: a home-panel card or a custom-hub button", () => {
  for (const mode of allModes()) {
    if (mode.homeTab) {
      assert.ok(
        allModeCardModes(categoryPanelHtml(mode.homeTab)).includes(mode.id),
        `catalog mode "${mode.id}" claims homeTab "${mode.homeTab}" but has no card in that panel`,
      );
    } else {
      const buttons = HUB_ENTRIES[mode.id];
      assert.ok(buttons, `catalog mode "${mode.id}" has neither a homeTab nor a known hub entry`);
      assert.ok(
        buttons.some((id) => html.includes(id)),
        `catalog mode "${mode.id}" has no custom-hub button in index.html`,
      );
    }
  }
});

test("in-panel group labels match each card's catalog exploreGroup, in DOM order", () => {
  for (const category of HOME_CATEGORIES) {
    const panelHtml = categoryPanelHtml(category.id);
    let currentLabel = null;
    const tokens = panelHtml.matchAll(
      /class="mode-group-label">([^<]+)<\/div>|data-mode="([^"]+)"/g,
    );
    for (const token of tokens) {
      if (token[1] !== undefined) {
        currentLabel = token[1];
      } else {
        const mode = token[2];
        assert.ok(currentLabel, `card "${mode}" in panel "${category.id}" appears before any group label`);
        assert.equal(
          modeById(mode)?.exploreGroup,
          currentLabel,
          `card "${mode}" sits under "${currentLabel}" but the catalog assigns it to "${modeById(mode)?.exploreGroup}"`,
        );
      }
    }
  }
});

test("categoryForMode: panel modes resolve, hub modes and unknown modes don't", () => {
  assert.equal(categoryForMode("ranked"), "players");
  assert.equal(categoryForMode("timeTravel"), "career");
  assert.equal(categoryForMode("sandbox"), "custom");
  assert.equal(categoryForMode("legend"), null);
  assert.equal(categoryForMode("duel"), null);
  assert.equal(categoryForMode("familyDuel"), null);
  assert.equal(categoryForMode("not-a-real-mode"), null);
  assert.equal(categoryForMode(undefined), null);
});

test("M1: exactly one dominant Play Now CTA, wired to a one-click handler that skips setup", () => {
  const heroes = [...html.matchAll(/class="[^"]*hero-cta[^"]*"\s+id="btn-play-now"/g)];
  assert.equal(heroes.length, 1, "the home page must have exactly one hero CTA");
  assert.ok(html.includes('id="btn-play-now"'), "hero button must exist");
  // The hero is NOT a .mode-card[data-mode]: the generic wiring would route
  // it through startMode("quick") into the setup screen, defeating one-click.
  const heroTag = html.match(/<button[^>]*id="btn-play-now"[^>]*>/)?.[0] || "";
  assert.ok(heroTag && !heroTag.includes("mode-card"), "hero must not be a mode-card");
  assert.ok(!heroTag.includes("data-mode"), "hero must not carry data-mode");
  const wiring = appSource.indexOf('$("#btn-play-now")');
  assert.ok(wiring >= 0, "app.js must wire #btn-play-now");
  const fnStart = appSource.indexOf("function startPlayNow()");
  assert.ok(fnStart >= 0, "app.js must define startPlayNow");
  const fnBody = appSource.slice(fnStart, wiring);
  assert.match(fnBody, /autoFillTeam\(/, "startPlayNow must auto-fill both teams");
  assert.match(fnBody, /beginGame\(/, "startPlayNow must go straight into the game");
  assert.ok(!/openSetup\(/.test(fnBody), "startPlayNow must not show the setup screen");
});

test("M1: the old demo name is gone", () => {
  assert.ok(!html.includes("快速演示"), "the old 快速演示 name must not remain");
});

// B15: the hero (one tap, no setup) and the `quick` card (opens the pre-game setup screen) behave
// differently, so two controls must never read the same -- in Chinese OR in English. The i18n phrase
// map is a global exact match, so one shared Chinese title silently becomes one shared English title.
test("B15: the hero CTA and the quick card have different names in both languages", () => {
  const heroText = html.match(/id="btn-play-now"[^>]*>([^<]+)</)?.[1]?.trim();
  const cardTitle = html.match(/data-mode="quick"[^>]*>\s*<strong>([^<]+)<\/strong>/)?.[1]?.trim();
  assert.equal(heroText, "快速开打");
  assert.equal(cardTitle, "自动配队");
  assert.notEqual(heroText, cardTitle);
  const cardDesc = html.match(/data-mode="quick"[^>]*>\s*<strong>[^<]+<\/strong>\s*<span>([^<]+)</)?.[1]?.trim();
  // and the card's description says what it does: it goes to the setup screen, it does not start a game
  assert.match(cardDesc, /赛前设置/);
  // translateStatic is a no-op unless the language is English; restore it so other tests are unaffected
  const before = getLang();
  setLang("en");
  try {
    const en = (zh) => translateStatic(zh);
    assert.equal(en(heroText), "Play Now");
    assert.equal(en(cardTitle), "Auto Match");
    assert.notEqual(en(heroText), en(cardTitle), "English labels must differ too");
    assert.doesNotMatch(en(cardDesc), /[\u4e00-\u9fff]/, "the card description must be fully translated");
  } finally {
    setLang(before);
  }
});
