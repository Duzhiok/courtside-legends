/**
 * A one-way gate that opens when the app has finished booting (the roster is loaded and the home screen is usable).
 *
 * Why it exists: on a slow phone the first load is bandwidth-bound, and things that are not needed to get the app usable (the 2D avatar
 * layers, ~700 KB) were being fetched in the middle of the roster download the boot is waiting for. Deferring them until the gate opens
 * made that roster arrive sooner (BACKLOG B77, scripts/measure/mobile-first-load.mjs). Pure and DOM-free so it can be unit tested.
 */

export function createGate() {
  let release;
  let opened = false;
  const ready = new Promise((resolve) => { release = resolve; });
  return {
    ready,
    get isOpen() { return opened; },
    /** Idempotent: opening twice is fine, the gate never closes again. */
    open() { opened = true; release(); },
  };
}

/** Wrap an async function so every call waits for the gate; calls made before it opens all run, in order, once it does. */
export function deferUntil(gate, fn) {
  return (...args) => gate.ready.then(() => fn(...args));
}
