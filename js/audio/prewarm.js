/**
 * Runs `prewarm` (building the AudioContext, see audioManager.prewarm) in an idle moment after boot, so the player's first tap does not
 * pay the 0.5-1 s audio-device start-up. If the player is in the middle of an input it steps aside and tries again a little later; after
 * `tries` deferrals it goes ahead anyway (a one-off cost now still beats the same cost inside a tap). Pure: the scheduler and the
 * input check are injected, so it is unit tested without a browser.
 */
export function prewarmWhenIdle(prewarm, {
  idle = globalThis.requestIdleCallback ? (fn) => globalThis.requestIdleCallback(fn, { timeout: 4000 }) : (fn) => setTimeout(fn, 300),
  inputPending = () => globalThis.navigator?.scheduling?.isInputPending?.() === true,
  tries = 5,
} = {}) {
  let left = tries;
  const run = () => {
    if (inputPending() && left-- > 0) { idle(run); return; }
    prewarm();
  };
  idle(run);
}
