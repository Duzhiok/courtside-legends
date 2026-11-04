/**
 * Home screen's 3-category reorg (T1), derived from the mode catalog (M1 / ADR-001).
 *
 * NBA 2K / FIFA Ultimate Team pattern: a persistent-collection home base (MyTeam), a long-season
 * management mode (MyLeague/Career Mode), and a low-stakes anything-goes bucket (Kick Off/Squad
 * Battles). Which mode sits in which tab is NOT declared here: js/data/modeCatalog.js is the
 * single source of truth, and each mode's `homeTab` field decides its panel. This file only owns
 * tab chrome (labels, hints, the default tab) and the DOM glue. Modes without a `homeTab`
 * (legend / duel / familyDuel) are entered from the custom hub, never from a home panel, so
 * categoryForMode() correctly returns null for them — the old hardcoded table used to claim a
 * different set than the catalog (it listed `sandbox` before the catalog knew it).
 */

import { allModes } from "../data/modeCatalog.js";

const TAB_META = [
  {
    id: "players",
    label: "我的球员",
    hint: "你的永久班底：抽卡、养成、排位",
  },
  {
    id: "career",
    label: "职业经理",
    hint: "长线经营：选秀、发展、完整赛季与联盟历史",
  },
  {
    id: "custom",
    label: "自定义",
    hint: "天马行空：挑战之路 + 任意球员任意年份的自由对战",
  },
];

export const HOME_CATEGORIES = TAB_META.map((tab) => ({
  ...tab,
  modes: allModes()
    .filter((mode) => mode.homeTab === tab.id)
    .map((mode) => mode.id),
}));

export const DEFAULT_HOME_CATEGORY = "career";

export function categoryForMode(mode) {
  const found = HOME_CATEGORIES.find((cat) => cat.modes.includes(mode));
  return found ? found.id : null;
}

export function allKnownModes() {
  return HOME_CATEGORIES.flatMap((cat) => cat.modes);
}

/** Wire the tab bar: click a tab, show its panel, hide the rest. Pure DOM glue, no state leaks. */
export function wireHomeTabs(doc = document) {
  const tabs = [...doc.querySelectorAll(".home-tab[data-category]")];
  const panels = [...doc.querySelectorAll(".home-category-panel[data-category]")];
  if (!tabs.length || !panels.length) return;
  const activate = (id) => {
    for (const btn of tabs) {
      const on = btn.dataset.category === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const panel of panels) panel.hidden = panel.dataset.category !== id;
  };
  for (const btn of tabs) {
    btn.addEventListener("click", () => activate(btn.dataset.category));
  }
  activate(DEFAULT_HOME_CATEGORY);
}
