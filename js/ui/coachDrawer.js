/**
 * Broadcast-layout coach drawer (css/matchBroadcast.css).
 *
 * While the ball is live only a slim action bar shows under the court; the full coach panel (tactics, subs, defence, rotation...)
 * opens by itself in any dead-ball window (timeout, quarter break, injury...) and can be opened by hand during live play.
 * This module only decides open/closed and keeps the toggle button honest; every control inside the panel keeps its id and its
 * real GameSim wiring in app.js, nothing here changes a rule.
 */

/** Pure: the drawer is open in any dead-ball window, or when the player opened it. */
export function drawerState({ userOpen = false, paused = false } = {}) {
  const open = !!paused || !!userOpen;
  return { open, forced: !!paused };
}

const LABEL = {
  zh: { open: "教练席 ▴", closed: "教练席 ▾" },
  en: { open: "Coach ▴", closed: "Coach ▾" },
};

/**
 * @param {{ panel: Element|null, button: Element|null, getLang?: () => string }} deps
 * @returns {{ setPaused(paused: boolean): void, toggle(): void, isOpen(): boolean }}
 */
export function createCoachDrawer({ panel, button, getLang = () => "zh" }) {
  let userOpen = false;
  let paused = false;

  function render() {
    const { open, forced } = drawerState({ userOpen, paused });
    panel?.classList.toggle("coach-open", open);
    panel?.classList.toggle("coach-paused", forced);
    if (button) {
      button.setAttribute("aria-expanded", String(open));
      const text = LABEL[getLang() === "en" ? "en" : "zh"];
      button.textContent = open ? text.open : text.closed;
    }
  }

  function toggle() {
    if (paused) return; // a dead-ball window keeps the full panel open
    userOpen = !userOpen;
    render();
  }

  button?.addEventListener("click", toggle);
  render();

  return {
    setPaused(next) {
      paused = !!next;
      render();
    },
    toggle,
    isOpen: () => drawerState({ userOpen, paused }).open,
  };
}
