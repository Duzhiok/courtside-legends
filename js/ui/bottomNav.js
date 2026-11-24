/**
 * Bottom tab bar (B116, after the Stitch board's 5-tab nav: 我的篮球 / 球队阵容 / 卡牌抽卡 / 赛事对决 / 更衣室).
 *
 * The bar IS the home screen's tab row (.home-category-tabs[data-tabbar]): its four .home-tab buttons keep their ids,
 * names and order (ADR-008 Q2, pinned by tests/homeTabs.test.js and ~70 QA scripts), and one more button opens the
 * card collection. Stitch's fifth slot (更衣室: skill lab, combo codex) has no feature behind it yet (B115), so 传奇生涯
 * keeps that slot; the UI only links to things that exist.
 *
 * The bar is position:fixed and lives directly under <body>: inside a screen it would be positioned against the
 * screen during the screen's fade-in (that animation uses transform, which makes the screen the containing block for
 * fixed children). It shows on the hub screens (home, collection, draw) and nowhere else: the match, setup, season and
 * result flows never see it. Pure DOM glue, no app state: app.js calls syncTabbar() from show().
 */

/** Screens that show the bar. Everything else (setup, game, result, season, ...) hides it. */
export const TABBAR_SCREENS = new Set(["home", "collection", "draw"]);

/** Which bar button is lit: the home tab on home, the cards button on the collection and the draw. */
export function tabbarActiveId(screen, homeTab) {
  if (screen === "home") return homeTab || null;
  if (screen === "collection" || screen === "draw") return "cards";
  return null;
}

const keyOf = (btn) => btn.dataset.category || btn.dataset.nav || "";

/**
 * Show/hide the bar for `screen` (body.has-tabbar drives the CSS) and light the right button.
 * @returns true when the bar is visible.
 */
export function syncTabbar(doc, screen, homeTab) {
  const bar = doc.querySelector("[data-tabbar]");
  if (!bar) return false;
  const body = doc.body;
  if (body && bar.parentElement !== body) body.appendChild(bar);
  const on = TABBAR_SCREENS.has(screen);
  body?.classList.toggle("has-tabbar", on);
  if (!on) return false;
  const active = tabbarActiveId(screen, homeTab);
  for (const btn of bar.querySelectorAll("button")) {
    const lit = keyOf(btn) === active;
    btn.classList.toggle("active", lit);
    btn.setAttribute("aria-selected", lit ? "true" : "false");
  }
  return true;
}
