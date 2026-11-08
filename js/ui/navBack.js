/**
 * Back-button standard — single source of truth.
 * Spec: docs/implementation/back-button-layering-design.md
 *
 * Rule: every non-home screen has one top-left back control, and back means
 * "previous screen" by construction. Most screens get that from a minimal nav
 * stack (navPush / navPop, wired into show() in js/app.js); a few screens
 * keep an explicit mechanism because their parent is state-dependent, not
 * navigation-dependent — see EXPLICIT_BACK.
 *
 * This module is pure (no DOM) so tests/backButtons.test.js can pin it.
 */

/** Screens with no back control at all: root / transient boot screen. */
export const NO_BACK = new Set(["loading", "home"]);

/**
 * Screens whose back target is fixed, regardless of where you came from.
 * Screens NOT listed here use the nav stack (their parent depends on entry).
 */
export const STATIC_BACK_TARGETS = {
  collection: "home",
  credits: "home",
  draw: "collection",
  sandbox: "home",
  customHub: "home",
  familyDuel: "customHub",
  market: "home",
  tournament: "home",
  timeTravel: "home",
  clutch: "home",
};

/** Screens whose parent comes from the nav stack (entry-dependent). */
export const STACK_BACK_SCREENS = new Set(["draft", "legend", "season", "clutchPlay"]);

/**
 * Screens whose back is handled by an explicit mechanism, not the stack:
 * - account: accountReturnScreen return-tracking (gating can open it from anywhere)
 * - onboard: 4-step wizard step-back / cancel (state.onboard.step)
 * - setup: parent depends on state (career/duel -> market, sandbox -> sandbox, else home)
 * - result: origin-aware #btn-home (season center / market / home, see resolveResultBack)
 * - game: pause overlay (pause = back; exit = save-first "保存并离开")
 * - clutchResult: back is the challenge entry (its own top-left control + the
 *   "其他挑战" action both go there; a finished challenge is never a back target)
 * - clutch3d: back is the 2D result page (dispose the 3D view first)
 */
export const EXPLICIT_BACK = new Set(["account", "onboard", "setup", "result", "game", "clutchResult", "clutch3d"]);

/**
 * Transient screens: never pushed onto the stack as a back target.
 * result's back is origin-aware (resolveResultBack); a finished game is never
 * a back target. onboard is consumed by cancel/finish — returning to a dead
 * wizard is meaningless (its return screen is kept by onboardReturnScreen).
 */
export const TRANSIENT_SCREENS = new Set(["result", "game", "onboard", "clutchResult", "clutch3d"]);

/**
 * Record a forward navigation `from -> to` in `stack` (mutated in place, also
 * returned). Rules:
 * - home is the root and result is terminal: entering either clears the trail.
 * - same-screen re-show is handled by the caller (show() early-returns).
 * - transient sources are never pushed (no back to a finished game/result).
 * - re-entering a screen already on the trail truncates it there, so
 *   market <-> setup can never ping-pong through a stale entry.
 */
export function navPush(stack, from, to) {
  // Home is the root, result is terminal, and market is the L1 career hub:
  // entering any of them clears the trail. (Market must clear: the career loop
  // is market -> setup -> game -> result -> market, and without the clear,
  // back from market would pop to setup and ping-pong market <-> setup.)
  // clutchResult clears like result: a finished challenge is never a back target.
  if (to === "home" || to === "result" || to === "market" || to === "clutchResult") {
    stack.length = 0;
    return stack;
  }
  if (!from || TRANSIENT_SCREENS.has(from)) return stack;
  const at = stack.lastIndexOf(to);
  if (at !== -1) {
    stack.length = at;
    return stack;
  }
  if (stack[stack.length - 1] !== from) stack.push(from);
  return stack;
}

/** Pop the previous screen, or null when the trail is empty (back -> home). */
export function navPop(stack) {
  return stack.length ? stack.pop() : null;
}

/**
 * Result screen's origin-aware back target.
 * - season games -> the season center (wireSeasonResultContinue's home)
 * - career / duel career games -> the market (the hub between rounds)
 * - everything else (quick, sandbox, duel, tournament, legend) -> home
 * Tournament deliberately maps to home: the bracket is reached forward via
 * the result's primary action ("晋级成功"), back means leaving the run view.
 */
export function resolveResultBack({ isSeason, isCareer } = {}) {
  if (isSeason) return "season";
  if (isCareer) return "market";
  return "home";
}
