/**
 * Home screen's four spaces (ADR-008 N-1; names approved in its Q2), derived from the mode catalog (M1 / ADR-001).
 *
 * NBA 2K / FIFA Ultimate Team pattern: a persistent-collection home base (MyTeam), a long-season
 * management mode (MyLeague/Career Mode), and a low-stakes anything-goes bucket (Kick Off/Squad
 * Battles). Which mode sits in which tab is NOT declared here: js/data/modeCatalog.js is the
 * single source of truth, and each mode's `homeTab` field decides its panel. This file only owns
 * tab chrome (labels, the default tab) and the DOM glue; the visible hint under each tab lives in index.html. Modes without a `homeTab`
 * (legend / duel / familyDuel) are entered from the custom hub, never from a home panel, so
 * categoryForMode() correctly returns null for them — the old hardcoded table used to claim a
 * different set than the catalog (it listed `sandbox` before the catalog knew it).
 */

import { allModes } from "../data/modeCatalog.js";

const TAB_META = [
  // ADR-008 N-1: the player's own space (avatar, collection, honours, home). Holds no modes (no catalog homeTab points here).
  // Not "我的世界": that is Minecraft's Chinese name, which is why Q2 picked 我的篮球人生.
  { id: "world", label: "我的篮球人生" },
  // The ids stay players / career / custom: QA scripts and the lastMode restore path key on them. Only the names changed.
  { id: "players", label: "我的球队" },
  { id: "career", label: "传奇生涯" },
  { id: "custom", label: "自由球场" },
];

export const HOME_CATEGORIES = TAB_META.map((tab) => ({
  ...tab,
  modes: allModes()
    .filter((mode) => mode.homeTab === tab.id)
    .map((mode) => mode.id),
}));

export const DEFAULT_HOME_CATEGORY = "world";

export function categoryForMode(mode) {
  const found = HOME_CATEGORIES.find((cat) => cat.modes.includes(mode));
  return found ? found.id : null;
}

export function allKnownModes() {
  return HOME_CATEGORIES.flatMap((cat) => cat.modes);
}

/**
 * Wire the tab bar: click a tab, show its panel, hide the rest. Pure DOM glue, no state leaks.
 * `onActivate(id)` lets a panel that renders from live data (My World) refresh when it is shown.
 * @returns the activate(id) function, so other screens can jump to a tab, or null with no tab bar.
 */
export function wireHomeTabs(doc = document, { onActivate } = {}) {
  const tabs = [...doc.querySelectorAll(".home-tab[data-category]")];
  const panels = [...doc.querySelectorAll(".home-category-panel[data-category]")];
  if (!tabs.length || !panels.length) return null;
  // Landing vs. compact chrome is pure CSS, keyed off this attribute (the default tab keeps the full hero).
  // The row doubles as the bottom tab bar (js/ui/bottomNav.js), which moves it under <body>; the home screen still owns it.
  const screen = tabs[0].closest(".screen") || doc.getElementById?.("screen-home");
  const activate = (id) => {
    if (screen) screen.dataset.homeTab = id;
    for (const btn of tabs) {
      const on = btn.dataset.category === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const panel of panels) panel.hidden = panel.dataset.category !== id;
    onActivate?.(id);
  };
  for (const btn of tabs) {
    btn.addEventListener("click", () => activate(btn.dataset.category));
  }
  activate(DEFAULT_HOME_CATEGORY);
  return activate;
}
