/**
 * Runs `prewarm` (building the AudioContext, see audioManager.prewarm) in a QUIET moment after boot, so the player's first tap does not
 * pay the 0.5-1 s audio-device start-up. The build itself is one synchronous 0.5 s block that cannot be split, so WHEN it runs matters:
 * not while the page is still starting, and not while the player is tapping around. It waits until `minAgeMs` after it was asked for (the app has finished starting; the other deferred start-up work runs first) and no
 * input has happened for `quietMs`, looking again every `pollMs`. If the player never goes quiet for `giveUpMs` it does not run at all:
 * a player who is busy has already tapped, and that tap builds the context (the old behaviour), so nothing is lost.
 * Pure: the clock, the timer and the input record are injected, so it is unit tested without a browser.
 */
const INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];
let lastInputAt = 0;
let listening = false;
function listenForInput() {
  if (listening || typeof globalThis.addEventListener !== "function") return;
  listening = true;
  const mark = () => { lastInputAt = globalThis.performance?.now?.() ?? Date.now(); };
  for (const type of INPUT_EVENTS) globalThis.addEventListener(type, mark, { capture: true, passive: true });
}

export function prewarmWhenIdle(prewarm, {
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  wait = (fn, ms) => setTimeout(fn, ms),
  lastInput = () => lastInputAt,
  done = () => false,
  minAgeMs = 2500,
  quietMs = 1500,
  pollMs = 700,
  giveUpMs = 30000,
} = {}) {
  listenForInput();
  const started = now();
  const check = () => {
    if (done()) return;
    const t = now();
    if (t - started > giveUpMs) return;
    const quiet = t - started >= minAgeMs && t - lastInput() >= quietMs; // counted from the request (= boot finished), not from page load: a slow phone's boot is long
    if (!quiet) { wait(check, pollMs); return; }
    prewarm();
  };
  wait(check, pollMs);
}
