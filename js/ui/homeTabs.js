/**
 * Home screen's 3-category reorg (T1): "我的球员 / 职业经理 / 自定义" tabs.
 *
 * NBA 2K / FIFA Ultimate Team pattern: a persistent-collection home base (MyTeam), a long-season
 * management mode (MyLeague/Career Mode), and a low-stakes anything-goes bucket (Kick Off/Squad
 * Battles). The category→mode mapping lives here as plain data so it can be verified against
 * index.html's actual data-mode buttons in a test, instead of only trusting the HTML by eye.
 */

export const HOME_CATEGORIES = [
  {
    id: "players",
    label: "我的球员",
    hint: "你的永久班底：抽卡、养成、排位",
    // Collection/draw/skill-shop already live in the account bar above the tabs, not as mode
    // cards -- ranked is the only mode card that plays with your persistent account roster.
    modes: ["ranked"],
  },
  {
    id: "career",
    label: "职业经理",
    hint: "长线经营：选秀、发展、完整赛季与联盟历史",
    modes: ["timeTravel", "franchise", "season"],
  },
  {
    id: "custom",
    label: "自定义",
    hint: "天马行空：挑战之路 + 任意球员任意年份的自由对战",
    modes: ["career", "custom", "tournament", "draft", "sandbox", "quick"],
  },
];

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
